const mongoose = require("mongoose");

const programSchema = new mongoose.Schema(
    {
        name: {
            type: String,
            required: true,
            unique: true,
            trim: true
        },

        description: {
            type: String,
            required: true,
            trim: true
        },

        fee: {
            type: Number,
            required: true,
            min: 0
        },

        status: {
            type: String,
            enum: ["Open", "Closed"],
            default: "Open"
        },

        createdBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User"
        }
    },
    { timestamps: true }
);

const Program = mongoose.model("Program", programSchema);

module.exports = Program;
