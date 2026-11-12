const mongoose = require("mongoose");

const MaintenanceActivity = require("../models/MaintenanceActivity");
const Cow = require("../models/Cow");
const User = require("../models/User");

const { getPagination, paginationMeta } = require("../utils/pagination");
const { searchRegExp, parseDateTime, parseDateOnly } = require("../utils/dates");
const { ACTIVITY_TYPES, ACTIVITY_STATUSES } = require("../models/MaintenanceActivity");
const { shapeCow } = require("./cowController");

const shapeActivity = (activity) => {
    const raw =
        typeof activity.toObject === "function"
            ? activity.toObject()
            : { ...activity };

    const cow =
        raw.cow && typeof raw.cow === "object" && raw.cow.cowId
            ? { _id: raw.cow._id, cowId: raw.cow.cowId, name: raw.cow.name }
            : { _id: raw.cow, cowId: "", name: "" };

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
        cow,
        type: raw.type,
        description: raw.description,
        scheduledAt: raw.scheduledAt,
        assignedTrainees,
        status: raw.status,
        completedAt: raw.completedAt || null,
        completedBy: raw.completedBy || null,
        createdAt: raw.createdAt
    };
};

const resolveTraineeIds = async (ids) => {
    if (ids === undefined) return undefined;

    if (!Array.isArray(ids)) return null;

    const unique = [...new Set(ids.map(String))].filter(Boolean);

    if (unique.length === 0) return [];

    const invalid = unique.filter(
        (id) => !mongoose.Types.ObjectId.isValid(id)
    );

    if (invalid.length > 0) return null;

    const found = await User.find({
        _id: { $in: unique },
        role: "trainee"
    }).distinct("_id");

    return found.length === unique.length ? found : null;
};

const listActivities = async (req, res, next) => {
    try {
        const { page, limit, skip } = getPagination(req.query);
        const { search, type, status, cow } = req.query;

        const filter = {};

        if (type && type !== "all") filter.type = type;
        if (status && status !== "all") filter.status = status;
        if (cow && mongoose.Types.ObjectId.isValid(cow)) filter.cow = cow;

        if (search && String(search).trim()) {
            const rx = searchRegExp(search);

            const cowIds = await Cow.find({
                $or: [{ cowId: rx }, { name: rx }]
            }).distinct("_id");

            const traineeIds = await User.find({
                role: "trainee",
                $or: [{ firstName: rx }, { lastName: rx }]
            }).distinct("_id");

            filter.$or = [
                { description: rx },
                { cow: { $in: cowIds } },
                { assignedTrainees: { $in: traineeIds } }
            ];
        }

        const [total, activities] = await Promise.all([
            MaintenanceActivity.countDocuments(filter),
            MaintenanceActivity.find(filter)
                .populate("cow", "cowId name")
                .populate("assignedTrainees", "firstName lastName")
                .sort({ scheduledAt: -1 })
                .skip(skip)
                .limit(limit)
        ]);

        return res.status(200).json({
            success: true,
            count: activities.length,
            ...paginationMeta(total, { page, limit }),
            activities: activities.map(shapeActivity)
        });
    } catch (error) {
        return next(error);
    }
};

const createActivity = async (req, res, next) => {
    try {
        const {
            cow,
            type,
            description,
            scheduledAt,
            scheduledDate,
            scheduledTime,
            assignedTrainees
        } = req.body;

        if (!mongoose.Types.ObjectId.isValid(cow)) {
            return res.status(400).json({
                success: false,
                message: "Choose the cow this activity belongs to.",
                field: "cow",
                code: "INVALID_COW"
            });
        }

        const cowRecord = await Cow.findById(cow);

        if (!cowRecord) {
            return res.status(404).json({
                success: false,
                message: "Cow not found.",
                field: "cow",
                code: "NOT_FOUND"
            });
        }

        if (!String(description || "").trim()) {
            return res.status(400).json({
                success: false,
                message: "Describe the maintenance activity.",
                field: "description",
                code: "MISSING_FIELD"
            });
        }

        if (type && !ACTIVITY_TYPES.includes(type)) {
            return res.status(400).json({
                success: false,
                message: "Choose a valid activity type.",
                field: "type",
                code: "INVALID_TYPE"
            });
        }

        const when = scheduledAt
            ? parseDateOnly(scheduledAt)
            : parseDateTime(scheduledDate, scheduledTime);

        if (!when) {
            return res.status(400).json({
                success: false,
                message: "Choose the date and time for this activity.",
                field: "scheduledAt",
                code: "INVALID_DATE"
            });
        }

        const traineeIds = await resolveTraineeIds(assignedTrainees);

        if (traineeIds === null) {
            return res.status(400).json({
                success: false,
                message: "One or more assigned trainees are invalid.",
                field: "assignedTrainees",
                code: "INVALID_TRAINEE"
            });
        }

        const activity = await MaintenanceActivity.create({
            cow: cowRecord._id,
            type: type || "General",
            description: String(description).trim(),
            scheduledAt: when,
            assignedTrainees:
                traineeIds === undefined ? cowRecord.assignedTrainees : traineeIds,
            status: "Pending",
            createdBy: req.user.id
        });

        await activity.populate("cow", "cowId name");
        await activity.populate("assignedTrainees", "firstName lastName");

        return res.status(201).json({
            success: true,
            message: "Maintenance activity scheduled.",
            activity: shapeActivity(activity)
        });
    } catch (error) {
        return next(error);
    }
};

