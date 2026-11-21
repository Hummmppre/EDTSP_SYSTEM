const express = require("express");
const router = express.Router();

const {
    getTrainees,
    updateTrainee
} = require("../controllers/traineeAdminController");

const { protect, adminOnly } = require("../middleware/authMiddleware");
const { apiWriteLimiter } = require("../middleware/rateLimiters");

router.get("/", protect, adminOnly, getTrainees);
router.put("/:userId", apiWriteLimiter, protect, adminOnly, updateTrainee);

module.exports = router;
