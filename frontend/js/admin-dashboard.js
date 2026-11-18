const DASHBOARD_API = "http://localhost:5000/api";

const DASHBOARD_ENDPOINTS = {
    trainees: `${DASHBOARD_API}/admin/trainees`,
    assessments: `${DASHBOARD_API}/assessments`,
    applications: `${DASHBOARD_API}/admin/applications`,
    programs: `${DASHBOARD_API}/admin/programs`,
    payments: `${DASHBOARD_API}/admin/payments`,
    cows: `${DASHBOARD_API}/admin/cows`,
    activities: `${DASHBOARD_API}/admin/cows/activities`,
    settings: `${DASHBOARD_API}/system-settings`,
    calendar: `${DASHBOARD_API}/integrations/google-calendar/status`
};

const ASSESSMENT_STATUS_CLASSES = {
    Pending: "pending",
    Completed: "completed",
    Graded: "completed"
};

document.addEventListener("DOMContentLoaded", () => {
    const tableBody = document.getElementById("recentAssessments");
    const feedback = document.getElementById("dashboardFeedback");
    const emptyState = document.getElementById("recentAssessmentsEmpty");

    if (!tableBody) return;

    const token =
        localStorage.getItem("edtspToken") ||
        sessionStorage.getItem("edtspToken");

    function redirectToLogin() {
        localStorage.removeItem("edtspToken");
        localStorage.removeItem("edtspUser");
        sessionStorage.removeItem("edtspToken");
        sessionStorage.removeItem("edtspUser");
        window.location.href = "../login.html";
    }

    if (!token) {
        redirectToLogin();
        return;
    }

    function setFeedback(message) {
        if (!feedback) return;

        feedback.textContent = message || "";
        feedback.hidden = !message;
    }

    function setPanelState(id, message) {
        const element = document.getElementById(id);

        if (!element) return;

        element.textContent = message || "";
        element.hidden = !message;
    }

    function setText(id, value) {
        const element = document.getElementById(id);

        if (element) element.textContent = value;
    }

    function money(value) {
        const amount = Number(value || 0);
        const hasCents = Math.round(amount * 100) % 100 !== 0;

        return `₱${amount.toLocaleString("en-PH", {
            minimumFractionDigits: hasCents ? 2 : 0,
            maximumFractionDigits: 2
        })}`;
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

    function dateValue(assessment) {
        const value = assessment.assessmentDate || assessment.createdAt;
        const date = value ? new Date(value) : null;

        return date && !Number.isNaN(date.getTime()) ? date.getTime() : 0;
    }

    function scoreText(assessment) {
        const graded = assessment.status === "Graded";
        const numeric = typeof assessment.score === "number";

        return graded && numeric
            ? `${assessment.score}/${assessment.totalScore}`
            : "—";
    }

    function buildRow(assessment) {
        const row = document.createElement("tr");
        const user = assessment.user || {};

        const titleCell = document.createElement("td");
        const title = document.createElement("a");

        titleCell.className = "name";
        title.className = "table-link";
        title.href = "assessments.html";
        title.textContent = assessment.assessmentTitle || "Assessment";
        titleCell.appendChild(title);

        if (assessment.subject) {
            const subject = document.createElement("small");

            subject.className = "field-note";
            subject.textContent = assessment.subject;
            titleCell.appendChild(subject);
        }

        row.appendChild(titleCell);

        const traineeCell = document.createElement("td");
        const traineeName = `${user.firstName || ""} ${user.lastName || ""}`.trim();

        traineeCell.textContent = traineeName || "Unknown trainee";
        row.appendChild(traineeCell);

        const dateCell = document.createElement("td");

        dateCell.textContent = formatDate(assessment.assessmentDate || assessment.createdAt);
        row.appendChild(dateCell);

        const scoreCell = document.createElement("td");

        scoreCell.className = "num";
        scoreCell.textContent = scoreText(assessment);
        row.appendChild(scoreCell);

        const statusCell = document.createElement("td");
        const badge = document.createElement("span");
        const status = assessment.status || "Pending";

        badge.className =
            `status-badge ${ASSESSMENT_STATUS_CLASSES[status] || "pending"}`;
        badge.textContent = status;
        statusCell.appendChild(badge);
        row.appendChild(statusCell);

        return row;
    }

    function renderRecentAssessments(assessments) {
        tableBody.innerHTML = "";

        const recent = [...assessments]
            .sort((left, right) => dateValue(right) - dateValue(left))
            .slice(0, 5);

        if (emptyState) emptyState.hidden = recent.length !== 0;

        recent.forEach(assessment => {
            tableBody.appendChild(buildRow(assessment));
        });
    }

    async function fetchJson(url) {
        const response = await fetch(url, {
            headers: { Authorization: `Bearer ${token}` }
        });

        if (response.status === 401) {
            const error = new Error("Your session has expired.");

            error.unauthorized = true;
            throw error;
        }

        const data = await response.json();

        if (!response.ok || !data.success) {
            throw new Error(data.message || "Unable to load dashboard data.");
        }

        return data;
    }

    function dataOf(result) {
        return result.status === "fulfilled" ? result.value : null;
    }

    // ---------- Per-page overviews ----------

    function renderTrainees(result, failed) {
        const data = dataOf(result);

        if (!data) {
            console.error("Dashboard trainee summary error:", result.reason);
            failed.push("trainees");
            return;
        }

        const summary = data.summary || {};

        setText("totalTrainees", String(summary.total || 0));
        setText("activeTrainees", String(summary.ongoing || 0));
    }

    function renderAssessments(result, failed) {
        const data = dataOf(result);

        if (!data) {
            console.error("Dashboard assessment summary error:", result.reason);
            failed.push("assessments");
            setPanelState("overviewAssessmentsState", "Assessment figures could not load.");
            return;
        }

        const assessments = data.assessments || [];
        const summary = data.summary || {};
        const awaitingGrade = assessments.filter(
            assessment =>
                assessment.status === "Pending" ||
                assessment.status === "Completed"
        ).length;

        setText(
            "totalAssessments",
            String(data.count === undefined ? assessments.length : data.count)
        );
        setText("pendingAssessments", String(awaitingGrade));
        setText("overviewAwaitingAssessments", String(awaitingGrade));
        setText("overviewGradedAssessments", String(summary.gradedAssessments || 0));
        setText("overviewAverageScore", `${summary.averageScore || 0}%`);

        renderRecentAssessments(assessments);
        setPanelState("overviewAssessmentsState", "");
    }

    function renderApplications(result, failed) {
        const data = dataOf(result);

        if (!data) {
            console.error("Dashboard applications error:", result.reason);
            failed.push("applications");
            setPanelState("overviewApplicationsState", "Application figures could not load.");
            return;
        }

        const applications = data.applications || [];
        const countStatus = statuses =>
            applications.filter(
                application => statuses.includes(application.status)
            ).length;

        setText(
            "overviewPendingApplications",
            String(countStatus(["Submitted", "Under review"]))
        );
        setText("overviewApprovedApplications", String(countStatus(["Approved"])));
        setText("overviewRejectedApplications", String(countStatus(["Rejected"])));
        setPanelState("overviewApplicationsState", "");
    }

    function renderPrograms(result, failed) {
        const data = dataOf(result);

        if (!data) {
            console.error("Dashboard programs error:", result.reason);
            failed.push("programs");
            setPanelState("overviewProgramsState", "Program figures could not load.");
            return;
        }

        const programs = data.programs || [];
        const openPrograms = programs.filter(
            program => program.status === "Open"
        ).length;

        let openBatches = 0;
        let slotsRemaining = 0;

        programs.forEach(program => {
            (program.batches || []).forEach(batch => {
                if (batch.status !== "Open") return;

                const remaining = Math.max(
                    batch.slotCapacity - batch.filledCount,
                    0
                );

                slotsRemaining += remaining;

                if (remaining > 0) openBatches += 1;
            });
        });

        setText("overviewOpenPrograms", `${openPrograms} of ${programs.length}`);
        setText("overviewOpenBatches", String(openBatches));
        setText("overviewSlotsRemaining", String(slotsRemaining));
        setPanelState("overviewProgramsState", "");
    }

    function renderPayments(result, failed) {
        const data = dataOf(result);

        if (!data) {
            console.error("Dashboard payments error:", result.reason);
            failed.push("payments");
            setPanelState("overviewPaymentsState", "Payment figures could not load.");
            return;
        }

        const summary = data.summary || {};

        setText("overviewCollected", money(summary.totalCollected));
        setText("overviewOutstanding", money(summary.outstandingBalance));
        setText("overviewFullyPaid", String(summary.fullyPaidTrainees || 0));
        setPanelState("overviewPaymentsState", "");
    }

    function renderCowMaintenance(cowResult, activityResult, failed) {
        const cows = dataOf(cowResult);
        const activities = dataOf(activityResult);

        if (cows) {
            const summary = cows.summary || {};

            setText("overviewTotalCows", String(summary.total || 0));
            setText("overviewObservationCows", String(summary.underObservation || 0));
            setText("overviewTreatmentCows", String(summary.underTreatment || 0));
        } else {
            console.error("Dashboard cow records error:", cowResult.reason);
            failed.push("cow records");
            setText("overviewTotalCows", "—");
            setText("overviewObservationCows", "—");
            setText("overviewTreatmentCows", "—");
        }

        if (activities) {
            const summary = activities.summary || {};

            setText("overviewPendingActivities", String(summary.pending || 0));
        } else {
            console.error("Dashboard maintenance activities error:", activityResult.reason);
            failed.push("maintenance activities");
            setText("overviewPendingActivities", "—");
        }

        setPanelState(
            "overviewCowsState",
            cows && activities ? "" : "Some animal care figures could not load."
        );
    }

    function renderSettings(settingsResult, calendarResult, failed) {
        const settings = dataOf(settingsResult);
        const calendar = dataOf(calendarResult);

        if (settings) {
            const values = settings.settings || {};

            setText("overviewGoogleAuth", values.googleAuthEnabled ? "Enabled" : "Disabled");
            setText("overviewRecaptcha", values.recaptchaEnabled ? "Enabled" : "Disabled");
            setText("overviewEmail", values.emailEnabled === false ? "Disabled" : "Enabled");
        } else {
            console.error("Dashboard settings error:", settingsResult.reason);
            failed.push("settings");
            setText("overviewGoogleAuth", "—");
            setText("overviewRecaptcha", "—");
            setText("overviewEmail", "—");
        }

        if (calendar) {
            setText(
                "overviewCalendar",
                calendar.enabled === false
                    ? "Disabled"
                    : !calendar.configured
                        ? "Not configured"
                        : calendar.connected
                            ? "Connected"
                            : "Not connected"
            );

            if (!calendar.configured) {
                setText("overviewCalendarAccount", "Not configured");
            } else if (!calendar.connected) {
                setText("overviewCalendarAccount", "No account connected");
            } else {
                setText(
                    "overviewCalendarAccount",
                    calendar.accountEmail || "Email unavailable"
                );
            }
        } else {
            console.error("Dashboard calendar status error:", calendarResult.reason);
            failed.push("Google Calendar");
            setText("overviewCalendar", "—");
            setText("overviewCalendarAccount", "—");
        }

        setPanelState(
            "overviewSettingsState",
            settings && calendar ? "" : "Some system settings could not load."
        );
    }

    // ---------- Load ----------

    async function loadDashboard() {
        setFeedback("Loading dashboard data…");

        const keys = Object.keys(DASHBOARD_ENDPOINTS);
        const settled = await Promise.allSettled(
            keys.map(key => fetchJson(DASHBOARD_ENDPOINTS[key]))
        );

        const results = {};

        keys.forEach((key, index) => {
            results[key] = settled[index];
        });

        const unauthorized = keys.some(
            key =>
                results[key].status === "rejected" &&
                results[key].reason &&
                results[key].reason.unauthorized
        );

        if (unauthorized) {
            redirectToLogin();
            return;
        }

        const failed = [];

        renderTrainees(results.trainees, failed);
        renderAssessments(results.assessments, failed);
        renderApplications(results.applications, failed);
        renderPrograms(results.programs, failed);
        renderPayments(results.payments, failed);
        renderCowMaintenance(results.cows, results.activities, failed);
        renderSettings(results.settings, results.calendar, failed);

        setFeedback(
            failed.length
                ? `Some dashboard data could not load: ${failed.join(", ")}.`
                : ""
        );
    }

    loadDashboard();
});
