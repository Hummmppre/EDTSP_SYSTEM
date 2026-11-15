
const API_URL = "http://localhost:5000/api/system-settings";

document.addEventListener("DOMContentLoaded", () => {
    const googleAuthToggle = document.getElementById("googleAuthToggle");
    const recaptchaToggle = document.getElementById("recaptchaToggle");
    const settingsMessage = document.getElementById("settingsMessage");

    const token =
    localStorage.getItem("edtspToken") ||
    sessionStorage.getItem("edtspToken");

    // Last settings known to be stored, used to roll back a failed save.
    let savedSettings = {
        googleAuthEnabled: false,
        recaptchaEnabled: false
    };

    function showMessage(message, isError = false) {
        if (!settingsMessage) return;

        settingsMessage.textContent = message;
        settingsMessage.style.color = isError ? "#dc2626" : "#16803c";
    }

    // Load saved settings from MongoDB
    async function loadSettings() {
        try {
            const response = await fetch(API_URL, {
                headers: {
                    Authorization: `Bearer ${token}`
                }
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.message || "Failed to load settings.");
            }

            savedSettings = {
                googleAuthEnabled: Boolean(data.settings.googleAuthEnabled),
                recaptchaEnabled: Boolean(data.settings.recaptchaEnabled)
            };

            googleAuthToggle.checked = savedSettings.googleAuthEnabled;
            recaptchaToggle.checked = savedSettings.recaptchaEnabled;

            showMessage("Settings loaded successfully.");
        } catch (error) {
            console.error("Load settings error:", error);
            showMessage(error.message, true);
        }
    }

    // Save updated settings to MongoDB
    async function saveSettings() {
        const nextSettings = {
            googleAuthEnabled: googleAuthToggle.checked,
            recaptchaEnabled: recaptchaToggle.checked
        };

        try {
            googleAuthToggle.disabled = true;
            recaptchaToggle.disabled = true;

            showMessage("Saving settings...");

            const response = await fetch(API_URL, {
                method: "PUT",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`
                },
                body: JSON.stringify({
                    googleAuthEnabled: nextSettings.googleAuthEnabled,
                    recaptchaEnabled: nextSettings.recaptchaEnabled
                })
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.message || "Failed to save settings.");
            }

            savedSettings = nextSettings;
            showMessage("Settings saved successfully.");
        } catch (error) {
            console.error("Save settings error:", error);

            // Restore the values that are actually stored on the server
            googleAuthToggle.checked = savedSettings.googleAuthEnabled;
            recaptchaToggle.checked = savedSettings.recaptchaEnabled;

            showMessage(error.message, true);
        } finally {
            googleAuthToggle.disabled = false;
            recaptchaToggle.disabled = false;
        }
    }

    if (!token) {
        showMessage("Please log in as an administrator.", true);
        return;
    }

    googleAuthToggle.addEventListener("change", saveSettings);
    recaptchaToggle.addEventListener("change", saveSettings);

    loadSettings();
});
