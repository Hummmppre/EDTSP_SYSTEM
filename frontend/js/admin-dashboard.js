const DASHBOARD_TRAINEES_URL = "http://localhost:5000/api/admin/trainees";
const DASHBOARD_ASSESSMENTS_URL = "http://localhost:5000/api/assessments";

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

    const token = localStorage.getItem("edtspToken");

    function redirectToLogin() {
        localStorage.removeItem("edtspToken");
        localStorage.removeItem("edtspUser");
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

    function setText(id, value) {
        const element = document.getElementById(id);

        if (element) element.textContent = value;
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

    async function loadDashboard() {
        setFeedback("Loading dashboard data…");

        const [traineeResult, assessmentResult] = await Promise.allSettled([
            fetchJson(DASHBOARD_TRAINEES_URL),
            fetchJson(DASHBOARD_ASSESSMENTS_URL)
        ]);

        if (
            (traineeResult.status === "rejected" &&
                traineeResult.reason &&
                traineeResult.reason.unauthorized) ||
            (assessmentResult.status === "rejected" &&
                assessmentResult.reason &&
                assessmentResult.reason.unauthorized)
        ) {
            redirectToLogin();
            return;
        }

        const failed = [];

        if (traineeResult.status === "fulfilled") {
            const summary = traineeResult.value.summary || {};

            setText("totalTrainees", String(summary.total || 0));
            setText("activeTrainees", String(summary.ongoing || 0));
        } else {
            console.error("Dashboard trainee summary error:", traineeResult.reason);
            failed.push("trainees");
        }

        if (assessmentResult.status === "fulfilled") {
            const data = assessmentResult.value;
            const assessments = data.assessments || [];
            const pending = assessments.filter(
                assessment =>
                    assessment.status === "Pending" ||
                    assessment.status === "Completed"
            ).length;

            setText("totalAssessments", String(data.count || assessments.length));
            setText("pendingAssessments", String(pending));

            renderRecentAssessments(assessments);
        } else {
            console.error("Dashboard assessment summary error:", assessmentResult.reason);
            failed.push("assessments");
        }

        setFeedback(
            failed.length
                ? `Some dashboard data could not load: ${failed.join(" and ")}.`
                : ""
        );
    }

    loadDashboard();
});
