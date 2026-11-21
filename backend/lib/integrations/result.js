const MESSAGES = Object.freeze({
  ok: "Validation passed.",
  format_invalid: "This value does not match the provider's expected key format.",
  site_key_missing: "Enter both the reCAPTCHA site key and secret key.",
  invalid_credentials: "The provider rejected these credentials.",
  needs_reconnect:
    "The saved Google connection expired or was revoked. Reconnect Google, then validate again.",
  missing_scope:
    "The Google connection is missing the permission this integration needs. Reconnect Google and approve it.",
  invalid_calendar_id:
    "That calendar ID could not be read with the connected Google account.",
  api_disabled: "The required Google API is not enabled for this project.",
  network_error: "The provider could not be reached. Nothing was saved.",
  timeout: "The provider did not answer within 8 seconds. Nothing was saved.",
  provider_error:
    "The provider returned an unexpected response. Nothing was saved.",
  awaiting_connection:
    "OAuth credentials are valid. Connect Google to finish validation.",
  unknown_integration: "This integration is not available.",
  unknown_field: "The request contains an unknown credential field.",
  missing_field: "A required credential field is missing.",
  invalid_field: "A credential value is invalid.",
});

function validResult({ checks = [], message = MESSAGES.ok, now = new Date() } = {}) {
  return {
    valid: true,
    state: "valid",
    code: "ok",
    message,
    checkedAt: now,
    checks,
  };
}

function invalidResult({
  code,
  message,
  checks = [],
  now = new Date(),
} = {}) {
  const safeCode = code || "provider_error";

  return {
    valid: false,
    state: "invalid",
    code: safeCode,
    message: message || MESSAGES[safeCode] || MESSAGES.provider_error,
    checkedAt: now,
    checks,
  };
}

function awaitingConnectionResult({
  checks = [],
  message = MESSAGES.awaiting_connection,
  now = new Date(),
} = {}) {
  return {
    valid: false,
    state: "awaiting_connection",
    code: "awaiting_connection",
    message,
    checkedAt: now,
    checks,
  };
}

module.exports = {
  MESSAGES,
  validResult,
  invalidResult,
  awaitingConnectionResult,
};
