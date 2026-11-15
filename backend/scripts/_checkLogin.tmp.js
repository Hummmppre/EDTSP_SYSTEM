require("dotenv").config();
const mongoose = require("mongoose");
const User = require("../models/User");

(async () => {
    await mongoose.connect(process.env.MONGODB_URI);

    const admin = await User.findOne({ role: "admin" }).select("email");
    const trainee = await User.findOne({ role: "trainee" }).select("email");

    async function attempt(label, email) {
        const response = await fetch("http://localhost:5000/api/auth/login", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email, password: "definitely-not-the-password" })
        });

        const data = await response.json().catch(() => ({}));

        console.log(label, "->", response.status, JSON.stringify(data.message || ""));
    }

    if (admin) await attempt("existing admin", admin.email);
    if (trainee) await attempt("existing trainee", trainee.email);
    await attempt("unknown email", "nobody-here@example.com");

    await mongoose.disconnect();
})().catch(error => {
    console.error("Login check failed:", error.message);
    process.exit(1);
});
