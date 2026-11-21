const express = require("express");
const { protect, adminOnly } = require("../middleware/authMiddleware");
const {
  exportToGoogleSheets,
} = require("../controllers/adminExportController");

const router = express.Router();

// Exempt from rate limiting: every admin may export as often as needed.
router.post(
  "/:dataset/google-sheets",
  protect,
  adminOnly,
  exportToGoogleSheets,
);

module.exports = router;
