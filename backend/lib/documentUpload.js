// GridFS storage for the documents attached to a training application.
// Everything about uploads (limits, accepted types, bucket name, header
// handling) lives here so the controllers stay about decisions.

const mongoose = require("mongoose");
const multer = require("multer");

const BUCKET_NAME = "applicationDocuments";

const MAX_FILE_BYTES = 10 * 1024 * 1024;
const MAX_APPLICATION_BYTES = 30 * 1024 * 1024;
const MAX_FILES_PER_DOCUMENT = 10;

const DOCUMENTS = [
    { type: "cv", label: "Curriculum Vitae" },
    { type: "valid_id", label: "Valid ID" }
];

const DOCUMENT_LABELS = DOCUMENTS.reduce((map, document) => {
    map[document.type] = document.label;
    return map;
}, {});

const REQUIRED_DOCUMENT_TYPES = DOCUMENTS.map(document => document.type);

// The multipart fields use the form's camelCase names; storage uses snake_case.
const FIELD_TO_TYPE = {
    cv: "cv",
    validId: "valid_id"
};

// The browser label only claims a type. These byte signatures are the truth,
// so a renamed .docx can never masquerade as a PDF.
const SIGNATURES = [
    { contentType: "application/pdf", bytes: [0x25, 0x50, 0x44, 0x46] },
    { contentType: "image/jpeg", bytes: [0xff, 0xd8, 0xff] },
    { contentType: "image/png", bytes: [0x89, 0x50, 0x4e, 0x47] }
];

const MESSAGES = {
    empty: "That file is empty. Please choose another.",
    tooLarge: "Each file must be 10 MB or smaller.",
    tooLargeTogether: "These documents are too large together. Keep the total under 30 MB.",
    wrongType: "That file is not a PDF, JPG or PNG. Please check the file and try again.",
    tooManyFiles: "You can attach up to 10 files per document.",
    unreadable: "Unable to read the uploaded documents. Please try again.",
    missing: "Attach your Curriculum Vitae and Valid ID before submitting.",
    decided: "This application has already been decided, so its documents can no longer be changed.",
    unavailable: "That file is no longer available. Please contact the training office."
};

function documentsBucket() {
    return new mongoose.mongo.GridFSBucket(mongoose.connection.db, {
        bucketName: BUCKET_NAME
    });
}

function sniffContentType(buffer) {
    if (!buffer || buffer.length < 4) return null;

    const match = SIGNATURES.find(signature =>
        signature.bytes.every((byte, index) => buffer[index] === byte)
    );

    return match ? match.contentType : null;
}

