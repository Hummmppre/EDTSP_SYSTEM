const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const User = require("../../models/User");
const TraineeProfile = require("../../models/TraineeProfile");
const Program = require("../../models/Program");

const PASSWORD = "Password123!";

let sequence = 0;

const uniqueEmail = (prefix = "trainee") => {
    sequence += 1;
    return `${prefix}${sequence}${Date.now()}@example.com`;
};

const tokenFor = (user) =>
    jwt.sign(
        {
            id: user._id,
            role: user.role,
            tokenVersion: user.tokenVersion || 0
        },
        process.env.JWT_SECRET,
        { expiresIn: "1h" }
    );

const createAdmin = async (overrides = {}) => {
    const user = await User.create({
        firstName: overrides.firstName || "Ada",
        lastName: overrides.lastName || "Admin",
        email: overrides.email || uniqueEmail("admin"),
        password: await bcrypt.hash(PASSWORD, 4),
        role: "admin",
        status: overrides.status || "active"
    });

    return { user, token: tokenFor(user), password: PASSWORD };
};

const createTrainee = async (overrides = {}) => {
    const user = await User.create({
        firstName: overrides.firstName || "Tara",
        lastName: overrides.lastName || "Trainee",
        email: overrides.email || uniqueEmail("trainee"),
        password: await bcrypt.hash(PASSWORD, 4),
        role: "trainee",
        status: overrides.status || "active"
    });

    const profile = await TraineeProfile.create({
        user: user._id,
        traineeId: overrides.traineeId,
        program: overrides.program || null,
        enrollmentStatus: overrides.enrollmentStatus || "Ongoing",
        phone: overrides.phone || "",
        address: overrides.address || ""
    });

    return { user, profile, token: tokenFor(user), password: PASSWORD };
};

const createProgram = async (overrides = {}) => {
    sequence += 1;

    return Program.create({
        name: overrides.name || `Program ${sequence}`,
        code: overrides.code || `P${sequence}`,
        totalFee: overrides.totalFee === undefined ? 18000 : overrides.totalFee,
        active: overrides.active === undefined ? true : overrides.active
    });
};

module.exports = {
    PASSWORD,
    tokenFor,
    createAdmin,
    createTrainee,
    createProgram,
    uniqueEmail
};
