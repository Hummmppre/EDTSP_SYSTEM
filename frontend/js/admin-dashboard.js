/**
 * Admin dashboard: ledger + recent assessments from GET /api/admin/summary.
 */
(function initAdminDashboard() {
    const user = window.EDTSP.session.requireRole("admin");
    if (!user) return;

    const { api, ui } = window.EDTSP;
    const { setText, formatDate, statusBadge, state, element } = ui;

    const body = document.getElementById("recentAssessments");
    const container = document.getElementById("recentAssessmentsPanel");

    const renderRows = (assessments) => {
        if (!body) return;

        body.replaceChildren();

        if (assessments.length === 0) {
            const row = document.createElement("tr");
            const cell = document.createElement("td");
            cell.colSpan = 5;
            state(cell, {
                tone: "empty",
                title: "No assessments have been assigned yet",
                message: "Create the first assessment to populate this record.",
                action: {
                    label: "Open assessments",
                    onClick: () => {
                        window.location.href = "assessments.html";
                    }
                }
            });
            row.append(cell);
            body.append(row);
            return;
        }

        assessments.forEach((assessment) => {
            const row = document.createElement("tr");
            const name = element("td", "name", assessment.assessmentTitle);
            const trainee = element(
                "td",
                null,
                assessment.user
                    ? `${assessment.user.firstName} ${assessment.user.lastName}`
                    : "Removed account"
            );
            const date = element(
                "td",
                null,
                formatDate(assessment.assessmentDate || assessment.createdAt)
            );

            const score = element(
                "td",
                "num",
                assessment.score === null || assessment.score === undefined
                    ? "—"
                    : `${assessment.score}/${assessment.totalScore}`
            );

            const status = document.createElement("td");
            status.append(statusBadge(assessment.status));

            row.append(name, trainee, date, score, status);
            body.append(row);
        });
    };

    const load = async () => {
        if (container) {
            state(container, {
                title: "Loading dashboard",
                message: "Reading trainees, assessments, payments, and animal care."
            });
        }

        try {
            const data = await api.get("/admin/summary");
            const summary = data.summary || {};

            setText("totalTrainees", String(summary.totalTrainees ?? 0));
            setText("activeTrainees", String(summary.activeTrainees ?? 0));
            setText("totalAssessments", String(summary.totalAssessments ?? 0));
            setText("pendingAssessments", String(summary.pendingAssessments ?? 0));
            setText("pendingAssessmentsNote", String(summary.pendingAssessments ?? 0));

            setText(
                "collectedValue",
                `₱${Number(summary.collected || 0).toLocaleString("en-PH", {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2
                })}`
            );

            setText(
                "outstandingValue",
                `₱${Number(summary.outstanding || 0).toLocaleString("en-PH", {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2
                })}`
            );

            const panel = document.getElementById("recentAssessmentsPanel");
            if (panel) panel.hidden = false;

            renderRows(data.recentAssessments || []);
        } catch (error) {
            if (container) {
                state(container, {
                    tone: "error",
                    title: "Could not load the dashboard",
                    message: error.message,
                    action: { label: "Try again", onClick: load }
                });
            }
        }
    };

    load();
})();
