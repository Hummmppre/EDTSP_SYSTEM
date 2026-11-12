/**
 * One API client for the whole portal.
 * Always relative to the current origin — Express serves this frontend and the
 * API together, so there is no hardcoded host anywhere.
 */
window.EDTSP = window.EDTSP || {};

(function initApi() {
    const base = "/api";

    const token = () => localStorage.getItem("edtspToken");

    const handleSessionEnd = (reason) => {
        if (window.EDTSP.session) {
            window.EDTSP.session.end({ reason, skipRequest: true });
        }
    };

    async function request(method, path, body) {
        const headers = { Accept: "application/json" };
        const currentToken = token();

        if (currentToken) {
            headers.Authorization = `Bearer ${currentToken}`;
        }

        const options = { method, headers };

        if (body !== undefined) {
            headers["Content-Type"] = "application/json";
            options.body = JSON.stringify(body);
        }

        let response;

        try {
            response = await fetch(`${base}${path}`, options);
        } catch (error) {
            const offline = new Error(
                "Unable to reach the server. Check your connection and try again."
            );
            offline.status = 0;
            throw offline;
        }

        const raw = await response.text();
        let data = null;

        if (raw) {
            try {
                data = JSON.parse(raw);
            } catch (error) {
                data = { message: raw };
            }
        }

        if (!response.ok) {
            const requestError = new Error(
                (data && data.message) || "The request could not be completed."
            );

            requestError.status = response.status;
            requestError.field = data && data.field;
            requestError.code = data && data.code;

            if (
                response.status === 401 ||
                requestError.code === "ACCOUNT_INACTIVE"
            ) {
                handleSessionEnd(
                    requestError.code === "ACCOUNT_INACTIVE"
                        ? "inactive"
                        : "expired"
                );
            }

            throw requestError;
        }

        return data;
    }

    window.EDTSP.api = {
        base,
        request,
        get: (path) => request("GET", path),
        post: (path, body) => request("POST", path, body),
        put: (path, body) => request("PUT", path, body),
        patch: (path, body) => request("PATCH", path, body),
        del: (path) => request("DELETE", path)
    };
})();
