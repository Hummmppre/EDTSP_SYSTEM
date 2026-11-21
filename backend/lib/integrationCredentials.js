const IntegrationCredential = require("../models/IntegrationCredential");
const SystemSettings = require("../models/SystemSettings");
const {
  getDefinition,
  getFieldDefinition,
  getRequiredFields,
  getStorageTargets,
  getStorageKeys,
  getSettingFields,
  validateFieldNames,
} = require("./integrations/catalog");
const {
  IntegrationCryptoError,
  encryptionConfigured,
  parseMasterKey,
  encryptFields,
  decryptFields,
} = require("./credentialCrypto");
const {
  getValidationStatus,
  credentialUpdatedAtFor,
  isStale,
} = require("./integrationStatus");

const CARD_INTEGRATIONS = [
  "google-auth",
  "brevo",
  "google-calendar",
  "google-sheets",
  "recaptcha",
];

class CredentialUnavailableError extends Error {
  constructor(code, message) {
    super(message);

    this.name = "CredentialUnavailableError";
    this.code = code;
    this.httpStatus = 503;
  }
}

class CredentialWriteError extends Error {
  constructor(message, options = {}) {
    super(message, options);

    this.name = "CredentialWriteError";
    this.code = "credential_write_failed";
    this.httpStatus = 500;
  }
}

let cachedRawKey = null;
let cachedMasterKey = null;

function masterKey(env = process.env) {
  const raw = String(env.INTEGRATION_ENCRYPTION_KEY || "");

  if (raw !== cachedRawKey) {
    cachedMasterKey = parseMasterKey(raw);
    cachedRawKey = raw;
  }

  return cachedMasterKey;
}

function emptyField() {
  return {
    value: null,
    source: "none",
    readable: true,
    code: "not_configured",
  };
}

function envFallback(fieldDefinition, env) {
  const value = fieldDefinition.env ? env[fieldDefinition.env] : "";

  if (value !== undefined && String(value).trim() !== "") {
    return {
      value: String(value),
      source: "environment",
      readable: true,
      code: null,
    };
  }

  if (fieldDefinition.default !== undefined) {
    return {
      value: String(fieldDefinition.default),
      source: "environment",
      readable: true,
      code: null,
    };
  }

  return emptyField();
}

async function resolveField(card, fieldName, { env = process.env } = {}) {
  const fieldDefinition = getFieldDefinition(card, fieldName);

  if (!fieldDefinition) return emptyField();

  if (fieldDefinition.setting) {
    try {
      const settings = await SystemSettings.findOne().lean();
      const value = settings ? settings[fieldDefinition.setting] : "";

      if (value !== undefined && value !== null && String(value).trim() !== "") {
        return {
          value: String(value),
          source: "database",
          readable: true,
          code: null,
        };
      }
    } catch (error) {
      // A settings read failure falls back to env, matching the old behavior.
    }

    return envFallback(fieldDefinition, env);
  }

  const record = await IntegrationCredential.findOne({
    integration: fieldDefinition.storage,
  }).lean();

  if (!record) {
    return envFallback(fieldDefinition, env);
  }

  let decrypted;

  try {
    decrypted = decryptFields(
      fieldDefinition.storage,
      record,
      masterKey(env),
    );
  } catch (error) {
    return {
      value: null,
      source: "database",
      readable: false,
      code: "unreadable_credential",
    };
  }

  const value = decrypted[fieldName];

  if (value === undefined || value === null || String(value).trim() === "") {
    // A database record deliberately overrides env, even when this field is
    // absent, so a partial save cannot silently fall back to an env secret.
    return {
      value: null,
      source: "database",
      readable: true,
      code: "not_configured",
    };
  }

  return {
    value: String(value),
    source: "database",
    readable: true,
    code: null,
  };
}

async function resolveIntegration(card, options = {}) {
  const definition = getDefinition(card);

  if (!definition) {
    return {
      fields: {},
      complete: false,
      unreadable: false,
      missing: [],
    };
  }

  const fieldNames = Object.keys(definition.fields);
  const entries = await Promise.all(
    fieldNames.map(async (name) => [
      name,
      await resolveField(card, name, options),
    ]),
  );
  const fields = Object.fromEntries(entries);
  const required = getRequiredFields(card);
  const missing = required.filter((name) => !fields[name] || fields[name].value === null);

  return {
    fields,
    complete: missing.length === 0,
    unreadable: Object.values(fields).some((field) => !field.readable),
    missing,
  };
}

