const Counter = require("../models/Counter");

const pad = (value) => String(value).padStart(6, "0");

/**
 * Allocate the next sequential payment reference, e.g. EDT-PAY-000123.
 * The counter increment is atomic, so concurrent submissions never collide.
 */
const nextPaymentRef = async () => {
    const counter = await Counter.findByIdAndUpdate(
        "payment",
        { $inc: { seq: 1 } },
        { new: true, upsert: true, setDefaultsOnInsert: true }
    );

    return `EDT-PAY-${pad(counter.seq)}`;
};

module.exports = { nextPaymentRef };
