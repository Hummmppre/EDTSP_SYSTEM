const jwt = require("jsonwebtoken");
const { google } = require("googleapis");

const GoogleCalendarCredential = require("../models/GoogleCalendarCredential");
const MaintenanceActivity = require("../models/MaintenanceActivity");
const SystemSettings = require("../models/SystemSettings");

const PROVIDER = "google";
const STATE_PURPOSE = "google-calendar-oauth";
const EVENT_DURATION_MS = 30 * 60 * 1000;

const SCOPES = [
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/userinfo.email",
  "https://www.googleapis.com/auth/drive.file",
];

function integrationError(message, code) {
  const error = new Error(message);

  error.code = code;

  return error;
}

function isDeadCredentialError(error) {
  const reason =
    error && error.response && error.response.data
      ? error.response.data.error
      : null;

  return (
    reason === "invalid_grant" || (error && error.code === "invalid_grant")
  );
}

function getOAuthClient() {
  const clientId = process.env.GOOGLE_CALENDAR_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CALENDAR_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_CALENDAR_REDIRECT_URI;

  if (!clientId || !clientSecret || !redirectUri) return null;

  return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
}

function isConfigured() {
  return Boolean(getOAuthClient());
}

// Administrators can switch the integration off from System Settings.
async function isEnabled() {
  try {
    const settings = await SystemSettings.findOne().lean();

    return !settings || settings.googleCalendarEnabled !== false;
  } catch (error) {
    // A settings lookup failure must not silently stop calendar sync.
    console.error(
      `[google-calendar] Could not read the calendar setting: ${error.message}`,
    );

    return true;
  }
}

function getCalendarId() {
  return process.env.GOOGLE_CALENDAR_ID || "primary";
}

function getTimeZone() {
  return process.env.GOOGLE_CALENDAR_TIMEZONE || "Asia/Manila";
}

async function getCalendarStatus({ verify = false } = {}) {
  const enabled = await isEnabled();
  const configured = isConfigured();

  if (!configured) {
    return {
      enabled,
      configured: false,
      connected: false,
      accountEmail: "",
      calendarId: "",
      needsReconnect: false,
    };
  }

  const credential = await GoogleCalendarCredential.findOne({
    provider: PROVIDER,
  }).lean();

  const envRefreshToken = process.env.GOOGLE_CALENDAR_REFRESH_TOKEN || "";
  const refreshToken =
    (credential && credential.refreshToken) || envRefreshToken;

  const status = {
    enabled,
    configured: true,
    connected: Boolean(refreshToken),
    accountEmail: credential ? credential.accountEmail || "" : "",
    calendarId: getCalendarId(),
    needsReconnect: false,
  };

  if (!enabled || !verify || !refreshToken) return status;

  try {
    await refreshAccessToken();

    return status;
  } catch (error) {
    // A network blip or quota error must not look like a revoked connection.
    if (!isDeadCredentialError(error)) {
      console.warn(
        `[google-calendar] Connection could not be verified: ${error.message}`,
      );

      return status;
    }

    console.warn(
      `[google-calendar] Stored connection was revoked: ${error.message}`,
    );

    if (!envRefreshToken && credential) {
      await GoogleCalendarCredential.deleteOne({ _id: credential._id });
    }

    return {
      ...status,
      connected: false,
      accountEmail: "",
      needsReconnect: true,
    };
  }
}

async function getAuthorizedClient() {
  const client = getOAuthClient();

  if (!client) {
    throw integrationError(
      "Google Calendar is not configured on the server.",
      "not_configured",
    );
  }

  let refreshToken = process.env.GOOGLE_CALENDAR_REFRESH_TOKEN;

  if (!refreshToken) {
    const credential = await GoogleCalendarCredential.findOne({
      provider: PROVIDER,
    });

    refreshToken = credential ? credential.refreshToken : null;
  }

  if (!refreshToken) {
    throw integrationError(
      "Google Calendar is not connected.",
      "not_connected",
    );
  }

  client.setCredentials({ refresh_token: refreshToken });

  return client;
}

async function refreshAccessToken() {
  const client = await getAuthorizedClient();

  await client.refreshAccessToken();

  return client;
}

function buildAuthUrl(state) {
  const client = getOAuthClient();

  if (!client) {
    throw integrationError(
      "Google Calendar is not configured on the server.",
      "not_configured",
    );
  }

  return client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: true,
    scope: SCOPES,
    state,
  });
}

