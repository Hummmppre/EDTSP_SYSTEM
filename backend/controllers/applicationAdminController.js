const mongoose = require("mongoose");

const TrainingApplication = require("../models/TrainingApplication");
const TraineeProfile = require("../models/TraineeProfile");
const Batch = require("../models/Batch");
const Counter = require("../models/Counter");
const { sendApplicationDecision } = require("../lib/mailer");

const STATUSES = [
    "Submitted",
    "Under review",
    "Approved",
    "Rejected",
    "Withdrawn"
];

const OPEN_STATUSES = ["Submitted", "Under review"];

function escapeRegex(value) {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildFilter(query = {}) {
    const filter = {};

    if (query.status && STATUSES.includes(query.status)) {
        filter.status = query.status;
    }

    const search = String(query.search || "").trim();

    if (search) {
        const pattern = new RegExp(escapeRegex(search), "i");

        filter.$or = [
            { firstName: pattern },
            { lastName: pattern },
            { email: pattern }
        ];
    }

    return filter;
}

async function nextTraineeId() {
    const year = new Date().getFullYear();

    const counter = await Counter.findOneAndUpdate(
        { _id: `traineeId-${year}` },
        { $inc: { seq: 1 } },
        { upsert: true, new: true }
    );

    return `EDT-${year}-${String(counter.seq).padStart(3, "0")}`;
}

function csvValue(value) {
    let text = value === undefined || value === null ? "" : String(value);

    // Spreadsheet formula injection guard.
    if (/^[=+\-@]/.test(text)) {
        text = `'${text}`;
    }

    return `"${text.replace(/"/g, '""')}"`;
}

function formatCsvDate(value) {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    return date.toISOString().slice(0, 10);
}

// ADMIN: List applications with the same filters used by the CSV export
const getAllApplications = async (req, res) => {
    try {
        const applications = await TrainingApplication.find(buildFilter(req.query))
            .populate("user", "firstName lastName email")
            .populate("program", "name")
            .populate("batch", "label slotCapacity filledCount")
            .sort({ submittedAt: -1 });

        return res.status(200).json({
            success: true,
            count: applications.length,
            applications
        });

    } catch (error) {
        console.error("Get applications error:", error);

        return res.status(500).json({
            success: false,
            message: "Unable to retrieve applications."
        });
    }
};

// ADMIN: Pending applications for the sidebar badge
const getPendingCount = async (req, res) => {
    try {
        const count = await TrainingApplication.countDocuments({
            status: { $in: OPEN_STATUSES }
        });

        return res.status(200).json({ success: true, count });

    } catch (error) {
        console.error("Pending application count error:", error);

        return res.status(500).json({
            success: false,
            message: "Unable to retrieve the pending application count."
        });
    }
};

// ADMIN: One application with every answer and the applicant's prior history
const getApplication = async (req, res) => {
    try {
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
            return res.status(404).json({
                success: false,
                message: "Application not found."
            });
        }

        const application = await TrainingApplication.findById(req.params.id)
            .populate("user", "firstName lastName email status")
            .populate("program", "name description fee status")
            .populate("batch", "label intakeDate slotCapacity filledCount status")
            .populate("reviewer", "firstName lastName email");

        if (!application) {
            return res.status(404).json({
                success: false,
                message: "Application not found."
            });
        }

        const previousApplications = await TrainingApplication.find({
            user: application.user._id,
            _id: { $ne: application._id }
        })
            .select("status submittedAt decidedAt program")
            .populate("program", "name")
            .sort({ submittedAt: -1 });

        return res.status(200).json({
            success: true,
            application,
            previousApplications
        });

    } catch (error) {
        console.error("Get application error:", error);

        return res.status(500).json({
            success: false,
            message: "Unable to retrieve this application."
        });
    }
};