async function resolveForValidation(card, candidates = {}, options = {}) {
  const definition = getDefinition(card);
  const nameCheck = validateFieldNames(card, candidates);
  const resolved = await resolveIntegration(card, options);
  const values = {};
  const sources = {};
  const errors = [...nameCheck.errors];

  if (!definition) {
    return {
      values,
      sources,
      missing: getRequiredFields(card),
      unreadable: false,
      errors,
    };
  }

  for (const fieldName of Object.keys(definition.fields)) {
    const candidate = Object.prototype.hasOwnProperty.call(candidates, fieldName)
      ? String(candidates[fieldName]).trim()
      : "";
    const field = resolved.fields[fieldName];

    if (candidate) {
      values[fieldName] = candidate;
      sources[fieldName] = "candidate";
      continue;
    }

    if (field && field.value !== null && field.readable) {
      values[fieldName] = field.value;
      sources[fieldName] = field.source;
    }
  }

  const missing = getRequiredFields(card).filter(
    (fieldName) => !Object.prototype.hasOwnProperty.call(values, fieldName),
  );

  return {
    values,
    sources,
    missing,
    unreadable: resolved.unreadable,
    errors,
  };
}

async function requireField(card, fieldName, options = {}) {
  const field = await resolveField(card, fieldName, options);

  if (field.value !== null && field.readable) return field.value;

  throw new CredentialUnavailableError(
    field.code || "not_configured",
    `The ${card}.${fieldName} credential is not available.`,
  );
}

async function getMetadata(card, options = {}) {
  const definition = getDefinition(card);

  if (!definition) return null;

  const resolved = await resolveIntegration(card, options);
  const status = await getValidationStatus(card);
  const credentialUpdatedAt = await credentialUpdatedAtFor(card);
  const stale = isStale(status, credentialUpdatedAt);

  const fields = Object.keys(definition.fields).map((name) => {
    const field = resolved.fields[name];

    return {
      name,
      configured: Boolean(field && field.value !== null),
      source: field ? field.source : "none",
      readable: field ? field.readable : true,
    };
  });

  let lastValidation;

  if (resolved.unreadable) {
    lastValidation = {
      valid: false,
      state: "unreadable_credential",
      code: "unreadable_credential",
      message: "The saved credential could not be read. Re-enter it or clear it.",
      checkedAt: status ? status.checkedAt : null,
      stale: false,
    };
  } else if (status && status.checkedAt) {
    lastValidation = {
      valid: Boolean(status.valid),
      state: status.state,
      code: status.code,
      message: status.message,
      checkedAt: status.checkedAt,
      stale,
    };
  } else {
    lastValidation = {
      valid: false,
      state: resolved.complete ? "unverified" : "not_configured",
      code: resolved.complete ? "unverified" : "not_configured",
      message: resolved.complete
        ? "Not validated yet."
        : "Enter the required credentials.",
      checkedAt: null,
      stale: false,
    };
  }

  return {
    integration: card,
    configured: resolved.complete,
    complete: resolved.complete,
    fields,
    lastValidation,
  };
}

async function writeStorageTarget(target, values, adminId, env) {
  const payload = {};

  for (const fieldName of target.fields) {
    if (Object.prototype.hasOwnProperty.call(values, fieldName)) {
      payload[fieldName] = values[fieldName];
    }
  }

  if (!Object.keys(payload).length) return null;

  const encrypted = encryptFields(
    target.storageIntegration,
    payload,
    masterKey(env),
  );
  const update = {
    $set: {
      ciphertext: encrypted.ciphertext,
      iv: encrypted.iv,
      authTag: encrypted.authTag,
      keyVersion: encrypted.keyVersion,
      updatedBy: adminId,
    },
  };

  async function attempt() {
    return IntegrationCredential.findOneAndUpdate(
      { integration: target.storageIntegration },
      update,
      {
        upsert: true,
        returnDocument: "after",
        setDefaultsOnInsert: true,
      },
    ).lean();
  }

  try {
    return await attempt();
  } catch (error) {
    if (error && error.code === 11000) {
      return attempt();
    }

    throw error;
  }
}

