const express = require("express");
const { protect, adminOnly } = require("../middleware/authMiddleware");
const {
  exportToGoogleSheets,
} = require("../controllers/adminExportController");

const router = express.Router();

router.post(
  "/:dataset/google-sheets",
  protect,
  adminOnly,
  exportToGoogleSheets,
);

module.exports = router;
