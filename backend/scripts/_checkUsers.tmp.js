require("dotenv").config();
const mongoose = require("mongoose");
const User = require("../models/User");

(async () => {
    await mongoose.connect(process.env.MONGODB_URI);

    const rows = await User.aggregate([
        { $group: { _id: { role: "$role", status: "$status" }, n: { $sum: 1 } } },
        { $sort: { "_id.role": 1, "_id.status": 1 } }
    ]);

    console.log(JSON.stringify(rows));

    await mongoose.disconnect();
})().catch(error => {
    console.error("DB check failed:", error.message);
    process.exit(1);
});
