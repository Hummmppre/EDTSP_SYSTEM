const express = require("express");

const {
    listCows,
    createCow,
    updateCow,
    listActivities,
    createActivity
} = require("../controllers/cowAdminController");

const { getMyCowMaintenance } = require("../controllers/cowController");

const { protect, adminOnly, traineeOnly } = require("../middleware/authMiddleware");
const { apiWriteLimiter } = require("../middleware/rateLimiters");

// /api/admin/cows
const adminCowRoutes = express.Router();

adminCowRoutes.get("/", protect, adminOnly, listCows);
adminCowRoutes.post("/", apiWriteLimiter, protect, adminOnly, createCow);
adminCowRoutes.put(
    "/:cowId",
    apiWriteLimiter,
    protect,
    adminOnly,
    updateCow
);
adminCowRoutes.get("/activities", protect, adminOnly, listActivities);
adminCowRoutes.post(
    "/activities",
    apiWriteLimiter,
    protect,
    adminOnly,
    createActivity
);

// /api/trainee/cows
const traineeCowRoutes = express.Router();

traineeCowRoutes.get("/", protect, traineeOnly, getMyCowMaintenance);

module.exports = {
    adminCowRoutes,
    traineeCowRoutes
};
