const express = require("express");
const router = express.Router();

const {
    getOpenBatches,
    getMyApplication,
    submitApplication,
    withdrawApplication
} = require("../controllers/applicationController");

const { protect, traineeOnly } = require("../middleware/authMiddleware");

router.get("/open-batches", protect, traineeOnly, getOpenBatches);
router.get("/me", protect, traineeOnly, getMyApplication);
router.post("/", protect, traineeOnly, submitApplication);
router.post("/:id/withdraw", protect, traineeOnly, withdrawApplication);

module.exports = router;
