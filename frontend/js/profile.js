/**
 * Trainee profile: real account status, read-only training details, editable
 * phone/address, and the shared change-password dialog.
 */
(function initProfile() {
    const user = window.EDTSP.session.requireRole("trainee");
    if (!user) return;

    const { api, ui, session } = window.EDTSP;
    const {
        setText,
        statusBadge,
        state,
        fieldError,
        clearFieldErrors,
        setFormState,
        openModal,
        closeModal
    } = ui;

    session.bindLogout(document.getElementById("logoutButton"));

    const form = document.getElementById("profileForm");
    const phoneInput = document.getElementById("profilePhone");
    const addressInput = document.getElementById("profileAddress");
    const saveButton = document.getElementById("saveProfile");

    const passwordModal = document.getElementById("passwordModal");
    const passwordForm = document.getElementById("passwordForm");

    const renderBadge = (id, status, label) => {
        const current = document.getElementById(id);
        if (!current) return;

        current.replaceWith(
            Object.assign(statusBadge(status, label || status), { id })
        );
    };

    const load = async () => {
        let data;

        try {
            data = await api.get("/trainee/me");
        } catch (error) {
            const container = document.getElementById("profileFacts");
            state(container, {
                tone: "error",
                title: "Could not load your profile",
                message: error.message,
                action: {
                    label: "Try again",
                    onClick: () => window.location.reload()
                }
            });
            return;
        }

        const profile = data.profile || {};
        const fullName = `${data.user.firstName} ${data.user.lastName}`.trim();

        session.paintIdentity(data.user);

        setText("profileName", fullName);
        setText("profileEmail", data.user.email);
        setText("profileProgram", profile.programName || "Not assigned");
        setText("traineeId", profile.traineeId || "Not assigned");
        setText("profilePhoneValue", profile.phone || "Not provided");
        setText("profileAddressValue", profile.address || "Not provided");

        renderBadge("profileAccountStatus", data.user.status);
        renderBadge("profileAccountStatusFact", data.user.status);
        renderBadge(
            "profileTrainingStatus",
            profile.enrollmentStatus || "Pending",
            profile.enrollmentStatus || "Pending"
        );

        if (phoneInput) phoneInput.value = profile.phone || "";
        if (addressInput) addressInput.value = profile.address || "";
    };

    if (form) {
        form.addEventListener("submit", async (event) => {
            event.preventDefault();
            clearFieldErrors(form);
            setFormState(form, {});

            const phone = phoneInput.value.trim();
            const address = addressInput.value.trim();

            if (phone && !/^[0-9+()\-\s]{7,20}$/.test(phone)) {
                fieldError(
                    phoneInput,
                    "Use digits, spaces, +, ( ) or - (7–20 characters)."
                );
                return;
            }

            if (address.length > 200) {
                fieldError(addressInput, "Keep the address to 200 characters or fewer.");
                return;
            }

            saveButton.disabled = true;
            saveButton.textContent = "Saving…";

            try {
                const result = await api.put("/trainee/me", { phone, address });
                const saved = result.profile || {};
                const time = new Intl.DateTimeFormat("en-PH", {
                    timeZone: "Asia/Manila",
                    hour: "numeric",
                    minute: "2-digit"
                }).format(new Date());

                setText("profilePhoneValue", saved.phone || "Not provided");
                setText("profileAddressValue", saved.address || "Not provided");

                setFormState(form, {
                    tone: "success",
                    message: `Saved at ${time}.`
                });
            } catch (error) {
                if (error.field === "phone") {
                    fieldError(phoneInput, error.message);
                } else if (error.field === "address") {
                    fieldError(addressInput, error.message);
                } else {
                    setFormState(form, { tone: "error", message: error.message });
                }
            } finally {
                saveButton.disabled = false;
                saveButton.textContent = "Save changes";
            }
        });
    }

    const openPassword = document.getElementById("openPasswordModal");

    if (openPassword && passwordModal) {
        openPassword.addEventListener("click", () => openModal(passwordModal));
    }

    document
        .querySelectorAll("[data-close-password]")
        .forEach((button) =>
            button.addEventListener("click", () => {
                if (passwordModal) closeModal(passwordModal);
            })
        );

    if (passwordForm) {
        passwordForm.addEventListener("submit", async (event) => {
            event.preventDefault();
            clearFieldErrors(passwordForm);
            setFormState(passwordForm, {});

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

            const submit = passwordForm.querySelector('button[type="submit"]');
            submit.disabled = true;
            submit.textContent = "Updating…";

            try {
                const result = await api.post("/auth/change-password", {
                    currentPassword: currentInput.value,
                    newPassword: newInput.value
                });

                if (result.token) {
                    const stored = session.getUser();
                    session.setSession(result.token, stored);
                }

                setFormState(passwordForm, {
                    tone: "success",
                    message: result.message
                });
                passwordForm.reset();
            } catch (error) {
                if (error.field === "currentPassword") {
                    fieldError(currentInput, error.message);
                } else if (error.field === "newPassword") {
                    fieldError(newInput, error.message);
                } else {
                    setFormState(passwordForm, { tone: "error", message: error.message });
                }
            } finally {
                submit.disabled = false;
                submit.textContent = "Update password";
            }
        });
    }

    load();
})();
