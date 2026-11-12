const rateLimit = require("express-rate-limit");

const isTest = () => process.env.NODE_ENV === "test";

const limiter = ({ windowMs, max, message }) =>
    rateLimit({
        windowMs,
        max,
        standardHeaders: true,
        legacyHeaders: false,
        skip: isTest,
        message: {
            success: false,
            message,
            code: "RATE_LIMITED"
        }
    });

const authLimiter = limiter({
    windowMs: 15 * 60 * 1000,
    max: 20,
    message: "Too many attempts. Wait a few minutes and try again."
});

const resetLimiter = limiter({
    windowMs: 60 * 60 * 1000,
    max: 5,
    message: "Too many password reset requests. Try again in an hour."
});

const apiLimiter = limiter({
    windowMs: 15 * 60 * 1000,
    max: 300,
    message: "Too many requests. Please slow down."
});

module.exports = { authLimiter, resetLimiter, apiLimiter };
