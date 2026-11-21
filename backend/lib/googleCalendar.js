const { google } = require("googleapis");

const MaintenanceActivity = require("../models/MaintenanceActivity");
const { resolveField } = require("./integrationCredentials");
const {
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
} = require("./googleConnection");

const EVENT_DURATION_MS = 30 * 60 * 1000;

async function getCalendarId() {
  const field = await resolveField("google-calendar", "calendarId");

  return field.value || "primary";
}

function getTimeZone() {
  return process.env.GOOGLE_CALENDAR_TIMEZONE || "Asia/Manila";
}

async function isEnabled() {
  return isServiceEnabled("calendar");
}

async function getCalendarStatus({ verify = false } = {}) {
  const enabled = await isEnabled();
  const connection = await getConnectionStatus({ verify });
  const calendarId = connection.configured ? await getCalendarId() : "";

  return {
    enabled,
    configured: connection.configured,
    accountConnected: connection.connected,
    connected: connection.connected && connection.calendarAuthorized,
    authorized: connection.calendarAuthorized,
    accountEmail: connection.connected ? connection.accountEmail : "",
    calendarId,
    needsReconnect: connection.needsReconnect,
    reconnectReason: connection.reconnectReason,
    scopes: connection.scopes,
  };
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

  const auth = existingAuth || (await getAuthorizedClient({ service: "calendar" }));
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

  let response;

  try {
    response = await calendar.events.insert({
      calendarId: await getCalendarId(),
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
  } catch (error) {
    if (isDeadCredentialError(error)) {
      await markConnectionInvalid();
      throw integrationError(
        "The Google connection expired or was revoked. Reconnect the Google account in System settings, then try again.",
        "needs_reconnect",
      );
    }

    if (isMissingScopeError(error)) {
      throw integrationError(
        "The saved Google connection is missing Calendar access. Reconnect the Google account in System settings and approve the requested permissions.",
        "missing_scope",
      );
    }

    throw error;
  }

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

  const auth = await getAuthorizedClient({ service: "calendar" });

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
      if (
        error.code === "needs_reconnect" ||
        error.code === "missing_scope" ||
        error.code === "not_connected"
      ) {
        // Retrying the remaining activities cannot succeed without consent.
        throw error;
      }

      console.error("Google Calendar activity sync error:", error);
      failed += 1;
    }
  }

  return { total: activities.length, synced, failed };
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
