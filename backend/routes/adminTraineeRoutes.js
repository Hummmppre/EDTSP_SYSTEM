const express = require("express");
const router = express.Router();

const {
    getTrainees,
    updateTrainee
} = require("../controllers/traineeAdminController");

const { protect, adminOnly } = require("../middleware/authMiddleware");

router.get("/", protect, adminOnly, getTrainees);
router.put("/:userId", protect, adminOnly, updateTrainee);

module.exports = router;