async function restoreCredential(storageIntegration, snapshot) {
  if (!snapshot) {
    await IntegrationCredential.deleteOne({ integration: storageIntegration });
    return;
  }

  await IntegrationCredential.replaceOne(
    { integration: storageIntegration },
    snapshot,
    { upsert: true },
  );
}

async function saveOverride({ card, fields, adminId, env = process.env }) {
  const definition = getDefinition(card);

  if (!definition) {
    throw new Error("Unknown integration.");
  }

  const nameCheck = validateFieldNames(card, fields);

  if (!nameCheck.ok) {
    const error = new Error("Invalid credential fields.");
    error.code = nameCheck.errors[0].code;
    error.field = nameCheck.errors[0].field;
    throw error;
  }

  const missing = getRequiredFields(card).filter(
    (fieldName) =>
      !Object.prototype.hasOwnProperty.call(fields, fieldName) ||
      String(fields[fieldName]).trim() === "",
  );

  if (missing.length) {
    const error = new Error("Missing required credential fields.");
    error.code = "missing_field";
    error.field = missing[0];
    throw error;
  }

  if (!encryptionConfigured(env)) {
    throw new IntegrationCryptoError(
      "encryption_not_configured",
      "Integration credential encryption is not configured.",
    );
  }

  const targets = getStorageTargets(card);
  const snapshots = new Map();
  const written = [];

  for (const target of targets) {
    const snapshot = await IntegrationCredential.findOne({
      integration: target.storageIntegration,
    }).lean();

    snapshots.set(target.storageIntegration, snapshot);
  }

  const settingFields = getSettingFields(card);
  const previousSettings = settingFields.length
    ? await SystemSettings.findOne().lean()
    : null;
  let settingsWritten = false;

  try {
    for (const target of targets) {
      const record = await writeStorageTarget(target, fields, adminId, env);

      if (record) written.push(target.storageIntegration);
    }

    for (const field of settingFields) {
      if (!Object.prototype.hasOwnProperty.call(fields, field.name)) continue;

      await SystemSettings.findOneAndUpdate(
        {},
        { $set: { [field.setting]: String(fields[field.name]) } },
        { upsert: true, returnDocument: "after", setDefaultsOnInsert: true },
      );
      settingsWritten = true;
    }
  } catch (error) {
    for (const storageIntegration of written.reverse()) {
      try {
        await restoreCredential(
          storageIntegration,
          snapshots.get(storageIntegration),
        );
      } catch (restoreError) {
        console.error(
          `[integration-credentials] Could not restore ${storageIntegration}: ${restoreError.message}`,
        );
      }
    }

    if (settingsWritten) {
      try {
        await SystemSettings.findOneAndUpdate(
          {},
          {
            $set: {
              recaptchaSiteKey:
                previousSettings && previousSettings.recaptchaSiteKey
                  ? previousSettings.recaptchaSiteKey
                  : "",
            },
          },
          { upsert: true },
        );
      } catch (restoreError) {
        console.error(
          `[integration-credentials] Could not restore the reCAPTCHA site key: ${restoreError.message}`,
        );
      }
    }

    throw new CredentialWriteError(
      "The integration credential could not be stored.",
      { cause: error },
    );
  }

  return getMetadata(card, { env });
}

async function clearOverride(card, { env = process.env } = {}) {
  if (!encryptionConfigured(env)) {
    throw new IntegrationCryptoError(
      "encryption_not_configured",
      "Integration credential encryption is not configured.",
    );
  }

  const keys = getStorageKeys(card);

  if (keys.length) {
    await IntegrationCredential.deleteMany({ integration: { $in: keys } });
  }

  if (card === "recaptcha") {
    await SystemSettings.findOneAndUpdate(
      {},
      { $set: { recaptchaSiteKey: "" } },
      { upsert: true },
    );
  }

  return { clearedKeys: keys };
}

function isCardIntegration(card) {
  return CARD_INTEGRATIONS.includes(card);
}

module.exports = {
  CARD_INTEGRATIONS,
  CredentialUnavailableError,
  CredentialWriteError,
  isCardIntegration,
  resolveField,
  resolveIntegration,
  resolveForValidation,
  requireField,
  getMetadata,
  saveOverride,
  clearOverride,
  encryptionConfigured,
};
