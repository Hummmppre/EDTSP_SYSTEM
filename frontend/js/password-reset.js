const AUTH_API_URL = "http://localhost:5000/api/auth";

// =============================
// INLINE STATUS MESSAGES
// =============================

function setFormMessage(element, text, tone) {
    if (!element) return;

    element.textContent = text || "";
    element.hidden = !text;

    if (tone) {
        element.dataset.tone = tone;
    } else {
        delete element.dataset.tone;
    }
}

function serverErrorMessage(response, data, fallback) {
    if (response.status >= 500) {
        return "We couldn't reach the server right now. Please try again shortly.";
    }

    return (data && data.message) || fallback;
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
// FORGOT PASSWORD FORM
// =============================

const forgotForm = document.getElementById("forgotPasswordForm");

if (forgotForm) {
    const status = document.getElementById("forgotStatus");
    const submitButton = forgotForm.querySelector('button[type="submit"]');

    forgotForm.addEventListener("submit", async event => {
        event.preventDefault();

        setFormMessage(status, "", null);

        const email = document.getElementById("forgotEmail").value.trim();

        if (!email) {
            setFormMessage(status, "Please enter your email address.", "error");
            return;
        }

        submitButton.disabled = true;
        submitButton.textContent = "Sending...";

        try {
            const response = await fetch(`${AUTH_API_URL}/forgot-password`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({ email })
            });

            const data = await response.json().catch(() => ({}));

            if (!response.ok) {
                setFormMessage(
                    status,
                    serverErrorMessage(response, data, "Unable to send the reset link."),
                    "error"
                );
                return;
            }

            setFormMessage(
                status,
                data.message || "If an account exists for that email, a reset link has been sent.",
                "success"
            );

            forgotForm.reset();

        } catch (error) {
            console.error("Forgot Password Error:", error);
            setFormMessage(
                status,
                "Unable to connect to the server. Please check your connection.",
                "error"
            );
        } finally {
            submitButton.disabled = false;
            submitButton.textContent = "Send Reset Link";
        }
    });
}

// =============================
// RESET PASSWORD FORM
// =============================

const resetForm = document.getElementById("resetPasswordForm");

if (resetForm) {
    const status = document.getElementById("resetStatus");
    const submitButton = resetForm.querySelector('button[type="submit"]');
    const token = new URLSearchParams(window.location.search).get("token") || "";

    if (!token) {
        setFormMessage(
            status,
            "This reset link is missing its token. Please request a new link below.",
            "error"
        );
        resetForm.hidden = true;
    }

    resetForm.addEventListener("submit", async event => {
        event.preventDefault();

        setFormMessage(status, "", null);

        const password = document.getElementById("resetPassword").value;
        const confirmPassword = document.getElementById("resetConfirmPassword").value;

        if (password.length < 8) {
            setFormMessage(status, "Password must contain at least 8 characters.", "error");
            return;
        }

        if (password !== confirmPassword) {
            setFormMessage(status, "Passwords do not match.", "error");
            return;
        }

        submitButton.disabled = true;
        submitButton.textContent = "Saving...";

        try {
            const response = await fetch(`${AUTH_API_URL}/reset-password`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({ token, password })
            });

            const data = await response.json().catch(() => ({}));

            if (!response.ok) {
                setFormMessage(
                    status,
                    serverErrorMessage(response, data, "Unable to reset the password."),
                    "error"
                );
                return;
            }

            setFormMessage(
                status,
                data.message || "Your password has been reset. You can now sign in.",
                "success"
            );

            resetForm.reset();
            resetForm.hidden = true;

        } catch (error) {
            console.error("Reset Password Error:", error);
            setFormMessage(
                status,
                "Unable to connect to the server. Please check your connection.",
                "error"
            );
        } finally {
            submitButton.disabled = false;
            submitButton.textContent = "Save New Password";
        }
    });
}
