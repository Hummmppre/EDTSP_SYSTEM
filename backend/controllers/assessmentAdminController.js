
const mongoose = require("mongoose");
const Assessment = require("../models/Assessment");
const User = require("../models/User");

// ADMIN: Create and assign an assessment
const createAssessment = async (req, res) => {
    try {
        const {
            traineeIds,
            assessmentTitle,
            subject,
            totalScore,
            assessmentDate,
            remarks
        } = req.body;

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
        }).select("_id");

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
                totalScore: Number(totalScore),
                assessmentDate: assessmentDate || null,
                remarks: remarks || "",
                status: "Pending"
            })),
            { ordered: false }
        );

        return res.status(201).json({
            success: true,
            message: "Assessment assigned successfully.",
            count: assessments.length,
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

// ADMIN: View all assessment records
const getAllAssessments = async (req, res) => {
    try {
        const assessments = await Assessment.find()
            .populate("user", "firstName lastName email")
            .sort({ createdAt: -1 });

        return res.status(200).json({
            success: true,
            count: assessments.length,
            assessments
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
        const { score, remarks } = req.body;

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

        assessment.score = Number(score);
        assessment.status = "Graded";

        if (remarks !== undefined) {
            assessment.remarks = remarks;
        }

        await assessment.save();

        return res.status(200).json({
            success: true,
            message: "Assessment graded successfully.",
            assessment
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
