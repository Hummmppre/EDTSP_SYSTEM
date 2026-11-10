const mongoose = require("mongoose");
const dns = require("dns");

// Use Google's public DNS for MongoDB Atlas SRV lookups
const resolver = new dns.promises.Resolver();
resolver.setServers(["8.8.8.8", "8.8.4.4"]);

dns.promises.resolveSrv = resolver.resolveSrv.bind(resolver);

const connectDB = async () => {
    try {
        const connection = await mongoose.connect(
            process.env.MONGODB_URI
        );

        console.log(`MongoDB Connected: ${connection.connection.host}`);
        console.log(`Database Name: ${connection.connection.name}`);

    } catch (error) {
        console.error("MongoDB Connection Failed:", error.message);
        process.exit(1);
    }
};

module.exports = connectDB;