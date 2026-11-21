const CARD_INTEGRATIONS = [
  "google-auth",
  "brevo",
  "google-calendar",
  "google-sheets",
  "recaptcha",
];

const STORAGE_INTEGRATIONS = [
  "google-auth",
  "google-oauth",
  "brevo",
  "google-calendar",
  "recaptcha",
];

const FIELD_MAX_LENGTH = 512;

const INTEGRATIONS = Object.freeze({
  "google-auth": {
    label: "Google Authentication",
    fields: {
      clientId: { env: "GOOGLE_CLIENT_ID", storage: "google-auth" },
      clientSecret: { env: "GOOGLE_CLIENT_SECRET", storage: "google-auth" },
    },
    required: ["clientId", "clientSecret"],
    storageKeys: ["google-auth"],
  },
  brevo: {
    label: "Brevo",
    fields: {
      apiKey: { env: "BREVO_API_KEY", storage: "brevo" },
    },
    required: ["apiKey"],
    storageKeys: ["brevo"],
  },
  "google-calendar": {
    label: "Google Calendar",
    fields: {
      clientId: { env: "GOOGLE_CALENDAR_CLIENT_ID", storage: "google-oauth" },
      clientSecret: {
        env: "GOOGLE_CALENDAR_CLIENT_SECRET",
        storage: "google-oauth",
      },
      calendarId: {
        env: "GOOGLE_CALENDAR_ID",
        storage: "google-calendar",
        default: "primary",
      },
    },
    required: ["clientId", "clientSecret", "calendarId"],
    storageKeys: ["google-oauth", "google-calendar"],
    sharedWith: ["google-sheets"],
  },
  "google-sheets": {
    label: "Google Sheets",
    fields: {
      clientId: { env: "GOOGLE_CALENDAR_CLIENT_ID", storage: "google-oauth" },
      clientSecret: {
        env: "GOOGLE_CALENDAR_CLIENT_SECRET",
        storage: "google-oauth",
      },
    },
    required: ["clientId", "clientSecret"],
    storageKeys: ["google-oauth"],
    sharedWith: ["google-calendar"],
  },
  recaptcha: {
    label: "reCAPTCHA",
    fields: {
      secretKey: { env: "RECAPTCHA_SECRET_KEY", storage: "recaptcha" },
      siteKey: { env: "RECAPTCHA_SITE_KEY", setting: "recaptchaSiteKey" },
    },
    required: ["secretKey", "siteKey"],
    storageKeys: ["recaptcha"],
  },
});

function getDefinition(card) {
  return INTEGRATIONS[card] || null;
}

function isCard(card) {
  return Boolean(getDefinition(card));
}

function getFieldDefinition(card, fieldName) {
  const definition = getDefinition(card);

  if (!definition) return null;

  return definition.fields[fieldName] || null;
}

function getRequiredFields(card) {
  const definition = getDefinition(card);

  return definition ? [...definition.required] : [];
}

function getStorageTargets(card) {
  const definition = getDefinition(card);

  if (!definition) return [];

  const targets = [];
  const byStorage = new Map();

  for (const [fieldName, field] of Object.entries(definition.fields)) {
    if (!field.storage) continue;

    if (!byStorage.has(field.storage)) {
      const target = { storageIntegration: field.storage, fields: [] };

      byStorage.set(field.storage, target);
      targets.push(target);
    }

    byStorage.get(field.storage).fields.push(fieldName);
  }

  // Google writes the shared OAuth record first, then the service-specific one.
  targets.sort((a, b) => {
    if (a.storageIntegration === "google-oauth") return -1;
    if (b.storageIntegration === "google-oauth") return 1;

    return 0;
  });

  return targets;
}

function getStorageKeys(card) {
  const definition = getDefinition(card);

  return definition ? [...definition.storageKeys] : [];
}

function getSettingFields(card) {
  const definition = getDefinition(card);

  if (!definition) return [];

  return Object.entries(definition.fields)
    .filter(([, field]) => field.setting)
    .map(([name, field]) => ({ name, setting: field.setting, env: field.env }));
}

function getEnvName(card, fieldName) {
  const field = getFieldDefinition(card, fieldName);

  return field ? field.env || "" : "";
}

function validateFieldNames(card, fields) {
  const definition = getDefinition(card);
  const errors = [];

  if (!definition) {
    return { ok: false, errors: [{ field: "", code: "unknown_integration" }] };
  }

  if (!fields || typeof fields !== "object" || Array.isArray(fields)) {
    return { ok: false, errors: [{ field: "", code: "invalid_field" }] };
  }

  for (const [fieldName, value] of Object.entries(fields)) {
    if (!definition.fields[fieldName]) {
      errors.push({ field: fieldName, code: "unknown_field" });
      continue;
    }

    if (typeof value !== "string") {
      errors.push({ field: fieldName, code: "invalid_field" });
      continue;
    }

    if (value.length > FIELD_MAX_LENGTH) {
      errors.push({ field: fieldName, code: "invalid_field" });
    }
  }

  return { ok: errors.length === 0, errors };
}

module.exports = {
  CARD_INTEGRATIONS,
  STORAGE_INTEGRATIONS,
  FIELD_MAX_LENGTH,
  INTEGRATIONS,
  getDefinition,
  isCard,
  getFieldDefinition,
  getRequiredFields,
  getStorageTargets,
  getStorageKeys,
  getSettingFields,
  getEnvName,
  validateFieldNames,
};
