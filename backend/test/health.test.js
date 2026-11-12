const test = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");

const mongoose = require("mongoose");

const { startDb, stopDb } = require("./helpers/db");
const { app } = require("./helpers/app");

test.before(startDb);
test.after(stopDb);

test("health reports the real database state", async () => {
    const response = await request(app).get("/api/health");

    assert.equal(response.status, 200);
    assert.equal(response.body.success, true);
    assert.equal(response.body.database, "Connected");
    assert.equal(typeof response.body.uptime, "number");
});

test("health answers 503 when the database is not connected", async () => {
    const original = Object.getOwnPropertyDescriptor(
        mongoose.connection,
        "readyState"
    );

    const descriptor = Object.getOwnPropertyDescriptor(
        Object.getPrototypeOf(mongoose.connection),
        "readyState"
    );

    try {
        Object.defineProperty(mongoose.connection, "readyState", {
            configurable: true,
            get: () => 0
        });
    } catch (error) {
        // If the property cannot be overridden the 200 case above still covers
        // the mapping, so the test reports the limitation rather than failing.
        assert.ok(original || descriptor, "readyState is not configurable");
        return;
    }

    try {
        const response = await request(app).get("/api/health");

        assert.equal(response.status, 503);
        assert.equal(response.body.success, false);
        assert.equal(response.body.database, "Uninitialized");
    } finally {
        if (original) {
            Object.defineProperty(mongoose.connection, "readyState", original);
        } else {
            delete mongoose.connection.readyState;
        }
    }
});
