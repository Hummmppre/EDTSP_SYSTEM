// GridFS storage for profile pictures. Everything about uploads (limits,
// accepted types, bucket name, streaming) lives here so the controller only
// decides who may change which avatar.

const mongoose = require("mongoose");
const multer = require("multer");

const BUCKET_NAME = "traineeAvatars";
const FIELD_NAME = "avatar";
const MAX_AVATAR_BYTES = 2 * 1024 * 1024;

const MESSAGES = {
    empty: "Choose an image to upload.",
    tooLarge: "Your profile picture must be 2 MB or smaller.",
    wrongType: "Choose a JPG, PNG or WebP image.",
    unreadable: "Unable to read that image. Please try another.",
    unavailable: "That profile picture is no longer available."
};

function avatarsBucket() {
    return new mongoose.mongo.GridFSBucket(mongoose.connection.db, {
        bucketName: BUCKET_NAME
    });
}

// The browser's declared MIME type is only a claim. Sniff the bytes so a
// renamed file or an SVG cannot pass as an image.
function sniffContentType(buffer) {
    if (!buffer || buffer.length < 12) return null;

    if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
        return "image/jpeg";
    }

    if (
        buffer[0] === 0x89 &&
        buffer[1] === 0x50 &&
        buffer[2] === 0x4e &&
        buffer[3] === 0x47
    ) {
        return "image/png";
    }

    if (
        buffer.slice(0, 4).toString("ascii") === "RIFF" &&
        buffer.slice(8, 12).toString("ascii") === "WEBP"
    ) {
        return "image/webp";
    }

    return null;
}

function validateAvatar(file) {
    if (!file || !file.size || !file.buffer || !file.buffer.length) {
        return { error: MESSAGES.empty };
    }

    if (file.size > MAX_AVATAR_BYTES) {
        return { error: MESSAGES.tooLarge };
    }

    const contentType = sniffContentType(file.buffer);

    if (!contentType) {
        return { error: MESSAGES.wrongType };
    }

    return {
        file: {
            buffer: file.buffer,
            contentType,
            size: file.size
        }
    };
}

const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: MAX_AVATAR_BYTES,
        files: 1
    }
});

function receiveAvatar(req, res, next) {
    upload.single(FIELD_NAME)(req, res, error => {
        if (!error) return next();

        if (error.code === "LIMIT_FILE_SIZE") {
            return res.status(400).json({
                success: false,
                message: MESSAGES.tooLarge
            });
        }

        console.error("Avatar upload error:", error);

        return res.status(400).json({
            success: false,
            message: MESSAGES.unreadable
        });
    });
}

function storeAvatar({
    buffer,
    contentType,
    userId,
    kind = "trainee-avatar"
}) {
    return new Promise((resolve, reject) => {
        const bucket = avatarsBucket();
        const filename = `avatar-${userId}-${Date.now()}`;

        const stream = bucket.openUploadStream(filename, {
            contentType,
            metadata: {
                userId: String(userId),
                kind
            }
        });

        stream.on("error", reject);
        stream.on("finish", () => resolve(stream.id));
        stream.end(buffer);
    });
}

async function deleteAvatarFile(fileId) {
    if (!fileId) return;

    try {
        await avatarsBucket().delete(
            new mongoose.Types.ObjectId(String(fileId))
        );
    } catch (error) {
        // A missing blob is already the state we want.
        const alreadyGone =
            Boolean(error) &&
            (/FileNotFound/i.test(error.name || "") ||
                /File not found/i.test(error.message || ""));

        if (!alreadyGone) {
            console.error("Delete avatar error:", error);
        }
    }
}

async function findAvatarFile(fileId) {
    if (!mongoose.Types.ObjectId.isValid(String(fileId))) return null;

    return avatarsBucket()
        .find({ _id: new mongoose.Types.ObjectId(String(fileId)) })
        .next();
}

async function streamAvatar(res, avatar) {
    const stored = await findAvatarFile(avatar.fileId);

    if (!stored) {
        return res.status(404).json({
            success: false,
            message: MESSAGES.unavailable
        });
    }

    res.setHeader(
        "Content-Type",
        avatar.contentType || stored.contentType || "application/octet-stream"
    );
    res.setHeader("Content-Length", String(avatar.size || stored.length || 0));
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Cache-Control", "private, no-store");

    const stream = avatarsBucket().openDownloadStream(
        new mongoose.Types.ObjectId(String(avatar.fileId))
    );

    stream.on("error", error => {
        console.error("Avatar stream error:", error);

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
    FIELD_NAME,
    MAX_AVATAR_BYTES,
    MESSAGES,
    avatarsBucket,
    sniffContentType,
    validateAvatar,
    receiveAvatar,
    storeAvatar,
    deleteAvatarFile,
    streamAvatar
};
