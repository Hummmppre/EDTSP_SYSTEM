document.addEventListener("DOMContentLoaded", () => {
  const ASSESSMENT_STATUS_CLASSES = {
    Pending: "pending",
    Completed: "completed",
    Graded: "completed",
  };

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

    assessments.forEach((assessment) => {
      const trainee = assessment.user
        ? `${assessment.user.firstName} ${assessment.user.lastName}`
        : "Unknown trainee";

      const score =
        assessment.score !== null && assessment.score !== undefined
          ? `${assessment.score}/${assessment.totalScore}`
          : "—";

      const dateValue = assessment.assessmentDate || assessment.createdAt;

      const date = dateValue
        ? new Date(dateValue).toLocaleDateString("en-US", {
            month: "short",
            day: "2-digit",
            year: "numeric",
          })
        : "—";

      const status = assessment.status || "Pending";
      const statusClass = ASSESSMENT_STATUS_CLASSES[status] || "pending";

      const row = document.createElement("tr");

      const values = [
        assessment.assessmentTitle,
        assessment.subject,
        trainee,
        score,
        date,
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

    // Keep the active search/status filter applied after a re-render.
    filterAssessments();
  }

  // Load assessment records and update dashboard summary
  async function loadAssessments() {
    try {
      const token =
        localStorage.getItem("edtspToken") ||
        sessionStorage.getItem("edtspToken");

      const response = await fetch("http://localhost:5000/api/assessments", {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

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
      const token =
        localStorage.getItem("edtspToken") ||
        sessionStorage.getItem("edtspToken");

      const response = await fetch(
        "http://localhost:5000/api/assessments/trainees",
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
      );

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.message || "Unable to load trainees.");
      }

      traineeSelection
        .querySelectorAll('input[name="trainees"]')
        .forEach((checkbox) => {
          checkbox.closest("label").remove();
        });

      traineeLoading.remove();

      if (!result.trainees || result.trainees.length === 0) {
        traineeSelection.insertAdjacentHTML(
          "beforeend",
          "<p>No active trainee accounts found.</p>",
        );
        return;
      }

      result.trainees.forEach((trainee) => {
        const label = document.createElement("label");
        const checkbox = document.createElement("input");

        checkbox.type = "checkbox";
        checkbox.name = "trainees";
        checkbox.value = trainee._id;

        label.appendChild(checkbox);
        label.appendChild(
          document.createTextNode(` ${trainee.firstName} ${trainee.lastName}`),
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
    clearFieldErrors(gradeForm);

    document.getElementById("gradeAssessmentTitle").value =
      assessment.assessmentTitle;

    document.getElementById("gradeTraineeName").value = assessment.user
      ? `${assessment.user.firstName} ${assessment.user.lastName}`
      : "Unknown trainee";

    const scoreInput = document.getElementById("gradeScore");
    scoreInput.value = assessment.score ?? "";
    scoreInput.max = assessment.totalScore;
    setFieldError(scoreInput, "");

    document.getElementById("gradeTotalScore").textContent =
      `Maximum score: ${assessment.totalScore}`;

    document.getElementById("gradeRemarks").value = assessment.remarks || "";

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
      showToast("No assessment selected.", "error");
      return;
    }

    const scoreInput = document.getElementById("gradeScore");
    const score = Number(scoreInput.value);
    const remarks = document.getElementById("gradeRemarks").value.trim();
    const maximumScore = Number(scoreInput.max);

    if (
      !scoreInput.value.trim() ||
      !Number.isFinite(score) ||
      score < 0 ||
      score > maximumScore
    ) {
      setFieldError(
        scoreInput,
        `Enter a score between 0 and ${maximumScore}.`,
      );
      scoreInput.focus();
      return;
    }

    setFieldError(scoreInput, "");

    try {
      const token =
        localStorage.getItem("edtspToken") ||
        sessionStorage.getItem("edtspToken");

      const response = await fetch(
        `http://localhost:5000/api/assessments/${selectedAssessmentId}/grade`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ score, remarks }),
        },
      );

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.message || "Failed to save grade.");
      }

      showToast("Assessment graded successfully!", "success");
      closeGradeModalWindow();
      await loadAssessments();
    } catch (error) {
      console.error("Grade submission error:", error);
      showToast(error.message || "Unable to save the grade.", "error");
    }
  });

  loadTrainees();
  loadAssessments();

  // Open modal
  createBtn.addEventListener("click", () => {
    clearFieldErrors(form);
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
      'input[name="trainees"]',
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
        status === "all" || (badge && badge.textContent.trim() === status);
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

    const titleInput = document.getElementById("assessmentTitle");
    const subjectInput = document.getElementById("assessmentSubject");
    const typeInput = document.getElementById("assessmentType");
    const totalScoreInput = document.getElementById("totalScore");
    const traineeSelection = document.getElementById("traineeSelection");

    [titleInput, subjectInput, typeInput, totalScoreInput, traineeSelection]
      .forEach((field) => setFieldError(field, ""));

    if (!titleInput.value.trim()) {
      setFieldError(titleInput, "Enter an assessment title.");
      titleInput.focus();
      return;
    }

    if (!subjectInput.value.trim()) {
      setFieldError(subjectInput, "Enter the assessment subject.");
      subjectInput.focus();
      return;
    }

    if (!typeInput.value) {
      setFieldError(typeInput, "Choose an assessment type.");
      typeInput.focus();
      return;
    }

    const totalScore = Number(totalScoreInput.value);

    if (!Number.isFinite(totalScore) || totalScore < 1) {
      setFieldError(totalScoreInput, "Total score must be at least 1.");
      totalScoreInput.focus();
      return;
    }

    const selectedTrainees = document.querySelectorAll(
      'input[name="trainees"]:checked',
    );

    if (selectedTrainees.length === 0) {
      setFieldError(traineeSelection, "Select at least one trainee.");
      return;
    }

    const assessmentData = {
      traineeIds: Array.from(selectedTrainees).map(
        (checkbox) => checkbox.value,
      ),
      assessmentTitle: titleInput.value.trim(),
      subject: subjectInput.value.trim(),
      assessmentType: typeInput.value,
      totalScore,
      assessmentDate: document.getElementById("assessmentDate").value || null,
      dueDate: document.getElementById("assessmentDueDate").value || null,
      remarks: document.getElementById("assessmentRemarks").value.trim(),
    };

    try {
      const token =
        localStorage.getItem("edtspToken") ||
        sessionStorage.getItem("edtspToken");

      const response = await fetch("http://localhost:5000/api/assessments", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(assessmentData),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.message || "Failed to create assessment.");
      }

      showToast("Assessment successfully assigned!", "success");

      form.reset();
      closeModal();

      // Reload the assessment register after successful creation.
      location.reload();
    } catch (error) {
      console.error("Assessment creation error:", error);
      showToast(error.message || "Unable to connect to the server.", "error");
    }
  });
});
