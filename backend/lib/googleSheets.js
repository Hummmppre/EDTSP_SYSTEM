const { google } = require("googleapis");

const {
  integrationError,
  isDeadCredentialError,
  isMissingScopeError,
  isServiceEnabled,
  getConnectionStatus,
  markConnectionInvalid,
  getAuthorizedClient,
} = require("./googleConnection");

async function isSheetsEnabled() {
  return isServiceEnabled("sheets");
}

async function getSheetsStatus({ verify = false } = {}) {
  const enabled = await isSheetsEnabled();
  const connection = await getConnectionStatus({ verify });

  return {
    enabled,
    configured: connection.configured,
    accountConnected: connection.connected,
    connected: connection.connected && connection.sheetsAuthorized,
    authorized: connection.sheetsAuthorized,
    accountEmail: connection.connected ? connection.accountEmail : "",
    needsReconnect: connection.needsReconnect,
    reconnectReason: connection.reconnectReason,
    scopes: connection.scopes,
  };
}

function googleErrorMessage(error) {
  const responseError =
    error && error.response && error.response.data
      ? error.response.data.error
      : null;
  const detail =
    (responseError && responseError.message) || error.message || "";

  if (isDeadCredentialError(error)) {
    return "The saved Google connection has expired or was revoked. Reconnect Google in System settings, then export again.";
  }

  if (
    /insufficient authentication scopes|insufficient permission|ACCESS_TOKEN_SCOPE_INSUFFICIENT/i.test(
      detail,
    )
  ) {
    return "The saved Google connection is missing spreadsheet permission. Reconnect Google in System settings and approve Sheets access.";
  }

  if (
    /has not been used in project|is disabled|accessNotConfigured/i.test(detail)
  ) {
    return "The Google Sheets API is not enabled for the EDTSP Google Cloud project. Enable it, then export again.";
  }

  return "Unable to export records to Google Sheets. Check the Google connection in System settings and try again.";
}

async function createExportSpreadsheet({ title, tabName, values }) {
  if (!(await isSheetsEnabled())) {
    throw integrationError(
      "Google Sheets export is turned off in System settings.",
      "disabled",
    );
  }

  // Reuses the same authorized Google account as Calendar, including its
  // securely stored refresh token.
  const auth = await getAuthorizedClient({ service: "sheets" });
  const sheets = google.sheets({ version: "v4", auth });

  try {
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
      requestBody: { values: sanitizeValues(values) },
    });

    return {
      spreadsheetUrl: `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`,
      rowCount: Math.max(values.length - 1, 0),
    };
  } catch (error) {
    if (isDeadCredentialError(error)) {
      await markConnectionInvalid();
    }

    const friendly = new Error(googleErrorMessage(error));

    friendly.code = isDeadCredentialError(error)
      ? "needs_reconnect"
      : isMissingScopeError(error)
        ? "missing_scope"
        : "google_error";
    friendly.cause = error;

    throw friendly;
  }
}

// Sheets rejects null/undefined cells, so every cell becomes text or a number.
function sanitizeValues(values) {
  return values.map((row) =>
    row.map((cell) => {
      if (typeof cell === "number" && Number.isFinite(cell)) return cell;

      return cell === undefined || cell === null ? "" : String(cell);
    }),
  );
}

module.exports = {
  createExportSpreadsheet,
  getSheetsStatus,
  isSheetsEnabled,
};
