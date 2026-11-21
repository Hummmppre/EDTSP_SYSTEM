
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

        // Optimistic-concurrency counter. Every write increments it; an admin
        // form only saves when the version it read still matches.
        version: {
            type: Number,
            default: 0,
            min: 0
        },

        phone: {
            type: String,
            trim: true
        },

        address: {
            type: String,
            trim: true
        },

        // The image itself lives in GridFS; only its identity is kept here.
        avatar: {
            fileId: {
                type: mongoose.Schema.Types.ObjectId
            },
            contentType: {
                type: String,
                trim: true
            },
            size: {
                type: Number,
                min: 0
            },
            updatedAt: {
                type: Date
            }
        }
    },
    { timestamps: true }
);

const TraineeProfile = mongoose.model(
    "TraineeProfile",
    traineeProfileSchema
);

module.exports = TraineeProfile;
