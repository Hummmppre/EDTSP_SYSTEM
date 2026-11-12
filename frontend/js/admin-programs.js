// =============================
// EDTSP ADMIN — PROGRAMS AND BATCHES
// =============================

document.addEventListener("DOMContentLoaded", () => {
    const API_BASE = "http://localhost:5000/api";
    const token = localStorage.getItem("edtspToken");

    if (!token) return;

    const state = {
        programs: [],
        editingProgramId: null,
        batchProgramId: null,
        editingBatchId: null,
        editingBatchIntake: null
    };

    const elements = {
        list: document.getElementById("programList"),
        feedback: document.getElementById("programFeedback"),
        programCount: document.getElementById("programCount"),
        openBatchCount: document.getElementById("openBatchCount"),
        totalSlots: document.getElementById("totalSlots"),
        slotsRemaining: document.getElementById("slotsRemaining"),
        newProgramBtn: document.getElementById("newProgramBtn"),
        programModal: document.getElementById("programModal"),
        programModalTitle: document.getElementById("programModalTitle"),
        programForm: document.getElementById("programForm"),
        programName: document.getElementById("programName"),
        programDescription: document.getElementById("programDescription"),
        programFee: document.getElementById("programFee"),
        programStatusField: document.getElementById("programStatusField"),
        programStatus: document.getElementById("programStatus"),
        firstBatchFields: document.getElementById("firstBatchFields"),
        firstBatchLabel: document.getElementById("firstBatchLabel"),
        firstBatchCapacity: document.getElementById("firstBatchCapacity"),
        firstBatchIntake: document.getElementById("firstBatchIntake"),
        programError: document.getElementById("programError"),
        saveProgram: document.getElementById("saveProgram"),
        closeProgram: document.getElementById("closeProgramModal"),
        cancelProgram: document.getElementById("cancelProgram"),
        batchModal: document.getElementById("batchModal"),
        batchModalTitle: document.getElementById("batchModalTitle"),
        batchModalSubtitle: document.getElementById("batchModalSubtitle"),
        batchForm: document.getElementById("batchForm"),
        batchLabel: document.getElementById("batchLabel"),
        batchCapacity: document.getElementById("batchCapacity"),
        batchIntake: document.getElementById("batchIntake"),
        batchStatusField: document.getElementById("batchStatusField"),
        batchStatus: document.getElementById("batchStatus"),
        batchError: document.getElementById("batchError"),
        saveBatch: document.getElementById("saveBatch"),
        closeBatch: document.getElementById("closeBatchModal"),
        cancelBatch: document.getElementById("cancelBatch")
    };

    function formatDate(value) {
        if (!value) return "";

        const date = new Date(value);

        if (Number.isNaN(date.getTime())) return "";

        return date.toLocaleDateString("en-PH", {
            year: "numeric",
            month: "short",
            day: "numeric"
        });
    }

    function formatMoney(value) {
        return `₱${Number(value || 0).toLocaleString("en-PH")}`;
    }

    function todayKey() {
        const now = new Date();
        const month = String(now.getMonth() + 1).padStart(2, "0");
        const day = String(now.getDate()).padStart(2, "0");

        return `${now.getFullYear()}-${month}-${day}`;
    }

    function visibilityFor(program) {
        if (program.status !== "Open") {
            return {
                label: "Hidden — program closed",
                className: "closed",
                note: "Reopen the program and one of its batches to accept applications."
            };
        }

        const openBatches = (program.batches || []).filter(
            batch => batch.status === "Open"
        );

        if (!openBatches.length) {
            return {
                label: "Hidden — no open batch",
                className: "closed",
                note: "Add an open batch so trainees can apply."
            };
        }

        const hasSpace = openBatches.some(
            batch => batch.filledCount < batch.slotCapacity
        );

        return hasSpace
            ? { label: "Accepting applications", className: "open", note: "" }
            : {
                label: "Listed — all batches full",
                className: "full",
                note: "Trainees can see this program but cannot choose a batch."
            };
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

    // ---------- Rendering ----------

    function renderSummary() {
        const batches = state.programs.flatMap(program => program.batches);

        elements.programCount.textContent = String(state.programs.length);
        elements.openBatchCount.textContent = String(
            batches.filter(
                batch => batch.status === "Open" && batch.filledCount < batch.slotCapacity
            ).length
        );
        elements.totalSlots.textContent = String(
            batches.reduce((sum, batch) => sum + batch.slotCapacity, 0)
        );
        elements.slotsRemaining.textContent = String(
            batches.reduce(
                (sum, batch) => sum + Math.max(batch.slotCapacity - batch.filledCount, 0),
                0
            )
        );
    }

    function makeBadge(label, className) {
        const badge = document.createElement("span");

        badge.className = `status-badge ${className}`;
        badge.textContent = label;

        return badge;
    }

    function renderBatchRow(program, batch) {
        const row = document.createElement("li");
        row.className = "batch-row";

        const info = document.createElement("div");
        const label = document.createElement("strong");
        const meta = document.createElement("span");

        label.textContent = batch.label;
        meta.className = "batch-meta";
        meta.textContent = [
            batch.intakeDate ? `Intake ${formatDate(batch.intakeDate)}` : "No intake date",
            `${batch.filledCount} of ${batch.slotCapacity} filled`,
            `${Math.max(batch.slotCapacity - batch.filledCount, 0)} remaining`
        ].join(" · ");

        info.append(label, document.createElement("br"), meta);

        const actions = document.createElement("div");
        actions.className = "batch-actions";

        actions.append(
            makeBadge(
                batch.status,
                batch.status === "Open" ? "open" : "closed"
            )
        );

        const edit = document.createElement("button");
        edit.type = "button";
        edit.className = "row-action";
        edit.textContent = "Edit";
        edit.addEventListener("click", () => openEditBatch(program, batch));
        actions.append(edit);

        row.append(info, actions);

        return row;
    }

    function renderProgram(program) {
        const panel = document.createElement("section");
        panel.className = "panel";

        const head = document.createElement("header");
        head.className = "panel__head";

        const title = document.createElement("h2");
        title.textContent = program.name;

        const visibility = visibilityFor(program);

        head.append(title, makeBadge(visibility.label, visibility.className));

        const body = document.createElement("div");
        body.className = "panel__body";

        const description = document.createElement("p");
        description.className = "field__hint";
        description.textContent = program.description;

        const facts = document.createElement("dl");
        facts.className = "facts";

        [
            ["Training fee", formatMoney(program.fee)],
            ["Batches", String(program.batches.length)],
            [
                "Slots",
                `${program.slotsRemaining} remaining of ${program.totalSlots}`
            ]
        ].forEach(([label, value]) => {
            const row = document.createElement("div");
            const term = document.createElement("dt");
            const detail = document.createElement("dd");

            term.textContent = label;
            detail.textContent = value;

            row.append(term, detail);
            facts.append(row);
        });

        const batchList = document.createElement("ul");
        batchList.className = "batch-list";

        if (program.batches.length) {
            program.batches.forEach(batch => {
                batchList.append(renderBatchRow(program, batch));
            });
        } else {
            const empty = document.createElement("li");
            empty.className = "batch-meta";
            empty.textContent = "No batches yet. Applicants cannot choose this program until a batch is open.";
            batchList.append(empty);
        }

        const actions = document.createElement("div");
        actions.className = "batch-actions";

        const editProgram = document.createElement("button");
        editProgram.type = "button";
        editProgram.className = "btn btn--ghost";
        editProgram.textContent = "Edit program";
        editProgram.addEventListener("click", () => openEditProgram(program));

        const addBatch = document.createElement("button");
        addBatch.type = "button";
        addBatch.className = "btn btn--ghost";
        addBatch.textContent = "Add batch";
        addBatch.addEventListener("click", () => openNewBatch(program));

        actions.append(editProgram, addBatch);

        body.append(description);

        if (visibility.note) {
            const note = document.createElement("p");
            note.className = "field__hint";
            note.textContent = visibility.note;
            body.append(note);
        }

        body.append(facts, batchList, actions);
        panel.append(head, body);

        return panel;
    }

    function render() {
        elements.list.innerHTML = "";

        if (!state.programs.length) {
            const panel = document.createElement("section");
            panel.className = "panel";
            const stateBlock = document.createElement("div");
            stateBlock.className = "state";

            const title = document.createElement("strong");
            title.textContent = "No programs yet";

            const text = document.createElement("p");
            text.textContent = "Create a program, then add at least one open batch before trainees can apply.";

            stateBlock.append(title, text);
            panel.append(stateBlock);
            elements.list.append(panel);

            return;
        }

        state.programs.forEach(program => {
            elements.list.append(renderProgram(program));
        });
    }

    // ---------- Program modal ----------

    function openProgramModal() {
        elements.programModal.classList.add("show");
        document.body.classList.add("modal-open");
        elements.programError.hidden = true;
        elements.programName.focus();
    }

    function closeProgramModal() {
        elements.programModal.classList.remove("show");
        document.body.classList.remove("modal-open");
        state.editingProgramId = null;
    }

    function openNewProgram() {
        elements.programForm.reset();
        elements.programModalTitle.textContent = "New program";
        elements.programStatusField.hidden = true;
        elements.firstBatchFields.hidden = false;
        elements.firstBatchLabel.value = "Batch 1";
        elements.firstBatchCapacity.value = "";
        elements.firstBatchIntake.value = "";
        elements.firstBatchIntake.min = todayKey();
        elements.saveProgram.textContent = "Create program & batch";
        openProgramModal();
    }

    function openEditProgram(program) {
        state.editingProgramId = program._id;

        elements.programModalTitle.textContent = "Edit program";
        elements.programName.value = program.name;
        elements.programDescription.value = program.description;
        elements.programFee.value = program.fee;
        elements.programStatus.value = program.status;
        elements.programStatusField.hidden = false;
        elements.firstBatchFields.hidden = true;
        elements.firstBatchIntake.removeAttribute("min");
        elements.saveProgram.textContent = "Save program";

        openProgramModal();
    }

    async function saveProgram() {
        const isCreate = !state.editingProgramId;
        const name = elements.programName.value.trim();
        const description = elements.programDescription.value.trim();
        const fee = Number(elements.programFee.value);
        const firstLabel = elements.firstBatchLabel.value.trim();
        const firstCapacity = Number(elements.firstBatchCapacity.value);
        const firstIntake = elements.firstBatchIntake.value;

        const showError = message => {
            elements.programError.textContent = message;
            elements.programError.hidden = false;
        };

        if (!name || !description) {
            showError("Provide a program name and description.");
            return;
        }

        if (!Number.isFinite(fee) || fee < 0) {
            showError("Provide a valid training fee.");
            return;
        }

        if (isCreate) {
            if (!firstLabel) {
                showError("Provide a batch label.");
                elements.firstBatchLabel.focus();
                return;
            }

            if (!Number.isInteger(firstCapacity) || firstCapacity < 1) {
                showError("Slot capacity must be a whole number of at least 1.");
                elements.firstBatchCapacity.focus();
                return;
            }

            if (firstIntake && firstIntake < todayKey()) {
                showError("Intake date cannot be in the past.");
                elements.firstBatchIntake.focus();
                return;
            }
        }

        const payload = { name, description, fee };

        if (isCreate) {
            payload.firstBatch = {
                label: firstLabel,
                slotCapacity: firstCapacity,
                intakeDate: firstIntake || null
            };
        } else {
            payload.status = elements.programStatus.value;
        }

        elements.programError.hidden = true;
        elements.saveProgram.disabled = true;
        elements.saveProgram.textContent = "Saving…";

        try {
            if (isCreate) {
                await api("/admin/programs", {
                    method: "POST",
                    body: JSON.stringify(payload)
                });
            } else {
                await api(`/admin/programs/${state.editingProgramId}`, {
                    method: "PATCH",
                    body: JSON.stringify(payload)
                });
            }

            closeProgramModal();
            await loadPrograms();
            setFeedback(isCreate ? "Program and first batch saved." : "Program saved.");

        } catch (error) {
            showError(error.message || "Unable to save this program.");
        } finally {
            elements.saveProgram.disabled = false;
            elements.saveProgram.textContent = isCreate ? "Create program & batch" : "Save program";
        }
    }

    // ---------- Batch modal ----------

    function openBatchModal() {
        elements.batchModal.classList.add("show");
        document.body.classList.add("modal-open");
        elements.batchError.hidden = true;
        elements.batchLabel.focus();
    }

    function closeBatchModal() {
        elements.batchModal.classList.remove("show");
        document.body.classList.remove("modal-open");
        state.batchProgramId = null;
        state.editingBatchId = null;
        state.editingBatchIntake = null;
    }

    function openNewBatch(program) {
        state.batchProgramId = program._id;
        state.editingBatchIntake = null;

        elements.batchForm.reset();
        elements.batchModalTitle.textContent = "New batch";
        elements.batchModalSubtitle.textContent = program.name;
        elements.batchStatusField.hidden = true;
        elements.batchIntake.min = todayKey();
        elements.saveBatch.textContent = "Create batch";

        openBatchModal();
    }

    function openEditBatch(program, batch) {
        state.batchProgramId = program._id;
        state.editingBatchId = batch._id;
        state.editingBatchIntake = batch.intakeDate
            ? new Date(batch.intakeDate).toISOString().slice(0, 10)
            : null;

        elements.batchModalTitle.textContent = "Edit batch";
        elements.batchModalSubtitle.textContent = program.name;
        elements.batchLabel.value = batch.label;
        elements.batchCapacity.value = batch.slotCapacity;
        elements.batchIntake.value = state.editingBatchIntake || "";
        elements.batchIntake.removeAttribute("min");
        elements.batchStatus.value = batch.status;
        elements.batchStatusField.hidden = false;
        elements.saveBatch.textContent = "Save batch";

        openBatchModal();
    }

    async function saveBatch() {
        const label = elements.batchLabel.value.trim();
        const capacity = Number(elements.batchCapacity.value);

        if (!label) {
            elements.batchError.textContent = "Provide a batch label.";
            elements.batchError.hidden = false;
            return;
        }

        if (!Number.isInteger(capacity) || capacity < 1) {
            elements.batchError.textContent = "Slot capacity must be a whole number of at least 1.";
            elements.batchError.hidden = false;
            return;
        }

        const intake = elements.batchIntake.value;

        if (intake && intake < todayKey() && intake !== state.editingBatchIntake) {
            elements.batchError.textContent = "Intake date cannot be in the past.";
            elements.batchError.hidden = false;
            return;
        }

        const payload = {
            label,
            slotCapacity: capacity,
            intakeDate: intake || null
        };

        if (state.editingBatchId) {
            payload.status = elements.batchStatus.value;
        }

        elements.batchError.hidden = true;
        elements.saveBatch.disabled = true;

        try {
            const data = state.editingBatchId
                ? await api(`/admin/batches/${state.editingBatchId}`, {
                    method: "PATCH",
                    body: JSON.stringify(payload)
                })
                : await api(`/admin/programs/${state.batchProgramId}/batches`, {
                    method: "POST",
                    body: JSON.stringify(payload)
                });

            const feedback = data.message && data.message.includes("Reopen the program")
                ? data.message
                : "Batch saved.";

            closeBatchModal();
            await loadPrograms();
            setFeedback(feedback);

        } catch (error) {
            elements.batchError.textContent = error.message || "Unable to save this batch.";
            elements.batchError.hidden = false;
        } finally {
            elements.saveBatch.disabled = false;
        }
    }

    // ---------- Load ----------

    async function loadPrograms() {
        const data = await api("/admin/programs");

        state.programs = data.programs || [];

        renderSummary();
        render();
    }

    async function init() {
        try {
            await loadPrograms();
        } catch (error) {
            elements.list.innerHTML = "";
            setFeedback(error.message || "Unable to load programs.");
        }
    }

    // ---------- Events ----------

    elements.newProgramBtn.addEventListener("click", openNewProgram);
    elements.saveProgram.addEventListener("click", saveProgram);
    elements.closeProgram.addEventListener("click", closeProgramModal);
    elements.cancelProgram.addEventListener("click", closeProgramModal);

    elements.saveBatch.addEventListener("click", saveBatch);
    elements.closeBatch.addEventListener("click", closeBatchModal);
    elements.cancelBatch.addEventListener("click", closeBatchModal);

    elements.programModal.addEventListener("click", event => {
        if (event.target === elements.programModal) closeProgramModal();
    });

    elements.batchModal.addEventListener("click", event => {
        if (event.target === elements.batchModal) closeBatchModal();
    });

    document.addEventListener("keydown", event => {
        if (event.key !== "Escape") return;

        if (elements.programModal.classList.contains("show")) closeProgramModal();
        if (elements.batchModal.classList.contains("show")) closeBatchModal();
    });

    init();
});
