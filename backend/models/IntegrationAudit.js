const mongoose = require("mongoose");

const integrationAuditSchema = new mongoose.Schema(
  {
    integration: {
      type: String,
      required: true,
      enum: [
        "google-auth",
        "brevo",
        "google-calendar",
        "google-sheets",
        "recaptcha",
      ],
    },
    action: {
      type: String,
      required: true,
      enum: ["test", "save", "clear"],
    },
    outcome: {
      type: String,
      required: true,
      enum: ["success", "failure"],
    },
    code: { type: String, required: true, maxlength: 64 },
    adminId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    adminEmail: { type: String, required: true, maxlength: 254 },
    ip: { type: String, default: "", maxlength: 64 },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

integrationAuditSchema.index(
  { createdAt: 1 },
  { expireAfterSeconds: 365 * 24 * 60 * 60 },
);

module.exports = mongoose.model("IntegrationAudit", integrationAuditSchema);
