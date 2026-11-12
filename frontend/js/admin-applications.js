// =============================
// EDTSP ADMIN — TRAINING APPLICATIONS
// =============================

document.addEventListener("DOMContentLoaded", () => {
    const API_BASE = "http://localhost:5000/api";
    const token = localStorage.getItem("edtspToken");

    if (!token) return;

    const STATUS_STYLES = {
        "Submitted": { label: "Submitted", className: "submitted" },
        "Under review": { label: "Under review", className: "under-review" },
        "Approved": { label: "Approved", className: "approved" },
        "Rejected": { label: "Rejected", className: "rejected" },
        "Withdrawn": { label: "Withdrawn", className: "withdrawn" }
    };

    const state = {
        applications: [],
        programs: [],
        selected: null
    };

    const elements = {
        rows: document.getElementById("applicationRows"),
        empty: document.getElementById("applicationEmpty"),
        meta: document.getElementById("applicationsMeta"),
        feedback: document.getElementById("applicationFeedback"),
        search: document.getElementById("applicationSearch"),
        status: document.getElementById("applicationStatusFilter"),
        exportBtn: document.getElementById("exportBtn"),
        pending: document.getElementById("pendingCount"),
        approved: document.getElementById("approvedCount"),
        rejected: document.getElementById("rejectedCount"),
        openBatches: document.getElementById("openBatchCount"),
        modal: document.getElementById("applicationModal"),
        modalTitle: document.getElementById("applicationModalTitle"),
        modalSubtitle: document.getElementById("applicationModalSubtitle"),
        detailFacts: document.getElementById("applicationDetailFacts"),
        priorWrap: document.getElementById("applicationPriorWrap"),
        prior: document.getElementById("applicationPrior"),
        form: document.getElementById("decisionForm"),
        publicNote: document.getElementById("decisionPublicNote"),
        internalNote: document.getElementById("decisionInternalNote"),
        error: document.getElementById("decisionError"),
        confirm: document.getElementById("confirmDecision"),
        cancel: document.getElementById("cancelDecision"),
        close: document.getElementById("closeApplicationModal")
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

    function setFeedback(message) {
        elements.feedback.textContent = message || "";
        elements.feedback.hidden = !message;
    }

    async function api(path, options = {}) {
        const response = await fetch(`${API_BASE}${path}`, {
            ...options,
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`,
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

    // ---------- Ledger ----------

    function renderLedger() {
        const counts = state.applications.reduce(
            (total, application) => {
                if (["Submitted", "Under review"].includes(application.status)) {
                    total.pending += 1;
                } else if (application.status === "Approved") {
                    total.approved += 1;
                } else if (application.status === "Rejected") {
                    total.rejected += 1;
                }

                return total;
            },
            { pending: 0, approved: 0, rejected: 0 }
        );

        elements.pending.textContent = String(counts.pending);
        elements.approved.textContent = String(counts.approved);
        elements.rejected.textContent = String(counts.rejected);

        const openBatches = state.programs.reduce(
            (total, program) =>
                total +
                program.batches.filter(
                    batch => batch.status === "Open" && batch.filledCount < batch.slotCapacity
                ).length,
            0
        );

        elements.openBatches.textContent = String(openBatches);
    }

    // ---------- Table ----------

    function filteredApplications() {
        const search = elements.search.value.trim().toLowerCase();
        const status = elements.status.value;

        return state.applications.filter(application => {
            if (status !== "all" && application.status !== status) return false;

            if (!search) return true;

            const name = `${application.firstName} ${application.lastName}`.toLowerCase();

            return name.includes(search) || application.email.toLowerCase().includes(search);
        });
    }

    function statusBadge(status) {
        const style = STATUS_STYLES[status] || STATUS_STYLES.Submitted;
        const badge = document.createElement("span");

        badge.className = `status-badge ${style.className}`;
        badge.textContent = style.label;

        return badge;
    }

    function renderTable() {
        const applications = filteredApplications();

        elements.rows.innerHTML = "";

        if (!state.applications.length) {
            elements.empty.textContent = "No applications have been submitted yet.";
            elements.empty.hidden = false;
            elements.meta.textContent = "0 records";
            return;
        }

        elements.empty.hidden = applications.length > 0;
        elements.empty.textContent = "No applications match this status and search.";
        elements.meta.textContent = `${applications.length} of ${state.applications.length} records`;

        applications.forEach(application => {
            const row = document.createElement("tr");

            const applicantCell = document.createElement("td");
            const name = document.createElement("span");
            const email = document.createElement("span");

            name.className = "name";
            name.textContent = `${application.firstName} ${application.lastName}`;
            email.className = "sub";
            email.textContent = application.email;
            applicantCell.append(name, email);

            const programCell = document.createElement("td");
            programCell.textContent = [
                application.program ? application.program.name : "—",
                application.batch ? application.batch.label : ""
            ].filter(Boolean).join(" · ");

            const submittedCell = document.createElement("td");
            submittedCell.textContent = formatDate(application.submittedAt);

            const statusCell = document.createElement("td");
            statusCell.append(statusBadge(application.status));

            const actionCell = document.createElement("td");
            const review = document.createElement("button");

            review.type = "button";
            review.className = "row-action";
            review.textContent = ["Submitted", "Under review"].includes(application.status)
                ? "Review"
                : "View";
            review.addEventListener("click", () => openApplication(application._id));
            actionCell.append(review);

            row.append(applicantCell, programCell, submittedCell, statusCell, actionCell);
            elements.rows.append(row);
        });
    }

    // ---------- Detail ----------

    function addFact(label, value) {
        const row = document.createElement("div");
        const term = document.createElement("dt");
        const detail = document.createElement("dd");

        term.textContent = label;
        detail.textContent = value === undefined || value === null || value === ""
            ? "—"
            : String(value);

        row.append(term, detail);
        elements.detailFacts.append(row);
    }

    function resetDecisionForm(status) {
        elements.form.reset();
        elements.publicNote.value = "";
        elements.internalNote.value = "";
        elements.error.hidden = true;

        const decidable = ["Submitted", "Under review"].includes(status);

        elements.form.hidden = !decidable;
        elements.confirm.hidden = !decidable;
        elements.cancel.hidden = !decidable;

        if (!decidable) {
            elements.error.textContent = "This application has already been decided or withdrawn.";
            elements.error.hidden = false;
        }

        elements.confirm.textContent = "Approve application";
    }

    async function openApplication(id) {
        try {
            const data = await api(`/admin/applications/${id}`);

            state.selected = data.application;

            const application = data.application;

            elements.modalTitle.textContent = `${application.firstName} ${application.lastName}`;
            elements.modalSubtitle.textContent = `${application.email} · ${
                STATUS_STYLES[application.status]
                    ? STATUS_STYLES[application.status].label
                    : application.status
            }`;

            elements.detailFacts.innerHTML = "";

            addFact("Applicant", `${application.firstName} ${application.lastName}`);
            addFact("Email", application.email);
            addFact("Phone", application.phone);
            addFact("Address", application.address);
            addFact("Date of birth", formatDate(application.dateOfBirth));
            addFact("Sex", application.sex);
            addFact("Civil status", application.civilStatus);
            addFact("Highest education", application.highestEducation);
            addFact("School attended", application.schoolAttended);
            addFact("Emergency contact", application.emergencyContactName);
            addFact("Emergency phone", application.emergencyContactPhone);
            addFact("Relationship", application.emergencyContactRelationship);
            addFact(
                "Program",
                application.program ? application.program.name : "—"
            );
            addFact(
                "Batch",
                application.batch
                    ? `${application.batch.label} · ${Math.max(
                        application.batch.slotCapacity - application.batch.filledCount,
                        0
                    )} slot(s) left`
                    : "—"
            );
            addFact("Motivation", application.motivation || "Not provided");
            addFact("Submitted", formatDate(application.submittedAt));
            addFact(
                "Decided",
                application.decidedAt ? formatDate(application.decidedAt) : "Not decided"
            );
            addFact("Public message", application.publicNote || "None");
            addFact("Internal note", application.internalNote || "None");

            elements.prior.innerHTML = "";
            elements.priorWrap.hidden = !data.previousApplications.length;

            data.previousApplications.forEach(previous => {
                const row = document.createElement("div");
                const term = document.createElement("dt");
                const detail = document.createElement("dd");

                term.textContent = previous.program ? previous.program.name : "Application";
                detail.textContent = `${previous.status} · ${formatDate(previous.submittedAt)}`;

                row.append(term, detail);
                elements.prior.append(row);
            });

            resetDecisionForm(application.status);

            elements.modal.classList.add("show");
            document.body.classList.add("modal-open");

            elements.close.focus();

        } catch (error) {
            setFeedback(error.message || "Unable to load this application.");
        }
    }

    function closeModal() {
        elements.modal.classList.remove("show");
        document.body.classList.remove("modal-open");
        state.selected = null;
    }

    // ---------- Decision ----------

    function currentDecision() {
        const checked = elements.form.querySelector("input[name=\"decision\"]:checked");
        return checked ? checked.value : "Approved";
    }

    function updateDecisionLabel() {
        elements.confirm.textContent = currentDecision() === "Approved"
            ? "Approve application"
            : "Reject application";
    }

    async function submitDecision() {
        if (!state.selected) return;

        const decision = currentDecision();
        const publicNote = elements.publicNote.value.trim();

        if (decision === "Rejected" && !publicNote) {
            elements.error.textContent = "Add a public message so the applicant knows why.";
            elements.error.hidden = false;
            elements.publicNote.focus();
            return;
        }

        elements.error.hidden = true;
        elements.confirm.disabled = true;
        elements.confirm.textContent = "Saving…";

        try {
            const data = await api(
                `/admin/applications/${state.selected._id}/decision`,
                {
                    method: "POST",
                    body: JSON.stringify({
                        decision,
                        publicNote,
                        internalNote: elements.internalNote.value.trim()
                    })
                }
            );

            closeModal();
            await loadData();

            setFeedback(
                data.mail && data.mail.sent
                    ? `${data.message} The applicant was emailed.`
                    : `${data.message} The decision email could not be sent; check the server log.`
            );

        } catch (error) {
            elements.error.textContent = error.message || "Unable to record this decision.";
            elements.error.hidden = false;
        } finally {
            elements.confirm.disabled = false;
            updateDecisionLabel();
        }
    }

    // ---------- Export ----------

    async function exportCsv() {
        const params = new URLSearchParams();

        if (elements.status.value !== "all") {
            params.set("status", elements.status.value);
        }

        const search = elements.search.value.trim();

        if (search) {
            params.set("search", search);
        }

        elements.exportBtn.disabled = true;

        try {
            const response = await fetch(
                `${API_BASE}/admin/applications/export?${params.toString()}`,
                { headers: { Authorization: `Bearer ${token}` } }
            );

            if (response.status === 401) {
                localStorage.removeItem("edtspToken");
                localStorage.removeItem("edtspUser");
                window.location.href = "../login.html";
                return;
            }

            if (!response.ok) {
                throw new Error("Unable to export applications.");
            }

            const blob = await response.blob();
            const url = URL.createObjectURL(blob);
            const link = document.createElement("a");

            link.href = url;
            link.download = `applications-${new Date().toISOString().slice(0, 10)}.csv`;

            document.body.append(link);
            link.click();
            link.remove();
            URL.revokeObjectURL(url);

        } catch (error) {
            setFeedback(error.message || "Unable to export applications.");
        } finally {
            elements.exportBtn.disabled = false;
        }
    }

    // ---------- Load ----------

    async function loadData() {
        const [applicationsData, programsData] = await Promise.all([
            api("/admin/applications"),
            api("/admin/programs")
        ]);

        state.applications = applicationsData.applications || [];
        state.programs = programsData.programs || [];

        renderLedger();
        renderTable();
    }

    async function init() {
        try {
            await loadData();
        } catch (error) {
            elements.rows.innerHTML = "";
            elements.empty.textContent = error.message || "Unable to load applications.";
            elements.empty.hidden = false;
            elements.meta.textContent = "Unavailable";
        }
    }

    // ---------- Events ----------

    elements.search.addEventListener("input", renderTable);
    elements.status.addEventListener("change", renderTable);
    elements.exportBtn.addEventListener("click", exportCsv);
    elements.confirm.addEventListener("click", submitDecision);
    elements.cancel.addEventListener("click", closeModal);
    elements.close.addEventListener("click", closeModal);

    elements.form.addEventListener("change", event => {
        if (event.target.name === "decision") {
            updateDecisionLabel();
        }
    });

    elements.modal.addEventListener("click", event => {
        if (event.target === elements.modal) {
            closeModal();
        }
    });

    document.addEventListener("keydown", event => {
        if (event.key === "Escape" && elements.modal.classList.contains("show")) {
            closeModal();
        }
    });

    init();
});
