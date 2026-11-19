
const verifyRecaptcha = require("../utils/recaptcha");
const verifyGoogleToken = require("../utils/googleAuth");
const User = require("../models/User");
const SystemSettings = require("../models/SystemSettings");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const { sendWelcomeEmail, sendPasswordResetEmail } = require("../lib/mailer");
const { assignTraineeId } = require("../lib/traineeId");

// "Remember me" keeps the session for a month, otherwise it lasts a day.
const SESSION_LIFETIME = { remembered: "30d", standard: "1d" };
const RESET_TOKEN_TTL_MINUTES = 60;
const RESET_TOKEN_TTL_MS = RESET_TOKEN_TTL_MINUTES * 60 * 1000;

// Generate EDTSP JWT
const generateToken = (user, remember = false) => {
    if (!process.env.JWT_SECRET) {
        throw new Error("JWT_SECRET is missing from environment variables.");
    }

    return jwt.sign(
        {
            id: user._id,
            role: user.role
        },
        process.env.JWT_SECRET,
        { expiresIn: remember ? SESSION_LIFETIME.remembered : SESSION_LIFETIME.standard }
    );
};

const hashResetToken = (token) =>
    crypto.createHash("sha256").update(token).digest("hex");

// The reset link has to open the static frontend, not the API.
const frontendBaseUrl = () =>
    (process.env.APP_URL || "http://localhost:5500").replace(/\/+$/, "");

// TRAINEE SIGNUP
const signup = async (req, res) => {
    try {
        const { firstName, lastName, email, password, recaptchaToken } = req.body || {};

        // Verify reCAPTCHA only when the administrator has enabled it.
        const settings = await SystemSettings.findOne();
        const recaptchaEnabled = settings
            ? settings.recaptchaEnabled
            : false;

        if (recaptchaEnabled) {
            if (!process.env.RECAPTCHA_SECRET_KEY) {
                return res.status(503).json({
                    success: false,
                    message: "reCAPTCHA verification is not configured. Please contact the administrator."
                });
            }

            const captchaValid = await verifyRecaptcha(recaptchaToken);

            if (!captchaValid) {
                return res.status(400).json({
                    success: false,
                    message: "Please complete the reCAPTCHA verification."
                });
            }
        }

        if (!firstName || !lastName || !email || !password) {
            return res.status(400).json({
                success: false,
                message: "Please complete all required fields."
            });
        }

        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

        if (!emailRegex.test(email)) {
            return res.status(400).json({
                success: false,
                message: "Please enter a valid email address."
            });
        }

        if (password.length < 8) {
            return res.status(400).json({
                success: false,
                message: "Password must be at least 8 characters."
            });
        }

        const normalizedEmail = email.toLowerCase().trim();

        const existingUser = await User.findOne({
            email: normalizedEmail
        });

        if (existingUser) {
            return res.status(409).json({
                success: false,
                message: "This email is already registered."
            });
        }

        const hashedPassword = await bcrypt.hash(password, 12);

        const newUser = await User.create({
            firstName,
            lastName,
            email: normalizedEmail,
            password: hashedPassword,
            role: "trainee"
        });

        // Every trainee gets an ID at signup. A backfill retries this if the
        // assignment fails, so registration itself is never lost.
        const traineeProfile = await assignTraineeId(newUser._id).catch(error => {
            console.error("Trainee ID assignment error:", error.message);
            return null;
        });

        let mail = null;

        try {
            mail = await sendWelcomeEmail({
                to: newUser.email,
                name: `${newUser.firstName} ${newUser.lastName}`
            });
        } catch (mailError) {
            console.error("Welcome email error:", mailError.message);
        }

        return res.status(201).json({
            success: true,
            message: "Trainee account created successfully!",
            token: generateToken(newUser),
            mail: { sent: Boolean(mail && mail.sent) },
            user: {
                id: newUser._id,
                firstName: newUser.firstName,
                lastName: newUser.lastName,
                email: newUser.email,
                role: newUser.role,
                traineeId: (traineeProfile && traineeProfile.traineeId) || null
            }
        });

    } catch (error) {
        console.error("Signup Error:", error);

        return res.status(500).json({
            success: false,
            message: "Server error during registration."
        });
    }
};


// USER LOGIN - AUTOMATIC ROLE DETECTION
const login = async (req, res) => {
    try {
        const { email, password, recaptchaToken, remember } = req.body || {};

        // Verify reCAPTCHA only when the administrator has enabled it.
        const settings = await SystemSettings.findOne();
        const recaptchaEnabled = settings
            ? settings.recaptchaEnabled
            : false;

        if (recaptchaEnabled) {
            if (!process.env.RECAPTCHA_SECRET_KEY) {
                return res.status(503).json({
                    success: false,
                    message: "reCAPTCHA verification is not configured. Please contact the administrator."
                });
            }

            const captchaValid = await verifyRecaptcha(recaptchaToken);

            if (!captchaValid) {
                return res.status(400).json({
                    success: false,
                    message: "Please complete the reCAPTCHA verification."
                });
            }
        }

        if (!email || !password) {
            return res.status(400).json({
                success: false,
                message: "Please enter your email and password."
            });
        }

        const user = await User.findOne({
            email: email.toLowerCase().trim()
        });

        if (!user || !user.password) {
            return res.status(401).json({
                success: false,
                message: "Invalid email or password."
            });
        }

        if (user.status !== "active") {
            return res.status(403).json({
                success: false,
                message: "Your account is inactive. Please contact the administrator."
            });
        }

        const passwordMatch = await bcrypt.compare(
            password,
            user.password
        );
        if (!passwordMatch) {
            return res.status(401).json({
                success: false,
                message: "Invalid email or password."
            });
        }

        if (!["trainee", "admin"].includes(user.role)) {
            return res.status(403).json({
                success: false,
                message: "Invalid account role. Please contact the administrator."
            });
        }

        const token = generateToken(user, remember === true);

        return res.status(200).json({
            success: true,
            message: "Login successful!",
            token,
            user: {
                id: user._id,
                firstName: user.firstName,
                lastName: user.lastName,
                email: user.email,
                role: user.role
            }
        });

    } catch (error) {
        console.error("Login Error:", error);

        return res.status(500).json({
            success: false,
            message: "Server error during login."
        });
    }
};


