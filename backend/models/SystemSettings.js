
const mongoose = require("mongoose");

const systemSettingsSchema = new mongoose.Schema(
    {
        googleAuthEnabled: {
            type: Boolean,
            default: false
        },
        recaptchaEnabled: {
            type: Boolean,
            default: false
        },
        emailEnabled: {
            type: Boolean,
            default: true
        },
        googleCalendarEnabled: {
            type: Boolean,
            default: true
        },
        googleSheetsEnabled: {
            type: Boolean,
            default: true
        }
    },
    {
        timestamps: true
    }
);

module.exports = mongoose.model("SystemSettings", systemSettingsSchema);
