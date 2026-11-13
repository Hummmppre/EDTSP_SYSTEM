
const express = require("express");
const cors = require("cors");
require("dotenv").config();

console.log("MONGODB_URI exists:", !!process.env.MONGODB_URI);

const connectDB = require("./config/db");

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Authentication Routes
const authRoutes = require("./routes/authRoutes");
app.use("/api/auth", authRoutes);

// Trainee Routes
const traineeRoutes = require("./routes/traineeRoutes");
app.use("/api/trainee", traineeRoutes);


// Assessment Routes
const assessmentRoutes = require("./routes/assessmentRoutes");
app.use("/api/assessments", assessmentRoutes);

// Training application routes (trainee)
const applicationRoutes = require("./routes/applicationRoutes");
app.use("/api/applications", applicationRoutes);

// Application review routes (admin)
const adminApplicationRoutes = require("./routes/adminApplicationRoutes");
app.use("/api/admin/applications", adminApplicationRoutes);

// System settings routes (admin)
const systemSettingsRoutes = require("./routes/systemSettingsRoutes");
app.use("/api/system-settings", systemSettingsRoutes);

// Payment routes (admin + trainee)
const { adminPaymentRoutes, traineePaymentRoutes } = require("./routes/paymentRoutes");
app.use("/api/admin/payments", adminPaymentRoutes);
app.use("/api/trainee/payments", traineePaymentRoutes);

// Program and batch management routes (admin)
const { programRoutes, batchRoutes } = require("./routes/programRoutes");
app.use("/api/admin/programs", programRoutes);
app.use("/api/admin/batches", batchRoutes);

// Trainee records (admin)
const adminTraineeRoutes = require("./routes/adminTraineeRoutes");
app.use("/api/admin/trainees", adminTraineeRoutes);

// Test route
app.get("/", (req, res) => {
    res.send("EDTSP Backend API is running!");
});

// Health check route
app.get("/api/health", (req, res) => {
    res.json({
        success: true,
        message: "EDTSP Backend API is running!",
        database: "Connected"
    });
});

// Server port
const PORT = process.env.PORT || 5000;

// Connect database before starting server
const startServer = async () => {
    try {
        await connectDB();

        app.listen(PORT, () => {
            console.log(`EDTSP Server running on port ${PORT}`);
        });

    } catch (error) {
        console.error("Server startup failed:", error.message);
        process.exit(1);
    }
};

startServer();
