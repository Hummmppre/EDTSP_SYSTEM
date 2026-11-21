const jwt = require("jsonwebtoken");
const { google } = require("googleapis");

// The model keeps its historical name so existing connections stay readable,
// but the stored credential is the single Google account used by every
// integration.
const GoogleCredential = require("../models/GoogleCalendarCredential");
const SystemSettings = require("../models/SystemSettings");
const {
  SERVICE_SCOPES,
  SCOPES,
  parseScopes,
  hasServiceAccess,
} = require("./integrations/googleScopes");
const { resolveField } = require("./integrationCredentials");

const PROVIDER = "google";
const STATE_PURPOSE = "google-integration-oauth";

const SERVICE_LABELS = {
  calendar: "Google Calendar",
  sheets: "Google Sheets",
};

function integrationError(message, code) {
  const error = new Error(message);

  error.code = code;

  return error;
}

function isDeadCredentialError(error) {
  const data = error && error.response ? error.response.data : null;
  const reason =
    data && typeof data === "object"
      ? data.error || data.error_description || ""
      : "";
  const detail = String(reason || (error && error.message) || "");

  return (
    reason === "invalid_grant" ||
    (error && error.code === "invalid_grant") ||
    /invalid_grant/i.test(detail)
  );
}

function isMissingScopeError(error) {
  const data = error && error.response ? error.response.data : null;
  const detail = [
    data && data.error && data.error.message,
    data && data.error_description,
    error && error.message,
  ]
    .filter(Boolean)
    .join(" ");

  return /insufficient authentication scopes|insufficient permission|ACCESS_TOKEN_SCOPE_INSUFFICIENT/i.test(
    detail,
  );
}

async function getOAuthClient() {
  const [clientId, clientSecret] = await Promise.all([
    resolveField("google-calendar", "clientId"),
    resolveField("google-calendar", "clientSecret"),
  ]);
  const redirectUri = process.env.GOOGLE_CALENDAR_REDIRECT_URI;

  if (!clientId.value || !clientSecret.value || !redirectUri) return null;

  return new google.auth.OAuth2(
    clientId.value,
    clientSecret.value,
    redirectUri,
  );
}

async function isConfigured() {
  return Boolean(await getOAuthClient());
}

// Administrators can switch each integration off independently. A disabled
// integration is blocked without deleting the saved connection or its data.
async function isServiceEnabled(service) {
  const field =
    service === "sheets" ? "googleSheetsEnabled" : "googleCalendarEnabled";

  try {
    const settings = await SystemSettings.findOne().lean();

    return !settings || settings[field] !== false;
  } catch (error) {
    // A settings lookup failure must not silently stop a working integration.
    console.error(
      `[google-${service}] Could not read the integration setting: ${error.message}`,
    );

    return true;
  }
}

async function readConnection() {
  const credential = await GoogleCredential.findOne({
    provider: PROVIDER,
  }).lean();
  const envRefreshToken = process.env.GOOGLE_CALENDAR_REFRESH_TOKEN || "";

  return {
    credential,
    envRefreshToken,
    refreshToken: (credential && credential.refreshToken) || envRefreshToken,
    source: credential
      ? "database"
      : envRefreshToken
        ? "environment"
        : "",
  };
}

function buildConnectionStatus({ credential, refreshToken, source, configured }) {
  const scopes = credential ? credential.scopes || [] : [];

  return {
    configured: Boolean(configured),
    connected: Boolean(refreshToken),
    accountEmail: credential ? credential.accountEmail || "" : "",
    scopes,
    source,
    needsReconnect: false,
    reconnectReason: "",
    calendarAuthorized: hasServiceAccess("calendar", scopes),
    sheetsAuthorized: hasServiceAccess("sheets", scopes),
  };
}

async function readAccountEmail(client) {
  try {
    const userInfo = await google
      .oauth2({ version: "v2", auth: client })
      .userinfo.get();

    return userInfo.data.email || "";
  } catch (error) {
    console.warn(
      `[google] Connected account email unavailable: ${error.message}`,
    );

    return "";
  }
}

async function forgetInvalidCredential({ credential, envRefreshToken }) {
  // Environment tokens are managed on the server, not by the admin portal.
  if (!credential || envRefreshToken) return false;

  await GoogleCredential.deleteOne({ _id: credential._id });

  return true;
}

async function getConnectionStatus({ verify = false } = {}) {
  const { credential, envRefreshToken, refreshToken, source } =
    await readConnection();
  const configured = await isConfigured();
  const status = buildConnectionStatus({
    credential,
    refreshToken,
    source,
    configured,
  });

  if (!status.configured || !status.connected || !verify) return status;

  const client = await getOAuthClient();

  client.setCredentials({ refresh_token: refreshToken });

  try {
    await client.refreshAccessToken();

    // Environment-managed connections have no database record, so read the
    // account email from Google for display when it is missing.
    if (!status.accountEmail) {
      status.accountEmail = await readAccountEmail(client);
    }

    return status;
  } catch (error) {
    // A network blip or quota error must not look like a revoked connection.
    if (!isDeadCredentialError(error)) {
      console.warn(
        `[google] Connection could not be verified: ${error.message}`,
      );

      return status;
    }

    console.warn(`[google] Stored connection was revoked: ${error.message}`);

    await forgetInvalidCredential({ credential, envRefreshToken });

    return {
      ...status,
      connected: false,
      accountEmail: "",
      needsReconnect: true,
      reconnectReason:
        "The saved Google connection expired or was revoked. Reconnect the Google account to resume.",
    };
  }
}

