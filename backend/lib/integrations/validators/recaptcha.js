const { validResult, invalidResult } = require("../result");

// reCAPTCHA v2/v3 keys are 40 characters and start with 6L or 6A.
const KEY_PATTERN = /^6[LA][A-Za-z0-9_-]{38}$/;

async function validate({ values, context = {} }) {
  const now = context.now ? context.now() : new Date();
  const checks = [];

  if (!values.siteKey) {
    checks.push({ step: "credentials", ok: false, code: "site_key_missing" });

    return invalidResult({ code: "site_key_missing", checks, now });
  }

  if (!KEY_PATTERN.test(String(values.secretKey || ""))) {
    checks.push({ step: "credentials", ok: false, code: "format_invalid" });

    return invalidResult({
      code: "format_invalid",
      message: "The reCAPTCHA secret key format is not valid.",
      checks,
      now,
    });
  }

  if (!KEY_PATTERN.test(String(values.siteKey || ""))) {
    checks.push({ step: "credentials", ok: false, code: "format_invalid" });

    return invalidResult({
      code: "format_invalid",
      message: "The reCAPTCHA site key format is not valid.",
      checks,
      now,
    });
  }

  checks.push({ step: "credentials", ok: true, code: "ok" });

  return validResult({
    checks,
    message:
      "reCAPTCHA key formats are valid. Pairing cannot be verified without a live challenge.",
    now,
  });
}

module.exports = { validate, KEY_PATTERN };
