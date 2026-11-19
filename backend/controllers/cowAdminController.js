const mongoose = require("mongoose");

const Cow = require("../models/Cow");
const MaintenanceActivity = require("../models/MaintenanceActivity");
const User = require("../models/User");
const { todayRange, cowRow, activityRow } = require("../lib/cowMaintenance");
const { createEventForActivity } = require("../lib/googleCalendar");

const HEALTH_STATUSES = ["Healthy", "Under Observation", "Under Treatment"];
const CARE_STATUSES = ["Active", "Inactive"];
const ACTIVITY_TYPES = ["Feeding", "Drinking", "Medication", "General care"];

function cleanText(value) {
    return String(value === undefined || value === null ? "" : value).trim();
}

function isValidObjectId(value) {
    return Boolean(value) && mongoose.Types.ObjectId.isValid(String(value));
}

async function resolveTrainee(value) {
    if (!isValidObjectId(value)) return null;

    const user = await User.findOne({
        _id: value,
        role: "trainee"
    }).select("firstName lastName");

    return user;
}

function summarizeCows(cows) {
    const countBy = status =>
        cows.filter(cow => cow.healthStatus === status).length;

    return {
        total: cows.length,
        healthy: countBy("Healthy"),
        underObservation: countBy("Under Observation"),
        underTreatment: countBy("Under Treatment"),
        active: cows.filter(cow => cow.careStatus === "Active").length
    };
}

// ADMIN: every animal on record with its current care details
const listCows = async (req, res) => {
    try {
        const cows = await Cow.find()
            .populate("assignedTrainee", "firstName lastName")
            .sort({ cowId: 1 })
            .lean();

        const rows = cows.map(cowRow);

        return res.status(200).json({
            success: true,
            count: rows.length,
            summary: summarizeCows(cows),
            cows: rows
        });

    } catch (error) {
        console.error("Get cows error:", error);

        return res.status(500).json({
            success: false,
            message: "Unable to retrieve cow records."
        });
    }
};

// ADMIN: register a new animal
const createCow = async (req, res) => {
    try {
        const body = req.body || {};

        const cowId = cleanText(body.cowId).toUpperCase();
        const name = cleanText(body.name);
        const breed = cleanText(body.breed);
        const ageYears = Number(body.ageYears);

        if (!/^[A-Z0-9-]{2,30}$/.test(cowId)) {
            return res.status(400).json({
                success: false,
                message: "Cow ID must be 2–30 characters using letters, numbers, or hyphens."
            });
        }

        if (!name || name.length > 80) {
            return res.status(400).json({
                success: false,
                message: "Enter a cow name of 80 characters or fewer."
            });
        }

        if (!breed || breed.length > 80) {
            return res.status(400).json({
                success: false,
                message: "Enter a breed of 80 characters or fewer."
            });
        }

        if (!Number.isFinite(ageYears) || ageYears < 0 || ageYears > 40) {
            return res.status(400).json({
                success: false,
                message: "Enter an age between 0 and 40 years."
            });
        }

        const healthStatus = cleanText(body.healthStatus) || "Healthy";

        if (!HEALTH_STATUSES.includes(healthStatus)) {
            return res.status(400).json({
                success: false,
                message: "Choose a valid health status."
            });
        }

        const careStatus = cleanText(body.careStatus) || "Active";

        if (!CARE_STATUSES.includes(careStatus)) {
            return res.status(400).json({
                success: false,
                message: "Choose a valid care status."
            });
        }

        let assignedTrainee = null;

        if (cleanText(body.assignedTrainee)) {
            assignedTrainee = await resolveTrainee(body.assignedTrainee);

            if (!assignedTrainee) {
                return res.status(400).json({
                    success: false,
                    message: "Choose a valid trainee."
                });
            }
        }

        const cow = await Cow.create({
            cowId,
            name,
            breed,
            ageYears,
            assignedTrainee: assignedTrainee ? assignedTrainee._id : null,
            healthStatus,
            careStatus
        });

        await cow.populate("assignedTrainee", "firstName lastName");

        return res.status(201).json({
            success: true,
            message: "Cow record saved.",
            cow: cowRow(cow)
        });

    } catch (error) {
        if (error && error.code === 11000) {
            return res.status(409).json({
                success: false,
                message: "That cow ID is already registered."
            });
        }

        console.error("Create cow error:", error);

        return res.status(500).json({
            success: false,
            message: "Unable to save this cow record."
        });
    }
};

