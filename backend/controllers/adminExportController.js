const TrainingApplication = require("../models/TrainingApplication");
const Assessment = require("../models/Assessment");
const Payment = require("../models/Payment");
const {
  createExportSpreadsheet,
  isSheetsEnabled,
} = require("../lib/googleSheets");
const { loadTraineeRows } = require("./traineeAdminController");

function formatDate(value) {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString();
}

function fullName(user) {
  return [user?.firstName, user?.lastName].filter(Boolean).join(" ");
}

const exporters = {
  applications: async () => {
    const records = await TrainingApplication.find()
      .select(
        "firstName lastName email phone program batch status submittedAt decidedAt publicNote internalNote",
      )
      .populate("program", "name")
      .populate("batch", "label")
      .sort({ submittedAt: -1 })
      .lean();

    return {
      title: "EDTSP Applications Export",
      tabName: "Applications",
      values: [
        [
          "Reference",
          "First name",
          "Last name",
          "Email",
          "Phone",
          "Program",
          "Batch",
          "Submitted",
          "Status",
          "Decision date",
          "Public note",
          "Internal note",
        ],
        ...records.map((record) => [
          String(record._id),
          record.firstName,
          record.lastName,
          record.email,
          record.phone,
          record.program?.name || "",
          record.batch?.label || "",
          formatDate(record.submittedAt),
          record.status,
          formatDate(record.decidedAt),
          record.publicNote || "",
          record.internalNote || "",
        ]),
      ],
    };
  },

  assessments: async () => {
    const records = await Assessment.find()
      .populate("user", "firstName lastName")
      .sort({ createdAt: -1 })
      .lean();

    return {
      title: "EDTSP Assessments Export",
      tabName: "Assessments",
      values: [
        [
          "Assessment",
          "Subject",
          "Type",
          "Trainee",
          "Score",
          "Total score",
          "Status",
          "Assessment date",
          "Due date",
          "Remarks",
        ],
        ...records.map((record) => [
          record.assessmentTitle,
          record.subject,
          record.assessmentType || "",
          fullName(record.user),
          record.score ?? "",
          record.totalScore,
          record.status,
          formatDate(record.assessmentDate),
          formatDate(record.dueDate),
          record.remarks || "",
        ]),
      ],
    };
  },

  trainees: async () => {
    const records = await loadTraineeRows();

    return {
      title: "EDTSP Trainees Export",
      tabName: "Trainees",
      values: [
        [
          "Trainee ID",
          "First name",
          "Last name",
          "Email",
          "Phone",
          "Program",
          "Batch",
          "Enrolment status",
          "Account status",
          "Approved",
          "Member since",
          "Address",
        ],
        ...records.map((record) => [
          record.traineeId || "",
          record.firstName,
          record.lastName,
          record.email,
          record.phone || "",
          record.programName || "",
          record.batchLabel || "",
          record.enrollmentStatus,
          record.accountStatus,
          formatDate(record.approvedAt),
          formatDate(record.createdAt),
          record.address || "",
        ]),
      ],
    };
  },

  payments: async () => {
    const records = await Payment.find()
      .populate("user", "firstName lastName")
      .populate("program", "name")
      .sort({ paymentDate: -1, createdAt: -1 })
      .lean();

    return {
      title: "EDTSP Payments Export",
      tabName: "Payments",
      values: [
        [
          "Receipt",
          "Trainee",
          "Program",
          "Amount",
          "Method",
          "Payment date",
          "Reference number",
          "Remarks",
        ],
        ...records.map((record) => [
          record.receiptNumber,
          fullName(record.user),
          record.program?.name || "",
          record.amount,
          record.method,
          formatDate(record.paymentDate),
          record.referenceNumber || "",
          record.remarks || "",
        ]),
      ],
    };
  },
};

async function exportToGoogleSheets(req, res) {
  const exporter = exporters[req.params.dataset];

  if (!exporter) {
    return res.status(404).json({
      success: false,
      message: "Export type not found.",
    });
  }

  try {
    if (!(await isSheetsEnabled())) {
      return res.status(403).json({
        success: false,
        message:
          "Google Sheets export is turned off in System settings. Turn it on there to export records.",
      });
    }

    const spreadsheet = await createExportSpreadsheet(await exporter());
    return res.status(201).json({ success: true, ...spreadsheet });
  } catch (error) {
    if (error.code === "disabled") {
      return res.status(403).json({
        success: false,
        message:
          "Google Sheets export is turned off in System settings. Turn it on there to export records.",
      });
    }

    if (error.code === "not_configured") {
      return res.status(503).json({
        success: false,
        message: error.message,
      });
    }

    if (["not_connected", "missing_scope", "needs_reconnect"].includes(error.code)) {
      return res.status(409).json({
        success: false,
        reconnectRequired: true,
        message: error.message,
      });
    }

    console.error("Google Sheets export error:", error);

    return res.status(500).json({
      success: false,
      message: error.message || "Unable to export records to Google Sheets.",
    });
  }
}

module.exports = { exportToGoogleSheets };
