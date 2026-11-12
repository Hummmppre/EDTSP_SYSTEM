const User = require("../models/User");
const TraineeProfile = require("../models/TraineeProfile");
const Assessment = require("../models/Assessment");
const Cow = require("../models/Cow");
const MaintenanceActivity = require("../models/MaintenanceActivity");
const Payment = require("../models/Payment");

const { getVerifiedTotalsByUser } = require("../utils/balances");

const countByEnrollment = (profiles, status) =>
    profiles.filter((profile) => profile.enrollmentStatus === status).length;

const getSummary = async (req, res, next) => {
    try {
        const [
            totalTrainees,
            activeTrainees,
            profiles,
            totalAssessments,
            pendingAssessments,
            gradedAssessments,
            scoreAggregate,
            totalCows,
            activitiesPending,
            paymentsPending,
            verifiedAggregate,
            paidByUser,
            recentAssessments
        ] = await Promise.all([
            User.countDocuments({ role: "trainee" }),
            User.countDocuments({ role: "trainee", status: "active" }),
            TraineeProfile.find().populate("program", "totalFee"),
            Assessment.countDocuments(),
            Assessment.countDocuments({ status: "Pending" }),
            Assessment.countDocuments({ status: "Graded" }),
            Assessment.aggregate([
                { $match: { status: "Graded", score: { $ne: null } } },
                {
                    $group: {
                        _id: null,
                        average: {
                            $avg: {
                                $multiply: [
                                    { $divide: ["$score", "$totalScore"] },
                                    100
                                ]
                            }
                        }
                    }
                }
            ]),
            Cow.countDocuments(),
            MaintenanceActivity.countDocuments({ status: "Pending" }),
            Payment.countDocuments({ status: "Pending" }),
            Payment.aggregate([
                { $match: { status: "Verified" } },
                { $group: { _id: null, total: { $sum: "$amount" } } }
            ]),
            getVerifiedTotalsByUser(),
            Assessment.find()
                .populate("user", "firstName lastName email")
                .sort({ createdAt: -1 })
                .limit(5)
        ]);

        const outstanding = profiles.reduce((sum, profile) => {
            const totalFee =
                profile.program && typeof profile.program === "object"
                    ? Number(profile.program.totalFee) || 0
                    : 0;

            const paid = paidByUser.get(String(profile.user)) || 0;

            return sum + Math.max(totalFee - paid, 0);
        }, 0);

        const averageScore = scoreAggregate.length
            ? Math.round(scoreAggregate[0].average * 10) / 10
            : 0;

        return res.status(200).json({
            success: true,
            summary: {
                totalTrainees,
                activeTrainees,
                pendingEnrolment: countByEnrollment(profiles, "Pending"),
                completedTraining: countByEnrollment(profiles, "Completed"),
                totalAssessments,
                pendingAssessments,
                gradedAssessments,
                averageScore,
                totalCows,
                activitiesPending,
                collected: verifiedAggregate.length ? verifiedAggregate[0].total : 0,
                outstanding: Math.round(outstanding * 100) / 100,
                paymentsPending
            },
            recentAssessments: recentAssessments.map((item) => ({
                _id: item._id,
                assessmentTitle: item.assessmentTitle,
                subject: item.subject,
                assessmentType: item.assessmentType,
                user: item.user,
                score: item.score,
                totalScore: item.totalScore,
                status: item.status,
                assessmentDate: item.assessmentDate,
                createdAt: item.createdAt
            }))
        });
    } catch (error) {
        return next(error);
    }
};

module.exports = { getSummary };
