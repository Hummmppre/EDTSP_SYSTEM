

const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const readline = require("readline");

require("dotenv").config();

const User = require("../models/User");

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

const ask = (question) => {
    return new Promise(resolve => {
        rl.question(question, resolve);
    });
};

async function createAdmin() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);

        console.log("\n===== EDTSP ADMIN ACCOUNT SETUP =====\n");

        const firstName = await ask("First Name: ");
        const lastName = await ask("Last Name: ");
        const email = (await ask("Email Address: ")).trim().toLowerCase();
        const password = await ask("Password (minimum 8 characters): ");

        if (!firstName.trim() || !lastName.trim() || !email || password.length < 8) {
            throw new Error("Please provide valid information. Password must be at least 8 characters.");
        }

        const existingUser = await User.findOne({ email });

        if (existingUser) {
            throw new Error("An account with this email already exists.");
        }

        const hashedPassword = await bcrypt.hash(password, 12);

        const admin = await User.create({
            firstName: firstName.trim(),
            lastName: lastName.trim(),
            email,
            password: hashedPassword,
            role: "admin",
            status: "active"
        });

        console.log("\nAdministrator account created successfully!");
        console.log("Name:", admin.firstName, admin.lastName);
        console.log("Email:", admin.email);
        console.log("Role:", admin.role);

    } catch (error) {
        console.error("\nAdmin setup failed:", error.message);
    } finally {
        rl.close();
        await mongoose.disconnect();
    }
}

createAdmin();
