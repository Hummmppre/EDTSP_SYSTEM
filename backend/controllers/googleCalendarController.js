const {
    isConfigured,
    getCalendarStatus,
    buildAuthUrl,
    exchangeCode,
    syncPendingActivities,
    disconnect,
    signState,
    verifyState
} = require("../lib/googleCalendar");
const { getSheetsStatus } = require("../lib/googleSheets");
const User = require("../models/User");
const { readConnection } = require("../lib/googleConnection");
const { validateIntegration } = require("../lib/integrations");
const {
    resolveForValidation
} = require("../lib/integrationCredentials");
const {
    upsertValidationStatus,
    credentialUpdatedAtFor
} = require("../lib/integrationStatus");
const { recordAudit } = require("../lib/integrationAudit");

function escapeHtml(value) {
    return String(value === undefined || value === null ? "" : value).replace(
        /[&<>"']/g,
        character => {
            const entities = {
                "&": "&amp;",
                "<": "&lt;",
                ">": "&gt;",
                '"': "&quot;",
                "'": "&#39;"
            };

            return entities[character];
        }
    );
}

function safeReturnTo(value) {
    if (!value) return null;

    try {
        const url = new URL(String(value));

        if (url.protocol !== "http:" && url.protocol !== "https:") {
            return null;
        }

        return url.toString();
    } catch (error) {
        return null;
    }
}

function resultPage(title, message, isError = false) {
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${escapeHtml(title)} | EDTSP</title>
    <style>
        body { font-family: Georgia, "Times New Roman", serif; background: #f2ede1; color: #161c14; margin: 0; padding: 48px 20px; }
        main { max-width: 520px; margin: 0 auto; background: #fffdf7; border: 1px solid #d9d2c0; border-radius: 10px; padding: 28px; }
        h1 { font-size: 1.4rem; margin: 0 0 12px; color: ${isError ? "#a4262c" : "#315c3b"}; }
        p { line-height: 1.6; margin: 0; }
        a { color: #315c3b; }
    </style>
</head>
<body>
    <main>
        <h1>${escapeHtml(title)}</h1>
        <p>${escapeHtml(message)}</p>
    </main>
</body>
</html>`;
}

function finishAuthorization(res, returnTo, connected, message) {
    if (returnTo) {
        const url = new URL(returnTo);

        url.searchParams.set("google", connected ? "connected" : "error");
        url.searchParams.set("calendar", connected ? "connected" : "error");

        if (!connected) {
            url.searchParams.set("googleReason", message);
            url.searchParams.set("calendarReason", message);
        }

        return res.redirect(url.toString());
    }

    return res
        .status(connected ? 200 : 400)
        .send(
            resultPage(
                connected ? "Google connected" : "Google not connected",
                connected
                    ? "You can close this tab and return to the administrator portal."
                    : message,
                !connected
            )
        );
}

const getStatus = async (req, res) => {
    try {
        // One verified read refreshes the shared connection, then both service
        // statuses are reported together.
        const calendar = await getCalendarStatus({ verify: true });
        const sheets = await getSheetsStatus({ verify: false });

        // A revoked token belongs to the shared account, so Sheets must show
        // the same reconnect guidance even though only Calendar verified it.
        if (calendar.needsReconnect) {
            sheets.needsReconnect = true;
            sheets.reconnectReason = calendar.reconnectReason;
            sheets.connected = false;
            sheets.accountEmail = "";
            sheets.accountConnected = false;
        } else if (!sheets.accountEmail && calendar.accountEmail) {
            sheets.accountEmail = calendar.accountEmail;
        }

        return res.status(200).json({
            success: true,
            ...calendar,
            calendar,
            sheets
        });
    } catch (error) {
        console.error("Google integration status error:", error);

        return res.status(500).json({
            success: false,
            message: "Unable to read the Google integration status."
        });
    }
};

const getConnectUrl = async (req, res) => {
    try {
        if (!(await isConfigured())) {
            return res.status(503).json({
                success: false,
                message:
                    "Google integration credentials are not configured on the server."
            });
        }

        const returnTo = safeReturnTo(req.query.returnTo) || "";
        const state = signState({
            adminId: req.user.id,
            returnTo
        });

        return res.status(200).json({
            success: true,
            authUrl: await buildAuthUrl(state)
        });
    } catch (error) {
        console.error("Google connect error:", error);

        return res.status(500).json({
            success: false,
            message: "Unable to start the Google connection."
        });
    }
};

async function validateGoogleCardsAfterConnect(adminId, ip) {
    let admin = { id: adminId, email: "unknown" };

    try {
        const user = await User.findById(adminId).select("email").lean();

        if (user && user.email) admin = { id: adminId, email: user.email };
    } catch (error) {
        // Status still persists when the audit actor cannot be resolved.
    }

    let refreshToken = "";
    let scopes = [];

    try {
        const connection = await readConnection();

        refreshToken = connection.refreshToken || "";
        scopes = connection.credential && Array.isArray(connection.credential.scopes)
            ? connection.credential.scopes
            : [];
    } catch (error) {
        console.warn(`[google] Post-connect validation could not read the token: ${error.message}`);
    }

    const cards = ["google-calendar", "google-sheets"];

    await Promise.allSettled(
        cards.map(async (card) => {
            try {
                const resolved = await resolveForValidation(card, {});
                const result = await validateIntegration(card, {
                    values: resolved.values,
                    context: {
                        refreshToken,
                        scopes,
                        redirectUri: process.env.GOOGLE_CALENDAR_REDIRECT_URI || "http://localhost"
                    }
                });

                await upsertValidationStatus({
                    card,
                    valid: result.valid,
                    state: result.state,
                    code: result.code,
                    message: result.message,
                    checkedAt: result.checkedAt,
                    credentialUpdatedAt: await credentialUpdatedAtFor(card)
                });

                if (admin.email !== "unknown") {
                    await recordAudit({
                        card,
                        action: "test",
                        outcome: result.valid ? "success" : "failure",
                        code: result.code,
                        admin,
                        ip
                    });
                }
            } catch (error) {
                console.warn(`[google] Post-connect ${card} validation failed: ${error.message}`);
            }
        })
    );
}

const handleCallback = async (req, res) => {
    const { code, error, state } = req.query;

    let payload;

    try {
        payload = verifyState(state);
    } catch (verificationError) {
        return res.status(400).send(
            resultPage(
                "Google not connected",
                "The authorization request expired or was invalid. Return to the administrator portal and try again.",
                true
            )
        );
    }

    const returnTo = safeReturnTo(payload.returnTo);

    if (error) {
        return finishAuthorization(
            res,
            returnTo,
            false,
            error === "access_denied"
                ? "Google access was cancelled."
                : "Google authorization failed."
        );
    }

    if (!code) {
        return finishAuthorization(
            res,
            returnTo,
            false,
            "Google did not return an authorization code."
        );
    }

    try {
        await exchangeCode(code);
        await validateGoogleCardsAfterConnect(payload.adminId, req.ip);

        return finishAuthorization(res, returnTo, true, "");
    } catch (exchangeError) {
        console.error("Google callback error:", exchangeError);

        return finishAuthorization(
            res,
            returnTo,
            false,
            "Google could not be connected. Please try again."
        );
    }
};

const disconnectCalendar = async (req, res) => {
    try {
        const result = await disconnect();

        return res.status(200).json({
            success: true,
            message: result.disconnected
                ? result.accountEmail
                    ? `Google account disconnected from ${result.accountEmail}. Calendar and Sheets will stop using it.`
                    : "Google account disconnected. Calendar and Sheets will stop using it."
                : "A Google account was not connected.",
            ...result
        });
    } catch (error) {
        if (error.code === "env_locked") {
            return res.status(409).json({
                success: false,
                message: error.message
            });
        }

        console.error("Google disconnect error:", error);

        return res.status(500).json({
            success: false,
            message: "Unable to disconnect the Google account."
        });
    }
};

const syncActivities = async (req, res) => {
    try {
        const result = await syncPendingActivities();

        return res.status(200).json({
            success: true,
            message:
                result.total === 0
                    ? "Every pending activity already has a Google Calendar event."
                    : `${result.synced} of ${result.total} pending activities were added to Google Calendar.`,
            ...result
        });
    } catch (error) {
        if (
            error.code === "disabled" ||
            error.code === "not_configured" ||
            error.code === "not_connected" ||
            error.code === "needs_reconnect" ||
            error.code === "missing_scope"
        ) {
            return res.status(409).json({
                success: false,
                message: error.message
            });
        }

        console.error("Google Calendar sync error:", error);

        return res.status(500).json({
            success: false,
            message: "Unable to sync maintenance activities to Google Calendar."
        });
    }
};

module.exports = {
    getStatus,
    getConnectUrl,
    handleCallback,
    disconnectCalendar,
    syncActivities
};
