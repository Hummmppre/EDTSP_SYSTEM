const mongoose = require("mongoose");

const PAYMENT_METHODS = ["Cash", "Bank Transfer", "GCash", "Other"];
const PAYMENT_STATUSES = ["Pending", "Verified", "Rejected"];

const paymentSchema = new mongoose.Schema(
    {
        user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
            index: true
        },

        program: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Program",
            default: null
        },

        amount: {
            type: Number,
            required: true,
            min: 0.01
        },

        paymentDate: {
            type: Date,
            required: true
        },

        method: {
            type: String,
            enum: PAYMENT_METHODS,
            required: true
        },

        reference: {
            type: String,
            trim: true,
            default: ""
        },

        receiptUrl: {
            type: String,
            default: ""
        },

        receiptKey: {
            type: String,
            default: ""
        },

        status: {
            type: String,
            enum: PAYMENT_STATUSES,
            default: "Pending"
        },

        paymentRef: {
            type: String,
            unique: true
        },

        remarks: {
            type: String,
            default: "",
            trim: true
        },

        verifiedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            default: null
        },

        verifiedAt: {
            type: Date,
            default: null
        }
    },
    { timestamps: true }
);

paymentSchema.index({ user: 1, status: 1 });
paymentSchema.index({ status: 1, createdAt: -1 });

const Payment = mongoose.model("Payment", paymentSchema);

module.exports = Payment;
module.exports.PAYMENT_METHODS = PAYMENT_METHODS;
module.exports.PAYMENT_STATUSES = PAYMENT_STATUSES;
