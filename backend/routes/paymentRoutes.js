const express = require("express");

const {
    listPayments,
    getPaymentAccount,
    recordPayment
} = require("../controllers/paymentAdminController");

const { getMyPayments } = require("../controllers/paymentController");

const { protect, adminOnly, traineeOnly } = require("../middleware/authMiddleware");

// /api/admin/payments
const adminPaymentRoutes = express.Router();

adminPaymentRoutes.use(protect, adminOnly);

adminPaymentRoutes.get("/", listPayments);
adminPaymentRoutes.get("/:applicationId", getPaymentAccount);
adminPaymentRoutes.post("/", recordPayment);

// /api/trainee/payments
const traineePaymentRoutes = express.Router();

traineePaymentRoutes.use(protect, traineeOnly);

traineePaymentRoutes.get("/", getMyPayments);

module.exports = {
    adminPaymentRoutes,
    traineePaymentRoutes
};
