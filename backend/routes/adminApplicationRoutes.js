const express = require("express");
const router = express.Router();

const {
    getAllApplications,
    getPendingCount,
    getApplication,
    decideApplication,
    exportApplications
} = require("../controllers/applicationAdminController");

const { protect, adminOnly } = require("../middleware/authMiddleware");

// Static paths must be declared before "/:id".
router.get("/pending-count", protect, adminOnly, getPendingCount);
router.get("/export", protect, adminOnly, exportApplications);

router.get("/", protect, adminOnly, getAllApplications);
router.get("/:id", protect, adminOnly, getApplication);
router.post("/:id/decision", protect, adminOnly, decideApplication);

module.exports = router;
