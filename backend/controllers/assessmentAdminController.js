
const mongoose = require("mongoose");
const Assessment = require("../models/Assessment");
const User = require("../models/User");
const {
    sendAssessmentAssigned,
    sendAssessmentGraded
} = require("../lib/mailer");
const {
    currentVersionOf,
    readExpectedVersion,
    sendVersionConflict,
    versionFilter
} = require("../lib/versioning");
const { notifyRecordUpdated } = require("../lib/realtime");

// ADMIN: Create and assign an assessment
const createAssessment = async (req, res) => {
    try {
        const {
    traineeIds,
    assessmentTitle,
    subject,
    assessmentType,
    totalScore,
    assessmentDate,
    dueDate,
    remarks
} = req.body || {};
        // Validate required fields
        if (
            !Array.isArray(traineeIds) ||
            traineeIds.length === 0 ||
            !assessmentTitle ||
            !subject ||
            totalScore === undefined
        ) {
            return res.status(400).json({
                success: false,
                message: "Please provide trainees, title, subject, and total score."
            });
        }

        if (
            !Number.isFinite(Number(totalScore)) ||
            Number(totalScore) < 1
        ) {
            return res.status(400).json({
                success: false,
                message: "Total score must be at least 1."
            });
        }

        // Validate trainee IDs
        const invalidIds = traineeIds.filter(
            id => !mongoose.Types.ObjectId.isValid(id)
        );

        if (invalidIds.length > 0) {
            return res.status(400).json({
                success: false,
                message: "One or more trainee IDs are invalid."
            });
        }

        // Find valid trainee accounts
        const trainees = await User.find({
            _id: { $in: traineeIds },
            role: "trainee",
            status: "active"
        }).select("_id firstName lastName email");

        if (trainees.length !== new Set(traineeIds.map(String)).size) {
            return res.status(400).json({
                success: false,
                message: "Some trainee accounts do not exist or are inactive."
            });
        }
            // Create one assessment record for each trainee
            const assessments = await Assessment.insertMany(
                trainees.map(trainee => ({
                    user: trainee._id,
                    assessmentTitle: assessmentTitle.trim(),
                    subject: subject.trim(),
                    assessmentType: assessmentType || "",
                    totalScore: Number(totalScore),
                    assessmentDate: assessmentDate || null,
                    dueDate: dueDate || null,
                    remarks: remarks || "",
                    status: "Pending"
                })),
                { ordered: false }
            );

        // Notify each trainee; a failed email never blocks the assignment.
        const notifications = await Promise.all(
            assessments.map(assessment => {
                const trainee = trainees.find(
                    item => String(item._id) === String(assessment.user)
                );

                if (!trainee) return { sent: false };

                return sendAssessmentAssigned({
                    to: trainee.email,
                    name: `${trainee.firstName} ${trainee.lastName}`,
                    assessmentTitle: assessment.assessmentTitle,
                    subject: assessment.subject,
                    assessmentDate: assessment.assessmentDate,
                    totalScore: assessment.totalScore
                });
            })
        );

        return res.status(201).json({
            success: true,
            message: "Assessment assigned successfully.",
            count: assessments.length,
            mail: { sent: notifications.filter(result => result.sent).length },
            assessments
        });

    } catch (error) {
        console.error("Create assessment error:", error);

        return res.status(500).json({
            success: false,
            message: "Unable to create or assign assessment."
        });
    }
};

   // ADMIN: View all assessment records and summary
