const mongoose = require("mongoose");

const Payment = require("../models/Payment");
const User = require("../models/User");
const TraineeProfile = require("../models/TraineeProfile");

const { getPagination, paginationMeta } = require("../utils/pagination");
const { searchRegExp, parseDateOnly, isFutureDate } = require("../utils/dates");
const { getTraineeBalance, getVerifiedTotalsByUser } = require("../utils/balances");
const { nextPaymentRef } = require("../utils/paymentRef");
const { deleteReceipt } = require("../uploadthing/client");
const { PAYMENT_METHODS } = require("../models/Payment");

const buildPaymentSummary = async () => {
    const [verified, pending, count, profiles] = await Promise.all([
        Payment.aggregate([
            { $match: { status: "Verified" } },
            { $group: { _id: null, total: { $sum: "$amount" } } }
        ]),
        Payment.countDocuments({ status: "Pending" }),
        Payment.countDocuments(),
        TraineeProfile.find().populate("program", "totalFee")
    ]);

    const paidByUser = await getVerifiedTotalsByUser();

    const outstanding = profiles.reduce((sum, profile) => {
        const totalFee =
            profile.program && typeof profile.program === "object"
                ? Number(profile.program.totalFee) || 0
                : 0;

        const paid = paidByUser.get(String(profile.user)) || 0;

        return sum + Math.max(totalFee - paid, 0);
    }, 0);

    return {
        collected: verified.length ? verified[0].total : 0,
        outstanding: Math.round(outstanding * 100) / 100,
        pending,
        count
    };
};

const listPayments = async (req, res, next) => {
    try {
        const { page, limit, skip } = getPagination(req.query);
        const { search, status } = req.query;

        const filter = {};

        if (status && status !== "all") filter.status = status;

        if (search && String(search).trim()) {
            const rx = searchRegExp(search);

            const userIds = await User.find({
                role: "trainee",
                $or: [
                    { firstName: rx },
                    { lastName: rx },
                    { email: rx }
                ]
            }).distinct("_id");

            filter.$or = [
                { paymentRef: rx },
                { reference: rx },
                { user: { $in: userIds } }
            ];
        }

        const [total, payments, summary] = await Promise.all([
            Payment.countDocuments(filter),
            Payment.find(filter)
                .populate("user", "firstName lastName email")
                .populate("program", "name code totalFee")
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit),
            buildPaymentSummary()
        ]);

        return res.status(200).json({
            success: true,
            count: payments.length,
            ...paginationMeta(total, { page, limit }),
            summary,
            payments
        });
    } catch (error) {
        return next(error);
    }
};

const recordPayment = async (req, res, next) => {
    try {
        const {
            userId,
            amount,
            paymentDate,
            method,
            reference,
            remarks,
            status
        } = req.body;

        if (!mongoose.Types.ObjectId.isValid(userId)) {
            return res.status(400).json({
                success: false,
                message: "Choose the trainee this payment belongs to.",
                field: "userId",
                code: "INVALID_TRAINEE"
            });
        }

        const trainee = await User.findOne({ _id: userId, role: "trainee" });

        if (!trainee) {
            return res.status(404).json({
                success: false,
                message: "Trainee account not found.",
                field: "userId",
                code: "NOT_FOUND"
            });
        }

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

        const balance = await getTraineeBalance(userId);

        if (balance.totalFee <= 0) {
            return res.status(400).json({
                success: false,
                message: "This trainee has no program fee assigned yet.",
                code: "NO_PROGRAM"
            });
        }

        if (parsedAmount > balance.balance) {
            return res.status(400).json({
                success: false,
                message: `That amount exceeds the trainee's remaining balance of ${balance.balance.toFixed(2)}.`,
                field: "amount",
                code: "AMOUNT_EXCEEDS_BALANCE"
            });
        }

        const finalStatus = status === "Verified" ? "Verified" : "Pending";
        const profile = await TraineeProfile.findOne({ user: trainee._id });

        const payment = await Payment.create({
            user: trainee._id,
            program: profile?.program || balance.program?._id || null,
            amount: parsedAmount,
            paymentDate: parsedDate,
            method,
            reference: String(reference || "").trim(),
            remarks: String(remarks || "").trim(),
            paymentRef: await nextPaymentRef(),
            status: finalStatus,
            verifiedBy: finalStatus === "Verified" ? req.user.id : null,
            verifiedAt: finalStatus === "Verified" ? new Date() : null
        });

        await payment.populate("user", "firstName lastName email");
        await payment.populate("program", "name code totalFee");

        return res.status(201).json({
            success: true,
            message:
                finalStatus === "Verified"
                    ? "Payment recorded and verified."
                    : "Payment recorded and awaiting verification.",
            payment
        });
    } catch (error) {
        return next(error);
    }
};

