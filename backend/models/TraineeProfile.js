
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
            type: String,
            default: "Dairy Production Training",
            trim: true
        },

        enrollmentStatus: {
            type: String,
            enum: ["Pending", "Ongoing", "Completed", "Inactive"],
            default: "Pending"
        },

        phone: {
            type: String,
            trim: true
        },

        address: {
            type: String,
            trim: true
        }
    },
    { timestamps: true }
);

const TraineeProfile = mongoose.model(
    "TraineeProfile",
    traineeProfileSchema
);

module.exports = TraineeProfile;
