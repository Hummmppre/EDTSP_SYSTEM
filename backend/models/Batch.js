const mongoose = require("mongoose");

const batchSchema = new mongoose.Schema(
    {
        program: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Program",
            required: true
        },

        label: {
            type: String,
            required: true,
            trim: true
        },

        intakeDate: {
            type: Date,
            default: null
        },

        slotCapacity: {
            type: Number,
            required: true,
            min: 1
        },

        filledCount: {
            type: Number,
            default: 0,
            min: 0
        },

        status: {
            type: String,
            enum: ["Open", "Closed"],
            default: "Open"
        }
    },
    { timestamps: true }
);

batchSchema.index({ program: 1, label: 1 }, { unique: true });

batchSchema.virtual("slotsRemaining").get(function () {
    return Math.max(this.slotCapacity - this.filledCount, 0);
});

batchSchema.virtual("isFull").get(function () {
    return this.filledCount >= this.slotCapacity;
});

batchSchema.set("toJSON", { virtuals: true });
batchSchema.set("toObject", { virtuals: true });

const Batch = mongoose.model("Batch", batchSchema);

module.exports = Batch;
