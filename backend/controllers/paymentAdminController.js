const mongoose = require("mongoose");

const Payment = require("../models/Payment");
const Counter = require("../models/Counter");
const {
    buildPaymentAccounts,
    roundMoney
} = require("../lib/paymentAccounts");

const PAYMENT_METHODS = ["Cash", "Bank Transfer", "GCash", "Other"];
const METHODS_REQUIRING_REFERENCE = ["GCash", "Bank Transfer"];
const RECENT_PAYMENT_LIMIT = 20;

async function nextReceiptNumber() {
    const year = new Date().getFullYear();

    const counter = await Counter.findOneAndUpdate(
        { _id: `payment-${year}` },
        { $inc: { seq: 1 } },
        { upsert: true, new: true }
    );

    return `PAY-${year}-${String(counter.seq).padStart(3, "0")}`;
}

function traineeIdMap(accounts) {
    return new Map(
        accounts
            .filter(account => account.userId)
            .map(account => [account.userId, account.traineeId])
    );
}

function toTransaction(payment, accounts) {
    const user = payment.user || {};
    const firstName = user.firstName || "";
    const lastName = user.lastName || "";
    const id = user._id ? String(user._id) : null;

    return {
        id: String(payment._id),
        receiptNumber: payment.receiptNumber,
        traineeName: `${firstName} ${lastName}`.trim() || "Unknown trainee",
        traineeId: id ? accounts.traineeIdByUser.get(id) || null : null,
        programName: payment.program ? payment.program.name : "",
        amount: roundMoney(payment.amount),
        method: payment.method,
        paymentDate: payment.paymentDate,
        referenceNumber: payment.referenceNumber || "",
        remarks: payment.remarks || ""
    };
}

// ADMIN: payment accounts, ledger totals, and the latest transactions
const listPayments = async (req, res) => {
    try {
        const { accounts, summary } = await buildPaymentAccounts();
        const context = { traineeIdByUser: traineeIdMap(accounts) };

        const payments = await Payment.find()
            .populate("user", "firstName lastName")
            .populate("program", "name")
            .sort({ paymentDate: -1, createdAt: -1 })
            .limit(RECENT_PAYMENT_LIMIT)
            .lean();

        return res.status(200).json({
            success: true,
            summary,
            accounts,
            transactions: payments.map(payment => toTransaction(payment, context))
        });

    } catch (error) {
        console.error("Get payments error:", error);

        return res.status(500).json({
            success: false,
            message: "Unable to retrieve payment records."
        });
    }
};

function findAccount(accounts, accountId) {
    const value = String(accountId || "");

    return accounts.find(
        item => item.id === value || (item.applicationId && item.applicationId === value)
    ) || null;
}

function accountPaymentFilter(account) {
    return {
        user: new mongoose.Types.ObjectId(account.userId),
        program: account.programId
            ? new mongoose.Types.ObjectId(account.programId)
            : null
    };
}

// ADMIN: one trainee account with its full payment history
const getPaymentAccount = async (req, res) => {
    try {
        const { accounts } = await buildPaymentAccounts();
        const account = findAccount(accounts, req.params.accountId);

        if (!account) {
            return res.status(404).json({
                success: false,
                message: "Payment account not found."
            });
        }

        const payments = await Payment.find(accountPaymentFilter(account))
            .populate("user", "firstName lastName")
            .populate("program", "name")
            .sort({ paymentDate: -1, createdAt: -1 })
            .lean();

        const context = { traineeIdByUser: traineeIdMap(accounts) };

        return res.status(200).json({
            success: true,
            account,
            payments: payments.map(payment => toTransaction(payment, context))
        });

    } catch (error) {
        console.error("Get payment account error:", error);

        return res.status(500).json({
            success: false,
            message: "Unable to retrieve this payment account."
        });
    }
};

// ADMIN: record a payment for an enrolled trainee account
const recordPayment = async (req, res) => {
    try {
        const {
            accountId,
            applicationId,
            amount,
            paymentDate,
            method,
            referenceNumber,
            remarks
        } = req.body || {};

        const requestedAccount = String(accountId || applicationId || "").trim();

        if (!requestedAccount) {
            return res.status(400).json({
                success: false,
                message: "Please choose a trainee account."
            });
        }

        const { accounts } = await buildPaymentAccounts();
        const account = findAccount(accounts, requestedAccount);

        if (!account) {
            return res.status(404).json({
                success: false,
                message: "Payment account not found."
            });
        }

        if (account.needsProgram) {
            return res.status(400).json({
                success: false,
                message: "Assign this trainee to a program before recording a payment."
            });
        }

        const parsedAmount = roundMoney(amount);

        if (!Number.isFinite(parsedAmount) || parsedAmount < 0.01) {
            return res.status(400).json({
                success: false,
                message: "Enter a valid payment amount."
            });
        }

        const parsedDate = new Date(paymentDate);

        if (!paymentDate || Number.isNaN(parsedDate.getTime())) {
            return res.status(400).json({
                success: false,
                message: "Enter a valid payment date."
            });
        }

        const now = new Date();
        const endOfToday = new Date(
            now.getFullYear(),
            now.getMonth(),
            now.getDate(),
            23,
            59,
            59,
            999
        );

        if (parsedDate > endOfToday) {
            return res.status(400).json({
                success: false,
                message: "Payment date cannot be in the future."
            });
        }

        if (!PAYMENT_METHODS.includes(method)) {
            return res.status(400).json({
                success: false,
                message: "Choose a valid payment method."
            });
        }

        const reference = String(referenceNumber || "").trim();

        if (METHODS_REQUIRING_REFERENCE.includes(method) && !reference) {
            return res.status(400).json({
                success: false,
                message: "A reference number is required for GCash and bank transfers."
            });
        }

        if (reference.length > 100) {
            return res.status(400).json({
                success: false,
                message: "The reference number must be 100 characters or fewer."
            });
        }

        const cleanRemarks = String(remarks || "").trim();

        if (cleanRemarks.length > 500) {
            return res.status(400).json({
                success: false,
                message: "Remarks must be 500 characters or fewer."
            });
        }

        const payment = await createPayment({
            application: account.applicationId || null,
            user: account.userId,
            program: account.programId,
            amount: parsedAmount,
            paymentDate: parsedDate,
            method,
            referenceNumber: reference,
            remarks: cleanRemarks,
            recordedBy: req.user && req.user.id
        });

        const refreshed = await buildPaymentAccounts();

        return res.status(201).json({
            success: true,
            message: "Payment recorded successfully.",
            payment,
            account: findAccount(refreshed.accounts, requestedAccount),
            summary: refreshed.summary
        });

    } catch (error) {
        console.error("Record payment error:", error);

        return res.status(500).json({
            success: false,
            message: "Unable to record this payment."
        });
    }
};

// A unique index race on receiptNumber is the only expected duplicate here.
async function createPayment(values) {
    for (let attempt = 0; attempt < 2; attempt += 1) {
        try {
            return await Payment.create({
                ...values,
                receiptNumber: await nextReceiptNumber()
            });
        } catch (error) {
            if (error && error.code === 11000 && attempt === 0) continue;

            throw error;
        }
    }
}

module.exports = {
    listPayments,
    getPaymentAccount,
    recordPayment
};
