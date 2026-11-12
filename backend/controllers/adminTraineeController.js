const mongoose = require("mongoose");

const User = require("../models/User");
const TraineeProfile = require("../models/TraineeProfile");
const Program = require("../models/Program");

const { getPagination, paginationMeta } = require("../utils/pagination");
const { searchRegExp } = require("../utils/dates");
const { serializeProfile } = require("../utils/serializers");
const { getVerifiedTotalsByUser } = require("../utils/balances");

const TRAINEE_ID_PATTERN = /^EDT-\d{4}-\d{3}$/;
const ENROLLMENT_STATUSES = ["Pending", "Ongoing", "Completed", "Inactive"];

const buildTraineeQuery = async (req) => {
    const { search, status, account, program } = req.query;

    const userQuery = { role: "trainee" };
    const profileQuery = {};

    if (status && status !== "all") profileQuery.enrollmentStatus = status;
    if (program && program !== "all") profileQuery.program = program;
    if (account && account !== "all") userQuery.status = account;

    let profileUserIds = null;

    if (Object.keys(profileQuery).length > 0) {
        profileUserIds = await TraineeProfile.find(profileQuery).distinct("user");
    }

    if (search && String(search).trim()) {
        const rx = searchRegExp(search);

        const searchProfileIds = await TraineeProfile.find({
            traineeId: rx
        }).distinct("user");

        const searchUserIds = await User.find({
            role: "trainee",
            $or: [
                { firstName: rx },
                { lastName: rx },
                { email: rx },
                { _id: { $in: searchProfileIds } }
            ]
        }).distinct("_id");

        if (profileUserIds) {
            userQuery._id = {
                $in: searchUserIds.filter((id) =>
                    profileUserIds.some((profileId) => String(profileId) === String(id))
                )
            };
        } else {
            userQuery._id = { $in: searchUserIds };
        }
    } else if (profileUserIds) {
        userQuery._id = { $in: profileUserIds };
    }

    return userQuery;
};

// ADMIN: list trainee accounts with their profile and fee standing.
const getTrainees = async (req, res, next) => {
    try {
        const { page, limit, skip } = getPagination(req.query);
        const userQuery = await buildTraineeQuery(req);

        const [total, users] = await Promise.all([
            User.countDocuments(userQuery),
            User.find(userQuery)
                .sort({ lastName: 1, firstName: 1 })
                .skip(skip)
                .limit(limit)
        ]);

        const [profiles, paidByUser] = await Promise.all([
            TraineeProfile.find({
                user: { $in: users.map((user) => user._id) }
            }).populate("program"),
            getVerifiedTotalsByUser()
        ]);

        const profileByUser = new Map(
            profiles.map((profile) => [String(profile.user), profile])
        );

        const trainees = users.map((user) => {
            const profile = profileByUser.get(String(user._id));
            const serialized = serializeProfile(profile);
            const paid = paidByUser.get(String(user._id)) || 0;
            const totalFee = serialized?.program?.totalFee || 0;

            return {
                _id: user._id,
                firstName: user.firstName,
                lastName: user.lastName,
                name: `${user.firstName} ${user.lastName}`.trim(),
                email: user.email,
                status: user.status,
                createdAt: user.createdAt,
                traineeId: serialized?.traineeId || null,
                program: serialized?.program || null,
                programName: serialized?.programName || "",
                enrollmentStatus: serialized?.enrollmentStatus || "Pending",
                phone: serialized?.phone || "",
                address: serialized?.address || "",
                totalFee,
                paid,
                balance: Math.max(totalFee - paid, 0)
            };
        });

        return res.status(200).json({
            success: true,
            count: trainees.length,
            ...paginationMeta(total, { page, limit }),
            trainees
        });
    } catch (error) {
        return next(error);
    }
};

