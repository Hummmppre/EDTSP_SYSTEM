const express = require("express");
const router = express.Router();

const { getSummary } = require("../controllers/adminDashboardController");
const {
    getTrainees,
    updateTrainee
} = require("../controllers/adminTraineeController");
const {
    listPrograms,
    createProgram,
    updateProgram,
    deleteProgram
} = require("../controllers/programController");
const {
    listPayments,
    recordPayment,
    verifyPayment,
    rejectPayment,
    getTraineePayments
} = require("../controllers/adminPaymentController");
const {
    listCows,
    createCow,
    updateCow
} = require("../controllers/cowController");
const {
    listActivities,
    createActivity,
    updateActivity,
    updateActivityStatus
} = require("../controllers/activityController");

const { protect, adminOnly } = require("../middleware/authMiddleware");

router.use(protect, adminOnly);

// Dashboard
router.get("/summary", getSummary);

// Trainees
router.get("/trainees", getTrainees);
router.patch("/trainees/:userId", updateTrainee);
router.get("/trainees/:userId/payments", getTraineePayments);

// Programs
router.get("/programs", listPrograms);
router.post("/programs", createProgram);
router.patch("/programs/:id", updateProgram);
router.delete("/programs/:id", deleteProgram);

// Payments
router.get("/payments", listPayments);
router.post("/payments", recordPayment);
router.put("/payments/:id/verify", verifyPayment);
router.put("/payments/:id/reject", rejectPayment);

// Cows
router.get("/cows", listCows);
router.post("/cows", createCow);
router.patch("/cows/:id", updateCow);

// Maintenance activities
router.get("/activities", listActivities);
router.post("/activities", createActivity);
router.patch("/activities/:id", updateActivity);
router.put("/activities/:id/status", updateActivityStatus);

module.exports = router;
