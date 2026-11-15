
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
            required: function () {
                return !this.googleId;
            }
        },

        googleId: {
            type: String,
            unique: true,
            sparse: true
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

        // Only the SHA-256 hash of the emailed token is stored.
        resetPasswordToken: {
            type: String
        },

        resetPasswordExpires: {
            type: Date
        }
    },
    {
        timestamps: true
    }
);

const User = mongoose.model("User", userSchema);

module.exports = User;
