
document.addEventListener("DOMContentLoaded", () => {
    const token = localStorage.getItem("edtspToken");
    const userData = localStorage.getItem("edtspUser");

    // Check whether the user is logged in
    if (!token || !userData) {
        window.location.href = "../login.html";
        return;
    }

    let user;

    try {
        user = JSON.parse(userData);
    } catch (error) {
        localStorage.removeItem("edtspToken");
        localStorage.removeItem("edtspUser");
        window.location.href = "../login.html";
        return;
    }

    // Allow administrator accounts only
    if (user.role !== "admin") {
        window.location.href = "../login.html";
        return;
    }

    // Navigation collapse and drawers are handled by portal.js

    // Trainee register search and status filter
    const traineeTableBody = document.getElementById("traineeTableBody");

    if (traineeTableBody) {
        const traineeSearch = document.getElementById("traineeSearch");
        const statusFilter = document.getElementById("statusFilter");
        const traineeEmpty = document.getElementById("traineeEmpty");

        const filterTrainees = () => {
            const search = traineeSearch.value.trim().toLowerCase();
            const status = statusFilter.value;
            let visible = 0;

            Array.from(traineeTableBody.rows).forEach(row => {
                const matchesSearch = row.textContent.toLowerCase().includes(search);
                const badge = row.querySelector(".status-badge");
                const matchesStatus =
                    status === "all" ||
                    (badge && badge.textContent.trim() === status);
                const show = matchesSearch && matchesStatus;

                row.style.display = show ? "" : "none";

                if (show) visible += 1;
            });

            if (traineeEmpty) traineeEmpty.hidden = visible !== 0;
        };

        traineeSearch.addEventListener("input", filterTrainees);
        statusFilter.addEventListener("change", filterTrainees);
    }

    // Logout
    const logoutBtn = document.getElementById("logoutBtn");

    if (logoutBtn) {
        logoutBtn.addEventListener("click", () => {
            localStorage.removeItem("edtspToken");
            localStorage.removeItem("edtspUser");

            window.location.href = "../login.html";
        });
    }

    // Pending application badge in the sidebar
    const badges = document.querySelectorAll("[data-pending-count]");

    if (badges.length) {
        fetch("http://localhost:5000/api/admin/applications/pending-count", {
            headers: { Authorization: `Bearer ${token}` }
        })
            .then(response => (response.ok ? response.json() : null))
            .then(data => {
                if (!data || !data.success) return;

                badges.forEach(badge => {
                    badge.textContent = String(data.count);
                    badge.hidden = data.count === 0;
                });
            })
            .catch(error => {
                console.error("Pending application badge error:", error);
            });
    }
});