const verifyPayment = async (req, res, next) => {
    try {
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
            return res.status(400).json({
                success: false,
                message: "That payment identifier is not valid.",
                code: "INVALID_ID"
            });
        }

        const payment = await Payment.findById(req.params.id);

        if (!payment) {
            return res.status(404).json({
                success: false,
                message: "Payment not found.",
                code: "NOT_FOUND"
            });
        }

        if (payment.status !== "Pending") {
            return res.status(409).json({
                success: false,
                message: `This payment is already ${payment.status.toLowerCase()}.`,
                code: "ALREADY_DECIDED"
            });
        }

        payment.status = "Verified";
        payment.verifiedBy = req.user.id;
        payment.verifiedAt = new Date();

        if (req.body.remarks !== undefined) {
            payment.remarks = String(req.body.remarks).trim();
        }

        await payment.save();
        await payment.populate("user", "firstName lastName email");
        await payment.populate("program", "name code totalFee");

        return res.status(200).json({
            success: true,
            message: "Payment verified.",
            payment
        });
    } catch (error) {
        return next(error);
    }
};

const rejectPayment = async (req, res, next) => {
    try {
        const remarks = String(req.body.remarks || "").trim();

        if (!remarks) {
            return res.status(400).json({
                success: false,
                message: "Give a reason for rejecting this payment.",
                field: "remarks",
                code: "MISSING_REASON"
            });
        }

        if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
            return res.status(400).json({
                success: false,
                message: "That payment identifier is not valid.",
                code: "INVALID_ID"
            });
        }

        const payment = await Payment.findById(req.params.id);

        if (!payment) {
            return res.status(404).json({
                success: false,
                message: "Payment not found.",
                code: "NOT_FOUND"
            });
        }

        if (payment.status !== "Pending") {
            return res.status(409).json({
                success: false,
                message: `This payment is already ${payment.status.toLowerCase()}.`,
                code: "ALREADY_DECIDED"
            });
        }

        payment.status = "Rejected";
        payment.remarks = remarks;
        payment.verifiedBy = req.user.id;
        payment.verifiedAt = new Date();

        await payment.save();

        // Best effort: a missing token or remote failure must not fail the decision.
        if (payment.receiptKey) {
            await deleteReceipt(payment.receiptKey).catch(() => {});
        }

        await payment.populate("user", "firstName lastName email");
        await payment.populate("program", "name code totalFee");

        return res.status(200).json({
            success: true,
            message: "Payment rejected.",
            payment
        });
    } catch (error) {
        return next(error);
    }
};

const getTraineePayments = async (req, res, next) => {
    try {
        const { userId } = req.params;

        if (!mongoose.Types.ObjectId.isValid(userId)) {
            return res.status(400).json({
                success: false,
                message: "That trainee identifier is not valid.",
                code: "INVALID_ID"
            });
        }

        const [payments, balance] = await Promise.all([
            Payment.find({ user: userId })
                .populate("program", "name code totalFee")
                .sort({ createdAt: -1 }),
            getTraineeBalance(userId)
        ]);

        return res.status(200).json({
            success: true,
            count: payments.length,
            summary: {
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

module.exports = {
    listPayments,
    recordPayment,
    verifyPayment,
    rejectPayment,
    getTraineePayments,
    buildPaymentSummary
};
