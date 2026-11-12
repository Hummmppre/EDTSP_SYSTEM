const Payment = require("../models/Payment");
const TraineeProfile = require("../models/TraineeProfile");

const { getTraineeBalance } = require("../utils/balances");
const { nextPaymentRef } = require("../utils/paymentRef");
const { parseDateOnly, isFutureDate } = require("../utils/dates");
const { PAYMENT_METHODS } = require("../models/Payment");

const getMyPayments = async (req, res, next) => {
    try {
        const [payments, balance] = await Promise.all([
            Payment.find({ user: req.user.id })
                .populate("program", "name code totalFee")
                .sort({ paymentDate: -1, createdAt: -1 }),
            getTraineeBalance(req.user.id)
        ]);

        return res.status(200).json({
            success: true,
            count: payments.length,
            summary: {
                program: balance.program,
                programName: balance.programName,
                totalFee: balance.totalFee,
                paid: balance.paid,
                balance: balance.balance,
                status: balance.status
            },
            payments
        });
    } catch (error) {
        return next(error);
    }
};

const submitPayment = async (req, res, next) => {
    try {
        const { amount, paymentDate, method, reference, receiptUrl, receiptKey } =
            req.body;

        const parsedAmount = Number(amount);

        if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
            return res.status(400).json({
                success: false,
                message: "Enter a payment amount greater than zero.",
                field: "amount",
                code: "INVALID_AMOUNT"
            });
        }

        const parsedDate = parseDateOnly(paymentDate);

        if (!parsedDate) {
            return res.status(400).json({
                success: false,
                message: "Choose the date this payment was made.",
                field: "paymentDate",
                code: "INVALID_DATE"
            });
        }

        if (isFutureDate(parsedDate)) {
            return res.status(400).json({
                success: false,
                message: "The payment date cannot be in the future.",
                field: "paymentDate",
                code: "FUTURE_DATE"
            });
        }

        if (!PAYMENT_METHODS.includes(method)) {
            return res.status(400).json({
                success: false,
                message: "Choose a valid payment method.",
                field: "method",
                code: "INVALID_METHOD"
            });
        }

        const balance = await getTraineeBalance(req.user.id);

        if (balance.totalFee <= 0) {
            return res.status(400).json({
                success: false,
                message: "No training fee is assigned to your account yet. Contact the administrator.",
                code: "NO_PROGRAM"
            });
        }

        if (parsedAmount > balance.balance) {
            return res.status(400).json({
                success: false,
                message: `That amount exceeds your remaining balance of ${balance.balance.toFixed(2)}.`,
                field: "amount",
                code: "AMOUNT_EXCEEDS_BALANCE"
            });
        }

        const profile = await TraineeProfile.findOne({ user: req.user.id });

        const paymentRef = await nextPaymentRef();

        const payment = await Payment.create({
            user: req.user.id,
            program: profile?.program || balance.program?._id || null,
            amount: parsedAmount,
            paymentDate: parsedDate,
            method,
            reference: String(reference || "").trim(),
            receiptUrl: String(receiptUrl || "").trim(),
            receiptKey: String(receiptKey || "").trim(),
            paymentRef,
            status: "Pending"
        });

        return res.status(201).json({
            success: true,
            message: "Payment submitted for verification.",
            payment
        });
    } catch (error) {
        return next(error);
    }
};

module.exports = { getMyPayments, submitPayment };
