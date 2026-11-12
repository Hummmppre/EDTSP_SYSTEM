const express = require("express");

const {
    getPrograms,
    createProgram,
    updateProgram,
    createBatch,
    updateBatch
} = require("../controllers/programController");

const { protect, adminOnly } = require("../middleware/authMiddleware");

// Mounted at /api/admin/programs
const programRoutes = express.Router();

programRoutes.get("/", protect, adminOnly, getPrograms);
programRoutes.post("/", protect, adminOnly, createProgram);
programRoutes.patch("/:id", protect, adminOnly, updateProgram);
programRoutes.post("/:id/batches", protect, adminOnly, createBatch);

// Mounted at /api/admin/batches
const batchRoutes = express.Router();

batchRoutes.patch("/:id", protect, adminOnly, updateBatch);

module.exports = { programRoutes, batchRoutes };
