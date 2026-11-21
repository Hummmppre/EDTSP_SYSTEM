const express = require("express");
const router = express.Router();
const {
  apiWriteLimiter,
  loginLimiter,
  loginFailureGuard,
  signupLimiter,
  forgotPasswordIpLimiter,
  forgotPasswordAccountLimiter,
  resetPasswordIpLimiter,
  googleLoginLimiter,
} = require("../middleware/rateLimiters");

const {
  getAdminProfile,
  updateAdminProfile,
  changeAdminPassword,
  getAdminAvatar,
  uploadAdminAvatar,
} = require("../controllers/adminProfileController");

const { receiveAvatar } = require("../lib/avatarUpload");

const { protect, adminOnly } = require("../middleware/authMiddleware");

const {
  signup,
  login,
  googleLogin,
  forgotPassword,
  resetPassword,
} = require("../controllers/authController");

// Trainee registration
router.post("/signup", apiWriteLimiter, signupLimiter, signup);

// Trainee and administrator login
router.post(
  "/login",
  apiWriteLimiter,
  loginLimiter,
  loginFailureGuard,
  login,
);

// Google Sign-In
router.post("/google", apiWriteLimiter, googleLoginLimiter, googleLogin);

// Password recovery
router.post(
  "/forgot-password",
  apiWriteLimiter,
  forgotPasswordIpLimiter,
  forgotPasswordAccountLimiter,
  forgotPassword,
);
router.post(
  "/reset-password",
  apiWriteLimiter,
  resetPasswordIpLimiter,
  resetPassword,
);

// Signed-in administrator's own profile
router.get("/profile", protect, adminOnly, getAdminProfile);
router.patch(
  "/profile",
  apiWriteLimiter,
  protect,
  adminOnly,
  updateAdminProfile,
);
router.patch(
  "/profile/password",
  apiWriteLimiter,
  protect,
  adminOnly,
  changeAdminPassword,
);
router.get("/profile/avatar", protect, adminOnly, getAdminAvatar);
router.post(
  "/profile/avatar",
  apiWriteLimiter,
  protect,
  adminOnly,
  receiveAvatar,
  uploadAdminAvatar,
);

module.exports = router;
