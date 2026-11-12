const express = require("express");
const router = express.Router();

const {
    getMyProfile,
    updateMyProfile
} = require("../controllers/traineeController");

const {
    getMyPayments,
    submitPayment
} = require("../controllers/traineePaymentController");

const { getMyCows } = require("../controllers/cowController");
const { getMyActivities } = require("../controllers/activityController");

const { protect, traineeOnly } = require("../middleware/authMiddleware");

// Retrieve the logged-in trainee's profile
router.get("/me", protect, traineeOnly, getMyProfile);

// Update the logged-in trainee's profile (phone + address only)
router.put("/me", protect, traineeOnly, updateMyProfile);

// Own payments
router.get("/payments", protect, traineeOnly, getMyPayments);
router.post("/payments", protect, traineeOnly, submitPayment);

// Assigned animals and read-only care activities
router.get("/cows", protect, traineeOnly, getMyCows);
router.get("/activities", protect, traineeOnly, getMyActivities);

module.exports = router;
