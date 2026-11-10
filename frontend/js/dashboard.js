
// =============================
// EDTSP TRAINEE DASHBOARD
// =============================

const API_URL = "http://localhost:5000/api/trainee";

const token = localStorage.getItem("edtspToken");
const userData = localStorage.getItem("edtspUser");

let user = null;
let traineeProfile = null;

// =============================
// AUTHENTICATION CHECK
// =============================

if (!token || !userData) {
    window.location.href = "../login.html";
} else {
    try {
        user = JSON.parse(userData);

        if (!user || user.role !== "trainee") {
            localStorage.removeItem("edtspToken");
            localStorage.removeItem("edtspUser");
            window.location.href = "../login.html";
        }

    } catch (error) {
        localStorage.removeItem("edtspToken");
        localStorage.removeItem("edtspUser");
        window.location.href = "../login.html";
    }
}


// =============================
// SAFE ELEMENT DISPLAY
// =============================

function setText(id, value) {
    const element = document.getElementById(id);

    if (element) {
        element.textContent = value ?? "";
    }
}


// =============================
// LOAD TRAINEE INFORMATION
// =============================

async function loadTraineeProfile() {
    try {
        const response = await fetch(`${API_URL}/me`, {
            method: "GET",
            headers: {
                "Authorization": `Bearer ${token}`
            }
        });

        const data = await response.json();

        if (response.status === 401) {
            localStorage.removeItem("edtspToken");
            localStorage.removeItem("edtspUser");
            window.location.href = "../login.html";
            return;
        }

        if (!response.ok || !data.success) {
            throw new Error(data.message || "Unable to load trainee information.");
        }

        user = data.user;
        traineeProfile = data.profile;

        // Update saved account information
        localStorage.setItem("edtspUser", JSON.stringify(user));

        displayTraineeInformation();

        console.log("Trainee information loaded successfully.");

    } catch (error) {
        console.error("Trainee profile error:", error);
    }
}


// =============================
// DISPLAY TRAINEE INFORMATION
// =============================

function displayTraineeInformation() {
    if (!user) return;

    const firstName = user.firstName || "";
    const lastName = user.lastName || "";

    const fullName = `${firstName} ${lastName}`.trim();

    const initials =
        `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase();

    // Sidebar
    setText("sidebarName", fullName);
    setText("userInitials", initials);

    // Topbar
    setText("topbarName", fullName);
    setText("topbarInitials", initials);

    // Welcome message
    setText("welcomeName", firstName);

    // Profile information
    setText("profileName", fullName);
    setText("profileEmail", user.email);

    // MongoDB trainee profile
    if (traineeProfile) {
        setText("traineeId", traineeProfile.traineeId || "Not assigned");
        setText("profileProgram", traineeProfile.program || "Not assigned");
        setText("profileStatus", traineeProfile.enrollmentStatus || "Pending");
        setText("profilePhone", traineeProfile.phone || "Not provided");
        setText("profileAddress", traineeProfile.address || "Not provided");

        // Update training status color
        const statusElement = document.getElementById("profileStatus");

        if (statusElement) {
            statusElement.classList.remove("status-active");

            if (traineeProfile.enrollmentStatus === "Ongoing") {
                statusElement.classList.add("status-active");
            }
        }
    }
}


// =============================
// SIDEBAR TOGGLE
// =============================

const sidebar = document.getElementById("sidebar");
const menuToggle = document.getElementById("menuToggle");

if (menuToggle && sidebar) {
    menuToggle.addEventListener("click", () => {
    if (window.innerWidth > 850) {
        document.querySelector(".dashboard-container")
            .classList.toggle("sidebar-collapsed");
    } else {
        sidebar.classList.toggle("show");
    }
});
}


// Close sidebar after selecting a navigation link
document.querySelectorAll(".sidebar-nav .nav-link").forEach(link => {
    link.addEventListener("click", () => {
        if (window.innerWidth <= 850 && sidebar) {
            sidebar.classList.remove("show");
        }
    });
});


// =============================
// ACTIVE NAVIGATION
// =============================

document.querySelectorAll(".sidebar-nav .nav-link").forEach(link => {
    link.addEventListener("click", () => {

        document.querySelectorAll(".sidebar-nav .nav-link")
            .forEach(item => item.classList.remove("active"));

        if (link.id !== "logoutButton") {
            link.classList.add("active");
        }
    });
});


// =============================
// LOGOUT
// =============================

const logoutButton = document.getElementById("logoutButton");

if (logoutButton) {
    logoutButton.addEventListener("click", event => {
        event.preventDefault();

        const confirmLogout = confirm(
            "Are you sure you want to log out?"
        );

        if (confirmLogout) {
            localStorage.removeItem("edtspToken");
            localStorage.removeItem("edtspUser");

            window.location.href = "../login.html";
        }
    });
}


// =============================
// INITIALIZE DASHBOARD
// =============================

if (token && user && user.role === "trainee") {
    displayTraineeInformation();
    loadTraineeProfile();
}
