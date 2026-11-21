const express = require("express");
const router = express.Router();

const {
    getOpenBatches,
    getMyApplication,
    submitApplication,
    withdrawApplication,
    uploadApplicationDocument,
    deleteApplicationDocument,
    downloadApplicationDocument
} = require("../controllers/applicationController");

const { receiveApplicationDocuments, receiveSingleDocument } = require("../lib/documentUpload");
const { protect, traineeOnly } = require("../middleware/authMiddleware");
const {
    apiWriteLimiter,
    traineeUploadLimiter
} = require("../middleware/rateLimiters");

router.get("/open-batches", protect, traineeOnly, getOpenBatches);
router.get("/me", protect, traineeOnly, getMyApplication);

// Submission is multipart: the answers and both documents travel together.
router.post(
    "/",
    apiWriteLimiter,
    protect,
    traineeOnly,
    traineeUploadLimiter,
    receiveApplicationDocuments,
    submitApplication
);

router.get("/:id/documents/:fileId", protect, traineeOnly, downloadApplicationDocument);
router.post(
    "/:id/documents/:type",
    apiWriteLimiter,
    protect,
    traineeOnly,
    traineeUploadLimiter,
    receiveSingleDocument,
    uploadApplicationDocument
);
router.delete(
    "/:id/documents/:fileId",
    apiWriteLimiter,
    protect,
    traineeOnly,
    deleteApplicationDocument
);

router.post(
    "/:id/withdraw",
    apiWriteLimiter,
    protect,
    traineeOnly,
    withdrawApplication
);

module.exports = router;
