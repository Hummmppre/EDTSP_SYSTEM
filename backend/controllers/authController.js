const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const User = require("../models/User");
const TraineeProfile = require("../models/TraineeProfile");
const { serializeProfile, serializeUser } = require("../utils/serializers");

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const RESET_TOKEN_TTL_MS = 30 * 60 * 1000;

const signToken = (user) =>
    jwt.sign(
        {
            id: user._id,
            role: user.role,
            tokenVersion: user.tokenVersion || 0
        },
        process.env.JWT_SECRET,
        { expiresIn: "1d" }
    );

const hashResetToken = (token) =>
    crypto.createHash("sha256").update(token).digest("hex");

// TRAINEE SIGNUP
const signup = async (req, res, next) => {
    try {
        const firstName = String(req.body.firstName || "").trim();
        const lastName = String(req.body.lastName || "").trim();
        const email = String(req.body.email || "").trim().toLowerCase();
        const password = String(req.body.password || "");

        const missingField = !firstName
            ? "firstName"
            : !lastName
                ? "lastName"
                : !email
                    ? "email"
                    : !password
                        ? "password"
                        : null;

        if (missingField) {
            return res.status(400).json({
                success: false,
                message: "Please complete all required fields.",
                field: missingField,
                code: "MISSING_FIELD"
            });
        }

        if (!EMAIL_REGEX.test(email)) {
            return res.status(400).json({
                success: false,
                message: "Please enter a valid email address.",
                field: "email",
                code: "INVALID_EMAIL"
            });
        }

        if (password.length < 8) {
            return res.status(400).json({
                success: false,
                message: "Password must be at least 8 characters.",
                field: "password",
                code: "WEAK_PASSWORD"
            });
        }

        const existingUser = await User.findOne({ email });

        if (existingUser) {
            return res.status(409).json({
                success: false,
                message: "This email is already registered.",
                field: "email",
                code: "DUPLICATE_EMAIL"
            });
        }

        const hashedPassword = await bcrypt.hash(password, 12);

        const newUser = await User.create({
            firstName,
            lastName,
            email,
            password: hashedPassword,
            role: "trainee"
        });

        // Every trainee account gets a profile in the same flow.
        await TraineeProfile.create({
            user: newUser._id,
            enrollmentStatus: "Pending"
        });

        return res.status(201).json({
            success: true,
            message: "Trainee account created successfully!",
            user: serializeUser(newUser)
        });
    } catch (error) {
        return next(error);
    }
};

// USER LOGIN - AUTOMATIC ROLE DETECTION
const login = async (req, res, next) => {
    try {
        const email = String(req.body.email || "").trim().toLowerCase();
        const password = String(req.body.password || "");

        if (!email || !password) {
            return res.status(400).json({
                success: false,
                message: "Please enter your email and password.",
                code: "MISSING_FIELD"
            });
        }

        const user = await User.findOne({ email });

        if (!user) {
            return res.status(401).json({
                success: false,
                message: "Invalid email or password.",
                code: "INVALID_CREDENTIALS"
            });
        }

        if (user.status !== "active") {
            return res.status(403).json({
                success: false,
                message: "Your account is inactive. Please contact the administrator.",
                code: "ACCOUNT_INACTIVE"
            });
        }

        const passwordMatch = await bcrypt.compare(password, user.password);

        if (!passwordMatch) {
            return res.status(401).json({
                success: false,
                message: "Invalid email or password.",
                code: "INVALID_CREDENTIALS"
            });
        }

        if (!["trainee", "admin"].includes(user.role)) {
            return res.status(403).json({
                success: false,
                message: "Invalid account role. Please contact the administrator.",
                code: "INVALID_ROLE"
            });
        }

        if (!process.env.JWT_SECRET) {
            throw new Error("JWT_SECRET is missing from environment variables.");
        }

        return res.status(200).json({
            success: true,
            message: "Login successful!",
            token: signToken(user),
            user: serializeUser(user)
        });
    } catch (error) {
        return next(error);
    }
};

// FRESH ACCOUNT + PROFILE — used by the client session guard.
const getMe = async (req, res, next) => {
    try {
        const user = await User.findById(req.user.id);

        if (!user) {
            return res.status(404).json({
                success: false,
                message: "Account not found.",
                code: "NOT_FOUND"
            });
        }

        const profile = user.role === "trainee"
            ? await TraineeProfile.findOne({ user: user._id }).populate("program")
            : null;

        return res.status(200).json({
            success: true,
            user: serializeUser(user),
            profile: serializeProfile(profile)
        });
    } catch (error) {
        return next(error);
    }
};

