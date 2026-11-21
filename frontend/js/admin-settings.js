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

    renderGoogleToken("google-calendar");
    renderGoogleToken("google-sheets");
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

      if (data.integrations) {
        applyIntegrationMetadata(data.integrations);
      }

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

  /* ---------- Integration credentials ---------- */

  const INTEGRATION_LABELS = {
    "google-auth": "Google Authentication",
    brevo: "Brevo",
    "google-calendar": "Google Calendar",
    "google-sheets": "Google Sheets",
    recaptcha: "reCAPTCHA",
  };

  const integrationState = new Map();
  let pendingClearCard = null;
  let clearReturnFocus = null;

  const clearModal = document.getElementById("integrationClearModal");
  const clearTitle = document.getElementById("integrationClearTitle");
  const clearCopy = document.getElementById("integrationClearCopy");
  const clearConfirm = document.getElementById("integrationClearConfirm");
  const clearCancel = document.getElementById("integrationClearCancel");
  const clearClose = document.getElementById("integrationClearClose");

  const auditToggle = document.getElementById("integrationAuditToggle");
  const auditBody = document.getElementById("integrationAuditBody");
  const auditRows = document.getElementById("integrationAuditRows");
  const auditEmpty = document.getElementById("integrationAuditEmpty");
  const auditError = document.getElementById("integrationAuditError");
  const auditMore = document.getElementById("integrationAuditMore");
  const auditRetry = document.getElementById("integrationAuditRetry");
  const auditState = {
    loaded: false,
    loading: false,
    entries: [],
    nextBefore: null,
  };

  function getState(card) {
    return integrationState.get(card);
  }

  function relativeTime(value) {
    if (!value) return "unknown time";

    const diff = Date.now() - new Date(value).getTime();
    const minutes = Math.round(diff / 60000);

    if (!Number.isFinite(minutes)) return "unknown time";
    if (Math.abs(minutes) < 1) return "just now";
    if (Math.abs(minutes) < 60) return `${minutes} min ago`;

    const hours = Math.round(minutes / 60);

    if (Math.abs(hours) < 24) return `${hours} hr ago`;

    const days = Math.round(hours / 24);

    if (Math.abs(days) < 30) return `${days} day${Math.abs(days) === 1 ? "" : "s"} ago`;

    return new Date(value).toLocaleDateString();
  }

  function setCardBusy(card, action) {
    const state = getState(card);

    if (!state) return;

    state.busy = action;
    renderCard(card);
  }

  function updateCardControls(card) {
    const state = getState(card);

    if (!state || !state.root) return;

    const rateLimited = Date.now() < state.rateLimitedUntil;
    const disabled = Boolean(state.busy) || rateLimited;
    const actions = state.root.querySelectorAll("[data-action]");
    const inputs = state.root.querySelectorAll("[data-secret-input]");

    actions.forEach((button) => {
      button.disabled = disabled;
    });
    inputs.forEach((input) => {
      input.disabled = Boolean(state.busy);
    });

    const testButton = state.root.querySelector('[data-action="test"]');
    const saveButton = state.root.querySelector('[data-action="save"]');
    const clearButton = state.root.querySelector('[data-action="clear"]');

    if (testButton) {
      testButton.textContent =
        state.busy === "test" ? "Testing…" : state.defaults.test;
    }
    if (saveButton) {
      saveButton.textContent =
        state.busy === "save" ? "Saving…" : state.defaults.save;
    }
    if (clearButton) {
      clearButton.textContent =
        state.busy === "clear" ? "Clearing…" : state.defaults.clear;
    }
  }

  function clearCardError(card) {
    const state = getState(card);

    if (!state) return;

    state.error = null;

    if (state.errorEl) {
      state.errorEl.textContent = "";
      state.errorEl.hidden = true;
    }

    state.root.querySelectorAll("[data-field]").forEach((fieldEl) => {
      const input = fieldEl.querySelector("[data-secret-input]");
      const help = fieldEl.querySelector(".integration-field__help");

      if (input) input.removeAttribute("aria-invalid");
      if (help && help.dataset.originalHelp !== undefined) {
        help.textContent = help.dataset.originalHelp;
      }
    });
  }

  function showCardError(card, error) {
    const state = getState(card);

    if (!state) return;

    state.error = error;

    if (state.errorEl) {
      state.errorEl.textContent = error.message;
      state.errorEl.hidden = false;
    }

    if (error.field) {
      const fieldEl = state.root.querySelector(`[data-field="${error.field}"]`);

      if (fieldEl) {
        const input = fieldEl.querySelector("[data-secret-input]");
        const help = fieldEl.querySelector(".integration-field__help");

        if (help) {
          if (help.dataset.originalHelp === undefined) {
            help.dataset.originalHelp = help.textContent;
          }
          help.textContent = error.message;
        }
        if (input) {
          input.setAttribute("aria-invalid", "true");
          input.focus();
        }
      }
    }
  }

  function renderStatus(card) {
    const state = getState(card);

    if (!state || !state.statusEl) return;

    let text = "Not validated yet.";
    let statusState = "unverified";

    if (state.busy) {
      text =
        state.busy === "test"
          ? "Testing…"
          : state.busy === "save"
            ? "Saving…"
            : "Clearing…";
      statusState = "busy";
    } else if (state.localResult) {
      text = state.localResult.message || "Validation finished.";
      statusState =
        state.localResult.state === "awaiting_connection"
          ? "awaiting"
          : state.localResult.state;
    } else if (state.metadata && state.metadata.lastValidation) {
      const last = state.metadata.lastValidation;
      const at = last.checkedAt ? relativeTime(last.checkedAt) : "";

      if (last.state === "valid") {
        text = `Validated ${at}. ${last.message || ""}`.trim();
        statusState = "valid";
      } else if (last.state === "invalid") {
        text = `Last check failed ${at}. ${last.message || ""}`.trim();
        statusState = "invalid";
      } else if (last.state === "awaiting_connection") {
        text = "Awaiting Google connection. Connect Google to finish validation.";
        statusState = "awaiting";
      } else if (last.state === "unreadable_credential") {
        text = "Saved credential could not be read. Re-enter it or clear it.";
        statusState = "unreadable";
      } else if (last.state === "unverified") {
        text = "Not validated yet.";
        statusState = "unverified";
      } else {
        text = last.message || "Not validated yet.";
        statusState = "unverified";
      }

      if (last.stale && last.state === "valid") {
        text = "Credentials changed since this check — validate again.";
        statusState = "stale";
      }
    }

    state.statusEl.textContent = text;
    state.statusEl.dataset.state = statusState;
  }

  function renderCard(card) {
    const state = getState(card);

    if (!state || !state.root) return;

    const metadata = state.metadata;
    const fieldMetadata = new Map(
      metadata && Array.isArray(metadata.fields)
        ? metadata.fields.map((field) => [field.name, field])
        : [],
    );

    state.root.querySelectorAll("[data-field]").forEach((fieldEl) => {
      const name = fieldEl.dataset.field;
      const field = fieldMetadata.get(name);
      const badge = fieldEl.querySelector("[data-source]");
      const input = fieldEl.querySelector("[data-secret-input]");
      const source = field ? field.source : "none";

      if (badge) {
        badge.dataset.source = source;
        badge.textContent =
          source === "database"
            ? "Saved"
            : source === "environment"
              ? "Server env"
              : "Not configured";
      }

      if (input && !input.value) {
        const label = (badge ? badge.parentElement.textContent : name)
          .replace(/Saved|Server env|Not configured/g, "")
          .trim();

        input.placeholder =
          source === "database"
            ? "Saved — enter a new value to replace"
            : source === "environment"
              ? "Using server env — enter a value to override"
              : `Enter a new ${label || "value"}`;
      }

      if (input) {
        fieldEl.classList.toggle(
          "integration-field--dirty",
          Boolean(input.value.trim()),
        );
      }
    });

    const clearButton = state.root.querySelector('[data-action="clear"]');

    if (clearButton) {
      clearButton.hidden = !Array.from(fieldMetadata.values()).some(
        (field) => field.source === "database",
      );
    }

    renderStatus(card);
    updateCardControls(card);
  }

  function applyMetadata(card, metadata) {
    const state = getState(card);

    if (!state || !metadata) return;

    state.metadata = metadata;
    state.localResult = null;
    clearCardError(card);
    renderCard(card);
  }

  function applyIntegrationMetadata(metadataMap) {
    if (!metadataMap) return;

    Object.entries(metadataMap).forEach(([card, metadata]) => {
      applyMetadata(card, metadata);
    });
  }

  function readFields(card) {
    const state = getState(card);
    const fields = {};

    if (!state) return fields;

    state.root.querySelectorAll("[data-field]").forEach((fieldEl) => {
      const input = fieldEl.querySelector("[data-secret-input]");

      if (!input) return;

      const value = input.value.trim();

      if (value) fields[fieldEl.dataset.field] = value;
    });

    return fields;
  }

  function clearFields(card) {
    const state = getState(card);

    if (!state) return;

    state.root.querySelectorAll("[data-secret-input]").forEach((input) => {
      input.value = "";
      input.type = input.dataset.fieldType === "text" ? "text" : "password";

      const control = input.closest(".integration-field__control");
      const toggle = control && control.querySelector("[data-toggle-visibility]");

      if (toggle) {
        toggle.textContent = "Show";
        toggle.setAttribute("aria-pressed", "false");
      }
    });
  }

  function renderGoogleToken(card) {
    const state = getState(card);

    if (!state || !state.root) return;

    const service =
      googleStatus && card === "google-calendar"
        ? googleStatus.calendar
        : googleStatus && card === "google-sheets"
          ? googleStatus.sheets
          : null;
    const account = state.root.querySelector("[data-token-account]");
    const scopes = state.root.querySelector("[data-token-scopes]");

    if (account) {
      account.textContent =
        service && service.accountEmail
          ? service.accountEmail
          : service && service.connected
            ? "Connected"
            : "Not connected";
    }

    if (scopes) {
      const granted = service && Array.isArray(service.scopes) ? service.scopes : [];

      scopes.textContent = granted.length
        ? granted.map((scope) => String(scope).split("/").pop()).join(" · ")
        : "";
    }
  }

  async function integrationFetch(path, { method = "GET", fields } = {}) {
    const response = await fetch(`${API_URL}${path}`, {
      method,
      headers: {
        ...(fields ? { "Content-Type": "application/json" } : {}),
        Authorization: `Bearer ${token}`,
      },
      body: fields ? JSON.stringify({ fields }) : undefined,
    });
    let data = {};

    try {
      data = await response.json();
    } catch (error) {
      data = {};
    }

    return {
      ok: response.ok,
      status: response.status,
      data,
      retryAfter: Number(response.headers.get("Retry-After")) || 60,
    };
  }

  function collectError(result, fallback) {
    return {
      status: result.status,
      code: result.data.code || "provider_error",
      message: result.data.message || fallback,
      field: result.data.field,
      retryAfter: result.retryAfter,
    };
  }

  function handleAuthExpired() {
    localStorage.removeItem("edtspToken");
    localStorage.removeItem("edtspUser");
    sessionStorage.removeItem("edtspToken");
    sessionStorage.removeItem("edtspUser");
    window.location.href = "../login.html";
  }

  function applyRequestError(card, error) {
    if (error.status === 401) {
      showCardError(card, {
        code: "unauthorized",
        message: "Your session expired. Sign in again.",
      });
      handleAuthExpired();
      return;
    }

    if (error.status === 429) {
      const state = getState(card);

      if (state) {
        state.rateLimitedUntil = Date.now() + error.retryAfter * 1000;

        window.setTimeout(() => {
          state.rateLimitedUntil = 0;
          clearCardError(card);
          updateCardControls(card);
        }, error.retryAfter * 1000);
      }
    }

    showCardError(card, error);
  }

  async function testCard(card) {
    const state = getState(card);

    if (!state || state.busy || Date.now() < state.rateLimitedUntil) return;

    state.localResult = null;
    clearCardError(card);
    setCardBusy(card, "test");

    try {
      const result = await integrationFetch(
        `/integrations/${encodeURIComponent(card)}/test`,
        { method: "POST", fields: readFields(card) },
      );

      if (!result.ok) {
        applyRequestError(
          card,
          collectError(result, "The integration could not be tested."),
        );
        return;
      }

      state.localResult = result.data;
      await refreshAuditIfLoaded();
    } catch (error) {
      applyRequestError(card, {
        code: "network_error",
        message: "The server could not be reached. Check your connection and try again.",
      });
    } finally {
      setCardBusy(card, null);
    }
  }

  async function saveCard(card) {
    const state = getState(card);

    if (!state || state.busy || Date.now() < state.rateLimitedUntil) return;

    state.localResult = null;
    clearCardError(card);
    setCardBusy(card, "save");

    try {
      const result = await integrationFetch(
        `/integrations/${encodeURIComponent(card)}`,
        { method: "PUT", fields: readFields(card) },
      );

      if (!result.ok) {
        applyRequestError(
          card,
          collectError(result, "The integration credential could not be saved."),
        );
        return;
      }

      clearFields(card);
      applyMetadata(card, result.data.integration);
      state.dirty = false;
      await refreshAuditIfLoaded();
    } catch (error) {
      applyRequestError(card, {
        code: "network_error",
        message: "The server could not be reached. Check your connection and try again.",
      });
    } finally {
      setCardBusy(card, null);
    }
  }

  function openClearModal(card) {
    if (!clearModal || !clearTitle || !clearCopy || !clearConfirm) return;

    const label = INTEGRATION_LABELS[card] || card;
    const google = card === "google-calendar" || card === "google-sheets";

    pendingClearCard = card;
    clearReturnFocus = clearReturnFocus || document.activeElement;
    clearTitle.textContent = `Clear saved credentials for ${label}?`;
    clearCopy.textContent = google
      ? "The shared Google OAuth client is used by both Google Calendar and Google Sheets. Clearing it affects both cards. Server environment values will be used again where available."
      : "Server environment values will be used again where available. This does not change the integration toggle.";
    clearConfirm.dataset.integration = card;
    clearModal.classList.add("show");
    document.body.classList.add("modal-open");
    clearCancel.focus();
  }

  function closeClearModal() {
    if (!clearModal) return;

    clearModal.classList.remove("show");
    document.body.classList.remove("modal-open");
    pendingClearCard = null;

    if (clearReturnFocus && typeof clearReturnFocus.focus === "function") {
      clearReturnFocus.focus();
    }
    clearReturnFocus = null;
  }

  async function performClear(card) {
    const state = getState(card);

    if (!state) return;

    setCardBusy(card, "clear");

    try {
      const result = await integrationFetch(
        `/integrations/${encodeURIComponent(card)}`,
        { method: "DELETE" },
      );

      if (!result.ok) {
        applyRequestError(
          card,
          collectError(result, "The integration credential could not be cleared."),
        );
        return;
      }

      Object.entries(result.data.integrations || {}).forEach(
        ([key, metadata]) => {
          clearFields(key);
          applyMetadata(key, metadata);

          const target = getState(key);

          if (target) target.dirty = false;
        },
      );

      await refreshAuditIfLoaded();
    } catch (error) {
      applyRequestError(card, {
        code: "network_error",
        message: "The server could not be reached. Check your connection and try again.",
      });
    } finally {
      setCardBusy(card, null);
      closeClearModal();
    }
  }

  function setupIntegrationCards() {
    document.querySelectorAll("[data-integration]").forEach((root) => {
      const card = root.dataset.integration;
      const errorEl = root.querySelector("[data-error]");
      const statusEl = root.querySelector("[data-status]");

      root.querySelectorAll("[data-field]").forEach((fieldEl) => {
        const help = fieldEl.querySelector(".integration-field__help");
        const input = fieldEl.querySelector("[data-secret-input]");

        if (help) help.dataset.originalHelp = help.textContent;
        if (input) input.dataset.fieldType = input.type;
      });

      const defaults = {
        test: root.querySelector('[data-action="test"]')?.textContent || "Test",
        save: root.querySelector('[data-action="save"]')?.textContent || "Save",
        clear:
          root.querySelector('[data-action="clear"]')?.textContent ||
          "Clear saved key",
      };

      integrationState.set(card, {
        root,
        errorEl,
        statusEl,
        defaults,
        metadata: null,
        dirty: false,
        busy: null,
        localResult: null,
        error: null,
        rateLimitedUntil: 0,
      });

      root.addEventListener("input", (event) => {
        const input = event.target.closest("[data-secret-input]");

        if (!input) return;

        const state = getState(card);
        const fieldEl = input.closest("[data-field]");

        if (state) state.dirty = true;
        if (fieldEl) fieldEl.classList.add("integration-field--dirty");
        clearCardError(card);
      });

      root.addEventListener("click", (event) => {
        const visibility = event.target.closest("[data-toggle-visibility]");

        if (visibility) {
          const control = visibility.closest(".integration-field__control");
          const input = control && control.querySelector("[data-secret-input]");

          if (input) {
            const showing = input.type === "text";

            input.type = showing ? "password" : "text";
            visibility.setAttribute("aria-pressed", String(!showing));
            visibility.textContent = showing ? "Show" : "Hide";
            visibility.setAttribute(
              "aria-label",
              `${showing ? "Show" : "Hide"} ${input.name || "credential"}`,
            );
          }
          return;
        }

        const action = event.target.closest("[data-action]");

        if (!action) return;

        const name = action.dataset.action;

        if (name === "test") testCard(card);
        if (name === "save") saveCard(card);
        if (name === "clear") {
          clearReturnFocus = action;
          openClearModal(card);
        }
      });
    });
  }

  function auditActionLabel(action) {
    return action === "test"
      ? "Tested"
      : action === "save"
        ? "Saved"
        : action === "clear"
          ? "Cleared"
          : action;
  }

  function renderAudit() {
    if (!auditRows) return;

    auditRows.textContent = "";

    auditState.entries.forEach((entry) => {
      const row = document.createElement("tr");

      [
        new Date(entry.createdAt).toLocaleString(),
        INTEGRATION_LABELS[entry.integration] || entry.integration,
        auditActionLabel(entry.action),
        `${entry.outcome === "success" ? "Success" : "Failure"} · ${entry.code}`,
        entry.adminEmail || "unknown",
        entry.ip || "—",
      ].forEach((value) => {
        const cell = document.createElement("td");

        cell.textContent = value;
        row.appendChild(cell);
      });

      auditRows.appendChild(row);
    });

    if (auditEmpty) {
      auditEmpty.hidden = !(
        auditState.loaded && auditState.entries.length === 0
      );
    }
    if (auditMore) {
      auditMore.hidden = !auditState.nextBefore;
      auditMore.disabled = auditState.loading;
    }
  }

  async function loadAudit({ reset = false } = {}) {
    if (!auditBody || auditState.loading) return;

    auditState.loading = true;

    if (auditError) {
      auditError.hidden = true;
      auditError.textContent = "";
    }
    if (auditRetry) auditRetry.hidden = true;

    try {
      const before =
        !reset && auditState.nextBefore
          ? `&before=${encodeURIComponent(auditState.nextBefore)}`
          : "";
      const result = await integrationFetch(
        `/integrations/audit?limit=20${before}`,
      );

      if (!result.ok) {
        throw collectError(result, "Activity could not be loaded.");
      }

      auditState.entries = reset
        ? result.data.entries || []
        : auditState.entries.concat(result.data.entries || []);
      auditState.nextBefore = result.data.nextBefore || null;
      auditState.loaded = true;
      renderAudit();
    } catch (error) {
      if (auditError) {
        auditError.textContent = error.message || "Activity could not be loaded.";
        auditError.hidden = false;
      }
      if (auditRetry) auditRetry.hidden = false;
    } finally {
      auditState.loading = false;
      if (auditMore) auditMore.disabled = false;
    }
  }

  async function refreshAuditIfLoaded() {
    if (auditState.loaded) await loadAudit({ reset: true });
  }

  setupIntegrationCards();

  if (auditToggle && auditBody) {
    auditToggle.addEventListener("click", () => {
      const open = auditBody.hidden;

      auditBody.hidden = !open;
      auditToggle.setAttribute("aria-expanded", String(open));
      auditToggle.textContent = open ? "Hide activity" : "Show activity";

      if (open && !auditState.loaded) loadAudit({ reset: true });
    });
  }

  if (auditMore) {
    auditMore.addEventListener("click", () => loadAudit());
  }

  if (auditRetry) {
    auditRetry.addEventListener("click", () => loadAudit({ reset: true }));
  }

  if (clearConfirm) {
    clearConfirm.addEventListener("click", () => {
      const card = clearConfirm.dataset.integration || pendingClearCard;

      if (card) performClear(card);
    });
  }

  if (clearCancel) clearCancel.addEventListener("click", closeClearModal);
  if (clearClose) clearClose.addEventListener("click", closeClearModal);

  if (clearModal) {
    clearModal.addEventListener("click", (event) => {
      if (event.target === clearModal) closeClearModal();
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
