
const API_URL = "http://localhost:5000/api/auth";
const SETTINGS_URL = "http://localhost:5000/api/system-settings/public";

let authSettings = {
    googleAuthEnabled: false,
    recaptchaEnabled: false
};

function showToast(message, type = "info") {
    let region = document.querySelector(".edtsp-toast-region");

    if (!region) {
        region = document.createElement("div");
        region.className = "edtsp-toast-region";
        region.setAttribute("aria-live", "polite");
        document.body.appendChild(region);
    }

    const toast = document.createElement("div");
    toast.className = "edtsp-toast";
    toast.dataset.type = type;
    toast.setAttribute("role", type === "error" ? "alert" : "status");
    toast.textContent = message;
    region.appendChild(toast);

    setTimeout(() => toast.remove(), 4500);
}

// =============================
// LOAD AUTHENTICATION SETTINGS
// =============================

async function loadAuthSettings() {
    try {
        const response = await fetch(SETTINGS_URL);
        const data = await response.json();

        if (!response.ok || !data.success) {
            throw new Error("Unable to load authentication settings.");
        }

        authSettings = data.settings;

    } catch (error) {
        console.error("Settings Error:", error);
        // Fail closed: optional authentication features remain disabled.
    }

    applyAuthSettings();
}

function applyAuthSettings() {
    const captchaSection = document.getElementById("captchaSection");
    const googleDivider = document.getElementById("googleDivider");
    const googleSection = document.getElementById("googleSection");

    if (captchaSection) {
        captchaSection.style.display =
            authSettings.recaptchaEnabled ? "" : "none";
    }

    if (googleDivider) {
        googleDivider.style.display =
            authSettings.googleAuthEnabled ? "" : "none";
    }

    if (googleSection) {
        googleSection.style.display =
            authSettings.googleAuthEnabled ? "" : "none";
    }

    if (authSettings.recaptchaEnabled) {
        loadRecaptchaScript();
    }

    if (authSettings.googleAuthEnabled) {
        loadGoogleScript();
    }
}

// =============================
// LOAD GOOGLE AND RECAPTCHA
// =============================

function loadRecaptchaScript() {
    if (document.getElementById("recaptchaScript")) return;

    const script = document.createElement("script");
    script.id = "recaptchaScript";
    script.src = "https://www.google.com/recaptcha/api.js";
    script.async = true;
    script.defer = true;
    document.body.appendChild(script);
}

function loadGoogleScript() {
    if (document.getElementById("googleIdentityScript")) return;

    const script = document.createElement("script");
    script.id = "googleIdentityScript";
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.defer = true;

    script.onload = () => {
        if (window.google && google.accounts && google.accounts.id) {
            google.accounts.id.initialize({
                client_id: "538122561006-f4vv20r15l70c7bieermrp76g7dq7qti.apps.googleusercontent.com",
                callback: window.handleGoogleSignIn,
                auto_select: false
            });

            const buttonContainer =
                document.querySelector(".g_id_signin");

            if (buttonContainer) {
                google.accounts.id.renderButton(buttonContainer, {
                    type: "standard",
                    size: "large",
                    theme: "outline",
                    text: document.getElementById("registerForm")
                        ? "signup_with"
                        : "signin_with",
                    shape: "rectangular",
                    logo_alignment: "left",
                    width: 320
                });
            }
        }
    };

    document.head.appendChild(script);
}

// =============================
// SHOW / HIDE PASSWORD
// =============================

document.querySelectorAll(".toggle-password").forEach(button => {
    button.addEventListener("click", () => {
        const target = document.getElementById(button.dataset.target);

        if (!target) return;

        const isPassword = target.type === "password";
        target.type = isPassword ? "text" : "password";
        button.textContent = isPassword ? "Hide" : "Show";
    });
});

// =============================
// REDIRECT USER BY ROLE
// =============================

function redirectByRole(role) {
    if (role === "admin") {
        window.location.href = "admin/dashboard.html";
    } else {
        window.location.href = "trainee/dashboard.html";
    }
}

// =============================
// SAVE AUTHENTICATION DATA
// =============================

function saveAuthentication(data) {
    localStorage.setItem("edtspToken", data.token);
    localStorage.setItem("edtspUser", JSON.stringify(data.user));
}

// =============================
// GOOGLE SIGN-IN CALLBACK
// =============================

window.handleGoogleSignIn = async function (response) {
    if (!authSettings.googleAuthEnabled) {
        showToast("Google Authentication is currently disabled.", "error");
        return;
    }

    if (!response || !response.credential) {    
        showToast("Google authentication did not return a valid credential.", "error");
        return;
    }

    try {
        const result = await fetch(`${API_URL}/google`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                credential: response.credential
            })
        });

        const data = await result.json();

       if (!result.ok) {
    if (result.status >= 500) {
        console.error("Google sign-in server error:", data);
        showToast("Google sign-in is temporarily unavailable. Please try again shortly.", "error");
    } else {
        showToast(data.message || "Google Sign-In failed.", "error");
    }
    return;
}

        saveAuthentication(data);
        redirectByRole(data.user.role);

    } catch (error) {
        console.error("Google Sign-In Error:", error);
        showToast("Unable to connect to the server. Please try again.", "error");
    }
};

