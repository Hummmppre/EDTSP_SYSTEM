const { google } = require("googleapis");
const GoogleCalendarCredential = require("../models/GoogleCalendarCredential");
const SystemSettings = require("../models/SystemSettings");

// Administrators can switch the integration off from System Settings.
async function isSheetsEnabled() {
  try {
    const settings = await SystemSettings.findOne().lean();

    return !settings || settings.googleSheetsEnabled !== false;
  } catch (error) {
    // A settings lookup failure must not silently block exports.
    console.error(
      `[google-sheets] Could not read the sheets setting: ${error.message}`,
    );

    return true;
  }
}

async function createExportSpreadsheet({ title, tabName, values }) {
  if (!(await isSheetsEnabled())) {
    const error = new Error(
      "Google Sheets export is turned off in System settings.",
    );

    error.code = "disabled";

    throw error;
  }

  const clientId = process.env.GOOGLE_CALENDAR_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CALENDAR_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_CALENDAR_REDIRECT_URI;

  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error("Google integration credentials are not configured.");
  }

  const credential = await GoogleCalendarCredential.findOne({
    provider: "google",
  }).lean();

  if (!credential?.refreshToken) {
    throw new Error(
      "Google is not connected. Connect it and approve spreadsheet access.",
    );
  }

  const auth = new google.auth.OAuth2(clientId, clientSecret, redirectUri);
  auth.setCredentials({ refresh_token: credential.refreshToken });

  const sheets = google.sheets({ version: "v4", auth });

  const created = await sheets.spreadsheets.create({
    requestBody: {
      properties: { title },
      sheets: [{ properties: { title: tabName } }],
    },
  });

  const spreadsheetId = created.data.spreadsheetId;
  const escapedTabName = tabName.replace(/'/g, "''");

  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `'${escapedTabName}'!A1`,
    valueInputOption: "RAW",
    requestBody: { values },
  });

  return {
    spreadsheetUrl: `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`,
  };
}

module.exports = { createExportSpreadsheet, isSheetsEnabled };
