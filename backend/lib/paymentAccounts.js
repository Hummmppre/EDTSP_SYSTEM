const TrainingApplication = require("../models/TrainingApplication");
const TraineeProfile = require("../models/TraineeProfile");
const Payment = require("../models/Payment");

const roundMoney = value => Math.round(Number(value || 0) * 100) / 100;

function deriveStatus(fee, amountPaid, needsProgram) {
    if (needsProgram) return "Unpaid";
    if (fee === 0) return "Fully Paid";
    if (amountPaid >= fee) return "Fully Paid";
    if (amountPaid > 0) return "Partial";
    return "Unpaid";
}

// One payment account per approved application. When the same trainee has two
// approved applications for the same program, only the newest becomes an
// account so the fee is not billed twice.
async function buildPaymentAccounts(userId) {
    const filter = { status: "Approved" };

    if (userId) filter.user = userId;

    const applications = await TrainingApplication.find(filter)
        .populate("user", "firstName lastName email")
        .populate("program", "name fee")
        .sort({ decidedAt: -1, submittedAt: -1 })
        .lean();

    const seen = new Set();
    const selected = [];

    for (const application of applications) {
        const userKey = String(
            (application.user && application.user._id) ||
            application.user ||
            application._id
        );
        const programKey = application.program
            ? String(application.program._id)
            : `missing-${application._id}`;
        const key = `${userKey}:${programKey}`;

        if (seen.has(key)) continue;

        seen.add(key);
        selected.push(application);
    }

    const paidTotals = selected.length
        ? await Payment.aggregate([
            { $match: { application: { $in: selected.map(item => item._id) } } },
            { $group: { _id: "$application", amountPaid: { $sum: "$amount" } } }
        ])
        : [];

    const paidByApplication = new Map(
        paidTotals.map(item => [String(item._id), item.amountPaid])
    );

    const userIds = selected
        .map(item => item.user && item.user._id)
        .filter(Boolean);

    const profiles = userIds.length
        ? await TraineeProfile.find({ user: { $in: userIds } })
            .select("user traineeId")
            .lean()
        : [];

    const traineeIdByUser = new Map(
        profiles.map(profile => [String(profile.user), profile.traineeId || null])
    );

    const accounts = selected.map(application => {
        const user = application.user || {};
        const program = application.program || null;
        const fee = program && Number.isFinite(program.fee) ? roundMoney(program.fee) : 0;
        const amountPaid = roundMoney(paidByApplication.get(String(application._id)) || 0);
        const needsProgram = !program;
        const balance = roundMoney(Math.max(fee - amountPaid, 0));
        const firstName = user.firstName || application.firstName || "";
        const lastName = user.lastName || application.lastName || "";

        return {
            applicationId: String(application._id),
            userId: user._id ? String(user._id) : null,
            traineeId: user._id ? traineeIdByUser.get(String(user._id)) || null : null,
            firstName,
            lastName,
            fullName: `${firstName} ${lastName}`.trim() || "Unknown trainee",
            email: user.email || application.email || "",
            programId: program ? String(program._id) : null,
            programName: program ? program.name : "",
            fee,
            amountPaid,
            balance,
            status: deriveStatus(fee, amountPaid, needsProgram),
            needsProgram
        };
    });

    accounts.sort((a, b) =>
        a.fullName.localeCompare(b.fullName) ||
        a.programName.localeCompare(b.programName)
    );

    return { accounts, summary: summarizeAccounts(accounts) };
}

function summarizeAccounts(accounts) {
    const totalFees = roundMoney(accounts.reduce((sum, account) => sum + account.fee, 0));
    const totalCollected = roundMoney(
        accounts.reduce((sum, account) => sum + account.amountPaid, 0)
    );
    const outstandingBalance = roundMoney(
        accounts.reduce((sum, account) => sum + account.balance, 0)
    );

    // A trainee is fully paid only when every account they hold is settled.
    const fullyPaidByUser = new Map();

    accounts.forEach(account => {
        const key = account.userId || account.applicationId;
        const entry = fullyPaidByUser.get(key) || { fullyPaid: true };

        if (account.status !== "Fully Paid") entry.fullyPaid = false;

        fullyPaidByUser.set(key, entry);
    });

    return {
        totalFees,
        totalCollected,
        outstandingBalance,
        fullyPaidTrainees: Array.from(fullyPaidByUser.values())
            .filter(entry => entry.fullyPaid).length,
        accountCount: accounts.length,
        traineeCount: fullyPaidByUser.size
    };
}

module.exports = {
    buildPaymentAccounts,
    summarizeAccounts,
    deriveStatus,
    roundMoney
};
