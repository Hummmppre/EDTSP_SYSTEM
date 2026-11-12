const test = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");

const { startDb, stopDb, clearDb } = require("./helpers/db");
const { app } = require("./helpers/app");
const { createTrainee, createProgram, PASSWORD } = require("./helpers/auth");

const User = require("../models/User");
const TraineeProfile = require("../models/TraineeProfile");

test.before(startDb);
test.after(stopDb);
test.beforeEach(clearDb);

test("signup requires every field", async () => {
    const response = await request(app)
        .post("/api/auth/signup")
        .send({ email: "someone@example.com", password: PASSWORD });

    assert.equal(response.status, 400);
    assert.equal(response.body.success, false);
    assert.equal(response.body.field, "firstName");
});

test("signup rejects an invalid email", async () => {
    const response = await request(app).post("/api/auth/signup").send({
        firstName: "Ana",
        lastName: "Cruz",
        email: "not-an-email",
        password: PASSWORD
    });

    assert.equal(response.status, 400);
    assert.equal(response.body.field, "email");
});

test("signup rejects a short password", async () => {
    const response = await request(app).post("/api/auth/signup").send({
        firstName: "Ana",
        lastName: "Cruz",
        email: "ana@example.com",
        password: "short"
    });

    assert.equal(response.status, 400);
    assert.equal(response.body.field, "password");
});

test("signup creates the account and its trainee profile", async () => {
    const response = await request(app).post("/api/auth/signup").send({
        firstName: "Ana",
        lastName: "Cruz",
        email: "Ana@Example.com",
        password: PASSWORD
    });

    assert.equal(response.status, 201);
    assert.equal(response.body.user.email, "ana@example.com");
    assert.equal(response.body.user.role, "trainee");
    assert.equal(response.body.user.password, undefined);

    const user = await User.findOne({ email: "ana@example.com" });
    const profile = await TraineeProfile.findOne({ user: user._id });

    assert.ok(profile);
    assert.equal(profile.enrollmentStatus, "Pending");
});

test("signup rejects a duplicate email", async () => {
    const { user } = await createTrainee();

    const response = await request(app).post("/api/auth/signup").send({
        firstName: "Copy",
        lastName: "Cat",
        email: user.email,
        password: PASSWORD
    });

    assert.equal(response.status, 409);
    assert.equal(response.body.code, "DUPLICATE_EMAIL");
});

test("login succeeds and returns a token", async () => {
    const { user } = await createTrainee();

    const response = await request(app)
        .post("/api/auth/login")
        .send({ email: user.email, password: PASSWORD });

    assert.equal(response.status, 200);
    assert.ok(response.body.token);
    assert.equal(response.body.user.role, "trainee");
});

test("login rejects a wrong password", async () => {
    const { user } = await createTrainee();

    const response = await request(app)
        .post("/api/auth/login")
        .send({ email: user.email, password: "WrongPassword1" });

    assert.equal(response.status, 401);
    assert.equal(response.body.code, "INVALID_CREDENTIALS");
});

test("login rejects an inactive account", async () => {
    const { user } = await createTrainee({ status: "inactive" });

    const response = await request(app)
        .post("/api/auth/login")
        .send({ email: user.email, password: PASSWORD });

    assert.equal(response.status, 403);
    assert.equal(response.body.code, "ACCOUNT_INACTIVE");
});

test("me returns the account with its populated program", async () => {
    const program = await createProgram({ name: "Dairy Production", code: "DAIRY" });
    const trainee = await createTrainee({
        program: program._id,
        traineeId: "EDT-2026-001"
    });

    const response = await request(app)
        .get("/api/auth/me")
        .set("Authorization", `Bearer ${trainee.token}`);

    assert.equal(response.status, 200);
    assert.equal(response.body.profile.traineeId, "EDT-2026-001");
    assert.equal(response.body.profile.program.name, "Dairy Production");
    assert.equal(response.body.profile.program.totalFee, 18000);
});

test("change-password issues a new token and revokes the old one", async () => {
    const { token } = await createTrainee();

    const changed = await request(app)
        .post("/api/auth/change-password")
        .set("Authorization", `Bearer ${token}`)
        .send({ currentPassword: PASSWORD, newPassword: "NewPassword123!" });

    assert.equal(changed.status, 200);
    assert.ok(changed.body.token);

    const oldToken = await request(app)
        .get("/api/auth/me")
        .set("Authorization", `Bearer ${token}`);

    assert.equal(oldToken.status, 401);

    const newToken = await request(app)
        .get("/api/auth/me")
        .set("Authorization", `Bearer ${changed.body.token}`);

    assert.equal(newToken.status, 200);
});

test("change-password rejects the wrong current password", async () => {
    const { token } = await createTrainee();

    const response = await request(app)
        .post("/api/auth/change-password")
        .set("Authorization", `Bearer ${token}`)
        .send({ currentPassword: "Nope12345", newPassword: "NewPassword123!" });

    assert.equal(response.status, 400);
    assert.equal(response.body.field, "currentPassword");
});

test("logout revokes the token", async () => {
    const { token } = await createTrainee();

    const loggedOut = await request(app)
        .post("/api/auth/logout")
        .set("Authorization", `Bearer ${token}`);

    assert.equal(loggedOut.status, 200);

    const afterwards = await request(app)
        .get("/api/auth/me")
        .set("Authorization", `Bearer ${token}`);

    assert.equal(afterwards.status, 401);
});

test("forgot and reset password works and is single use", async () => {
    const { user, token } = await createTrainee();

    const forgot = await request(app)
        .post("/api/auth/forgot-password")
        .send({ email: user.email });

    assert.equal(forgot.status, 200);
    assert.equal(forgot.body.message, "If that email exists, a reset link has been created.");
    assert.ok(forgot.body.resetToken);

    const reset = await request(app).post("/api/auth/reset-password").send({
        token: forgot.body.resetToken,
        newPassword: "BrandNewPass123"
    });

    assert.equal(reset.status, 200);

    const oldToken = await request(app)
        .get("/api/auth/me")
        .set("Authorization", `Bearer ${token}`);

    assert.equal(oldToken.status, 401);

    const reused = await request(app).post("/api/auth/reset-password").send({
        token: forgot.body.resetToken,
        newPassword: "AnotherPass123"
    });

    assert.equal(reused.status, 400);
    assert.equal(reused.body.code, "INVALID_RESET_TOKEN");
});

test("forgot-password does not reveal unknown emails", async () => {
    const response = await request(app)
        .post("/api/auth/forgot-password")
        .send({ email: "nobody@example.com" });

    assert.equal(response.status, 200);
    assert.equal(response.body.resetToken, undefined);
});

test("an expired reset token is rejected", async () => {
    const { user } = await createTrainee();

    const forgot = await request(app)
        .post("/api/auth/forgot-password")
        .send({ email: user.email });

    await User.updateOne(
        { _id: user._id },
        { $set: { resetPasswordExpires: new Date(Date.now() - 1000) } }
    );

    const reset = await request(app).post("/api/auth/reset-password").send({
        token: forgot.body.resetToken,
        newPassword: "BrandNewPass123"
    });

    assert.equal(reset.status, 400);
    assert.equal(reset.body.code, "INVALID_RESET_TOKEN");
});

test("login rejects a missing password", async () => {
    const response = await request(app)
        .post("/api/auth/login")
        .send({ email: "nobody@example.com" });

    assert.equal(response.status, 400);
});
