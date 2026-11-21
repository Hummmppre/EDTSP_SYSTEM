const mongoose = require("mongoose");
const { exposeVersionAsJson } = require("../lib/versioning");

const paymentSchema = new mongoose.Schema(
    {
        // The approved application behind this account, when there is one.
        // Payments are keyed by trainee + program, so an enrolled trainee
        // without an approved application can still be billed.
        application: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "TrainingApplication",
            default: null,
            index: true
        },

        // Copied from the account so listings need no extra populate.
        user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
            index: true
        },

        program: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Program",
            required: true
        },

        receiptNumber: {
            type: String,
            required: true,
            unique: true,
            trim: true
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
            required: true,
            enum: ["Cash", "Bank Transfer", "GCash", "Other"]
        },

        referenceNumber: {
            type: String,
            default: "",
            trim: true,
            maxlength: 100
        },

        remarks: {
            type: String,
            default: "",
            trim: true,
            maxlength: 500
        },

        recordedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User"
        }
    },
    { timestamps: true }
);

paymentSchema.index({ application: 1, paymentDate: -1 });
paymentSchema.index({ paymentDate: -1 });

exposeVersionAsJson(paymentSchema);

const Payment = mongoose.model("Payment", paymentSchema);

module.exports = Payment;
