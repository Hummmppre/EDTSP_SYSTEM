const express = require("express");
const router = express.Router();

const { getMyAssessments } = require("../controllers/assessmentController");

const {
    createAssessment,
    getAllAssessments,
    getAssessmentTrainees,
    gradeAssessment
} = require("../controllers/assessmentAdminController");

const {
    protect,
    traineeOnly,
    adminOnly
} = require("../middleware/authMiddleware");

// TRAINEE ROUTE
router.get("/me", protect, traineeOnly, getMyAssessments);

// ADMIN ROUTES
router.get("/trainees", protect, adminOnly, getAssessmentTrainees);
router.post("/", protect, adminOnly, createAssessment);
router.get("/", protect, adminOnly, getAllAssessments);
router.put("/:id/grade", protect, adminOnly, gradeAssessment);

module.exports = router;
