const express = require("express");
const router = express.Router();
const {
  loginLimiter,
  signupLimiter,
  forgotPasswordLimiter,
  resetPasswordLimiter,
  googleLoginLimiter,
} = require("../middleware/rateLimiters");

const {
  getAdminProfile,
  updateAdminProfile,
  changeAdminPassword,
} = require("../controllers/adminProfileController");

const { protect, adminOnly } = require("../middleware/authMiddleware");

const {
  signup,
  login,
  googleLogin,
  forgotPassword,
  resetPassword,
} = require("../controllers/authController");

// Trainee registration
router.post("/signup", signupLimiter, signup);

// Trainee and administrator login
router.post("/login", loginLimiter, login);

// Google Sign-In
router.post("/google", googleLoginLimiter, googleLogin);

// Password recovery
router.post("/forgot-password", forgotPasswordLimiter, forgotPassword);
router.post("/reset-password", resetPasswordLimiter, resetPassword);

// Signed-in administrator's own profile
router.get("/profile", protect, adminOnly, getAdminProfile);
router.patch("/profile", protect, adminOnly, updateAdminProfile);
router.patch("/profile/password", protect, adminOnly, changeAdminPassword);

module.exports = router;
