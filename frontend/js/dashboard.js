
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

    displayEnrollmentCard();
}


// =============================
// DASHBOARD SUMMARY (LIVE)
// =============================

const DASHBOARD_PAYMENTS_URL = `${API_URL}/payments`;
const DASHBOARD_ASSESSMENTS_URL = "http://localhost:5000/api/assessments/me";

const ENROLLMENT_NOTES = {
    Pending: "Awaiting confirmation",
    Ongoing: "Currently in training",
    Completed: "Training completed",
    Inactive: "Enrolment inactive"
};

function formatMoney(value) {
    const amount = Number(value || 0);
    const hasCents = Math.round(amount * 100) % 100 !== 0;

    return `₱${amount.toLocaleString("en-PH", {
        minimumFractionDigits: hasCents ? 2 : 0,
        maximumFractionDigits: 2
    })}`;
}

function setDashboardFeedback(message) {
    const feedback = document.getElementById("dashboardFeedback");

    if (!feedback) return;

    feedback.textContent = message || "";
    feedback.hidden = !message;
}

function displayEnrollmentCard() {
    if (!document.getElementById("enrollmentStatus")) return;

    const status = (traineeProfile && traineeProfile.enrollmentStatus) || "Pending";

    setText("enrollmentStatus", status);
    setText(
        "enrollmentStatusNote",
        traineeProfile
            ? (ENROLLMENT_NOTES[status] || "Training record on file")
            : "No training record yet"
    );
}

function renderPaymentSummary(summary = {}) {
    const fee = Number(summary.totalFee) || 0;
    const paid = Number(summary.totalPaid) || 0;
    const balance = Number(summary.balance) || 0;
    const accountCount = Number(summary.accountCount) || 0;
    const percent = fee > 0 ? Math.min(100, Math.round((paid / fee) * 100)) : 0;

    setText("paymentBalance", formatMoney(balance));
    setText(
        "paymentBalanceNote",
        accountCount ? `of ${formatMoney(fee)} total fee` : "No fee assigned yet"
    );

    setText("feePercent", String(percent));
    setText("feeTotal", formatMoney(fee));
    setText("feePaid", formatMoney(paid));
    setText("feeBalance", formatMoney(balance));
    setText(
        "feeNote",
        !accountCount
            ? "No fee assigned yet."
            : (fee > 0
                ? `${formatMoney(paid)} of the ${formatMoney(fee)} fee received.`
                : "No fee due for this program.")
    );
    setText(
        "feeNextStep",
        !accountCount
            ? "Wait for an approved application."
            : (balance > 0
                ? "Settle the balance with the training office."
                : "Fully paid. No balance due.")
    );

    const meter = document.getElementById("feeMeterFill");

    if (meter) meter.style.width = `${percent}%`;
}

function renderAssessmentSummary(assessments) {
    const graded = assessments.filter(assessment =>
        assessment.status === "Graded" &&
        typeof assessment.score === "number" &&
        Number(assessment.totalScore) > 0
    );

    if (graded.length) {
        const average = graded.reduce(
            (total, assessment) =>
                total + (assessment.score / Number(assessment.totalScore)) * 100,
            0
        ) / graded.length;

        setText("assessmentAverage", `${Math.round(average)}/100`);
        setText(
            "assessmentAverageNote",
            `Based on ${graded.length} graded assessment${graded.length === 1 ? "" : "s"}`
        );
    } else {
        setText("assessmentAverage", "—");
        setText("assessmentAverageNote", "No graded assessments yet");
    }

    const pending = assessments.filter(
        assessment =>
            assessment.status === "Pending" ||
            assessment.status === "Completed"
    ).length;

    setText("pendingAssessments", String(pending));
    setText("pendingAssessmentsNote", "Pending or completed, not graded yet");
}

async function fetchDashboardJson(url) {
    const response = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` }
    });

    if (response.status === 401) {
        const error = new Error("Your session has expired.");

        error.unauthorized = true;
        throw error;
    }

    const data = await response.json();

    if (!response.ok || !data.success) {
        throw new Error(data.message || "Unable to load dashboard data.");
    }

    return data;
}

async function loadDashboardSummary() {
    if (!document.getElementById("paymentBalance")) return;

    setDashboardFeedback("Loading dashboard data…");

    const [paymentResult, assessmentResult] = await Promise.allSettled([
        fetchDashboardJson(DASHBOARD_PAYMENTS_URL),
        fetchDashboardJson(DASHBOARD_ASSESSMENTS_URL)
    ]);

    const unauthorized = [paymentResult, assessmentResult].some(
        result => result.status === "rejected" &&
            result.reason &&
            result.reason.unauthorized
    );

    if (unauthorized) {
        localStorage.removeItem("edtspToken");
        localStorage.removeItem("edtspUser");
        window.location.href = "../login.html";
        return;
    }

    const failed = [];

    if (paymentResult.status === "fulfilled") {
        renderPaymentSummary(paymentResult.value.summary || {});
    } else {
        console.error("Dashboard payment summary error:", paymentResult.reason);
        failed.push("payments");
    }

    if (assessmentResult.status === "fulfilled") {
        renderAssessmentSummary(assessmentResult.value.assessments || []);
    } else {
        console.error("Dashboard assessment summary error:", assessmentResult.reason);
        failed.push("assessments");
    }

    setDashboardFeedback(
        failed.length
            ? `Some dashboard data could not load: ${failed.join(" and ")}.`
            : ""
    );
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
    loadDashboardSummary();
}
