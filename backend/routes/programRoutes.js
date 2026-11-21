const express = require("express");

const {
    getPrograms,
    createProgram,
    updateProgram,
    createBatch,
    updateBatch
} = require("../controllers/programController");

const { protect, adminOnly } = require("../middleware/authMiddleware");
const { apiWriteLimiter } = require("../middleware/rateLimiters");

// Mounted at /api/admin/programs
const programRoutes = express.Router();

programRoutes.get("/", protect, adminOnly, getPrograms);
programRoutes.post("/", apiWriteLimiter, protect, adminOnly, createProgram);
programRoutes.patch(
  "/:id",
  apiWriteLimiter,
  protect,
  adminOnly,
  updateProgram,
);
programRoutes.post(
  "/:id/batches",
  apiWriteLimiter,
  protect,
  adminOnly,
  createBatch,
);

// Mounted at /api/admin/batches
const batchRoutes = express.Router();

batchRoutes.patch("/:id", apiWriteLimiter, protect, adminOnly, updateBatch);

module.exports = { programRoutes, batchRoutes };
