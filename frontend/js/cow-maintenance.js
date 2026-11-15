const COW_MAINTENANCE_API_URL = "http://localhost:5000/api/trainee/cows";

const CARE_ICONS = {
    Feeding: `
        <svg viewBox="0 0 24 24">
            <path d="M12 20V10"/>
            <path d="M12 12c0-3.3 2.4-5.5 5.5-5.5 0 3.3-2.4 5.5-5.5 5.5Z"/>
            <path d="M12 15c0-2.6-2-4.5-4.5-4.5 0 2.6 2 4.5 4.5 4.5Z"/>
        </svg>
    `,
    Drinking: `
        <svg viewBox="0 0 24 24">
            <path d="M12 3.5s6 6.2 6 10.5a6 6 0 0 1-12 0c0-4.3 6-10.5 6-10.5Z"/>
        </svg>
    `,
    Medication: `
        <svg viewBox="0 0 24 24">
            <path d="M9.5 4.5 19.5 14.5a3.5 3.5 0 0 1-5 5L4.5 9.5a3.5 3.5 0 0 1 5-5Z"/>
            <path d="m7 7 10 10"/>
        </svg>
    `,
    "General care": `
        <svg viewBox="0 0 24 24">
            <rect x="4" y="4" width="16" height="16" rx="2"/>
            <path d="m8 12.5 2.5 2.5L16 9"/>
        </svg>
    `
};

const CARE_LABELS = {
    Feeding: "Feeding",
    Drinking: "Drinking water",
    Medication: "Medication",
    "General care": "General care"
};

const CARE_BADGES = {
    Completed: "completed",
    Pending: "pending"
};

const CARE_STATUS_BADGES = {
    Active: "completed",
    Inactive: "inactive"
};

document.addEventListener("DOMContentLoaded", () => {
    const feedback = document.getElementById("cowFeedback");
    const careList = document.getElementById("careList");
    const careEmpty = document.getElementById("careEmpty");

    function setText(id, value) {
        const element = document.getElementById(id);

        if (element) element.textContent = value ?? "";
    }

    function setFeedback(message, isError = false) {
        if (!feedback) return;

        feedback.textContent = message || "";
        feedback.hidden = !message;
        feedback.classList.toggle("is-error", isError);
    }

    function handleUnauthorized() {
        localStorage.removeItem("edtspToken");
        localStorage.removeItem("edtspUser");
        sessionStorage.removeItem("edtspToken");
        sessionStorage.removeItem("edtspUser");
        window.location.href = "../login.html";
    }

    function formatTime(value) {
        const date = new Date(value);

        if (Number.isNaN(date.getTime())) return "";

        return date.toLocaleTimeString("en-PH", {
            hour: "numeric",
            minute: "2-digit"
        });
    }

    async function loadCowMaintenance() {
        const token =
    localStorage.getItem("edtspToken") ||
    sessionStorage.getItem("edtspToken"); 

        if (!token) {
            handleUnauthorized();
            return;
        }

        setFeedback("Loading cow maintenance…");

        try {
            const response = await fetch(COW_MAINTENANCE_API_URL, {
                headers: { Authorization: `Bearer ${token}` }
            });

            if (response.status === 401) {
                handleUnauthorized();
                return;
            }

            const data = await response.json();

            if (!response.ok || !data.success) {
                throw new Error(
                    data.message || "Unable to load cow maintenance records."
                );
            }

            renderSummary(data.summary || {});
            renderAnimal((data.cows || [])[0] || null);
            renderCare(data.activities || [], data.summary || {});

            setFeedback("");

        } catch (error) {
            console.error("Cow maintenance loading error:", error);

            renderSummary({});
            renderAnimal(null);
            renderCare([], {});
            setFeedback(
                error.message ||
                    "Cow maintenance records are unavailable. Refresh the page to try again.",
                true
            );
        }
    }

    function renderSummary(summary) {
        const total = Number(summary.totalActivities) || 0;
        const completed = Number(summary.completedActivities) || 0;

        setText("assignedCows", String(Number(summary.assignedCows) || 0));
        setText("completedTasks", `${completed}/${total}`);
        setText(
            "pendingTasks",
            String(Number(summary.pendingActivities) || 0)
        );
        setText("animalStatus", summary.animalStatus || "—");
    }

    function renderAnimal(cow) {
        setText("animalMeta", cow ? cow.careStatus : "Not assigned");
        setText("cowPlateId", cow ? cow.cowId : "—");
        setText("cowPlateName", cow ? cow.name : "No animal assigned");
        setText("cowId", cow ? cow.cowId : "—");
        setText("cowBreed", cow ? cow.breed : "—");

        const careStatus = document.getElementById("cowCareStatus");

        if (careStatus) {
            careStatus.className =
                `status-badge ${cow ? CARE_STATUS_BADGES[cow.careStatus] || "pending" : ""}`.trim();
            careStatus.textContent = cow ? cow.careStatus : "—";
        }
    }

    function buildCareItem(activity) {
        const item = document.createElement("div");
        item.className = "care";

        const icon = document.createElement("span");

        icon.className = "care__icon";
        icon.setAttribute("aria-hidden", "true");
        icon.innerHTML = CARE_ICONS[activity.type] || CARE_ICONS["General care"];

        const body = document.createElement("div");
        const title = document.createElement("strong");
        const description = document.createElement("p");
        const time = formatTime(activity.scheduledFor);

        title.textContent = CARE_LABELS[activity.type] || activity.type;
        description.textContent = time
            ? `${time} · ${activity.description}`
            : activity.description;

        body.append(title, description);

        const badge = document.createElement("span");

        badge.className =
            `status-badge ${CARE_BADGES[activity.status] || "pending"}`;
        badge.textContent = activity.status;

        item.append(icon, body, badge);

        return item;
    }

    function renderCare(activities, summary) {
        careList.replaceChildren();

        const total = Number(summary.totalActivities) || activities.length;
        const completed = Number(summary.completedActivities) ||
            activities.filter(activity => activity.status === "Completed").length;
        const percent = total > 0 ? Math.round((completed / total) * 100) : 0;

        setText("todayMeta", `${completed} of ${total} done`);

        const meter = document.getElementById("careMeterFill");

        if (meter) meter.style.width = `${percent}%`;

        setText(
            "careMeterNote",
            total > 0
                ? `${completed} out of ${total} daily activities completed.`
                : "No care activities scheduled today."
        );

        if (!activities.length) {
            if (careEmpty) {
                careEmpty.textContent = Number(summary.assignedCows)
                    ? "No care activities are scheduled for today."
                    : "No animal is assigned to you yet.";
                careEmpty.hidden = false;
            }

            return;
        }

        if (careEmpty) careEmpty.hidden = true;

        activities.forEach(activity =>
            careList.appendChild(buildCareItem(activity))
        );
    }

    loadCowMaintenance();
});
