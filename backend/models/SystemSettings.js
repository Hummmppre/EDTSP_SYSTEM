
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
        }
    },
    {
        timestamps: true
    }
);

module.exports = mongoose.model("SystemSettings", systemSettingsSchema);
