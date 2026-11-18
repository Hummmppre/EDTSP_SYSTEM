const express = require("express");
const router = express.Router();

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
router.post("/signup", signup);

// Trainee and administrator login
router.post("/login", login);

// Google Sign-In
router.post("/google", googleLogin);

// Password recovery
router.post("/forgot-password", forgotPassword);
router.post("/reset-password", resetPassword);

// Signed-in administrator's own profile
router.get("/profile", protect, adminOnly, getAdminProfile);
router.patch("/profile", protect, adminOnly, updateAdminProfile);
router.patch("/profile/password", protect, adminOnly, changeAdminPassword);

module.exports = router;