const getAllAssessments = async (req, res) => {
    try {
        const assessments = await Assessment.find()
            .populate("user", "firstName lastName email")
            .sort({ createdAt: -1 });

        const totalAssessments = assessments.length;

        const pendingAssessments = assessments.filter(
            assessment => assessment.status === "Pending"
        ).length;

        const gradedAssessments = assessments.filter(
            assessment => assessment.status === "Graded"
        ).length;

        const gradedRecords = assessments.filter(
            assessment =>
                assessment.status === "Graded" &&
                assessment.score !== null &&
                assessment.score !== undefined
        );

        const averageScore = gradedRecords.length > 0
            ? gradedRecords.reduce(
                (total, assessment) =>
                    total + (assessment.score / assessment.totalScore) * 100,
                0
            ) / gradedRecords.length
            : 0;

        return res.status(200).json({
            success: true,
            count: totalAssessments,
            assessments,
            summary: {
                totalAssessments,
                pendingAssessments,
                gradedAssessments,
                averageScore: Number(averageScore.toFixed(1))
            }
        });

    } catch (error) {
        console.error("Get all assessments error:", error);

        return res.status(500).json({
            success: false,
            message: "Unable to retrieve assessments."
        });
    }
};


// ADMIN: Retrieve all active trainee accounts
const getAllTrainees = async (req, res) => {
    try {
        const trainees = await User.find({
            role: "trainee",
            status: "active"
        })
        .select("_id firstName lastName email")
        .sort({ firstName: 1 });

        return res.status(200).json({
            success: true,
            count: trainees.length,
            trainees
        });

    } catch (error) {
        console.error("Get trainees error:", error);

        return res.status(500).json({
            success: false,
            message: "Unable to retrieve trainee accounts."
        });
    }
};


// ADMIN: Grade an assessment
const gradeAssessment = async (req, res) => {
    try {
        const { score, remarks } = req.body || {};
        const expectedVersion = readExpectedVersion(req.body);

        if (expectedVersion.invalid) {
            return res.status(400).json({
                success: false,
                message: "Version must be a non-negative integer."
            });
        }

        if (
            score === undefined ||
            !Number.isFinite(Number(score)) ||
            Number(score) < 0
        ) {
            return res.status(400).json({
                success: false,
                message: "Please provide a valid score."
            });
        }

        if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
            return res.status(404).json({
                success: false,
                message: "Assessment not found."
            });
        }

        const assessment = await Assessment.findById(req.params.id);

        if (!assessment) {
            return res.status(404).json({
                success: false,
                message: "Assessment not found."
            });
        }

        if (Number(score) > assessment.totalScore) {
            return res.status(400).json({
                success: false,
                message: "Score cannot exceed the total score."
            });
        }

        // Compare-and-set: only the version the admin read may be updated, and
        // the same write advances it. A parallel edit gets null here.
        const update = {
            $set: {
                score: Number(score),
                status: "Graded"
            },
            $inc: { __v: 1 }
        };

        if (remarks !== undefined) {
            update.$set.remarks = remarks;
        }

        const graded = await Assessment.findOneAndUpdate(
            { _id: assessment._id, ...versionFilter(expectedVersion.value) },
            update,
            { new: true, runValidators: true }
        );

        if (!graded) {
            const current = await Assessment.findById(assessment._id).lean();

            return sendVersionConflict(res, {
                currentVersion: currentVersionOf(current),
                current
            });
        }

        notifyRecordUpdated({
            resource: "assessment",
            id: String(graded._id),
            version: currentVersionOf(graded),
            actorId: req.user && req.user.id
        });

        const trainee = await User.findById(graded.user).select(
            "firstName lastName email"
        );

        const mail = trainee
            ? await sendAssessmentGraded({
                to: trainee.email,
                name: `${trainee.firstName} ${trainee.lastName}`,
                assessmentTitle: graded.assessmentTitle,
                subject: graded.subject,
                score: graded.score,
                totalScore: graded.totalScore,
                remarks: graded.remarks
            })
            : { sent: false };

        return res.status(200).json({
            success: true,
            message: "Assessment graded successfully.",
            mail: { sent: Boolean(mail.sent) },
            assessment: graded
        });

    } catch (error) {
        console.error("Grade assessment error:", error);

        return res.status(500).json({
            success: false,
            message: "Unable to grade assessment."
        });
    }
};

module.exports = {
    createAssessment,
    getAllAssessments,
    getAllTrainees,
    gradeAssessment
};