const updateActivity = async (req, res, next) => {
    try {
        const activity = await MaintenanceActivity.findById(req.params.id);

        if (!activity) {
            return res.status(404).json({
                success: false,
                message: "Maintenance activity not found.",
                code: "NOT_FOUND"
            });
        }

        const {
            type,
            description,
            scheduledAt,
            scheduledDate,
            scheduledTime,
            assignedTrainees
        } = req.body;

        if (type !== undefined) {
            if (!ACTIVITY_TYPES.includes(type)) {
                return res.status(400).json({
                    success: false,
                    message: "Choose a valid activity type.",
                    field: "type",
                    code: "INVALID_TYPE"
                });
            }

            activity.type = type;
        }

        if (description !== undefined) {
            if (!String(description).trim()) {
                return res.status(400).json({
                    success: false,
                    message: "Describe the maintenance activity.",
                    field: "description",
                    code: "MISSING_FIELD"
                });
            }

            activity.description = String(description).trim();
        }

        if (scheduledAt || scheduledDate) {
            const when = parseDateTime(scheduledDate, scheduledTime) ||
                parseDateOnly(scheduledAt);

            if (!when) {
                return res.status(400).json({
                    success: false,
                    message: "Choose a valid schedule.",
                    field: "scheduledAt",
                    code: "INVALID_DATE"
                });
            }

            activity.scheduledAt = when;
        }

        if (assignedTrainees !== undefined) {
            const traineeIds = await resolveTraineeIds(assignedTrainees);

            if (traineeIds === null) {
                return res.status(400).json({
                    success: false,
                    message: "One or more assigned trainees are invalid.",
                    field: "assignedTrainees",
                    code: "INVALID_TRAINEE"
                });
            }

            activity.assignedTrainees = traineeIds;
        }

        await activity.save();
        await activity.populate("cow", "cowId name");
        await activity.populate("assignedTrainees", "firstName lastName");

        return res.status(200).json({
            success: true,
            message: "Maintenance activity updated.",
            activity: shapeActivity(activity)
        });
    } catch (error) {
        return next(error);
    }
};

// Admin-only status control: Pending <-> Completed.
const updateActivityStatus = async (req, res, next) => {
    try {
        const { status } = req.body;

        if (!ACTIVITY_STATUSES.includes(status)) {
            return res.status(400).json({
                success: false,
                message: "Status must be Pending or Completed.",
                field: "status",
                code: "INVALID_STATUS"
            });
        }

        const activity = await MaintenanceActivity.findById(req.params.id);

        if (!activity) {
            return res.status(404).json({
                success: false,
                message: "Maintenance activity not found.",
                code: "NOT_FOUND"
            });
        }

        activity.status = status;

        if (status === "Completed") {
            activity.completedAt = new Date();
            activity.completedBy = req.user.id;
        } else {
            activity.completedAt = null;
            activity.completedBy = null;
        }

        await activity.save();
        await activity.populate("cow", "cowId name");
        await activity.populate("assignedTrainees", "firstName lastName");

        return res.status(200).json({
            success: true,
            message:
                status === "Completed"
                    ? "Activity marked complete."
                    : "Activity reopened.",
            activity: shapeActivity(activity)
        });
    } catch (error) {
        return next(error);
    }
};

// TRAINEE: read-only list of the activities assigned to the caller.
const getMyActivities = async (req, res, next) => {
    try {
        const { from, to } = req.query;

        const filter = { assignedTrainees: req.user.id };

        if (from || to) {
            filter.scheduledAt = {};

            if (from) {
                const fromDate = parseDateOnly(from);
                if (fromDate) filter.scheduledAt.$gte = fromDate;
            }

            if (to) {
                const toDate = parseDateOnly(to);
                if (toDate) filter.scheduledAt.$lte = toDate;
            }

            if (Object.keys(filter.scheduledAt).length === 0) {
                delete filter.scheduledAt;
            }
        }

        const activities = await MaintenanceActivity.find(filter)
            .populate("cow", "cowId name breed healthStatus")
            .sort({ scheduledAt: -1 });

        return res.status(200).json({
            success: true,
            count: activities.length,
            activities: activities.map((activity) => {
                const shaped = shapeActivity(activity);
                const raw = activity.toObject();

                return {
                    ...shaped,
                    cow: raw.cow && typeof raw.cow === "object"
                        ? {
                            ...shaped.cow,
                            breed: raw.cow.breed || "",
                            healthStatus: raw.cow.healthStatus || "Healthy"
                        }
                        : shaped.cow
                };
            })
        });
    } catch (error) {
        return next(error);
    }
};

module.exports = {
    listActivities,
    createActivity,
    updateActivity,
    updateActivityStatus,
    getMyActivities,
    shapeActivity,
    shapeCow
};
