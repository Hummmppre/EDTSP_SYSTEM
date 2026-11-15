require("dotenv").config();
const mongoose = require("mongoose");
const connectDB = require("../config/db");

// Indexes left behind by an earlier payments schema. The unique paymentRef_1
// index made every payment after the first fail with E11000 (all new documents
// have paymentRef: null), so it has to be removed.
const STALE_INDEXES = [
    "paymentRef_1",
    "user_1",
    "user_1_status_1",
    "status_1_createdAt_-1"
];

async function fixPaymentIndexes() {
    await connectDB();

    const collection = mongoose.connection.collection("payments");
    const existing = new Set((await collection.indexes()).map(index => index.name));

    const dropped = [];

    for (const name of STALE_INDEXES) {
        if (!existing.has(name)) continue;

        await collection.dropIndex(name);
        dropped.push(name);
        console.log(`Dropped stale index: ${name}`);
    }

    // Recreate whatever the Payment schema declares (receiptNumber unique,
    // application/paymentDate lookups).
    const Payment = require("../models/Payment");

    await Payment.syncIndexes();

    console.log(
        dropped.length
            ? `Removed ${dropped.length} stale index(es).`
            : "No stale payment indexes found."
    );
    console.log("Payment indexes are in sync with the schema.");

    await mongoose.connection.close();
}

fixPaymentIndexes().catch(async error => {
    console.error("Fix payment indexes failed:", error.message);
    await mongoose.connection.close();
    process.exit(1);
});
