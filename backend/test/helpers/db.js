const mongoose = require("mongoose");
const { MongoMemoryServer } = require("mongodb-memory-server");

let memoryServer = null;

const startDb = async () => {
    process.env.NODE_ENV = "test";
    process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret";

    memoryServer = await MongoMemoryServer.create();

    // Tests never touch the Atlas URI from .env.
    process.env.MONGODB_URI = memoryServer.getUri();

    if (mongoose.connection.readyState === 0) {
        await mongoose.connect(process.env.MONGODB_URI);
    }
};

const clearDb = async () => {
    const collections = await mongoose.connection.db.collections();

    for (const collection of collections) {
        await collection.deleteMany({});
    }
};

const stopDb = async () => {
    await mongoose.disconnect();

    if (memoryServer) {
        await memoryServer.stop();
        memoryServer = null;
    }
};

module.exports = { startDb, clearDb, stopDb };
