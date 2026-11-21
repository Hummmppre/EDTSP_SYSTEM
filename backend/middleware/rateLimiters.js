const crypto = require("crypto");
const { rateLimit, ipKeyGenerator } = require("express-rate-limit");
const {
  createCounter,
  createRateLimitStore,
} = require("../lib/rateLimitStore");

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;

const LOGIN_FAILURE_THRESHOLD = 5;
const LOGIN_FAILURE_DELAY_MS = 1500;
const LOGIN_FAILURE_WINDOW_MS = 15 * MINUTE;
const PASSWORD_RESET_LIMIT = 3;

const MESSAGES = {
  api: "Too many requests. Please wait a few minutes and try again.",
  login: "Too many login attempts. Please wait 15 minutes, then try again.",
  signup: "Too many sign-up attempts. Please try again later.",
  passwordReset: "Too many password reset requests. Please try again later.",
  upload: "Too many uploads. Please wait 15 minutes, then try again.",
};

function normalizedEmail(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

// Hash account identifiers so the shared rate-limit collection never stores
// email addresses in plain text.
function accountKey(value) {
  const email = normalizedEmail(value);

  if (!email) return "";

  return crypto.createHash("sha256").update(email).digest("hex");
}

function clientIp(req) {
  return req.ip ? ipKeyGenerator(req.ip) : "unknown";
}

function normalizeEndpoint(path) {
  const normalized = String(path || "").toLowerCase();

  if (normalized.length > 1 && normalized.endsWith("/")) {
    return normalized.replace(/\/+$/, "");
  }

  return normalized;
}

// Buckets follow the route template (".../trainees/:userId") so varying IDs
// cannot mint fresh allowances, and they stay independent per endpoint.
function endpointKeyGenerator(req) {
  const pattern =
    req.route && req.route.path
      ? req.baseUrl + req.route.path
      : req.baseUrl + req.path;

  return `${normalizeEndpoint(pattern)}|${clientIp(req)}`;
}

function retryAfterSeconds(retryAfterMs) {
  return Math.max(1, Math.ceil(Number(retryAfterMs || 0) / 1000));
}

// The existing API error shape is { success: false, message }. Keep it for
// 429 responses and always include Retry-After, including on account limits.
function sendRateLimitResponse(res, message, retryAfterMs) {
  res.set("Retry-After", String(retryAfterSeconds(retryAfterMs)));

  return res.status(429).json({
    success: false,
    message,
  });
}

function createLimiter({
  windowMs,
  limit,
  prefix,
  message,
  keyGenerator,
  skip,
  skipSuccessfulRequests,
}) {
  const options = {
    windowMs,
    limit,
    standardHeaders: true,
    legacyHeaders: false,
    // A transient database problem should not take the API down. Normal
    // authentication and authorization checks still run.
    passOnStoreError: true,
    store: createRateLimitStore({ prefix, windowMs }),
    handler: (req, res, next, options) => {
      const resetTime = req.rateLimit && req.rateLimit.resetTime;
      const retryAfterMs = resetTime
        ? new Date(resetTime).getTime() - Date.now()
        : options.windowMs;

      return sendRateLimitResponse(res, message, retryAfterMs);
    },
  };

  if (keyGenerator) options.keyGenerator = keyGenerator;
  if (skip) options.skip = skip;
  if (skipSuccessfulRequests) options.skipSuccessfulRequests = true;

  return rateLimit(options);
}

// Only writes are limited. Reads, page-load fetches, preflights, downloads and
// exports never touch a counter, so ordinary browsing cannot cause a 429.
const SAFE_METHODS = ["GET", "HEAD", "OPTIONS"];

const apiWriteLimiter = createLimiter({
  windowMs: 15 * MINUTE,
  limit: 60,
  prefix: "api-write",
  message: MESSAGES.api,
  keyGenerator: endpointKeyGenerator,
  // The limiter is attached only to write routes. The guard keeps a mistaken
  // future mount from ever throttling a read.
  skip: (req) => SAFE_METHODS.includes(req.method),
});

const loginLimiter = createLimiter({
  windowMs: 15 * MINUTE,
  limit: 10,
  prefix: "login",
  message: MESSAGES.login,
  // Successful sign-ins must not consume the failed-attempt allowance.
  skipSuccessfulRequests: true,
});

const signupLimiter = createLimiter({
  windowMs: HOUR,
  limit: 5,
  prefix: "signup",
  message: MESSAGES.signup,
});

const googleLoginLimiter = createLimiter({
  windowMs: 15 * MINUTE,
  limit: 10,
  prefix: "google-login",
  message: "Too many Google sign-in attempts. Please try again later.",
});

const forgotPasswordIpLimiter = createLimiter({
  windowMs: HOUR,
  limit: PASSWORD_RESET_LIMIT,
  prefix: "forgot-password-ip",
  message: MESSAGES.passwordReset,
});

const forgotPasswordAccountLimiter = createLimiter({
  windowMs: HOUR,
  limit: PASSWORD_RESET_LIMIT,
  prefix: "forgot-password-account",
  message: MESSAGES.passwordReset,
  keyGenerator: (req) => {
    const email = normalizedEmail(req.body && req.body.email);

    return email ? `account:${accountKey(email)}` : `ip:${clientIp(req)}`;
  },
});

const resetPasswordIpLimiter = createLimiter({
  windowMs: HOUR,
  limit: PASSWORD_RESET_LIMIT,
  prefix: "reset-password-ip",
  message: MESSAGES.passwordReset,
});

const traineeUploadLimiter = createLimiter({
  windowMs: 15 * MINUTE,
  limit: 20,
  prefix: "trainee-upload",
  message: MESSAGES.upload,
  keyGenerator: (req) => {
    const userId = req.user && (req.user.id || req.user._id);

    return userId ? `trainee:${userId}` : `ip:${clientIp(req)}`;
  },
});

const integrationValidationLimiter = createLimiter({
  windowMs: 15 * MINUTE,
  limit: 20,
  prefix: "integration-validation",
  message:
    "Too many integration validations. Please wait 15 minutes and try again.",
  keyGenerator: (req) => {
    const userId = req.user && (req.user.id || req.user._id);

    return userId ? `admin:${userId}` : `ip:${clientIp(req)}`;
  },
});

const loginFailureCounter = createCounter({
  prefix: "login-failure",
  windowMs: LOGIN_FAILURE_WINDOW_MS,
});

const passwordResetAccountCounter = createCounter({
  prefix: "reset-password-account",
  windowMs: HOUR,
});

async function recordLoginFailure(email) {
  const key = accountKey(email);

  if (!key) return;

  try {
    await loginFailureCounter.increment(key);
  } catch (error) {
    console.error("Login failure counter error:", error.message);
  }
}

async function clearLoginFailures(email) {
  const key = accountKey(email);

  if (!key) return;

  try {
    await loginFailureCounter.resetKey(key);
  } catch (error) {
    console.error("Login failure counter reset error:", error.message);
  }
}

// Slow down, but never lock out, an account after repeated failures. A correct
// password still works and clears the counter. reCAPTCHA remains enforced by
// the login controller whenever the administrator has enabled it.
async function loginFailureGuard(req, res, next) {
  const key = accountKey(req.body && req.body.email);

  if (!key) return next();

  try {
    const info = await loginFailureCounter.get(key);

    if (info && info.totalHits >= LOGIN_FAILURE_THRESHOLD) {
      req.loginFailureCount = info.totalHits;
      await new Promise((resolve) =>
        setTimeout(resolve, LOGIN_FAILURE_DELAY_MS),
      );
    }
  } catch (error) {
    console.error("Login failure lookup error:", error.message);
  }

  return next();
}

// Reset submissions cannot be keyed by email in middleware because the email
// lives behind the reset token. The controller calls this after it finds the
// account, keeping the limit shared and per-account.
async function consumePasswordResetAttempt(email) {
  const key = accountKey(email);

  if (!key) return { allowed: true, retryAfterMs: 0 };

  try {
    const info = await passwordResetAccountCounter.increment(key);

    if (info.totalHits <= PASSWORD_RESET_LIMIT) {
      return { allowed: true, retryAfterMs: 0 };
    }

    return {
      allowed: false,
      retryAfterMs: Math.max(
        new Date(info.resetTime).getTime() - Date.now(),
        1000,
      ),
    };
  } catch (error) {
    console.error("Password reset counter error:", error.message);

    return { allowed: true, retryAfterMs: 0 };
  }
}

module.exports = {
  apiWriteLimiter,
  clearLoginFailures,
  consumePasswordResetAttempt,
  forgotPasswordAccountLimiter,
  forgotPasswordIpLimiter,
  googleLoginLimiter,
  integrationValidationLimiter,
  loginFailureGuard,
  loginLimiter,
  recordLoginFailure,
  resetPasswordIpLimiter,
  sendRateLimitResponse,
  signupLimiter,
  traineeUploadLimiter,
  MESSAGES,
};
