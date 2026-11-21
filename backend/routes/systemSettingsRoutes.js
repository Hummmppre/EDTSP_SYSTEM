
const express = require("express");
const router = express.Router();

const {
    getSystemSettings,
    updateSystemSettings,
    getPublicSystemSettings
} = require("../controllers/systemSettingsController");

const { protect, adminOnly } = require("../middleware/authMiddleware");
const { apiWriteLimiter } = require("../middleware/rateLimiters");

// Public route for login and signup pages
router.get("/public", getPublicSystemSettings);

// Retrieve system settings
router.get("/", protect, adminOnly, getSystemSettings);

// Update system settings
router.put("/", apiWriteLimiter, protect, adminOnly, updateSystemSettings);

module.exports = router;
