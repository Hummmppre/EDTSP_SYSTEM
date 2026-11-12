
document.addEventListener("DOMContentLoaded", () => {
    const modal = document.getElementById("assessmentModal");
    const createBtn = document.getElementById("createAssessmentBtn");
    const closeBtn = document.getElementById("closeAssessmentModal");
    const cancelBtn = document.getElementById("cancelAssessment");
    const form = document.getElementById("assessmentForm");

    // Display assessment records from MongoDB
function renderAssessmentTable(assessments) {
    const tableBody = document.getElementById("assessmentTableBody");

    tableBody.innerHTML = "";

    if (!assessments || assessments.length === 0) {
        tableBody.innerHTML = `
            <tr>
                <td colspan="6" class="text-center">
                    No assessment records found.
                </td>
            </tr>
        `;
        return;
    }

    assessments.forEach(assessment => {
        const trainee = assessment.user
            ? `${assessment.user.firstName} ${assessment.user.lastName}`
            : "Unknown trainee";

        const score = assessment.score !== null &&
                      assessment.score !== undefined
            ? `${assessment.score}/${assessment.totalScore}`
            : "—";

        const dateValue = assessment.assessmentDate || assessment.createdAt;

        const date = dateValue
            ? new Date(dateValue).toLocaleDateString("en-US", {
                month: "short",
                day: "2-digit",
                year: "numeric"
            })
            : "—";

        const status = assessment.status || "Pending";
        const statusClass = status.toLowerCase();

        const row = document.createElement("tr");

        const values = [
            assessment.assessmentTitle,
            assessment.subject,
            trainee,
            score,
            date
        ];

        values.forEach((value, index) => {
            const cell = document.createElement("td");

            cell.textContent = value || "—";

            if (index === 0) {
                cell.classList.add("name");
            }

            if (index === 3) {
                cell.classList.add("num");
            }

            row.appendChild(cell);
        });


        // Status column
    const statusCell = document.createElement("td");
    const statusBadge = document.createElement("span");

    statusBadge.className = `status-badge ${statusClass}`;
    statusBadge.textContent = status;

    statusCell.appendChild(statusBadge);
    row.appendChild(statusCell);

    // Action column
    const actionCell = document.createElement("td");
    const gradeButton = document.createElement("button");

    gradeButton.type = "button";
    gradeButton.className = "btn-grade";
    gradeButton.textContent = status === "Graded" ? "Edit Grade" : "Grade";

    gradeButton.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();

    console.log("Grade clicked:", assessment._id);

    openGradeModal(assessment);
});

gradeButton.style.cursor = "pointer";
gradeButton.style.pointerEvents = "auto";

actionCell.appendChild(gradeButton);
row.appendChild(actionCell);

tableBody.appendChild(row);
    });
}

// Load assessment records and update dashboard summary
async function loadAssessments() {
    try {
        const token = localStorage.getItem("edtspToken");

        const response = await fetch(
            "http://localhost:5000/api/assessments",
            {
                headers: {
                    Authorization: `Bearer ${token}`
                }
            }
        );

        const result = await response.json();

        if (!response.ok) {
            throw new Error(result.message || "Failed to load assessments.");
        }

        const summary = result.summary;

        document.getElementById("totalAssessments").textContent =
            summary.totalAssessments;

        document.getElementById("pendingAssessments").textContent =
            summary.pendingAssessments;

        document.getElementById("gradedAssessments").textContent =
            summary.gradedAssessments;

        document.getElementById("averageScore").textContent =
            `${summary.averageScore}%`;

        renderAssessmentTable(result.assessments);
        console.log("Assessments loaded:", result.assessments);
        console.log("Assessment summary:", summary);

    } catch (error) {
        console.error("Assessment loading error:", error);
    }
}
    const selectAll = document.getElementById("selectAllTrainees");

    // Load active trainee accounts from the backend
async function loadTrainees() {
    const traineeSelection = document.getElementById("traineeSelection");
    const traineeLoading = document.getElementById("traineeLoading");

    try {
        const token = localStorage.getItem("edtspToken");

        const response = await fetch(
            "http://localhost:5000/api/assessments/trainees",
            {
                headers: {
                    Authorization: `Bearer ${token}`
                }
            }
        );

        const result = await response.json();

        if (!response.ok) {
            throw new Error(result.message || "Unable to load trainees.");
        }

        traineeSelection.querySelectorAll(
            'input[name="trainees"]'
        ).forEach(checkbox => {
            checkbox.closest("label").remove();
        });

        traineeLoading.remove();

        if (!result.trainees || result.trainees.length === 0) {
            traineeSelection.insertAdjacentHTML(
                "beforeend",
                "<p>No active trainee accounts found.</p>"
            );
            return;
        }

        result.trainees.forEach(trainee => {
            const label = document.createElement("label");
            const checkbox = document.createElement("input");

            checkbox.type = "checkbox";
            checkbox.name = "trainees";
            checkbox.value = trainee._id;

            label.appendChild(checkbox);
            label.appendChild(
                document.createTextNode(
                    ` ${trainee.firstName} ${trainee.lastName}`
                )
            );

            traineeSelection.appendChild(label);
        });

    } catch (error) {
        console.error("Trainee loading error:", error);

        traineeLoading.textContent =
            error.message || "Failed to load trainee accounts.";
    }
}
// ========================================
// GRADING MODAL
// ========================================

const gradeModal = document.getElementById("gradeModal");
const gradeForm = document.getElementById("gradeForm");
const closeGradeModal = document.getElementById("closeGradeModal");
const cancelGrade = document.getElementById("cancelGrade");

