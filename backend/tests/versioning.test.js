// Integration tests for the `__v` optimistic-concurrency layer. They need a
// MongoDB instance; point TEST_MONGODB_URI at a disposable database (the tests
// create and drop their own collections there).
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");

const TraineeProfile = require("../models/TraineeProfile");
const Assessment = require("../models/Assessment");
const Payment = require("../models/Payment");
const Program = require("../models/Program");
const Cow = require("../models/Cow");
const Batch = require("../models/Batch");

const {
  currentVersionOf,
  readExpectedVersion,
  versionFilter,
  sendVersionConflict
} = require("../lib/versioning");
const { migrateVersionCounters } = require("../lib/versionMigration");

const TEST_URI =
  process.env.TEST_MONGODB_URI ||
  "mongodb://127.0.0.1:27017/edtsp_version_test";

const MODELS = [
  TraineeProfile,
  Assessment,
  Payment,
  Program,
  Cow,
  Batch
];

function newRecordData(Model, suffix) {
  const objectId = new mongoose.Types.ObjectId();

  if (Model === TraineeProfile) {
    return { user: objectId };
  }

  if (Model === Assessment) {
    return {
      user: objectId,
      assessmentTitle: `Assessment ${suffix}`,
      subject: "Test",
      totalScore: 100
    };
  }

  if (Model === Payment) {
    return {
      user: objectId,
      program: new mongoose.Types.ObjectId(),
      receiptNumber: `PAY-TEST-${suffix}`,
      amount: 10,
      paymentDate: new Date(),
      method: "Cash"
    };
  }

  if (Model === Program) {
    return {
      name: `Program ${suffix}`,
      description: "Test program",
      fee: 100
    };
  }

  if (Model === Cow) {
    return {
      cowId: `COW-${suffix}`,
      name: "Test cow",
      breed: "Test breed",
      ageYears: 3
    };
  }

  return {
    program: new mongoose.Types.ObjectId(),
    label: `Batch ${suffix}`,
    slotCapacity: 10
  };
}

let sequence = 0;

async function insertRecord(Model) {
  sequence += 1;

  return Model.create(newRecordData(Model, `${Date.now()}-${sequence}`));
}

before(async () => {
  await mongoose.connect(TEST_URI);
  await Promise.all(MODELS.map(Model => Model.collection.deleteMany({})));
});

after(async () => {
  await Promise.all(MODELS.map(Model => Model.collection.deleteMany({})));
  await mongoose.disconnect();
});

test("new Mongoose records start at __v 0", async () => {
  for (const Model of MODELS) {
    const record = await insertRecord(Model);

    assert.equal(record.__v, 0, `${Model.modelName} should start at __v 0`);
    assert.equal(
      record.toJSON().version,
      0,
      `${Model.modelName} should expose version 0`
    );
    assert.equal(record.toJSON().__v, undefined);
  }
});

test("concurrent conditional updates allow exactly one winner", async () => {
  for (const Model of MODELS) {
    const record = await insertRecord(Model);
    const seenVersion = currentVersionOf(record);

    // Two admins read the same version and save at the same time.
    const results = await Promise.all([
      Model.findOneAndUpdate(
        { _id: record._id, ...versionFilter(seenVersion) },
        { $inc: { __v: 1 } },
        { new: true }
      ),
      Model.findOneAndUpdate(
        { _id: record._id, ...versionFilter(seenVersion) },
        { $inc: { __v: 1 } },
        { new: true }
      )
    ]);

    const winners = results.filter(Boolean);

    assert.equal(
      winners.length,
      1,
      `${Model.modelName} should accept only one concurrent write`
    );
    assert.equal(winners[0].__v, seenVersion + 1);

    const stored = await Model.findById(record._id).lean();

    assert.equal(stored.__v, seenVersion + 1, "counter advances once");
    assert.ok(stored.updatedAt instanceof Date, "updatedAt is set");

    // A retry after refreshing the record succeeds against the new version.
    const retried = await Model.findOneAndUpdate(
      { _id: record._id, ...versionFilter(stored.__v) },
      { $inc: { __v: 1 } },
      { new: true }
    );

    assert.equal(retried.__v, seenVersion + 2);
  }
});

test("a stale version is rejected and leaves the record untouched", async () => {
  for (const Model of MODELS) {
    const record = await insertRecord(Model);

    const rejected = await Model.findOneAndUpdate(
      { _id: record._id, ...versionFilter(5) },
      { $inc: { __v: 1 } },
      { new: true }
    );

    assert.equal(rejected, null, `${Model.modelName} should reject stale write`);

    const stored = await Model.findById(record._id).lean();

    assert.equal(stored.__v, 0);
  }
});

test("version 0 also matches a record written before __v existed", async () => {
  const Model = Program;
  const inserted = await Model.collection.insertOne({
    name: `Legacy program ${Date.now()}`,
    description: "Legacy",
    fee: 1,
    createdAt: new Date("2024-01-01T00:00:00.000Z"),
    updatedAt: new Date("2024-01-01T00:00:00.000Z")
  });

  const updated = await Model.findOneAndUpdate(
    { _id: inserted.insertedId, ...versionFilter(0) },
    { $inc: { __v: 1 } },
    { new: true }
  );

  assert.ok(updated);
  assert.equal(updated.__v, 1);
});

test("sendVersionConflict responds with HTTP 409 and the current version", () => {
  const res = {
    statusCode: 0,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    }
  };

  sendVersionConflict(res, { currentVersion: 3 });

  assert.equal(res.statusCode, 409);
  assert.equal(res.body.code, "VERSION_CONFLICT");
  assert.equal(res.body.currentVersion, 3);
});

test("migration copies version into __v and preserves updatedAt", async () => {
  const Model = Program;
  const updatedAt = new Date("2024-02-03T04:05:06.000Z");

  const copied = await Model.collection.insertOne({
    name: `Migrated program ${Date.now()}`,
    description: "Legacy",
    fee: 1,
    version: 4,
    __v: 0,
    createdAt: new Date("2024-01-01T00:00:00.000Z"),
    updatedAt
  });

  const initialized = await Model.collection.insertOne({
    name: `Unversioned program ${Date.now()}`,
    description: "Legacy",
    fee: 1,
    createdAt: new Date("2024-01-01T00:00:00.000Z"),
    updatedAt
  });

  const result = await migrateVersionCounters({ logger: null });

  assert.ok(result.migrated >= 1);

  const migrated = await Model.collection.findOne({
    _id: copied.insertedId
  });

  assert.equal(migrated.__v, 4);
  assert.equal(migrated.version, undefined);
  assert.equal(migrated.updatedAt.toISOString(), updatedAt.toISOString());

  const unversioned = await Model.collection.findOne({
    _id: initialized.insertedId
  });

  assert.equal(unversioned.__v, 0);

  // Running it again is a no-op.
  const second = await migrateVersionCounters({ logger: null });

  assert.equal(second.migrated, 0);
  assert.equal(second.initialized, 0);
});

test("readExpectedVersion rejects malformed counters", () => {
  assert.deepEqual(readExpectedVersion({ version: 2 }), {
    provided: true,
    value: 2,
    invalid: false
  });
  assert.equal(readExpectedVersion({ version: -1 }).invalid, true);
  assert.equal(readExpectedVersion({ version: "abc" }).invalid, true);
  assert.equal(readExpectedVersion({}).provided, false);
});
