const jwt = require("jsonwebtoken");
const { google } = require("googleapis");

const GoogleCalendarCredential = require("../models/GoogleCalendarCredential");

const PROVIDER = "google";
const STATE_PURPOSE = "google-calendar-oauth";
const EVENT_DURATION_MS = 30 * 60 * 1000;

const SCOPES = [
    "https://www.googleapis.com/auth/calendar.events",
    "https://www.googleapis.com/auth/userinfo.email"
];

function integrationError(message, code) {
    const error = new Error(message);

    error.code = code;

    return error;
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

function getCalendarId() {
    return process.env.GOOGLE_CALENDAR_ID || "primary";
}

function getTimeZone() {
    return process.env.GOOGLE_CALENDAR_TIMEZONE || "Asia/Manila";
}

async function getCalendarStatus() {
    const configured = isConfigured();

    if (!configured) {
        return {
            configured: false,
            connected: false,
            accountEmail: "",
            calendarId: ""
        };
    }

    const credential = await GoogleCalendarCredential.findOne({
        provider: PROVIDER
    }).lean();

    const refreshToken =
        (credential && credential.refreshToken) ||
        process.env.GOOGLE_CALENDAR_REFRESH_TOKEN;

    return {
        configured: true,
        connected: Boolean(refreshToken),
        accountEmail: credential ? credential.accountEmail || "" : "",
        calendarId: getCalendarId()
    };
}

async function getAuthorizedClient() {
    const client = getOAuthClient();

    if (!client) {
        throw integrationError(
            "Google Calendar is not configured on the server.",
            "not_configured"
        );
    }

    let refreshToken = process.env.GOOGLE_CALENDAR_REFRESH_TOKEN;

    if (!refreshToken) {
        const credential = await GoogleCalendarCredential.findOne({
            provider: PROVIDER
        });

        refreshToken = credential ? credential.refreshToken : null;
    }

    if (!refreshToken) {
        throw integrationError(
            "Google Calendar is not connected.",
            "not_connected"
        );
    }

    client.setCredentials({ refresh_token: refreshToken });

    return client;
}

function buildAuthUrl(state) {
    const client = getOAuthClient();

    if (!client) {
        throw integrationError(
            "Google Calendar is not configured on the server.",
            "not_configured"
        );
    }

    return client.generateAuthUrl({
        access_type: "offline",
        prompt: "consent",
        include_granted_scopes: true,
        scope: SCOPES,
        state
    });
}

async function exchangeCode(code) {
    const client = getOAuthClient();

    if (!client) {
        throw integrationError(
            "Google Calendar is not configured on the server.",
            "not_configured"
        );
    }

    const { tokens } = await client.getToken(code);

    if (!tokens || !tokens.refresh_token) {
        throw integrationError(
            "Google did not return a refresh token. Reconnect and allow offline access.",
            "no_refresh_token"
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
            `[google-calendar] Connected account email unavailable: ${error.message}`
        );
    }

    await GoogleCalendarCredential.findOneAndUpdate(
        { provider: PROVIDER },
        {
            provider: PROVIDER,
            refreshToken: tokens.refresh_token,
            accountEmail,
            calendarId: getCalendarId(),
            connectedAt: new Date()
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
    );
}

function fullName(user) {
    if (!user || !user.firstName) return "";

    return `${user.firstName} ${user.lastName || ""}`.trim();
}

async function createEventForActivity({ activity, cow }) {
    const auth = await getAuthorizedClient();
    const calendar = google.calendar({ version: "v3", auth });

    const start = new Date(activity.scheduledFor);

    if (Number.isNaN(start.getTime())) {
        throw integrationError(
            "The maintenance activity has no valid schedule time.",
            "invalid_schedule"
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
        "Scheduled from the EDTSP cow maintenance portal."
    ].join("\n");

    const response = await calendar.events.insert({
        calendarId: getCalendarId(),
        requestBody: {
            summary: `${activity.type} — ${cow.name} (${cow.cowId})`,
            description,
            start: {
                dateTime: start.toISOString(),
                timeZone: getTimeZone()
            },
            end: {
                dateTime: end.toISOString(),
                timeZone: getTimeZone()
            },
            reminders: { useDefault: true }
        }
    });

    return {
        id: response.data.id || "",
        htmlLink: response.data.htmlLink || ""
    };
}

function signState({ adminId, returnTo }) {
    return jwt.sign(
        {
            purpose: STATE_PURPOSE,
            adminId: String(adminId),
            returnTo: returnTo || ""
        },
        process.env.JWT_SECRET,
        { expiresIn: "10m" }
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
    getCalendarStatus,
    buildAuthUrl,
    exchangeCode,
    createEventForActivity,
    signState,
    verifyState
};