// Deletes a stored credential that Google has rejected. Environment tokens are
// left alone because the server owns them.
async function markConnectionInvalid() {
  const { credential, envRefreshToken } = await readConnection();

  return forgetInvalidCredential({ credential, envRefreshToken });
}

async function getAuthorizedClient({ service } = {}) {
  const client = await getOAuthClient();

  if (!client) {
    throw integrationError(
      "Google integrations are not configured on the server.",
      "not_configured",
    );
  }

  const { credential, refreshToken } = await readConnection();

  if (!refreshToken) {
    throw integrationError(
      `${SERVICE_LABELS[service] || "Google"} is not connected. Connect a Google account in System settings.`,
      "not_connected",
    );
  }

  if (service && credential && !hasServiceAccess(service, credential.scopes)) {
    throw integrationError(
      `The saved Google connection does not include ${SERVICE_LABELS[service]} access. Reconnect the Google account and approve the requested permissions.`,
      "missing_scope",
    );
  }

  client.setCredentials({ refresh_token: refreshToken });

  return client;
}

async function buildAuthUrl(state) {
  const client = await getOAuthClient();

  if (!client) {
    throw integrationError(
      "Google integrations are not configured on the server.",
      "not_configured",
    );
  }

  // prompt: "consent" and access_type: "offline" keep Google's consent screen
  // in the flow and guarantee a refresh token for background use.
  return client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: true,
    scope: SCOPES,
    state,
  });
}

async function exchangeCode(code) {
  const client = await getOAuthClient();

  if (!client) {
    throw integrationError(
      "Google integrations are not configured on the server.",
      "not_configured",
    );
  }

  const { tokens } = await client.getToken(code);

  if (!tokens || !tokens.refresh_token) {
    throw integrationError(
      "Google did not return a refresh token. Reconnect and allow offline access.",
      "no_refresh_token",
    );
  }

  client.setCredentials(tokens);

  let accountEmail = "";

  try {
    const userInfo = await google
      .oauth2({ version: "v2", auth: client })
      .userinfo.get();

    accountEmail = userInfo.data.email || "";
  } catch (error) {
    // The integration still works without the email; it is display-only.
    console.warn(`[google] Connected account email unavailable: ${error.message}`);
  }

  const existing = await GoogleCredential.findOne({
    provider: PROVIDER,
  }).lean();
  const grantedScopes = parseScopes(tokens.scope);

  if (!accountEmail) {
    accountEmail = (existing && existing.accountEmail) || "";
  }

  await GoogleCredential.findOneAndUpdate(
    { provider: PROVIDER },
    {
      provider: PROVIDER,
      refreshToken: tokens.refresh_token,
      scopes: grantedScopes.length
        ? grantedScopes
        : (existing && existing.scopes) || [],
      accountEmail,
      connectedAt: new Date(),
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );
}

async function disconnect() {
  const { credential, envRefreshToken } = await readConnection();

  if (!credential) {
    if (envRefreshToken) {
      throw integrationError(
        "This connection comes from the server's GOOGLE_CALENDAR_REFRESH_TOKEN variable. Remove it on the server to disconnect.",
        "env_locked",
      );
    }

    return { disconnected: false, accountEmail: "" };
  }

  const client = await getOAuthClient();

  if (client) {
    try {
      await client.revokeToken(credential.refreshToken);
    } catch (error) {
      // The local token is deleted regardless; the admin can also revoke
      // access from their Google account.
      console.warn(`[google] Token revoke failed: ${error.message}`);
    }
  }

  await GoogleCredential.deleteOne({ _id: credential._id });

  return {
    disconnected: true,
    accountEmail: credential.accountEmail || "",
  };
}

function signState({ adminId, returnTo }) {
  return jwt.sign(
    {
      purpose: STATE_PURPOSE,
      adminId: String(adminId),
      returnTo: returnTo || "",
    },
    process.env.JWT_SECRET,
    { expiresIn: "10m" },
  );
}

function verifyState(state) {
  const payload = jwt.verify(state, process.env.JWT_SECRET);

  if (!payload || payload.purpose !== STATE_PURPOSE) {
    throw new Error("Invalid Google authorization state.");
  }

  return payload;
}

module.exports = {
  SCOPES,
  SERVICE_LABELS,
  SERVICE_SCOPES,
  parseScopes,
  hasServiceAccess,
  integrationError,
  isDeadCredentialError,
  isMissingScopeError,
  isConfigured,
  isServiceEnabled,
  getConnectionStatus,
  markConnectionInvalid,
  getAuthorizedClient,
  buildAuthUrl,
  exchangeCode,
  disconnect,
  signState,
  verifyState,
};
