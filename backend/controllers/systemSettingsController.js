
const SystemSettings = require("../models/SystemSettings");

// Get current system settings
const getSystemSettings = async (req, res) => {
    try {
        let settings = await SystemSettings.findOne();

        // Create default settings if none exist
        if (!settings) {
            settings = await SystemSettings.create({});
        }

        res.status(200).json({
            success: true,
            settings
        });
    } catch (error) {
        console.error("Get system settings error:", error);
        res.status(500).json({
            success: false,
            message: "Failed to retrieve system settings."
        });
    }
};


const getPublicSystemSettings = async (req, res) => {
    try {
        let settings = await SystemSettings.findOne();

        if (!settings) {
            settings = await SystemSettings.create({});
        }

        res.status(200).json({
            success: true,
            settings: {
                googleAuthEnabled: settings.googleAuthEnabled,
                recaptchaEnabled: settings.recaptchaEnabled
            }
        });
    } catch (error) {
        console.error("Get public system settings error:", error);
        res.status(500).json({
            success: false,
            message: "Failed to retrieve system settings."
        });
    }
};


// Update system settings
const updateSystemSettings = async (req, res) => {
    try {
        const { googleAuthEnabled, recaptchaEnabled } = req.body;

        if (
            typeof googleAuthEnabled !== "boolean" ||
            typeof recaptchaEnabled !== "boolean"
        ) {
            return res.status(400).json({
                success: false,
                message: "Both settings must be true or false."
            });
        }

        let settings = await SystemSettings.findOne();

        if (!settings) {
            settings = new SystemSettings();
        }

        settings.googleAuthEnabled = googleAuthEnabled;
        settings.recaptchaEnabled = recaptchaEnabled;

        await settings.save();

        res.status(200).json({
            success: true,
            message: "System settings updated successfully.",
            settings
        });
    } catch (error) {
        console.error("Update system settings error:", error);
        res.status(500).json({
            success: false,
            message: "Failed to update system settings."
        });
    }
};

module.exports = {
    getSystemSettings,
    updateSystemSettings,
    getPublicSystemSettings
};
