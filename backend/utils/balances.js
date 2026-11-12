const mongoose = require("mongoose");
const Payment = require("../models/Payment");
const TraineeProfile = require("../models/TraineeProfile");
const { serializeProfile } = require("./serializers");

const paymentStatusFor = (totalFee, paid) => {
    if (paid <= 0) return "Unpaid";
    if (paid >= totalFee) return "Fully Paid";
    return "Partial";
};

/**
 * Fee standing for one trainee: program snapshot, verified total, balance.
 */
const getTraineeBalance = async (userId, options = {}) => {
    const profile = await (options.profilePromise ||
        TraineeProfile.findOne({ user: userId }).populate("program"));

    const totalFee = profile && profile.program && typeof profile.program === "object"
        ? Number(profile.program.totalFee) || 0
        : 0;

    const result = await Payment.aggregate([
        {
            $match: {
                user: new mongoose.Types.ObjectId(String(userId)),
                status: "Verified"
            }
        },
        { $group: { _id: null, paid: { $sum: "$amount" } } }
    ]);

    const paid = result.length ? Number(result[0].paid) || 0 : 0;

    return {
        program: serializeProfile(profile)?.program || null,
        programName: serializeProfile(profile)?.programName || "",
        totalFee,
        paid,
        balance: Math.max(totalFee - paid, 0),
        status: paymentStatusFor(totalFee, paid),
        profile
    };
};

/**
 * Verified totals for every trainee, keyed by user id (string).
 * Uses a single aggregation so the admin summary stays cheap.
 */
const getVerifiedTotalsByUser = async () => {
    const rows = await Payment.aggregate([
        { $match: { status: "Verified" } },
        {
            $group: {
                _id: "$user",
                paid: { $sum: "$amount" }
            }
        }
    ]);

    const map = new Map();

    rows.forEach((row) => {
        map.set(String(row._id), Number(row.paid) || 0);
    });

    return map;
};

module.exports = {
    getTraineeBalance,
    getVerifiedTotalsByUser,
    paymentStatusFor
};
