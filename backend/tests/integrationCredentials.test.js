const { test, before, after, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");

process.env.INTEGRATION_ENCRYPTION_KEY = Buffer.alloc(32, 9).toString("base64");
process.env.BREVO_API_KEY = "env-brevo-key";
process.env.GOOGLE_CALENDAR_CLIENT_ID = "env-google-id";
process.env.GOOGLE_CALENDAR_CLIENT_SECRET = "env-google-secret";
process.env.GOOGLE_CALENDAR_ID = "primary";

const IntegrationCredential = require("../models/IntegrationCredential");
const IntegrationValidationStatus = require("../models/IntegrationValidationStatus");
const SystemSettings = require("../models/SystemSettings");
const {
  resolveField,
  resolveIntegration,
  resolveForValidation,
  getMetadata,
  saveOverride,
  clearOverride,
} = require("../lib/integrationCredentials");
const {
  upsertValidationStatus,
  credentialUpdatedAtFor,
} = require("../lib/integrationStatus");

const TEST_URI =
  process.env.TEST_MONGODB_URI ||
  "mongodb://127.0.0.1:27017/edtsp_integration_test";
const ADMIN_ID = new mongoose.Types.ObjectId();

before(async () => {
  await mongoose.connect(TEST_URI);
});

beforeEach(async () => {
  await Promise.all([
    IntegrationCredential.deleteMany({}),
    IntegrationValidationStatus.deleteMany({}),
    SystemSettings.deleteMany({}),
  ]);
});

after(async () => {
  await Promise.all([
    IntegrationCredential.deleteMany({}),
    IntegrationValidationStatus.deleteMany({}),
    SystemSettings.deleteMany({}),
  ]);
  await mongoose.disconnect();
});

test("database credentials override env and store no plaintext", async () => {
  assert.equal((await resolveField("brevo", "apiKey")).value, "env-brevo-key");

  await saveOverride({
    card: "brevo",
    fields: { apiKey: "db-brevo-key" },
    adminId: ADMIN_ID,
  });

  const field = await resolveField("brevo", "apiKey");
  const stored = await IntegrationCredential.findOne({
    integration: "brevo",
  }).lean();

  assert.equal(field.value, "db-brevo-key");
  assert.equal(field.source, "database");
  assert.ok(stored.ciphertext);
  assert.ok(!JSON.stringify(stored).includes("db-brevo-key"));
});

test("unreadable credentials fail closed instead of falling back to env", async () => {
  await saveOverride({
    card: "brevo",
    fields: { apiKey: "db-brevo-key" },
    adminId: ADMIN_ID,
  });
  await IntegrationCredential.updateOne(
    { integration: "brevo" },
    { $set: { ciphertext: Buffer.from("broken").toString("base64") } },
  );

  const field = await resolveField("brevo", "apiKey");

  assert.equal(field.value, null);
  assert.equal(field.readable, false);
  assert.equal(field.code, "unreadable_credential");
});

test("Google Calendar writes the shared OAuth record and its own calendar ID", async () => {
  await saveOverride({
    card: "google-calendar",
    fields: {
      clientId: "db-google-id",
      clientSecret: "db-google-secret",
      calendarId: "team-calendar",
    },
    adminId: ADMIN_ID,
  });

  const oauth = await IntegrationCredential.findOne({
    integration: "google-oauth",
  }).lean();
  const calendar = await IntegrationCredential.findOne({
    integration: "google-calendar",
  }).lean();

  assert.ok(oauth);
  assert.ok(calendar);
  assert.equal((await resolveField("google-sheets", "clientId")).value, "db-google-id");
  assert.equal((await resolveField("google-calendar", "calendarId")).value, "team-calendar");
});

test("metadata reports sources, completeness, staleness, and no values", async () => {
  await saveOverride({
    card: "google-auth",
    fields: { clientId: "db-google-id", clientSecret: "db-google-secret" },
    adminId: ADMIN_ID,
  });
  await upsertValidationStatus({
    card: "google-auth",
    valid: true,
    state: "valid",
    code: "ok",
    message: "ok",
    checkedAt: new Date("2025-01-01T00:00:00.000Z"),
    credentialUpdatedAt: new Date("2024-01-01T00:00:00.000Z"),
  });

  const metadata = await getMetadata("google-auth");
  const serialized = JSON.stringify(metadata);

  assert.equal(metadata.configured, true);
  assert.equal(metadata.lastValidation.stale, true);
  assert.equal(metadata.fields[0].source, "database");
  assert.ok(!serialized.includes("db-google-secret"));
});

test("clear removes overrides and restores env resolution", async () => {
  await saveOverride({
    card: "brevo",
    fields: { apiKey: "db-brevo-key" },
    adminId: ADMIN_ID,
  });

  const cleared = await clearOverride("brevo");
  const field = await resolveField("brevo", "apiKey");

  assert.deepEqual(cleared.clearedKeys, ["brevo"]);
  assert.equal(field.value, "env-brevo-key");
  assert.equal(field.source, "environment");
});

test("reCAPTCHA stores the site key as a public setting", async () => {
  const key = `6L${"a".repeat(38)}`;

  await saveOverride({
    card: "recaptcha",
    fields: { secretKey: key, siteKey: key },
    adminId: ADMIN_ID,
  });

  const settings = await SystemSettings.findOne().lean();

  assert.equal(settings.recaptchaSiteKey, key);
  assert.equal((await resolveField("recaptcha", "siteKey")).source, "database");

  await clearOverride("recaptcha");

  assert.equal(
    (await SystemSettings.findOne().lean()).recaptchaSiteKey,
    "",
  );
});
