const mongoose = require("mongoose");

const maintenanceActivitySchema = new mongoose.Schema(
    {
        cow: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Cow",
            required: true,
            index: true
        },

        type: {
            type: String,
            required: true,
            enum: ["Feeding", "Drinking", "Medication", "General care"]
        },

        description: {
            type: String,
            required: true,
            trim: true,
            maxlength: 300
        },

        // Scheduled care time. A trainee's "today" is derived from this value.
        scheduledFor: {
            type: Date,
            required: true,
            index: true
        },

        assignedTrainee: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            default: null,
            index: true
        },

        status: {
            type: String,
            enum: ["Pending", "Completed"],
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

        recordedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            default: null
        },

        googleCalendarEventId: {
            type: String,
            default: null
        },

        googleCalendarEventLink: {
            type: String,
            default: null
        },

        calendarSyncedAt: {
            type: Date,
            default: null
        }
    },
    { timestamps: true }
);

maintenanceActivitySchema.index({ scheduledFor: 1, status: 1 });

const MaintenanceActivity = mongoose.model(
    "MaintenanceActivity",
    maintenanceActivitySchema
);

module.exports = MaintenanceActivity;
