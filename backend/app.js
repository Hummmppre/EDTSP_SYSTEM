const path = require("path");

const express = require("express");
const helmet = require("helmet");
const cors = require("cors");
const mongoose = require("mongoose");

const { errorHandler, apiNotFound } = require("./middleware/errorHandler");
const { apiLimiter } = require("./middleware/rateLimit");
const { databaseState } = require("./config/db");
const { buildRouter } = require("./uploadthing/router");

const FRONTEND_DIR = path.join(__dirname, "..", "frontend");

const corsOptions = () => {
    const configured = (process.env.CORS_ORIGINS || "")
        .split(",")
        .map((origin) => origin.trim())
        .filter(Boolean);

    if (configured.length === 0) {
        // Same-origin app: no CORS headers at all.
        return null;
    }

    return cors({
        origin: configured,
        credentials: false
    });
};

const createApp = () => {
    const app = express();

    app.disable("x-powered-by");
    app.set("trust proxy", 1);

    app.use(
        helmet({
            contentSecurityPolicy: {
                directives: {
                    defaultSrc: ["'self'"],
                    scriptSrc: ["'self'"],
                    styleSrc: ["'self'", "'unsafe-inline'"],
                    imgSrc: [
                        "'self'",
                        "data:",
                        "https://*.ufs.sh",
                        "https://utfs.io"
                    ],
                    connectSrc: [
                        "'self'",
                        "https://*.ingest.uploadthing.com",
                        "https://utfs.io"
                    ],
                    fontSrc: ["'self'"],
                    objectSrc: ["'none'"],
                    baseUri: ["'self'"],
                    frameAncestors: ["'none'"]
                }
            },
            crossOriginEmbedderPolicy: false
        })
    );

    const corsMiddleware = corsOptions();

    if (corsMiddleware) {
        app.use(corsMiddleware);
    }

    app.use(express.json({ limit: "100kb" }));
    app.use(express.urlencoded({ extended: false, limit: "100kb" }));

    app.use("/api", apiLimiter);

    // API routes
    app.use("/api/auth", require("./routes/authRoutes"));
    app.use("/api/trainee", require("./routes/traineeRoutes"));
    app.use("/api/assessments", require("./routes/assessmentRoutes"));
    app.use("/api/admin", require("./routes/adminRoutes"));

    // Receipt uploads (optional dependency on UploadThing config)
    app.use("/api/uploadthing", buildRouter());

    // Health check — reports the real connection state.
    app.get("/api/health", (req, res) => {
        const database = databaseState();

        return res.status(database === "Connected" ? 200 : 503).json({
            success: database === "Connected",
            message: "EDTSP Backend API is running!",
            database,
            uptime: Math.round(process.uptime())
        });
    });

    // Unmatched API routes stay JSON
    app.use("/api", apiNotFound);

    // Static frontend, served from the same origin as the API
    app.use(
        express.static(FRONTEND_DIR, {
            extensions: ["html"],
            index: "index.html"
        })
    );

    app.get("/", (req, res) => {
        res.sendFile(path.join(FRONTEND_DIR, "index.html"));
    });

    // Client-side style fallback for extension-less paths
    app.get(/^\/(?!api\/).*/, (req, res, next) => {
        if (path.extname(req.path)) {
            return next();
        }

        return res.sendFile(path.join(FRONTEND_DIR, "index.html"));
    });

    app.use((req, res) => {
        res.status(404).type("text").send("Not found");
    });

    app.use(errorHandler);

    return app;
};

const startServer = async () => {
    const connectDB = require("./config/db");

    await connectDB();

    const app = createApp();
    const port = process.env.PORT || 5000;

    app.listen(port, () => {
        console.log(`EDTSP Server running on port ${port}`);
    });

    mongoose.connection.on("disconnected", () => {
        console.warn("MongoDB disconnected.");
    });
};

module.exports = { createApp, startServer };