// GOOGLE SIGN-IN
const googleLogin = async (req, res) => {
    try {
        const { credential } = req.body || {};

        if (!credential) {
            return res.status(400).json({
                success: false,
                message: "Google authentication credential is required."
            });
        }

        // Google Sign-In must honor the administrator's setting, not just the UI.
        const settings = await SystemSettings.findOne();

        if (!settings || !settings.googleAuthEnabled) {
            return res.status(503).json({
                success: false,
                message: "Google Sign-In is currently disabled."
            });
        }

        // Verify the Google ID token
        const googleUser = await verifyGoogleToken(credential);

        // Find account using verified Google email
        let user = await User.findOne({
            email: googleUser.email
        });

        if (user) {
            // Only allow accounts already linked to this Google identity
            if (!user.googleId || user.googleId !== googleUser.googleId) {
                return res.status(409).json({
                    success: false,
                    message: "An account already exists with this email. Please sign in using your email and password."
                });
            }

            if (user.status !== "active") {
                return res.status(403).json({
                    success: false,
                    message: "Your account is inactive. Please contact the administrator."
                });
            }

        } else {
            // New Google accounts are always created as trainees
            user = await User.create({
                firstName: googleUser.firstName,
                lastName: googleUser.lastName,
                email: googleUser.email,
                googleId: googleUser.googleId,
                role: "trainee",
                status: "active"
            });
        }

        if (!["trainee", "admin"].includes(user.role)) {
            return res.status(403).json({
                success: false,
                message: "Invalid account role. Please contact the administrator."
            });
        }

        const token = generateToken(user);

        const profile = user.role === "trainee"
            ? await assignTraineeId(user._id).catch(error => {
                console.error("Trainee ID assignment error:", error.message);
                return null;
            })
            : null;

        return res.status(200).json({
            success: true,
            message: "Google Sign-In successful!",
            token,
            user: {
                id: user._id,
                firstName: user.firstName,
                lastName: user.lastName,
                email: user.email,
                role: user.role,
                traineeId: (profile && profile.traineeId) || null
            }
        });

    } catch (error) {
        console.error("Google Login Error:", error);

        return res.status(401).json({
            success: false,
            message: "Google authentication failed. Please try again."
        });
    }
};

// FORGOT PASSWORD - always answers the same way so the endpoint cannot be
// used to discover which emails have accounts.
const forgotPassword = async (req, res) => {
    const genericMessage =
        "If an account exists for that email, a password reset link has been sent.";

    try {
        const email = String((req.body && req.body.email) || "").trim();

        if (!email) {
            return res.status(400).json({
                success: false,
                message: "Please enter your email address."
            });
        }

        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

        if (!emailRegex.test(email)) {
            return res.status(400).json({
                success: false,
                message: "Please enter a valid email address."
            });
        }

        const user = await User.findOne({ email: email.toLowerCase() });

        if (!user) {
            return res.status(200).json({
                success: true,
                message: genericMessage
            });
        }

        const rawToken = crypto.randomBytes(32).toString("hex");

        user.resetPasswordToken = hashResetToken(rawToken);
        user.resetPasswordExpires = new Date(Date.now() + RESET_TOKEN_TTL_MS);
        await user.save();

        const mail = await sendPasswordResetEmail({
            to: user.email,
            name: `${user.firstName} ${user.lastName}`,
            resetUrl: `${frontendBaseUrl()}/reset-password.html?token=${rawToken}`,
            expiresMinutes: RESET_TOKEN_TTL_MINUTES
        });

        if (!mail.sent) {
            console.error("Password reset email not sent:", mail.error);
        }

        return res.status(200).json({
            success: true,
            message: genericMessage
        });

    } catch (error) {
        console.error("Forgot Password Error:", error);

        return res.status(500).json({
            success: false,
            message: "Server error while processing the password reset request."
        });
    }
};

// RESET PASSWORD - consumes a single-use token from the emailed link.
const resetPassword = async (req, res) => {
    try {
        const body = req.body || {};
        const token = String(body.token || "").trim();
        const { password } = body;

        if (!token || !password) {
            return res.status(400).json({
                success: false,
                message: "Please provide a reset token and a new password."
            });
        }

        if (password.length < 8) {
            return res.status(400).json({
                success: false,
                message: "Password must be at least 8 characters."
            });
        }

        const user = await User.findOne({
            resetPasswordToken: hashResetToken(token),
            resetPasswordExpires: { $gt: new Date() }
        });

        if (!user) {
            return res.status(400).json({
                success: false,
                message: "This reset link is invalid or has expired. Please request a new one."
            });
        }

        user.password = await bcrypt.hash(password, 12);
        user.resetPasswordToken = undefined;
        user.resetPasswordExpires = undefined;
        await user.save();

        return res.status(200).json({
            success: true,
            message: "Your password has been reset. You can now sign in."
        });

    } catch (error) {
        console.error("Reset Password Error:", error);

        return res.status(500).json({
            success: false,
            message: "Server error while resetting the password."
        });
    }
};

module.exports = {
    signup,
    login,
    googleLogin,
    forgotPassword,
    resetPassword
};
