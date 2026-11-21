const { invalidResult } = require("./result");
const brevo = require("./validators/brevo");
const googleAuth = require("./validators/googleAuth");
const googleCalendar = require("./validators/googleCalendar");
const googleSheets = require("./validators/googleSheets");
const recaptcha = require("./validators/recaptcha");

const VALIDATORS = Object.freeze({
  "google-auth": googleAuth.validate,
  brevo: brevo.validate,
  "google-calendar": googleCalendar.validate,
  "google-sheets": googleSheets.validate,
  recaptcha: recaptcha.validate,
});

async function validateIntegration(card, { values, context = {} } = {}) {
  const validator = VALIDATORS[card];

  if (!validator) {
    return invalidResult({
      code: "unknown_integration",
      now: context.now ? context.now() : new Date(),
    });
  }

  try {
    return await validator({ values: values || {}, context });
  } catch (error) {
    console.error(`[integration-validation] ${card} validator failed: ${error.message}`);

    return invalidResult({
      code: "provider_error",
      now: context.now ? context.now() : new Date(),
    });
  }
}

module.exports = {
  VALIDATORS,
  validateIntegration,
};
