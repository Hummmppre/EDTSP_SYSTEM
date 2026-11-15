require("dotenv").config();
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const User = require("../models/User");

const TEST_EMAIL = "edtsp-login-probe@example.invalid";
const TEST_PASSWORD = "ProbePassword123!";

(async () => {
    await mongoose.connect(process.env.MONGODB_URI);

    await User.deleteOne({ email: TEST_EMAIL });

    const password = await bcrypt.hash(TEST_PASSWORD, 12);

    await User.create({
        firstName: "Login",
        lastName: "Probe",
        email: TEST_EMAIL,
        password,
        role: "trainee",
        status: "active"
    });

    const response = await fetch("http://localhost:5000/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: TEST_EMAIL, password: TEST_PASSWORD })
    });

    const data = await response.json().catch(() => ({}));

    console.log("valid login ->", response.status, data.success === true, JSON.stringify(data.message || ""));

    await User.deleteOne({ email: TEST_EMAIL });
    await mongoose.disconnect();
})().catch(async error => {
    console.error("Probe failed:", error.message);
    try { await User.deleteOne({ email: TEST_EMAIL }); } catch {}
    process.exit(1);
});