// Keep the trainee's own filename for display, minus anything that could
// break a header or a path.
function safeFilename(name) {
    const base = String(name || "document")
        .split(/[\\/]/)
        .pop()
        .replace(/[\u0000-\u001f\u007f]/g, "")
        .replace(/["\\]/g, "")
        .trim();

    return (base || "document").slice(0, 180);
}

function contentDisposition(filename) {
    const ascii = filename.replace(/[^\x20-\x7e]/g, "_");
    const encoded = encodeURIComponent(filename);

    return `attachment; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}

function storeUploadedFile({
    buffer,
    filename,
    contentType,
    userId,
    applicationId,
    documentType
}) {
    return new Promise((resolve, reject) => {
        const bucket = documentsBucket();

        const stream = bucket.openUploadStream(filename, {
            contentType,
            metadata: {
                userId: String(userId),
                applicationId: applicationId ? String(applicationId) : null,
                documentType,
                originalName: filename
            }
        });

        stream.on("error", reject);
        stream.on("finish", () => resolve(stream.id));
        stream.end(buffer);
    });
}

async function deleteUploadedFile(fileId) {
    if (!fileId) return;

    try {
        await documentsBucket().delete(new mongoose.Types.ObjectId(String(fileId)));
    } catch (error) {
        // A missing blob is already the state we want.
        const alreadyGone =
            Boolean(error) &&
            (/FileNotFound/i.test(error.name || "") ||
                /File not found/i.test(error.message || ""));

        if (!alreadyGone) {
            console.error("Delete document error:", error);
        }
    }
}

async function deleteUploadedFiles(fileIds) {
    await Promise.all((fileIds || []).filter(Boolean).map(deleteUploadedFile));
}

// The application id only exists after the insert, so the metadata is stamped
// once the record is created. A metadata miss never fails the request.
async function attachFilesToApplication(fileIds, applicationId) {
    if (!fileIds || !fileIds.length || !applicationId) return;

    try {
        await mongoose.connection.db
            .collection(`${BUCKET_NAME}.files`)
            .updateMany(
                {
                    _id: {
                        $in: fileIds.map(id => new mongoose.Types.ObjectId(String(id)))
                    }
                },
                { $set: { "metadata.applicationId": String(applicationId) } }
            );
    } catch (error) {
        console.error("Link documents to application error:", error);
    }
}

function findDocumentFile(fileId) {
    return documentsBucket()
        .find({ _id: new mongoose.Types.ObjectId(String(fileId)) })
        .next();
}

// Accepts the raw multipart entries and returns either a validation message
// or the files that may be written to GridFS.
function validateUploads(entries) {
    const accepted = [];
    let total = 0;

    for (const entry of entries) {
        const file = entry && entry.file;

        if (!file || !file.size || !file.buffer || !file.buffer.length) {
            return { error: MESSAGES.empty };
        }

        if (file.size > MAX_FILE_BYTES) {
            return { error: MESSAGES.tooLarge };
        }

        const contentType = sniffContentType(file.buffer);

        if (!contentType) {
            return { error: MESSAGES.wrongType };
        }

        total += file.size;

        accepted.push({
            documentType: entry.documentType,
            filename: safeFilename(file.originalname),
            contentType,
            size: file.size,
            buffer: file.buffer
        });
    }

    if (total > MAX_APPLICATION_BYTES) {
        return { error: MESSAGES.tooLargeTogether };
    }

    return { files: accepted };
}

const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: MAX_FILE_BYTES,
        files: MAX_FILES_PER_DOCUMENT * REQUIRED_DOCUMENT_TYPES.length
    }
});

function sendUploadError(res, error) {
    if (error && error.code === "LIMIT_FILE_SIZE") {
        return res.status(400).json({ success: false, message: MESSAGES.tooLarge });
    }

    if (
        error &&
        (error.code === "LIMIT_FILE_COUNT" || error.code === "LIMIT_UNEXPECTED_FILE")
    ) {
        return res.status(400).json({ success: false, message: MESSAGES.tooManyFiles });
    }

    console.error("Document upload error:", error);

    return res.status(400).json({ success: false, message: MESSAGES.unreadable });
}

// Submit carries the whole application plus both documents in one request.
function receiveApplicationDocuments(req, res, next) {
    upload.fields([
        { name: "cv", maxCount: MAX_FILES_PER_DOCUMENT },
        { name: "validId", maxCount: MAX_FILES_PER_DOCUMENT }
    ])(req, res, error => {
        if (error) return sendUploadError(res, error);
        return next();
    });
}

// Replacing or adding one document on an application that already exists.
function receiveSingleDocument(req, res, next) {
    upload.single("file")(req, res, error => {
        if (error) return sendUploadError(res, error);
        return next();
    });
}

function collectApplicationFiles(files) {
    const entries = [];

    Object.entries(FIELD_TO_TYPE).forEach(([field, documentType]) => {
        const received = (files && files[field]) || [];

        received.forEach(file => entries.push({ documentType, file }));
    });

    return entries;
}

async function streamDocumentFile(res, file) {
    const stored = await findDocumentFile(file.fileId);

    if (!stored) {
        return res.status(404).json({ success: false, message: MESSAGES.unavailable });
    }

    const filename = safeFilename(file.filename || stored.filename);

    res.setHeader(
        "Content-Type",
        file.contentType || stored.contentType || "application/octet-stream"
    );
    res.setHeader("Content-Length", String(file.size || stored.length || 0));
    res.setHeader("Content-Disposition", contentDisposition(filename));
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Cache-Control", "private, no-store");

    const stream = documentsBucket().openDownloadStream(
        new mongoose.Types.ObjectId(String(file.fileId))
    );

    stream.on("error", error => {
        console.error("Document stream error:", error);

        if (res.headersSent) {
            res.end();
            return;
        }

        res.status(500).json({
            success: false,
            message: MESSAGES.unavailable
        });
    });

    stream.pipe(res);

    return undefined;
}

module.exports = {
    BUCKET_NAME,
    DOCUMENTS,
    DOCUMENT_LABELS,
    REQUIRED_DOCUMENT_TYPES,
    FIELD_TO_TYPE,
    MAX_FILE_BYTES,
    MAX_APPLICATION_BYTES,
    MAX_FILES_PER_DOCUMENT,
    MESSAGES,
    documentsBucket,
    sniffContentType,
    safeFilename,
    storeUploadedFile,
    deleteUploadedFile,
    deleteUploadedFiles,
    attachFilesToApplication,
    findDocumentFile,
    validateUploads,
    receiveApplicationDocuments,
    receiveSingleDocument,
    collectApplicationFiles,
    streamDocumentFile
};
