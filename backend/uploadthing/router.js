const express = require("express");
const jwt = require("jsonwebtoken");

const { isUploadthingConfigured } = require("./client");

/**
 * Without a token (or without the SDK) the upload route answers 503 so the
 * trainee form can fall back to a reference-only submission.
 */
const notConfiguredHandler = () => {
    const router = express.Router();

    router.use((req, res) =>
        res.status(503).json({
            success: false,
            message:
                "Receipt uploads are not configured. Submit the payment with a reference instead.",
            code: "UPLOAD_NOT_CONFIGURED"
        })
    );

    return router;
};

const buildHandler = () => {
    if (!isUploadthingConfigured()) {
        return notConfiguredHandler();
    }

    let createUploadthing;
    let createRouteHandler;

    try {
        ({ createUploadthing, createRouteHandler } = require("uploadthing/express"));
    } catch (error) {
        console.error(
            "UploadThing SDK unavailable, receipts disabled:",
            error.message
        );

        return notConfiguredHandler();
    }

    const f = createUploadthing();

    const uploadRouter = {
        paymentReceipt: f({
            image: { maxFileSize: "4MB", maxFileCount: 1 }
        })
            .middleware(async ({ req }) => {
                const authHeader = req.headers.authorization || "";
                const token = authHeader.startsWith("Bearer ")
                    ? authHeader.slice(7).trim()
                    : "";

                if (!token) {
                    throw new Error("Upload requires a signed-in account.");
                }

                const decoded = jwt.verify(token, process.env.JWT_SECRET);

                if (!["trainee", "admin"].includes(decoded.role)) {
                    throw new Error("This account cannot upload receipts.");
                }

                return { userId: decoded.id };
            })
            .onUploadComplete(async ({ metadata, file }) => ({
                uploadedBy: metadata.userId,
                url: file.ufsUrl || file.url || ""
            }))
    };

    return createRouteHandler({ router: uploadRouter });
};

/**
 * Mounted at /api/uploadthing. `/status` lets the client decide whether to show
 * the upload control without guessing.
 */
const buildRouter = () => {
    const router = express.Router();

    router.get("/status", (req, res) =>
        res.json({
            success: true,
            configured: isUploadthingConfigured()
        })
    );

    router.use(buildHandler());

    return router;
};

module.exports = { buildRouter, buildHandler, notConfiguredHandler };
