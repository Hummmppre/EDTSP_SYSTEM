
document.addEventListener("DOMContentLoaded", () => {

    // Modal elements
    const cowModal = document.getElementById("cowModal");
    const activityModal = document.getElementById("activityModal");

    // Modal buttons
    const addCowBtn = document.getElementById("addCowBtn");
    const addActivityBtn = document.getElementById("addActivityBtn");

    const closeCowBtn = document.getElementById("closeCowModal");
    const cancelCowBtn = document.getElementById("cancelCow");

    const closeActivityBtn = document.getElementById("closeActivityModal");
    const cancelActivityBtn = document.getElementById("cancelActivity");

    // Forms
    const cowForm = document.getElementById("cowForm");
    const activityForm = document.getElementById("activityForm");

    // Open and close modals
    addCowBtn.addEventListener("click", () => cowModal.classList.add("show"));
    addActivityBtn.addEventListener("click", () => activityModal.classList.add("show"));

    function closeModal(modal) {
        modal.classList.remove("show");
    }

    closeCowBtn.addEventListener("click", () => closeModal(cowModal));
    cancelCowBtn.addEventListener("click", () => closeModal(cowModal));

    closeActivityBtn.addEventListener("click", () => closeModal(activityModal));
    cancelActivityBtn.addEventListener("click", () => closeModal(activityModal));

    [cowModal, activityModal].forEach((modal) => {
        modal.addEventListener("click", (event) => {
            if (event.target === modal) closeModal(modal);
        });
    });

    // Add cow record to the table (temporary demonstration)
    cowForm.addEventListener("submit", (event) => {
        event.preventDefault();

        const cowId = document.getElementById("cowId").value.trim();
        const cowName = document.getElementById("cowName").value.trim();
        const cowBreed = document.getElementById("cowBreed").value.trim();
        const cowAge = document.getElementById("cowAge").value;
        const cowTrainee = document.getElementById("cowTrainee").value.trim();
        const cowHealth = document.getElementById("cowHealth").value;

        const existingIds = Array.from(
            document.querySelectorAll("#cowTableBody tr td:first-child")
        ).map((cell) => cell.textContent.toLowerCase());

        if (existingIds.includes(cowId.toLowerCase())) {
            alert("This Cow ID already exists.");
            return;
        }

        const row = document.createElement("tr");
        row.dataset.health = cowHealth;

        const values = [
            cowId,
            cowName,
            cowBreed,
            `${cowAge} Years`,
            cowTrainee || "Unassigned"
        ];

        values.forEach((value) => {
            const cell = document.createElement("td");
            cell.textContent = value;
            row.appendChild(cell);
        });

        const statusCell = document.createElement("td");
        const badge = document.createElement("span");
        badge.className = "status-badge " +
            (cowHealth === "Healthy" ? "completed" :
             cowHealth === "Under Observation" ? "pending" : "inactive");
        badge.textContent = cowHealth;
        statusCell.appendChild(badge);
        row.appendChild(statusCell);

        const actionCell = document.createElement("td");
        const viewBtn = document.createElement("button");
        viewBtn.className = "view-btn";
        viewBtn.textContent = "View";
        viewBtn.addEventListener("click", () => {
            alert("Cow Record\n\n" + values.join("\n") + "\n" + cowHealth);
        });
        actionCell.appendChild(viewBtn);
        row.appendChild(actionCell);

        document.getElementById("cowTableBody").appendChild(row);

        cowForm.reset();
        closeModal(cowModal);
        alert("Cow record added to the demonstration table.");
    });

    // Add maintenance activity to the table (temporary demonstration)
    activityForm.addEventListener("submit", (event) => {
        event.preventDefault();

        const cow = document.getElementById("activityCow").value;
        const type = document.getElementById("activityType").value;
        const description = document.getElementById("activityDescription").value.trim();
        const date = document.getElementById("activityDate").value;
        const time = document.getElementById("activityTime").value;
        const trainee = document.getElementById("activityTrainee").value.trim();

        const row = document.createElement("tr");
        row.dataset.type = type;
        row.dataset.status = "Pending";

        const values = [
            cow,
            type,
            description,
            `${date} ${time}`,
            trainee
        ];

        values.forEach((value) => {
            const cell = document.createElement("td");
            cell.textContent = value;
            row.appendChild(cell);
        });

        const statusCell = document.createElement("td");
        const badge = document.createElement("span");
        badge.className = "status-badge pending";
        badge.textContent = "Pending";
        statusCell.appendChild(badge);
        row.appendChild(statusCell);

        const actionCell = document.createElement("td");
        const viewBtn = document.createElement("button");
        viewBtn.className = "view-btn";
        viewBtn.textContent = "View";
        viewBtn.addEventListener("click", () => {
            alert("Maintenance Activity\n\n" + values.join("\n") + "\nStatus: Pending");
        });
        actionCell.appendChild(viewBtn);
        row.appendChild(actionCell);

        document.getElementById("activityTableBody").appendChild(row);

        activityForm.reset();
        closeModal(activityModal);
        alert("Maintenance activity added to the demonstration table.");
    });

    // Cow search and health filter
    const cowSearch = document.getElementById("cowSearch");
    const cowHealthFilter = document.getElementById("cowHealthFilter");

    function filterCows() {
        const search = cowSearch.value.toLowerCase();
        const status = cowHealthFilter.value;

        document.querySelectorAll("#cowTableBody tr").forEach((row) => {
            const matchesSearch = row.textContent.toLowerCase().includes(search);
            const matchesStatus = status === "all" || row.dataset.health === status;

            row.style.display = matchesSearch && matchesStatus ? "" : "none";
        });
    }

    cowSearch.addEventListener("input", filterCows);
    cowHealthFilter.addEventListener("change", filterCows);

    // Activity search and filters
    const activitySearch = document.getElementById("activitySearch");
    const activityTypeFilter = document.getElementById("activityTypeFilter");
    const activityStatusFilter = document.getElementById("activityStatusFilter");

    function filterActivities() {
        const search = activitySearch.value.toLowerCase();
        const type = activityTypeFilter.value;
        const status = activityStatusFilter.value;

        document.querySelectorAll("#activityTableBody tr").forEach((row) => {
            const matchesSearch = row.textContent.toLowerCase().includes(search);
            const matchesType = type === "all" || row.dataset.type === type;
            const matchesStatus = status === "all" || row.dataset.status === status;

            row.style.display = matchesSearch && matchesType && matchesStatus ? "" : "none";
        });
    }

    activitySearch.addEventListener("input", filterActivities);
    activityTypeFilter.addEventListener("change", filterActivities);
    activityStatusFilter.addEventListener("change", filterActivities);

});