async function exchangeCode(code) {
  const client = getOAuthClient();

  if (!client) {
    throw integrationError(
      "Google Calendar is not configured on the server.",
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
    // The calendar still works without the email; it is display-only.
    console.warn(
      `[google-calendar] Connected account email unavailable: ${error.message}`,
    );
  }

  await GoogleCalendarCredential.findOneAndUpdate(
    { provider: PROVIDER },
    {
      provider: PROVIDER,
      refreshToken: tokens.refresh_token,
      accountEmail,
      calendarId: getCalendarId(),
      connectedAt: new Date(),
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );
}

function fullName(user) {
  if (!user || !user.firstName) return "";

  return `${user.firstName} ${user.lastName || ""}`.trim();
}

async function createEventForActivity({ activity, cow, auth: existingAuth }) {
  if (!(await isEnabled())) {
    throw integrationError(
      "Google Calendar is turned off in system settings.",
      "disabled",
    );
  }

  const auth = existingAuth || (await getAuthorizedClient());
  const calendar = google.calendar({ version: "v3", auth });

  const start = new Date(activity.scheduledFor);

  if (Number.isNaN(start.getTime())) {
    throw integrationError(
      "The maintenance activity has no valid schedule time.",
      "invalid_schedule",
    );
  }

  const end = new Date(start.getTime() + EVENT_DURATION_MS);
  const traineeName = fullName(activity.assignedTrainee) || "Unassigned";

  const description = [
    activity.description,
    "",
    `Cow: ${cow.name} (${cow.cowId})`,
    `Activity: ${activity.type}`,
    `Assigned trainee: ${traineeName}`,
    "",
    "Scheduled from the EDTSP cow maintenance portal.",
  ].join("\n");

  const response = await calendar.events.insert({
    calendarId: getCalendarId(),
    requestBody: {
      summary: `${activity.type} — ${cow.name} (${cow.cowId})`,
      description,
      start: {
        dateTime: start.toISOString(),
        timeZone: getTimeZone(),
      },
      end: {
        dateTime: end.toISOString(),
        timeZone: getTimeZone(),
      },
      reminders: { useDefault: true },
    },
  });

  return {
    id: response.data.id || "",
    htmlLink: response.data.htmlLink || "",
  };
}

// Adds events to pending activities that were scheduled before the calendar was
// connected, or while a sync was failing.
async function syncPendingActivities() {
  if (!(await isEnabled())) {
    throw integrationError(
      "Google Calendar is turned off in system settings.",
      "disabled",
    );
  }

  const auth = await getAuthorizedClient();

  const activities = await MaintenanceActivity.find({
    status: "Pending",
    $or: [{ googleCalendarEventId: null }, { googleCalendarEventId: "" }],
  })
    .populate("cow", "cowId name")
    .populate("assignedTrainee", "firstName lastName")
    .sort({ scheduledFor: 1 })
    .limit(100);

  let synced = 0;
  let failed = 0;

  for (const activity of activities) {
    if (!activity.cow) {
      failed += 1;
      continue;
    }

    try {
      const event = await createEventForActivity({
        activity,
        cow: activity.cow,
        auth,
      });

      activity.googleCalendarEventId = event.id;
      activity.googleCalendarEventLink = event.htmlLink;
      activity.calendarSyncedAt = new Date();

      await activity.save();
      synced += 1;
    } catch (error) {
      console.error("Google Calendar activity sync error:", error);
      failed += 1;
    }
  }

  return { total: activities.length, synced, failed };
}

// Removes the saved connection so no new events are added. Existing events stay
// on the calendar; only the stored refresh token is forgotten and revoked.
async function disconnect() {
  const envRefreshToken = process.env.GOOGLE_CALENDAR_REFRESH_TOKEN || "";
  const credential = await GoogleCalendarCredential.findOne({
    provider: PROVIDER,
  });

  if (!credential) {
    if (envRefreshToken) {
      throw integrationError(
        "This connection comes from the server's GOOGLE_CALENDAR_REFRESH_TOKEN variable. Remove it on the server to disconnect.",
        "env_locked",
      );
    }

    return { disconnected: false, accountEmail: "" };
  }

  const client = getOAuthClient();

  if (client) {
    try {
      await client.revokeToken(credential.refreshToken);
    } catch (error) {
      // The local token is deleted regardless; the admin can also revoke
      // access from their Google account.
      console.warn(`[google-calendar] Token revoke failed: ${error.message}`);
    }
  }

  await GoogleCalendarCredential.deleteOne({ _id: credential._id });

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
    throw new Error("Invalid Google Calendar authorization state.");
  }

  return payload;
}

module.exports = {
  isConfigured,
  isEnabled,
  getCalendarStatus,
  buildAuthUrl,
  exchangeCode,
  createEventForActivity,
  syncPendingActivities,
  disconnect,
  signState,
  verifyState,
};
