
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

        // Update training status badge
        const statusElement = document.getElementById("profileStatus");

        if (statusElement) {
            const statusStyles = {
                Ongoing: "ongoing",
                Completed: "completed",
                Inactive: "inactive",
                Pending: "pending"
            };

            statusElement.classList.remove(
                "ongoing",
                "completed",
                "inactive",
                "pending"
            );

            statusElement.classList.add(
                statusStyles[traineeProfile.enrollmentStatus] || "pending"
            );
        }
    }
}


// =============================
// TRAINING APPLICATION PANEL
// =============================

const APPLICATION_API_URL = "http://localhost:5000/api/applications";

const APPLICATION_STATUSES = {
    "Submitted": { label: "Submitted", className: "submitted" },
    "Under review": { label: "Under review", className: "under-review" },
    "Approved": { label: "Approved", className: "approved" },
    "Rejected": { label: "Rejected", className: "rejected" },
    "Withdrawn": { label: "Withdrawn", className: "withdrawn" }
};

function formatApplicationDate(value) {
    if (!value) return "—";

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) return "—";

    return date.toLocaleDateString("en-PH", {
        year: "numeric",
        month: "short",
        day: "numeric"
    });
}

function showApplicationPanel(state) {
    const title = document.getElementById("applicationStateTitle");
    const text = document.getElementById("applicationStateText");
    const facts = document.getElementById("applicationFacts");
    const badge = document.getElementById("applicationStatus");
    const cta = document.getElementById("applicationCta");
    const link = document.getElementById("applicationLink");

    if (!title || !text) return;

    const application = state.application;

    facts.hidden = !application;
    badge.hidden = !application;

    if (application) {
        const style = APPLICATION_STATUSES[application.status] || APPLICATION_STATUSES.Submitted;

        badge.textContent = style.label;
        badge.className = `status-badge ${style.className}`;

        setText("applicationProgram", application.program ? application.program.name : "—");
        setText("applicationBatch", application.batch ? application.batch.label : "—");
        setText("applicationSubmitted", formatApplicationDate(application.submittedAt));
    }

    if (state.reason === "already_enrolled") {
        title.textContent = "Already enrolled";
        text.textContent = "Your enrollment is active. The training office will share schedule details.";
    } else if (state.reason === "completed") {
        title.textContent = "Training completed";
        text.textContent = "Your training is complete, so applications are closed for this account.";
    } else if (state.reason === "account_inactive") {
        title.textContent = "Account inactive";
        text.textContent = "Please contact the administrator to restore access before applying.";
    } else if (!application) {
        title.textContent = "No application yet";
        text.textContent = "Apply for an open training program to start your enrolment.";
    } else if (application.status === "Submitted" || application.status === "Under review") {
        title.textContent = "Under review";
        text.textContent = "We will email you once a decision is made. You can withdraw it before then.";
    } else if (application.status === "Approved") {
        title.textContent = "Approved";
        text.textContent = "Next step: pay the training fee, then wait for schedule details from the training office.";
    } else if (application.status === "Rejected") {
        title.textContent = "Not approved";
        text.textContent = application.publicNote || "You can submit a new application when you are ready.";
    } else {
        title.textContent = "Withdrawn";
        text.textContent = "This application is closed. You can submit a new one when you are ready.";
    }

    cta.hidden = false;
    cta.textContent = state.canApply ? "Apply for training" : "View application";
    link.textContent = state.canApply ? "Apply" : "View";
}

async function loadApplicationPanel() {
    if (!document.getElementById("applicationStateTitle")) return;

    try {
        const response = await fetch(`${APPLICATION_API_URL}/me`, {
            method: "GET",
            headers: {
                "Authorization": `Bearer ${token}`
            }
        });

        if (response.status === 401) {
            localStorage.removeItem("edtspToken");
            localStorage.removeItem("edtspUser");
            window.location.href = "../login.html";
            return;
        }

        const data = await response.json();

        if (!response.ok || !data.success) {
            throw new Error(data.message || "Unable to load your application.");
        }

        showApplicationPanel(data);

    } catch (error) {
        console.error("Training application error:", error);

        setText("applicationStateTitle", "Application unavailable");
        setText("applicationStateText", "Open the application page to check your status.");
    }
}


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
    loadApplicationPanel();
}
