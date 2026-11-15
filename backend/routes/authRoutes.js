
const express = require("express");
const router = express.Router();

const {
    signup,
    login,
    googleLogin,
    forgotPassword,
    resetPassword
} = require("../controllers/authController");

// Trainee registration
router.post("/signup", signup);

// Trainee and administrator login
router.post("/login", login);

// Google Sign-In
router.post("/google", googleLogin);

// Password recovery
router.post("/forgot-password", forgotPassword);
router.post("/reset-password", resetPassword);

module.exports = router;
