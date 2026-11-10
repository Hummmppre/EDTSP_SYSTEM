
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

    // Sidebar toggle
    const sidebarToggle = document.getElementById("sidebarToggle");
    const dashboardContainer = document.querySelector(".dashboard-container");

    if (sidebarToggle && dashboardContainer) {
        sidebarToggle.addEventListener("click", () => {
            dashboardContainer.classList.toggle("sidebar-collapsed");
        });
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
});
