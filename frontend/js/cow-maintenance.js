/**
 * Trainee cow maintenance — read-only. Activity status is admin-controlled.
 */
(function initCowMaintenance() {
    const user = window.EDTSP.session.requireRole("trainee");
    if (!user) return;

    const { api, ui, session } = window.EDTSP;
    const { setText, formatDate, formatDateTime, statusBadge, state, element } = ui;

    session.bindLogout(document.getElementById("logoutButton"));

    const cowList = document.getElementById("cowList");
    const activityList = document.getElementById("activityList");

    const todayKey = () =>
        new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila" }).format(
            new Date()
        );

    const renderCows = (cows) => {
        if (!cowList) return;

        cowList.replaceChildren();

        if (cows.length === 0) {
            state(cowList, {
                tone: "empty",
                title: "No animals assigned to you yet",
                message:
                    "An administrator assigns animals to trainees. Once assigned, they appear in this list."
            });
            return;
        }

        cows.forEach((cow) => {
            const plate = element("article", "plate");

            const head = element("div", "plate__head");
            const identity = element("div");

            identity.append(
                element("span", "plate__id", cow.cowId),
                element("strong", null, cow.name)
            );

            head.append(
                identity,
                statusBadge(cow.healthStatus, cow.healthStatus)
            );

            plate.append(head);

            const facts = element("dl", "facts");
            const breed = element("div");
            breed.append(
                element("dt", null, "Breed"),
                element("dd", null, cow.breed || "Not recorded")
            );

            const age = element("div");
            age.append(
                element("dt", null, "Age"),
                element("dd", null, cow.ageYears === null ? "—" : `${cow.ageYears} years`)
            );

            const tasks = element("div");
            const counts = cow.activityCounts || { total: 0, completed: 0, pending: 0 };
            tasks.append(
                element("dt", null, "Activities"),
                element(
                    "dd",
                    null,
                    counts.total
                        ? `${counts.completed} of ${counts.total} completed`
                        : "No activities scheduled"
                )
            );

            facts.append(breed, age, tasks);
            plate.append(facts);

            if (cow.notes) {
                plate.append(element("p", "plate__note", cow.notes));
            }

            cowList.append(plate);
        });
    };

    const renderActivities = (activities) => {
        if (!activityList) return;

        activityList.replaceChildren();

        if (activities.length === 0) {
            state(activityList, {
                tone: "empty",
                title: "No activities scheduled today",
                message:
                    "Scheduled feeding, drinking, and medication rounds appear here."
            });
            return;
        }

        activities.slice(0, 12).forEach((activity) => {
            const row = element("article", "assessment-item");

            const top = element("div", "assessment-item__top");
            const heading = element("div");

            heading.append(
                element(
                    "strong",
                    null,
                    `${activity.type} · ${activity.cow.cowId}${activity.cow.name ? ` (${activity.cow.name})` : ""}`
                ),
                element("p", "assessment-item__subject", activity.description)
            );

            top.append(heading, statusBadge(activity.status));
            row.append(top);

            const meta = element(
                "p",
                "assessment-item__meta",
                `${formatDateTime(activity.scheduledAt)}${
                    activity.status === "Completed" && activity.completedAt
                        ? ` · Completed ${formatDate(activity.completedAt)}`
                        : ""
                }`
            );

            row.append(meta);
            activityList.append(row);
        });
    };

    const load = async () => {
        try {
            const [cowData, activityData] = await Promise.all([
                api.get("/trainee/cows"),
                api.get("/trainee/activities")
            ]);

            const cows = cowData.cows || [];
            const activities = activityData.activities || [];

            const today = todayKey();
            const todaysActivities = activities.filter(
                (activity) =>
                    activity.scheduledAt &&
                    new Intl.DateTimeFormat("en-CA", {
                        timeZone: "Asia/Manila"
                    }).format(new Date(activity.scheduledAt)) === today
            );

            const completedToday = todaysActivities.filter(
                (activity) => activity.status === "Completed"
            ).length;

            const pendingToday = todaysActivities.length - completedToday;

            const healthCounts = cows.reduce((counts, cow) => {
                counts[cow.healthStatus] = (counts[cow.healthStatus] || 0) + 1;
                return counts;
            }, {});

            setText("assignedCows", String(cows.length));
            setText("completedToday", String(completedToday));
            setText("pendingToday", String(pendingToday));
            setText(
                "healthSummary",
                cows.length
                    ? Object.entries(healthCounts)
                          .map(([status, count]) => `${count} ${status.toLowerCase()}`)
                          .join(" · ")
                    : "No animals assigned"
            );

            renderCows(cows);
            renderActivities(todaysActivities);
        } catch (error) {
            const container = document.getElementById("carePanels");

            if (container) {
                state(container, {
                    tone: "error",
                    title: "Could not load your care records",
                    message: error.message,
                    action: {
                        label: "Try again",
                        onClick: () => window.location.reload()
                    }
                });
            }
        }
    };

    load();
})();
