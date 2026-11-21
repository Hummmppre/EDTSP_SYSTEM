const express = require("express");

const {
    listPayments,
    getPaymentAccount,
    recordPayment,
    updatePayment
} = require("../controllers/paymentAdminController");

const { getMyPayments } = require("../controllers/paymentController");

const { protect, adminOnly, traineeOnly } = require("../middleware/authMiddleware");
const { apiWriteLimiter } = require("../middleware/rateLimiters");

// /api/admin/payments
const adminPaymentRoutes = express.Router();

adminPaymentRoutes.get("/", protect, adminOnly, listPayments);
adminPaymentRoutes.get("/:accountId", protect, adminOnly, getPaymentAccount);
adminPaymentRoutes.post(
    "/",
    apiWriteLimiter,
    protect,
    adminOnly,
    recordPayment
);
adminPaymentRoutes.put(
    "/:paymentId",
    apiWriteLimiter,
    protect,
    adminOnly,
    updatePayment
);

// /api/trainee/payments
const traineePaymentRoutes = express.Router();

traineePaymentRoutes.get("/", protect, traineeOnly, getMyPayments);

module.exports = {
    adminPaymentRoutes,
    traineePaymentRoutes
};
