const jwt = require("jsonwebtoken");
const User = require("../models/User");

const sendAuthError = (res, status, message, code) =>
    res.status(status).json({
        success: false,
        message,
        code
    });

/**
 * Verify the bearer token AND re-read the account, so a deactivated user or a
 * revoked session is rejected on the very next request.
 */
const protect = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;

        if (!authHeader || !authHeader.startsWith("Bearer ")) {
            return sendAuthError(
                res,
                401,
                "Access denied. Please log in.",
                "NO_TOKEN"
            );
        }

        const token = authHeader.slice(7).trim();

        if (!token) {
            return sendAuthError(
                res,
                401,
                "Access denied. Please log in.",
                "NO_TOKEN"
            );
        }

        let decoded;

        try {
            decoded = jwt.verify(token, process.env.JWT_SECRET);
        } catch (error) {
            return sendAuthError(
                res,
                401,
                "Invalid or expired login session.",
                "INVALID_SESSION"
            );
        }

        const user = await User.findById(decoded.id).select(
            "role status tokenVersion"
        );

        if (!user) {
            return sendAuthError(
                res,
                401,
                "This account no longer exists.",
                "INVALID_SESSION"
            );
        }

        if (user.status !== "active") {
            return sendAuthError(
                res,
                403,
                "This account has been deactivated. Contact the administrator.",
                "ACCOUNT_INACTIVE"
            );
        }

        if (Number(decoded.tokenVersion || 0) !== Number(user.tokenVersion || 0)) {
            return sendAuthError(
                res,
                401,
                "Your session has ended. Please sign in again.",
                "SESSION_REVOKED"
            );
        }

        req.user = {
            id: user._id.toString(),
            role: user.role,
            status: user.status
        };

        return next();
    } catch (error) {
        return next(error);
    }
};

// Allow only trainee accounts
const traineeOnly = (req, res, next) => {
    if (!req.user || req.user.role !== "trainee") {
        return sendAuthError(
            res,
            403,
            "Access denied. Trainee accounts only.",
            "FORBIDDEN_ROLE"
        );
    }

    return next();
};

const adminOnly = (req, res, next) => {
    if (!req.user || req.user.role !== "admin") {
        return sendAuthError(
            res,
            403,
            "Access denied. Administrator accounts only.",
            "FORBIDDEN_ROLE"
        );
    }

    return next();
};

module.exports = { protect, traineeOnly, adminOnly };
