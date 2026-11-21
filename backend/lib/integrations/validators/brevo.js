const { fetchProvider, ProviderTransportError } = require("../http");
const { validResult, invalidResult } = require("../result");

const ACCOUNT_URL = "https://api.brevo.com/v3/account";

async function validate({ values, context = {} }) {
  const now = context.now ? context.now() : new Date();
  const checks = [];

  try {
    const response = await fetchProvider(ACCOUNT_URL, {
      method: "GET",
      headers: {
        "api-key": values.apiKey,
        accept: "application/json",
      },
      fetchImpl: context.fetchImpl,
      timeoutMs: context.timeoutMs,
    });

    if (response.status === 200) {
      checks.push({ step: "credentials", ok: true, code: "ok" });

      return validResult({
        checks,
        message: "Brevo accepted this API key.",
        now,
      });
    }

    if (response.status === 401 || response.status === 403) {
      checks.push({
        step: "credentials",
        ok: false,
        code: "invalid_credentials",
      });

      return invalidResult({
        code: "invalid_credentials",
        message: "Brevo rejected this API key.",
        checks,
        now,
      });
    }

    checks.push({ step: "credentials", ok: false, code: "provider_error" });

    return invalidResult({ code: "provider_error", checks, now });
  } catch (error) {
    const code =
      error instanceof ProviderTransportError ? error.code : "provider_error";

    checks.push({ step: "credentials", ok: false, code });

    return invalidResult({ code, checks, now });
  }
}

module.exports = { validate };
