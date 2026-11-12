const Program = require("../models/Program");
const TraineeProfile = require("../models/TraineeProfile");

/**
 * Shape a profile for API responses. Program is populated when assigned and a
 * flat `programName` string is always present for older records.
 */
const serializeProfile = (profile) => {
    if (!profile) return null;

    const raw = typeof profile.toObject === "function"
        ? profile.toObject()
        : { ...profile };

    const program = raw.program && typeof raw.program === "object" && raw.program.name
        ? {
            _id: raw.program._id,
            name: raw.program.name,
            code: raw.program.code,
            totalFee: raw.program.totalFee
        }
        : null;

    return {
        _id: raw._id,
        user: raw.user,
        traineeId: raw.traineeId || null,
        program,
        programName:
            (program && program.name) ||
            raw.legacyProgramName ||
            "",
        enrollmentStatus: raw.enrollmentStatus || "Pending",
        phone: raw.phone || "",
        address: raw.address || "",
        createdAt: raw.createdAt,
        updatedAt: raw.updatedAt
    };
};

const serializeUser = (user) => {
    if (!user) return null;

    const raw = typeof user.toObject === "function"
        ? user.toObject()
        : { ...user };

    delete raw.password;

    return {
        _id: raw._id,
        id: raw._id,
        firstName: raw.firstName,
        lastName: raw.lastName,
        email: raw.email,
        role: raw.role,
        status: raw.status,
        createdAt: raw.createdAt,
        updatedAt: raw.updatedAt
    };
};

const serializedProgram = (program) => {
    if (!program) return null;

    const raw = typeof program.toObject === "function"
        ? program.toObject()
        : { ...program };

    return {
        _id: raw._id,
        name: raw.name,
        code: raw.code,
        totalFee: raw.totalFee,
        description: raw.description || "",
        active: raw.active !== false,
        createdAt: raw.createdAt,
        updatedAt: raw.updatedAt
    };
};

module.exports = {
    serializeProfile,
    serializeUser,
    serializedProgram,
    Program,
    TraineeProfile
};
