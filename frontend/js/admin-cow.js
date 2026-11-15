const COWS_API_URL = "http://localhost:5000/api/admin/cows";
const COW_TRAINEES_API_URL = "http://localhost:5000/api/admin/trainees";

const HEALTH_BADGES = {
    Healthy: "completed",
    "Under Observation": "pending",
    "Under Treatment": "inactive"
};

const ACTIVITY_BADGES = {
    Completed: "completed",
    Pending: "pending"
};

document.addEventListener("DOMContentLoaded", () => {

    // Modal elements
    const cowModal = document.getElementById("cowModal");
    const activityModal = document.getElementById("activityModal");

    // Modal buttons
    const addCowBtn = document.getElementById("addCowBtn");
    const addActivityBtn = document.getElementById("addActivityBtn");

    const closeCowBtn = document.getElementById("closeCowModal");
    const cancelCowBtn = document.getElementById("cancelCow");

    const closeActivityBtn = document.getElementById("closeActivityModal");
    const cancelActivityBtn = document.getElementById("cancelActivity");

    // Forms
    const cowForm = document.getElementById("cowForm");
    const activityForm = document.getElementById("activityForm");
    const cowFormError = document.getElementById("cowFormError");
    const activityFormError = document.getElementById("activityFormError");

    // Tables and states
    const cowTableBody = document.getElementById("cowTableBody");
    const activityTableBody = document.getElementById("activityTableBody");
    const cowEmpty = document.getElementById("cowEmpty");
    const activityEmpty = document.getElementById("activityEmpty");
    const feedback = document.getElementById("cowFeedback");

    let cows = [];
    let trainees = [];

    function authHeaders(extra = {}) {
        return {
            ...extra,
            Authorization: `Bearer ${
    localStorage.getItem("edtspToken") ||
    sessionStorage.getItem("edtspToken") ||
    ""
}`
        };
    }

    function handleUnauthorized() {
        localStorage.removeItem("edtspToken");
        localStorage.removeItem("edtspUser");
        sessionStorage.removeItem("edtspToken");
        sessionStorage.removeItem("edtspUser");
        window.location.href = "../login.html";
    }

    function setFeedback(message, isError = false) {
        if (!feedback) return;

        feedback.textContent = message || "";
        feedback.hidden = !message;
        feedback.classList.toggle("is-error", isError);
    }

    function setFormError(element, message) {
        if (!element) return;

        element.textContent = message || "";
        element.hidden = !message;
    }

    function formatSchedule(value) {
        const schedule = new Date(value);

        if (Number.isNaN(schedule.getTime())) return "—";

        return schedule.toLocaleString("en-PH", {
            month: "short",
            day: "numeric",
            year: "numeric",
            hour: "numeric",
            minute: "2-digit"
        });
    }

    async function fetchJson(url) {
        const response = await fetch(url, { headers: authHeaders() });

        if (response.status === 401) {
            const error = new Error("Your session has expired.");

            error.unauthorized = true;
            throw error;
        }

        const data = await response.json();

        if (!response.ok || !data.success) {
            throw new Error(data.message || "Unable to load cow maintenance data.");
        }

        return data;
    }

    // ---------- Data ----------

    async function loadCows() {
        const data = await fetchJson(COWS_API_URL);

        cows = data.cows || [];

        renderSummary(data.summary || {});
        renderCows(cows);
        populateCowOptions();
    }

    async function loadActivities() {
        const data = await fetchJson(`${COWS_API_URL}/activities`);

        renderActivities(data.activities || []);
        renderActivitySummary(data.summary || {});
    }

    async function loadTrainees() {
        const data = await fetchJson(COW_TRAINEES_API_URL);

        trainees = data.trainees || [];

        populateTraineeOptions();
    }

    async function loadMaintenance() {
        setFeedback("Loading cow maintenance data…");

        const results = await Promise.allSettled([
            loadCows(),
            loadActivities(),
            loadTrainees()
        ]);

        if (results.some(
            result => result.status === "rejected" &&
                result.reason &&
                result.reason.unauthorized
        )) {
            handleUnauthorized();
            return;
        }

        const failed = [];

        if (results[0].status === "rejected") {
            console.error("Cow records error:", results[0].reason);
            failed.push("cow records");
            renderSummary({});
            cows = [];
            renderCows([]);
        }

        if (results[1].status === "rejected") {
            console.error("Maintenance activities error:", results[1].reason);
            failed.push("activities");
            renderActivities([]);
            renderActivitySummary({});
        }

        if (results[2].status === "rejected") {
            console.error("Trainee list error:", results[2].reason);
            failed.push("trainees");
        }

        if (failed.length) {
            setFeedback(
                `Some cow maintenance data could not load: ${failed.join(", ")}.`,
                true
            );
            return;
        }

        setFeedback("");
    }

    // ---------- Summary ----------

    function renderSummary(summary) {
        const values = {
            totalCows: summary.total || 0,
            healthyCows: summary.healthy || 0
        };

        Object.entries(values).forEach(([id, value]) => {
            const element = document.getElementById(id);

            if (element) element.textContent = String(value);
        });
    }

    // The activity summary owns the pending and completed cards.
    function renderActivitySummary(summary) {
        const pending = document.getElementById("pendingActivities");
        const completed = document.getElementById("completedToday");

        if (pending) pending.textContent = String(summary.pending || 0);
        if (completed) completed.textContent = String(summary.completedToday || 0);
    }

    // ---------- Cow table ----------

    function buildCowRow(cow) {
        const row = document.createElement("tr");

        row.dataset.health = cow.healthStatus;

        const age = Number(cow.ageYears);
        const values = [
            { text: cow.cowId, className: "id" },
            { text: cow.name, className: "name" },
            { text: cow.breed },
            {
                text: `${age} ${age === 1 ? "year" : "years"}`
            },
            { text: cow.assignedTraineeName || "Unassigned" }
        ];

        values.forEach(({ text, className }) => {
            const cell = document.createElement("td");

            cell.textContent = text;

            if (className) cell.className = className;

            row.appendChild(cell);
        });

        const statusCell = document.createElement("td");
        const badge = document.createElement("span");

        badge.className =
            `status-badge ${HEALTH_BADGES[cow.healthStatus] || "pending"}`;
        badge.textContent = cow.healthStatus;

        statusCell.appendChild(badge);
        row.appendChild(statusCell);

        return row;
    }

    function renderCows(list) {
        cowTableBody.replaceChildren();

        if (!list.length) {
            if (cowEmpty) cowEmpty.hidden = false;
            return;
        }

        if (cowEmpty) cowEmpty.hidden = true;

        list.forEach(cow => cowTableBody.appendChild(buildCowRow(cow)));

        // Reapply the active search/filter so newly rendered rows respect it.
        filterCows();
    }

    // ---------- Activity table ----------

    function buildActivityRow(activity) {
        const row = document.createElement("tr");

        row.dataset.type = activity.type;
        row.dataset.status = activity.status;

        const values = [
            { text: activity.cowLabel, className: "name" },
            { text: activity.type },
            { text: activity.description },
            { text: formatSchedule(activity.scheduledFor) },
            { text: activity.assignedTraineeName || "Unassigned" }
        ];

        values.forEach(({ text, className }) => {
            const cell = document.createElement("td");

            cell.textContent = text;

            if (className) cell.className = className;

            row.appendChild(cell);
        });

        const statusCell = document.createElement("td");
        const badge = document.createElement("span");

        badge.className =
            `status-badge ${ACTIVITY_BADGES[activity.status] || "pending"}`;
        badge.textContent = activity.status;

        statusCell.appendChild(badge);
        row.appendChild(statusCell);

        return row;
    }

    function renderActivities(list) {
        activityTableBody.replaceChildren();

        if (!list.length) {
            if (activityEmpty) activityEmpty.hidden = false;
            return;
        }

        if (activityEmpty) activityEmpty.hidden = true;

        list.forEach(activity =>
            activityTableBody.appendChild(buildActivityRow(activity))
        );

        filterActivities();
    }

    // ---------- Selects ----------

    function buildTraineeOptions(select, placeholder) {
        if (!select) return;

        const current = select.value;

        select.replaceChildren();

        const empty = document.createElement("option");

        empty.value = "";
        empty.textContent = placeholder;
        select.appendChild(empty);

        trainees.forEach(trainee => {
            const option = document.createElement("option");

            option.value = trainee.userId;
            option.textContent = trainee.traineeId
                ? `${trainee.fullName} (${trainee.traineeId})`
                : trainee.fullName;
            select.appendChild(option);
        });

        if (current && Array.from(select.options).some(
            option => option.value === current
        )) {
            select.value = current;
        }
    }

    function populateTraineeOptions() {
        buildTraineeOptions(
            document.getElementById("cowTrainee"),
            "Unassigned"
        );

        buildTraineeOptions(
            document.getElementById("activityTrainee"),
            trainees.length ? "Select trainee" : "No trainee accounts"
        );
    }

    function populateCowOptions() {
        const select = document.getElementById("activityCow");

        if (!select) return;

        const current = select.value;

        select.replaceChildren();

        const placeholder = document.createElement("option");

        placeholder.value = "";
        placeholder.textContent = cows.length ? "Select cow" : "No cows registered";
        select.appendChild(placeholder);

        cows.forEach(cow => {
            const option = document.createElement("option");

            option.value = cow.id;
            option.textContent = `${cow.name} (${cow.cowId})`;
            select.appendChild(option);
        });

        if (current && Array.from(select.options).some(
            option => option.value === current
        )) {
            select.value = current;
        }
    }

    // ---------- Filters ----------

    const cowSearch = document.getElementById("cowSearch");
    const cowHealthFilter = document.getElementById("cowHealthFilter");

    function filterCows() {
        if (!cowTableBody) return;

        const search = cowSearch.value.trim().toLowerCase();
        const status = cowHealthFilter.value;

        Array.from(cowTableBody.rows).forEach(row => {
            const matchesSearch = row.textContent.toLowerCase().includes(search);
            const matchesStatus =
                status === "all" || row.dataset.health === status;

            row.style.display = matchesSearch && matchesStatus ? "" : "none";
        });
    }

    cowSearch.addEventListener("input", filterCows);
    cowHealthFilter.addEventListener("change", filterCows);

    const activitySearch = document.getElementById("activitySearch");
    const activityTypeFilter = document.getElementById("activityTypeFilter");
    const activityStatusFilter = document.getElementById("activityStatusFilter");

    function filterActivities() {
        if (!activityTableBody) return;

        const search = activitySearch.value.trim().toLowerCase();
        const type = activityTypeFilter.value;
        const status = activityStatusFilter.value;

        Array.from(activityTableBody.rows).forEach(row => {
            const matchesSearch = row.textContent.toLowerCase().includes(search);
            const matchesType = type === "all" || row.dataset.type === type;
            const matchesStatus =
                status === "all" || row.dataset.status === status;

            row.style.display =
                matchesSearch && matchesType && matchesStatus ? "" : "none";
        });
    }

    activitySearch.addEventListener("input", filterActivities);
    activityTypeFilter.addEventListener("change", filterActivities);
    activityStatusFilter.addEventListener("change", filterActivities);

    // ---------- Modals ----------

    function openModal(modal) {
        if (modal) modal.classList.add("show");
    }

    function closeModal(modal) {
        if (modal) modal.classList.remove("show");
    }

    addCowBtn.addEventListener("click", () => {
        setFormError(cowFormError, "");
        populateTraineeOptions();
        openModal(cowModal);
    });

    addActivityBtn.addEventListener("click", () => {
        setFormError(activityFormError, "");
        populateCowOptions();
        populateTraineeOptions();
        openModal(activityModal);
    });

    closeCowBtn.addEventListener("click", () => closeModal(cowModal));
    cancelCowBtn.addEventListener("click", () => closeModal(cowModal));

    closeActivityBtn.addEventListener("click", () => closeModal(activityModal));
    cancelActivityBtn.addEventListener("click", () => closeModal(activityModal));

    [cowModal, activityModal].forEach(modal => {
        modal.addEventListener("click", event => {
            if (event.target === modal) closeModal(modal);
        });
    });

    // Prefill the activity trainee from the chosen cow's assignment.
    document.getElementById("activityCow").addEventListener("change", event => {
        const cow = cows.find(item => item.id === event.target.value);
        const traineeSelect = document.getElementById("activityTrainee");

        if (cow && cow.assignedTraineeId) {
            traineeSelect.value = cow.assignedTraineeId;
        }
    });

    // ---------- Save cow ----------

    cowForm.addEventListener("submit", async event => {
        event.preventDefault();
        setFormError(cowFormError, "");

        const submitButton = cowForm.querySelector('button[type="submit"]');
        const originalLabel = submitButton ? submitButton.textContent : "";

        if (submitButton) {
            submitButton.disabled = true;
            submitButton.textContent = "Saving…";
        }

        try {
            const response = await fetch(COWS_API_URL, {
                method: "POST",
                headers: authHeaders({ "Content-Type": "application/json" }),
                body: JSON.stringify({
                    cowId: document.getElementById("cowId").value.trim(),
                    name: document.getElementById("cowName").value.trim(),
                    breed: document.getElementById("cowBreed").value.trim(),
                    ageYears: Number(document.getElementById("cowAge").value),
                    assignedTrainee:
                        document.getElementById("cowTrainee").value || null,
                    healthStatus: document.getElementById("cowHealth").value
                })
            });

            if (response.status === 401) {
                handleUnauthorized();
                return;
            }

            const data = await response.json();

            if (!response.ok || !data.success) {
                throw new Error(data.message || "Unable to save this cow record.");
            }

            cowForm.reset();
            closeModal(cowModal);
            await loadCows();
            await loadActivities();
            setFeedback(data.message || "Cow record saved.");

        } catch (error) {
            console.error("Save cow error:", error);
            setFormError(
                cowFormError,
                error.message || "Unable to save this cow record."
            );

        } finally {
            if (submitButton) {
                submitButton.disabled = false;
                submitButton.textContent = originalLabel;
            }
        }
    });

    // ---------- Save activity ----------

    activityForm.addEventListener("submit", async event => {
        event.preventDefault();
        setFormError(activityFormError, "");

        const date = document.getElementById("activityDate").value;
        const time = document.getElementById("activityTime").value;
        const scheduledFor = new Date(`${date}T${time}`);

        if (Number.isNaN(scheduledFor.getTime())) {
            setFormError(
                activityFormError,
                "Enter a valid schedule date and time."
            );
            return;
        }

        const submitButton = activityForm.querySelector('button[type="submit"]');
        const originalLabel = submitButton ? submitButton.textContent : "";

        if (submitButton) {
            submitButton.disabled = true;
            submitButton.textContent = "Saving…";
        }

        try {
            const response = await fetch(`${COWS_API_URL}/activities`, {
                method: "POST",
                headers: authHeaders({ "Content-Type": "application/json" }),
                body: JSON.stringify({
                    cowId: document.getElementById("activityCow").value,
                    type: document.getElementById("activityType").value,
                    description: document
                        .getElementById("activityDescription").value.trim(),
                    scheduledFor: scheduledFor.toISOString(),
                    assignedTrainee:
                        document.getElementById("activityTrainee").value || null
                })
            });

            if (response.status === 401) {
                handleUnauthorized();
                return;
            }

            const data = await response.json();

            if (!response.ok || !data.success) {
                throw new Error(
                    data.message || "Unable to save this maintenance activity."
                );
            }

            activityForm.reset();
            closeModal(activityModal);
            await loadActivities();
            setFeedback(data.message || "Maintenance activity saved.");

        } catch (error) {
            console.error("Save maintenance activity error:", error);
            setFormError(
                activityFormError,
                error.message || "Unable to save this maintenance activity."
            );

        } finally {
            if (submitButton) {
                submitButton.disabled = false;
                submitButton.textContent = originalLabel;
            }
        }
    });

    // ---------- Boot ----------

    loadMaintenance();
});
