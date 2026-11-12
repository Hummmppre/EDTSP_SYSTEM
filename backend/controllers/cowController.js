const mongoose = require("mongoose");

const Cow = require("../models/Cow");
const User = require("../models/User");
const MaintenanceActivity = require("../models/MaintenanceActivity");

const { getPagination, paginationMeta } = require("../utils/pagination");
const { searchRegExp } = require("../utils/dates");
const { HEALTH_STATUSES } = require("../models/Cow");

const COW_ID_PATTERN = /^COW-\d{3}$/;

const shapeCow = (cow) => {
    const raw = typeof cow.toObject === "function" ? cow.toObject() : { ...cow };

    const assignedTrainees = (raw.assignedTrainees || []).map((trainee) => {
        if (trainee && typeof trainee === "object" && trainee.firstName !== undefined) {
            return {
                _id: trainee._id,
                name: `${trainee.firstName} ${trainee.lastName}`.trim()
            };
        }

        return { _id: trainee, name: "" };
    });

    return {
        _id: raw._id,
        cowId: raw.cowId,
        name: raw.name,
        breed: raw.breed || "",
        ageYears: raw.ageYears ?? null,
        healthStatus: raw.healthStatus,
        assignedTrainees,
        notes: raw.notes || "",
        createdAt: raw.createdAt,
        updatedAt: raw.updatedAt
    };
};

const validateTraineeIds = async (ids) => {
    if (!Array.isArray(ids)) return [];

    const unique = [...new Set(ids.map(String))].filter(Boolean);

    const invalid = unique.filter(
        (id) => !mongoose.Types.ObjectId.isValid(id)
    );

    if (invalid.length > 0) return null;

    if (unique.length === 0) return [];

    const found = await User.find({
        _id: { $in: unique },
        role: "trainee"
    }).distinct("_id");

    if (found.length !== unique.length) return null;

    return found;
};

const listCows = async (req, res, next) => {
    try {
        const { page, limit, skip } = getPagination(req.query);
        const { search, health } = req.query;

        const filter = {};

        if (health && health !== "all") filter.healthStatus = health;

        if (search && String(search).trim()) {
            const rx = searchRegExp(search);

            const traineeIds = await User.find({
                role: "trainee",
                $or: [{ firstName: rx }, { lastName: rx }]
            }).distinct("_id");

            filter.$or = [
                { cowId: rx },
                { name: rx },
                { breed: rx },
                { assignedTrainees: { $in: traineeIds } }
            ];
        }

        const [total, cows, healthCounts] = await Promise.all([
            Cow.countDocuments(filter),
            Cow.find(filter)
                .populate("assignedTrainees", "firstName lastName")
                .sort({ cowId: 1 })
                .skip(skip)
                .limit(limit),
            Cow.aggregate([
                { $group: { _id: "$healthStatus", count: { $sum: 1 } } }
            ])
        ]);

        const counts = { Total: 0, Healthy: 0, "Under Observation": 0, "Under Treatment": 0 };

        healthCounts.forEach((row) => {
            counts[row._id] = row.count;
            counts.Total += row.count;
        });

        return res.status(200).json({
            success: true,
            count: cows.length,
            ...paginationMeta(total, { page, limit }),
            summary: counts,
            cows: cows.map(shapeCow)
        });
    } catch (error) {
        return next(error);
    }
};

const createCow = async (req, res, next) => {
    try {
        const {
            cowId,
            name,
            breed,
            ageYears,
            healthStatus,
            assignedTrainees,
            notes
        } = req.body;

        const normalizedId = String(cowId || "").trim().toUpperCase();

        if (!COW_ID_PATTERN.test(normalizedId)) {
            return res.status(400).json({
                success: false,
                message: "Use the cow ID format COW-NNN, for example COW-004.",
                field: "cowId",
                code: "INVALID_COW_ID"
            });
        }

        if (!String(name || "").trim()) {
            return res.status(400).json({
                success: false,
                message: "Give the animal a name.",
                field: "name",
                code: "MISSING_FIELD"
            });
        }

        if (healthStatus && !HEALTH_STATUSES.includes(healthStatus)) {
            return res.status(400).json({
                success: false,
                message: "Choose a valid health status.",
                field: "healthStatus",
                code: "INVALID_STATUS"
            });
        }

        if (ageYears !== undefined && ageYears !== null && ageYears !== "") {
            const age = Number(ageYears);

            if (!Number.isFinite(age) || age < 0 || age > 30) {
                return res.status(400).json({
                    success: false,
                    message: "Age must be between 0 and 30 years.",
                    field: "ageYears",
                    code: "INVALID_AGE"
                });
            }
        }

        const traineeIds = await validateTraineeIds(assignedTrainees || []);

        if (traineeIds === null) {
            return res.status(400).json({
                success: false,
                message: "One or more assigned trainees are invalid.",
                field: "assignedTrainees",
                code: "INVALID_TRAINEE"
            });
        }

        const existing = await Cow.findOne({ cowId: normalizedId });

        if (existing) {
            return res.status(409).json({
                success: false,
                message: "A cow with that ID already exists.",
                field: "cowId",
                code: "DUPLICATE_COW_ID"
            });
        }

        const cow = await Cow.create({
            cowId: normalizedId,
            name: String(name).trim(),
            breed: String(breed || "").trim(),
            ageYears:
                ageYears === undefined || ageYears === null || ageYears === ""
                    ? null
                    : Number(ageYears),
            healthStatus: healthStatus || "Healthy",
            assignedTrainees: traineeIds,
            notes: String(notes || "").trim()
        });

        await cow.populate("assignedTrainees", "firstName lastName");

        return res.status(201).json({
            success: true,
            message: "Cow added to the herd.",
            cow: shapeCow(cow)
        });
    } catch (error) {
        return next(error);
    }
};

