const { validResult, invalidResult } = require("../result");
const { verifyClientPair } = require("../googleToken");

const CLIENT_ID_PATTERN = /^[0-9]+-[a-z0-9]+\.apps\.googleusercontent\.com$/i;

async function validate({ values, context = {} }) {
  const now = context.now ? context.now() : new Date();
  const checks = [];

  if (!CLIENT_ID_PATTERN.test(String(values.clientId || ""))) {
    checks.push({ step: "credentials", ok: false, code: "format_invalid" });

    return invalidResult({
      code: "format_invalid",
      message: "The Google client ID format is not valid.",
      checks,
      now,
    });
  }

  const result = await verifyClientPair({
    clientId: values.clientId,
    clientSecret: values.clientSecret,
    redirectUri: context.redirectUri,
    dummyCode: context.dummyCode,
    fetchImpl: context.fetchImpl,
    timeoutMs: context.timeoutMs,
  });

  if (result.ok) {
    checks.push({ step: "credentials", ok: true, code: "ok" });

    return validResult({
      checks,
      message: "Google accepted this OAuth client pair.",
      now,
    });
  }

  checks.push({ step: "credentials", ok: false, code: result.code });

  return invalidResult({
    code: result.code,
    message:
      result.code === "invalid_credentials"
        ? "Google rejected this client ID or secret."
        : undefined,
    checks,
    now,
  });
}

module.exports = { validate, CLIENT_ID_PATTERN };
