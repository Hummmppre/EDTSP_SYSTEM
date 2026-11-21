const User = require("../models/User");
const IntegrationAudit = require("../models/IntegrationAudit");
const { CARD_INTEGRATIONS } = require("../lib/integrations/catalog");
const { validateIntegration } = require("../lib/integrations");
const { recordAudit } = require("../lib/integrationAudit");
const {
  upsertValidationStatus,
  resetValidationStatus,
  credentialUpdatedAtFor,
} = require("../lib/integrationStatus");
const {
  CredentialWriteError,
  resolveForValidation,
  resolveIntegration,
  getMetadata,
  saveOverride,
  clearOverride,
  encryptionConfigured,
} = require("../lib/integrationCredentials");
const { IntegrationCryptoError } = require("../lib/credentialCrypto");
const { readConnection } = require("../lib/googleConnection");

const GOOGLE_CARDS = new Set(["google-calendar", "google-sheets"]);

function sendError(res, status, code, message, extra = {}) {
  return res.status(status).json({
    success: false,
    code,
    message,
    ...extra,
  });
}

function parseFieldsBody(body) {
  if (body === undefined || body === null) {
    return { ok: true, fields: {} };
  }

  if (typeof body !== "object" || Array.isArray(body)) {
    return {
      ok: false,
      code: "invalid_field",
      message: "The request body must be an object.",
    };
  }

  const raw = body.fields === undefined ? {} : body.fields;

  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return {
      ok: false,
      code: "invalid_field",
      message: "The fields value must be an object.",
    };
  }

  const fields = {};

  for (const [name, value] of Object.entries(raw)) {
    if (typeof value !== "string") {
      return {
        ok: false,
        code: "invalid_field",
        message: "Credential values must be strings.",
        field: name,
      };
    }

    const trimmed = value.trim();

    if (!trimmed) continue;

    if (trimmed.length > 512) {
      return {
        ok: false,
        code: "invalid_field",
        message: "A credential value is too long.",
        field: name,
      };
    }

    fields[name] = trimmed;
  }

  return { ok: true, fields };
}

function serializeValidation(result) {
  return {
    valid: Boolean(result.valid),
    state: result.state,
    code: result.code,
    message: result.message,
    checkedAt: result.checkedAt,
    checks: Array.isArray(result.checks) ? result.checks : [],
  };
}

function assertCard(req, res) {
  const card = req.params.integration;

  if (!CARD_INTEGRATIONS.includes(card)) {
    sendError(res, 400, "unknown_integration", "This integration is not available.");
    return null;
  }

  return card;
}

async function adminFor(req) {
  if (!req.user || !req.user.id) return { id: null, email: "unknown" };

  try {
    const user = await User.findById(req.user.id).select("email").lean();

    return { id: req.user.id, email: user ? user.email : "unknown" };
  } catch (error) {
    return { id: req.user.id, email: "unknown" };
  }
}

async function validationContext(card, req) {
  const context = {
    redirectUri: process.env.GOOGLE_CALENDAR_REDIRECT_URI || "http://localhost",
  };

  if (GOOGLE_CARDS.has(card)) {
    try {
      const connection = await readConnection();

      context.refreshToken = connection.refreshToken || "";
      context.scopes =
        connection.credential && Array.isArray(connection.credential.scopes)
          ? connection.credential.scopes
          : [];
    } catch (error) {
      context.refreshToken = "";
      context.scopes = [];
    }
  }

  return context;
}

function fieldErrors(errors) {
  const first = errors[0];

  return {
    code: first ? first.code : "invalid_field",
    field: first ? first.field : undefined,
    message:
      first && first.code === "unknown_field"
        ? "The request contains an unknown credential field."
        : "A credential value is invalid.",
  };
}

