/**
 * Admin cow maintenance: herd records, trainee assignments, care activities.
 */
(function initAdminCow() {
    const user = window.EDTSP.session.requireRole("admin");
    if (!user) return;

    const { api, ui } = window.EDTSP;
    const {
        setText,
        formatDateTime,
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

    const cowBody = document.getElementById("cowTableBody");
    const cowPager = document.getElementById("cowPager");
    const cowState = document.getElementById("cowState");
    const cowSearch = document.getElementById("cowSearch");
    const cowHealthFilter = document.getElementById("cowHealthFilter");

    const activityBody = document.getElementById("activityTableBody");
    const activityPager = document.getElementById("activityPager");
    const activityState = document.getElementById("activityState");
    const activitySearch = document.getElementById("activitySearch");
    const activityTypeFilter = document.getElementById("activityTypeFilter");
    const activityStatusFilter = document.getElementById("activityStatusFilter");

    const cowModal = document.getElementById("cowModal");
    const cowForm = document.getElementById("cowForm");
    const cowIdInput = document.getElementById("cowId");
    const cowNameInput = document.getElementById("cowName");
    const cowBreedInput = document.getElementById("cowBreed");
    const cowAgeInput = document.getElementById("cowAge");
    const cowHealthInput = document.getElementById("cowHealth");
    const cowTrainees = document.getElementById("cowTrainees");
    const cowNotesInput = document.getElementById("cowNotes");

    const activityModal = document.getElementById("activityModal");
    const activityForm = document.getElementById("activityForm");
    const activityCow = document.getElementById("activityCow");
    const activityType = document.getElementById("activityType");
    const activityDescription = document.getElementById("activityDescription");
    const activityDate = document.getElementById("activityDate");
    const activityTime = document.getElementById("activityTime");
    const activityTrainees = document.getElementById("activityTrainees");

    const cowFilters = { page: 1, search: "", health: "all" };
    const activityFilters = { page: 1, search: "", type: "all", status: "all" };

    let trainees = [];
    let cowsCache = [];
    let editingCow = null;
    let assistantsLoaded = false;

    const optionList = (select, items, valueKey, labelFn, selected = []) => {
        if (!select) return;

        select.replaceChildren();

        items.forEach((item) => {
            const option = document.createElement("option");
            option.value = String(item[valueKey]);
            option.textContent = labelFn(item);
            option.selected = selected.map(String).includes(String(item[valueKey]));
            select.append(option);
        });
    };

    const loadAssistants = async () => {
        if (assistantsLoaded) return;

        try {
            const data = await api.get("/admin/trainees?limit=100");
            trainees = data.trainees || [];
            assistantsLoaded = true;
        } catch (error) {
            trainees = [];
        }
    };

    const loadCowSummary = async () => {
        try {
            const data = await api.get("/admin/cows?limit=1");
            const summary = data.summary || {};

            setText("ledgerCows", String(summary.Total ?? 0));
            setText("ledgerHealthy", String(summary.Healthy ?? 0));
            setText("ledgerObservation", String(summary["Under Observation"] ?? 0));
            setText("ledgerTreatment", String(summary["Under Treatment"] ?? 0));
        } catch (error) {
            // Secondary figures only.
        }
    };

    const loadActivitySummary = async () => {
        try {
            const [pending, completed, total] = await Promise.all([
                api.get("/admin/activities?limit=1&status=Pending"),
                api.get("/admin/activities?limit=1&status=Completed"),
                api.get("/admin/activities?limit=1")
            ]);

            setText("activityPending", String(pending.total ?? 0));
            setText("activityCompleted", String(completed.total ?? 0));
            setText("activityTotal", String(total.total ?? 0));
        } catch (error) {
            // Secondary figures only.
        }
    };

    const renderCows = (cows) => {
        cowBody.replaceChildren();

        if (cows.length === 0) {
            const row = document.createElement("tr");
            const cell = document.createElement("td");
            cell.colSpan = 7;

            const filtered = cowFilters.search || cowFilters.health !== "all";

            state(cell, {
                tone: "empty",
                title: filtered ? "No animals match these filters" : "No animals recorded",
                message: filtered
                    ? "Clear the search or health filter to see the whole herd."
                    : "Add the first animal to start assigning care tasks."
            });

            row.append(cell);
            cowBody.append(row);
            return;
        }

        cows.forEach((cow) => {
            const row = document.createElement("tr");
            const assignees = (cow.assignedTrainees || [])
                .map((trainee) => trainee.name)
                .filter(Boolean)
                .join(", ");

            row.append(
                element("td", "id", cow.cowId),
                element("td", "name", cow.name),
                element("td", null, cow.breed || "—"),
                element("td", "num", cow.ageYears === null ? "—" : String(cow.ageYears)),
                element("td", null, assignees || "Unassigned")
            );

            const health = document.createElement("td");
            health.append(statusBadge(cow.healthStatus, cow.healthStatus));
            row.append(health);

            const actions = document.createElement("td");
            const edit = element("button", "row-action", "Edit");
            edit.type = "button";
            edit.addEventListener("click", () => openCow(cow));
            actions.append(edit);
            row.append(actions);

            cowBody.append(row);
        });
    };

    const renderActivities = (activities) => {
        activityBody.replaceChildren();

        if (activities.length === 0) {
            const row = document.createElement("tr");
            const cell = document.createElement("td");
            cell.colSpan = 7;

            const filtered =
                activityFilters.search ||
                activityFilters.type !== "all" ||
                activityFilters.status !== "all";

            state(cell, {
                tone: "empty",
                title: filtered ? "No activities match these filters" : "No activities scheduled",
                message: filtered
                    ? "Clear the filters to see every scheduled task."
                    : "Schedule feeding, drinking, or medication rounds to begin."
            });

            row.append(cell);
            activityBody.append(row);
            return;
        }

        activities.forEach((activity) => {
            const row = document.createElement("tr");

            row.append(
                element(
                    "td",
                    "id",
                    `${activity.cow.cowId}${activity.cow.name ? ` · ${activity.cow.name}` : ""}`
                ),
                element("td", null, activity.type),
                element("td", "name", activity.description),
                element("td", null, formatDateTime(activity.scheduledAt)),
                element(
                    "td",
                    null,
                    (activity.assignedTrainees || [])
                        .map((trainee) => trainee.name)
                        .filter(Boolean)
                        .join(", ") || "Unassigned"
                )
            );

            const status = document.createElement("td");
            status.append(statusBadge(activity.status));
            row.append(status);

            const actions = document.createElement("td");
            const toggle = element(
                "button",
                "row-action",
                activity.status === "Completed" ? "Reopen" : "Mark complete"
            );
            toggle.type = "button";
            toggle.addEventListener("click", () => toggleStatus(activity));
            actions.append(toggle);
            row.append(actions);

            activityBody.append(row);
        });
    };

    const loadCows = async () => {
        if (cowState) {
            state(cowState, {
                title: "Loading animals",
                message: "Reading herd records and assignments."
            });
            cowState.hidden = false;
        }

        if (cowBody) cowBody.hidden = true;

        const params = new URLSearchParams({
            page: String(cowFilters.page),
            limit: "25"
        });

        if (cowFilters.search) params.set("search", cowFilters.search);
        if (cowFilters.health !== "all") params.set("health", cowFilters.health);

        try {
            const data = await api.get(`/admin/cows?${params.toString()}`);

            cowsCache = data.cows || [];

            if (cowState) {
                cowState.hidden = true;
                cowState.replaceChildren();
            }

            if (cowBody) cowBody.hidden = false;

            renderCows(cowsCache);
            pager(cowPager, data, (page) => {
                cowFilters.page = page;
                loadCows();
            });

            if (activityCow) {
                optionList(
                    activityCow,
                    cowsCache,
                    "_id",
                    (cow) => `${cow.cowId} · ${cow.name}`
                );
            }
        } catch (error) {
            if (cowBody) cowBody.hidden = true;

            if (cowState) {
                cowState.hidden = false;
                state(cowState, {
                    tone: "error",
                    title: "Could not load the herd",
                    message: error.message,
                    action: { label: "Try again", onClick: loadCows }
                });
            }
        }
    };

    const loadActivities = async () => {
        if (activityState) {
            state(activityState, {
                title: "Loading activities",
                message: "Reading the care schedule."
            });
            activityState.hidden = false;
        }

        if (activityBody) activityBody.hidden = true;

        const params = new URLSearchParams({
            page: String(activityFilters.page),
            limit: "25"
        });

        if (activityFilters.search) params.set("search", activityFilters.search);
        if (activityFilters.type !== "all") params.set("type", activityFilters.type);
        if (activityFilters.status !== "all") params.set("status", activityFilters.status);

        try {
            const data = await api.get(`/admin/activities?${params.toString()}`);

            if (activityState) {
                activityState.hidden = true;
                activityState.replaceChildren();
            }

            if (activityBody) activityBody.hidden = false;

            renderActivities(data.activities || []);
            pager(activityPager, data, (page) => {
                activityFilters.page = page;
                loadActivities();
            });
        } catch (error) {
            if (activityBody) activityBody.hidden = true;

            if (activityState) {
                activityState.hidden = false;
                state(activityState, {
                    tone: "error",
                    title: "Could not load the care schedule",
                    message: error.message,
                    action: { label: "Try again", onClick: loadActivities }
                });
            }
        }
    };

    const openCow = async (cow) => {
        editingCow = cow || null;

        clearFieldErrors(cowForm);
        setFormState(cowForm, {});

        setText("cowModalTitle", editingCow ? "Edit animal" : "Add animal");

        cowIdInput.value = editingCow ? editingCow.cowId : "";
        cowNameInput.value = editingCow ? editingCow.name : "";
        cowBreedInput.value = editingCow ? editingCow.breed || "" : "";
        cowAgeInput.value =
            editingCow && editingCow.ageYears !== null ? String(editingCow.ageYears) : "";
        cowHealthInput.value = editingCow ? editingCow.healthStatus : "Healthy";
        cowNotesInput.value = editingCow ? editingCow.notes || "" : "";

        openModal(cowModal, { initialFocus: editingCow ? cowNameInput : cowIdInput });

        await loadAssistants();

        optionList(
            cowTrainees,
            trainees,
            "_id",
            (trainee) => trainee.name || `${trainee.firstName} ${trainee.lastName}`,
            editingCow
                ? (editingCow.assignedTrainees || []).map((trainee) => trainee._id)
                : []
        );
    };

    const openActivity = async () => {
        clearFieldErrors(activityForm);
        setFormState(activityForm, {});
        activityForm.reset();

        openModal(activityModal, { initialFocus: activityCow });

        await Promise.all([loadCows(), loadAssistants()]);

        optionList(
            activityCow,
            cowsCache,
            "_id",
            (cow) => `${cow.cowId} · ${cow.name}`
        );

        optionList(
            activityTrainees,
            trainees,
            "_id",
            (trainee) => trainee.name
        );

        const today = new Intl.DateTimeFormat("en-CA", {
            timeZone: "Asia/Manila"
        }).format(new Date());

        activityDate.value = today;
        activityTime.value = "08:00";
    };

    const toggleStatus = async (activity) => {
        try {
            await api.put(`/admin/activities/${activity._id}/status`, {
                status: activity.status === "Completed" ? "Pending" : "Completed"
            });

            await Promise.all([loadActivities(), loadActivitySummary()]);
        } catch (error) {
            if (activityState) {
                activityState.hidden = false;
                state(activityState, {
                    tone: "error",
                    title: "Status change failed",
                    message: error.message
                });
            }
        }
    };

    if (cowSearch) {
        cowSearch.addEventListener(
            "input",
            debounce(() => {
                cowFilters.search = cowSearch.value.trim();
                cowFilters.page = 1;
                loadCows();
            }, 300)
        );
    }

    if (cowHealthFilter) {
        cowHealthFilter.addEventListener("change", () => {
            cowFilters.health = cowHealthFilter.value;
            cowFilters.page = 1;
            loadCows();
        });
    }

    if (activitySearch) {
        activitySearch.addEventListener(
            "input",
            debounce(() => {
                activityFilters.search = activitySearch.value.trim();
                activityFilters.page = 1;
                loadActivities();
            }, 300)
        );
    }

    if (activityTypeFilter) {
        activityTypeFilter.addEventListener("change", () => {
            activityFilters.type = activityTypeFilter.value;
            activityFilters.page = 1;
            loadActivities();
        });
    }

    if (activityStatusFilter) {
        activityStatusFilter.addEventListener("change", () => {
            activityFilters.status = activityStatusFilter.value;
            activityFilters.page = 1;
            loadActivities();
        });
    }

    document.querySelectorAll("[data-close-cow]").forEach((button) => {
        button.addEventListener("click", () => closeModal(cowModal));
    });

    document.querySelectorAll("[data-close-activity]").forEach((button) => {
        button.addEventListener("click", () => closeModal(activityModal));
    });

    const addCowButton = document.getElementById("addCowBtn");
    if (addCowButton) addCowButton.addEventListener("click", () => openCow(null));

    const addActivityButton = document.getElementById("addActivityBtn");
    if (addActivityButton) addActivityButton.addEventListener("click", openActivity);

    if (cowForm) {
        cowForm.addEventListener("submit", async (event) => {
            event.preventDefault();
            clearFieldErrors(cowForm);
            setFormState(cowForm, {});

            const cowId = cowIdInput.value.trim().toUpperCase();
            const name = cowNameInput.value.trim();

            if (!/^COW-\d{3}$/.test(cowId)) {
                return fieldError(cowIdInput, "Use the format COW-NNN, for example COW-004.");
            }

            if (!name) return fieldError(cowNameInput, "Give the animal a name.");

            const submit = cowForm.querySelector('button[type="submit"]');
            submit.disabled = true;
            submit.textContent = "Saving…";

            const payload = {
                cowId,
                name,
                breed: cowBreedInput.value.trim(),
                ageYears: cowAgeInput.value === "" ? null : Number(cowAgeInput.value),
                healthStatus: cowHealthInput.value,
                assignedTrainees: Array.from(cowTrainees.selectedOptions).map(
                    (option) => option.value
                ),
                notes: cowNotesInput.value.trim()
            };

            try {
                if (editingCow) {
                    await api.patch(`/admin/cows/${editingCow._id}`, payload);
                } else {
                    await api.post("/admin/cows", payload);
                }

                closeModal(cowModal);
                await Promise.all([loadCows(), loadCowSummary()]);
            } catch (error) {
                if (error.field === "cowId") {
                    fieldError(cowIdInput, error.message);
                } else if (error.field === "ageYears") {
                    fieldError(cowAgeInput, error.message);
                } else if (error.field === "name") {
                    fieldError(cowNameInput, error.message);
                } else {
                    setFormState(cowForm, { tone: "error", message: error.message });
                }
            } finally {
                submit.disabled = false;
                submit.textContent = "Save animal";
            }
        });
    }

    if (activityForm) {
        activityForm.addEventListener("submit", async (event) => {
            event.preventDefault();
            clearFieldErrors(activityForm);
            setFormState(activityForm, {});

            if (!activityCow.value) {
                return fieldError(activityCow, "Choose the animal.");
            }

            if (!activityDescription.value.trim()) {
                return fieldError(activityDescription, "Describe the activity.");
            }

            if (!activityDate.value) {
                return fieldError(activityDate, "Choose the date.");
            }

            const submit = activityForm.querySelector('button[type="submit"]');
            submit.disabled = true;
            submit.textContent = "Scheduling…";

            try {
                await api.post("/admin/activities", {
                    cow: activityCow.value,
                    type: activityType.value,
                    description: activityDescription.value.trim(),
                    scheduledDate: activityDate.value,
                    scheduledTime: activityTime.value || "08:00",
                    assignedTrainees: Array.from(activityTrainees.selectedOptions).map(
                        (option) => option.value
                    )
                });

                closeModal(activityModal);
                await Promise.all([loadActivities(), loadActivitySummary()]);
            } catch (error) {
                if (error.field === "description") {
                    fieldError(activityDescription, error.message);
                } else if (error.field === "cow") {
                    fieldError(activityCow, error.message);
                } else {
                    setFormState(activityForm, {
                        tone: "error",
                        message: error.message
                    });
                }
            } finally {
                submit.disabled = false;
                submit.textContent = "Schedule activity";
            }
        });
    }

    loadCowSummary();
    loadActivitySummary();
    loadCows();
    loadActivities();
})();
