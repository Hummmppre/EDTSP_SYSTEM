const express = require("express");

const {
    getStatus,
    getConnectUrl,
    handleCallback,
    disconnectCalendar,
    syncActivities
} = require("../controllers/googleCalendarController");

const { protect, adminOnly } = require("../middleware/authMiddleware");

const router = express.Router();

// The callback must stay public because Google redirects the browser to it.
// The signed state parameter proves an administrator started the flow.
router.get("/callback", handleCallback);

router.get("/status", protect, adminOnly, getStatus);
router.get("/connect", protect, adminOnly, getConnectUrl);
router.post("/disconnect", protect, adminOnly, disconnectCalendar);
router.post("/sync", protect, adminOnly, syncActivities);

module.exports = router;
