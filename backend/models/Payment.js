const mongoose = require("mongoose");

const paymentSchema = new mongoose.Schema(
    {
        // The approved application this payment belongs to. One approved
        // application is one payment account (program) for a trainee.
        application: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "TrainingApplication",
            required: true,
            index: true
        },

        // Copied from the application so listings need no extra populate.
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

const Payment = mongoose.model("Payment", paymentSchema);

module.exports = Payment;
