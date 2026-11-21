const { fetchProvider, ProviderTransportError } = require("../http");
const { validResult, invalidResult, awaitingConnectionResult } = require("../result");
const { verifyClientPair, refreshAccessToken } = require("../googleToken");
const { hasServiceAccess } = require("../googleScopes");
const { readErrorCode } = require("./googleCalendar");

async function validate({ values, context = {} }) {
  const now = context.now ? context.now() : new Date();
  const checks = [];

  if (!context.refreshToken) {
    const pair = await verifyClientPair({
      clientId: values.clientId,
      clientSecret: values.clientSecret,
      redirectUri: context.redirectUri,
      dummyCode: context.dummyCode,
      fetchImpl: context.fetchImpl,
      timeoutMs: context.timeoutMs,
    });

    if (!pair.ok) {
      checks.push({ step: "credentials", ok: false, code: pair.code });

      return invalidResult({
        code: pair.code,
        message:
          pair.code === "invalid_credentials"
            ? "Google rejected this client ID or secret."
            : undefined,
        checks,
        now,
      });
    }

    checks.push({ step: "credentials", ok: true, code: "ok" });

    return awaitingConnectionResult({ checks, now });
  }

  const token = await refreshAccessToken({
    clientId: values.clientId,
    clientSecret: values.clientSecret,
    refreshToken: context.refreshToken,
    fetchImpl: context.fetchImpl,
    timeoutMs: context.timeoutMs,
  });

  if (!token.ok) {
    checks.push({ step: "token", ok: false, code: token.code });

    return invalidResult({ code: token.code, checks, now });
  }

  checks.push({ step: "token", ok: true, code: "ok" });

  if (!hasServiceAccess("sheets", token.scopes)) {
    checks.push({ step: "scope", ok: false, code: "missing_scope" });

    return invalidResult({ code: "missing_scope", checks, now });
  }

  try {
    const response = await fetchProvider(
      "https://www.googleapis.com/drive/v3/files?pageSize=1&fields=files(id)",
      {
        method: "GET",
        headers: {
          authorization: `Bearer ${token.accessToken}`,
          accept: "application/json",
        },
        fetchImpl: context.fetchImpl,
        timeoutMs: context.timeoutMs,
      },
    );

    if (response.status === 200) {
      checks.push({ step: "read", ok: true, code: "ok" });

      return validResult({
        checks,
        message:
          "Google Drive accepted these credentials. Spreadsheet API enablement is not checked.",
        now,
      });
    }

    return readFailure(readErrorCode(response.status, response.body, false), checks, now);
  } catch (error) {
    const code =
      error instanceof ProviderTransportError ? error.code : "provider_error";

    return readFailure(code, checks, now);
  }
}

function readFailure(code, checks, now) {
  checks.push({ step: "read", ok: false, code });

  return invalidResult({ code, checks, now });
}

module.exports = { validate };
