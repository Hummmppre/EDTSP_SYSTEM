const mongoose = require("mongoose");

const traineeProfileSchema = new mongoose.Schema(
    {
        // Connects this profile to a specific User account
        user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
            unique: true
        },

        // Trainee-specific information
        traineeId: {
            type: String,
            unique: true,
            sparse: true,
            trim: true
        },

        program: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Program",
            default: null
        },

        // Original free-text program name kept for audit after migration.
        legacyProgramName: {
            type: String,
            default: "",
            trim: true
        },

        enrollmentStatus: {
            type: String,
            enum: ["Pending", "Ongoing", "Completed", "Inactive"],
            default: "Pending"
        },

        phone: {
            type: String,
            trim: true,
            default: ""
        },

        address: {
            type: String,
            trim: true,
            default: ""
        }
    },
    { timestamps: true }
);

const TraineeProfile = mongoose.model(
    "TraineeProfile",
    traineeProfileSchema
);

module.exports = TraineeProfile;
