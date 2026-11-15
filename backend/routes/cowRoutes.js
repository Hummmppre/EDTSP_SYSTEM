const express = require("express");

const {
    listCows,
    createCow,
    listActivities,
    createActivity
} = require("../controllers/cowAdminController");

const { getMyCowMaintenance } = require("../controllers/cowController");

const { protect, adminOnly, traineeOnly } = require("../middleware/authMiddleware");

// /api/admin/cows
const adminCowRoutes = express.Router();

adminCowRoutes.use(protect, adminOnly);

adminCowRoutes.get("/", listCows);
adminCowRoutes.post("/", createCow);
adminCowRoutes.get("/activities", listActivities);
adminCowRoutes.post("/activities", createActivity);

// /api/trainee/cows
const traineeCowRoutes = express.Router();

traineeCowRoutes.use(protect, traineeOnly);

traineeCowRoutes.get("/", getMyCowMaintenance);

module.exports = {
    adminCowRoutes,
    traineeCowRoutes
};
