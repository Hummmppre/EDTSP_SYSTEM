const express = require("express");

const {
    getStatus,
    getConnectUrl,
    handleCallback,
    disconnectCalendar,
    syncActivities
} = require("../controllers/googleCalendarController");

const { protect, adminOnly } = require("../middleware/authMiddleware");
const { apiWriteLimiter } = require("../middleware/rateLimiters");

const router = express.Router();

// The callback must stay public because Google redirects the browser to it.
// The signed state parameter proves an administrator started the flow.
router.get("/callback", handleCallback);

router.get("/status", protect, adminOnly, getStatus);
router.get("/connect", protect, adminOnly, getConnectUrl);
router.post(
  "/disconnect",
  apiWriteLimiter,
  protect,
  adminOnly,
  disconnectCalendar,
);
router.post("/sync", apiWriteLimiter, protect, adminOnly, syncActivities);

module.exports = router;
