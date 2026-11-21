const COWS_API_URL = "http://localhost:5000/api/admin/cows";
const COW_TRAINEES_API_URL = "http://localhost:5000/api/admin/trainees";
const CALENDAR_API_URL = "http://localhost:5000/api/integrations/google-calendar";

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
    const refreshCowRecord = document.getElementById("refreshCowRecord");
    const realtime = window.EDTSPRealtime;

    // Tables and states
    const cowTableBody = document.getElementById("cowTableBody");
    const activityTableBody = document.getElementById("activityTableBody");
    const cowEmpty = document.getElementById("cowEmpty");
    const activityEmpty = document.getElementById("activityEmpty");
    const feedback = document.getElementById("cowFeedback");
    const calendarStatus = document.getElementById("calendarStatus");
    const calendarConnectBtn = document.getElementById("calendarConnectBtn");
    const calendarSyncBtn = document.getElementById("calendarSyncBtn");

    const calendarResult = new URLSearchParams(window.location.search).get(
        "calendar"
    );
    const calendarReason = new URLSearchParams(window.location.search).get(
        "calendarReason"
    );

    let cows = [];
    let trainees = [];
    let editingCow = null;

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

        return cows;
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

        const actionCell = document.createElement("td");
        const editButton = document.createElement("button");

        editButton.type = "button";
        editButton.className = "row-action";
        editButton.textContent = "Edit";
        editButton.setAttribute("aria-label", `Edit cow ${cow.cowId}`);
        editButton.addEventListener("click", () => openEditCow(cow));

        actionCell.appendChild(editButton);
        row.appendChild(actionCell);

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

        const calendarCell = document.createElement("td");

        if (activity.googleCalendarEventLink) {
            const link = document.createElement("a");

            link.href = activity.googleCalendarEventLink;
            link.target = "_blank";
            link.rel = "noopener noreferrer";
            link.textContent = "Open event";

            calendarCell.appendChild(link);
        } else {
            calendarCell.textContent = "—";
        }

        row.appendChild(calendarCell);

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

    function setCowModalMode(cow = null) {
        editingCow = cow;

        const title = document.getElementById("cowModalTitle");
        const subtitle = document.getElementById("cowModalSubtitle");
        const cowIdInput = document.getElementById("cowId");
        const submitButton = cowForm.querySelector('button[type="submit"]');

        if (title) {
            title.textContent = cow ? "Edit cow record" : "Add cow record";
        }

        if (subtitle) {
            subtitle.textContent = cow
                ? `Updating ${cow.cowId}.`
                : "Enter the animal's basic information.";
        }

        if (cowIdInput) cowIdInput.readOnly = Boolean(cow);

        if (submitButton) {
            submitButton.textContent = cow ? "Save changes" : "Save cow";
        }

        if (refreshCowRecord) refreshCowRecord.hidden = true;

        setFormError(cowFormError, "");
        clearFieldErrors(cowForm);
    }

    function openEditCow(cow) {
        setCowModalMode(cow);
        populateTraineeOptions();

        document.getElementById("cowId").value = cow.cowId;
        document.getElementById("cowName").value = cow.name;
        document.getElementById("cowBreed").value = cow.breed;
        document.getElementById("cowAge").value = cow.ageYears;
        document.getElementById("cowTrainee").value =
            cow.assignedTraineeId || "";
        document.getElementById("cowHealth").value = cow.healthStatus;

        if (realtime) realtime.watch("cow", cow.id);

        openModal(cowModal);
    }

    function closeCowModal() {
        closeModal(cowModal);
        editingCow = null;

        if (realtime) realtime.unwatch();
    }

    addCowBtn.addEventListener("click", () => {
        cowForm.reset();
        setCowModalMode(null);
        populateTraineeOptions();
        openModal(cowModal);
    });

    addActivityBtn.addEventListener("click", () => {
        clearFieldErrors(activityForm);
        setFormError(activityFormError, "");
        populateCowOptions();
        populateTraineeOptions();
        openModal(activityModal);
    });

    closeCowBtn.addEventListener("click", closeCowModal);
    cancelCowBtn.addEventListener("click", closeCowModal);

    closeActivityBtn.addEventListener("click", () => closeModal(activityModal));
    cancelActivityBtn.addEventListener("click", () => closeModal(activityModal));

    cowModal.addEventListener("click", event => {
        if (event.target === cowModal) closeCowModal();
    });

    activityModal.addEventListener("click", event => {
        if (event.target === activityModal) closeModal(activityModal);
    });

    // A 409 means another admin saved first. Reload and reopen this cow with
    // the stored values.
    async function refreshEditingCow() {
        if (!editingCow) return;

        const cowId = editingCow.id;
        const originalLabel = refreshCowRecord
            ? refreshCowRecord.textContent
            : "";

        if (refreshCowRecord) {
            refreshCowRecord.disabled = true;
            refreshCowRecord.textContent = "Refreshing…";
        }

        try {
            await loadCows();

            const latest = cows.find(cow => cow.id === cowId);

            if (latest) {
                openEditCow(latest);
                setFeedback("Cow record refreshed with the latest changes.");
            } else {
                closeCowModal();
                setFeedback("That cow record is no longer available.", true);
            }
        } finally {
            if (refreshCowRecord) {
                refreshCowRecord.disabled = false;
                refreshCowRecord.textContent = originalLabel;
            }
        }
    }

    if (refreshCowRecord) {
        refreshCowRecord.addEventListener("click", refreshEditingCow);
    }

    // Another administrator changed this cow. Keep the stale version so a save
    // still hits the 409 guard until the record is refreshed.
    if (realtime) {
        realtime.onRecordUpdated(payload => {
            if (
                !editingCow ||
                payload.resource !== "cow" ||
                String(payload.id) !== String(editingCow.id)
            ) {
                return;
            }

            setFormError(
                cowFormError,
                "This cow record was changed by another user. Refresh the record to see the latest details before saving."
            );

            if (refreshCowRecord) refreshCowRecord.hidden = false;
        });
    }

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

        const cowIdInput = document.getElementById("cowId");
        const cowNameInput = document.getElementById("cowName");
        const cowBreedInput = document.getElementById("cowBreed");
        const cowAgeInput = document.getElementById("cowAge");

        [cowIdInput, cowNameInput, cowBreedInput, cowAgeInput]
            .forEach(field => setFieldError(field, ""));

        if (!editingCow && !cowIdInput.value.trim()) {
            setFieldError(cowIdInput, "Enter a cow ID.");
            cowIdInput.focus();
            return;
        }

        if (!cowNameInput.value.trim()) {
            setFieldError(cowNameInput, "Enter a cow name.");
            cowNameInput.focus();
            return;
        }

        if (!cowBreedInput.value.trim()) {
            setFieldError(cowBreedInput, "Enter a breed.");
            cowBreedInput.focus();
            return;
        }

        if (!cowAgeInput.value.trim()) {
            setFieldError(cowAgeInput, "Enter the cow's age.");
            cowAgeInput.focus();
            return;
        }

        const ageYears = Number(cowAgeInput.value);

        if (!Number.isFinite(ageYears) || ageYears < 0) {
            setFieldError(cowAgeInput, "Age must be zero or more.");
            cowAgeInput.focus();
            return;
        }

        const submitButton = cowForm.querySelector('button[type="submit"]');
        const originalLabel = submitButton ? submitButton.textContent : "";

        if (submitButton) {
            submitButton.disabled = true;
            submitButton.textContent = "Saving…";
        }

        const payload = {
            name: cowNameInput.value.trim(),
            breed: cowBreedInput.value.trim(),
            ageYears,
            assignedTrainee:
                document.getElementById("cowTrainee").value || null,
            healthStatus: document.getElementById("cowHealth").value
        };

        if (editingCow) {
            payload.version = editingCow.version;
        } else {
            payload.cowId = cowIdInput.value.trim();
        }

        try {
            const response = await fetch(
                editingCow
                    ? `${COWS_API_URL}/${encodeURIComponent(editingCow.id)}`
                    : COWS_API_URL,
                {
                    method: editingCow ? "PUT" : "POST",
                    headers: authHeaders({
                        "Content-Type": "application/json"
                    }),
                    body: JSON.stringify(payload)
                }
            );

            if (response.status === 401) {
                handleUnauthorized();
                return;
            }

            const data = await response.json();

            if (
                response.status === 409 &&
                data.code === "VERSION_CONFLICT"
            ) {
                setFormError(cowFormError, data.message);
                if (refreshCowRecord) refreshCowRecord.hidden = false;
                return;
            }

            if (!response.ok || !data.success) {
                throw new Error(data.message || "Unable to save this cow record.");
            }

            cowForm.reset();
            setCowModalMode(null);
            closeCowModal();
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

        const cowSelect = document.getElementById("activityCow");
        const typeSelect = document.getElementById("activityType");
        const dateInput = document.getElementById("activityDate");
        const timeInput = document.getElementById("activityTime");
        const traineeSelect = document.getElementById("activityTrainee");
        const descriptionInput = document.getElementById("activityDescription");

        [
            cowSelect,
            typeSelect,
            dateInput,
            timeInput,
            traineeSelect,
            descriptionInput
        ].forEach(field => setFieldError(field, ""));

        if (!cowSelect.value) {
            setFieldError(cowSelect, "Select a cow.");
            cowSelect.focus();
            return;
        }

        if (!typeSelect.value) {
            setFieldError(typeSelect, "Choose an activity type.");
            typeSelect.focus();
            return;
        }

        if (!dateInput.value) {
            setFieldError(dateInput, "Choose a schedule date.");
            dateInput.focus();
            return;
        }

        if (!timeInput.value) {
            setFieldError(timeInput, "Choose a schedule time.");
            timeInput.focus();
            return;
        }

        const scheduledFor = new Date(`${dateInput.value}T${timeInput.value}`);

        if (Number.isNaN(scheduledFor.getTime())) {
            setFieldError(dateInput, "Enter a valid schedule date and time.");
            dateInput.focus();
            return;
        }

        if (!traineeSelect.value) {
            setFieldError(traineeSelect, "Assign a trainee.");
            traineeSelect.focus();
            return;
        }

        if (!descriptionInput.value.trim()) {
            setFieldError(descriptionInput, "Describe the activity.");
            descriptionInput.focus();
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
                    cowId: cowSelect.value,
                    type: typeSelect.value,
                    description: descriptionInput.value.trim(),
                    scheduledFor: scheduledFor.toISOString(),
                    assignedTrainee: traineeSelect.value || null
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

            if (data.calendarWarning) {
                setFeedback(data.calendarWarning, true);
            } else if (data.calendarSynced) {
                setFeedback(
                    "Maintenance activity saved and added to Google Calendar."
                );
            } else {
                setFeedback(data.message || "Maintenance activity saved.");
            }

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

    // ---------- Google Calendar ----------

    async function loadCalendarStatus() {
        if (!calendarStatus) return;

        calendarStatus.classList.remove("is-error");
        calendarStatus.textContent = "Checking Google Calendar connection…";

        if (calendarConnectBtn) calendarConnectBtn.hidden = true;

        try {
            const data = await fetchJson(`${CALENDAR_API_URL}/status`);

            if (!data.configured) {
                calendarStatus.textContent =
                    "Google Calendar is not configured on the server.";
                calendarStatus.classList.add("is-error");
                return;
            }

            if (data.enabled === false) {
                calendarStatus.textContent =
                    "Google Calendar is turned off in System settings. Turn it on to add maintenance activities.";
                return;
            }

            if (data.needsReconnect) {
                calendarStatus.textContent =
                    "The saved Google Calendar connection is no longer valid. Reconnect to resume adding maintenance activities.";
                calendarStatus.classList.add("is-error");
            } else if (data.connected) {
                calendarStatus.textContent = data.accountEmail
                    ? `Connected as ${data.accountEmail}. New maintenance activities are added automatically.`
                    : "Connected. New maintenance activities are added automatically.";
            } else if (data.accountEmail && data.authorized === false) {
                calendarStatus.textContent =
                    `Signed in as ${data.accountEmail}, but Calendar access was not granted. Reconnect and approve the request.`;
                calendarStatus.classList.add("is-error");
            } else {
                calendarStatus.textContent =
                    "Not connected. Connect a Google account to add maintenance activities to its calendar.";
            }

            if (calendarConnectBtn) {
                calendarConnectBtn.hidden = false;
                calendarConnectBtn.textContent = data.accountEmail
                    ? "Reconnect Google Calendar"
                    : "Connect Google Calendar";
            }

            if (calendarSyncBtn) {
                calendarSyncBtn.hidden = !data.connected;
            }
        } catch (error) {
            if (error.unauthorized) {
                handleUnauthorized();
                return;
            }

            console.error("Google Calendar status error:", error);
            calendarStatus.textContent =
                "Google Calendar status is unavailable right now.";
            calendarStatus.classList.add("is-error");
        }
    }

    if (calendarConnectBtn) {
        calendarConnectBtn.addEventListener("click", async () => {
            const originalLabel = calendarConnectBtn.textContent;

            calendarConnectBtn.disabled = true;
            calendarConnectBtn.textContent = "Opening Google…";

            try {
                const returnTo = window.location.href.split("#")[0];
                const data = await fetchJson(
                    `${CALENDAR_API_URL}/connect?returnTo=${encodeURIComponent(returnTo)}`
                );

                if (!data.authUrl) {
                    throw new Error(
                        "Google Calendar authorization could not be started."
                    );
                }

                window.location.href = data.authUrl;
            } catch (error) {
                if (error.unauthorized) {
                    handleUnauthorized();
                    return;
                }

                console.error("Google Calendar connect error:", error);
                setFeedback(
                    error.message ||
                        "Unable to start the Google Calendar connection.",
                    true
                );
                calendarConnectBtn.disabled = false;
                calendarConnectBtn.textContent = originalLabel;
            }
        });
    }

    if (calendarSyncBtn) {
        calendarSyncBtn.addEventListener("click", async () => {
            const originalLabel = calendarSyncBtn.textContent;

            calendarSyncBtn.disabled = true;
            calendarSyncBtn.textContent = "Syncing…";

            try {
                const response = await fetch(`${CALENDAR_API_URL}/sync`, {
                    method: "POST",
                    headers: authHeaders()
                });

                if (response.status === 401) {
                    handleUnauthorized();
                    return;
                }

                const data = await response.json();

                if (!response.ok || !data.success) {
                    throw new Error(
                        data.message ||
                            "Unable to sync activities to Google Calendar."
                    );
                }

                await loadActivities();
                setFeedback(
                    data.message || "Activities synced to Google Calendar."
                );
            } catch (error) {
                console.error("Google Calendar sync error:", error);
                setFeedback(
                    error.message ||
                        "Unable to sync activities to Google Calendar.",
                    true
                );
            } finally {
                calendarSyncBtn.disabled = false;
                calendarSyncBtn.textContent = originalLabel;
            }
        });
    }

    // ---------- Boot ----------

    loadCalendarStatus();

    loadMaintenance().finally(() => {
        if (calendarResult === "connected") {
            setFeedback(
                "Google Calendar connected. New maintenance activities will be added automatically."
            );
        } else if (calendarResult === "error") {
            setFeedback(
                calendarReason || "Google Calendar could not be connected.",
                true
            );
        }

        if (calendarResult) {
            window.history.replaceState({}, "", window.location.pathname);
        }
    });
});
