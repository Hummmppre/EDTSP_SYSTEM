const Cow = require("../models/Cow");
const MaintenanceActivity = require("../models/MaintenanceActivity");
const { todayRange, cowRow, activityRow } = require("../lib/cowMaintenance");

// TRAINEE: the animal(s) assigned to them and today's care schedule
const getMyCowMaintenance = async (req, res) => {
    try {
        const userId = req.user.id;

        const cows = await Cow.find({ assignedTrainee: userId })
            .sort({ careStatus: 1, cowId: 1 })
            .lean();

        const cowIds = cows.map(cow => cow._id);
        const { start, end } = todayRange();

        const activities = await MaintenanceActivity.find({
            scheduledFor: { $gte: start, $lt: end },
            $or: [
                { cow: { $in: cowIds } },
                { assignedTrainee: userId }
            ]
        })
            .populate("cow", "cowId name")
            .sort({ scheduledFor: 1 })
            .lean();

        const completed = activities.filter(
            activity => activity.status === "Completed"
        ).length;

        return res.status(200).json({
            success: true,
            date: start,
            summary: {
                assignedCows: cows.length,
                totalActivities: activities.length,
                completedActivities: completed,
                pendingActivities: activities.length - completed,
                animalStatus: cows.length ? cows[0].healthStatus : null
            },
            cows: cows.map(cowRow),
            activities: activities.map(activityRow)
        });

    } catch (error) {
        console.error("Get trainee cow maintenance error:", error);

        return res.status(500).json({
            success: false,
            message: "Unable to retrieve your cow maintenance records."
        });
    }
};

module.exports = {
    getMyCowMaintenance
};
