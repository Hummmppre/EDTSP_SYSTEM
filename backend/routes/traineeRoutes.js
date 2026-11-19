
const express = require("express");
const router = express.Router();

const {
    getMyProfile,
    updateMyProfile,
    getMyAvatar,
    uploadMyAvatar
} = require("../controllers/traineeController");

const { receiveAvatar } = require("../lib/avatarUpload");

const {
    protect,
    traineeOnly
} = require("../middleware/authMiddleware");

// Retrieve the logged-in trainee's profile
router.get("/me", protect, traineeOnly, getMyProfile);

// Update the logged-in trainee's profile
router.put("/me", protect, traineeOnly, updateMyProfile);

// Read and replace the logged-in trainee's profile picture
router.get("/me/avatar", protect, traineeOnly, getMyAvatar);
router.post(
    "/me/avatar",
    protect,
    traineeOnly,
    receiveAvatar,
    uploadMyAvatar
);

module.exports = router;
