// =============================
// EDTSP TRAINEE TRAINING APPLICATION
// =============================

(() => {
    const API_BASE = "http://localhost:5000/api";

    const authToken = localStorage.getItem("edtspToken");
    const storedUser = localStorage.getItem("edtspUser");

    if (!authToken || !storedUser) {
        window.location.href = "../login.html";
        return;
    }

    let account = null;

    try {
        account = JSON.parse(storedUser);
    } catch (error) {
        localStorage.removeItem("edtspToken");
        localStorage.removeItem("edtspUser");
        window.location.href = "../login.html";
        return;
    }

    if (!account || account.role !== "trainee") {
        window.location.href = "../login.html";
        return;
    }

    const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const PHONE_REGEX = /^[0-9+()\-\s]{7,20}$/;

    const state = {
        step: 1,
        programs: [],
        application: null,
        canApply: false,
        reason: null,
        identity: null,
        loaded: false,
        justSubmitted: false,
        availabilityRequestId: 0
    };

    const elements = {
        loading: document.getElementById("loadingPanel"),
        notice: document.getElementById("noticePanel"),
        noticeTitle: document.getElementById("noticeTitle"),
        noticeText: document.getElementById("noticeText"),
        noticeRetry: document.getElementById("noticeRetry"),
        status: document.getElementById("statusPanel"),
        statusBadge: document.getElementById("statusBadge"),
        statusMessage: document.getElementById("statusMessage"),
        statusMessageTitle: document.getElementById("statusMessageTitle"),
        statusMessageText: document.getElementById("statusMessageText"),
        statusFacts: document.getElementById("statusFacts"),
        statusProgram: document.getElementById("statusProgram"),
        statusBatch: document.getElementById("statusBatch"),
        statusSubmitted: document.getElementById("statusSubmitted"),
        statusDecided: document.getElementById("statusDecided"),
        statusNoteRow: document.getElementById("statusNoteRow"),
        statusNote: document.getElementById("statusNote"),
        withdrawBtn: document.getElementById("withdrawBtn"),
        applyAgainBtn: document.getElementById("applyAgainBtn"),
        wizard: document.getElementById("wizardPanel"),
        wizardMeta: document.getElementById("wizardMeta"),
        wizardSteps: Array.from(document.querySelectorAll("#wizardSteps li")),
        form: document.getElementById("applicationForm"),
        steps: Array.from(document.querySelectorAll(".wizard__step")),
        backBtn: document.getElementById("backBtn"),
        nextBtn: document.getElementById("nextBtn"),
        submitBtn: document.getElementById("submitBtn"),
        submitError: document.getElementById("submitError"),
        program: document.getElementById("program"),
        batch: document.getElementById("batch"),
        programHint: document.getElementById("programHint"),
        motivation: document.getElementById("motivation"),
        motivationCount: document.getElementById("motivationCount"),
        review: document.getElementById("reviewSummary")
    };

    function formatDate(value) {
        if (!value) return "—";

        const date = new Date(value);

        if (Number.isNaN(date.getTime())) return "—";

        return date.toLocaleDateString("en-PH", {
            year: "numeric",
            month: "short",
            day: "numeric"
        });
    }

    async function api(path, options = {}) {
        const response = await fetch(`${API_BASE}${path}`, {
            ...options,
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${authToken}`,
                ...(options.headers || {})
            }
        });

        if (response.status === 401) {
            localStorage.removeItem("edtspToken");
            localStorage.removeItem("edtspUser");
            window.location.href = "../login.html";
            throw new Error("Session expired.");
        }

        const data = await response.json();

        if (!response.ok || !data.success) {
            const error = new Error(data.message || "The request could not be completed.");
            error.status = response.status;
            throw error;
        }

        return data;
    }

    function showOnly(panel) {
        [elements.loading, elements.notice, elements.status, elements.wizard]
            .forEach(item => { item.hidden = item !== panel; });
    }

    function showNotice(title, text, retryable) {
        elements.noticeTitle.textContent = title;
        elements.noticeText.textContent = text;
        elements.noticeRetry.hidden = !retryable;
        showOnly(elements.notice);
    }

    // ---------- Data ----------

    async function loadApplicationState() {
        const [identity, applicationData, batchData] = await Promise.all([
            api("/trainee/me"),
            api("/applications/me"),
            api("/applications/open-batches")
        ]);

        state.identity = {
            user: identity.user,
            profile: identity.profile
        };
        state.application = applicationData.application;
        state.canApply = Boolean(applicationData.canApply);
        state.reason = applicationData.reason;
        state.programs = batchData.programs || [];
        state.loaded = true;
    }

    // ---------- Identity prefill ----------

    function prefillContactFields() {
        if (!state.identity) return;

        const { user, profile } = state.identity;

        const setIfEmpty = (id, value) => {
            const field = document.getElementById(id);

            if (field && !field.value && value) {
                field.value = value;
            }
        };

        setIfEmpty("firstName", user.firstName);
        setIfEmpty("lastName", user.lastName);
        setIfEmpty("email", user.email);
        setIfEmpty("phone", profile ? profile.phone : "");

        if (profile && profile.address) {
            const address = document.getElementById("address");

            if (address && !address.value) {
                address.value = profile.address;
            }
        }
    }

    // ---------- Wizard ----------

    function listedPrograms() {
        return state.programs.filter(program => program.batches && program.batches.length);
    }

    function renderProgramOptions() {
        const previous = elements.program.value;

        elements.program.innerHTML = "";

        const placeholder = document.createElement("option");
        placeholder.value = "";
        placeholder.textContent = "Select a program";
        elements.program.append(placeholder);

        const programs = listedPrograms();

        programs.forEach(program => {
            const option = document.createElement("option");
            option.value = program._id;
            option.textContent = program.name;
            elements.program.append(option);
        });

        if (programs.some(program => program._id === previous)) {
            elements.program.value = previous;
        }

        return elements.program.value;
    }

    function fillBatchOptions(programId, preferredBatchId = "") {
        elements.batch.innerHTML = "";

        const program = state.programs.find(item => item._id === programId);

        if (!program) {
            const option = document.createElement("option");
            option.value = "";
            option.textContent = "Select a program first";
            elements.batch.append(option);
            elements.batch.disabled = true;
            elements.programHint.textContent = "";
            return;
        }

        const hasAvailable = program.batches.some(
            batch => batch.filledCount < batch.slotCapacity
        );

        const placeholder = document.createElement("option");
        placeholder.value = "";
        placeholder.textContent = hasAvailable
            ? "Select a batch"
            : "All batches are full";
        elements.batch.append(placeholder);

        program.batches.forEach(batch => {
            const isFull = batch.filledCount >= batch.slotCapacity;
            const option = document.createElement("option");

            option.value = batch._id;
            option.disabled = isFull;
            option.textContent = isFull
                ? `${batch.label} — Full`
                : `${batch.label} — ${batch.slotsRemaining} slot${
                    batch.slotsRemaining === 1 ? "" : "s"
                } left`;
            elements.batch.append(option);
        });

        elements.batch.disabled = false;

        const fee = Number(program.fee || 0).toLocaleString("en-PH");

        elements.programHint.textContent = hasAvailable
            ? `Training fee: ₱${fee}.`
            : `Training fee: ₱${fee}. All batches are full.`;

        if (preferredBatchId) {
            const preferred = Array.from(elements.batch.options).find(
                option => option.value === preferredBatchId && !option.disabled
            );

            if (preferred) {
                elements.batch.value = preferredBatchId;
            }
        }
    }

    function updateWizardChrome() {
        elements.wizardSteps.forEach((item, index) => {
            const step = index + 1;

            item.classList.toggle("is-current", step === state.step);
            item.classList.toggle("is-done", step < state.step);
        });

        elements.steps.forEach(panel => {
            panel.hidden = Number(panel.dataset.step) !== state.step;
        });

        elements.wizardMeta.textContent = `Step ${state.step} of 5`;
        elements.backBtn.hidden = state.step === 1;
        elements.nextBtn.hidden = state.step === 5;
        elements.submitBtn.hidden = state.step !== 5;

        document.querySelectorAll(".wizard__step [aria-invalid]").forEach(field => {
            field.removeAttribute("aria-invalid");
        });
    }

    async function goToStep(step) {
        const target = Math.min(Math.max(step, 1), 5);

        if (target === 4 && state.loaded) {
            await refreshAvailability();
        }

        state.step = target;

        if (state.step === 5) {
            buildReview();
        }

        updateWizardChrome();

        const panelTop = elements.wizard.getBoundingClientRect().top + window.scrollY;

        window.scrollTo({ top: panelTop, behavior: "smooth" });
    }

    async function refreshAvailability() {
        const requestId = state.availabilityRequestId + 1;
        state.availabilityRequestId = requestId;

        elements.programHint.textContent = "Checking availability…";

        try {
            const data = await api("/applications/open-batches");

            if (requestId !== state.availabilityRequestId) return;

            state.programs = data.programs || [];

            const previousProgram = elements.program.value;
            const previousBatch = elements.batch.value;

            if (!listedPrograms().length) {
                showNotice(
                    "Applications are closed right now.",
                    "There are no open batches accepting applications. Check back with the training office."
                );
                return;
            }

            const programId = renderProgramOptions();

            fillBatchOptions(programId, previousBatch);

            if (previousProgram && programId !== previousProgram) {
                elements.programHint.textContent = "That program is no longer available. Choose another.";
                return;
            }

            if (previousBatch) {
                const option = Array.from(elements.batch.options).find(
                    item => item.value === previousBatch
                );

                if (!option || option.disabled) {
                    elements.batch.value = "";
                    elements.programHint.textContent = "That batch is no longer available. Choose another.";
                }
            }

        } catch (error) {
            console.error("[apply] availability refresh failed", error);
            elements.programHint.textContent = "Could not check availability. Showing the last known list.";
        }
    }

    // ---------- Validation ----------

    function fieldWrap(input) {
        return input.closest(".field");
    }

    function setFieldError(input, message) {
        const wrap = fieldWrap(input);

        if (!wrap) return;

        input.setAttribute("aria-invalid", "true");

        let error = wrap.querySelector(".field__error");

        if (!error) {
            error = document.createElement("p");
            error.className = "field__error";
            wrap.append(error);
        }

        error.textContent = message;
    }

    function clearFieldErrors() {
        document.querySelectorAll(".wizard__step .field__error").forEach(error => {
            error.remove();
        });

        document.querySelectorAll(".wizard__step [aria-invalid]").forEach(field => {
            field.removeAttribute("aria-invalid");
        });
    }

    function validateStep(step) {
        clearFieldErrors();

        let valid = true;

        const requireText = (id, message) => {
            const field = document.getElementById(id);

            if (!field.value.trim()) {
                setFieldError(field, message);
                valid = false;
            }
        };

        if (step === 1) {
            requireText("firstName", "Enter your first name.");
            requireText("lastName", "Enter your last name.");

            const email = document.getElementById("email");

            if (!EMAIL_REGEX.test(email.value.trim())) {
                setFieldError(email, "Enter a valid email address.");
                valid = false;
            }

            const phone = document.getElementById("phone");

            if (!PHONE_REGEX.test(phone.value.trim())) {
                setFieldError(phone, "Enter a valid phone number.");
                valid = false;
            }

            requireText("address", "Enter your address.");
        }

        if (step === 2) {
            const dateOfBirth = document.getElementById("dateOfBirth");
            const parsed = new Date(dateOfBirth.value);

            if (!dateOfBirth.value || Number.isNaN(parsed.getTime()) || parsed.getTime() > Date.now()) {
                setFieldError(dateOfBirth, "Enter a valid date of birth.");
                valid = false;
            } else {
                const now = new Date();
                let age = now.getFullYear() - parsed.getFullYear();
                const monthDiff = now.getMonth() - parsed.getMonth();

                if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < parsed.getDate())) {
                    age -= 1;
                }

                if (age < 18) {
                    setFieldError(dateOfBirth, "Applicants must be 18 years or older.");
                    valid = false;
                }
            }

            ["sex", "civilStatus", "highestEducation"].forEach(id => {
                const field = document.getElementById(id);

                if (!field.value) {
                    setFieldError(field, "Choose an option.");
                    valid = false;
                }
            });

            requireText("schoolAttended", "Enter the school you attended.");
        }

        if (step === 3) {
            requireText("emergencyContactName", "Enter the contact's name.");
            requireText("emergencyContactRelationship", "Enter the relationship.");

            const emergencyPhone = document.getElementById("emergencyContactPhone");

            if (!PHONE_REGEX.test(emergencyPhone.value.trim())) {
                setFieldError(emergencyPhone, "Enter a valid contact number.");
                valid = false;
            }
        }

        if (step === 4) {
            const program = state.programs.find(
                item => item._id === elements.program.value
            );

            if (!elements.program.value) {
                setFieldError(elements.program, "Choose a program.");
                valid = false;
            } else if (!program || !program.batches.length) {
                setFieldError(elements.program, "That program is no longer available.");
                valid = false;
            } else if (!elements.batch.value) {
                const hasAvailable = program.batches.some(
                    batch => batch.filledCount < batch.slotCapacity
                );

                setFieldError(
                    elements.batch,
                    hasAvailable ? "Choose a batch." : "Choose an available batch."
                );
                valid = false;
            } else {
                const batch = program.batches.find(
                    item => item._id === elements.batch.value
                );

                if (!batch || batch.filledCount >= batch.slotCapacity) {
                    setFieldError(elements.batch, "Choose an available batch.");
                    valid = false;
                }
            }

            const acknowledgment = document.getElementById("acknowledgedTruthful");

            if (!acknowledgment.checked) {
                setFieldError(acknowledgment, "Please confirm that the information is true.");
                valid = false;
            }
        }

        return valid;
    }

    // ---------- Review ----------

    function addFactRow(list, label, value) {
        const row = document.createElement("div");
        const term = document.createElement("dt");
        const detail = document.createElement("dd");

        term.textContent = label;
        detail.textContent = value || "—";

        row.append(term, detail);
        list.append(row);
    }

    function addReviewGroup(title, step, rows) {
        const group = document.createElement("div");
        group.className = "review__group";

        const head = document.createElement("div");
        head.className = "review__group-head";

        const heading = document.createElement("h3");
        heading.textContent = title;

        const edit = document.createElement("button");
        edit.type = "button";
        edit.className = "text-link";
        edit.textContent = "Edit";
        edit.addEventListener("click", () => goToStep(step));

        head.append(heading, edit);

        const list = document.createElement("dl");
        list.className = "facts";

        rows.forEach(row => addFactRow(list, row.label, row.value));

        group.append(head, list);
        elements.review.append(group);
    }

    function valueOf(id) {
        const field = document.getElementById(id);
        return field ? field.value.trim() : "";
    }

    function buildReview() {
        elements.review.innerHTML = "";

        addReviewGroup("Applicant details", 1, [
            { label: "Name", value: `${valueOf("firstName")} ${valueOf("lastName")}`.trim() },
            { label: "Email", value: valueOf("email") },
            { label: "Phone", value: valueOf("phone") },
            { label: "Address", value: valueOf("address") }
        ]);

        addReviewGroup("Background", 2, [
            { label: "Date of birth", value: formatDate(valueOf("dateOfBirth")) },
            { label: "Sex", value: valueOf("sex") },
            { label: "Civil status", value: valueOf("civilStatus") },
            { label: "Highest education", value: valueOf("highestEducation") },
            { label: "School attended", value: valueOf("schoolAttended") }
        ]);

        addReviewGroup("Emergency contact", 3, [
            { label: "Contact name", value: valueOf("emergencyContactName") },
            { label: "Contact phone", value: valueOf("emergencyContactPhone") },
            { label: "Relationship", value: valueOf("emergencyContactRelationship") }
        ]);

        const program = state.programs.find(item => item._id === elements.program.value);
        const batch = program
            ? program.batches.find(item => item._id === elements.batch.value)
            : null;

        addReviewGroup("Training choice", 4, [
            { label: "Program", value: program ? program.name : "" },
            { label: "Batch", value: batch ? batch.label : "" }
        ]);

        if (valueOf("motivation")) {
            addReviewGroup("Motivation", 4, [
                { label: "Statement", value: valueOf("motivation") }
            ]);
        }
    }

    // ---------- Status rendering ----------

    const STATUS_STYLES = {
        "Submitted": { label: "Submitted", className: "submitted" },
        "Under review": { label: "Under review", className: "under-review" },
        "Approved": { label: "Approved", className: "approved" },
        "Rejected": { label: "Rejected", className: "rejected" },
        "Withdrawn": { label: "Withdrawn", className: "withdrawn" }
    };

    function setStatusMessage(title, text) {
        elements.statusMessageTitle.textContent = title;
        elements.statusMessageText.textContent = text;
        elements.statusMessage.hidden = false;
    }

    function showStatus() {
        const application = state.application;
        const messageEmail = (state.identity && state.identity.user.email) || "your email";

        elements.statusBadge.hidden = !application;
        elements.statusFacts.hidden = !application;

        if (application) {
            const style = STATUS_STYLES[application.status] || STATUS_STYLES.Submitted;

            elements.statusBadge.textContent = style.label;
            elements.statusBadge.className = `status-badge ${style.className}`;

            elements.statusProgram.textContent = application.program
                ? application.program.name
                : "—";
            elements.statusBatch.textContent = application.batch
                ? application.batch.label
                : "—";
            elements.statusSubmitted.textContent = formatDate(application.submittedAt);
            elements.statusDecided.textContent = application.decidedAt
                ? formatDate(application.decidedAt)
                : "Not decided yet";

            elements.statusNote.textContent = application.publicNote || "";
            elements.statusNoteRow.hidden = !application.publicNote;
        }

        elements.statusMessage.hidden = true;
        elements.withdrawBtn.hidden = true;
        elements.applyAgainBtn.hidden = true;

        if (state.reason === "already_enrolled") {
            setStatusMessage(
                "You are enrolled",
                `Your enrollment is already active${
                    application && application.program ? ` in ${application.program.name}` : ""
                }. There is no need to apply again.`
            );
        } else if (state.reason === "completed") {
            setStatusMessage(
                "Training completed",
                "Your training is complete, so applications are closed for this account."
            );
        } else if (state.reason === "account_inactive") {
            setStatusMessage(
                "Account inactive",
                "This account cannot submit applications. Please contact the administrator."
            );
        } else if (application && application.status === "Submitted") {
            setStatusMessage(
                "Application received",
                state.justSubmitted
                    ? `Your application is under review. We'll email you at ${messageEmail}.`
                    : `Your application is under review. We'll email you at ${messageEmail} once a decision is made.`
            );
        } else if (application && application.status === "Under review") {
            setStatusMessage(
                "Application under review",
                `The training office is reviewing your application. The decision will be emailed to ${messageEmail}.`
            );
        } else if (application && application.status === "Approved") {
            setStatusMessage(
                "Application approved",
                "Your enrollment is active. Next step: pay the training fee at the portal and wait for schedule details from the training office."
            );
        } else if (application && application.status === "Rejected") {
            setStatusMessage(
                "Application not approved",
                application.publicNote
                    ? "Read the message from the training office, then apply again when you are ready."
                    : "You can submit a new application when you are ready."
            );
        } else if (application && application.status === "Withdrawn") {
            setStatusMessage(
                "Application withdrawn",
                "This application is closed. You can submit a new application when you are ready."
            );
        } else {
            setStatusMessage(
                "No application yet",
                "Submit your details to apply for an open training program."
            );
        }

        if (application && ["Submitted", "Under review"].includes(application.status)) {
            elements.withdrawBtn.hidden = false;
        }

        if (
            state.canApply &&
            application &&
            ["Rejected", "Withdrawn"].includes(application.status)
        ) {
            elements.applyAgainBtn.hidden = false;
        }

        showOnly(elements.status);
    }

    function render() {
        if (!state.loaded) return;

        elements.submitError.hidden = true;

        if (state.canApply && !state.application) {
            showWizard();
            return;
        }

        if (state.canApply && state.application && ["Rejected", "Withdrawn"].includes(state.application.status)) {
            showStatus();
            return;
        }

        if (!state.canApply) {
            showStatus();
            return;
        }

        showWizard();
    }

    function showWizard() {
        if (!listedPrograms().length) {
            showNotice(
                "Applications are closed right now.",
                "There are no open batches accepting applications. Check back with the training office."
            );
            return;
        }

        const previousBatch = elements.batch.value;

        renderProgramOptions();
        fillBatchOptions(elements.program.value, previousBatch);

        elements.wizard.hidden = false;
        elements.notice.hidden = true;
        elements.status.hidden = true;
        elements.loading.hidden = true;

        prefillContactFields();
        updateWizardChrome();
    }

    async function refresh() {
        try {
            await loadApplicationState();
            render();
        } catch (error) {
            console.error("Application load error:", error);
            showNotice(
                "We could not load your application.",
                error.message || "Check your connection and try again.",
                true
            );
        }
    }

    // ---------- Events ----------

    elements.program.addEventListener("change", () => {
        fillBatchOptions(elements.program.value);
    });

    elements.motivation.addEventListener("input", () => {
        elements.motivationCount.textContent = String(elements.motivation.value.length);
    });

    elements.nextBtn.addEventListener("click", () => {
        if (!validateStep(state.step)) return;

        goToStep(state.step + 1);
    });

    elements.backBtn.addEventListener("click", () => {
        goToStep(state.step - 1);
    });

    elements.applyAgainBtn.addEventListener("click", () => {
        state.application = null;
        elements.motivation.value = "";
        elements.motivationCount.textContent = "0";
        document.getElementById("acknowledgedTruthful").checked = false;
        elements.program.value = "";
        fillBatchOptions("");
        goToStep(1);
        showWizard();
    });

    elements.withdrawBtn.addEventListener("click", async () => {
        if (!state.application) return;

        const confirmed = confirm(
            "Withdraw this application? You can submit a new one afterwards."
        );

        if (!confirmed) return;

        elements.withdrawBtn.disabled = true;

        try {
            await api(`/applications/${state.application._id}/withdraw`, {
                method: "POST"
            });

            state.justSubmitted = false;
            await refresh();
        } catch (error) {
            alert(error.message || "Unable to withdraw this application.");
        } finally {
            elements.withdrawBtn.disabled = false;
        }
    });

    elements.noticeRetry.addEventListener("click", refresh);

    elements.form.addEventListener("submit", async event => {
        event.preventDefault();

        if (state.step !== 5) return;

        for (let step = 1; step <= 4; step += 1) {
            if (!validateStep(step)) {
                goToStep(step);
                return;
            }
        }

        const payload = {
            firstName: valueOf("firstName"),
            lastName: valueOf("lastName"),
            email: valueOf("email"),
            phone: valueOf("phone"),
            address: valueOf("address"),
            dateOfBirth: valueOf("dateOfBirth"),
            sex: valueOf("sex"),
            civilStatus: valueOf("civilStatus"),
            highestEducation: valueOf("highestEducation"),
            schoolAttended: valueOf("schoolAttended"),
            emergencyContactName: valueOf("emergencyContactName"),
            emergencyContactPhone: valueOf("emergencyContactPhone"),
            emergencyContactRelationship: valueOf("emergencyContactRelationship"),
            program: elements.program.value,
            batch: elements.batch.value,
            motivation: elements.motivation.value.trim(),
            acknowledgedTruthful: document.getElementById("acknowledgedTruthful").checked
        };

        elements.submitError.hidden = true;
        elements.submitBtn.disabled = true;
        elements.submitBtn.textContent = "Submitting…";

        try {
            await api("/applications", {
                method: "POST",
                body: JSON.stringify(payload)
            });

            state.justSubmitted = true;

            window.history.replaceState({}, "", "apply.html?submitted=1");

            await loadApplicationState();
            showStatus();
        } catch (error) {
            elements.submitError.textContent = error.message || "Unable to submit your application. Please try again.";
            elements.submitError.hidden = false;
        } finally {
            elements.submitBtn.disabled = false;
            elements.submitBtn.textContent = "Submit application";
        }
    });

    // Clear a field's error as soon as the trainee edits it.
    elements.form.addEventListener("input", event => {
        const field = event.target;

        if (!field.matches("input, select, textarea")) return;

        field.removeAttribute("aria-invalid");

        const wrap = fieldWrap(field);
        const error = wrap ? wrap.querySelector(".field__error") : null;

        if (error) error.remove();
    });

    // ---------- Init ----------

    if (new URLSearchParams(window.location.search).get("submitted") === "1") {
        state.justSubmitted = true;
    }

    refresh();
})();
