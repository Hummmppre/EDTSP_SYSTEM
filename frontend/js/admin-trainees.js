const TRAINEES_API_URL = "http://localhost:5000/api/admin/trainees";

const ENROLLMENT_CLASSES = {
    Pending: "pending",
    Ongoing: "ongoing",
    Completed: "completed",
    Inactive: "inactive"
};

document.addEventListener("DOMContentLoaded", () => {
    const tableBody = document.getElementById("traineeTableBody");

    if (!tableBody) return;

    const searchInput = document.getElementById("traineeSearch");
    const statusFilter = document.getElementById("statusFilter");
    const emptyState = document.getElementById("traineeEmpty");
    const countLabel = document.getElementById("traineeCount");
    const feedback = document.getElementById("traineeFeedback");

    const modal = document.getElementById("traineeModal");
    const modalSubtitle = document.getElementById("traineeModalSubtitle");
    const facts = document.getElementById("traineeFacts");
    const form = document.getElementById("traineeForm");
    const formError = document.getElementById("traineeFormError");
    const traineeIdInput = document.getElementById("traineeIdInput");
    const enrollmentInput = document.getElementById("enrollmentStatusInput");
    const phoneInput = document.getElementById("traineePhoneInput");
    const accountStatusInput = document.getElementById("traineeAccountStatusInput");
    const addressInput = document.getElementById("traineeAddressInput");
    const saveButton = document.getElementById("saveTrainee");
    const refreshButton = document.getElementById("refreshTraineeRecord");
    const closeModalButton = document.getElementById("closeTraineeModal");
    const realtime = window.EDTSPRealtime;
    const cancelModalButton = document.getElementById("cancelTraineeModal");

    const traineesById = new Map();
    let openTrainee = null;

    const authHeaders = () => ({
        Authorization: `Bearer ${
    localStorage.getItem("edtspToken") ||
    sessionStorage.getItem("edtspToken") ||
    ""  
}`
    });

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
        feedback.classList.toggle("is-error", Boolean(message && isError));
    }

    function formatDate(value) {
        if (!value) return "—";

        const date = new Date(value);

        if (Number.isNaN(date.getTime())) return "—";

        return date.toLocaleDateString("en-US", {
            month: "short",
            day: "2-digit",
            year: "numeric"
        });
    }

    function setText(id, value) {
        const element = document.getElementById(id);

        if (element) element.textContent = value;
    }

    function buildRow(trainee) {
        const row = document.createElement("tr");

        row.dataset.status = trainee.enrollmentStatus;
        row.dataset.search = [
            trainee.traineeId,
            trainee.fullName,
            trainee.email,
            trainee.programName
        ].filter(Boolean).join(" ").toLowerCase();

        const idCell = document.createElement("td");

        idCell.className = "id";
        idCell.textContent = trainee.traineeId || "Not issued";
        row.appendChild(idCell);

        const nameCell = document.createElement("td");

        nameCell.className = "name";
        nameCell.textContent = trainee.fullName;
        row.appendChild(nameCell);

        const emailCell = document.createElement("td");

        emailCell.textContent = trainee.email;
        row.appendChild(emailCell);

        const programCell = document.createElement("td");

        programCell.textContent = trainee.programName || "—";

        if (trainee.batchLabel) {
            const batch = document.createElement("small");

            batch.className = "field-note";
            batch.textContent = `Batch ${trainee.batchLabel}`;
            programCell.appendChild(batch);
        }

        row.appendChild(programCell);

        const statusCell = document.createElement("td");
        const badge = document.createElement("span");

        badge.className =
            `status-badge ${ENROLLMENT_CLASSES[trainee.enrollmentStatus] || "inactive"}`;
        badge.textContent = trainee.enrollmentStatus;
        statusCell.appendChild(badge);

        if (trainee.accountStatus !== "active") {
            const note = document.createElement("small");

            note.className = "field-note";
            note.textContent = "Account inactive";
            statusCell.appendChild(note);
        }

        row.appendChild(statusCell);

        const actionCell = document.createElement("td");
        const manageButton = document.createElement("button");

        manageButton.type = "button";
        manageButton.className = "row-action";
        manageButton.textContent = "Manage";
        manageButton.dataset.userId = trainee.userId;
        actionCell.appendChild(manageButton);
        row.appendChild(actionCell);

        return row;
    }

    function renderSummary(summary = {}) {
        setText("totalTrainees", String(summary.total || 0));
        setText("activeTrainees", String(summary.ongoing || 0));
        setText("pendingTrainees", String(summary.pending || 0));
        setText("completedTrainees", String(summary.completed || 0));
    }

    function renderRows(trainees) {
        traineesById.clear();
        tableBody.innerHTML = "";

        trainees.forEach(trainee => {
            traineesById.set(trainee.userId, trainee);
            tableBody.appendChild(buildRow(trainee));
        });

        if (countLabel) {
            const count = trainees.length;

            countLabel.textContent = `${count} record${count === 1 ? "" : "s"}`;
        }

        filterRows();
    }

    function filterRows() {
        const search = (searchInput ? searchInput.value : "").trim().toLowerCase();
        const status = statusFilter ? statusFilter.value : "all";
        let visible = 0;

        Array.from(tableBody.rows).forEach(row => {
            const matchesSearch = !search || row.dataset.search.includes(search);
            const matchesStatus = status === "all" || row.dataset.status === status;
            const show = matchesSearch && matchesStatus;

            row.style.display = show ? "" : "none";

            if (show) visible += 1;
        });

        if (emptyState) {
            emptyState.textContent = traineesById.size === 0
                ? "No trainees registered yet."
                : "No trainees match this search and status.";
            emptyState.hidden = visible !== 0;
        }
    }

    function addFact(label, value) {
        const wrapper = document.createElement("div");
        const term = document.createElement("dt");
        const description = document.createElement("dd");

        term.textContent = label;
        description.textContent = value;
        wrapper.appendChild(term);
        wrapper.appendChild(description);
        facts.appendChild(wrapper);
    }

    function openModal(trainee) {
        openTrainee = trainee;

        modalSubtitle.textContent = trainee.fullName;
        facts.innerHTML = "";

        addFact("Email", trainee.email);
        addFact("Program", trainee.programName || "Not enrolled yet");
        addFact("Batch", trainee.batchLabel || "—");
        addFact("Approved", formatDate(trainee.approvedAt));
        addFact("Member since", formatDate(trainee.createdAt));

        traineeIdInput.value = trainee.traineeId || "";
        enrollmentInput.value = trainee.enrollmentStatus;
        phoneInput.value = trainee.phone || "";
        accountStatusInput.value = trainee.accountStatus || "active";
        addressInput.value = trainee.address || "";

        formError.textContent = "";
        formError.hidden = true;
        if (refreshButton) refreshButton.hidden = true;
        clearFieldErrors(form);

        if (realtime) realtime.watch("trainee", trainee.userId);

        modal.classList.add("show");
    }

    function closeModal() {
        modal.classList.remove("show");
        openTrainee = null;

        if (realtime) realtime.unwatch();
    }

    async function loadTrainees() {
        try {
            const response = await fetch(TRAINEES_API_URL, {
                headers: authHeaders()
            });

            if (response.status === 401) {
                handleUnauthorized();
                return;
            }

            const data = await response.json();

            if (!response.ok || !data.success) {
                throw new Error(data.message || "Unable to load trainees.");
            }

            renderSummary(data.summary);
            renderRows(data.trainees || []);

            return data.trainees || [];

        } catch (error) {
            console.error("Trainee load error:", error);

            renderSummary({});
            renderRows([]);
            setFeedback(
                error.message || "Unable to load trainees. Please try again.",
                true
            );

            return null;
        }
    }

    // A 409 means another admin saved first. Reload the row and reopen the
    // form with the stored values so the admin can reapply their edit.
    async function refreshOpenTrainee() {
        if (!openTrainee) return;

        const userId = openTrainee.userId;
        const originalLabel = refreshButton ? refreshButton.textContent : "";

        if (refreshButton) {
            refreshButton.disabled = true;
            refreshButton.textContent = "Refreshing...";
        }

        try {
            const trainees = await loadTrainees();
            const latest = trainees
                ? trainees.find(trainee => trainee.userId === userId)
                : null;

            if (latest) {
                openModal(latest);
                setFeedback("Record refreshed with the latest changes.");
            } else {
                closeModal();
                setFeedback("That trainee record is no longer available.", true);
            }
        } finally {
            if (refreshButton) {
                refreshButton.disabled = false;
                refreshButton.textContent = originalLabel;
            }
        }
    }

    async function saveTrainee() {
        if (!openTrainee) return;

        const traineeId = traineeIdInput.value.trim().toUpperCase();
        const phone = phoneInput.value.trim();
        const address = addressInput.value.trim();

        const showError = message => {
            formError.textContent = message;
            formError.hidden = false;
        };

        [traineeIdInput, phoneInput, addressInput]
            .forEach(field => setFieldError(field, ""));

        if (traineeId && !/^[A-Z0-9-]{3,30}$/.test(traineeId)) {
            setFieldError(
                traineeIdInput,
                "Trainee ID must be 3–30 characters using letters, numbers, or hyphens."
            );
            traineeIdInput.focus();
            return;
        }

        if (phone.length > 30) {
            setFieldError(phoneInput, "Phone number must be 30 characters or fewer.");
            phoneInput.focus();
            return;
        }

        if (address.length > 300) {
            setFieldError(addressInput, "Address must be 300 characters or fewer.");
            addressInput.focus();
            return;
        }

        formError.hidden = true;

        const originalLabel = saveButton.textContent;

        saveButton.disabled = true;
        saveButton.textContent = "Saving...";

        try {
            const response = await fetch(
                `${TRAINEES_API_URL}/${openTrainee.userId}`,
                {
                    method: "PUT",
                    headers: {
                        ...authHeaders(),
                        "Content-Type": "application/json"
                    },
                    body: JSON.stringify({
                        traineeId,
                        enrollmentStatus: enrollmentInput.value,
                        phone,
                        address,
                        accountStatus: accountStatusInput.value,
                        version: openTrainee.version
                    })
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
                formError.textContent = data.message;
                formError.hidden = false;
                if (refreshButton) refreshButton.hidden = false;
                return;
            }

            if (!response.ok || !data.success) {
                throw new Error(data.message || "Unable to update this trainee.");
            }

            closeModal();
            setFeedback(data.message || "Trainee record updated.");
            await loadTrainees();

        } catch (error) {
            console.error("Trainee save error:", error);
            showError(error.message || "Unable to update this trainee.");

        } finally {
            saveButton.disabled = false;
            saveButton.textContent = originalLabel;
        }
    }

    // Another administrator saved this trainee. Keep the stale version so a
    // save still hits the 409 guard, and point the admin at Refresh record.
    if (realtime) {
        realtime.onRecordUpdated(payload => {
            if (
                !openTrainee ||
                payload.resource !== "trainee" ||
                String(payload.id) !== String(openTrainee.userId)
            ) {
                return;
            }

            formError.textContent =
                "This trainee was changed by another user. Refresh the record to see the latest details before saving.";
            formError.hidden = false;

            if (refreshButton) refreshButton.hidden = false;
        });
    }

    if (searchInput) searchInput.addEventListener("input", filterRows);
    if (statusFilter) statusFilter.addEventListener("change", filterRows);

    tableBody.addEventListener("click", event => {
        const button = event.target.closest(".row-action");

        if (!button) return;

        const trainee = traineesById.get(button.dataset.userId);

        if (trainee) openModal(trainee);
    });

    if (form) {
        form.addEventListener("submit", event => {
            event.preventDefault();
            saveTrainee();
        });
    }

    if (saveButton) saveButton.addEventListener("click", saveTrainee);
    if (refreshButton) {
        refreshButton.addEventListener("click", refreshOpenTrainee);
    }
    if (closeModalButton) closeModalButton.addEventListener("click", closeModal);
    if (cancelModalButton) cancelModalButton.addEventListener("click", closeModal);

    if (modal) {
        modal.addEventListener("click", event => {
            if (event.target === modal) closeModal();
        });
    }

    loadTrainees();
});
