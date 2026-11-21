const { fetchProvider, ProviderTransportError } = require("../http");
const { validResult, invalidResult, awaitingConnectionResult } = require("../result");
const { verifyClientPair, refreshAccessToken } = require("../googleToken");
const { hasServiceAccess } = require("../googleScopes");

function bodyText(body) {
  if (!body || typeof body !== "object") return "";

  const error = body.error;

  if (!error || typeof error !== "object") return String(error || "");

  return [
    error.status,
    error.message,
    ...(Array.isArray(error.errors)
      ? error.errors.map((entry) => entry && entry.reason)
      : []),
  ]
    .filter(Boolean)
    .join(" ");
}

function readErrorCode(status, body, isCalendar) {
  const detail = bodyText(body);

  if (status === 401) return "needs_reconnect";
  if (status === 404 && isCalendar) return "invalid_calendar_id";

  if (/accessNotConfigured|SERVICE_DISABLED|has not been used in project|is disabled/i.test(detail)) {
    return "api_disabled";
  }

  if (
    /insufficient authentication scopes|insufficient permission|insufficientPermissions|ACCESS_TOKEN_SCOPE_INSUFFICIENT/i.test(
      detail,
    )
  ) {
    return "missing_scope";
  }

  if (status === 403) return "missing_scope";

  return "provider_error";
}

function readFailure(code, checks, now) {
  checks.push({ step: "read", ok: false, code });

  return invalidResult({ code, checks, now });
}

async function validate({ values, context = {} }) {
  const now = context.now ? context.now() : new Date();
  const checks = [];
  const calendarId = String(values.calendarId || "primary");

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

  if (!hasServiceAccess("calendar", token.scopes)) {
    checks.push({ step: "scope", ok: false, code: "missing_scope" });

    return invalidResult({ code: "missing_scope", checks, now });
  }

  try {
    const response = await fetchProvider(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(
        calendarId,
      )}/events?maxResults=1&fields=items(id)`,
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
        message: "Google Calendar accepted these credentials.",
        now,
      });
    }

    return readFailure(
      readErrorCode(response.status, response.body, true),
      checks,
      now,
    );
  } catch (error) {
    const code =
      error instanceof ProviderTransportError ? error.code : "provider_error";

    return readFailure(code, checks, now);
  }
}

module.exports = { validate, readErrorCode };
