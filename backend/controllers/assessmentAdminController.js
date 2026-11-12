const mongoose = require("mongoose");

const Assessment = require("../models/Assessment");
const User = require("../models/User");
const TraineeProfile = require("../models/TraineeProfile");

const { getPagination, paginationMeta } = require("../utils/pagination");
const { searchRegExp, parseDateOnly } = require("../utils/dates");
const { ASSESSMENT_TYPES } = require("../models/Assessment");

const buildSummary = async () => {
    const [total, pending, graded, aggregate] = await Promise.all([
        Assessment.countDocuments(),
        Assessment.countDocuments({ status: "Pending" }),
        Assessment.countDocuments({ status: "Graded" }),
        Assessment.aggregate([
            {
                $match: {
                    status: "Graded",
                    score: { $ne: null }
                }
            },
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
        ])
    ]);

    const average = aggregate.length
        ? Math.round(aggregate[0].average * 10) / 10
        : 0;

    return { total, pending, graded, average };
};

// ADMIN: View all assessment records (paginated, searchable, filterable)
const getAllAssessments = async (req, res, next) => {
    try {
        const { page, limit, skip } = getPagination(req.query);
        const { search, status } = req.query;

        const filter = {};

        if (status && status !== "all") {
            filter.status = status;
        }

        if (search && String(search).trim()) {
            const rx = searchRegExp(search);

            const traineeIds = await User.find({
                role: "trainee",
                $or: [{ firstName: rx }, { lastName: rx }, { email: rx }]
            }).distinct("_id");

            filter.$or = [
                { assessmentTitle: rx },
                { subject: rx },
                { user: { $in: traineeIds } }
            ];
        }

        const [total, assessments, summary] = await Promise.all([
            Assessment.countDocuments(filter),
            Assessment.find(filter)
                .populate("user", "firstName lastName email")
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit),
            buildSummary()
        ]);

        return res.status(200).json({
            success: true,
            count: assessments.length,
            ...paginationMeta(total, { page, limit }),
            summary,
            assessments
        });
    } catch (error) {
        return next(error);
    }
};

// ADMIN: Active trainee accounts for the create-assessment picker
const getAssessmentTrainees = async (req, res, next) => {
    try {
        const { page, limit, skip } = getPagination(req.query, 50);
        const { search } = req.query;

        const filter = { role: "trainee", status: "active" };

        if (search && String(search).trim()) {
            const rx = searchRegExp(search);
            filter.$or = [
                { firstName: rx },
                { lastName: rx },
                { email: rx }
            ];
        }

        const [total, users] = await Promise.all([
            User.countDocuments(filter),
            User.find(filter)
                .select("_id firstName lastName email")
                .sort({ firstName: 1, lastName: 1 })
                .skip(skip)
                .limit(limit)
        ]);

        const profiles = await TraineeProfile.find({
            user: { $in: users.map((user) => user._id) }
        }).select("user traineeId");

        const traineeIdByUser = new Map(
            profiles.map((profile) => [String(profile.user), profile.traineeId])
        );

        const trainees = users.map((user) => ({
            _id: user._id,
            firstName: user.firstName,
            lastName: user.lastName,
            email: user.email,
            traineeId: traineeIdByUser.get(String(user._id)) || null
        }));

        return res.status(200).json({
            success: true,
            count: trainees.length,
            ...paginationMeta(total, { page, limit }),
            trainees
        });
    } catch (error) {
        return next(error);
    }
};

