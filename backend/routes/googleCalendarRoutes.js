const express = require("express");

const {
    getStatus,
    getConnectUrl,
    handleCallback
} = require("../controllers/googleCalendarController");

const { protect, adminOnly } = require("../middleware/authMiddleware");

const router = express.Router();

// The callback must stay public because Google redirects the browser to it.
// The signed state parameter proves an administrator started the flow.
router.get("/callback", handleCallback);

router.get("/status", protect, adminOnly, getStatus);
router.get("/connect", protect, adminOnly, getConnectUrl);

module.exports = router;
