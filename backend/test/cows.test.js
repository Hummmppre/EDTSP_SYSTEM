const test = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");

const { startDb, stopDb, clearDb } = require("./helpers/db");
const { app } = require("./helpers/app");
const { createAdmin, createTrainee } = require("./helpers/auth");

test.before(startDb);
test.after(stopDb);
test.beforeEach(clearDb);

const addCow = (token, body) =>
    request(app)
        .post("/api/admin/cows")
        .set("Authorization", `Bearer ${token}`)
        .send(body);

test("an admin adds a cow and can edit it", async () => {
    const { token } = await createAdmin();
    const trainee = await createTrainee();

    const created = await addCow(token, {
        cowId: "cow-001",
        name: "Bella",
        breed: "Holstein",
        ageYears: 4,
        healthStatus: "Healthy",
        assignedTrainees: [String(trainee.user._id)]
    });

    assert.equal(created.status, 201);
    assert.equal(created.body.cow.cowId, "COW-001");
    assert.equal(created.body.cow.assignedTrainees.length, 1);

    const updated = await request(app)
        .patch(`/api/admin/cows/${created.body.cow._id}`)
        .set("Authorization", `Bearer ${token}`)
        .send({ healthStatus: "Under Treatment", ageYears: 5 });

    assert.equal(updated.status, 200);
    assert.equal(updated.body.cow.healthStatus, "Under Treatment");
    assert.equal(updated.body.cow.ageYears, 5);
});

test("cow IDs are validated and unique", async () => {
    const { token } = await createAdmin();

    const invalid = await addCow(token, { cowId: "BELLA", name: "Bella" });
    assert.equal(invalid.status, 400);
    assert.equal(invalid.body.field, "cowId");

    await addCow(token, { cowId: "COW-002", name: "Daisy" });

    const duplicate = await addCow(token, { cowId: "COW-002", name: "Copy" });
    assert.equal(duplicate.status, 409);
    assert.equal(duplicate.body.code, "DUPLICATE_COW_ID");
});

test("several trainees can be assigned to one animal", async () => {
    const { token } = await createAdmin();
    const first = await createTrainee();
    const second = await createTrainee();

    const created = await addCow(token, {
        cowId: "COW-003",
        name: "Clover",
        assignedTrainees: [
            String(first.user._id),
            String(second.user._id)
        ]
    });

    assert.equal(created.status, 201);
    assert.equal(created.body.cow.assignedTrainees.length, 2);

    const mine = await request(app)
        .get("/api/trainee/cows")
        .set("Authorization", `Bearer ${first.token}`);

    assert.equal(mine.status, 200);
    assert.equal(mine.body.cows.length, 1);
    assert.equal(mine.body.cows[0].cowId, "COW-003");
});

test("an activity defaults to the cow's assigned trainees", async () => {
    const { token } = await createAdmin();
    const trainee = await createTrainee();

    const cow = await addCow(token, {
        cowId: "COW-004",
        name: "Daisy",
        assignedTrainees: [String(trainee.user._id)]
    });

    const activity = await request(app)
        .post("/api/admin/activities")
        .set("Authorization", `Bearer ${token}`)
        .send({
            cow: cow.body.cow._id,
            type: "Feeding",
            description: "Morning feed round",
            scheduledDate: new Date().toISOString().slice(0, 10),
            scheduledTime: "06:00"
        });

    assert.equal(activity.status, 201);
    assert.equal(activity.body.activity.assignedTrainees.length, 1);
    assert.equal(activity.body.activity.status, "Pending");

    const mine = await request(app)
        .get("/api/trainee/activities")
        .set("Authorization", `Bearer ${trainee.token}`);

    assert.equal(mine.body.count, 1);
    assert.equal(mine.body.activities[0].description, "Morning feed round");
});

test("only an admin can change an activity status", async () => {
    const { token } = await createAdmin();
    const trainee = await createTrainee();

    const cow = await addCow(token, {
        cowId: "COW-005",
        name: "Butter",
        assignedTrainees: [String(trainee.user._id)]
    });

    const activity = await request(app)
        .post("/api/admin/activities")
        .set("Authorization", `Bearer ${token}`)
        .send({
            cow: cow.body.cow._id,
            type: "General",
            description: "Stall cleaning",
            scheduledDate: new Date().toISOString().slice(0, 10),
            scheduledTime: "09:00"
        });

    const asTrainee = await request(app)
        .put(`/api/admin/activities/${activity.body.activity._id}/status`)
        .set("Authorization", `Bearer ${trainee.token}`)
        .send({ status: "Completed" });

    assert.equal(asTrainee.status, 403);

    const asAdmin = await request(app)
        .put(`/api/admin/activities/${activity.body.activity._id}/status`)
        .set("Authorization", `Bearer ${token}`)
        .send({ status: "Completed" });

    assert.equal(asAdmin.status, 200);
    assert.equal(asAdmin.body.activity.status, "Completed");
    assert.ok(asAdmin.body.activity.completedAt);

    const reopened = await request(app)
        .put(`/api/admin/activities/${activity.body.activity._id}/status`)
        .set("Authorization", `Bearer ${token}`)
        .send({ status: "Pending" });

    assert.equal(reopened.body.activity.status, "Pending");
    assert.equal(reopened.body.activity.completedAt, null);
});

test("the herd list reports health counts", async () => {
    const { token } = await createAdmin();

    await addCow(token, { cowId: "COW-006", name: "One", healthStatus: "Healthy" });
    await addCow(token, {
        cowId: "COW-007",
        name: "Two",
        healthStatus: "Under Observation"
    });

    const response = await request(app)
        .get("/api/admin/cows")
        .set("Authorization", `Bearer ${token}`);

    assert.equal(response.status, 200);
    assert.equal(response.body.summary.Total, 2);
    assert.equal(response.body.summary.Healthy, 1);
    assert.equal(response.body.summary["Under Observation"], 1);
});

test("trainees cannot create cows", async () => {
    const { token } = await createTrainee();

    const response = await request(app)
        .post("/api/admin/cows")
        .set("Authorization", `Bearer ${token}`)
        .send({ cowId: "COW-008", name: "Nope" });

    assert.equal(response.status, 403);
});
