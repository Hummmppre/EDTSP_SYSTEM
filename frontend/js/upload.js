/**
 * Optional receipt upload through UploadThing.
 *
 * The frontend is plain scripts (no bundler), so this speaks the UploadThing
 * route-handler protocol directly: ask the server for a presigned target, PUT
 * the file, then confirm the upload. When the server has no UploadThing token
 * the first call fails fast and the payment form falls back to reference-only.
 */
window.EDTSP = window.EDTSP || {};

(function initUpload() {
    const ENDPOINT = "/api/uploadthing";
    const SLUG = "paymentReceipt";

    const authHeaders = () => {
        const token = localStorage.getItem("edtspToken");
        return token ? { Authorization: `Bearer ${token}` } : {};
    };

    let configuredCache = null;

    const isConfigured = async () => {
        if (configuredCache !== null) return configuredCache;

        try {
            const response = await fetch(`${ENDPOINT}/status`, {
                headers: authHeaders()
            });

            if (!response.ok) {
                configuredCache = false;
                return configuredCache;
            }

            const data = await response.json();
            configuredCache = Boolean(data.configured);
        } catch (error) {
            configuredCache = false;
        }

        return configuredCache;
    };

    const notConfiguredError = () => {
        const error = new Error(
            "Receipt uploads are not configured. Submit the payment with a reference instead."
        );
        error.code = "UPLOAD_NOT_CONFIGURED";
        return error;
    };

    const parse = async (response) => {
        const text = await response.text();
        if (!text) return null;

        try {
            return JSON.parse(text);
        } catch (error) {
            return null;
        }
    };

    /**
     * Upload one image and return { url, key }.
     */
    const uploadReceipt = async (file) => {
        if (!file) throw notConfiguredError();

        if (!(await isConfigured())) {
            throw notConfiguredError();
        }

        const presignResponse = await fetch(
            `${ENDPOINT}?actionType=upload&slug=${SLUG}`,
            {
                method: "POST",
                headers: {
                    ...authHeaders(),
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    files: [
                        {
                            name: file.name,
                            size: file.size,
                            type: file.type
                        }
                    ]
                })
            }
        );

        const presign = await parse(presignResponse);

        if (!presignResponse.ok) {
            const error = new Error(
                (presign && presign.message) ||
                    "The receipt could not be uploaded."
            );
            error.status = presignResponse.status;
            error.code = presign && presign.code;
            throw error;
        }

        const entry = Array.isArray(presign && presign.data)
            ? presign.data[0]
            : presign && presign.data;

        if (!entry || !entry.url) {
            throw new Error("The upload service did not return a target URL.");
        }

        const putResponse = await fetch(entry.url, {
            method: "PUT",
            headers: { "Content-Type": file.type || "application/octet-stream" },
            body: file
        });

        if (!putResponse.ok) {
            throw new Error("The receipt file could not be transferred.");
        }

        // Best-effort confirmation; the object is already stored.
        try {
            await fetch(`${ENDPOINT}?actionType=callback&slug=${SLUG}`, {
                method: "POST",
                headers: {
                    ...authHeaders(),
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    fileKey: entry.key,
                    fileKeys: [entry.key],
                    metadata: {}
                })
            });
        } catch (error) {
            // Ignored: the stored URL is still usable.
        }

        return {
            url: entry.ufsUrl || entry.url,
            key: entry.key || ""
        };
    };

    window.EDTSP.upload = { isConfigured, uploadReceipt };
})();
