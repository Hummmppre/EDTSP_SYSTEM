const mongoose = require("mongoose");

const programSchema = new mongoose.Schema(
    {
        name: {
            type: String,
            required: true,
            unique: true,
            trim: true
        },

        code: {
            type: String,
            required: true,
            unique: true,
            uppercase: true,
            trim: true
        },

        totalFee: {
            type: Number,
            required: true,
            min: 0,
            default: 18000
        },

        description: {
            type: String,
            default: "",
            trim: true
        },

        active: {
            type: Boolean,
            default: true
        }
    },
    { timestamps: true }
);

const Program = mongoose.model("Program", programSchema);

module.exports = Program;
