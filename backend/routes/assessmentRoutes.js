
const express = require("express");
const router = express.Router();

const {
    getMyAssessments
} = require("../controllers/assessmentController");


const {
    createAssessment,
    getAllAssessments,
    getAllTrainees,
    gradeAssessment
} = require("../controllers/assessmentAdminController");

const {
    protect,
    traineeOnly,
    adminOnly
} = require("../middleware/authMiddleware");

const { apiWriteLimiter } = require("../middleware/rateLimiters");

// TRAINEE ROUTE
router.get("/me", protect, traineeOnly, getMyAssessments);


// ADMIN ROUTES
router.get("/trainees", protect, adminOnly, getAllTrainees);
router.post("/", apiWriteLimiter, protect, adminOnly, createAssessment);
router.get("/", protect, adminOnly, getAllAssessments);
router.put(
    "/:id/grade",
    apiWriteLimiter,
    protect,
    adminOnly,
    gradeAssessment
);
  

module.exports = router;
