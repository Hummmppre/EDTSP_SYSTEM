const mongoose = require("mongoose");

const User = require("../models/User");
const TraineeProfile = require("../models/TraineeProfile");
const Program = require("../models/Program");
const Batch = require("../models/Batch");
const TrainingApplication = require("../models/TrainingApplication");
const { sendApplicationReceived } = require("../lib/mailer");

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_REGEX = /^[0-9+()\-\s]{7,20}$/;

const OPEN_STATUSES = ["Submitted", "Under review"];

const REQUIRED_FIELDS = [
    "firstName",
    "lastName",
    "email",
    "phone",
    "address",
    "dateOfBirth",
    "sex",
    "civilStatus",
    "highestEducation",
    "schoolAttended",
    "emergencyContactName",
    "emergencyContactPhone",
    "emergencyContactRelationship"
];

const populateApplication = query =>
    query
        .populate("program", "name description fee status")
        .populate("batch", "label intakeDate slotCapacity filledCount status")
        .populate("reviewer", "firstName lastName email");

function ageInYears(dateOfBirth, now = new Date()) {
    let age = now.getFullYear() - dateOfBirth.getFullYear();
    const monthDiff = now.getMonth() - dateOfBirth.getMonth();

    if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < dateOfBirth.getDate())) {
        age -= 1;
    }

    return age;
}

function batchSummary(batch) {
    return {
        _id: batch._id,
        label: batch.label,
        intakeDate: batch.intakeDate,
        slotCapacity: batch.slotCapacity,
        filledCount: batch.filledCount,
        slotsRemaining: Math.max(batch.slotCapacity - batch.filledCount, 0),
        status: batch.status
    };
}

// TRAINEE: Programs that currently accept applications
const getOpenBatches = async (req, res) => {
    try {
        const programs = await Program.find({ status: "Open" }).sort({ name: 1 });

        const batches = await Batch.find({
            program: { $in: programs.map(program => program._id) },
            status: "Open"
        }).sort({ label: 1 });

        // Full batches are returned too: the form lists a full program as
        // "Full" instead of making it disappear. Programs with no open batch
        // come back with an empty batches array and are hidden by the form.
        const openPrograms = programs.map(program => {
            const programBatches = batches
                .filter(batch => String(batch.program) === String(program._id))
                .map(batchSummary);

            return {
                _id: program._id,
                name: program.name,
                description: program.description,
                fee: program.fee,
                batches: programBatches
            };
        });

        return res.status(200).json({
            success: true,
            programs: openPrograms
        });

    } catch (error) {
        console.error("Get open batches error:", error);

        return res.status(500).json({
            success: false,
            message: "Unable to load open training programs."
        });
    }
};

// TRAINEE: Current application, history, and whether a new one is allowed
const getMyApplication = async (req, res) => {
    try {
        const profile = await TraineeProfile.findOne({ user: req.user.id });
        const user = await User.findById(req.user.id).select("status");

        const openApplication = await populateApplication(
            TrainingApplication.findOne({
                user: req.user.id,
                status: { $in: OPEN_STATUSES }
            })
        );

        const history = await populateApplication(
            TrainingApplication.find({ user: req.user.id }).sort({ submittedAt: -1 })
        );

        let canApply = true;
        let reason = null;

        if (user && user.status !== "active") {
            canApply = false;
            reason = "account_inactive";
        } else if (profile && profile.enrollmentStatus === "Ongoing") {
            canApply = false;
            reason = "already_enrolled";
        } else if (profile && profile.enrollmentStatus === "Completed") {
            canApply = false;
            reason = "completed";
        } else if (openApplication) {
            canApply = false;
            reason = "already_applied";
        }

        return res.status(200).json({
            success: true,
            application: openApplication || history[0] || null,
            history,
            canApply,
            reason
        });

    } catch (error) {
        console.error("Get trainee application error:", error);

        return res.status(500).json({
            success: false,
            message: "Unable to retrieve your application."
        });
    }
};

