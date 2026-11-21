
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
        },
        // Public by design: the browser needs this value to render the widget.
        recaptchaSiteKey: {
            type: String,
            default: "",
            maxlength: 256
        }
    },
    {
        timestamps: true
    }
);

module.exports = mongoose.model("SystemSettings", systemSettingsSchema);
