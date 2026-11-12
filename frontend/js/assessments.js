const ASSESSMENTS_API_URL = "http://localhost:5000/api/assessments/me";

const STATUS_STYLES = {
    Pending: "pending",
    Completed: "completed",
    Graded: "completed"
};

document.addEventListener("DOMContentLoaded", loadAssessments);

async function loadAssessments() {
    const token = localStorage.getItem("edtspToken");

    if (!token) {
        window.location.href = "../login.html";
        return;
    }

    const assessmentList = document.getElementById("assessmentList");

    try {
        const response = await fetch(ASSESSMENTS_API_URL, {
            method: "GET",
            headers: {
                Authorization: `Bearer ${token}`,
                "Content-Type": "application/json"
            }
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.message || "Unable to load assessments.");
        }

        const assessments = Array.isArray(data.assessments) ? data.assessments : [];

        displayAssessmentSummary(assessments);
        displayAssessmentList(assessments);

    } catch (error) {
        console.error("Assessment loading error:", error);

        showAssessmentState(
            assessmentList,
            "Assessments unavailable",
            "We could not load your assessment records. Refresh the page to try again.",
            "alert"
        );
    }
}

function showAssessmentState(container, title, text, role) {
    const state = document.createElement("div");
    const heading = document.createElement("strong");
    const copy = document.createElement("p");

    state.className = "state";

    if (role) state.setAttribute("role", role);

    heading.textContent = title;
    copy.textContent = text;

    state.append(heading, copy);
    container.replaceChildren(state);
}

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

// Display assessment summary
function displayAssessmentSummary(assessments) {
    const total = assessments.length;

    const completed = assessments.filter(
        item => ["Completed", "Graded"].includes(item.status)
    ).length;

    const pending = assessments.filter(
        item => item.status === "Pending"
    ).length;

    const gradedAssessments = assessments.filter(
        item =>
            item.status === "Graded" &&
            item.score !== null &&
            Number.isFinite(Number(item.score))
    );

    let average = 0;

    if (gradedAssessments.length > 0) {
        const totalPercentage = gradedAssessments.reduce(
            (sum, item) => {
                return sum + (Number(item.score) / item.totalScore) * 100;
            },
            0
        );

        average = totalPercentage / gradedAssessments.length;
    }

    document.getElementById("totalAssessments").textContent = total;
    document.getElementById("completedAssessments").textContent = completed;
    document.getElementById("pendingAssessments").textContent = pending;
    document.getElementById("averageScore").textContent =
        `${average.toFixed(1)}/100`;
}

// Display individual assessment records
function displayAssessmentList(assessments) {
    const container = document.getElementById("assessmentList");

    if (assessments.length === 0) {
        showAssessmentState(
            container,
            "No assessments assigned",
            "When the training office assigns an assessment, it will appear here with its dates and result."
        );
        return;
    }

    container.replaceChildren();

    assessments.forEach(assessment => {
        const item = document.createElement("article");
        item.className = "assessment-item";

        const top = document.createElement("div");
        top.className = "assessment-item__top";

        const identity = document.createElement("div");

        const title = document.createElement("strong");
        title.textContent = assessment.assessmentTitle || "Untitled assessment";

        const subject = document.createElement("p");
        subject.className = "assessment-item__subject";
        subject.textContent = assessment.subject || "No subject recorded";

        identity.append(title, subject);

        const status = document.createElement("span");
        status.className = `status-badge ${STATUS_STYLES[assessment.status] || "pending"}`;
        status.textContent = assessment.status || "Pending";

        top.append(identity, status);

        const date = formatDate(assessment.assessmentDate);
        const meta = document.createElement("p");
        meta.className = "assessment-item__meta";
        meta.textContent = date
            ? `Assessment date · ${date}`
            : "Assessment date not set";

        item.append(top, meta);

        if (
            ["Graded", "Completed"].includes(assessment.status) &&
            assessment.score !== null &&
            assessment.score !== undefined
        ) {
            const result = document.createElement("div");
            result.className = "assessment-item__result";

            const score = document.createElement("span");
            score.className = "assessment-item__score";
            score.textContent = assessment.score;

            const points = document.createElement("span");
            points.textContent = `out of ${assessment.totalScore} points`;

            result.append(score, points);
            item.append(result);
        }

        if (assessment.remarks) {
            const remarks = document.createElement("p");
            remarks.className = "assessment-item__remarks";
            remarks.textContent = assessment.remarks;

            item.append(remarks);
        }

        container.append(item);
    });
}
