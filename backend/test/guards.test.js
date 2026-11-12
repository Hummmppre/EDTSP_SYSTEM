const test = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");

const { startDb, stopDb, clearDb } = require("./helpers/db");
const { app } = require("./helpers/app");
const { createAdmin, createTrainee } = require("./helpers/auth");

test.before(startDb);
test.after(stopDb);
test.beforeEach(clearDb);

test("a missing token is rejected with 401", async () => {
    const response = await request(app).get("/api/trainee/me");

    assert.equal(response.status, 401);
    assert.equal(response.body.code, "NO_TOKEN");
});

test("a malformed token is rejected with 401", async () => {
    const response = await request(app)
        .get("/api/trainee/me")
        .set("Authorization", "Bearer not-a-real-token");

    assert.equal(response.status, 401);
    assert.equal(response.body.code, "INVALID_SESSION");
});

test("a trainee cannot reach admin routes", async () => {
    const { token } = await createTrainee();

    const response = await request(app)
        .get("/api/admin/summary")
        .set("Authorization", `Bearer ${token}`);

    assert.equal(response.status, 403);
    assert.equal(response.body.code, "FORBIDDEN_ROLE");
});

test("an admin cannot reach trainee-only routes", async () => {
    const { token } = await createAdmin();

    const response = await request(app)
        .get("/api/trainee/me")
        .set("Authorization", `Bearer ${token}`);

    assert.equal(response.status, 403);
});

test("a deactivated account is rejected on its next request", async () => {
    const { user, token } = await createTrainee();

    await request(app)
        .get("/api/trainee/me")
        .set("Authorization", `Bearer ${token}`)
        .expect(200);

    await user.constructor.updateOne(
        { _id: user._id },
        { $set: { status: "inactive" }, $inc: { tokenVersion: 1 } }
    );

    const response = await request(app)
        .get("/api/trainee/me")
        .set("Authorization", `Bearer ${token}`);

    assert.equal(response.status, 403);
    assert.equal(response.body.code, "ACCOUNT_INACTIVE");
});

test("an unknown API route returns JSON 404", async () => {
    const response = await request(app).get("/api/does-not-exist");

    assert.equal(response.status, 404);
    assert.equal(response.body.success, false);
    assert.equal(response.body.code, "NOT_FOUND");
});
