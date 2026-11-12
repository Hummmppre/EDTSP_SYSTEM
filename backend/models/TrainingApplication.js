const mongoose = require("mongoose");

const applicationSchema = new mongoose.Schema(
    {
        user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true
        },

        program: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Program",
            required: true
        },

        batch: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Batch",
            required: true
        },

        firstName: {
            type: String,
            required: true,
            trim: true
        },

        lastName: {
            type: String,
            required: true,
            trim: true
        },

        email: {
            type: String,
            required: true,
            lowercase: true,
            trim: true
        },

        phone: {
            type: String,
            required: true,
            trim: true
        },

        address: {
            type: String,
            required: true,
            trim: true
        },

        dateOfBirth: {
            type: Date,
            required: true
        },

        sex: {
            type: String,
            required: true,
            enum: ["Female", "Male", "Prefer not to say"]
        },

        civilStatus: {
            type: String,
            required: true,
            enum: ["Single", "Married", "Widowed", "Separated"]
        },

        highestEducation: {
            type: String,
            required: true,
            enum: [
                "Elementary",
                "High school",
                "Senior high school",
                "Vocational",
                "College",
                "Postgraduate"
            ]
        },

        schoolAttended: {
            type: String,
            required: true,
            trim: true
        },

        emergencyContactName: {
            type: String,
            required: true,
            trim: true
        },

        emergencyContactPhone: {
            type: String,
            required: true,
            trim: true
        },

        emergencyContactRelationship: {
            type: String,
            required: true,
            trim: true
        },

        motivation: {
            type: String,
            default: "",
            maxlength: 1000
        },

        acknowledgedTruthful: {
            type: Boolean,
            required: true
        },

        status: {
            type: String,
            enum: [
                "Submitted",
                "Under review",
                "Approved",
                "Rejected",
                "Withdrawn"
            ],
            default: "Submitted"
        },

        reviewer: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User"
        },

        decidedAt: {
            type: Date,
            default: null
        },

        publicNote: {
            type: String,
            default: "",
            maxlength: 1000
        },

        internalNote: {
            type: String,
            default: "",
            maxlength: 2000
        },

        submittedAt: {
            type: Date,
            default: Date.now
        },

        withdrawnAt: {
            type: Date,
            default: null
        },

        // True only while the application is Submitted or Under review. It
        // exists so the unique partial index below can use an equality filter:
        // MongoDB rejects $in in partialFilterExpression before 6.0.
        openApplication: {
            type: Boolean,
            default: undefined
        }
    },
    { timestamps: true }
);

// Safety net for the "one open application" rule. The controller guard stays
// authoritative; this index only stops a concurrent double submission.
applicationSchema.index(
    { user: 1 },
    {
        name: "unique_open_application_per_user",
        unique: true,
        partialFilterExpression: { openApplication: true }
    }
);

const TrainingApplication = mongoose.model(
    "TrainingApplication",
    applicationSchema
);

module.exports = TrainingApplication;
