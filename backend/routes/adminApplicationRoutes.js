const express = require("express");
const router = express.Router();

const {
    getAllApplications,
    getPendingCount,
    getApplication,
    decideApplication,
    exportApplications,
    downloadApplicationDocument
} = require("../controllers/applicationAdminController");

const { protect, adminOnly } = require("../middleware/authMiddleware");
const { apiWriteLimiter } = require("../middleware/rateLimiters");

// Static paths must be declared before "/:id".
router.get("/pending-count", protect, adminOnly, getPendingCount);
router.get("/export", protect, adminOnly, exportApplications);

router.get("/", protect, adminOnly, getAllApplications);
router.get("/:id/documents/:fileId", protect, adminOnly, downloadApplicationDocument);
router.get("/:id", protect, adminOnly, getApplication);
router.post(
    "/:id/decision",
    apiWriteLimiter,
    protect,
    adminOnly,
    decideApplication
);

module.exports = router;
