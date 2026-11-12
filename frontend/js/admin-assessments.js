
document.addEventListener("DOMContentLoaded", () => {
    const modal = document.getElementById("assessmentModal");
    const createBtn = document.getElementById("createAssessmentBtn");
    const closeBtn = document.getElementById("closeAssessmentModal");
    const cancelBtn = document.getElementById("cancelAssessment");
    const form = document.getElementById("assessmentForm");
    const selectAll = document.getElementById("selectAllTrainees");

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

    // Create assessment using temporary sample data
    form.addEventListener("submit", (event) => {
        event.preventDefault();

        const selectedTrainees = document.querySelectorAll(
            'input[name="trainees"]:checked'
        );

        if (selectedTrainees.length === 0) {
            alert("Please select at least one trainee.");
            return;
        }

        const title = document.getElementById("assessmentTitle").value;
        const subject = document.getElementById("assessmentSubject").value;
        const totalScore = document.getElementById("totalScore").value;

        alert(
            `Assessment "${title}" is ready to be assigned to ${selectedTrainees.length} trainee(s).\n\nThis is currently a frontend demonstration.`
        );

        form.reset();
        closeModal();
    });
});