// ADMIN: Approve or reject an application
const decideApplication = async (req, res) => {
    let claimedBatchId = null;

    try {
        const { decision, publicNote, internalNote } = req.body || {};

        if (!["Approved", "Rejected"].includes(decision)) {
            return res.status(400).json({
                success: false,
                message: "Choose either Approved or Rejected."
            });
        }

        if (publicNote && String(publicNote).length > 1000) {
            return res.status(400).json({
                success: false,
                message: "The public message must be 1000 characters or fewer."
            });
        }

        if (internalNote && String(internalNote).length > 2000) {
            return res.status(400).json({
                success: false,
                message: "The internal note must be 2000 characters or fewer."
            });
        }

        if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
            return res.status(404).json({
                success: false,
                message: "Application not found."
            });
        }

        const application = await TrainingApplication.findById(req.params.id)
            .populate("program", "name")
            .populate("batch", "label slotCapacity filledCount status");

        if (!application) {
            return res.status(404).json({
                success: false,
                message: "Application not found."
            });
        }

        if (!OPEN_STATUSES.includes(application.status)) {
            return res.status(409).json({
                success: false,
                message: "This application has already been decided or withdrawn."
            });
        }

        application.publicNote = String(publicNote || "").trim();
        application.internalNote = String(internalNote || "").trim();
        application.reviewer = req.user.id;
        application.decidedAt = new Date();

        if (decision === "Approved") {
            // Atomic claim: two admins approving at once cannot oversell a batch.
            const batch = await Batch.findOneAndUpdate(
                {
                    _id: application.batch._id,
                    status: "Open",
                    $expr: { $lt: ["$filledCount", "$slotCapacity"] }
                },
                { $inc: { filledCount: 1 } },
                { new: true }
            );

            if (!batch) {
                return res.status(409).json({
                    success: false,
                    message: "This batch is already full. Close the batch or move the applicant to another batch."
                });
            }

            claimedBatchId = batch._id;

            const profile = await TraineeProfile.findOneAndUpdate(
                { user: application.user },
                {
                    $set: {
                        program: application.program.name,
                        enrollmentStatus: "Ongoing"
                    },
                    $setOnInsert: { user: application.user }
                },
                { new: true, upsert: true, setDefaultsOnInsert: true }
            );

            // Keep an ID that was already issued; only mint one when missing.
            if (!profile.traineeId) {
                profile.traineeId = await nextTraineeId();
                await profile.save();
            }

            application.status = "Approved";
        } else {
            application.status = "Rejected";
        }

        // The application is no longer "open", so it drops out of the unique
        // partial index and the trainee may apply again if rejected.
        application.openApplication = false;

        await application.save();

        const mail = await sendApplicationDecision({
            to: application.email,
            name: `${application.firstName} ${application.lastName}`,
            program: application.program.name,
            batch: application.batch.label,
            decision: application.status,
            publicNote: application.publicNote
        });

        return res.status(200).json({
            success: true,
            message: decision === "Approved"
                ? "Application approved and enrollment activated."
                : "Application rejected.",
            application,
            mail: { sent: Boolean(mail && mail.sent) }
        });

    } catch (error) {
        // Undo the claimed slot so batch counts never drift from approvals.
        if (claimedBatchId) {
            try {
                await Batch.updateOne(
                    { _id: claimedBatchId },
                    { $inc: { filledCount: -1 } }
                );
            } catch (rollbackError) {
                console.error("Batch slot rollback failed:", rollbackError);
            }
        }

        console.error("Decide application error:", error);

        return res.status(500).json({
            success: false,
            message: "Unable to record this decision."
        });
    }
};

// ADMIN: CSV export with the current filters
const exportApplications = async (req, res) => {
    try {
        const applications = await TrainingApplication.find(buildFilter(req.query))
            .populate("program", "name")
            .populate("batch", "label")
            .sort({ submittedAt: -1 });

        const header = [
            "Reference",
            "First name",
            "Last name",
            "Email",
            "Phone",
            "Program",
            "Batch",
            "Submitted",
            "Status",
            "Decided",
            "Public note",
            "Internal note"
        ];

        const rows = applications.map(application => [
            String(application._id),
            application.firstName,
            application.lastName,
            application.email,
            application.phone,
            application.program ? application.program.name : "",
            application.batch ? application.batch.label : "",
            formatCsvDate(application.submittedAt),
            application.status,
            formatCsvDate(application.decidedAt),
            application.publicNote,
            application.internalNote
        ]);

        const csv = [header, ...rows]
            .map(row => row.map(csvValue).join(","))
            .join("\r\n");

        res.setHeader("Content-Type", "text/csv; charset=utf-8");
        res.setHeader(
            "Content-Disposition",
            `attachment; filename="applications-${formatCsvDate(new Date())}.csv"`
        );

        return res.status(200).send(csv);

    } catch (error) {
        console.error("Export applications error:", error);

        return res.status(500).json({
            success: false,
            message: "Unable to export applications."
        });
    }
};

module.exports = {
    getAllApplications,
    getPendingCount,
    getApplication,
    decideApplication,
    exportApplications
};