let selectedAssessmentId = null;

function openGradeModal(assessment) {
    selectedAssessmentId = assessment._id;

    document.getElementById("gradeAssessmentTitle").value =
        assessment.assessmentTitle;

    document.getElementById("gradeTraineeName").value =
        assessment.user
            ? `${assessment.user.firstName} ${assessment.user.lastName}`
            : "Unknown trainee";

    const scoreInput = document.getElementById("gradeScore");
    scoreInput.value = assessment.score ?? "";
    scoreInput.max = assessment.totalScore;

    document.getElementById("gradeTotalScore").textContent =
        `Maximum score: ${assessment.totalScore}`;

    document.getElementById("gradeRemarks").value =
        assessment.remarks || "";

    gradeModal.classList.add("show");
    document.body.classList.add("modal-open");
}

function closeGradeModalWindow() {
    gradeModal.classList.remove("show");
    document.body.classList.remove("modal-open");
    gradeForm.reset();
    selectedAssessmentId = null;
}

closeGradeModal.addEventListener("click", closeGradeModalWindow);
cancelGrade.addEventListener("click", closeGradeModalWindow);

gradeForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    if (!selectedAssessmentId) {
        alert("No assessment selected.");
        return;
    }

    const score = Number(document.getElementById("gradeScore").value);
    const remarks = document.getElementById("gradeRemarks").value.trim();
    const maximumScore = Number(document.getElementById("gradeScore").max);

    if (!Number.isFinite(score) || score < 0 || score > maximumScore) {
        alert(`Please enter a score between 0 and ${maximumScore}.`);
        return;
    }

    try {
        const token = localStorage.getItem("edtspToken");

        const response = await fetch(
            `http://localhost:5000/api/assessments/${selectedAssessmentId}/grade`,
            {
                method: "PUT",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`
                },
                body: JSON.stringify({ score, remarks })
            }
        );

        const result = await response.json();

        if (!response.ok) {
            throw new Error(result.message || "Failed to save grade.");
        }

        alert("Assessment graded successfully!");
        closeGradeModalWindow();
        await loadAssessments();

    } catch (error) {
        console.error("Grade submission error:", error);
        alert(error.message || "Unable to save the grade.");
    }
});


loadTrainees();
loadAssessments();

    // Open modal
    createBtn.addEventListener("click", () => {
        modal.classList.add("show");
    });

    // Close modal
    function closeModal() {
        modal.classList.remove("show");
    }

    closeBtn.addEventListener("click", closeModal);
    cancelBtn.addEventListener("click", closeModal);

    // Close when clicking outside the modal
    modal.addEventListener("click", (event) => {
        if (event.target === modal) {
            closeModal();
        }
    });

    // Select all trainees
    selectAll.addEventListener("change", () => {
        const traineeCheckboxes = document.querySelectorAll(
            'input[name="trainees"]'
        );

        traineeCheckboxes.forEach((checkbox) => {
            checkbox.checked = selectAll.checked;
        });
    });

    // Search and status filter for the assessment register
    const searchInput = document.getElementById("assessmentSearch");
    const statusFilter = document.getElementById("assessmentStatusFilter");
    const tableBody = document.getElementById("assessmentTableBody");
    const emptyState = document.getElementById("assessmentEmpty");

    function filterAssessments() {
        const search = searchInput.value.trim().toLowerCase();
        const status = statusFilter.value;
        let visible = 0;

        Array.from(tableBody.rows).forEach((row) => {
            const matchesSearch = row.textContent.toLowerCase().includes(search);
            const badge = row.querySelector(".status-badge");
            const matchesStatus =
                status === "all" ||
                (badge && badge.textContent.trim() === status);
            const show = matchesSearch && matchesStatus;

            row.style.display = show ? "" : "none";

            if (show) visible += 1;
        });

        emptyState.hidden = visible !== 0;
    }

    searchInput.addEventListener("input", filterAssessments);
    statusFilter.addEventListener("change", filterAssessments);

   // Create assessment and save it to the backend
form.addEventListener("submit", async (event) => {
    event.preventDefault();

    const selectedTrainees = document.querySelectorAll(
        'input[name="trainees"]:checked'
    );

    if (selectedTrainees.length === 0) {
        alert("Please select at least one trainee.");
        return;
    }

    const assessmentData = {
        traineeIds: Array.from(selectedTrainees).map(
            checkbox => checkbox.value
        ),
        assessmentTitle: document.getElementById("assessmentTitle").value.trim(),
        subject: document.getElementById("assessmentSubject").value.trim(),
        assessmentType: document.getElementById("assessmentType").value,
        totalScore: Number(document.getElementById("totalScore").value),
        assessmentDate: document.getElementById("assessmentDate").value || null,
        dueDate: document.getElementById("assessmentDueDate").value || null,
        remarks: document.getElementById("assessmentRemarks").value.trim()
    };

    try {
        const token = localStorage.getItem("edtspToken");

        const response = await fetch("http://localhost:5000/api/assessments", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`
            },
            body: JSON.stringify(assessmentData)
        });

        const result = await response.json();

        if (!response.ok) {
            throw new Error(result.message || "Failed to create assessment.");
        }

        alert("Assessment successfully assigned!");

        form.reset();
        closeModal();

        // Reload the assessment register after successful creation.
        location.reload();

    } catch (error) {
        console.error("Assessment creation error:", error);
        alert(error.message || "Unable to connect to the server.");
    }
});
});
