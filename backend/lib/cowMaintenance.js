const { currentVersionOf } = require("./versioning");

function todayRange(reference = new Date()) {
    const start = new Date(
        reference.getFullYear(),
        reference.getMonth(),
        reference.getDate()
    );

    const end = new Date(
        start.getFullYear(),
        start.getMonth(),
        start.getDate() + 1
    );

    return { start, end };
}

function fullName(user) {
    if (!user || !user.firstName) return "";

    return `${user.firstName} ${user.lastName || ""}`.trim();
}

function cowRow(cow) {
    return {
        id: String(cow._id),
        cowId: cow.cowId,
        name: cow.name,
        breed: cow.breed,
        ageYears: cow.ageYears,
        assignedTraineeId: cow.assignedTrainee && cow.assignedTrainee._id
            ? String(cow.assignedTrainee._id)
            : null,
        assignedTraineeName: fullName(cow.assignedTrainee),
        healthStatus: cow.healthStatus,
        careStatus: cow.careStatus,
        version: currentVersionOf(cow),
        notes: cow.notes || "",
        createdAt: cow.createdAt || null
    };
}

function activityRow(activity) {
    const cow = activity.cow || {};

    return {
        id: String(activity._id),
        cowRecordId: cow._id ? String(cow._id) : null,
        cowId: cow.cowId || "",
        cowName: cow.name || "",
        cowLabel: cow.cowId
            ? `${cow.name || "Unnamed cow"} (${cow.cowId})`
            : "",
        type: activity.type,
        description: activity.description,
        scheduledFor: activity.scheduledFor,
        assignedTraineeId: activity.assignedTrainee &&
            activity.assignedTrainee._id
            ? String(activity.assignedTrainee._id)
            : null,
        assignedTraineeName: fullName(activity.assignedTrainee),
        status: activity.status,
        completedAt: activity.completedAt || null,
        googleCalendarEventLink: activity.googleCalendarEventLink || null,
        calendarSyncedAt: activity.calendarSyncedAt || null
    };
}

module.exports = {
    todayRange,
    cowRow,
    activityRow
};
