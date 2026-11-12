const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const readline = require("readline");

require("dotenv").config();

const User = require("../models/User");

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const USAGE = `Usage:
  node scripts/createAdmin.js --firstName Jane --lastName Cruz \\
    --email jane@example.com --password "a long password"

Values may also come from ADMIN_FIRST_NAME, ADMIN_LAST_NAME, ADMIN_EMAIL,
ADMIN_PASSWORD. Missing values are prompted for when stdin is a terminal.`;

const parseArgs = (argv) => {
    const args = {};

    for (let index = 0; index < argv.length; index += 1) {
        const current = argv[index];

        if (!current.startsWith("--")) continue;

        const [rawKey, inlineValue] = current.slice(2).split("=");
        const key = rawKey.replace(/-([a-z])/g, (_, letter) =>
            letter.toUpperCase()
        );

        if (inlineValue !== undefined) {
            args[key] = inlineValue;
        } else if (argv[index + 1] && !argv[index + 1].startsWith("--")) {
            args[key] = argv[index + 1];
            index += 1;
        } else {
            args[key] = "";
        }
    }

    return args;
};

const promptFor = async (question) => {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });

    return new Promise((resolve) => {
        rl.question(question, (answer) => {
            rl.close();
            resolve(answer.trim());
        });
    });
};

const fail = (message) => {
    console.error(`\nAdmin setup failed: ${message}\n`);
    process.exit(1);
};

async function createAdmin() {
    const args = parseArgs(process.argv.slice(2));

    const values = {
        firstName: args.firstName || process.env.ADMIN_FIRST_NAME || "",
        lastName: args.lastName || process.env.ADMIN_LAST_NAME || "",
        email: args.email || process.env.ADMIN_EMAIL || "",
        password: args.password || process.env.ADMIN_PASSWORD || ""
    };

    const missing = Object.entries(values)
        .filter(([, value]) => !value)
        .map(([key]) => key);

    if (missing.length > 0) {
        if (!process.stdin.isTTY) {
            console.error(USAGE);
            fail(`missing ${missing.join(", ")}`);
        }

        console.log("\n===== EDTSP ADMIN ACCOUNT SETUP =====\n");

        if (!values.firstName) values.firstName = await promptFor("First Name: ");
        if (!values.lastName) values.lastName = await promptFor("Last Name: ");
        if (!values.email) values.email = await promptFor("Email Address: ");

        if (!values.password) {
            values.password = await promptFor(
                "Password (minimum 8 characters): "
            );
        }
    }

    const firstName = values.firstName.trim();
    const lastName = values.lastName.trim();
    const email = values.email.trim().toLowerCase();

    if (!firstName || !lastName) {
        fail("First and last name are required.");
    }

    if (!EMAIL_REGEX.test(email)) {
        fail("Enter a valid email address.");
    }

    if (values.password.length < 8) {
        fail("Password must be at least 8 characters.");
    }

    try {
        await mongoose.connect(process.env.MONGODB_URI);

        const existingUser = await User.findOne({ email });

        if (existingUser) {
            fail("An account with this email already exists.");
        }

        const admin = await User.create({
            firstName,
            lastName,
            email,
            password: await bcrypt.hash(values.password, 12),
            role: "admin",
            status: "active"
        });

        console.log("\nAdministrator account created successfully!");
        console.log("Name:", admin.firstName, admin.lastName);
        console.log("Email:", admin.email);
        console.log("Role:", admin.role);
    } catch (error) {
        console.error("\nAdmin setup failed:", error.message);
        process.exitCode = 1;
    } finally {
        await mongoose.disconnect();
    }
}

createAdmin();
