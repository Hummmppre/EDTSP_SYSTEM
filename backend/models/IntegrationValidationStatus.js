const mongoose = require("mongoose");

const integrationValidationStatusSchema = new mongoose.Schema(
  {
    integration: {
      type: String,
      required: true,
      unique: true,
      enum: [
        "google-auth",
        "brevo",
        "google-calendar",
        "google-sheets",
        "recaptcha",
      ],
    },
    valid: { type: Boolean, default: false },
    state: {
      type: String,
      default: "unverified",
      enum: [
        "valid",
        "invalid",
        "unverified",
        "awaiting_connection",
        "unreadable_credential",
        "not_configured",
      ],
    },
    code: { type: String, default: "not_configured", maxlength: 64 },
    message: { type: String, default: "", maxlength: 300 },
    checkedAt: { type: Date, default: null },
    credentialUpdatedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

module.exports = mongoose.model(
  "IntegrationValidationStatus",
  integrationValidationStatusSchema,
);
