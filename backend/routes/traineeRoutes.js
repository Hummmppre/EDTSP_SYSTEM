
const express = require("express");
const router = express.Router();

const {
    getMyProfile,
    updateMyProfile
} = require("../controllers/traineeController");

const {
    protect,
    traineeOnly
} = require("../middleware/authMiddleware");

// Retrieve the logged-in trainee's profile
router.get("/me", protect, traineeOnly, getMyProfile);

// Update the logged-in trainee's profile
router.put("/me", protect, traineeOnly, updateMyProfile);

module.exports = router;
