
const API_URL = "http://localhost:5000/api/assessments/me";

document.addEventListener("DOMContentLoaded", loadAssessments);

async function loadAssessments() {
    const token = localStorage.getItem("edtspToken");

    if (!token) {
        window.location.href = "../login.html";
        return;
    }

    const assessmentList = document.getElementById("assessmentList");

    try {
        const response = await fetch(API_URL, {
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

        displayAssessmentSummary(data.assessments);
        displayAssessmentList(data.assessments);

    } catch (error) {
        console.error("Assessment loading error:", error);

        assessmentList.textContent =
            "Unable to load assessments. Please refresh the page.";
    }
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

    container.replaceChildren();

    if (assessments.length === 0) {
        const message = document.createElement("p");
        message.className = "empty-state";
        message.textContent = "You currently have no assigned assessments.";

        container.appendChild(message);
        return;
    }

    assessments.forEach(assessment => {
        const card = document.createElement("div");
        card.className = "progress-item";

        const info = document.createElement("div");
        info.className = "progress-info";

        const title = document.createElement("strong");
        title.textContent = assessment.assessmentTitle;

        const status = document.createElement("span");
        status.textContent = assessment.status;

        info.append(title, status);

        const subject = document.createElement("p");
        subject.textContent = assessment.subject;

        card.append(info, subject);

        if (assessment.assessmentDate) {
            const date = document.createElement("p");
            date.textContent =
                "Assessment Date: " +
                new Date(assessment.assessmentDate).toLocaleDateString();

            card.appendChild(date);
        }

        if (assessment.status === "Graded" && assessment.score !== null) {
            const result = document.createElement("div");
            result.className = "assessment-result";

            const score = document.createElement("div");
            score.className = "assessment-score";
            score.textContent = assessment.score;

            const details = document.createElement("div");

            const label = document.createElement("strong");
            label.textContent = "Your Score";

            const points = document.createElement("p");
            points.textContent =
                `${assessment.score} out of ${assessment.totalScore} points`;

            details.append(label, points);
            result.append(score, details);

            card.appendChild(result);
        }

        if (assessment.remarks) {
            const remarks = document.createElement("p");
            remarks.textContent = "Remarks: " + assessment.remarks;

            card.appendChild(remarks);
        }

        container.appendChild(card);
    });
}
