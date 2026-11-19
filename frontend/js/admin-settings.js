const API_URL = "http://localhost:5000/api/system-settings";
const CALENDAR_API_URL =
  "http://localhost:5000/api/integrations/google-calendar";

document.addEventListener("DOMContentLoaded", () => {
  const googleAuthToggle = document.getElementById("googleAuthToggle");
  const recaptchaToggle = document.getElementById("recaptchaToggle");
  const emailToggle = document.getElementById("emailToggle");
  const googleCalendarToggle = document.getElementById("googleCalendarToggle");
  const googleCalendarStatus = document.getElementById("googleCalendarStatus");
  const googleCalendarConnectBtn = document.getElementById(
    "googleCalendarConnectBtn",
  );
  const googleCalendarDisconnectBtn = document.getElementById(
    "googleCalendarDisconnectBtn",
  );
  const googleSheetsToggle = document.getElementById("googleSheetsToggle");
  const googleSheetsStatus = document.getElementById("googleSheetsStatus");
  const googleSheetsConnectBtn = document.getElementById(
    "googleSheetsConnectBtn",
  );
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

  // Shared Google connection status, including per-service authorization.
  let googleStatus = null;

  function showMessage(message, isError = false) {
    if (!settingsMessage) return;

    settingsMessage.textContent = message;
    settingsMessage.style.color = isError ? "#dc2626" : "#16803c";
  }

  function statusText(label, status) {
    if (!googleStatus || !googleStatus.configured) {
      return "Not configured on the server.";
    }

    if (!status) return `${label} status is unavailable.`;

    if (status.needsReconnect) {
      return (
        status.reconnectReason ||
        "The saved Google connection expired or was revoked. Reconnect the Google account to resume."
      );
    }

    if (status.connected) {
      return status.accountEmail
        ? `Connected as ${status.accountEmail}.`
        : "Connected to Google.";
    }

    if (status.accountEmail) {
      return `Signed in as ${status.accountEmail}, but ${label} access was not granted. Reconnect Google and approve the request.`;
    }

    return "No Google account connected.";
  }

  function renderGoogleStatus() {
    const calendar = googleStatus && googleStatus.calendar;
    const sheets = googleStatus && googleStatus.sheets;
    const configured = Boolean(googleStatus && googleStatus.configured);

    if (googleCalendarStatus) {
      googleCalendarStatus.textContent = statusText(
        "Google Calendar",
        calendar,
      );
    }

    if (googleSheetsStatus) {
      googleSheetsStatus.textContent = statusText("Google Sheets", sheets);
    }

    if (googleCalendarConnectBtn) {
      googleCalendarConnectBtn.hidden =
        !configured || Boolean(calendar && calendar.connected);
      googleCalendarConnectBtn.textContent =
        calendar && calendar.accountEmail
          ? "Reconnect Google"
          : "Connect Google";
    }

    if (googleSheetsConnectBtn) {
      googleSheetsConnectBtn.hidden =
        !configured || Boolean(sheets && sheets.connected);
      googleSheetsConnectBtn.textContent =
        sheets && sheets.accountEmail ? "Reconnect Google" : "Connect Google";
    }

    if (googleCalendarDisconnectBtn) {
      googleCalendarDisconnectBtn.hidden =
        !configured || !googleStatus.accountConnected;
    }
  }

  async function loadGoogleStatus() {
    if (!googleCalendarStatus && !googleSheetsStatus) return;

    try {
      const response = await fetch(`${CALENDAR_API_URL}/status`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.message || "Google integration status is unavailable.",
        );
      }

      googleStatus = data;
      renderGoogleStatus();
    } catch (error) {
      console.error("Google integration status error:", error);
      googleStatus = null;

      if (googleCalendarStatus) {
        googleCalendarStatus.textContent =
          "Google integration status is unavailable right now.";
      }

      if (googleSheetsStatus) {
        googleSheetsStatus.textContent =
          "Google integration status is unavailable right now.";
      }

      if (googleCalendarConnectBtn) googleCalendarConnectBtn.hidden = true;
      if (googleSheetsConnectBtn) googleSheetsConnectBtn.hidden = true;
      if (googleCalendarDisconnectBtn) {
        googleCalendarDisconnectBtn.hidden = true;
      }
    }
  }

  // Sends the administrator through Google's own consent screen. The backend
  // stores the refresh token; only an authorization URL reaches the browser.
  async function startGoogleConnect(service) {
    const button =
      service === "sheets" ? googleSheetsConnectBtn : googleCalendarConnectBtn;

    if (!button) return;

    const originalLabel = button.textContent;

    button.disabled = true;
    button.textContent = "Opening Google…";

    try {
      const returnTo = new URL(window.location.href);

      returnTo.hash = "";
      returnTo.search = "";

      const response = await fetch(
        `${CALENDAR_API_URL}/connect?returnTo=${encodeURIComponent(returnTo.toString())}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
      );

      const data = await response.json();

      if (!response.ok || !data.authUrl) {
        throw new Error(
          data.message || "Google authorization could not be started.",
        );
      }

      window.location.href = data.authUrl;
    } catch (error) {
      console.error("Google connect error:", error);
      button.disabled = false;
      button.textContent = originalLabel;
      showMessage(error.message, true);
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

  async function saveSettings(connectService = "") {
    const nextSettings = {
      googleAuthEnabled: googleAuthToggle.checked,
      recaptchaEnabled: recaptchaToggle.checked,
      emailEnabled: emailToggle.checked,
      googleCalendarEnabled: googleCalendarToggle.checked,
      googleSheetsEnabled: googleSheetsToggle.checked,
    };

    let saved = false;

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
      saved = true;
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

    if (!saved || !connectService) return;

    const enabled =
      connectService === "sheets"
        ? googleSheetsToggle.checked
        : googleCalendarToggle.checked;

    if (!enabled) return;

    // Enabling an integration that has not been authorized (or whose access
    // was revoked) guides the admin through Google consent right away.
    const serviceStatus =
      googleStatus && googleStatus[connectService]
        ? googleStatus[connectService]
        : null;

    if (!serviceStatus || !serviceStatus.connected) {
      await startGoogleConnect(connectService);
    }
  }

  function handleGoogleReturn() {
    const params = new URLSearchParams(window.location.search);
    const result = params.get("google") || params.get("calendar");

    if (!result) return;

    if (result === "connected") {
      showMessage(
        "Google connected. Calendar events and Sheets exports will use this account.",
      );
    } else {
      showMessage(
        params.get("googleReason") ||
          params.get("calendarReason") ||
          "Google could not be connected. Please try again.",
        true,
      );
    }

    params.delete("google");
    params.delete("calendar");
    params.delete("googleReason");
    params.delete("calendarReason");

    const query = params.toString();
    const cleanUrl = `${window.location.pathname}${query ? `?${query}` : ""}`;

    window.history.replaceState({}, "", cleanUrl);
  }

  if (!token) {
    showMessage("Please log in as an administrator.", true);
    return;
  }

  googleAuthToggle.addEventListener("change", () => saveSettings());
  recaptchaToggle.addEventListener("change", () => saveSettings());
  emailToggle.addEventListener("change", () => saveSettings());
  googleCalendarToggle.addEventListener("change", () =>
    saveSettings("calendar"),
  );
  googleSheetsToggle.addEventListener("change", () => saveSettings("sheets"));

  if (googleCalendarConnectBtn) {
    googleCalendarConnectBtn.addEventListener("click", () =>
      startGoogleConnect("calendar"),
    );
  }

  if (googleSheetsConnectBtn) {
    googleSheetsConnectBtn.addEventListener("click", () =>
      startGoogleConnect("sheets"),
    );
  }

  if (googleCalendarDisconnectBtn) {
    googleCalendarDisconnectBtn.addEventListener("click", async () => {
      if (
        !window.confirm(
          "Disconnect this Google account? Calendar events and Sheets exports will stop until an account is reconnected.",
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
            data.message || "Unable to disconnect the Google account.",
          );
        }

        showMessage(data.message);
        await loadGoogleStatus();
      } catch (error) {
        console.error("Google disconnect error:", error);
        showMessage(error.message, true);
      } finally {
        googleCalendarDisconnectBtn.disabled = false;
        googleCalendarDisconnectBtn.textContent = originalLabel;
      }
    });
  }

  Promise.allSettled([loadSettings(), loadGoogleStatus()]).then(() => {
    handleGoogleReturn();
  });
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

    const returnFocus =
      document.getElementById("userMenuButton") || settingsLogoutBtn;

    if (returnFocus) returnFocus.focus();
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
