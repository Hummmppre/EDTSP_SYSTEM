const express = require("express");
const router = express.Router();

const {
  getSystemSettings,
  updateSystemSettings,
  getPublicSystemSettings,
} = require("../controllers/systemSettingsController");
const {
  testIntegration,
  saveIntegration,
  clearIntegration,
  listAudit,
} = require("../controllers/integrationCredentialController");

const { protect, adminOnly } = require("../middleware/authMiddleware");
const {
  apiWriteLimiter,
  integrationValidationLimiter,
} = require("../middleware/rateLimiters");

// Public route for login and signup pages
router.get("/public", getPublicSystemSettings);

// Retrieve system settings
router.get("/", protect, adminOnly, getSystemSettings);

// Update system settings
router.put("/", apiWriteLimiter, protect, adminOnly, updateSystemSettings);

router.get("/integrations/audit", protect, adminOnly, listAudit);
router.post(
  "/integrations/:integration/test",
  apiWriteLimiter,
  protect,
  adminOnly,
  integrationValidationLimiter,
  testIntegration,
);
router.put(
  "/integrations/:integration",
  apiWriteLimiter,
  protect,
  adminOnly,
  integrationValidationLimiter,
  saveIntegration,
);
router.delete(
  "/integrations/:integration",
  apiWriteLimiter,
  protect,
  adminOnly,
  integrationValidationLimiter,
  clearIntegration,
);

module.exports = router;
