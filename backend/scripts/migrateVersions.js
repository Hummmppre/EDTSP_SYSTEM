// Manual entry point for the version migration. The server also runs the same
// idempotent migration at startup, so this is only needed for one-off runs.
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const mongoose = require("mongoose");
const { migrateVersionCounters } = require("../lib/versionMigration");

async function run() {
    await mongoose.connect(process.env.MONGODB_URI);

    const result = await migrateVersionCounters();

    console.log(
        `Version migration complete: ${result.migrated} records copied, ` +
            `${result.initialized} records initialized.`
    );
}

run()
    .catch(error => {
        console.error("Version migration failed:", error.message);
        process.exitCode = 1;
    })
    .finally(() => mongoose.disconnect());
