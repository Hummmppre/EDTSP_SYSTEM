/**
 * Admin programs: fee configuration that drives every trainee balance.
 */
(function initAdminPrograms() {
    const user = window.EDTSP.session.requireRole("admin");
    if (!user) return;

    const { api, ui } = window.EDTSP;
    const {
        setText,
        formatMoney,
        state,
        element,
        debounce,
        pager,
        openModal,
        closeModal,
        fieldError,
        clearFieldErrors,
        setFormState
    } = ui;

    const body = document.getElementById("programTableBody");
    const pagerHost = document.getElementById("programPager");
    const listState = document.getElementById("programState");
    const searchInput = document.getElementById("programSearch");
    const activeFilter = document.getElementById("programActiveFilter");

    const modal = document.getElementById("programModal");
    const form = document.getElementById("programForm");
    const nameInput = document.getElementById("programName");
    const codeInput = document.getElementById("programCode");
    const feeInput = document.getElementById("programFee");
    const descriptionInput = document.getElementById("programDescription");
    const activeInput = document.getElementById("programActive");
    const deleteButton = document.getElementById("deleteProgramBtn");

    const filters = { page: 1, search: "", active: "all" };
    let editing = null;

    const renderRows = (programs) => {
        body.replaceChildren();

        if (programs.length === 0) {
            const row = document.createElement("tr");
            const cell = document.createElement("td");
            cell.colSpan = 6;
            state(cell, {
                tone: "empty",
                title: "No programs configured",
                message:
                    "Add a program to set the training fee that trainee balances are measured against."
            });
            row.append(cell);
            body.append(row);
            return;
        }

        programs.forEach((program) => {
            const row = document.createElement("tr");

            row.append(
                element("td", "id", program.code),
                element("td", "name", program.name),
                element("td", "num", formatMoney(program.totalFee)),
                element("td", "num", String(program.traineeCount || 0))
            );

            const active = document.createElement("td");
            active.append(
                statusOrBadge(program.active ? "Active" : "Inactive", program.active)
            );
            row.append(active);

            const actions = document.createElement("td");
            const edit = element("button", "row-action", "Edit");
            edit.type = "button";
            edit.addEventListener("click", () => openEditor(program));
            actions.append(edit);

            row.append(actions);
            body.append(row);
        });
    };

    const statusOrBadge = (label, isActive) => {
        const span = document.createElement("span");
        span.className = `status-badge ${isActive ? "completed" : "inactive"}`;
        span.textContent = label;
        return span;
    };

    const openEditor = (program) => {
        editing = program || null;

        clearFieldErrors(form);
        setFormState(form, {});

        setText("programModalTitle", editing ? "Edit program" : "New program");
        nameInput.value = editing ? editing.name : "";
        codeInput.value = editing ? editing.code : "";
        feeInput.value = editing ? editing.totalFee : 18000;
        descriptionInput.value = editing ? editing.description || "" : "";
        activeInput.checked = editing ? editing.active !== false : true;

        if (deleteButton) {
            const inUse = editing && editing.traineeCount > 0;
            deleteButton.hidden = !editing;
            deleteButton.disabled = Boolean(inUse);
            deleteButton.title = inUse
                ? `${editing.traineeCount} trainee(s) are still enrolled in this program.`
                : "";
        }

        openModal(modal, { initialFocus: nameInput });
    };

    const loadSummary = async () => {
        try {
            const data = await api.get("/admin/programs?limit=1");
            const summary = data.summary || {};

            setText("ledgerPrograms", String(summary.programs ?? 0));
            setText("ledgerActive", String(summary.activePrograms ?? 0));
            setText("ledgerEnrolled", String(summary.enrolledTrainees ?? 0));
            setText("ledgerFee", formatMoney(summary.totalFeeValue ?? 0));
        } catch (error) {
            // Secondary figures only.
        }
    };

    const load = async () => {
        if (listState) {
            state(listState, {
                title: "Loading programs",
                message: "Reading program fees and enrolment counts."
            });
            listState.hidden = false;
        }

        if (body) body.hidden = true;

        const params = new URLSearchParams({ page: String(filters.page), limit: "25" });

        if (filters.search) params.set("search", filters.search);
        if (filters.active !== "all") params.set("active", filters.active);

        try {
            const data = await api.get(`/admin/programs?${params.toString()}`);

            if (listState) {
                listState.hidden = true;
                listState.replaceChildren();
            }

            if (body) body.hidden = false;

            renderRows(data.programs || []);
            pager(pagerHost, data, (page) => {
                filters.page = page;
                load();
            });
        } catch (error) {
            if (body) body.hidden = true;

            if (listState) {
                listState.hidden = false;
                state(listState, {
                    tone: "error",
                    title: "Could not load programs",
                    message: error.message,
                    action: { label: "Try again", onClick: load }
                });
            }
        }
    };

    if (searchInput) {
        searchInput.addEventListener(
            "input",
            debounce(() => {
                filters.search = searchInput.value.trim();
                filters.page = 1;
                load();
            }, 300)
        );
    }

    if (activeFilter) {
        activeFilter.addEventListener("change", () => {
            filters.active = activeFilter.value;
            filters.page = 1;
            load();
        });
    }

    document.querySelectorAll("[data-close-program]").forEach((button) => {
        button.addEventListener("click", () => closeModal(modal));
    });

    const newButton = document.getElementById("newProgramBtn");

    if (newButton) {
        newButton.addEventListener("click", () => openEditor(null));
    }

    if (form) {
        form.addEventListener("submit", async (event) => {
            event.preventDefault();
            clearFieldErrors(form);
            setFormState(form, {});

            const name = nameInput.value.trim();
            const code = codeInput.value.trim().toUpperCase();
            const totalFee = Number(feeInput.value);

            if (!name) return fieldError(nameInput, "Enter a program name.");
            if (!code) return fieldError(codeInput, "Enter a short program code.");

            if (!Number.isFinite(totalFee) || totalFee < 0) {
                return fieldError(feeInput, "The fee must be zero or more.");
            }

            const submit = form.querySelector('button[type="submit"]');
            submit.disabled = true;
            submit.textContent = "Saving…";

            const payload = {
                name,
                code,
                totalFee,
                description: descriptionInput.value.trim(),
                active: activeInput.checked
            };

            try {
                if (editing) {
                    await api.patch(`/admin/programs/${editing._id}`, payload);
                } else {
                    await api.post("/admin/programs", payload);
                }

                closeModal(modal);
                await Promise.all([load(), loadSummary()]);
            } catch (error) {
                if (error.field === "name") {
                    fieldError(nameInput, error.message);
                } else if (error.field === "code") {
                    fieldError(codeInput, error.message);
                } else if (error.field === "totalFee") {
                    fieldError(feeInput, error.message);
                } else {
                    setFormState(form, { tone: "error", message: error.message });
                }
            } finally {
                submit.disabled = false;
                submit.textContent = "Save program";
            }
        });
    }

    if (deleteButton) {
        deleteButton.addEventListener("click", () => {
            if (!editing) return;

            ui.confirmDialog({
                title: "Delete this program?",
                message: `${editing.name} will be removed. This cannot be undone.`,
                confirmLabel: "Delete program",
                onConfirm: async () => {
                    try {
                        await api.del(`/admin/programs/${editing._id}`);
                        closeModal(modal);
                        await Promise.all([load(), loadSummary()]);
                    } catch (error) {
                        setFormState(form, {
                            tone: "error",
                            message: error.message
                        });
                    }
                }
            });
        });
    }

    loadSummary();
    load();
})();