// ADMIN: assign ID, program, enrolment status, or activate/deactivate.
const updateTrainee = async (req, res, next) => {
    try {
        const { userId } = req.params;

        if (!mongoose.Types.ObjectId.isValid(userId)) {
            return res.status(400).json({
                success: false,
                message: "That trainee identifier is not valid.",
                code: "INVALID_ID"
            });
        }

        const user = await User.findById(userId);

        if (!user || user.role !== "trainee") {
            return res.status(404).json({
                success: false,
                message: "Trainee account not found.",
                code: "NOT_FOUND"
            });
        }

        const {
            traineeId,
            program,
            enrollmentStatus,
            status
        } = req.body;

        const profileUpdates = {};

        if (traineeId !== undefined) {
            const value = String(traineeId || "").trim().toUpperCase();

            if (value === "") {
                profileUpdates.traineeId = undefined;
            } else {
                if (!TRAINEE_ID_PATTERN.test(value)) {
                    return res.status(400).json({
                        success: false,
                        message: "Use the format EDT-YYYY-NNN, for example EDT-2026-004.",
                        field: "traineeId",
                        code: "INVALID_TRAINEE_ID"
                    });
                }

                const duplicate = await TraineeProfile.findOne({
                    traineeId: value,
                    user: { $ne: user._id }
                });

                if (duplicate) {
                    return res.status(409).json({
                        success: false,
                        message: "Another trainee already uses that trainee ID.",
                        field: "traineeId",
                        code: "DUPLICATE_TRAINEE_ID"
                    });
                }

                profileUpdates.traineeId = value;
            }
        }

        if (program !== undefined) {
            if (program === null || program === "") {
                profileUpdates.program = null;
            } else {
                if (!mongoose.Types.ObjectId.isValid(program)) {
                    return res.status(400).json({
                        success: false,
                        message: "That program identifier is not valid.",
                        field: "program",
                        code: "INVALID_PROGRAM"
                    });
                }

                const found = await Program.findById(program);

                if (!found) {
                    return res.status(404).json({
                        success: false,
                        message: "Program not found.",
                        field: "program",
                        code: "NOT_FOUND"
                    });
                }

                if (!found.active) {
                    return res.status(400).json({
                        success: false,
                        message: "That program is inactive and cannot be assigned.",
                        field: "program",
                        code: "PROGRAM_INACTIVE"
                    });
                }

                profileUpdates.program = found._id;
            }
        }

        if (enrollmentStatus !== undefined) {
            if (!ENROLLMENT_STATUSES.includes(enrollmentStatus)) {
                return res.status(400).json({
                    success: false,
                    message: "Choose a valid enrolment status.",
                    field: "enrollmentStatus",
                    code: "INVALID_STATUS"
                });
            }

            profileUpdates.enrollmentStatus = enrollmentStatus;
        }

        if (status !== undefined) {
            if (!["active", "inactive"].includes(status)) {
                return res.status(400).json({
                    success: false,
                    message: "Account status must be active or inactive.",
                    field: "status",
                    code: "INVALID_STATUS"
                });
            }

            user.status = status;

            if (status === "inactive") {
                // End the trainee's current session immediately.
                user.tokenVersion = (user.tokenVersion || 0) + 1;
            }

            await user.save();
        }

        let profile = await TraineeProfile.findOne({ user: user._id });

        if (!profile) {
            profile = await TraineeProfile.create({ user: user._id });
        }

        if (Object.keys(profileUpdates).length > 0) {
            Object.entries(profileUpdates).forEach(([key, value]) => {
                if (value === undefined) {
                    profile.set(key, undefined);
                } else {
                    profile.set(key, value);
                }
            });

            await profile.save();
        }

        profile = await TraineeProfile.findById(profile._id).populate("program");

        return res.status(200).json({
            success: true,
            message: "Trainee record updated.",
            trainee: {
                _id: user._id,
                firstName: user.firstName,
                lastName: user.lastName,
                name: `${user.firstName} ${user.lastName}`.trim(),
                email: user.email,
                status: user.status,
                ...serializeProfile(profile)
            }
        });
    } catch (error) {
        return next(error);
    }
};

module.exports = { getTrainees, updateTrainee };