// =============================
// GET RECAPTCHA TOKEN
// =============================

function getRecaptchaToken() {
    if (!authSettings.recaptchaEnabled) {
        return "";
    }

    if (typeof grecaptcha === "undefined") {
        throw new Error("reCAPTCHA is not loaded. Please refresh the page.");
    }

    const token = grecaptcha.getResponse();

    if (!token) {
        throw new Error("Please verify that you are not a robot.");
    }

    return token;
}

// =============================
// LOGIN FORM
// =============================

const loginForm = document.getElementById("loginForm");

if (loginForm) {
    loginForm.addEventListener("submit", async event => {
        event.preventDefault();

        const email = document.getElementById("loginEmail").value.trim();
        const password = document.getElementById("loginPassword").value;

        if (!email || !password) {
        showToast("Please complete all required fields.", "error");         
        return;
        }

        let recaptchaToken;

        try {
            recaptchaToken = getRecaptchaToken();
        } catch (error) {
         showToast(error.message, "error");
         return;
}
        const submitButton = loginForm.querySelector('button[type="submit"]');
        submitButton.disabled = true;
        submitButton.textContent = "Signing In...";

        try {
            const response = await fetch(`${API_URL}/login`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    email,
                    password,
                    recaptchaToken
                })
            });

            const data = await response.json();

                    if (!response.ok) {
            if (response.status >= 500) {
                console.error("Login server error:", data);
                showToast("We couldn’t sign you in right now. Please try again shortly.", "error");
            } else {
                showToast(data.message || "Login failed.", "error");
            }
            return;
        }

            saveAuthentication(data);
            alert("Login successful! Welcome, " + data.user.firstName + ".");
            redirectByRole(data.user.role);

        } catch (error) {
            console.error("Login Error:", error);
            showToast("Unable to connect to the server. Please check your connection.", "error");
        } finally {
            if (authSettings.recaptchaEnabled &&
                typeof grecaptcha !== "undefined") {
                grecaptcha.reset();
            }

            submitButton.disabled = false;
            submitButton.textContent = "Sign In";
        }
    });
}

// =============================
// REGISTRATION FORM
// =============================

const registerForm = document.getElementById("registerForm");

if (registerForm) {
    registerForm.addEventListener("submit", async event => {
        event.preventDefault();

        const firstName = document.getElementById("firstName").value.trim();
        const lastName = document.getElementById("lastName").value.trim();
        const email = document.getElementById("registerEmail").value.trim();
        const password = document.getElementById("registerPassword").value;
        const confirmPassword = document.getElementById("confirmPassword").value;

        if (!firstName || !lastName || !email || !password || !confirmPassword) {
        showToast("Please complete all required fields.", "error");
            return;
        }

        if (password.length < 8) {
        showToast("Password must contain at least 8 characters.", "error");
            return;
        }

        if (password !== confirmPassword) {
            showToast("Passwords do not match.", "error");
            return;
        }

        let recaptchaToken;

        try {
            recaptchaToken = getRecaptchaToken();
        } catch (error) {
            showToast(error.message, "error");
            return;
        }

        const submitButton = registerForm.querySelector('button[type="submit"]');
        submitButton.disabled = true;
        submitButton.textContent = "Creating Account...";

        try {
            const response = await fetch(`${API_URL}/signup`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    firstName,
                    lastName,
                    email,
                    password,
                    recaptchaToken
                })
            });

            const data = await response.json();

            if (!response.ok) {
    if (response.status >= 500) {
        console.error("Registration server error:", data);
        showToast("We couldn’t create your account right now. Please try again shortly.", "error");
    } else {
        showToast(data.message || "Registration failed.", "error");
    }
    return;
}
                saveAuthentication(data);
                showToast(
                    `Welcome, ${data.user.firstName}! Your account was created successfully.`,
                    "success"
                );

        setTimeout(() => {
            window.location.href = "trainee/dashboard.html";
        }, 2000);
        } catch (error) {
            console.error("Registration Error:", error);
            showToast("Unable to connect to the server. Please check your connection.", "error");

        } finally {
            if (authSettings.recaptchaEnabled &&
                typeof grecaptcha !== "undefined") {
                grecaptcha.reset();
            }

            submitButton.disabled = false;
            submitButton.textContent = "Create Account";
        }
    });
}

// Load settings before users can submit either form
loadAuthSettings();
