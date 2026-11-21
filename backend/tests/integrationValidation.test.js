const test = require("node:test");
const assert = require("node:assert/strict");
const {
  parseMasterKey,
  encryptionConfigured,
  encryptFields,
  decryptFields,
  IntegrationCryptoError,
} = require("../lib/credentialCrypto");
const {
  getStorageTargets,
  getRequiredFields,
  validateFieldNames,
} = require("../lib/integrations/catalog");
const { validateIntegration } = require("../lib/integrations");
const brevo = require("../lib/integrations/validators/brevo");
const googleAuth = require("../lib/integrations/validators/googleAuth");
const googleCalendar = require("../lib/integrations/validators/googleCalendar");
const googleSheets = require("../lib/integrations/validators/googleSheets");
const recaptcha = require("../lib/integrations/validators/recaptcha");
const fixtures = require("./fixtures/integrationValidation");

const MASTER_KEY = Buffer.alloc(32, 7).toString("base64");
const NOW = () => new Date("2026-01-01T00:00:00.000Z");

function response(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function routeFetch(routes) {
  return async (url) => {
    for (const [needle, handler] of routes) {
      if (String(url).includes(needle)) {
        return typeof handler === "function" ? handler(url) : response(handler.status, handler.body);
      }
    }

    throw new Error(`Unexpected provider URL: ${url}`);
  };
}

function context(overrides = {}) {
  return {
    now: NOW,
    timeoutMs: 100,
    fetchImpl: async () => {
      throw new Error("No fetch fixture provided.");
    },
    ...overrides,
  };
}

test("crypto round-trips and binds ciphertext to the storage group", () => {
  const key = parseMasterKey(MASTER_KEY);
  const encrypted = encryptFields("brevo", { apiKey: "secret-value" }, key);

  assert.equal(encrypted.keyVersion, 1);
  assert.ok(encrypted.ciphertext);
  assert.notEqual(encrypted.ciphertext, "secret-value");
  assert.deepEqual(
    decryptFields("brevo", encrypted, key),
    { apiKey: "secret-value" },
  );

  assert.throws(
    () => decryptFields("google-auth", encrypted, key),
    (error) =>
      error instanceof IntegrationCryptoError &&
      error.code === "unreadable_credential",
  );
});

test("crypto rejects tampering and a malformed master key", () => {
  const key = parseMasterKey(MASTER_KEY);
  const encrypted = encryptFields("recaptcha", { secretKey: "abc" }, key);
  const tampered = {
    ...encrypted,
    ciphertext: Buffer.from("different").toString("base64"),
  };

  assert.throws(
    () => decryptFields("recaptcha", tampered, key),
    (error) => error.code === "unreadable_credential",
  );
  assert.equal(encryptionConfigured({ INTEGRATION_ENCRYPTION_KEY: "short" }), false);
  assert.throws(
    () => parseMasterKey("short"),
    (error) => error.code === "encryption_not_configured",
  );
});

test("catalog maps shared Google fields and validates names", () => {
  assert.deepEqual(getStorageTargets("google-calendar"), [
    { storageIntegration: "google-oauth", fields: ["clientId", "clientSecret"] },
    { storageIntegration: "google-calendar", fields: ["calendarId"] },
  ]);
  assert.deepEqual(getRequiredFields("brevo"), ["apiKey"]);
  assert.equal(validateFieldNames("brevo", { nope: "x" }).ok, false);
  assert.equal(
    validateFieldNames("brevo", { apiKey: "x".repeat(513) }).ok,
    false,
  );
});

test("Brevo fixtures map success, rejection, outage, and timeout", async () => {
  const valid = await brevo.validate({
    values: fixtures.values.brevo,
    context: context({
      fetchImpl: routeFetch([["api.brevo.com", { status: 200, body: {} }]]),
    }),
  });

  assert.equal(valid.state, "valid");

  const rejected = await brevo.validate({
    values: fixtures.values.brevo,
    context: context({
      fetchImpl: routeFetch([["api.brevo.com", { status: 401, body: {} }]]),
    }),
  });

  assert.equal(rejected.code, "invalid_credentials");

  const outage = await brevo.validate({
    values: fixtures.values.brevo,
    context: context({
      fetchImpl: routeFetch([["api.brevo.com", { status: 503, body: {} }]]),
    }),
  });

  assert.equal(outage.code, "provider_error");

  const timeout = await brevo.validate({
    values: fixtures.values.brevo,
    context: context({
      fetchImpl: async () => {
        const error = new Error("aborted");

        error.name = "TimeoutError";
        throw error;
      },
    }),
  });

  assert.equal(timeout.code, "timeout");
});

test("Google Auth validates format and treats dummy-code complaints as a valid pair", async () => {
  const badFormat = await googleAuth.validate({
    values: { clientId: "not-a-client", clientSecret: "x" },
    context: context(),
  });

  assert.equal(badFormat.code, "format_invalid");

  const valid = await googleAuth.validate({
    values: fixtures.values["google-auth"],
    context: context({
      fetchImpl: routeFetch([
        ["oauth2.googleapis.com", fixtures.googleToken.redirectMismatch],
      ]),
    }),
  });

  assert.equal(valid.state, "valid");

  const invalid = await googleAuth.validate({
    values: fixtures.values["google-auth"],
    context: context({
      fetchImpl: routeFetch([
        ["oauth2.googleapis.com", fixtures.googleToken.invalidClient],
      ]),
    }),
  });

  assert.equal(invalid.code, "invalid_credentials");
});

test("Calendar returns awaiting_connection without a token and validates a real read", async () => {
  const awaiting = await googleCalendar.validate({
    values: fixtures.values["google-calendar"],
    context: context({
      fetchImpl: routeFetch([
        ["oauth2.googleapis.com", fixtures.googleToken.invalidGrant],
      ]),
    }),
  });

  assert.equal(awaiting.state, "awaiting_connection");

  const valid = await googleCalendar.validate({
    values: fixtures.values["google-calendar"],
    context: context({
      refreshToken: "refresh-token",
      fetchImpl: routeFetch([
        ["oauth2.googleapis.com", fixtures.googleToken.refreshSuccess],
        ["www.googleapis.com/calendar", { status: 200, body: { items: [] } }],
      ]),
    }),
  });

  assert.equal(valid.state, "valid");

  const badCalendar = await googleCalendar.validate({
    values: fixtures.values["google-calendar"],
    context: context({
      refreshToken: "refresh-token",
      fetchImpl: routeFetch([
        ["oauth2.googleapis.com", fixtures.googleToken.refreshSuccess],
        [
          "www.googleapis.com/calendar",
          {
            status: 404,
            body: { error: { code: 404, errors: [{ reason: "notFound" }] } },
          },
        ],
      ]),
    }),
  });

  assert.equal(badCalendar.code, "invalid_calendar_id");
});

test("Calendar separates revoked tokens, missing scopes, and disabled APIs", async () => {
  const revoked = await googleCalendar.validate({
    values: fixtures.values["google-calendar"],
    context: context({
      refreshToken: "refresh-token",
      fetchImpl: routeFetch([
        ["oauth2.googleapis.com", fixtures.googleToken.invalidGrant],
      ]),
    }),
  });

  assert.equal(revoked.code, "needs_reconnect");

  const missingScope = await googleCalendar.validate({
    values: fixtures.values["google-calendar"],
    context: context({
      refreshToken: "refresh-token",
      fetchImpl: routeFetch([
        [
          "oauth2.googleapis.com",
          {
            status: 200,
            body: {
              access_token: "token",
              scope: "https://www.googleapis.com/auth/userinfo.email",
            },
          },
        ],
      ]),
    }),
  });

  assert.equal(missingScope.code, "missing_scope");

  const disabled = await googleCalendar.validate({
    values: fixtures.values["google-calendar"],
    context: context({
      refreshToken: "refresh-token",
      fetchImpl: routeFetch([
        ["oauth2.googleapis.com", fixtures.googleToken.refreshSuccess],
        [
          "www.googleapis.com/calendar",
          {
            status: 403,
            body: {
              error: {
                status: "PERMISSION_DENIED",
                message: "Google Calendar API has not been used in project 1",
              },
            },
          },
        ],
      ]),
    }),
  });

  assert.equal(disabled.code, "api_disabled");
});

test("Sheets validates a Drive read with spreadsheet scopes", async () => {
  const valid = await googleSheets.validate({
    values: fixtures.values["google-sheets"],
    context: context({
      refreshToken: "refresh-token",
      fetchImpl: routeFetch([
        ["oauth2.googleapis.com", fixtures.googleToken.sheetsSuccess],
        ["www.googleapis.com/drive", { status: 200, body: { files: [] } }],
      ]),
    }),
  });

  assert.equal(valid.state, "valid");

  const invalid = await googleSheets.validate({
    values: fixtures.values["google-sheets"],
    context: context({
      refreshToken: "refresh-token",
      fetchImpl: routeFetch([
        ["oauth2.googleapis.com", fixtures.googleToken.invalidGrant],
      ]),
    }),
  });

  assert.equal(invalid.code, "needs_reconnect");
});

test("reCAPTCHA requires both values and valid key shapes", async () => {
  const valid = await recaptcha.validate({
    values: fixtures.values.recaptcha,
    context: context(),
  });

  assert.equal(valid.state, "valid");

  const missing = await recaptcha.validate({
    values: { secretKey: fixtures.RECAPTCHA_KEY },
    context: context(),
  });

  assert.equal(missing.code, "site_key_missing");

  const bad = await recaptcha.validate({
    values: { secretKey: "short", siteKey: "short" },
    context: context(),
  });

  assert.equal(bad.code, "format_invalid");
});

test("registry never throws and does not expose credentials", async () => {
  const unknown = await validateIntegration("unknown", { values: {} });

  assert.equal(unknown.code, "unknown_integration");

  const result = await validateIntegration("brevo", {
    values: fixtures.values.brevo,
    context: context({
      fetchImpl: routeFetch([["api.brevo.com", { status: 200, body: {} }]]),
    }),
  });
  const serialized = JSON.stringify(result);

  assert.equal(result.state, "valid");
  assert.ok(!serialized.includes(fixtures.values.brevo.apiKey));
});
