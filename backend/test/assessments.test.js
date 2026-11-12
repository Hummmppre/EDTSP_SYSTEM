const test = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");

const { startDb, stopDb, clearDb } = require("./helpers/db");
const { app } = require("./helpers/app");
const { createAdmin, createTrainee } = require("./helpers/auth");

const Assessment = require("../models/Assessment");

test.before(startDb);
test.after(stopDb);
test.beforeEach(clearDb);

const assign = (token, body) =>
    request(app)
        .post("/api/assessments")
        .set("Authorization", `Bearer ${token}`)
        .send(body);

test("creates one assessment per selected trainee", async () => {
    const { token } = await createAdmin();
    const first = await createTrainee();
    const second = await createTrainee();

    const response = await assign(token, {
        traineeIds: [String(first.user._id), String(second.user._id)],
        assessmentTitle: "Dairy production assessment",
        subject: "Dairy Production",
        assessmentType: "Practical",
        totalScore: 100,
        dueDate: "2026-12-01"
    });

    assert.equal(response.status, 201);
    assert.equal(response.body.createdCount, 2);
    assert.equal(response.body.skippedCount, 0);

    const stored = await Assessment.find();
    assert.equal(stored.length, 2);
    assert.equal(stored[0].assessmentType, "Practical");
    assert.ok(stored[0].dueDate);
    assert.equal(stored[0].status, "Pending");
});

test("duplicate titles are skipped and reported, not failed", async () => {
    const { token } = await createAdmin();
    const first = await createTrainee();
    const second = await createTrainee();

    await assign(token, {
        traineeIds: [String(first.user._id)],
        assessmentTitle: "Feed handling",
        subject: "Nutrition",
        totalScore: 50
    });

    const response = await assign(token, {
        traineeIds: [String(first.user._id), String(second.user._id)],
        assessmentTitle: "Feed handling",
        subject: "Nutrition",
        totalScore: 50
    });

    assert.equal(response.status, 201);
    assert.equal(response.body.createdCount, 1);
    assert.equal(response.body.skippedCount, 1);
    assert.match(response.body.message, /1 skipped/);
    assert.equal(response.body.skipped[0].name, `${first.user.firstName} ${first.user.lastName}`.trim());
});

test("rejects an invalid total score", async () => {
    const { token } = await createAdmin();
    const trainee = await createTrainee();

    const response = await assign(token, {
        traineeIds: [String(trainee.user._id)],
        assessmentTitle: "Bad total",
        subject: "Dairy",
        totalScore: 0
    });

    assert.equal(response.status, 400);
    assert.equal(response.body.field, "totalScore");
});

test("rejects an inactive trainee", async () => {
    const { token } = await createAdmin();
    const trainee = await createTrainee({ status: "inactive" });

    const response = await assign(token, {
        traineeIds: [String(trainee.user._id)],
        assessmentTitle: "Inactive trainee",
        subject: "Dairy",
        totalScore: 100
    });

    assert.equal(response.status, 400);
    assert.equal(response.body.code, "INVALID_TRAINEE");
});

test("grading enforces the score bounds", async () => {
    const { token } = await createAdmin();
    const trainee = await createTrainee();

    await assign(token, {
        traineeIds: [String(trainee.user._id)],
        assessmentTitle: "Grading boundaries",
        subject: "Dairy",
        totalScore: 40
    });

    const assessment = await Assessment.findOne();

    const negative = await request(app)
        .put(`/api/assessments/${assessment._id}/grade`)
        .set("Authorization", `Bearer ${token}`)
        .send({ score: -1 });

    assert.equal(negative.status, 400);

    const tooHigh = await request(app)
        .put(`/api/assessments/${assessment._id}/grade`)
        .set("Authorization", `Bearer ${token}`)
        .send({ score: 41 });

    assert.equal(tooHigh.status, 400);
    assert.equal(tooHigh.body.code, "SCORE_TOO_HIGH");

    const notNumeric = await request(app)
        .put(`/api/assessments/${assessment._id}/grade`)
        .set("Authorization", `Bearer ${token}`)
        .send({ score: "excellent" });

    assert.equal(notNumeric.status, 400);

    const valid = await request(app)
        .put(`/api/assessments/${assessment._id}/grade`)
        .set("Authorization", `Bearer ${token}`)
        .send({ score: 37, remarks: "Solid work" });

    assert.equal(valid.status, 200);
    assert.equal(valid.body.assessment.status, "Graded");
    assert.equal(valid.body.assessment.score, 37);
});

test("grading a missing assessment returns 404", async () => {
    const { token } = await createAdmin();

    const response = await request(app)
        .put("/api/assessments/64b7f3f1f1f1f1f1f1f1f1f1/grade")
        .set("Authorization", `Bearer ${token}`)
        .send({ score: 10 });

    assert.equal(response.status, 404);
});

test("a trainee only sees their own assessments", async () => {
    const { token: adminToken } = await createAdmin();
    const first = await createTrainee();
    const second = await createTrainee();

    await assign(adminToken, {
        traineeIds: [String(first.user._id)],
        assessmentTitle: "First trainee only",
        subject: "Dairy",
        totalScore: 100
    });

    const response = await request(app)
        .get("/api/assessments/me")
        .set("Authorization", `Bearer ${first.token}`);

    assert.equal(response.status, 200);
    assert.equal(response.body.count, 1);
    assert.equal(response.body.assessments[0].assessmentTitle, "First trainee only");

    const otherResponse = await request(app)
        .get("/api/assessments/me")
        .set("Authorization", `Bearer ${second.token}`);

    assert.equal(otherResponse.body.count, 0);
});

test("the admin list paginates and searches", async () => {
    const { token } = await createAdmin();
    const trainee = await createTrainee({ firstName: "Searchable" });

    for (const title of ["Alpha check", "Beta check", "Gamma check"]) {
        await assign(token, {
            traineeIds: [String(trainee.user._id)],
            assessmentTitle: title,
            subject: "Dairy",
            totalScore: 100
        });
    }

    const page = await request(app)
        .get("/api/assessments?page=1&limit=2")
        .set("Authorization", `Bearer ${token}`);

    assert.equal(page.status, 200);
    assert.equal(page.body.count, 2);
    assert.equal(page.body.total, 3);
    assert.equal(page.body.pages, 2);
    assert.equal(page.body.limit, 2);

    const search = await request(app)
        .get("/api/assessments?search=Beta")
        .set("Authorization", `Bearer ${token}`);

    assert.equal(search.body.total, 1);
    assert.equal(search.body.assessments[0].assessmentTitle, "Beta check");

    const byTraineeName = await request(app)
        .get("/api/assessments?search=Searchable")
        .set("Authorization", `Bearer ${token}`);

    assert.equal(byTraineeName.body.total, 3);
});

test("the trainee picker only returns active trainees", async () => {
    const { token } = await createAdmin();
    await createTrainee({ firstName: "Active" });
    await createTrainee({ firstName: "Gone", status: "inactive" });

    const response = await request(app)
        .get("/api/assessments/trainees")
        .set("Authorization", `Bearer ${token}`);

    assert.equal(response.status, 200);
    assert.equal(response.body.trainees.length, 1);
    assert.equal(response.body.trainees[0].firstName, "Active");
});
