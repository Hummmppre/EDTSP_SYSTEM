const mongoose = require("mongoose");

const integrationCredentialSchema = new mongoose.Schema(
  {
    integration: {
      type: String,
      required: true,
      unique: true,
      enum: [
        "google-auth",
        "google-oauth",
        "brevo",
        "google-calendar",
        "recaptcha",
      ],
    },
    ciphertext: { type: String, required: true },
    iv: { type: String, required: true },
    authTag: { type: String, required: true },
    keyVersion: { type: Number, required: true, min: 1, default: 1 },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  { timestamps: true },
);

module.exports = mongoose.model(
  "IntegrationCredential",
  integrationCredentialSchema,
);