async function testIntegration(req, res) {
  const card = assertCard(req, res);

  if (!card) return;

  try {
    const parsed = parseFieldsBody(req.body);

    if (!parsed.ok) {
      return sendError(res, 400, parsed.code, parsed.message, {
        field: parsed.field,
      });
    }

    const resolved = await resolveForValidation(card, parsed.fields);

    if (resolved.errors.length) {
      const error = fieldErrors(resolved.errors);

      return sendError(res, 400, error.code, error.message, {
        field: error.field,
      });
    }

    if (resolved.unreadable && resolved.missing.length) {
      return sendError(
        res,
        409,
        "unreadable_credential",
        "A saved credential could not be read. Enter all required values to replace it, or clear it.",
      );
    }

    if (resolved.missing.length) {
      return sendError(
        res,
        400,
        "missing_field",
        `Missing required fields: ${resolved.missing.join(", ")}.`,
        { field: resolved.missing[0] },
      );
    }

    const result = await validateIntegration(card, {
      values: resolved.values,
      context: await validationContext(card, req),
    });
    const admin = await adminFor(req);

    await recordAudit({
      card,
      action: "test",
      outcome: result.valid ? "success" : "failure",
      code: result.code,
      admin,
      ip: req.ip,
    });

    return res.status(200).json({
      success: true,
      ...serializeValidation(result),
    });
  } catch (error) {
    console.error("Integration test error:", error);

    return sendError(
      res,
      500,
      "internal_error",
      "The integration could not be tested.",
    );
  }
}

async function saveIntegration(req, res) {
  const card = assertCard(req, res);

  if (!card) return;

  try {
    if (!encryptionConfigured()) {
      return sendError(
        res,
        503,
        "encryption_not_configured",
        "Integration credential encryption is not configured on the server.",
      );
    }

    const parsed = parseFieldsBody(req.body);

    if (!parsed.ok) {
      return sendError(res, 400, parsed.code, parsed.message, {
        field: parsed.field,
      });
    }

    const resolved = await resolveForValidation(card, parsed.fields);

    if (resolved.errors.length) {
      const error = fieldErrors(resolved.errors);

      return sendError(res, 400, error.code, error.message, {
        field: error.field,
      });
    }

    if (resolved.missing.length) {
      if (resolved.unreadable) {
        return sendError(
          res,
          409,
          "unreadable_credential",
          "A saved credential could not be read. Enter all required values to replace it, or clear it.",
        );
      }

      return sendError(
        res,
        400,
        "missing_field",
        `Missing required fields: ${resolved.missing.join(", ")}.`,
        { field: resolved.missing[0] },
      );
    }

    const result = await validateIntegration(card, {
      values: resolved.values,
      context: await validationContext(card, req),
    });

    if (
      result.state === "awaiting_connection" &&
      !GOOGLE_CARDS.has(card)
    ) {
      return sendError(
        res,
        422,
        "provider_error",
        "The provider could not complete validation.",
      );
    }

    if (!result.valid && result.state !== "awaiting_connection") {
      const admin = await adminFor(req);

      await recordAudit({
        card,
        action: "save",
        outcome: "failure",
        code: result.code,
        admin,
        ip: req.ip,
      });

      return sendError(res, 422, result.code, result.message, {
        state: result.state,
      });
    }

    let metadata = await saveOverride({
      card,
      fields: resolved.values,
      adminId: req.user.id,
    });
    const admin = await adminFor(req);

    // The credential write is the commit point. Status and audit failures must
    // not turn a successful save into an error response.
    try {
      const credentialUpdatedAt = await credentialUpdatedAtFor(card);

      await upsertValidationStatus({
        card,
        valid: result.valid,
        state: result.state,
        code: result.code,
        message: result.message,
        checkedAt: result.checkedAt,
        credentialUpdatedAt,
      });
      metadata = (await getMetadata(card)) || metadata;
    } catch (statusError) {
      console.error("Integration status update error:", statusError.message);
    }

    await recordAudit({
      card,
      action: "save",
      outcome: "success",
      code: result.code,
      admin,
      ip: req.ip,
    });

    return res.status(200).json({
      success: true,
      integration: metadata,
    });
  } catch (error) {
    if (error instanceof IntegrationCryptoError) {
      return sendError(res, error.httpStatus, error.code, error.message);
    }

    if (error instanceof CredentialWriteError) {
      const admin = await adminFor(req);

      await recordAudit({
        card,
        action: "save",
        outcome: "failure",
        code: error.code,
        admin,
        ip: req.ip,
      });

      return sendError(res, 500, error.code, error.message);
    }

    if (error && (error.code === "unknown_field" || error.code === "invalid_field" || error.code === "missing_field")) {
      return sendError(res, 400, error.code, "A credential value is invalid.", {
        field: error.field,
      });
    }

    console.error("Integration save error:", error);

    return sendError(
      res,
      500,
      "internal_error",
      "The integration credential could not be saved.",
    );
  }
}

