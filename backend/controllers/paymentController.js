const Payment = require("../models/Payment");
const {
    buildPaymentAccounts,
    deriveStatus,
    roundMoney
} = require("../lib/paymentAccounts");

// TRAINEE: own fee, payments, and balance across every approved program
const getMyPayments = async (req, res) => {
    try {
        const { accounts } = await buildPaymentAccounts(req.user.id);
        const totalFee = roundMoney(accounts.reduce((sum, account) => sum + account.fee, 0));
        const totalPaid = roundMoney(
            accounts.reduce((sum, account) => sum + account.amountPaid, 0)
        );
        const balance = roundMoney(
            accounts.reduce((sum, account) => sum + account.balance, 0)
        );
        const needsProgram = accounts.some(account => account.needsProgram);

        const payments = await Payment.find({ user: req.user.id })
            .populate("program", "name")
            .sort({ paymentDate: -1, createdAt: -1 })
            .lean();

        return res.status(200).json({
            success: true,
            hasAccounts: accounts.length > 0,
            summary: {
                totalFee,
                totalPaid,
                balance,
                status: accounts.length
                    ? deriveStatus(totalFee, totalPaid, needsProgram)
                    : "Unpaid",
                accountCount: accounts.length
            },
            accounts,
            payments: payments.map(payment => ({
                id: String(payment._id),
                receiptNumber: payment.receiptNumber,
                programName: payment.program ? payment.program.name : "",
                amount: roundMoney(payment.amount),
                method: payment.method,
                paymentDate: payment.paymentDate,
                referenceNumber: payment.referenceNumber || "",
                remarks: payment.remarks || ""
            }))
        });

    } catch (error) {
        console.error("Get trainee payments error:", error);

        return res.status(500).json({
            success: false,
            message: "Unable to retrieve your payment records."
        });
    }
};

module.exports = {
    getMyPayments
};
