const crypto = require("crypto");

const ALGORITHM = "aes-256-gcm";
const KEY_BYTES = 32;
const IV_BYTES = 12;
const KEY_VERSION = 1;
const ENVELOPE_VERSION = 1;

class IntegrationCryptoError extends Error {
  constructor(code, message, options = {}) {
    super(message, options);

    this.name = "IntegrationCryptoError";
    this.code = code;
    this.httpStatus = code === "encryption_not_configured" ? 503 : 500;
  }
}

function parseMasterKey(raw) {
  const value = String(raw || "").trim();

  if (!value) {
    throw new IntegrationCryptoError(
      "encryption_not_configured",
      "Integration credential encryption is not configured.",
    );
  }

  let key;

  if (/^[0-9a-fA-F]{64}$/.test(value)) {
    key = Buffer.from(value, "hex");
  } else {
    try {
      key = Buffer.from(value, "base64");
    } catch (error) {
      key = null;
    }
  }

  if (!key || key.length !== KEY_BYTES) {
    throw new IntegrationCryptoError(
      "encryption_not_configured",
      "INTEGRATION_ENCRYPTION_KEY must decode to 32 bytes.",
    );
  }

  return key;
}

function encryptionConfigured(env = process.env) {
  try {
    parseMasterKey(env.INTEGRATION_ENCRYPTION_KEY);

    return true;
  } catch (error) {
    return false;
  }
}

function buildAad(storageIntegration, keyVersion = KEY_VERSION) {
  return Buffer.from(
    `edtsp:integration:${storageIntegration}:v${keyVersion}`,
    "utf8",
  );
}

function encryptFields(storageIntegration, fields, masterKey) {
  if (!Buffer.isBuffer(masterKey) || masterKey.length !== KEY_BYTES) {
    throw new IntegrationCryptoError(
      "encryption_not_configured",
      "Integration credential encryption is not configured.",
    );
  }

  const plaintext = JSON.stringify({
    v: ENVELOPE_VERSION,
    fields: fields || {},
  });
  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv(ALGORITHM, masterKey, iv);

  cipher.setAAD(buildAad(storageIntegration, KEY_VERSION));

  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);

  return {
    ciphertext: ciphertext.toString("base64"),
    iv: iv.toString("base64"),
    authTag: cipher.getAuthTag().toString("base64"),
    keyVersion: KEY_VERSION,
  };
}

function decryptFields(storageIntegration, record, masterKey) {
  try {
    if (!record || typeof record !== "object") {
      throw new Error("Missing encrypted credential record.");
    }

    const keyVersion = Number(record.keyVersion || KEY_VERSION);
    const iv = Buffer.from(String(record.iv || ""), "base64");
    const authTag = Buffer.from(String(record.authTag || ""), "base64");
    const ciphertext = Buffer.from(String(record.ciphertext || ""), "base64");

    if (iv.length !== IV_BYTES || authTag.length !== 16 || !ciphertext.length) {
      throw new Error("Invalid encrypted credential envelope.");
    }

    const decipher = crypto.createDecipheriv(ALGORITHM, masterKey, iv);

    decipher.setAAD(buildAad(storageIntegration, keyVersion));
    decipher.setAuthTag(authTag);

    const plaintext = Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]).toString("utf8");
    const envelope = JSON.parse(plaintext);

    if (!envelope || envelope.v !== ENVELOPE_VERSION) {
      throw new Error("Unsupported credential envelope version.");
    }

    if (
      !envelope.fields ||
      typeof envelope.fields !== "object" ||
      Array.isArray(envelope.fields)
    ) {
      throw new Error("Invalid credential field map.");
    }

    return envelope.fields;
  } catch (error) {
    throw new IntegrationCryptoError(
      "unreadable_credential",
      "The stored integration credential could not be read.",
      { cause: error },
    );
  }
}

module.exports = {
  ALGORITHM,
  KEY_BYTES,
  IV_BYTES,
  KEY_VERSION,
  IntegrationCryptoError,
  parseMasterKey,
  encryptionConfigured,
  encryptFields,
  decryptFields,
};