async function clearIntegration(req, res) {
  const card = assertCard(req, res);

  if (!card) return;

  try {
    if (!encryptionConfigured()) {
      return sendError(
        res,
        503,
        "encryption_not_configured",
        "Integration credential encryption is not configured on the server.",
      );
    }

    const { clearedKeys } = await clearOverride(card);
    const affected = card === "google-calendar" || card === "google-sheets"
      ? ["google-calendar", "google-sheets"]
      : [card];

    for (const affectedCard of affected) {
      try {
        const resolved = await resolveIntegration(affectedCard);

        await resetValidationStatus(
          affectedCard,
          resolved.complete ? "unverified" : "not_configured",
        );
      } catch (statusError) {
        console.error("Integration status reset error:", statusError.message);
      }
    }

    const admin = await adminFor(req);

    await recordAudit({
      card,
      action: "clear",
      outcome: "success",
      code: "ok",
      admin,
      ip: req.ip,
    });

    const integrations = {};

    for (const affectedCard of affected) {
      try {
        integrations[affectedCard] = await getMetadata(affectedCard);
      } catch (metadataError) {
        console.error("Integration metadata error:", metadataError.message);
      }
    }

    return res.status(200).json({
      success: true,
      clearedKeys,
      integrations,
    });
  } catch (error) {
    if (error instanceof IntegrationCryptoError) {
      return sendError(res, error.httpStatus, error.code, error.message);
    }

    console.error("Integration clear error:", error);

    return sendError(
      res,
      500,
      "internal_error",
      "The integration credential could not be cleared.",
    );
  }
}

async function listAudit(req, res) {
  try {
    const limitRaw = req.query.limit === undefined ? "20" : String(req.query.limit);
    const limit = Number(limitRaw);

    if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
      return sendError(res, 400, "invalid_field", "Limit must be between 1 and 100.");
    }

    const beforeRaw = req.query.before;

    if (beforeRaw !== undefined && beforeRaw !== "") {
      const before = new Date(String(beforeRaw));

      if (Number.isNaN(before.getTime())) {
        return sendError(res, 400, "invalid_field", "The before value is not a valid date.");
      }
    }

    const query = {};

    if (beforeRaw) query.createdAt = { $lt: new Date(String(beforeRaw)) };

    const rows = await IntegrationAudit.find(query)
      .sort({ createdAt: -1 })
      .limit(limit + 1)
      .select(
        "integration action outcome code adminId adminEmail ip createdAt",
      )
      .lean();
    const hasMore = rows.length > limit;
    const entries = hasMore ? rows.slice(0, limit) : rows;

    return res.status(200).json({
      success: true,
      entries,
      nextBefore: hasMore
        ? entries[entries.length - 1].createdAt
        : null,
    });
  } catch (error) {
    console.error("Integration audit list error:", error);

    return sendError(res, 500, "internal_error", "Activity could not be loaded.");
  }
}

async function buildIntegrationMetadata() {
  const entries = await Promise.all(
    CARD_INTEGRATIONS.map(async (card) => [card, await getMetadata(card)]),
  );

  return Object.fromEntries(entries);
}

module.exports = {
  buildIntegrationMetadata,
  testIntegration,
  saveIntegration,
  clearIntegration,
  listAudit,
  parseFieldsBody,
  serializeValidation,
};
