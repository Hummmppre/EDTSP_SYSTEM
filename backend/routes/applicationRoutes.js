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

router.get("/open-batches", protect, traineeOnly, getOpenBatches);
router.get("/me", protect, traineeOnly, getMyApplication);

// Submission is multipart: the answers and both documents travel together.
router.post(
    "/",
    protect,
    traineeOnly,
    receiveApplicationDocuments,
    submitApplication
);

router.get("/:id/documents/:fileId", protect, traineeOnly, downloadApplicationDocument);
router.post("/:id/documents/:type", protect, traineeOnly, receiveSingleDocument, uploadApplicationDocument);
router.delete("/:id/documents/:fileId", protect, traineeOnly, deleteApplicationDocument);

router.post("/:id/withdraw", protect, traineeOnly, withdrawApplication);

module.exports = router;
