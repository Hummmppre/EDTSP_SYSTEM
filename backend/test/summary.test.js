const test = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");

const { startDb, stopDb, clearDb } = require("./helpers/db");
const { app } = require("./helpers/app");
const { createAdmin, createTrainee, createProgram } = require("./helpers/auth");

const Assessment = require("../models/Assessment");
const Payment = require("../models/Payment");

test.before(startDb);
test.after(stopDb);
test.beforeEach(clearDb);

test("the summary returns a zero state on an empty database", async () => {
    const { token } = await createAdmin();

    const response = await request(app)
        .get("/api/admin/summary")
        .set("Authorization", `Bearer ${token}`);

    assert.equal(response.status, 200);

    const { summary } = response.body;

    assert.equal(summary.totalTrainees, 0);
    assert.equal(summary.activeTrainees, 0);
    assert.equal(summary.pendingEnrolment, 0);
    assert.equal(summary.completedTraining, 0);
    assert.equal(summary.totalAssessments, 0);
    assert.equal(summary.averageScore, 0);
    assert.equal(summary.collected, 0);
    assert.equal(summary.outstanding, 0);
    assert.deepEqual(response.body.recentAssessments, []);
});

test("the summary counts trainees, assessments, and money correctly", async () => {
    const { token } = await createAdmin();
    const program = await createProgram({ totalFee: 18000 });

    const first = await createTrainee({
        program: program._id,
        enrollmentStatus: "Pending"
    });
    const second = await createTrainee({
        program: program._id,
        enrollmentStatus: "Completed"
    });
    await createTrainee({ program: null, enrollmentStatus: "Ongoing" });

    await Assessment.create([
        {
            user: first.user._id,
            assessmentTitle: "Graded one",
            subject: "Dairy",
            totalScore: 100,
            score: 90,
            status: "Graded"
        },
        {
            user: second.user._id,
            assessmentTitle: "Graded two",
            subject: "Dairy",
            totalScore: 50,
            score: 40,
            status: "Graded"
        },
        {
            user: first.user._id,
            assessmentTitle: "Pending one",
            subject: "Dairy",
            totalScore: 100,
            status: "Pending"
        }
    ]);

    await Payment.create([
        {
            user: first.user._id,
            program: program._id,
            amount: 5000,
            paymentDate: new Date(),
            method: "Cash",
            status: "Verified",
            paymentRef: "EDT-PAY-900001",
            verifiedAt: new Date()
        },
        {
            user: second.user._id,
            program: program._id,
            amount: 2000,
            paymentDate: new Date(),
            method: "GCash",
            status: "Pending",
            paymentRef: "EDT-PAY-900002"
        }
    ]);

    const response = await request(app)
        .get("/api/admin/summary")
        .set("Authorization", `Bearer ${token}`);

    const { summary } = response.body;

    assert.equal(summary.totalTrainees, 3);
    assert.equal(summary.activeTrainees, 3);
    assert.equal(summary.pendingEnrolment, 1);
    assert.equal(summary.completedTraining, 1);
    assert.equal(summary.totalAssessments, 3);
    assert.equal(summary.pendingAssessments, 1);
    assert.equal(summary.gradedAssessments, 2);
    // 90/100 and 40/50 both average 85%.
    assert.equal(summary.averageScore, 85);
    assert.equal(summary.collected, 5000);
    assert.equal(summary.paymentsPending, 1);
    // 13000 + 18000 outstanding (third trainee has no program).
    assert.equal(summary.outstanding, 31000);
    assert.equal(response.body.recentAssessments.length, 3);
    assert.equal(response.body.recentAssessments[0].user.firstName, first.user.firstName);
});
