const mongoose = require("mongoose");

const READY_STATES = {
    0: "Uninitialized",
    1: "Connected",
    2: "Connecting",
    3: "Disconnecting"
};

const connectDB = async () => {
    try {
        const connection = await mongoose.connect(
            process.env.MONGODB_URI
        );

        console.log(`MongoDB Connected: ${connection.connection.host}`);
    } catch (error) {
        console.error("MongoDB Connection Failed:", error.message);
        process.exit(1);
    }
};

const databaseState = () =>
    READY_STATES[mongoose.connection.readyState] || "Uninitialized";

module.exports = connectDB;
module.exports.READY_STATES = READY_STATES;
module.exports.databaseState = databaseState;
