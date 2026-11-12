/**
 * Admin assessments: paginated table, create-assignment modal, grading modal.
 */
(function initAdminAssessments() {
    const user = window.EDTSP.session.requireRole("admin");
    if (!user) return;

    const { api, ui } = window.EDTSP;
    const {
        setText,
        formatDate,
        formatNumber,
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

    const body = document.getElementById("assessmentTableBody");
    const pagerHost = document.getElementById("assessmentPager");
    const listState = document.getElementById("assessmentState");
    const searchInput = document.getElementById("assessmentSearch");
    const statusFilter = document.getElementById("assessmentStatusFilter");

    const createModal = document.getElementById("assessmentModal");
    const createForm = document.getElementById("assessmentForm");
    const picker = document.getElementById("traineePicker");
    const selectAll = document.getElementById("selectAllTrainees");
    const pickerState = document.getElementById("traineePickerState");
    const titleInput = document.getElementById("assessmentTitle");
    const subjectInput = document.getElementById("assessmentSubject");
    const typeInput = document.getElementById("assessmentType");
    const totalInput = document.getElementById("totalScore");
    const dateInput = document.getElementById("assessmentDate");
    const dueInput = document.getElementById("assessmentDueDate");
    const remarksInput = document.getElementById("assessmentRemarks");

    const gradeModal = document.getElementById("gradeModal");
    const gradeForm = document.getElementById("gradeForm");
    const gradeScore = document.getElementById("gradeScore");
    const gradeRemarks = document.getElementById("gradeRemarks");

    const filters = { page: 1, search: "", status: "all" };
    let grading = null;

    const renderSummary = (summary) => {
        if (!summary) return;

        setText("ledgerTotal", String(summary.total ?? 0));
        setText("ledgerPending", String(summary.pending ?? 0));
        setText("ledgerGraded", String(summary.graded ?? 0));
        setText(
            "ledgerAverage",
            summary.average ? `${formatNumber(summary.average)}%` : "—"
        );
    };

    const renderRows = (assessments) => {
        body.replaceChildren();

        if (assessments.length === 0) {
            const row = document.createElement("tr");
            const cell = document.createElement("td");
            cell.colSpan = 8;

            const filtered = filters.search || filters.status !== "all";

            state(cell, {
                tone: "empty",
                title: filtered
                    ? "No assessments match these filters"
                    : "No assessments assigned yet",
                message: filtered
                    ? "Clear the search or status filter to see every record."
                    : "Use “Create assessment” to assign the first one."
            });

            row.append(cell);
            body.append(row);
            return;
        }

        assessments.forEach((assessment) => {
            const row = document.createElement("tr");

            row.append(
                element("td", "name", assessment.assessmentTitle),
                element("td", null, assessment.subject),
                element("td", null, assessment.assessmentType || "Written"),
                element(
                    "td",
                    null,
                    assessment.user
                        ? `${assessment.user.firstName} ${assessment.user.lastName}`
                        : "Removed account"
                ),
                element(
                    "td",
                    null,
                    formatDate(assessment.dueDate || assessment.assessmentDate)
                ),
                element(
                    "td",
                    "num",
                    assessment.score === null || assessment.score === undefined
                        ? "—"
                        : `${assessment.score}/${assessment.totalScore}`
                )
            );

            const status = document.createElement("td");
            status.append(statusBadge(assessment.status));
            row.append(status);

            const actions = document.createElement("td");
            const grade = element(
                "button",
                "row-action",
                assessment.status === "Graded" ? "Regrade" : "Grade"
            );
            grade.type = "button";
            grade.addEventListener("click", () => openGrade(assessment));
            actions.append(grade);
            row.append(actions);

            body.append(row);
        });
    };

    const load = async () => {
        if (listState) {
            state(listState, {
                title: "Loading assessments",
                message: "Reading assessment records and grading status."
            });
            listState.hidden = false;
        }

        if (body) body.hidden = true;

        const params = new URLSearchParams({ page: String(filters.page), limit: "25" });

        if (filters.search) params.set("search", filters.search);
        if (filters.status !== "all") params.set("status", filters.status);

        try {
            const data = await api.get(`/assessments?${params.toString()}`);

            renderSummary(data.summary);

            if (listState) {
                listState.hidden = true;
                listState.replaceChildren();
            }

            if (body) body.hidden = false;

            renderRows(data.assessments || []);
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
                    title: "Could not load assessments",
                    message: error.message,
                    action: { label: "Try again", onClick: load }
                });
            }
        }
    };

    const loadPicker = async () => {
        if (!picker) return;

        picker.replaceChildren();
        if (pickerState) {
            pickerState.hidden = false;
            pickerState.textContent = "Loading trainee accounts…";
        }

        try {
            const data = await api.get("/assessments/trainees?limit=100");

            picker.replaceChildren();
            if (pickerState) pickerState.hidden = true;

            const trainees = data.trainees || [];

            if (trainees.length === 0) {
                if (pickerState) {
                    pickerState.hidden = false;
                    pickerState.textContent =
                        "No active trainee accounts exist yet. Trainees appear here once they sign up.";
                }
                return;
            }

            trainees.forEach((trainee) => {
                const label = document.createElement("label");
                const checkbox = document.createElement("input");
                checkbox.type = "checkbox";
                checkbox.name = "trainees";
                checkbox.value = trainee._id;

                const text = document.createElement("span");
                text.textContent = `${trainee.firstName} ${trainee.lastName}${trainee.traineeId ? ` · ${trainee.traineeId}` : ""}`;

                label.append(checkbox, text);
                picker.append(label);
            });
        } catch (error) {
            if (pickerState) {
                pickerState.hidden = false;
                pickerState.textContent = error.message;
            }
        }
    };

    const openCreate = async () => {
        createForm.reset();
        clearFieldErrors(createForm);
        setFormState(createForm, {});
        if (selectAll) selectAll.checked = false;

        if (dateInput) dateInput.max = "";
        openModal(createModal, { initialFocus: titleInput });
        await loadPicker();
    };

    const openGrade = (assessment) => {
        grading = assessment;

        clearFieldErrors(gradeForm);
        setFormState(gradeForm, {});

        setText("gradeTitle", assessment.assessmentTitle);
        setText(
            "gradeMeta",
            `${assessment.subject} · ${assessment.user ? `${assessment.user.firstName} ${assessment.user.lastName}` : "Removed account"}`
        );
        setText("gradeTotalHint", `Total score: ${assessment.totalScore}`);

        gradeScore.max = String(assessment.totalScore);
        gradeScore.value =
            assessment.score === null || assessment.score === undefined
                ? ""
                : String(assessment.score);
        gradeRemarks.value = assessment.remarks || "";

        openModal(gradeModal, { initialFocus: gradeScore });
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

    if (selectAll) {
        selectAll.addEventListener("change", () => {
            picker
                .querySelectorAll('input[name="trainees"]')
                .forEach((checkbox) => {
                    checkbox.checked = selectAll.checked;
                });
        });
    }

    document.querySelectorAll("[data-close-assessment]").forEach((button) => {
        button.addEventListener("click", () => closeModal(createModal));
    });

    document.querySelectorAll("[data-close-grade]").forEach((button) => {
        button.addEventListener("click", () => closeModal(gradeModal));
    });

    const createButton = document.getElementById("createAssessmentBtn");

    if (createButton) {
        createButton.addEventListener("click", openCreate);
    }

    if (createForm) {
        createForm.addEventListener("submit", async (event) => {
            event.preventDefault();
            clearFieldErrors(createForm);
            setFormState(createForm, {});

            const traineeIds = Array.from(
                picker.querySelectorAll('input[name="trainees"]:checked')
            ).map((checkbox) => checkbox.value);

            if (traineeIds.length === 0) {
                setFormState(createForm, {
                    tone: "error",
                    message: "Select at least one trainee for this assessment."
                });
                return;
            }

            const title = titleInput.value.trim();
            const subject = subjectInput.value.trim();
            const totalScore = Number(totalInput.value);

            if (!title) return fieldError(titleInput, "Enter an assessment title.");
            if (!subject) return fieldError(subjectInput, "Enter the subject.");

            if (!Number.isFinite(totalScore) || totalScore < 1) {
                return fieldError(totalInput, "Total score must be at least 1.");
            }

            const submit = createForm.querySelector('button[type="submit"]');
            submit.disabled = true;
            submit.textContent = "Assigning…";

            try {
                const result = await api.post("/assessments", {
                    traineeIds,
                    assessmentTitle: title,
                    subject,
                    assessmentType: typeInput.value || "Written",
                    totalScore,
                    assessmentDate: dateInput.value || null,
                    dueDate: dueInput.value || null,
                    remarks: remarksInput.value.trim()
                });

                if (result.skippedCount > 0) {
                    const names = (result.skipped || [])
                        .map((row) => row.name)
                        .filter(Boolean)
                        .join(", ");

                    setFormState(createForm, {
                        tone: "info",
                        message: `${result.message}${names ? ` Skipped: ${names}.` : ""}`
                    });
                } else {
                    setFormState(createForm, {
                        tone: "success",
                        message: result.message
                    });
                }

                createForm.reset();
                if (selectAll) selectAll.checked = false;
                await load();
            } catch (error) {
                if (error.field === "totalScore") {
                    fieldError(totalInput, error.message);
                } else if (error.field === "assessmentType") {
                    fieldError(typeInput, error.message);
                } else {
                    setFormState(createForm, { tone: "error", message: error.message });
                }
            } finally {
                submit.disabled = false;
                submit.textContent = "Create assessment";
            }
        });
    }

    if (gradeForm) {
        gradeForm.addEventListener("submit", async (event) => {
            event.preventDefault();
            clearFieldErrors(gradeForm);
            setFormState(gradeForm, {});

            if (!grading) return;

            const value = Number(gradeScore.value);

            if (!Number.isFinite(value) || value < 0) {
                return fieldError(gradeScore, "Enter a score of zero or more.");
            }

            if (value > grading.totalScore) {
                return fieldError(
                    gradeScore,
                    `The score cannot exceed ${grading.totalScore}.`
                );
            }

            const submit = gradeForm.querySelector('button[type="submit"]');
            submit.disabled = true;
            submit.textContent = "Saving…";

            try {
                await api.put(`/assessments/${grading._id}/grade`, {
                    score: value,
                    remarks: gradeRemarks.value.trim()
                });

                closeModal(gradeModal);
                await load();
            } catch (error) {
                if (error.field === "score") {
                    fieldError(gradeScore, error.message);
                } else {
                    setFormState(gradeForm, { tone: "error", message: error.message });
                }
            } finally {
                submit.disabled = false;
                submit.textContent = "Save grade";
            }
        });
    }

    load();
})();
