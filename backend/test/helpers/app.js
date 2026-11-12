const { createApp } = require("../../app");

// Built without listening so supertest can mount it directly.
const app = createApp();

module.exports = { app };
