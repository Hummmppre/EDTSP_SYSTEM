const mongoose = require("mongoose");

const TrainingApplication = require("../models/TrainingApplication");
const TraineeProfile = require("../models/TraineeProfile");
const Program = require("../models/Program");
const User = require("../models/User");
const Payment = require("../models/Payment");

const roundMoney = value => Math.round(Number(value || 0) * 100) / 100;

function deriveStatus(fee, amountPaid, needsProgram) {
    if (needsProgram) return "Unpaid";
    if (fee === 0) return "Fully Paid";
    if (amountPaid >= fee) return "Fully Paid";
    if (amountPaid > 0) return "Partial";
    return "Unpaid";
}

function accountKey(userId, programId) {
    return `${userId}:${programId || "none"}`;
}

function normalizeName(value) {
    return String(value || "").trim().toLowerCase();
}

// One payment account per trainee and program. Enrolment (an Ongoing trainee
// profile) is the source of truth, so a trainee can be billed as soon as they
// are enrolled and does not need an approved application. Trainees who already
// have recorded payments are always included as well, so money already
// collected never disappears from the ledger.
async function buildPaymentAccounts(userId) {
    const userFilter = userId ? new mongoose.Types.ObjectId(String(userId)) : null;

    const profileFilter = { enrollmentStatus: "Ongoing" };

    if (userFilter) profileFilter.user = userFilter;

    const enrolledProfiles = await TraineeProfile.find(profileFilter)
        .select("user traineeId program enrollmentStatus")
        .lean();

    const programs = await Program.find().select("name fee").lean();
    const programByName = new Map(
        programs.map(program => [normalizeName(program.name), program])
    );

    const paidTotals = await Payment.aggregate([
        ...(userFilter ? [{ $match: { user: userFilter } }] : []),
        {
            $group: {
                _id: { user: "$user", program: "$program" },
                amountPaid: { $sum: "$amount" },
                paymentCount: { $sum: 1 }
            }
        }
    ]);

    const paidByKey = new Map(
        paidTotals.map(item => [
            accountKey(String(item._id.user), item._id.program ? String(item._id.program) : null),
            { amountPaid: roundMoney(item.amountPaid), paymentCount: item.paymentCount }
        ])
    );

    // Enrolled accounts, keyed by trainee + program.
    const accounts = new Map();

    enrolledProfiles.forEach(profile => {
        const traineeKey = String(profile.user);
        const program = programByName.get(normalizeName(profile.program)) || null;
        const key = accountKey(traineeKey, program ? String(program._id) : null);

        if (accounts.has(key)) return;

        accounts.set(key, {
            key,
            userId: traineeKey,
            traineeId: profile.traineeId || null,
            enrollmentStatus: profile.enrollmentStatus || "Ongoing",
            notEnrolled: false,
            program
        });
    });

    // Payments recorded for a trainee who is no longer Ongoing (or for a pair
    // whose enrolment row is missing) still get an account.
    const missingUserIds = [];

    paidByKey.forEach((totals, key) => {
        if (accounts.has(key)) return;

        const [traineeKey, programId] = key.split(":");
        const program = programId && programId !== "none"
            ? programs.find(item => String(item._id) === programId) || null
            : null;

        accounts.set(key, {
            key,
            userId: traineeKey,
            traineeId: null,
            enrollmentStatus: null,
            notEnrolled: true,
            program
        });
        missingUserIds.push(traineeKey);
    });

    const userIds = Array.from(new Set(Array.from(accounts.values()).map(item => item.userId)));

    const [users, profiles] = await Promise.all([
        userIds.length
            ? User.find({ _id: { $in: userIds } }).select("firstName lastName email").lean()
            : [],
        userIds.length
            ? TraineeProfile.find({ user: { $in: userIds } })
                .select("user traineeId program enrollmentStatus")
                .lean()
            : []
    ]);

    const userById = new Map(users.map(user => [String(user._id), user]));
    const profileByUser = new Map(
        profiles.map(profile => [String(profile.user), profile])
    );

    const programIds = Array.from(
        new Set(
            Array.from(accounts.values())
                .map(item => (item.program ? String(item.program._id) : null))
                .filter(Boolean)
        )
    );

    const applications = programIds.length
        ? await TrainingApplication.find({
            user: { $in: userIds },
            program: { $in: programIds },
            status: "Approved"
        })
            .sort({ decidedAt: -1, submittedAt: -1 })
            .select("user program")
            .lean()
        : [];

    const applicationByKey = new Map();

    applications.forEach(application => {
        const key = accountKey(String(application.user), String(application.program));

        if (!applicationByKey.has(key)) applicationByKey.set(key, application);
    });

    const rows = Array.from(accounts.values()).map(entry => {
        const user = userById.get(entry.userId) || {};
        const profile = profileByUser.get(entry.userId) || {};
        const program = entry.program;
        const totals = paidByKey.get(entry.key) || { amountPaid: 0, paymentCount: 0 };
        const fee = program && Number.isFinite(program.fee) ? roundMoney(program.fee) : 0;
        const needsProgram = !program;
        const balance = roundMoney(Math.max(fee - totals.amountPaid, 0));
        const firstName = user.firstName || "";
        const lastName = user.lastName || "";
        const application = applicationByKey.get(entry.key) || null;

        return {
            id: entry.key,
            applicationId: application ? String(application._id) : null,
            userId: entry.userId,
            traineeId: entry.traineeId || profile.traineeId || null,
            firstName,
            lastName,
            fullName: `${firstName} ${lastName}`.trim() || "Unknown trainee",
            email: user.email || "",
            programId: program ? String(program._id) : null,
            programName: program ? program.name : "",
            enrollmentStatus: entry.enrollmentStatus || profile.enrollmentStatus || null,
            notEnrolled: entry.notEnrolled,
            fee,
            amountPaid: totals.amountPaid,
            paymentCount: totals.paymentCount,
            balance,
            status: deriveStatus(fee, totals.amountPaid, needsProgram),
            needsProgram
        };
    });

    rows.sort((a, b) =>
        a.fullName.localeCompare(b.fullName) ||
        a.programName.localeCompare(b.programName)
    );

    return { accounts: rows, summary: summarizeAccounts(rows) };
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
        const key = account.userId || account.id;
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