// ADMIN: Create and assign an assessment to one or more trainees
const createAssessment = async (req, res, next) => {
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
        } = req.body;

        if (
            !Array.isArray(traineeIds) ||
            traineeIds.length === 0 ||
            !String(assessmentTitle || "").trim() ||
            !String(subject || "").trim() ||
            totalScore === undefined
        ) {
            return res.status(400).json({
                success: false,
                message: "Please provide trainees, title, subject, and total score.",
                code: "MISSING_FIELD"
            });
        }

        if (!Number.isFinite(Number(totalScore)) || Number(totalScore) < 1) {
            return res.status(400).json({
                success: false,
                message: "Total score must be at least 1.",
                field: "totalScore",
                code: "INVALID_TOTAL_SCORE"
            });
        }

        if (assessmentType && !ASSESSMENT_TYPES.includes(assessmentType)) {
            return res.status(400).json({
                success: false,
                message: "Choose a valid assessment type.",
                field: "assessmentType",
                code: "INVALID_TYPE"
            });
        }

        const uniqueIds = [...new Set(traineeIds.map(String))];

        const invalidIds = uniqueIds.filter(
            (id) => !mongoose.Types.ObjectId.isValid(id)
        );

        if (invalidIds.length > 0) {
            return res.status(400).json({
                success: false,
                message: "One or more trainee IDs are invalid.",
                code: "INVALID_ID"
            });
        }

        const trainees = await User.find({
            _id: { $in: uniqueIds },
            role: "trainee",
            status: "active"
        }).select("_id firstName lastName");

        if (trainees.length !== uniqueIds.length) {
            return res.status(400).json({
                success: false,
                message: "Some trainee accounts do not exist or are inactive.",
                code: "INVALID_TRAINEE"
            });
        }

        const title = String(assessmentTitle).trim();

        // Pre-check duplicates so one existing record never fails the batch.
        const existing = await Assessment.find({
            user: { $in: uniqueIds },
            assessmentTitle: title
        }).select("user");

        const existingIds = new Set(existing.map((item) => String(item.user)));

        const nameById = new Map(
            trainees.map((trainee) => [
                String(trainee._id),
                `${trainee.firstName} ${trainee.lastName}`.trim()
            ])
        );

        const skipped = [...existingIds].map((id) => ({
            user: id,
            name: nameById.get(id) || "Unknown trainee"
        }));

        const candidates = trainees.filter(
            (trainee) => !existingIds.has(String(trainee._id))
        );

        let created = [];

        if (candidates.length > 0) {
            const docs = candidates.map((trainee) => ({
                user: trainee._id,
                assessmentTitle: title,
                subject: String(subject).trim(),
                assessmentType: assessmentType || "Written",
                totalScore: Number(totalScore),
                assessmentDate: parseDateOnly(assessmentDate),
                dueDate: parseDateOnly(dueDate),
                remarks: remarks || "",
                status: "Pending"
            }));

            try {
                created = await Assessment.insertMany(docs, { ordered: false });
            } catch (error) {
                // A concurrent request may have inserted one of these rows.
                if (error.insertedDocs) {
                    created = error.insertedDocs;

                    const createdIds = new Set(
                        created.map((item) => String(item.user))
                    );

                    candidates.forEach((trainee) => {
                        if (!createdIds.has(String(trainee._id))) {
                            skipped.push({
                                user: trainee._id,
                                name: nameById.get(String(trainee._id)) || "Unknown trainee"
                            });
                        }
                    });
                } else if (error.code === 11000) {
                    skipped.push({ user: null, name: "Unknown trainee" });
                } else {
                    throw error;
                }
            }
        }

        let message = `${created.length} assessment${created.length === 1 ? "" : "s"} created`;

        if (skipped.length > 0) {
            message += `, ${skipped.length} skipped (already assigned)`;
        }

        return res.status(201).json({
            success: true,
            message: `${message}.`,
            created,
            skipped,
            createdCount: created.length,
            skippedCount: skipped.length
        });
    } catch (error) {
        return next(error);
    }
};

// ADMIN: Grade an assessment
const gradeAssessment = async (req, res, next) => {
    try {
        const { score, remarks } = req.body;

        if (
            score === undefined ||
            score === null ||
            score === "" ||
            !Number.isFinite(Number(score)) ||
            Number(score) < 0
        ) {
            return res.status(400).json({
                success: false,
                message: "Please provide a valid score.",
                field: "score",
                code: "INVALID_SCORE"
            });
        }

        const assessment = await Assessment.findById(req.params.id);

        if (!assessment) {
            return res.status(404).json({
                success: false,
                message: "Assessment not found.",
                code: "NOT_FOUND"
            });
        }

        if (Number(score) > assessment.totalScore) {
            return res.status(400).json({
                success: false,
                message: `Score cannot exceed the total of ${assessment.totalScore}.`,
                field: "score",
                code: "SCORE_TOO_HIGH"
            });
        }

        assessment.score = Number(score);
        assessment.status = "Graded";

        if (remarks !== undefined) {
            assessment.remarks = remarks;
        }

        await assessment.save();
        await assessment.populate("user", "firstName lastName email");

        return res.status(200).json({
            success: true,
            message: "Assessment graded successfully.",
            assessment
        });
    } catch (error) {
        return next(error);
    }
};

module.exports = {
    createAssessment,
    getAllAssessments,
    getAssessmentTrainees,
    gradeAssessment,
    buildSummary
};
