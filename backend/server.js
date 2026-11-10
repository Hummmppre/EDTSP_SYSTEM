
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
