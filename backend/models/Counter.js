const mongoose = require("mongoose");

// One counter document per sequence, e.g. "traineeId-2026". The id keeps the
// sequence scoped to a calendar year without a separate reset job.
const counterSchema = new mongoose.Schema({
    _id: {
        type: String,
        required: true
    },

    seq: {
        type: Number,
        default: 0
    }
});

const Counter = mongoose.model("Counter", counterSchema);

module.exports = Counter;
