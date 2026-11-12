const test = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");

const { startDb, stopDb, clearDb } = require("./helpers/db");
const { app } = require("./helpers/app");
const {
    createAdmin,
    createTrainee,
    createProgram
} = require("./helpers/auth");

test.before(startDb);
test.after(stopDb);
test.beforeEach(clearDb);

const listTrainees = (token, query = "") =>
    request(app)
        .get(`/api/admin/trainees${query}`)
        .set("Authorization", `Bearer ${token}`);

const patchTrainee = (token, id, body) =>
    request(app)
        .patch(`/api/admin/trainees/${id}`)
        .set("Authorization", `Bearer ${token}`)
        .send(body);

test("the admin list includes the profile and balance", async () => {
    const { token } = await createAdmin();
    const program = await createProgram({ totalFee: 18000 });
    const trainee = await createTrainee({
        program: program._id,
        traineeId: "EDT-2026-010"
    });

    const response = await listTrainees(token);

    assert.equal(response.status, 200);
    assert.equal(response.body.total, 1);

    const row = response.body.trainees[0];
    assert.equal(row._id, String(trainee.user._id));
    assert.equal(row.traineeId, "EDT-2026-010");
    assert.equal(row.programName, program.name);
    assert.equal(row.enrollmentStatus, "Ongoing");
    assert.equal(row.totalFee, 18000);
    assert.equal(row.balance, 18000);
});

test("assigning a trainee ID and program persists", async () => {
    const { token } = await createAdmin();
    const program = await createProgram({ code: "NUTRI" });
    const trainee = await createTrainee();

    const response = await patchTrainee(token, trainee.user._id, {
        traineeId: "EDT-2026-011",
        program: String(program._id),
        enrollmentStatus: "Completed"
    });

    assert.equal(response.status, 200);
    assert.equal(response.body.trainee.traineeId, "EDT-2026-011");
    assert.equal(response.body.trainee.enrollmentStatus, "Completed");
    assert.equal(String(response.body.trainee.program._id), String(program._id));
});

test("an invalid trainee ID format is rejected", async () => {
    const { token } = await createAdmin();
    const trainee = await createTrainee();

    const response = await patchTrainee(token, trainee.user._id, {
        traineeId: "TRAINEE-1"
    });

    assert.equal(response.status, 400);
    assert.equal(response.body.field, "traineeId");
});

test("a duplicate trainee ID returns 409", async () => {
    const { token } = await createAdmin();
    await createTrainee({ traineeId: "EDT-2026-020" });
    const other = await createTrainee();

    const response = await patchTrainee(token, other.user._id, {
        traineeId: "EDT-2026-020"
    });

    assert.equal(response.status, 409);
    assert.equal(response.body.code, "DUPLICATE_TRAINEE_ID");
});

test("an inactive program cannot be assigned", async () => {
    const { token } = await createAdmin();
    const program = await createProgram({ active: false });
    const trainee = await createTrainee();

    const response = await patchTrainee(token, trainee.user._id, {
        program: String(program._id)
    });

    assert.equal(response.status, 400);
    assert.equal(response.body.code, "PROGRAM_INACTIVE");
});

test("deactivating a trainee ends their session", async () => {
    const { token } = await createAdmin();
    const trainee = await createTrainee();

    const response = await patchTrainee(token, trainee.user._id, {
        status: "inactive"
    });

    assert.equal(response.status, 200);
    assert.equal(response.body.trainee.status, "inactive");

    const nextRequest = await request(app)
        .get("/api/trainee/me")
        .set("Authorization", `Bearer ${trainee.token}`);

    assert.equal(nextRequest.status, 403);
    assert.equal(nextRequest.body.code, "ACCOUNT_INACTIVE");
});

test("only trainee accounts can be managed through this route", async () => {
    const { token: adminToken, user: adminUser } = await createAdmin();

    const response = await patchTrainee(adminToken, adminUser._id, {
        traineeId: "EDT-2026-099"
    });

    assert.equal(response.status, 404);
});

test("search, enrolment filter, and pagination are server-side", async () => {
    const { token } = await createAdmin();

    await createTrainee({ firstName: "Alpha", enrollmentStatus: "Ongoing" });
    await createTrainee({ firstName: "Bravo", enrollmentStatus: "Completed" });
    await createTrainee({ firstName: "Charlie", enrollmentStatus: "Ongoing" });

    const search = await listTrainees(token, "?search=Brav");
    assert.equal(search.body.total, 1);
    assert.equal(search.body.trainees[0].firstName, "Bravo");

    const filtered = await listTrainees(token, "?status=Ongoing");
    assert.equal(filtered.body.total, 2);

    const paged = await listTrainees(token, "?page=2&limit=2");
    assert.equal(paged.body.count, 1);
    assert.equal(paged.body.pages, 2);
    assert.equal(paged.body.total, 3);
});

test("program management is guarded and validates fees", async () => {
    const { token } = await createAdmin();

    const created = await request(app)
        .post("/api/admin/programs")
        .set("Authorization", `Bearer ${token}`)
        .send({ name: "Farm Safety", code: "safety", totalFee: 12000 });

    assert.equal(created.status, 201);
    assert.equal(created.body.program.code, "SAFETY");
    assert.equal(created.body.program.totalFee, 12000);

    const invalid = await request(app)
        .post("/api/admin/programs")
        .set("Authorization", `Bearer ${token}`)
        .send({ name: "Broken", code: "BROKEN", totalFee: -5 });

    assert.equal(invalid.status, 400);

    const programs = await request(app)
        .get("/api/admin/programs")
        .set("Authorization", `Bearer ${token}`);

    assert.equal(programs.status, 200);
    assert.equal(programs.body.total, 1);
});

test("a program in use cannot be deleted", async () => {
    const { token } = await createAdmin();
    const program = await createProgram();
    await createTrainee({ program: program._id });

    const response = await request(app)
        .delete(`/api/admin/programs/${program._id}`)
        .set("Authorization", `Bearer ${token}`);

    assert.equal(response.status, 409);
    assert.equal(response.body.code, "PROGRAM_IN_USE");
});
