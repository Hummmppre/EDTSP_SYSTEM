const express = require("express");
const router = express.Router();

const {
    signup,
    login,
    getMe,
    logout,
    changePassword,
    forgotPassword,
    resetPassword
} = require("../controllers/authController");

const { protect } = require("../middleware/authMiddleware");
const { authLimiter, resetLimiter } = require("../middleware/rateLimit");

// Trainee registration
router.post("/signup", authLimiter, signup);

// Trainee and administrator login
router.post("/login", authLimiter, login);

// Fresh account + profile for the client session guard
router.get("/me", protect, getMe);

// Session revocation
router.post("/logout", protect, logout);

// Account management
router.post("/change-password", protect, changePassword);
router.post("/forgot-password", authLimiter, resetLimiter, forgotPassword);
router.post("/reset-password", resetLimiter, resetPassword);

module.exports = router;