// ADMIN: the care schedule across every animal
const listActivities = async (req, res) => {
    try {
        const activities = await MaintenanceActivity.find()
            .populate("cow", "cowId name")
            .populate("assignedTrainee", "firstName lastName")
            .sort({ scheduledFor: -1, createdAt: -1 })
            .lean();

        const { start, end } = todayRange();

        const completedToday = activities.filter(activity => {
            if (activity.status !== "Completed") return false;

            const scheduled = new Date(activity.scheduledFor);

            return scheduled >= start && scheduled < end;
        }).length;

        return res.status(200).json({
            success: true,
            count: activities.length,
            summary: {
                total: activities.length,
                pending: activities.filter(
                    activity => activity.status === "Pending"
                ).length,
                completedToday
            },
            activities: activities.map(activityRow)
        });

    } catch (error) {
        console.error("Get maintenance activities error:", error);

        return res.status(500).json({
            success: false,
            message: "Unable to retrieve maintenance activities."
        });
    }
};

// ADMIN: schedule a care activity for an animal
const createActivity = async (req, res) => {
    try {
        const body = req.body || {};

        if (!isValidObjectId(body.cowId)) {
            return res.status(400).json({
                success: false,
                message: "Choose a cow."
            });
        }

        const cow = await Cow.findById(body.cowId);

        if (!cow) {
            return res.status(404).json({
                success: false,
                message: "Cow not found."
            });
        }

        const type = cleanText(body.type);

        if (!ACTIVITY_TYPES.includes(type)) {
            return res.status(400).json({
                success: false,
                message: "Choose a valid activity type."
            });
        }

        const description = cleanText(body.description);

        if (!description || description.length > 300) {
            return res.status(400).json({
                success: false,
                message: "Enter an activity description of 300 characters or fewer."
            });
        }

        const scheduledFor = new Date(body.scheduledFor);

        if (!body.scheduledFor || Number.isNaN(scheduledFor.getTime())) {
            return res.status(400).json({
                success: false,
                message: "Enter a valid schedule date and time."
            });
        }

        let assignedTraineeId = cow.assignedTrainee;

        if (cleanText(body.assignedTrainee)) {
            const trainee = await resolveTrainee(body.assignedTrainee);

            if (!trainee) {
                return res.status(400).json({
                    success: false,
                    message: "Choose a valid trainee."
                });
            }

            assignedTraineeId = trainee._id;
        }

        const activity = await MaintenanceActivity.create({
            cow: cow._id,
            type,
            description,
            scheduledFor,
            assignedTrainee: assignedTraineeId || null,
            recordedBy: req.user && req.user.id
        });

        await activity.populate("cow", "cowId name");
        await activity.populate("assignedTrainee", "firstName lastName");

        let calendarSynced = false;
        let calendarWarning = "";

        try {
            const event = await createEventForActivity({ activity, cow });

            activity.googleCalendarEventId = event.id;
            activity.googleCalendarEventLink = event.htmlLink;
            activity.calendarSyncedAt = new Date();

            await activity.save();
            calendarSynced = true;
        } catch (error) {
            // The activity is useful without calendar sync, so never roll it back.
            if (error.code === "disabled") {
                calendarWarning =
                    "The activity was saved, but Google Calendar is turned off in system settings.";
            } else if (error.code === "not_configured") {
                calendarWarning =
                    "The activity was saved, but Google Calendar is not configured on the server.";
            } else if (error.code === "not_connected") {
                calendarWarning =
                    "The activity was saved, but Google Calendar is not connected, so no event was created.";
            } else if (
                error.code === "needs_reconnect" ||
                error.code === "missing_scope"
            ) {
                calendarWarning =
                    "The activity was saved, but the Google connection needs to be reauthorized in System settings.";
            } else {
                console.error("Google Calendar sync error:", error);
                calendarWarning =
                    "The activity was saved, but Google Calendar could not be updated.";
            }
        }

        return res.status(201).json({
            success: true,
            message: "Maintenance activity saved.",
            calendarSynced,
            calendarWarning,
            activity: activityRow(activity)
        });

    } catch (error) {
        console.error("Create maintenance activity error:", error);

        return res.status(500).json({
            success: false,
            message: "Unable to save this maintenance activity."
        });
    }
};

module.exports = {
    listCows,
    createCow,
    listActivities,
    createActivity
};
