/**
 * Minimal UploadThing server client. Everything is guarded so that a missing
 * token (or an unavailable SDK) never breaks payment verification/rejection.
 */
const isUploadthingConfigured = () =>
    Boolean(process.env.UPLOADTHING_TOKEN && process.env.UPLOADTHING_TOKEN.trim());

const deleteReceipt = async (key) => {
    if (!key || !isUploadthingConfigured()) {
        return false;
    }

    try {
        const { UTApi } = require("uploadthing/server");
        const api = new UTApi({ token: process.env.UPLOADTHING_TOKEN });

        await api.deleteFiles(key);

        return true;
    } catch (error) {
        console.error("UploadThing cleanup failed:", error.message);

        return false;
    }
};

module.exports = { isUploadthingConfigured, deleteReceipt };
