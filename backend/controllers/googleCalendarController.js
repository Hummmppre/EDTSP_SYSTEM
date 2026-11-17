const {
    isConfigured,
    getCalendarStatus,
    buildAuthUrl,
    exchangeCode,
    signState,
    verifyState
} = require("../lib/googleCalendar");

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

        url.searchParams.set("calendar", connected ? "connected" : "error");

        if (!connected) {
            url.searchParams.set("calendarReason", message);
        }

        return res.redirect(url.toString());
    }

    return res
        .status(connected ? 200 : 400)
        .send(
            resultPage(
                connected ? "Google Calendar connected" : "Google Calendar not connected",
                connected
                    ? "You can close this tab and return to the administrator portal."
                    : message,
                !connected
            )
        );
}

const getStatus = async (req, res) => {
    try {
        const status = await getCalendarStatus();

        return res.status(200).json({ success: true, ...status });
    } catch (error) {
        console.error("Google Calendar status error:", error);

        return res.status(500).json({
            success: false,
            message: "Unable to read the Google Calendar connection status."
        });
    }
};

const getConnectUrl = async (req, res) => {
    try {
        if (!isConfigured()) {
            return res.status(503).json({
                success: false,
                message:
                    "Google Calendar credentials are not configured on the server."
            });
        }

        const returnTo = safeReturnTo(req.query.returnTo) || "";
        const state = signState({
            adminId: req.user.id,
            returnTo
        });

        return res.status(200).json({
            success: true,
            authUrl: buildAuthUrl(state)
        });
    } catch (error) {
        console.error("Google Calendar connect error:", error);

        return res.status(500).json({
            success: false,
            message: "Unable to start the Google Calendar connection."
        });
    }
};

const handleCallback = async (req, res) => {
    const { code, error, state } = req.query;

    let payload;

    try {
        payload = verifyState(state);
    } catch (verificationError) {
        return res.status(400).send(
            resultPage(
                "Google Calendar not connected",
                "The authorization request expired or was invalid. Return to Cow maintenance and try again.",
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
                ? "Google Calendar access was cancelled."
                : "Google Calendar authorization failed."
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

        return finishAuthorization(res, returnTo, true, "");
    } catch (exchangeError) {
        console.error("Google Calendar callback error:", exchangeError);

        return finishAuthorization(
            res,
            returnTo,
            false,
            "Google Calendar could not be connected. Please try again."
        );
    }
};

module.exports = {
    getStatus,
    getConnectUrl,
    handleCallback
};
