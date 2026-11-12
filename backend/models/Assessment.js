const mongoose = require("mongoose");

const ASSESSMENT_TYPES = ["Written", "Practical", "Oral", "Performance"];

const assessmentSchema = new mongoose.Schema(
    {
        user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true
        },

        assessmentTitle: {
            type: String,
            required: true,
            trim: true
        },

        subject: {
            type: String,
            required: true,
            trim: true
        },

        assessmentType: {
            type: String,
            enum: ASSESSMENT_TYPES,
            default: "Written"
        },

        score: {
            type: Number,
            min: 0,
            default: null
        },

        totalScore: {
            type: Number,
            required: true,
            min: 1
        },

        status: {
            type: String,
            enum: ["Pending", "Graded"],
            default: "Pending"
        },

        assessmentDate: {
            type: Date,
            default: null
        },

        dueDate: {
            type: Date,
            default: null
        },

        remarks: {
            type: String,
            default: ""
        }
    },
    { timestamps: true }
);

// Prevent duplicate assessment titles for the same trainee
assessmentSchema.index(
    { user: 1, assessmentTitle: 1 },
    { unique: true }
);

const Assessment = mongoose.model(
    "Assessment",
    assessmentSchema
);

module.exports = Assessment;
module.exports.ASSESSMENT_TYPES = ASSESSMENT_TYPES;