// TRAINEE: Submit an application
const submitApplication = async (req, res) => {
    try {
        const body = req.body || {};

        const missingField = REQUIRED_FIELDS.find(field => {
            const value = body[field];
            return value === undefined || value === null || String(value).trim() === "";
        });

        if (missingField) {
            return res.status(400).json({
                success: false,
                message: "Please complete all required fields."
            });
        }

        if (body.acknowledgedTruthful !== true) {
            return res.status(400).json({
                success: false,
                message: "Please confirm that the information you provided is true."
            });
        }

        const email = String(body.email).toLowerCase().trim();

        if (!EMAIL_REGEX.test(email)) {
            return res.status(400).json({
                success: false,
                message: "Please enter a valid email address."
            });
        }

        const phone = String(body.phone).trim();

        if (!PHONE_REGEX.test(phone)) {
            return res.status(400).json({
                success: false,
                message: "Please enter a valid phone number."
            });
        }

        const emergencyPhone = String(body.emergencyContactPhone).trim();

        if (!PHONE_REGEX.test(emergencyPhone)) {
            return res.status(400).json({
                success: false,
                message: "Please enter a valid emergency contact number."
            });
        }

        const dateOfBirth = new Date(body.dateOfBirth);

        if (Number.isNaN(dateOfBirth.getTime()) || dateOfBirth.getTime() > Date.now()) {
            return res.status(400).json({
                success: false,
                message: "Enter a valid date of birth."
            });
        }

        if (ageInYears(dateOfBirth) < 18) {
            return res.status(400).json({
                success: false,
                message: "Applicants must be 18 years or older."
            });
        }

        const motivation = String(body.motivation || "").trim();

        if (motivation.length > 1000) {
            return res.status(400).json({
                success: false,
                message: "The motivation statement must be 1000 characters or fewer."
            });
        }

        const existingApplication = await TrainingApplication.findOne({
            user: req.user.id,
            status: { $in: OPEN_STATUSES }
        });

        if (existingApplication) {
            return res.status(409).json({
                success: false,
                message: "You already have an application in progress. Withdraw it before submitting a new one."
            });
        }

        const [profile, user] = await Promise.all([
            TraineeProfile.findOne({ user: req.user.id }),
            User.findById(req.user.id).select("status")
        ]);

        if (user && user.status !== "active") {
            return res.status(403).json({
                success: false,
                message: "Your account is inactive. Please contact the administrator."
            });
        }

        if (profile && profile.enrollmentStatus === "Ongoing") {
            return res.status(403).json({
                success: false,
                message: "Your enrollment is already active."
            });
        }

        if (profile && profile.enrollmentStatus === "Completed") {
            return res.status(403).json({
                success: false,
                message: "Your training is already completed."
            });
        }

        if (
            !mongoose.Types.ObjectId.isValid(body.program) ||
            !mongoose.Types.ObjectId.isValid(body.batch)
        ) {
            return res.status(400).json({
                success: false,
                message: "Please choose a valid program and batch."
            });
        }

        const [program, batch] = await Promise.all([
            Program.findById(body.program),
            Batch.findById(body.batch)
        ]);

        if (!program || program.status !== "Open") {
            return res.status(400).json({
                success: false,
                message: "This training program is not accepting applications."
            });
        }

        if (!batch || batch.status !== "Open") {
            return res.status(400).json({
                success: false,
                message: "This batch is not accepting applications."
            });
        }

        if (String(batch.program) !== String(program._id)) {
            return res.status(400).json({
                success: false,
                message: "The chosen batch does not belong to that program."
            });
        }

        if (batch.filledCount >= batch.slotCapacity) {
            return res.status(409).json({
                success: false,
                message: "This batch is already full. Please choose another batch."
            });
        }

        const application = await TrainingApplication.create({
            user: req.user.id,
            program: program._id,
            batch: batch._id,
            firstName: String(body.firstName).trim(),
            lastName: String(body.lastName).trim(),
            email,
            phone,
            address: String(body.address).trim(),
            dateOfBirth,
            sex: body.sex,
            civilStatus: body.civilStatus,
            highestEducation: body.highestEducation,
            schoolAttended: String(body.schoolAttended).trim(),
            emergencyContactName: String(body.emergencyContactName).trim(),
            emergencyContactPhone: emergencyPhone,
            emergencyContactRelationship: String(body.emergencyContactRelationship).trim(),
            motivation,
            acknowledgedTruthful: true,
            status: "Submitted",
            openApplication: true,
            submittedAt: new Date()
        });

        // Email problems never fail the submission.
        const mail = await sendApplicationReceived({
            to: email,
            name: `${application.firstName} ${application.lastName}`,
            program: program.name,
            batch: batch.label,
            submittedAt: application.submittedAt
        });

        return res.status(201).json({
            success: true,
            message: "Application submitted. We will email you once a decision is made.",
            application,
            mail
        });

    } catch (error) {
        // The partial unique index is the last line of defence for the
        // one-open-application rule.
        if (error && error.code === 11000) {
            return res.status(409).json({
                success: false,
                message: "You already have an application in progress. Withdraw it before submitting a new one."
            });
        }

        if (error && error.name === "ValidationError") {
            return res.status(400).json({
                success: false,
                message: Object.values(error.errors)[0]?.message || "Please check the application form."
            });
        }

        console.error("Submit application error:", error);

        return res.status(500).json({
            success: false,
            message: "Unable to submit your application."
        });
    }
};

// TRAINEE: Withdraw an open application
const withdrawApplication = async (req, res) => {
    try {
        const application = await TrainingApplication.findOne({
            _id: req.params.id,
            user: req.user.id
        });

        if (!application) {
            return res.status(404).json({
                success: false,
                message: "Application not found."
            });
        }

        if (!OPEN_STATUSES.includes(application.status)) {
            return res.status(400).json({
                success: false,
                message: "This application can no longer be withdrawn."
            });
        }

        application.status = "Withdrawn";
        application.openApplication = false;
        application.withdrawnAt = new Date();

        await application.save();

        return res.status(200).json({
            success: true,
            message: "Application withdrawn.",
            application
        });

    } catch (error) {
        console.error("Withdraw application error:", error);

        return res.status(500).json({
            success: false,
            message: "Unable to withdraw this application."
        });
    }
};

module.exports = {
    getOpenBatches,
    getMyApplication,
    submitApplication,
    withdrawApplication
};
