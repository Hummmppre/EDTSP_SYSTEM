const express = require("express");
const router = express.Router();

const { signup, login } = require("../controllers/authController");

// Trainee registration
router.post("/signup", signup);

// Trainee and administrator login
router.post("/login", login);

module.exports = router;