const updateCow = async (req, res, next) => {
    try {
        const cow = await Cow.findById(req.params.id);

        if (!cow) {
            return res.status(404).json({
                success: false,
                message: "Cow not found.",
                code: "NOT_FOUND"
            });
        }

        const {
            cowId,
            name,
            breed,
            ageYears,
            healthStatus,
            assignedTrainees,
            notes
        } = req.body;

        if (cowId !== undefined) {
            const normalizedId = String(cowId || "").trim().toUpperCase();

            if (!COW_ID_PATTERN.test(normalizedId)) {
                return res.status(400).json({
                    success: false,
                    message: "Use the cow ID format COW-NNN, for example COW-004.",
                    field: "cowId",
                    code: "INVALID_COW_ID"
                });
            }

            const duplicate = await Cow.findOne({
                cowId: normalizedId,
                _id: { $ne: cow._id }
            });

            if (duplicate) {
                return res.status(409).json({
                    success: false,
                    message: "Another cow already uses that ID.",
                    field: "cowId",
                    code: "DUPLICATE_COW_ID"
                });
            }

            cow.cowId = normalizedId;
        }

        if (name !== undefined) cow.name = String(name).trim();
        if (breed !== undefined) cow.breed = String(breed).trim();
        if (notes !== undefined) cow.notes = String(notes).trim();

        if (ageYears !== undefined) {
            if (ageYears === null || ageYears === "") {
                cow.ageYears = null;
            } else {
                const age = Number(ageYears);

                if (!Number.isFinite(age) || age < 0 || age > 30) {
                    return res.status(400).json({
                        success: false,
                        message: "Age must be between 0 and 30 years.",
                        field: "ageYears",
                        code: "INVALID_AGE"
                    });
                }

                cow.ageYears = age;
            }
        }

        if (healthStatus !== undefined) {
            if (!HEALTH_STATUSES.includes(healthStatus)) {
                return res.status(400).json({
                    success: false,
                    message: "Choose a valid health status.",
                    field: "healthStatus",
                    code: "INVALID_STATUS"
                });
            }

            cow.healthStatus = healthStatus;
        }

        if (assignedTrainees !== undefined) {
            const traineeIds = await validateTraineeIds(assignedTrainees);

            if (traineeIds === null) {
                return res.status(400).json({
                    success: false,
                    message: "One or more assigned trainees are invalid.",
                    field: "assignedTrainees",
                    code: "INVALID_TRAINEE"
                });
            }

            cow.assignedTrainees = traineeIds;
        }

        await cow.save();
        await cow.populate("assignedTrainees", "firstName lastName");

        return res.status(200).json({
            success: true,
            message: "Cow record updated.",
            cow: shapeCow(cow)
        });
    } catch (error) {
        return next(error);
    }
};

// TRAINEE: only the animals assigned to the caller, with their task counts.
const getMyCows = async (req, res, next) => {
    try {
        const cows = await Cow.find({ assignedTrainees: req.user.id })
            .sort({ cowId: 1 });

        const counts = await MaintenanceActivity.aggregate([
            {
                $match: {
                    cow: { $in: cows.map((cow) => cow._id) },
                    assignedTrainees: new mongoose.Types.ObjectId(req.user.id)
                }
            },
            {
                $group: {
                    _id: { cow: "$cow", status: "$status" },
                    count: { $sum: 1 }
                }
            }
        ]);

        const countMap = new Map();

        counts.forEach((row) => {
            const key = String(row._id.cow);
            const current = countMap.get(key) || { total: 0, completed: 0, pending: 0 };

            current.total += row.count;

            if (row._id.status === "Completed") {
                current.completed += row.count;
            } else {
                current.pending += row.count;
            }

            countMap.set(key, current);
        });

        return res.status(200).json({
            success: true,
            count: cows.length,
            cows: cows.map((cow) => ({
                ...shapeCow(cow),
                activityCounts:
                    countMap.get(String(cow._id)) ||
                    { total: 0, completed: 0, pending: 0 }
            }))
        });
    } catch (error) {
        return next(error);
    }
};

module.exports = { listCows, createCow, updateCow, getMyCows, shapeCow };
