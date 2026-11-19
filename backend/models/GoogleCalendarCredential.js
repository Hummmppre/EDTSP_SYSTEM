const mongoose = require("mongoose");

const googleCalendarCredentialSchema = new mongoose.Schema(
    {
        provider: {
            type: String,
            required: true,
            unique: true,
            default: "google"
        },

        refreshToken: {
            type: String,
            required: true
        },

        accountEmail: {
            type: String,
            default: ""
        },

        // Scopes Google actually granted. Both integrations reuse this account
        // only when their required scope is present.
        scopes: {
            type: [String],
            default: []
        },

        calendarId: {
            type: String,
            default: "primary"
        },

        connectedAt: {
            type: Date,
            default: Date.now
        }
    },
    { timestamps: true }
);

const GoogleCalendarCredential = mongoose.model(
    "GoogleCalendarCredential",
    googleCalendarCredentialSchema
);

module.exports = GoogleCalendarCredential;
