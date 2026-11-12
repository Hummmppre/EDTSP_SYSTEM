/**
 * Login, signup, forgot-password and reset-password.
 * No browser dialogs: every outcome lands in a field error or the inline
 * .auth-message region.
 */
(function initAuth() {
    const API = "/api/auth";

    const messageRegion = () => document.getElementById("authMessage");

    const showMessage = (message, tone = "error") => {
        const region = messageRegion();
        if (!region) return;

        region.hidden = !message;
        region.className = `auth-message auth-message--${tone}`;
        region.replaceChildren();

        if (!message) return;

        if (typeof message === "string") {
            region.textContent = message;
        } else {
            region.append(message);
        }
    };

    const fieldFor = (input) =>
        input.closest(".form-group") || input.closest(".field") || input.parentElement;

    const clearErrors = (form) => {
        form.querySelectorAll(".field-error").forEach((node) => node.remove());
        form.querySelectorAll("[aria-invalid='true']").forEach((node) =>
            node.removeAttribute("aria-invalid")
        );
        showMessage("");
    };

    const fieldError = (input, message) => {
        const wrapper = fieldFor(input);
        if (!wrapper) return;

        let node = wrapper.querySelector(".field-error");

        if (!node) {
            node = document.createElement("small");
            node.className = "field-error";
            wrapper.append(node);
        }

        node.textContent = message;
        input.setAttribute("aria-invalid", "true");
        input.focus();
    };

    const submitButton = (form) =>
        form.querySelector('button[type="submit"]');

    const setBusy = (form, busy, label) => {
        const button = submitButton(form);
        if (!button) return;

        if (busy) {
            button.dataset.label = button.textContent.trim();
            button.disabled = true;
            button.textContent = label;
        } else {
            button.disabled = false;
            button.textContent = button.dataset.label || button.textContent;
        }
    };

    const request = async (path, payload) => {
        let response;

        try {
            response = await fetch(`${API}${path}`, {
                method: "POST",
                headers: { "Content-Type": "application/json", Accept: "application/json" },
                body: JSON.stringify(payload)
            });
        } catch (error) {
            throw new Error(
                "Unable to reach the server. Check your connection and try again."
            );
        }

        const text = await response.text();
        let data = null;

        if (text) {
            try {
                data = JSON.parse(text);
            } catch (error) {
                data = { message: text };
            }
        }

        if (!response.ok) {
            const requestError = new Error(
                (data && data.message) || "The request could not be completed."
            );
            requestError.field = data && data.field;
            requestError.code = data && data.code;
            throw requestError;
        }

        return data;
    };

    const inputForField = (form, field) =>
        form.querySelector(`#${field}`) ||
        form.querySelector(`[name="${field}"]`);

    const reportError = (form, error) => {
        const input = error.field ? inputForField(form, error.field) : null;

        if (input && input.tagName !== "SELECT") {
            fieldError(input, error.message);
            return;
        }

        showMessage(error.message);
    };

    // =============================
    // SHOW / HIDE PASSWORD
    // =============================

    document.querySelectorAll(".toggle-password").forEach((button) => {
        button.addEventListener("click", () => {
            const target = document.getElementById(button.dataset.target);
            if (!target) return;

            const isPassword = target.type === "password";
            target.type = isPassword ? "text" : "password";
            button.textContent = isPassword ? "Hide" : "Show";
        });
    });

    // =============================
    // LOGIN
    // =============================

    const loginForm = document.getElementById("loginForm");

    if (loginForm) {
        const reasons = {
            expired: "Your session ended. Please sign in again.",
            inactive:
                "This account has been deactivated. Contact the administrator.",
            signedOut: "You have been signed out.",
            role: "That account cannot open the page you requested.",
            signin: ""
        };

        const reason = new URLSearchParams(window.location.search).get("reason");

        if (reason && reasons[reason]) {
            showMessage(reasons[reason], reason === "inactive" ? "error" : "info");
        }

        loginForm.addEventListener("submit", async (event) => {
            event.preventDefault();
            clearErrors(loginForm);

            const emailInput = document.getElementById("loginEmail");
            const passwordInput = document.getElementById("loginPassword");
            const email = emailInput.value.trim();
            const password = passwordInput.value;

            if (!email) return fieldError(emailInput, "Enter your email address.");
            if (!password) return fieldError(passwordInput, "Enter your password.");

            setBusy(loginForm, true, "Signing in…");

            try {
                const data = await request("/login", { email, password });

                localStorage.setItem("edtspToken", data.token);
                localStorage.setItem("edtspUser", JSON.stringify(data.user));

                window.location.href =
                    data.user.role === "admin"
                        ? "admin/dashboard.html"
                        : "trainee/dashboard.html";
            } catch (error) {
                reportError(loginForm, error);
                setBusy(loginForm, false);
            }
        });
    }

    // =============================
    // SIGNUP
    // =============================

    const registerForm = document.getElementById("registerForm");

    if (registerForm) {
        registerForm.addEventListener("submit", async (event) => {
            event.preventDefault();
            clearErrors(registerForm);

            const firstNameInput = document.getElementById("firstName");
            const lastNameInput = document.getElementById("lastName");
            const emailInput = document.getElementById("registerEmail");
            const passwordInput = document.getElementById("registerPassword");
            const confirmInput = document.getElementById("confirmPassword");

            const firstName = firstNameInput.value.trim();
            const lastName = lastNameInput.value.trim();
            const email = emailInput.value.trim();
            const password = passwordInput.value;
            const confirmPassword = confirmInput.value;

            if (!firstName) return fieldError(firstNameInput, "Enter your first name.");
            if (!lastName) return fieldError(lastNameInput, "Enter your last name.");
            if (!email) return fieldError(emailInput, "Enter your email address.");
            if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
                return fieldError(emailInput, "Enter a valid email address.");
            }
            if (password.length < 8) {
                return fieldError(passwordInput, "Use at least 8 characters.");
            }
            if (password !== confirmPassword) {
                return fieldError(confirmInput, "The passwords do not match.");
            }

            setBusy(registerForm, true, "Creating account…");

            try {
                await request("/signup", { firstName, lastName, email, password });
                showMessage(
                    "Account created. You can now sign in with your new details.",
                    "success"
                );
                registerForm.reset();
                setBusy(registerForm, false);

                window.setTimeout(() => {
                    window.location.href = "login.html";
                }, 1200);
            } catch (error) {
                reportError(registerForm, error);
                setBusy(registerForm, false);
            }
        });
    }

    // =============================
    // FORGOT PASSWORD
    // =============================

    const forgotForm = document.getElementById("forgotForm");

    if (forgotForm) {
        forgotForm.addEventListener("submit", async (event) => {
            event.preventDefault();
            clearErrors(forgotForm);

            const emailInput = document.getElementById("forgotEmail");
            const email = emailInput.value.trim();

            if (!email) return fieldError(emailInput, "Enter your email address.");

            setBusy(forgotForm, true, "Sending…");

            try {
                const data = await request("/forgot-password", { email });

                const message = document.createElement("div");
                message.append(
                    document.createTextNode(
                        "If that email exists, a reset link has been created. "
                    )
                );

                if (data.resetToken) {
                    const link = document.createElement("a");
                    link.href = `reset-password.html?token=${encodeURIComponent(data.resetToken)}`;
                    link.textContent = "Open the reset link";
                    message.append(link);

                    const note = document.createElement("p");
                    note.className = "field-note";
                    note.textContent =
                        "Development only: no email provider is configured, so the link is shown here.";
                    message.append(note);
                }

                showMessage(message, "success");
            } catch (error) {
                reportError(forgotForm, error);
            } finally {
                setBusy(forgotForm, false);
            }
        });
    }

    // =============================
    // RESET PASSWORD
    // =============================

    const resetForm = document.getElementById("resetForm");

    if (resetForm) {
        const token = new URLSearchParams(window.location.search).get("token");
        const tokenInput = document.getElementById("resetToken");

        if (tokenInput) tokenInput.value = token || "";

        if (!token) {
            resetForm.hidden = true;
            showMessage(
                "This reset link is missing its token. Request a new link from the login page.",
                "error"
            );
        }

        resetForm.addEventListener("submit", async (event) => {
            event.preventDefault();
            clearErrors(resetForm);

            const passwordInput = document.getElementById("resetPassword");
            const confirmInput = document.getElementById("resetConfirmPassword");

            if (passwordInput.value.length < 8) {
                return fieldError(passwordInput, "Use at least 8 characters.");
            }

            if (passwordInput.value !== confirmInput.value) {
                return fieldError(confirmInput, "The passwords do not match.");
            }

            setBusy(resetForm, true, "Saving…");

            try {
                await request("/reset-password", {
                    token,
                    newPassword: passwordInput.value
                });

                const message = document.createElement("div");
                message.append(
                    document.createTextNode(
                        "Password reset. You can now sign in with the new password. "
                    )
                );

                const link = document.createElement("a");
                link.href = "login.html";
                link.textContent = "Sign in";
                message.append(link);

                showMessage(message, "success");
                resetForm.reset();

                const hidden = document.getElementById("resetToken");
                if (hidden) hidden.value = token || "";
            } catch (error) {
                reportError(resetForm, error);
            } finally {
                setBusy(resetForm, false);
            }
        });
    }
})();