// LOGOUT — revoking every token issued for this account.
const logout = async (req, res, next) => {
    try {
        await User.updateOne(
            { _id: req.user.id },
            { $inc: { tokenVersion: 1 } }
        );

        return res.status(200).json({
            success: true,
            message: "You have been signed out."
        });
    } catch (error) {
        return next(error);
    }
};

const changePassword = async (req, res, next) => {
    try {
        const currentPassword = String(req.body.currentPassword || "");
        const newPassword = String(req.body.newPassword || "");

        if (!currentPassword || !newPassword) {
            return res.status(400).json({
                success: false,
                message: "Enter your current and new password.",
                code: "MISSING_FIELD"
            });
        }

        if (newPassword.length < 8) {
            return res.status(400).json({
                success: false,
                message: "The new password must be at least 8 characters.",
                field: "newPassword",
                code: "WEAK_PASSWORD"
            });
        }

        if (currentPassword === newPassword) {
            return res.status(400).json({
                success: false,
                message: "The new password must be different from the current one.",
                field: "newPassword",
                code: "SAME_PASSWORD"
            });
        }

        const user = await User.findById(req.user.id);

        if (!user) {
            return res.status(404).json({
                success: false,
                message: "Account not found.",
                code: "NOT_FOUND"
            });
        }

        const matches = await bcrypt.compare(currentPassword, user.password);

        if (!matches) {
            return res.status(400).json({
                success: false,
                message: "The current password is not correct.",
                field: "currentPassword",
                code: "WRONG_PASSWORD"
            });
        }

        user.password = await bcrypt.hash(newPassword, 12);
        user.tokenVersion = (user.tokenVersion || 0) + 1;
        await user.save();

        // Issue a fresh token so this device stays signed in.
        return res.status(200).json({
            success: true,
            message: "Password updated. Other sessions have been signed out.",
            token: signToken(user)
        });
    } catch (error) {
        return next(error);
    }
};

const forgotPassword = async (req, res, next) => {
    try {
        const email = String(req.body.email || "").trim().toLowerCase();

        const genericResponse = {
            success: true,
            message: "If that email exists, a reset link has been created."
        };

        if (!email) {
            return res.status(400).json({
                success: false,
                message: "Enter the email address on your account.",
                field: "email",
                code: "MISSING_FIELD"
            });
        }

        const user = await User.findOne({ email });

        if (!user || user.status !== "active") {
            return res.status(200).json(genericResponse);
        }

        const resetToken = crypto.randomBytes(32).toString("hex");

        user.resetPasswordToken = hashResetToken(resetToken);
        user.resetPasswordExpires = new Date(Date.now() + RESET_TOKEN_TTL_MS);
        await user.save({ validateBeforeSave: false });

        // No email provider is configured: surface the token in development only.
        if (process.env.NODE_ENV !== "production") {
            genericResponse.resetToken = resetToken;
        }

        return res.status(200).json(genericResponse);
    } catch (error) {
        return next(error);
    }
};

const resetPassword = async (req, res, next) => {
    try {
        const token = String(req.body.token || "").trim();
        const newPassword = String(req.body.newPassword || "");

        if (!token) {
            return res.status(400).json({
                success: false,
                message: "The reset link is missing its token.",
                code: "MISSING_TOKEN"
            });
        }

        if (newPassword.length < 8) {
            return res.status(400).json({
                success: false,
                message: "The new password must be at least 8 characters.",
                field: "newPassword",
                code: "WEAK_PASSWORD"
            });
        }

        const user = await User.findOne({
            resetPasswordToken: hashResetToken(token),
            resetPasswordExpires: { $gt: new Date() }
        }).select("+resetPasswordToken +resetPasswordExpires");

        if (!user) {
            return res.status(400).json({
                success: false,
                message: "This reset link is invalid or has expired.",
                code: "INVALID_RESET_TOKEN"
            });
        }

        user.password = await bcrypt.hash(newPassword, 12);
        user.resetPasswordToken = null;
        user.resetPasswordExpires = null;
        user.tokenVersion = (user.tokenVersion || 0) + 1;
        await user.save();

        return res.status(200).json({
            success: true,
            message: "Password reset. You can now sign in with the new password."
        });
    } catch (error) {
        return next(error);
    }
};

module.exports = {
    signup,
    login,
    getMe,
    logout,
    changePassword,
    forgotPassword,
    resetPassword
};
