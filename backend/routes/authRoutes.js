
const express = require("express");
const router = express.Router();

const {
    signup,
    login,
    googleLogin
} = require("../controllers/authController");

// Trainee registration
router.post("/signup", signup);

// Trainee and administrator login
router.post("/login", login);

// Google Sign-In
router.post("/google", googleLogin);

module.exports = router;
