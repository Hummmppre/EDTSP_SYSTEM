const FIELD_BY_DUPLICATE_KEY = {
    email: { field: "email", code: "DUPLICATE_EMAIL", status: 409 },
    traineeId: { field: "traineeId", code: "DUPLICATE_TRAINEE_ID", status: 409 },
    paymentRef: { field: "paymentRef", code: "DUPLICATE_PAYMENT_REF", status: 409 },
    cowId: { field: "cowId", code: "DUPLICATE_COW_ID", status: 409 },
    name: { field: "name", code: "DUPLICATE_NAME", status: 409 },
    code: { field: "code", code: "DUPLICATE_CODE", status: 409 }
};

const duplicateKeyDetails = (error) => {
    const keys = Object.keys(error.keyPattern || error.keyValue || {});
    const firstKey = keys[0];

    return FIELD_BY_DUPLICATE_KEY[firstKey] || {
        field: firstKey || undefined,
        code: "DUPLICATE_KEY",
        status: 409
    };
};

// 404 for unmatched API routes — never leaks HTML into an API call.
const apiNotFound = (req, res) => {
    res.status(404).json({
        success: false,
        message: `No API route matches ${req.method} ${req.originalUrl}.`,
        code: "NOT_FOUND"
    });
};

// eslint-disable-next-line no-unused-vars
const errorHandler = (error, req, res, next) => {
    if (res.headersSent) {
        return;
    }

    if (error.name === "ValidationError") {
        const firstField = Object.keys(error.errors || {})[0];
        const message = firstField
            ? error.errors[firstField].message
            : "Please check the submitted values.";

        return res.status(400).json({
            success: false,
            message,
            field: firstField,
            code: "VALIDATION_ERROR"
        });
    }

    if (error.name === "CastError") {
        return res.status(400).json({
            success: false,
            message: "That identifier is not valid.",
            field: error.path,
            code: "INVALID_ID"
        });
    }

    if (error.code === 11000) {
        const details = duplicateKeyDetails(error);

        return res.status(details.status).json({
            success: false,
            message: "That record already exists.",
            field: details.field,
            code: details.code
        });
    }

    if (error.name === "JsonWebTokenError" || error.name === "TokenExpiredError") {
        return res.status(401).json({
            success: false,
            message: "Invalid or expired login session.",
            code: "INVALID_SESSION"
        });
    }

    if (error.type === "entity.parse.failed") {
        return res.status(400).json({
            success: false,
            message: "The request body is not valid JSON.",
            code: "INVALID_BODY"
        });
    }

    if (error.type === "entity.too.large") {
        return res.status(413).json({
            success: false,
            message: "The request body is too large.",
            code: "BODY_TOO_LARGE"
        });
    }

    console.error("Unhandled API error:", error);

    return res.status(500).json({
        success: false,
        message: "Something went wrong on the server. Please try again.",
        code: "SERVER_ERROR"
    });
};

module.exports = { errorHandler, apiNotFound };
