const test = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");

const { startDb, stopDb, clearDb } = require("./helpers/db");
const { app } = require("./helpers/app");
const { createAdmin, createTrainee, createProgram } = require("./helpers/auth");

const Payment = require("../models/Payment");

test.before(startDb);
test.after(stopDb);
test.beforeEach(clearDb);

const setup = async (totalFee = 10000) => {
    const admin = await createAdmin();
    const program = await createProgram({ totalFee });
    const trainee = await createTrainee({ program: program._id });

    return { admin, program, trainee };
};

const submitPayment = (token, body) =>
    request(app)
        .post("/api/trainee/payments")
        .set("Authorization", `Bearer ${token}`)
        .send(body);

const today = new Date().toISOString().slice(0, 10);

test("a trainee submits a pending payment with the correct balance", async () => {
    const { trainee } = await setup(10000);

    const response = await submitPayment(trainee.token, {
        amount: 4000,
        paymentDate: today,
        method: "GCash",
        reference: "GC-123"
    });

    assert.equal(response.status, 201);
    assert.equal(response.body.payment.status, "Pending");
    assert.match(response.body.payment.paymentRef, /^EDT-PAY-\d{6}$/);

    const list = await request(app)
        .get("/api/trainee/payments")
        .set("Authorization", `Bearer ${trainee.token}`);

    assert.equal(list.status, 200);
    assert.equal(list.body.summary.totalFee, 10000);
    assert.equal(list.body.summary.paid, 0);
    assert.equal(list.body.summary.balance, 10000);
    assert.equal(list.body.summary.status, "Unpaid");
});

test("an amount above the balance is rejected", async () => {
    const { trainee } = await setup(10000);

    const response = await submitPayment(trainee.token, {
        amount: 10001,
        paymentDate: today,
        method: "Cash"
    });

    assert.equal(response.status, 400);
    assert.equal(response.body.code, "AMOUNT_EXCEEDS_BALANCE");
    assert.match(response.body.message, /10000/);
});

test("a future payment date is rejected", async () => {
    const { trainee } = await setup();

    const future = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
        .toISOString()
        .slice(0, 10);

    const response = await submitPayment(trainee.token, {
        amount: 500,
        paymentDate: future,
        method: "Cash"
    });

    assert.equal(response.status, 400);
    assert.equal(response.body.code, "FUTURE_DATE");
});

test("verifying a payment reduces the balance", async () => {
    const { admin, trainee } = await setup(10000);

    const created = await submitPayment(trainee.token, {
        amount: 4000,
        paymentDate: today,
        method: "Bank Transfer",
        reference: "BT-99"
    });

    const verified = await request(app)
        .put(`/api/admin/payments/${created.body.payment._id}/verify`)
        .set("Authorization", `Bearer ${admin.token}`)
        .send({});

    assert.equal(verified.status, 200);
    assert.equal(verified.body.payment.status, "Verified");
    assert.ok(verified.body.payment.verifiedAt);

    const list = await request(app)
        .get("/api/trainee/payments")
        .set("Authorization", `Bearer ${trainee.token}`);

    assert.equal(list.body.summary.paid, 4000);
    assert.equal(list.body.summary.balance, 6000);
    assert.equal(list.body.summary.status, "Partial");
});

test("a payment cannot be decided twice", async () => {
    const { admin, trainee } = await setup();

    const created = await submitPayment(trainee.token, {
        amount: 1000,
        paymentDate: today,
        method: "Cash"
    });

    await request(app)
        .put(`/api/admin/payments/${created.body.payment._id}/verify`)
        .set("Authorization", `Bearer ${admin.token}`)
        .send({})
        .expect(200);

    const again = await request(app)
        .put(`/api/admin/payments/${created.body.payment._id}/verify`)
        .set("Authorization", `Bearer ${admin.token}`)
        .send({});

    assert.equal(again.status, 409);
});

test("rejecting requires a reason and never counts toward paid", async () => {
    const { admin, trainee } = await setup(10000);

    const created = await submitPayment(trainee.token, {
        amount: 2500,
        paymentDate: today,
        method: "GCash",
        reference: "GC-404"
    });

    const noReason = await request(app)
        .put(`/api/admin/payments/${created.body.payment._id}/reject`)
        .set("Authorization", `Bearer ${admin.token}`)
        .send({});

    assert.equal(noReason.status, 400);
    assert.equal(noReason.body.field, "remarks");

    const rejected = await request(app)
        .put(`/api/admin/payments/${created.body.payment._id}/reject`)
        .set("Authorization", `Bearer ${admin.token}`)
        .send({ remarks: "Reference not found." });

    assert.equal(rejected.status, 200);
    assert.equal(rejected.body.payment.status, "Rejected");
    assert.equal(rejected.body.payment.remarks, "Reference not found.");

    const list = await request(app)
        .get("/api/trainee/payments")
        .set("Authorization", `Bearer ${trainee.token}`);

    assert.equal(list.body.summary.paid, 0);
    assert.equal(list.body.summary.balance, 10000);
});

test("an admin can record and verify a payment in one step", async () => {
    const { admin, trainee } = await setup(10000);

    const response = await request(app)
        .post("/api/admin/payments")
        .set("Authorization", `Bearer ${admin.token}`)
        .send({
            userId: String(trainee.user._id),
            amount: 10000,
            paymentDate: today,
            method: "Cash",
            status: "Verified"
        });

    assert.equal(response.status, 201);
    assert.equal(response.body.payment.status, "Verified");

    const list = await request(app)
        .get("/api/trainee/payments")
        .set("Authorization", `Bearer ${trainee.token}`);

    assert.equal(list.body.summary.paid, 10000);
    assert.equal(list.body.summary.balance, 0);
    assert.equal(list.body.summary.status, "Fully Paid");
});

test("trainees cannot reach the admin payment list", async () => {
    const { trainee } = await setup();

    const response = await request(app)
        .get("/api/admin/payments")
        .set("Authorization", `Bearer ${trainee.token}`);

    assert.equal(response.status, 403);
});

test("payment references are unique and sequential", async () => {
    const { trainee } = await setup(10000);

    for (const amount of [1000, 2000, 3000]) {
        await submitPayment(trainee.token, {
            amount,
            paymentDate: today,
            method: "Cash"
        });
    }

    const payments = await Payment.find().sort({ createdAt: 1 });
    const refs = payments.map((payment) => payment.paymentRef);

    assert.equal(new Set(refs).size, 3);
});

test("the admin list paginates and filters by status", async () => {
    const { admin, trainee } = await setup(10000);

    for (const amount of [1000, 2000, 3000]) {
        await submitPayment(trainee.token, {
            amount,
            paymentDate: today,
            method: "Cash"
        });
    }

    const pending = await Payment.findOne({ amount: 1000 });
    await request(app)
        .put(`/api/admin/payments/${pending._id}/verify`)
        .set("Authorization", `Bearer ${admin.token}`)
        .send({});

    const filtered = await request(app)
        .get("/api/admin/payments?status=Verified")
        .set("Authorization", `Bearer ${admin.token}`);

    assert.equal(filtered.status, 200);
    assert.equal(filtered.body.total, 1);
    assert.equal(filtered.body.summary.collected, 1000);
    assert.equal(filtered.body.summary.pending, 2);

    const paged = await request(app)
        .get("/api/admin/payments?page=1&limit=2")
        .set("Authorization", `Bearer ${admin.token}`);

    assert.equal(paged.body.count, 2);
    assert.equal(paged.body.pages, 2);
});
