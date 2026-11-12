/**
 * Admin trainee management: server-side search/filter/pagination + manage modal.
 */
(function initAdminTrainees() {
    const user = window.EDTSP.session.requireRole("admin");
    if (!user) return;

    const { api, ui } = window.EDTSP;
    const {
        setText,
        formatMoney,
        formatDate,
        statusBadge,
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

    const body = document.getElementById("traineeTableBody");
    const pagerHost = document.getElementById("traineePager");
    const listState = document.getElementById("traineeState");
    const searchInput = document.getElementById("traineeSearch");
    const statusFilter = document.getElementById("statusFilter");
    const accountFilter = document.getElementById("accountFilter");
    const resetFilters = document.getElementById("resetFilters");

    const modal = document.getElementById("traineeModal");
    const form = document.getElementById("traineeForm");
    const programSelect = document.getElementById("manageProgram");
    const enrollmentSelect = document.getElementById("manageEnrollment");
    const accountSelect = document.getElementById("manageAccount");
    const traineeIdInput = document.getElementById("manageTraineeId");

    const filters = { page: 1, search: "", status: "all", account: "all" };
    let programsLoaded = false;
    let current = null;

    const loadSummary = async () => {
        try {
            const data = await api.get("/admin/summary");
            const summary = data.summary || {};

            setText("ledgerTotal", String(summary.totalTrainees ?? 0));
            setText("ledgerActive", String(summary.activeTrainees ?? 0));
            setText("ledgerPending", String(summary.pendingEnrolment ?? 0));
            setText("ledgerCompleted", String(summary.completedTraining ?? 0));
        } catch (error) {
            // The ledger is secondary; the table reports its own failures.
        }
    };

    const loadPrograms = async () => {
        if (programsLoaded || !programSelect) return;

        try {
            const data = await api.get("/admin/programs?limit=100&active=true");
            programSelect.replaceChildren();

            const blank = document.createElement("option");
            blank.value = "";
            blank.textContent = "Not assigned";
            programSelect.append(blank);

            (data.programs || []).forEach((program) => {
                const option = document.createElement("option");
                option.value = program._id;
                option.textContent = `${program.name} (${program.code})`;
                programSelect.append(option);
            });

            programsLoaded = true;
        } catch (error) {
            // Leave the select with the "Not assigned" option only.
        }
    };

    const renderRows = (trainees) => {
        body.replaceChildren();

        if (trainees.length === 0) {
            const row = document.createElement("tr");
            const cell = document.createElement("td");
            cell.colSpan = 8;

            const filtered =
                filters.search || filters.status !== "all" || filters.account !== "all";

            state(cell, {
                tone: "empty",
                title: filtered ? "Nothing matches this search" : "No trainees yet",
                message: filtered
                    ? "Adjust the search text or status filters to see more records."
                    : "Trainee accounts appear here as soon as people sign up.",
                action: filtered
                    ? {
                          label: "Clear filters",
                          onClick: () => {
                              filters.search = "";
                              filters.status = "all";
                              filters.account = "all";
                              filters.page = 1;
                              searchInput.value = "";
                              statusFilter.value = "all";
                              accountFilter.value = "all";
                              load();
                          }
                      }
                    : undefined
            });

            row.append(cell);
            body.append(row);
            return;
        }

        trainees.forEach((trainee) => {
            const row = document.createElement("tr");

            row.append(
                element("td", "id", trainee.traineeId || "Not assigned"),
                element("td", "name", trainee.name),
                element("td", null, trainee.email),
                element("td", null, trainee.programName || "Not assigned")
            );

            const enrollment = document.createElement("td");
            enrollment.append(
                statusBadge(trainee.enrollmentStatus, trainee.enrollmentStatus)
            );

            const account = document.createElement("td");
            account.append(
                statusBadge(
                    trainee.status === "active" ? "completed" : "inactive",
                    trainee.status === "active" ? "Active" : "Inactive"
                )
            );

            row.append(
                enrollment,
                account,
                element("td", "num", formatMoney(trainee.balance))
            );

            const actions = document.createElement("td");
            const manage = element("button", "row-action", "Manage");
            manage.type = "button";
            manage.addEventListener("click", () => openManage(trainee));
            actions.append(manage);

            row.append(actions);
            body.append(row);
        });
    };

    const openManage = async (trainee) => {
        current = trainee;

        clearFieldErrors(form);
        setFormState(form, {});

        setText("manageName", trainee.name);
        setText("manageEmail", trainee.email);
        setText("manageJoined", `Joined ${formatDate(trainee.createdAt)}`);

        traineeIdInput.value = trainee.traineeId || "";
        accountSelect.value = trainee.status;
        enrollmentSelect.value = trainee.enrollmentStatus;

        setText(
            "manageBalanceNote",
            trainee.totalFee
                ? `${formatMoney(trainee.balance)} remaining of ${formatMoney(trainee.totalFee)}`
                : "No program fee assigned yet."
        );

        openModal(modal);
        await loadPrograms();

        if (programSelect) {
            programSelect.value =
                trainee.program && trainee.program._id ? trainee.program._id : "";
        }
    };

    const load = async () => {
        if (listState) {
            state(listState, {
                title: "Loading trainees",
                message: "Reading trainee accounts and profiles."
            });
            listState.hidden = false;
        }

        if (body) body.hidden = true;

        const params = new URLSearchParams({
            page: String(filters.page),
            limit: "25"
        });

        if (filters.search) params.set("search", filters.search);
        if (filters.status !== "all") params.set("status", filters.status);
        if (filters.account !== "all") params.set("account", filters.account);

        try {
            const data = await api.get(`/admin/trainees?${params.toString()}`);

            if (listState) {
                listState.replaceChildren();
                listState.hidden = true;
            }

            if (body) body.hidden = false;

            renderRows(data.trainees || []);
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
                    title: "Could not load trainees",
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

    if (statusFilter) {
        statusFilter.addEventListener("change", () => {
            filters.status = statusFilter.value;
            filters.page = 1;
            load();
        });
    }

    if (accountFilter) {
        accountFilter.addEventListener("change", () => {
            filters.account = accountFilter.value;
            filters.page = 1;
            load();
        });
    }

    if (resetFilters) {
        resetFilters.addEventListener("click", () => {
            filters.search = "";
            filters.status = "all";
            filters.account = "all";
            filters.page = 1;
            if (searchInput) searchInput.value = "";
            if (statusFilter) statusFilter.value = "all";
            if (accountFilter) accountFilter.value = "all";
            load();
        });
    }

    document.querySelectorAll("[data-close-trainee]").forEach((button) => {
        button.addEventListener("click", () => closeModal(modal));
    });

    if (form) {
        form.addEventListener("submit", async (event) => {
            event.preventDefault();

            if (!current) return;

            clearFieldErrors(form);
            setFormState(form, {});

            const traineeId = traineeIdInput.value.trim().toUpperCase();

            if (traineeId && !/^EDT-\d{4}-\d{3}$/.test(traineeId)) {
                return fieldError(
                    traineeIdInput,
                    "Use the format EDT-YYYY-NNN, for example EDT-2026-004."
                );
            }

            const submit = form.querySelector('button[type="submit"]');
            submit.disabled = true;
            submit.textContent = "Saving…";

            try {
                await api.patch(`/admin/trainees/${current._id}`, {
                    traineeId,
                    program: programSelect ? programSelect.value : "",
                    enrollmentStatus: enrollmentSelect.value,
                    status: accountSelect.value
                });

                closeModal(modal);
                await Promise.all([load(), loadSummary()]);
            } catch (error) {
                if (error.field === "traineeId") {
                    fieldError(traineeIdInput, error.message);
                } else {
                    setFormState(form, { tone: "error", message: error.message });
                }
            } finally {
                submit.disabled = false;
                submit.textContent = "Save changes";
            }
        });
    }

    loadSummary();
    load();
})();
