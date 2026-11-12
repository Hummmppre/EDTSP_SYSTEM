
const verifyRecaptcha = require("../utils/recaptcha");
const verifyGoogleToken = require("../utils/googleAuth");
const User = require("../models/User");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { sendWelcomeEmail } = require("../lib/mailer");

// Generate EDTSP JWT
const generateToken = (user) => {
    if (!process.env.JWT_SECRET) {
        throw new Error("JWT_SECRET is missing from environment variables.");
    }

    return jwt.sign(
        {
            id: user._id,
            role: user.role
        },
        process.env.JWT_SECRET,
        { expiresIn: "1d" }
    );
};

// TRAINEE SIGNUP
const signup = async (req, res) => {
    try {
        const { firstName, lastName, email, password, recaptchaToken } = req.body;

        const captchaValid = await verifyRecaptcha(recaptchaToken);

        if (!captchaValid) {
            return res.status(400).json({
                success: false,
                message: "Please complete the reCAPTCHA verification."
            });
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
            mail: { sent: Boolean(mail && mail.sent) },
            user: {
                id: newUser._id,
                firstName: newUser.firstName,
                lastName: newUser.lastName,
                email: newUser.email,
                role: newUser.role
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
        const { email, password, recaptchaToken } = req.body;

        const captchaValid = await verifyRecaptcha(recaptchaToken);

        if (!captchaValid) {
            return res.status(400).json({
                success: false,
                message: "Please complete the reCAPTCHA verification."
            });
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

        const token = generateToken(user);

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
        const { credential } = req.body;

        if (!credential) {
            return res.status(400).json({
                success: false,
                message: "Google authentication credential is required."
            });
        }

        // Verify the Google ID token and email
        const googleUser = await verifyGoogleToken(credential);

        // Find an existing EDTSP account using the verified email
        let user = await User.findOne({
            email: googleUser.email
        });

        if (user) {
            // Check whether this account is already linked to another Google account
            if (
                user.googleId &&
                user.googleId !== googleUser.googleId
            ) {
                return res.status(409).json({
                    success: false,
                    message: "This EDTSP account is already linked to another Google account."
                });
            }

            // Link the existing account if it has no Google ID
            if (!user.googleId) {
                user.googleId = googleUser.googleId;
                await user.save();
            }

            // Check account status
            if (user.status !== "active") {
                return res.status(403).json({
                    success: false,
                    message: "Your account is inactive. Please contact the administrator."
                });
            }

        } else {
            // Create a new trainee account if the email does not exist
            user = await User.create({
                firstName: googleUser.firstName,
                lastName: googleUser.lastName,
                email: googleUser.email,
                googleId: googleUser.googleId,
                role: "trainee",
                status: "active"
            });
        }

        // Validate account role
        if (!["trainee", "admin"].includes(user.role)) {
            return res.status(403).json({
                success: false,
                message: "Invalid account role. Please contact the administrator."
            });
        }

        // Generate authentication token
        const token = generateToken(user);

        return res.status(200).json({
            success: true,
            message: "Google Sign-In successful!",
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
        console.error("Google Login Error:", error);

        return res.status(401).json({
            success: false,
            message: "Google authentication failed. Please try again."
        });
    }
};


module.exports = {
    signup,
    login,
    googleLogin
};
