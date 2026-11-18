// =============================
// EDTSP TRAINEE TRAINING APPLICATION
// =============================

(() => {
  const API_BASE = "http://localhost:5000/api";

  const authToken =
    localStorage.getItem("edtspToken") || sessionStorage.getItem("edtspToken");

  const storedUser =
    localStorage.getItem("edtspUser") || sessionStorage.getItem("edtspUser");

  if (!authToken || !storedUser) {
    window.location.href = "../login.html";
    return;
  }

  let account = null;

  try {
    account = JSON.parse(storedUser);
  } catch (error) {
    localStorage.removeItem("edtspToken");
    localStorage.removeItem("edtspUser");
    sessionStorage.removeItem("edtspToken");
    sessionStorage.removeItem("edtspUser");
    window.location.href = "../login.html";
    return;
  }

  if (!account || account.role !== "trainee") {
    window.location.href = "../login.html";
    return;
  }

  const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const PHONE_REGEX = /^[0-9+()\-\s]{7,20}$/;

  const MAX_FILE_BYTES = 10 * 1024 * 1024;
  const MAX_APPLICATION_BYTES = 30 * 1024 * 1024;
  const MAX_FILES_PER_DOCUMENT = 10;

  // Storage uses snake_case; the multipart field and URL segment use camelCase.
  const DOCUMENT_TYPES = [
    { type: "cv", label: "Curriculum Vitae", field: "cv" },
    { type: "valid_id", label: "Valid ID", field: "validId" },
  ];

  const DOCUMENT_LABELS = DOCUMENT_TYPES.reduce((map, docType) => {
    map[docType.type] = docType.label;
    return map;
  }, {});

  const START_REASONS = {
    already_enrolled:
      "Your enrolment is active, so a new application is not needed.",
    completed:
      "Your training is complete, so applications are closed for this account.",
    account_inactive:
      "This account cannot submit applications. Please contact the administrator.",
  };

  const DRAFT_KEY = "edtspApplyDraft";
  const DRAFT_VERSION = 1;

  // Program and batch are restored on their own so they line up with the
  // options rendered from the latest availability.
  const DRAFT_FIELDS = [
    "firstName",
    "lastName",
    "email",
    "phone",
    "address",
    "dateOfBirth",
    "sex",
    "civilStatus",
    "highestEducation",
    "schoolAttended",
    "emergencyContactName",
    "emergencyContactPhone",
    "emergencyContactRelationship",
    "motivation",
    "acknowledgedTruthful",
  ];

  const state = {
    step: 1,
    programs: [],
    application: null,
    canApply: false,
    reason: null,
    identity: null,
    loaded: false,
    justSubmitted: false,
    availabilityRequestId: 0,
    documents: { cv: [], valid_id: [] },
    inherited: { cv: [], valid_id: [] },
    formOpen: false,
    submitting: false,
    draft: null,
    deepLink: false,
  };

  const elements = {
    loading: document.getElementById("loadingPanel"),
    notice: document.getElementById("noticePanel"),
    noticeTitle: document.getElementById("noticeTitle"),
    noticeText: document.getElementById("noticeText"),
    noticeRetry: document.getElementById("noticeRetry"),
    status: document.getElementById("statusPanel"),
    statusBadge: document.getElementById("statusBadge"),
    statusMessage: document.getElementById("statusMessage"),
    statusMessageTitle: document.getElementById("statusMessageTitle"),
    statusMessageText: document.getElementById("statusMessageText"),
    statusFacts: document.getElementById("statusFacts"),
    statusProgram: document.getElementById("statusProgram"),
    statusBatch: document.getElementById("statusBatch"),
    statusSubmitted: document.getElementById("statusSubmitted"),
    statusDecided: document.getElementById("statusDecided"),
    statusNoteRow: document.getElementById("statusNoteRow"),
    statusNote: document.getElementById("statusNote"),
    withdrawBtn: document.getElementById("withdrawBtn"),
    withdrawModal: document.getElementById("withdrawConfirmModal"),
    cancelWithdraw: document.getElementById("cancelWithdraw"),
    cancelWithdrawClose: document.getElementById("cancelWithdrawClose"),
    confirmWithdraw: document.getElementById("confirmWithdraw"),
    start: document.getElementById("startPanel"),
    startTitle: document.getElementById("start-title"),
    startOutcome: document.getElementById("startOutcome"),
    startOutcomeBadge: document.getElementById("startOutcomeBadge"),
    startOutcomeDate: document.getElementById("startOutcomeDate"),
    startOutcomeNote: document.getElementById("startOutcomeNote"),
    startApplyBtn: document.getElementById("startApplyBtn"),
    startOverBtn: document.getElementById("startOverBtn"),
    startOverModal: document.getElementById("startOverConfirmModal"),
    cancelStartOver: document.getElementById("cancelStartOver"),
    cancelStartOverClose: document.getElementById("cancelStartOverClose"),
    confirmStartOver: document.getElementById("confirmStartOver"),
    startCheckBtn: document.getElementById("startCheckBtn"),
    startReason: document.getElementById("startReason"),
    startError: document.getElementById("startError"),
    startDraftHint: document.getElementById("startDraftHint"),
    wizard: document.getElementById("wizardPanel"),
    wizardTitle: document.getElementById("wizard-title"),
    wizardMeta: document.getElementById("wizardMeta"),
    draftBanner: document.getElementById("draftBanner"),
    draftBannerText: document.getElementById("draftBannerText"),
    draftBannerDismiss: document.getElementById("draftBannerDismiss"),
    backToOverviewBtn: document.getElementById("backToOverviewBtn"),
    wizardSteps: Array.from(document.querySelectorAll("#wizardSteps li")),
    form: document.getElementById("applicationForm"),
    steps: Array.from(document.querySelectorAll(".wizard__step")),
    backBtn: document.getElementById("backBtn"),
    nextBtn: document.getElementById("nextBtn"),
    submitBtn: document.getElementById("submitBtn"),
    submitError: document.getElementById("submitError"),
    program: document.getElementById("program"),
    batch: document.getElementById("batch"),
    programHint: document.getElementById("programHint"),
    motivation: document.getElementById("motivation"),
    motivationCount: document.getElementById("motivationCount"),
    review: document.getElementById("reviewSummary"),
    documentInputs: {
      cv: document.getElementById("cvFiles"),
      valid_id: document.getElementById("validIdFiles"),
    },
    documentLists: {
      cv: document.getElementById("cvList"),
      valid_id: document.getElementById("validIdList"),
    },
    draftHints: {
      cv: document.getElementById("cvDraftHint"),
      valid_id: document.getElementById("validIdDraftHint"),
    },
    statusDocuments: document.getElementById("statusDocuments"),
    statusDocumentList: document.getElementById("statusDocumentList"),
    statusDocumentError: document.getElementById("statusDocumentError"),
  };

  function formatDate(value) {
    if (!value) return "—";

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) return "—";

    return date.toLocaleDateString("en-PH", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  }
  function formatBytes(bytes) {
    const value = Number(bytes) || 0;

    if (value >= 1024 * 1024) {
      return `${(value / (1024 * 1024)).toFixed(1)} MB`;
    }

    if (value >= 1024) {
      return `${Math.round(value / 1024)} KB`;
    }

    return `${value} B`;
  }

  function clearSessionAndRedirect() {
    localStorage.removeItem("edtspToken");
    localStorage.removeItem("edtspUser");
    sessionStorage.removeItem("edtspToken");
    sessionStorage.removeItem("edtspUser");
    window.location.href = "../login.html";
  }

  // ---------- Draft ----------

  function draftStore() {
    try {
      return window.localStorage;
    } catch (error) {
      return null;
    }
  }

  function currentUserId() {
    const user = (state.identity && state.identity.user) || account || {};

    return String(user._id || user.id || "");
  }

  // A draft belongs to one account and one shape; anything else is discarded
  // so a shared device cannot restore someone else's answers.
  function readDraft() {
    const store = draftStore();
    const userId = currentUserId();

    if (!store || !userId) return null;

    let draft = null;

    try {
      draft = JSON.parse(store.getItem(DRAFT_KEY) || "null");
    } catch (error) {
      draft = null;
    }

    const step = draft ? Number(draft.step) : 0;

    const usable =
      draft &&
      draft.version === DRAFT_VERSION &&
      String(draft.userId) === userId &&
      Number.isInteger(step) &&
      step >= 1 &&
      step <= 6;

    if (!usable) {
      if (draft) store.removeItem(DRAFT_KEY);
      return null;
    }

    return draft;
  }

  function saveDraft() {
    if (!state.formOpen || state.submitting) return;

    const store = draftStore();
    const userId = currentUserId();

    if (!store || !userId) return;

    const values = {};

    DRAFT_FIELDS.forEach((id) => {
      const field = document.getElementById(id);

      if (!field) return;

      values[id] = field.type === "checkbox" ? field.checked : field.value;
    });

    values.program = elements.program.value;
    values.batch = elements.batch.value;

    // Chosen files cannot be persisted; their names are kept so the
    // Documents step can ask for them again.
    const documentNames = { cv: [], valid_id: [] };

    DOCUMENT_TYPES.forEach((docType) => {
      documentNames[docType.type] = documentEntries(docType.type)
        .filter((entry) => entry.kind === "new")
        .map((entry) => entry.name);
    });

    const draft = {
      version: DRAFT_VERSION,
      userId,
      savedAt: new Date().toISOString(),
      step: state.step,
      values,
      documentNames,
    };

    try {
      store.setItem(DRAFT_KEY, JSON.stringify(draft));
      state.draft = draft;
    } catch (error) {
      console.error("[apply] could not save the draft", error);
    }
  }

  let draftSaveTimer = null;

  function queueDraftSave() {
    window.clearTimeout(draftSaveTimer);
    draftSaveTimer = window.setTimeout(saveDraft, 400);
  }

  function clearDraft() {
    window.clearTimeout(draftSaveTimer);
    draftSaveTimer = null;
    state.draft = null;

    const store = draftStore();

    if (store) store.removeItem(DRAFT_KEY);
  }

  function renderDraftFileHints() {
    DOCUMENT_TYPES.forEach((docType) => {
      const hint = elements.draftHints[docType.type];

      if (!hint) return;

      const saved =
        (state.draft &&
          state.draft.documentNames &&
          state.draft.documentNames[docType.type]) ||
        [];
      const attached = newFilesFor(docType.type).map((file) => file.name);
      const missing = saved.filter((name) => !attached.includes(name));

      hint.hidden = !missing.length;
      hint.textContent = missing.length
        ? `Saved with your draft: ${missing.join(", ")} — attach them again.`
        : "";
    });
  }

  // ---------- Documents ----------

  function documentEntries(type) {
    return state.documents[type] || [];
  }

  function newFilesFor(type) {
    return documentEntries(type)
      .filter((entry) => entry.kind === "new")
      .map((entry) => entry.file);
  }

  function totalNewBytes() {
    return DOCUMENT_TYPES.reduce(
      (total, docType) =>
        total +
        newFilesFor(docType.type).reduce((sum, file) => sum + file.size, 0),
      0,
    );
  }

  function setDocumentError(type, message) {
    const field = document.getElementById(
      type === "cv" ? "cvDocumentField" : "validIdDocumentField",
    );
    const input = elements.documentInputs[type];

    if (input) input.setAttribute("aria-invalid", "true");

    if (!field) return;

    let error = field.querySelector(".field__error");

    if (!error) {
      error = document.createElement("p");
      error.className = "field__error";
      field.append(error);
    }

    error.textContent = message;
  }

  function renderDocumentLists() {
    DOCUMENT_TYPES.forEach((docType) => {
      const list = elements.documentLists[docType.type];

      if (!list) return;

      list.innerHTML = "";

      documentEntries(docType.type).forEach((entry) => {
        const item = document.createElement("li");
        item.className = "document-list__item";

        const name = document.createElement("span");
        name.className = "document-list__name";
        name.textContent = entry.name;

        const size = document.createElement("span");
        size.className = "document-list__size";
        size.textContent = formatBytes(entry.size);

        const remove = document.createElement("button");
        remove.type = "button";
        remove.className = "document-link";
        remove.textContent = "Remove";
        remove.setAttribute(
          "aria-label",
          `Remove ${entry.name} from ${docType.label}`,
        );
        remove.addEventListener("click", () => {
          state.documents[docType.type] = documentEntries(docType.type).filter(
            (candidate) => candidate !== entry,
          );

          renderDocumentLists();
        });

        item.append(name, size, remove);

        if (entry.kind === "inherited") {
          const note = document.createElement("span");
          note.className = "document-list__note";
          note.textContent = "from your last application";
          item.append(note);
        }

        list.append(item);
      });
    });

    renderDraftFileHints();
  }

  function resetDocumentState() {
    state.documents = {
      cv: [...state.inherited.cv],
      valid_id: [...state.inherited.valid_id],
    };

    Object.values(elements.documentInputs).forEach((input) => {
      if (input) input.value = "";
    });

    renderDocumentLists();
  }

  function addDocumentFiles(type, fileList) {
    const files = Array.from(fileList || []);

    if (!files.length) return;

    let error = null;
    let total = totalNewBytes();

    for (const file of files) {
      if (error) break;

      if (!/\.(pdf|jpe?g|png)$/i.test(file.name)) {
        error =
          "That file is not a PDF, JPG or PNG. Please check the file and try again.";
      } else if (!file.size) {
        error = "That file is empty. Please choose another.";
      } else if (file.size > MAX_FILE_BYTES) {
        error = "Each file must be 10 MB or smaller.";
      } else if (total + file.size > MAX_APPLICATION_BYTES) {
        error =
          "These documents are too large together. Keep the total under 30 MB.";
      } else {
        total += file.size;
      }
    }

    if (
      !error &&
      documentEntries(type).length + files.length > MAX_FILES_PER_DOCUMENT
    ) {
      error = "You can attach up to 10 files per document.";
    }

    if (error) {
      setDocumentError(type, error);
      return;
    }

    files.forEach((file) => {
      state.documents[type].push({
        kind: "new",
        name: file.name,
        size: file.size,
        file,
      });
    });

    renderDocumentLists();
  }

  // The most recent earlier application that still has documents is the one
  // a re-application starts from.
  function inheritedDocumentsFrom(history) {
    const inherited = { cv: [], valid_id: [] };

    const source = (history || []).find(
      (item) =>
        Array.isArray(item.documents) &&
        item.documents.some((entry) => (entry.files || []).length),
    );

    if (!source) return inherited;

    source.documents.forEach((entry) => {
      if (!inherited[entry.type]) return;

      (entry.files || []).forEach((file) => {
        inherited[entry.type].push({
          kind: "inherited",
          name: file.filename,
          size: file.size,
          fileId: String(file.fileId),
        });
      });
    });

    return inherited;
  }

  function submitWithProgress(form) {
    return new Promise((resolve, reject) => {
      const request = new XMLHttpRequest();

      request.open("POST", `${API_BASE}/applications`);
      request.setRequestHeader("Authorization", `Bearer ${authToken}`);

      request.upload.addEventListener("progress", (event) => {
        if (!event.lengthComputable) return;

        const percent = Math.round((event.loaded / event.total) * 100);

        elements.submitBtn.textContent = `Uploading documents… ${percent}%`;
      });

      request.addEventListener("load", () => {
        if (request.status === 401) {
          clearSessionAndRedirect();
          reject(new Error("Session expired."));
          return;
        }

        let data = null;

        try {
          data = JSON.parse(request.responseText);
        } catch (error) {
          data = null;
        }

        if (
          request.status >= 200 &&
          request.status < 300 &&
          data &&
          data.success
        ) {
          resolve(data);
          return;
        }

        reject(
          new Error(
            (data && data.message) ||
              "We could not upload your documents. Check your connection and try again.",
          ),
        );
      });

      request.addEventListener("error", () => {
        reject(
          new Error(
            "We could not upload your documents. Check your connection and try again.",
          ),
        );
      });

      request.addEventListener("abort", () => {
        reject(new Error("The upload was cancelled. Try again."));
      });

      request.send(form);
    });
  }

  async function apiUpload(path, form) {
    const response = await fetch(`${API_BASE}${path}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${authToken}` },
      body: form,
    });

    if (response.status === 401) {
      clearSessionAndRedirect();
      throw new Error("Session expired.");
    }

    const data = await response.json();

    if (!response.ok || !data.success) {
      const error = new Error(
        data.message || "The request could not be completed.",
      );
      error.status = response.status;
      throw error;
    }

    return data;
  }

  function setStatusDocumentError(message) {
    elements.statusDocumentError.textContent = message || "";
    elements.statusDocumentError.hidden = !message;
  }

  function canManageDocuments() {
    return Boolean(
      state.application &&
      ["Submitted", "Under review"].includes(state.application.status),
    );
  }

  async function downloadDocument(applicationId, fileId, filename, button) {
    const label = button.textContent;

    button.disabled = true;
    button.textContent = "Preparing…";
    setStatusDocumentError("");

    try {
      const response = await fetch(
        `${API_BASE}/applications/${applicationId}/documents/${fileId}`,
        { headers: { Authorization: `Bearer ${authToken}` } },
      );

      if (response.status === 401) {
        clearSessionAndRedirect();
        throw new Error("Session expired.");
      }

      if (!response.ok) {
        throw new Error(
          "That file is no longer available. Please contact the training office.",
        );
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");

      link.href = url;
      link.download = filename || "document";

      document.body.append(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (error) {
      setStatusDocumentError(
        error.message || "That file could not be downloaded.",
      );
    } finally {
      button.disabled = false;
      button.textContent = label;
    }
  }

  async function replaceDocument(applicationId, type, oldFileId, button) {
    const picker = document.createElement("input");

    picker.type = "file";
    picker.accept = ".pdf,.jpg,.jpeg,.png";
    picker.className = "sr-only";

    picker.addEventListener("change", async () => {
      const file = picker.files && picker.files[0];

      picker.remove();

      if (!file) return;

      if (!/\.(pdf|jpe?g|png)$/i.test(file.name)) {
        setStatusDocumentError(
          "That file is not a PDF, JPG or PNG. Please check the file and try again.",
        );
        return;
      }

      if (!file.size) {
        setStatusDocumentError("That file is empty. Please choose another.");
        return;
      }

      if (file.size > MAX_FILE_BYTES) {
        setStatusDocumentError("Each file must be 10 MB or smaller.");
        return;
      }

      const label = button.textContent;

      button.disabled = true;
      button.textContent = "Uploading…";
      setStatusDocumentError("");

      try {
        const form = new FormData();

        form.append("file", file, file.name);

        await apiUpload(
          `/applications/${applicationId}/documents/${DOCUMENT_TYPES.find((entry) => entry.type === type).field}`,
          form,
        );

        await api(`/applications/${applicationId}/documents/${oldFileId}`, {
          method: "DELETE",
        });

        await loadApplicationState();
        showStatus();
      } catch (error) {
        setStatusDocumentError(
          error.message || "Unable to upload that document. Please try again.",
        );

        if (button.isConnected) {
          button.disabled = false;
          button.textContent = label;
        }
      }
    });

    document.body.append(picker);
    picker.click();
  }

  function confirmDocumentRemoval() {
    const modal = document.getElementById("removeDocumentConfirmModal");
    const cancelButton = document.getElementById("cancelRemoveDocument");
    const closeButton = document.getElementById("cancelRemoveDocumentClose");
    const confirmButton = document.getElementById("confirmRemoveDocument");

    return new Promise((resolve) => {
      const finish = (confirmed) => {
        modal.classList.remove("show");
        document.body.classList.remove("modal-open");

        cancelButton.removeEventListener("click", onCancel);
        closeButton.removeEventListener("click", onCancel);
        confirmButton.removeEventListener("click", onConfirm);
        modal.removeEventListener("click", onBackdrop);
        document.removeEventListener("keydown", onEscape);

        resolve(confirmed);
      };

      const onCancel = () => finish(false);
      const onConfirm = () => finish(true);
      const onBackdrop = (event) => {
        if (event.target === modal) finish(false);
      };
      const onEscape = (event) => {
        if (event.key === "Escape") finish(false);
      };

      cancelButton.addEventListener("click", onCancel);
      closeButton.addEventListener("click", onCancel);
      confirmButton.addEventListener("click", onConfirm);
      modal.addEventListener("click", onBackdrop);
      document.addEventListener("keydown", onEscape);

      modal.classList.add("show");
      document.body.classList.add("modal-open");
    });
  }

  async function removeDocument(applicationId, fileId) {
    if (!(await confirmDocumentRemoval())) return;

    setStatusDocumentError("");

    try {
      await api(`/applications/${applicationId}/documents/${fileId}`, {
        method: "DELETE",
      });

      await loadApplicationState();
      showStatus();
    } catch (error) {
      console.error("Unable to remove application document:", error);
      setStatusDocumentError(
        error.message || "Unable to remove that document.",
      );
    }
  }

  function renderStatusDocuments() {
    const application = state.application;
    const entries = ((application && application.documents) || []).filter(
      (entry) => (entry.files || []).length,
    );

    elements.statusDocumentList.innerHTML = "";
    elements.statusDocuments.hidden = !entries.length;
    setStatusDocumentError("");

    if (!entries.length) return;

    const manageable = canManageDocuments();

    entries.forEach((entry) => {
      const block = document.createElement("div");
      block.className = "document";

      const head = document.createElement("div");
      head.className = "document__head";
      head.textContent = DOCUMENT_LABELS[entry.type] || entry.type;

      const list = document.createElement("ul");
      list.className = "document-list";

      entry.files.forEach((file) => {
        const item = document.createElement("li");
        item.className = "document-list__item";

        const name = document.createElement("span");
        name.className = "document-list__name";
        name.textContent = file.filename;

        const size = document.createElement("span");
        size.className = "document-list__size";
        size.textContent = formatBytes(file.size);

        const actions = document.createElement("span");
        actions.className = "document__actions";

        const download = document.createElement("button");
        download.type = "button";
        download.className = "document-link";
        download.textContent = "Download";
        download.addEventListener("click", () =>
          downloadDocument(
            application._id,
            file.fileId,
            file.filename,
            download,
          ),
        );

        actions.append(download);

        if (manageable) {
          const replace = document.createElement("button");
          replace.type = "button";
          replace.className = "document-link";
          replace.textContent = "Replace";
          replace.setAttribute("aria-label", `Replace ${file.filename}`);
          replace.addEventListener("click", () =>
            replaceDocument(application._id, entry.type, file.fileId, replace),
          );

          actions.append(replace);

          // A required document may be swapped, never emptied.
          if (entry.files.length > 1) {
            const remove = document.createElement("button");
            remove.type = "button";
            remove.className = "document-link";
            remove.textContent = "Remove";
            remove.setAttribute("aria-label", `Remove ${file.filename}`);
            remove.addEventListener("click", () =>
              removeDocument(application._id, file.fileId),
            );

            actions.append(remove);
          }
        }

        item.append(name, size, actions);
        list.append(item);
      });

      block.append(head, list);
      elements.statusDocumentList.append(block);
    });
  }

  async function api(path, options = {}) {
    const response = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${authToken}`,
        ...(options.headers || {}),
      },
    });

    if (response.status === 401) {
      localStorage.removeItem("edtspToken");
      localStorage.removeItem("edtspUser");
      sessionStorage.removeItem("edtspToken");
      sessionStorage.removeItem("edtspUser");
      window.location.href = "../login.html";
      throw new Error("Session expired.");
    }

    const data = await response.json();

    if (!response.ok || !data.success) {
      const error = new Error(
        data.message || "The request could not be completed.",
      );
      error.status = response.status;
      throw error;
    }

    return data;
  }

  function showOnly(panel) {
    [
      elements.loading,
      elements.notice,
      elements.start,
      elements.status,
      elements.wizard,
    ].forEach((item) => {
      item.hidden = item !== panel;
    });

    state.formOpen = panel === elements.wizard;
  }

  function showNotice(title, text, retryable) {
    elements.noticeTitle.textContent = title;
    elements.noticeText.textContent = text;
    elements.noticeRetry.hidden = !retryable;
    showOnly(elements.notice);
  }

  // ---------- Data ----------

  async function loadApplicationState() {
    const [identity, applicationData, batchData] = await Promise.all([
      api("/trainee/me"),
      api("/applications/me"),
      api("/applications/open-batches"),
    ]);

    state.identity = {
      user: identity.user,
      profile: identity.profile,
    };
    state.application = applicationData.application;
    state.canApply = Boolean(applicationData.canApply);
    state.reason = applicationData.reason;
    state.programs = batchData.programs || [];
    state.inherited = inheritedDocumentsFrom(applicationData.history || []);
    state.loaded = true;
  }

  // ---------- Identity prefill ----------

  function prefillContactFields() {
    if (!state.identity) return;

    const { user, profile } = state.identity;

    const setIfEmpty = (id, value) => {
      const field = document.getElementById(id);

      if (field && !field.value && value) {
        field.value = value;
      }
    };

    setIfEmpty("firstName", user.firstName);
    setIfEmpty("lastName", user.lastName);
    setIfEmpty("email", user.email);
    setIfEmpty("phone", profile ? profile.phone : "");

    if (profile && profile.address) {
      const address = document.getElementById("address");

      if (address && !address.value) {
        address.value = profile.address;
      }
    }
  }

  // ---------- Wizard ----------

  function listedPrograms() {
    return state.programs.filter(
      (program) => program.batches && program.batches.length,
    );
  }

  function renderProgramOptions() {
    const previous = elements.program.value;

    elements.program.innerHTML = "";

    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = "Select a program";
    elements.program.append(placeholder);

    const programs = listedPrograms();

    programs.forEach((program) => {
      const option = document.createElement("option");
      option.value = program._id;
      option.textContent = program.name;
      elements.program.append(option);
    });

    if (programs.some((program) => program._id === previous)) {
      elements.program.value = previous;
    }

    return elements.program.value;
  }

  function fillBatchOptions(programId, preferredBatchId = "") {
    elements.batch.innerHTML = "";

    const program = state.programs.find((item) => item._id === programId);

    if (!program) {
      const option = document.createElement("option");
      option.value = "";
      option.textContent = "Select a program first";
      elements.batch.append(option);
      elements.batch.disabled = true;
      elements.programHint.textContent = "";
      return;
    }

    const hasAvailable = program.batches.some(
      (batch) => batch.filledCount < batch.slotCapacity,
    );

    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = hasAvailable
      ? "Select a batch"
      : "All batches are full";
    elements.batch.append(placeholder);

    program.batches.forEach((batch) => {
      const isFull = batch.filledCount >= batch.slotCapacity;
      const option = document.createElement("option");

      option.value = batch._id;
      option.disabled = isFull;
      option.textContent = isFull
        ? `${batch.label} — Full`
        : `${batch.label} — ${batch.slotsRemaining} slot${
            batch.slotsRemaining === 1 ? "" : "s"
          } left`;
      elements.batch.append(option);
    });

    elements.batch.disabled = false;

    const fee = Number(program.fee || 0).toLocaleString("en-PH");

    elements.programHint.textContent = hasAvailable
      ? `Training fee: ₱${fee}.`
      : `Training fee: ₱${fee}. All batches are full.`;

    if (preferredBatchId) {
      const preferred = Array.from(elements.batch.options).find(
        (option) => option.value === preferredBatchId && !option.disabled,
      );

      if (preferred) {
        elements.batch.value = preferredBatchId;
      }
    }
  }

  function updateWizardChrome() {
    elements.wizardSteps.forEach((item, index) => {
      const step = index + 1;

      item.classList.toggle("is-current", step === state.step);
      item.classList.toggle("is-done", step < state.step);
    });

    elements.steps.forEach((panel) => {
      panel.hidden = Number(panel.dataset.step) !== state.step;
    });

    elements.wizardMeta.textContent = `Step ${state.step} of 6`;
    elements.backBtn.hidden = state.step === 1;
    elements.nextBtn.hidden = state.step === 6;
    elements.submitBtn.hidden = state.step !== 6;

    document
      .querySelectorAll(".wizard__step [aria-invalid]")
      .forEach((field) => {
        field.removeAttribute("aria-invalid");
      });
  }

  async function goToStep(
    step,
    { skipAvailability = false, smooth = true } = {},
  ) {
    const target = Math.min(Math.max(step, 1), 6);

    if (target === 4 && state.loaded && !skipAvailability) {
      await refreshAvailability();
    }

    state.step = target;

    if (state.step === 6) {
      buildReview();
    }

    updateWizardChrome();

    const panelTop =
      elements.wizard.getBoundingClientRect().top + window.scrollY;

    window.scrollTo({ top: panelTop, behavior: smooth ? "smooth" : "auto" });

    saveDraft();
  }

  async function refreshAvailability() {
    const requestId = state.availabilityRequestId + 1;
    state.availabilityRequestId = requestId;

    elements.programHint.textContent = "Checking availability…";

    try {
      const data = await api("/applications/open-batches");

      if (requestId !== state.availabilityRequestId) return;

      state.programs = data.programs || [];

      const previousProgram = elements.program.value;
      const previousBatch = elements.batch.value;

      if (!listedPrograms().length) {
        showNotice(
          "Applications are closed right now.",
          "There are no open batches accepting applications. Check back with the training office.",
        );
        return;
      }

      const programId = renderProgramOptions();

      fillBatchOptions(programId, previousBatch);

      if (previousProgram && programId !== previousProgram) {
        elements.programHint.textContent =
          "That program is no longer available. Choose another.";
        return;
      }

      if (previousBatch) {
        const option = Array.from(elements.batch.options).find(
          (item) => item.value === previousBatch,
        );

        if (!option || option.disabled) {
          elements.batch.value = "";
          elements.programHint.textContent =
            "That batch is no longer available. Choose another.";
        }
      }
    } catch (error) {
      console.error("[apply] availability refresh failed", error);
      elements.programHint.textContent =
        "Could not check availability. Showing the last known list.";
    }
  }

  // ---------- Validation ----------

  function fieldWrap(input) {
    return input.closest(".field");
  }

  function setFieldError(input, message) {
    const wrap = fieldWrap(input);

    if (!wrap) return;

    input.setAttribute("aria-invalid", "true");

    let error = wrap.querySelector(".field__error");

    if (!error) {
      error = document.createElement("p");
      error.className = "field__error";
      wrap.append(error);
    }

    error.textContent = message;
  }

  function clearFieldErrors() {
    document
      .querySelectorAll(".wizard__step .field__error")
      .forEach((error) => {
        error.remove();
      });

    document
      .querySelectorAll(".wizard__step [aria-invalid]")
      .forEach((field) => {
        field.removeAttribute("aria-invalid");
      });
  }

  function validateStep(step) {
    clearFieldErrors();

    let valid = true;

    const requireText = (id, message) => {
      const field = document.getElementById(id);

      if (!field.value.trim()) {
        setFieldError(field, message);
        valid = false;
      }
    };

    if (step === 1) {
      requireText("firstName", "Enter your first name.");
      requireText("lastName", "Enter your last name.");

      const email = document.getElementById("email");

      if (!EMAIL_REGEX.test(email.value.trim())) {
        setFieldError(email, "Enter a valid email address.");
        valid = false;
      }

      const phone = document.getElementById("phone");

      if (!PHONE_REGEX.test(phone.value.trim())) {
        setFieldError(phone, "Enter a valid phone number.");
        valid = false;
      }

      requireText("address", "Enter your address.");
    }

    if (step === 2) {
      const dateOfBirth = document.getElementById("dateOfBirth");
      const parsed = new Date(dateOfBirth.value);

      if (
        !dateOfBirth.value ||
        Number.isNaN(parsed.getTime()) ||
        parsed.getTime() > Date.now()
      ) {
        setFieldError(dateOfBirth, "Enter a valid date of birth.");
        valid = false;
      } else {
        const now = new Date();
        let age = now.getFullYear() - parsed.getFullYear();
        const monthDiff = now.getMonth() - parsed.getMonth();

        if (
          monthDiff < 0 ||
          (monthDiff === 0 && now.getDate() < parsed.getDate())
        ) {
          age -= 1;
        }

        if (age < 18) {
          setFieldError(dateOfBirth, "Applicants must be 18 years or older.");
          valid = false;
        }
      }

      ["sex", "civilStatus", "highestEducation"].forEach((id) => {
        const field = document.getElementById(id);

        if (!field.value) {
          setFieldError(field, "Choose an option.");
          valid = false;
        }
      });

      requireText("schoolAttended", "Enter the school you attended.");
    }

    if (step === 3) {
      requireText("emergencyContactName", "Enter the contact's name.");
      requireText("emergencyContactRelationship", "Enter the relationship.");

      const emergencyPhone = document.getElementById("emergencyContactPhone");

      if (!PHONE_REGEX.test(emergencyPhone.value.trim())) {
        setFieldError(emergencyPhone, "Enter a valid contact number.");
        valid = false;
      }
    }

    if (step === 4) {
      const program = state.programs.find(
        (item) => item._id === elements.program.value,
      );

      if (!elements.program.value) {
        setFieldError(elements.program, "Choose a program.");
        valid = false;
      } else if (!program || !program.batches.length) {
        setFieldError(elements.program, "That program is no longer available.");
        valid = false;
      } else if (!elements.batch.value) {
        const hasAvailable = program.batches.some(
          (batch) => batch.filledCount < batch.slotCapacity,
        );

        setFieldError(
          elements.batch,
          hasAvailable ? "Choose a batch." : "Choose an available batch.",
        );
        valid = false;
      } else {
        const batch = program.batches.find(
          (item) => item._id === elements.batch.value,
        );

        if (!batch || batch.filledCount >= batch.slotCapacity) {
          setFieldError(elements.batch, "Choose an available batch.");
          valid = false;
        }
      }

      const acknowledgment = document.getElementById("acknowledgedTruthful");

      if (!acknowledgment.checked) {
        setFieldError(
          acknowledgment,
          "Please confirm that the information is true.",
        );
        valid = false;
      }
    }

    if (step === 5) {
      DOCUMENT_TYPES.forEach((docType) => {
        if (documentEntries(docType.type).length) return;

        setDocumentError(
          docType.type,
          `Attach your ${docType.label} before submitting.`,
        );
        valid = false;
      });
    }

    return valid;
  }

  // ---------- Review ----------

  function addFactRow(list, label, value) {
    const row = document.createElement("div");
    const term = document.createElement("dt");
    const detail = document.createElement("dd");

    term.textContent = label;
    detail.textContent = value || "—";

    row.append(term, detail);
    list.append(row);
  }

  function addReviewGroup(title, step, rows) {
    const group = document.createElement("div");
    group.className = "review__group";

    const head = document.createElement("div");
    head.className = "review__group-head";

    const heading = document.createElement("h3");
    heading.textContent = title;

    const edit = document.createElement("button");
    edit.type = "button";
    edit.className = "text-link";
    edit.textContent = "Edit";
    edit.addEventListener("click", () => goToStep(step));

    head.append(heading, edit);

    const list = document.createElement("dl");
    list.className = "facts";

    rows.forEach((row) => addFactRow(list, row.label, row.value));

    group.append(head, list);
    elements.review.append(group);
  }

  function valueOf(id) {
    const field = document.getElementById(id);
    return field ? field.value.trim() : "";
  }

  function buildReview() {
    elements.review.innerHTML = "";

    addReviewGroup("Applicant details", 1, [
      {
        label: "Name",
        value: `${valueOf("firstName")} ${valueOf("lastName")}`.trim(),
      },
      { label: "Email", value: valueOf("email") },
      { label: "Phone", value: valueOf("phone") },
      { label: "Address", value: valueOf("address") },
    ]);

    addReviewGroup("Background", 2, [
      { label: "Date of birth", value: formatDate(valueOf("dateOfBirth")) },
      { label: "Sex", value: valueOf("sex") },
      { label: "Civil status", value: valueOf("civilStatus") },
      { label: "Highest education", value: valueOf("highestEducation") },
      { label: "School attended", value: valueOf("schoolAttended") },
    ]);

    addReviewGroup("Emergency contact", 3, [
      { label: "Contact name", value: valueOf("emergencyContactName") },
      { label: "Contact phone", value: valueOf("emergencyContactPhone") },
      { label: "Relationship", value: valueOf("emergencyContactRelationship") },
    ]);

    const program = state.programs.find(
      (item) => item._id === elements.program.value,
    );
    const batch = program
      ? program.batches.find((item) => item._id === elements.batch.value)
      : null;

    addReviewGroup("Training choice", 4, [
      { label: "Program", value: program ? program.name : "" },
      { label: "Batch", value: batch ? batch.label : "" },
    ]);

    addReviewGroup(
      "Documents",
      5,
      DOCUMENT_TYPES.map((docType) => ({
        label: docType.label,
        value: documentEntries(docType.type)
          .map((entry) => `${entry.name} · ${formatBytes(entry.size)}`)
          .join(", "),
      })),
    );

    if (valueOf("motivation")) {
      addReviewGroup("Motivation", 4, [
        { label: "Statement", value: valueOf("motivation") },
      ]);
    }
  }

  // ---------- Status rendering ----------

  const STATUS_STYLES = {
    Submitted: { label: "Submitted", className: "submitted" },
    "Under review": { label: "Under review", className: "under-review" },
    Approved: { label: "Approved", className: "approved" },
    Rejected: { label: "Rejected", className: "rejected" },
    Withdrawn: { label: "Withdrawn", className: "withdrawn" },
  };

  function setStatusMessage(title, text) {
    elements.statusMessageTitle.textContent = title;
    elements.statusMessageText.textContent = text;
    elements.statusMessage.hidden = false;
  }

  function showStatus() {
    const application = state.application;
    const messageEmail =
      (state.identity && state.identity.user.email) || "your email";

    elements.statusBadge.hidden = !application;
    elements.statusFacts.hidden = !application;

    if (application) {
      const style =
        STATUS_STYLES[application.status] || STATUS_STYLES.Submitted;

      elements.statusBadge.textContent = style.label;
      elements.statusBadge.className = `status-badge ${style.className}`;

      elements.statusProgram.textContent = application.program
        ? application.program.name
        : "—";
      elements.statusBatch.textContent = application.batch
        ? application.batch.label
        : "—";
      elements.statusSubmitted.textContent = formatDate(
        application.submittedAt,
      );
      elements.statusDecided.textContent = application.decidedAt
        ? formatDate(application.decidedAt)
        : "Not decided yet";

      elements.statusNote.textContent = application.publicNote || "";
      elements.statusNoteRow.hidden = !application.publicNote;
    }

    elements.statusMessage.hidden = true;
    elements.withdrawBtn.hidden = true;

    if (state.reason === "already_enrolled") {
      setStatusMessage(
        "You are enrolled",
        `Your enrollment is already active${
          application && application.program
            ? ` in ${application.program.name}`
            : ""
        }. There is no need to apply again.`,
      );
    } else if (state.reason === "completed") {
      setStatusMessage(
        "Training completed",
        "Your training is complete, so applications are closed for this account.",
      );
    } else if (state.reason === "account_inactive") {
      setStatusMessage(
        "Account inactive",
        "This account cannot submit applications. Please contact the administrator.",
      );
    } else if (application && application.status === "Submitted") {
      setStatusMessage(
        "Application received",
        state.justSubmitted
          ? `Your application is under review. We'll email you at ${messageEmail}.`
          : `Your application is under review. We'll email you at ${messageEmail} once a decision is made.`,
      );
    } else if (application && application.status === "Under review") {
      setStatusMessage(
        "Application under review",
        `The training office is reviewing your application. The decision will be emailed to ${messageEmail}.`,
      );
    } else if (application && application.status === "Approved") {
      setStatusMessage(
        "Application approved",
        "Your enrollment is active. Next step: pay the training fee at the portal and wait for schedule details from the training office.",
      );
    } else if (application && application.status === "Rejected") {
      setStatusMessage(
        "Application not approved",
        application.publicNote
          ? "Read the message from the training office, then apply again when you are ready."
          : "You can submit a new application when you are ready.",
      );
    } else if (application && application.status === "Withdrawn") {
      setStatusMessage(
        "Application withdrawn",
        "This application is closed. You can submit a new application when you are ready.",
      );
    } else {
      setStatusMessage(
        "No application yet",
        "Submit your details to apply for an open training program.",
      );
    }

    if (
      application &&
      ["Submitted", "Under review"].includes(application.status)
    ) {
      elements.withdrawBtn.hidden = false;
    }

    renderStatusDocuments();

    showOnly(elements.status);
  }

  function previousApplication() {
    return Boolean(
      state.application &&
      ["Rejected", "Withdrawn"].includes(state.application.status),
    );
  }

  function startBlockReason() {
    if (!state.canApply) {
      return (
        START_REASONS[state.reason] ||
        "This account cannot submit applications."
      );
    }

    if (!listedPrograms().length) {
      return "No open batches are accepting applications right now.";
    }

    return "";
  }

  function renderStartOutcome() {
    const application = state.application;

    if (!application || !previousApplication()) {
      elements.startOutcome.hidden = true;
      return;
    }

    const style = STATUS_STYLES[application.status] || STATUS_STYLES.Withdrawn;
    const note = application.publicNote || "";

    elements.startOutcome.hidden = false;
    elements.startOutcomeBadge.textContent = style.label;
    elements.startOutcomeBadge.className = `status-badge ${style.className}`;
    elements.startOutcomeDate.textContent = application.decidedAt
      ? `Decided ${formatDate(application.decidedAt)}`
      : "Closed before a decision was made";
    elements.startOutcomeNote.textContent = note;
    elements.startOutcomeNote.hidden = !note;
  }

  function showStart() {
    const draft = state.draft;
    const reason = startBlockReason();
    const noBatches = state.canApply && !listedPrograms().length;

    renderStartOutcome();

    elements.startApplyBtn.textContent = draft
      ? "Resume application"
      : "Start application";
    elements.startApplyBtn.disabled = Boolean(reason);
    elements.startOverBtn.hidden = !draft;
    elements.startCheckBtn.hidden = !noBatches;
    elements.startReason.textContent = reason;
    elements.startReason.hidden = !reason;
    elements.startDraftHint.hidden = !draft;

    if (draft) {
      elements.startDraftHint.textContent = `Saved ${formatDate(draft.savedAt)}, step ${draft.step} of 6.`;
    }

    if (reason) {
      elements.startApplyBtn.setAttribute("aria-describedby", "startReason");
    } else if (draft) {
      elements.startApplyBtn.setAttribute("aria-describedby", "startDraftHint");
    } else {
      elements.startApplyBtn.removeAttribute("aria-describedby");
    }

    elements.startError.hidden = true;

    showOnly(elements.start);
  }

  function focusPanel(panel, heading) {
    panel.scrollIntoView({ block: "start" });

    if (!heading) return;

    try {
      heading.focus({ preventScroll: true });
    } catch (error) {
      heading.focus();
    }
  }

  function optionExists(select, value) {
    return Array.from(select.options).some((option) => option.value === value);
  }

  function resetApplicationForm() {
    elements.form.reset();
    elements.motivationCount.textContent = "0";
    elements.program.value = "";
    fillBatchOptions("");
    resetDocumentState();
    prefillContactFields();
    elements.draftBanner.hidden = true;
  }

  function applyDraftValues(draft) {
    if (!draft) return;

    const values = draft.values || {};

    DRAFT_FIELDS.forEach((id) => {
      const field = document.getElementById(id);

      if (!field) return;

      if (field.type === "checkbox") {
        field.checked = Boolean(values[id]);
        return;
      }

      // Empty saved answers fall back to the profile prefill.
      if (typeof values[id] === "string" && values[id]) {
        field.value = values[id];
      }
    });

    elements.motivationCount.textContent = String(
      elements.motivation.value.length,
    );
  }

  function openForm({ draft = null } = {}) {
    resetApplicationForm();
    renderProgramOptions();

    const saved = (draft && draft.values) || {};
    const savedProgram = typeof saved.program === "string" ? saved.program : "";
    const savedBatch = typeof saved.batch === "string" ? saved.batch : "";

    elements.program.value =
      savedProgram && optionExists(elements.program, savedProgram)
        ? savedProgram
        : "";

    fillBatchOptions(elements.program.value, savedBatch);

    if (savedProgram && !elements.program.value) {
      elements.programHint.textContent =
        "The program you picked is no longer available. Choose another.";
    } else if (savedBatch && elements.batch.value !== savedBatch) {
      elements.programHint.textContent =
        "The batch you picked is no longer available. Choose another.";
    }

    applyDraftValues(draft);

    state.draft = draft;

    // Rebuilt after the draft is in place so the "attach them again"
    // hints match the restored file names.
    resetDocumentState();

    if (draft) {
      elements.draftBannerText.textContent = `We restored the answers you started on ${formatDate(draft.savedAt)}.`;
      elements.draftBanner.hidden = false;
    } else {
      elements.draftBanner.hidden = true;
    }

    showOnly(elements.wizard);

    goToStep(draft && draft.step ? draft.step : 1, {
      skipAvailability: true,
      smooth: false,
    });

    focusPanel(elements.wizard, elements.wizardTitle);
  }

  function render() {
    if (!state.loaded) return;

    elements.submitError.hidden = true;

    state.draft = readDraft();

    // A live application owns the page; the card is only for trainees who
    // can start a new one.
    if (state.application && !previousApplication()) {
      showStatus();
      return;
    }

    // An account-level block with no application keeps the status card,
    // which already explains why.
    if (!state.application && !state.canApply) {
      showStatus();
      return;
    }

    if (state.deepLink) {
      state.deepLink = false;

      if (listedPrograms().length) {
        openForm({ draft: state.draft });
        return;
      }
    }

    showStart();
  }

  // Opening the form is the moment to confirm both halves of the gate: the
  // trainee may still apply, and a batch is still open.
  async function checkAvailability() {
    try {
      const [batchData, applicationData] = await Promise.all([
        api("/applications/open-batches"),
        api("/applications/me"),
      ]);

      state.programs = batchData.programs || [];
      state.application = applicationData.application;
      state.canApply = Boolean(applicationData.canApply);
      state.reason = applicationData.reason;
      state.inherited = inheritedDocumentsFrom(applicationData.history || []);

      return { ok: true };
    } catch (error) {
      console.error("[apply] availability check failed", error);

      return {
        ok: false,
        message: error.message || "We could not check availability. Try again.",
      };
    }
  }

  async function startApplication() {
    const label = elements.startApplyBtn.textContent;

    elements.startApplyBtn.disabled = true;
    elements.startApplyBtn.textContent = "Checking…";
    elements.startError.hidden = true;

    const result = await checkAvailability();

    if (!result.ok) {
      elements.startApplyBtn.disabled = false;
      elements.startApplyBtn.textContent = label;
      elements.startError.textContent = result.message;
      elements.startError.hidden = false;
      return;
    }

    // A decision recorded elsewhere can close the gate while the card sits
    // on screen; the page then follows the newer state.
    if (state.application && !previousApplication()) {
      showStatus();
      return;
    }

    if (!state.canApply || !listedPrograms().length) {
      showStart();
      return;
    }

    elements.startApplyBtn.textContent = label;
    openForm({ draft: state.draft });
  }

  async function refresh() {
    try {
      await loadApplicationState();
      render();
    } catch (error) {
      console.error("Application load error:", error);
      showNotice(
        "We could not load your application.",
        error.message || "Check your connection and try again.",
        true,
      );
    }
  }

  // ---------- Events ----------

  elements.program.addEventListener("change", () => {
    fillBatchOptions(elements.program.value);
  });

  elements.motivation.addEventListener("input", () => {
    elements.motivationCount.textContent = String(
      elements.motivation.value.length,
    );
  });

  DOCUMENT_TYPES.forEach((docType) => {
    const input = elements.documentInputs[docType.type];

    if (!input) return;

    input.addEventListener("change", () => {
      addDocumentFiles(docType.type, input.files);
      input.value = "";
    });
  });

  elements.nextBtn.addEventListener("click", () => {
    if (!validateStep(state.step)) return;

    goToStep(state.step + 1);
  });

  elements.backBtn.addEventListener("click", () => {
    goToStep(state.step - 1);
  });

  elements.startApplyBtn.addEventListener("click", startApplication);

  function closeStartOverModal() {
    elements.startOverModal.classList.remove("show");
    document.body.classList.remove("modal-open");
  }

  elements.startOverBtn.addEventListener("click", () => {
    elements.startOverModal.classList.add("show");
    document.body.classList.add("modal-open");
  });

  elements.cancelStartOver.addEventListener("click", closeStartOverModal);
  elements.cancelStartOverClose.addEventListener("click", closeStartOverModal);

  elements.confirmStartOver.addEventListener("click", async () => {
    closeStartOverModal();
    clearDraft();
    await startApplication();
  });

  elements.startCheckBtn.addEventListener("click", async () => {
    elements.startCheckBtn.disabled = true;

    const result = await checkAvailability();

    elements.startCheckBtn.disabled = false;

    showStart();

    if (!result.ok) {
      elements.startError.textContent = result.message;
      elements.startError.hidden = false;
      elements.startApplyBtn.disabled = true;
    }
  });

  elements.backToOverviewBtn.addEventListener("click", () => {
    saveDraft();

    // The deep link should not keep forcing the form open.
    if (new URLSearchParams(window.location.search).get("apply") === "1") {
      window.history.replaceState({}, "", "apply.html");
    }

    showStart();
    focusPanel(elements.start, elements.startTitle);
  });

  elements.draftBannerDismiss.addEventListener("click", () => {
    elements.draftBanner.hidden = true;
  });

  function closeWithdrawModal() {
    elements.withdrawModal.classList.remove("show");
    document.body.classList.remove("modal-open");
  }

  elements.withdrawBtn.addEventListener("click", () => {
    if (!state.application) return;

    elements.withdrawModal.classList.add("show");
    document.body.classList.add("modal-open");
  });

  elements.cancelWithdraw.addEventListener("click", closeWithdrawModal);
  elements.cancelWithdrawClose.addEventListener("click", closeWithdrawModal);

  elements.confirmWithdraw.addEventListener("click", async () => {
    if (!state.application) {
      closeWithdrawModal();
      return;
    }

    elements.withdrawBtn.disabled = true;
    elements.confirmWithdraw.disabled = true;

    try {
      await api(`/applications/${state.application._id}/withdraw`, {
        method: "POST",
      });

      state.justSubmitted = false;
      closeWithdrawModal();
      await refresh();
    } catch (error) {
      console.error("Application withdrawal failed:", error);
      showToast(
        error.message || "Unable to withdraw this application.",
        "error",
      );
    } finally {
      elements.withdrawBtn.disabled = false;
      elements.confirmWithdraw.disabled = false;
    }
  });

  elements.noticeRetry.addEventListener("click", refresh);

  elements.form.addEventListener("submit", async (event) => {
    event.preventDefault();

    if (state.step !== 6) return;

    for (let step = 1; step <= 5; step += 1) {
      if (!validateStep(step)) {
        goToStep(step);
        return;
      }
    }

    // The answers and both documents travel in one multipart request.
    const form = new FormData();

    form.append("firstName", valueOf("firstName"));
    form.append("lastName", valueOf("lastName"));
    form.append("email", valueOf("email"));
    form.append("phone", valueOf("phone"));
    form.append("address", valueOf("address"));
    form.append("dateOfBirth", valueOf("dateOfBirth"));
    form.append("sex", valueOf("sex"));
    form.append("civilStatus", valueOf("civilStatus"));
    form.append("highestEducation", valueOf("highestEducation"));
    form.append("schoolAttended", valueOf("schoolAttended"));
    form.append("emergencyContactName", valueOf("emergencyContactName"));
    form.append("emergencyContactPhone", valueOf("emergencyContactPhone"));
    form.append(
      "emergencyContactRelationship",
      valueOf("emergencyContactRelationship"),
    );
    form.append("program", elements.program.value);
    form.append("batch", elements.batch.value);
    form.append("motivation", elements.motivation.value.trim());
    form.append(
      "acknowledgedTruthful",
      document.getElementById("acknowledgedTruthful").checked
        ? "true"
        : "false",
    );

    DOCUMENT_TYPES.forEach((docType) => {
      newFilesFor(docType.type).forEach((file) => {
        form.append(docType.field, file, file.name);
      });
    });

    form.append(
      "inheritedFiles",
      JSON.stringify(
        DOCUMENT_TYPES.flatMap((docType) =>
          documentEntries(docType.type)
            .filter((entry) => entry.kind === "inherited")
            .map((entry) => entry.fileId),
        ),
      ),
    );

    elements.submitError.hidden = true;
    elements.submitBtn.disabled = true;
    elements.submitBtn.textContent = "Uploading documents…";
    state.submitting = true;

    try {
      await submitWithProgress(form);

      state.justSubmitted = true;
      clearDraft();

      window.history.replaceState({}, "", "apply.html?submitted=1");

      await loadApplicationState();
      showStatus();
    } catch (error) {
      elements.submitError.textContent =
        error.message || "Unable to submit your application. Please try again.";
      elements.submitError.hidden = false;
    } finally {
      state.submitting = false;
      elements.submitBtn.disabled = false;
      elements.submitBtn.textContent = "Submit application";
    }
  });

  // Clear a field's error as soon as the trainee edits it.
  elements.form.addEventListener("input", (event) => {
    const field = event.target;

    if (!field.matches("input, select, textarea")) return;

    field.removeAttribute("aria-invalid");

    const wrap = fieldWrap(field);
    const error = wrap ? wrap.querySelector(".field__error") : null;

    if (error) error.remove();
  });

  elements.form.addEventListener("input", queueDraftSave);
  elements.form.addEventListener("change", queueDraftSave);

  // ---------- Init ----------

  const initialParams = new URLSearchParams(window.location.search);

  if (initialParams.get("submitted") === "1") {
    state.justSubmitted = true;
  }

  if (initialParams.get("apply") === "1") {
    state.deepLink = true;
  }

  window.addEventListener("pagehide", saveDraft);

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") saveDraft();
  });

  refresh();
})();
