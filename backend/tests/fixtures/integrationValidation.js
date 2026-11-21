const RECAPTCHA_KEY = `6L${"a".repeat(38)}`;

const values = {
  brevo: { apiKey: "xkeysib-test-only" },
  "google-auth": {
    clientId: "1234567890-testclient.apps.googleusercontent.com",
    clientSecret: "test-client-secret",
  },
  "google-calendar": {
    clientId: "1234567890-testclient.apps.googleusercontent.com",
    clientSecret: "test-client-secret",
    calendarId: "primary",
  },
  "google-sheets": {
    clientId: "1234567890-testclient.apps.googleusercontent.com",
    clientSecret: "test-client-secret",
  },
  recaptcha: {
    secretKey: RECAPTCHA_KEY,
    siteKey: RECAPTCHA_KEY,
  },
};

const googleToken = {
  refreshSuccess: {
    status: 200,
    body: {
      access_token: "ya29.test-only",
      expires_in: 3599,
      scope: "https://www.googleapis.com/auth/calendar.events",
    },
  },
  sheetsSuccess: {
    status: 200,
    body: {
      access_token: "ya29.test-only",
      expires_in: 3599,
      scope: "https://www.googleapis.com/auth/spreadsheets",
    },
  },
  invalidClient: { status: 401, body: { error: "invalid_client" } },
  invalidGrant: { status: 400, body: { error: "invalid_grant" } },
  redirectMismatch: { status: 400, body: { error: "redirect_uri_mismatch" } },
};

module.exports = {
  RECAPTCHA_KEY,
  values,
  googleToken,
};
