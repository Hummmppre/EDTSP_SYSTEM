require("dotenv").config();

const { startServer } = require("./app");

startServer().catch((error) => {
    console.error("Server startup failed:", error.message);
    process.exit(1);
});
