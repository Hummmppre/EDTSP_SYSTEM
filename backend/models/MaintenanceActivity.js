const mongoose = require("mongoose");

const ACTIVITY_TYPES = ["Feeding", "Drinking", "Medication", "General", "Other"];
const ACTIVITY_STATUSES = ["Pending", "Completed"];

const maintenanceActivitySchema = new mongoose.Schema(
    {
        cow: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Cow",
            required: true
        },

        type: {
            type: String,
            enum: ACTIVITY_TYPES,
            default: "General"
        },

        description: {
            type: String,
            required: true,
            trim: true
        },

        scheduledAt: {
            type: Date,
            required: true
        },

        assignedTrainees: [
            {
                type: mongoose.Schema.Types.ObjectId,
                ref: "User"
            }
        ],

        status: {
            type: String,
            enum: ACTIVITY_STATUSES,
            default: "Pending"
        },

        completedAt: {
            type: Date,
            default: null
        },

        completedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            default: null
        },

        createdBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            default: null
        }
    },
    { timestamps: true }
);

maintenanceActivitySchema.index({ scheduledAt: -1 });
maintenanceActivitySchema.index({ cow: 1, scheduledAt: -1 });
maintenanceActivitySchema.index({ assignedTrainees: 1, scheduledAt: -1 });

const MaintenanceActivity = mongoose.model(
    "MaintenanceActivity",
    maintenanceActivitySchema
);

module.exports = MaintenanceActivity;
module.exports.ACTIVITY_TYPES = ACTIVITY_TYPES;
module.exports.ACTIVITY_STATUSES = ACTIVITY_STATUSES;
