const API_URL = "http://localhost:5000/api/system-settings";
const CALENDAR_API_URL =
  "http://localhost:5000/api/integrations/google-calendar";

document.addEventListener("DOMContentLoaded", () => {
  const googleAuthToggle = document.getElementById("googleAuthToggle");
  const recaptchaToggle = document.getElementById("recaptchaToggle");
  const emailToggle = document.getElementById("emailToggle");
  const googleCalendarToggle = document.getElementById("googleCalendarToggle");
  const googleCalendarStatus = document.getElementById("googleCalendarStatus");
  const googleCalendarDisconnectBtn = document.getElementById(
    "googleCalendarDisconnectBtn",
  );
  const googleSheetsToggle = document.getElementById("googleSheetsToggle");
  const settingsMessage = document.getElementById("settingsMessage");

  const token =
    localStorage.getItem("edtspToken") || sessionStorage.getItem("edtspToken");

  // Last settings known to be stored, used to roll back a failed save.
  let savedSettings = {
    googleAuthEnabled: false,
    recaptchaEnabled: false,
    emailEnabled: true,
    googleCalendarEnabled: true,
    googleSheetsEnabled: true,
  };

  function showMessage(message, isError = false) {
    if (!settingsMessage) return;

    settingsMessage.textContent = message;
    settingsMessage.style.color = isError ? "#dc2626" : "#16803c";
  }

  // Connection state shown beside the Google Calendar toggle.
  async function loadCalendarStatus() {
    if (!googleCalendarStatus) return;

    try {
      const response = await fetch(`${CALENDAR_API_URL}/status`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.message || "Google Calendar status is unavailable.",
        );
      }

      if (!data.configured) {
        googleCalendarStatus.textContent = "Not configured on the server.";
      } else if (data.needsReconnect) {
        googleCalendarStatus.textContent =
          "The saved connection is no longer valid. Connect again from Cow maintenance.";
      } else if (data.connected) {
        googleCalendarStatus.textContent = data.accountEmail
          ? `Connected as ${data.accountEmail}.`
          : "Connected.";
      } else {
        googleCalendarStatus.textContent =
          "No Google account connected. Connect one from Cow maintenance.";
      }

      if (googleCalendarDisconnectBtn) {
        googleCalendarDisconnectBtn.hidden = !data.connected;
      }
    } catch (error) {
      console.error("Google Calendar status error:", error);
      googleCalendarStatus.textContent =
        "Google Calendar status is unavailable right now.";
    }
  }

  // Load saved settings from MongoDB
  async function loadSettings() {
    try {
      const response = await fetch(API_URL, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Failed to load settings.");
      }

      savedSettings = {
        googleAuthEnabled: Boolean(data.settings.googleAuthEnabled),
        recaptchaEnabled: Boolean(data.settings.recaptchaEnabled),
        emailEnabled: data.settings.emailEnabled !== false,
        googleCalendarEnabled: data.settings.googleCalendarEnabled !== false,
        googleSheetsEnabled: data.settings.googleSheetsEnabled !== false,
      };

      googleAuthToggle.checked = savedSettings.googleAuthEnabled;
      recaptchaToggle.checked = savedSettings.recaptchaEnabled;
      emailToggle.checked = savedSettings.emailEnabled;
      googleCalendarToggle.checked = savedSettings.googleCalendarEnabled;
      googleSheetsToggle.checked = savedSettings.googleSheetsEnabled;

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
      recaptchaEnabled: recaptchaToggle.checked,
      emailEnabled: emailToggle.checked,
      googleCalendarEnabled: googleCalendarToggle.checked,
      googleSheetsEnabled: googleSheetsToggle.checked,
    };

    try {
      googleAuthToggle.disabled = true;
      recaptchaToggle.disabled = true;
      emailToggle.disabled = true;
      googleCalendarToggle.disabled = true;
      googleSheetsToggle.disabled = true;

      showMessage("Saving settings...");

      const response = await fetch(API_URL, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          googleAuthEnabled: nextSettings.googleAuthEnabled,
          recaptchaEnabled: nextSettings.recaptchaEnabled,
          emailEnabled: nextSettings.emailEnabled,
          googleCalendarEnabled: nextSettings.googleCalendarEnabled,
          googleSheetsEnabled: nextSettings.googleSheetsEnabled,
        }),
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
      emailToggle.checked = savedSettings.emailEnabled;
      googleCalendarToggle.checked = savedSettings.googleCalendarEnabled;
      googleSheetsToggle.checked = savedSettings.googleSheetsEnabled;

      showMessage(error.message, true);
    } finally {
      googleAuthToggle.disabled = false;
      recaptchaToggle.disabled = false;
      emailToggle.disabled = false;
      googleCalendarToggle.disabled = false;
      googleSheetsToggle.disabled = false;
    }
  }

  if (!token) {
    showMessage("Please log in as an administrator.", true);
    return;
  }

  googleAuthToggle.addEventListener("change", saveSettings);
  recaptchaToggle.addEventListener("change", saveSettings);
  emailToggle.addEventListener("change", saveSettings);
  googleCalendarToggle.addEventListener("change", saveSettings);
  googleSheetsToggle.addEventListener("change", saveSettings);

  if (googleCalendarDisconnectBtn) {
    googleCalendarDisconnectBtn.addEventListener("click", async () => {
      if (
        !window.confirm(
          "Disconnect Google Calendar? New maintenance activities will no longer be added to the calendar.",
        )
      ) {
        return;
      }

      const originalLabel = googleCalendarDisconnectBtn.textContent;

      googleCalendarDisconnectBtn.disabled = true;
      googleCalendarDisconnectBtn.textContent = "Disconnecting…";

      try {
        const response = await fetch(`${CALENDAR_API_URL}/disconnect`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        const data = await response.json();

        if (!response.ok) {
          throw new Error(
            data.message || "Unable to disconnect Google Calendar.",
          );
        }

        showMessage(data.message);
        await loadCalendarStatus();
      } catch (error) {
        console.error("Google Calendar disconnect error:", error);
        showMessage(error.message, true);
      } finally {
        googleCalendarDisconnectBtn.disabled = false;
        googleCalendarDisconnectBtn.textContent = originalLabel;
      }
    });
  }

  loadSettings();
  loadCalendarStatus();
});
const settingsLogoutBtn = document.getElementById("logoutBtn");
const settingsLogoutModal = document.getElementById("adminLogoutModal");
const settingsLogoutClose = document.getElementById("closeAdminLogoutModal");
const settingsLogoutCancel = document.getElementById("cancelAdminLogout");
const settingsLogoutConfirm = document.getElementById("confirmAdminLogout");

if (settingsLogoutBtn && settingsLogoutModal) {
  function closeSettingsLogoutModal() {
    settingsLogoutModal.classList.remove("show");
    document.body.classList.remove("modal-open");
    settingsLogoutBtn.focus();
  }

  settingsLogoutBtn.addEventListener("click", () => {
    settingsLogoutModal.classList.add("show");
    document.body.classList.add("modal-open");
  });

  settingsLogoutClose.addEventListener("click", closeSettingsLogoutModal);
  settingsLogoutCancel.addEventListener("click", closeSettingsLogoutModal);

  settingsLogoutConfirm.addEventListener("click", () => {
    localStorage.removeItem("edtspToken");
    localStorage.removeItem("edtspUser");
    sessionStorage.removeItem("edtspToken");
    sessionStorage.removeItem("edtspUser");

    window.location.href = "../login.html";
  });
}
