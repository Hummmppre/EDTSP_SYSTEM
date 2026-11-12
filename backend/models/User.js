const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
    {
        firstName: {
            type: String,
            required: true,
            trim: true
        },

        lastName: {
            type: String,
            required: true,
            trim: true
        },

        email: {
            type: String,
            required: true,
            unique: true,
            lowercase: true,
            trim: true
        },

        password: {
            type: String,
            required: true
        },

        role: {
            type: String,
            enum: ["trainee", "admin"],
            default: "trainee"
        },

        status: {
            type: String,
            enum: ["active", "inactive"],
            default: "active"
        },

        // Every issued JWT carries this value. Bumping it revokes all sessions.
        tokenVersion: {
            type: Number,
            default: 0
        },

        // SHA-256 hash of a single-use password reset token.
        resetPasswordToken: {
            type: String,
            select: false,
            default: null
        },

        resetPasswordExpires: {
            type: Date,
            select: false,
            default: null
        }
    },
    {
        timestamps: true
    }
);

const User = mongoose.model("User", userSchema);

module.exports = User;
