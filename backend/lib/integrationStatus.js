const IntegrationCredential = require("../models/IntegrationCredential");
const IntegrationValidationStatus = require("../models/IntegrationValidationStatus");
const SystemSettings = require("../models/SystemSettings");
const { getStorageKeys } = require("./integrations/catalog");

const CARD_INTEGRATIONS = [
  "google-auth",
  "brevo",
  "google-calendar",
  "google-sheets",
  "recaptcha",
];

async function getValidationStatus(card) {
  if (!CARD_INTEGRATIONS.includes(card)) return null;

  return IntegrationValidationStatus.findOne({ integration: card }).lean();
}

async function upsertValidationStatus({
  card,
  valid,
  state,
  code,
  message,
  checkedAt = new Date(),
  credentialUpdatedAt = null,
}) {
  if (!CARD_INTEGRATIONS.includes(card)) return null;

  return IntegrationValidationStatus.findOneAndUpdate(
    { integration: card },
    {
      $set: {
        valid: state === "valid",
        state,
        code: String(code || "unknown").slice(0, 64),
        message: String(message || "").slice(0, 300),
        checkedAt,
        credentialUpdatedAt,
      },
    },
    {
      upsert: true,
      returnDocument: "after",
      setDefaultsOnInsert: true,
    },
  ).lean();
}

async function resetValidationStatus(card, state = "not_configured") {
  const allowed = ["unverified", "not_configured"];

  return upsertValidationStatus({
    card,
    valid: false,
    state: allowed.includes(state) ? state : "not_configured",
    code: state,
    message: "",
    checkedAt: null,
    credentialUpdatedAt: null,
  });
}

async function credentialUpdatedAtFor(card) {
  const keys = getStorageKeys(card);
  const dates = [];

  if (keys.length) {
    const records = await IntegrationCredential.find({
      integration: { $in: keys },
    })
      .select("updatedAt")
      .lean();

    for (const record of records) {
      if (record.updatedAt) dates.push(new Date(record.updatedAt));
    }
  }

  if (card === "recaptcha") {
    try {
      const settings = await SystemSettings.findOne().select("updatedAt").lean();

      if (settings && settings.updatedAt) {
        dates.push(new Date(settings.updatedAt));
      }
    } catch (error) {
      // Metadata must still render if the settings document is unavailable.
    }
  }

  if (!dates.length) return null;

  return new Date(Math.max(...dates.map((date) => date.getTime())));
}

function isStale(status, credentialUpdatedAt) {
  if (!status || !status.checkedAt || !credentialUpdatedAt) return false;

  if (!status.credentialUpdatedAt) return true;

  return (
    new Date(credentialUpdatedAt).getTime() >
    new Date(status.credentialUpdatedAt).getTime()
  );
}

module.exports = {
  CARD_INTEGRATIONS,
  getValidationStatus,
  upsertValidationStatus,
  resetValidationStatus,
  credentialUpdatedAtFor,
  isStale,
};
