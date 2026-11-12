/**
 * Shared admin shell: role guard, logout, change-password dialog.
 */
(function initAdmin() {
    const user = window.EDTSP.session.requireRole("admin");
    if (!user) return;

    const { api, ui, session } = window.EDTSP;
    const { openModal, closeModal, clearFieldErrors, fieldError, setFormState } = ui;

    session.bindLogout(
        document.getElementById("logoutBtn") || document.getElementById("logoutButton")
    );

    const passwordModal = document.getElementById("passwordModal");
    const openButton = document.getElementById("openPasswordModal");

    if (openButton && passwordModal) {
        openButton.addEventListener("click", () => openModal(passwordModal));
    }

    document.querySelectorAll("[data-close-password]").forEach((button) => {
        button.addEventListener("click", () => {
            if (passwordModal) closeModal(passwordModal);
        });
    });

    const form = document.getElementById("passwordForm");

    if (!form) return;

    form.addEventListener("submit", async (event) => {
        event.preventDefault();
        clearFieldErrors(form);
        setFormState(form, {});

        const currentInput = document.getElementById("currentPassword");
        const newInput = document.getElementById("newPassword");
        const confirmInput = document.getElementById("confirmNewPassword");

        if (!currentInput.value) {
            return fieldError(currentInput, "Enter your current password.");
        }

        if (newInput.value.length < 8) {
            return fieldError(newInput, "Use at least 8 characters.");
        }

        if (newInput.value !== confirmInput.value) {
            return fieldError(confirmInput, "The passwords do not match.");
        }

        const submit = form.querySelector('button[type="submit"]');
        submit.disabled = true;
        submit.textContent = "Updating…";

        try {
            const result = await api.post("/auth/change-password", {
                currentPassword: currentInput.value,
                newPassword: newInput.value
            });

            if (result.token) {
                session.setSession(result.token, session.getUser());
            }

            setFormState(form, { tone: "success", message: result.message });
            form.reset();
        } catch (error) {
            if (error.field === "currentPassword") {
                fieldError(currentInput, error.message);
            } else if (error.field === "newPassword") {
                fieldError(newInput, error.message);
            } else {
                setFormState(form, { tone: "error", message: error.message });
            }
        } finally {
            submit.disabled = false;
            submit.textContent = "Update password";
        }
    });
})();
