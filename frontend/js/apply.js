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
  const PHONE_REGEX = /^(?=.*\d)[0-9+()\-\s]{7,20}$/;
  const PSGC_API = "https://psgc.gitlab.io/api";
  const MANUAL_LOCATION = "__manual";
  const METRO_MANILA = { code: "130000000", name: "Metro Manila" };
  const DEFAULT_LOCATION_HINT =
    'Choose from the list, or select "Not listed" to type a location.';
  const locationCache = new Map();
  const ADDRESS_LOCATION_IDS = new Set([
    "addressProvince",
    "addressCity",
    "addressBarangay",
    "addressProvinceManual",
    "addressCityManual",
    "addressBarangayManual",
  ]);
  let provincesPromise = null;

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
  const DRAFT_SAVE_LABELS = {
    saving: "Saving",
    saved: "Saved",
    failed: "Save failed",
  };

  // Program and batch are restored on their own so they line up with the
  // options rendered from the latest availability.
  const DRAFT_FIELDS = [
    "firstName",
    "lastName",
    "email",
    "phone",
    "streetAddress",
    "addressProvince",
    "addressCity",
    "addressBarangay",
    "addressProvinceManual",
    "addressCityManual",
    "addressBarangayManual",
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
    locationCityRequest: 0,
    locationBarangayRequest: 0,
    addressRevision: 0,
  };

  const elements = {
    loading: document.getElementById("loadingPanel"),
    notice: document.getElementById("noticePanel"),
    noticeTitle: document.getElementById("noticeTitle"),
    noticeText: document.getElementById("noticeText"),
    noticeRetry: document.getElementById("noticeRetry"),
    status: document.getElementById("statusPanel"),
    statusTitle: document.getElementById("status-title"),
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
    startOverHint: document.getElementById("startOverHint"),
    wizard: document.getElementById("wizardPanel"),
    wizardTitle: document.getElementById("wizard-title"),
    wizardMeta: document.getElementById("wizardMeta"),
    wizardStepAnnouncement: document.getElementById("wizardStepAnnouncement"),
    wizardProgressCurrent: document.getElementById("wizardProgressCurrent"),
    wizardProgressCounts: document.getElementById("wizardProgressCounts"),
    wizardProgressTrack: document.getElementById("wizardProgressBar"),
    wizardProgressFill: document.getElementById("wizardProgressFill"),
    draftBanner: document.getElementById("draftBanner"),
    draftBannerText: document.getElementById("draftBannerText"),
    draftBannerDismiss: document.getElementById("draftBannerDismiss"),
    draftSaveStatus: document.getElementById("draftSaveStatus"),
    draftSaveStatusText: document.getElementById("draftSaveStatusText"),
    draftSaveRetry: document.getElementById("draftSaveRetry"),
    backToOverviewBtn: document.getElementById("backToOverviewBtn"),
    wizardSteps: Array.from(document.querySelectorAll("#wizardSteps li")),
    form: document.getElementById("applicationForm"),
    steps: Array.from(document.querySelectorAll(".wizard__step")),
    backBtn: document.getElementById("backBtn"),
    nextBtn: document.getElementById("nextBtn"),
    submitBtn: document.getElementById("submitBtn"),
    submitError: document.getElementById("submitError"),
    uploadProgress: document.getElementById("uploadProgress"),
    uploadProgressValue: document.getElementById("uploadProgressValue"),
    uploadProgressBar: document.getElementById("uploadProgressBar"),
    uploadProgressFill: document.getElementById("uploadProgressFill"),
    dateOfBirth: document.getElementById("dateOfBirth"),
    streetAddress: document.getElementById("streetAddress"),
    addressProvince: document.getElementById("addressProvince"),
    addressCity: document.getElementById("addressCity"),
    addressBarangay: document.getElementById("addressBarangay"),
    addressProvinceManual: document.getElementById("addressProvinceManual"),
    addressCityManual: document.getElementById("addressCityManual"),
    addressBarangayManual: document.getElementById("addressBarangayManual"),
    address: document.getElementById("address"),
    addressPreview: document.getElementById("addressPreview"),
    addressLocationHint: document.getElementById("addressLocationHint"),
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
    documentSummaries: {
      cv: document.getElementById("cvListSummary"),
      valid_id: document.getElementById("validIdListSummary"),
    },
    draftHints: {
      cv: document.getElementById("cvDraftHint"),
      valid_id: document.getElementById("validIdDraftHint"),
    },
    statusDocuments: document.getElementById("statusDocuments"),
    statusDocumentList: document.getElementById("statusDocumentList"),
    statusDocumentError: document.getElementById("statusDocumentError"),
  };

  setDateOfBirthMax();

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
  function localDateValue(date = new Date()) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");

    return `${year}-${month}-${day}`;
  }

  function setDateOfBirthMax() {
    if (!elements.dateOfBirth) return;

    // Use the local calendar date so the picker cannot offer tomorrow.
    elements.dateOfBirth.max = localDateValue();
  }

  function normalizePhoneNumber(value) {
    return String(value)
      .normalize("NFKC")
      .replace(/[./]/g, " ")
      .replace(/[\u2010-\u2015\u2212]/g, "-")
      .replace(/[^\d+()\-\s]/g, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function normalizePhoneField(input) {
    const normalized = normalizePhoneNumber(input.value);

    if (normalized === input.value) return;

    input.value = normalized;
    input.dispatchEvent(new Event("input", { bubbles: true }));
  }

  function handlePhonePaste(event) {
    const input = event.currentTarget;
    const pasted = event.clipboardData?.getData("text");

    if (!pasted) return;

    const normalized = normalizePhoneNumber(pasted);

    if (normalized === pasted) return;

    event.preventDefault();

    const start = input.selectionStart ?? input.value.length;
    const end = input.selectionEnd ?? input.value.length;

    input.setRangeText(normalized, start, end, "end");
    input.dispatchEvent(new Event("input", { bubbles: true }));
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

  function resetDraftSaveStatus() {
    elements.draftSaveStatus.hidden = true;
    elements.draftSaveStatus.removeAttribute("data-state");
    elements.draftSaveStatusText.textContent = "";
    elements.draftSaveRetry.hidden = true;
  }

  function setDraftSaveState(status) {
    const label = DRAFT_SAVE_LABELS[status];

    if (!label) return;

    elements.draftSaveStatus.hidden = false;
    elements.draftSaveStatus.dataset.state = status;
    elements.draftSaveStatusText.textContent = label;
    elements.draftSaveRetry.hidden = status !== "failed";
  }

  function saveDraft() {
    if (!state.formOpen || state.submitting) return false;

    window.clearTimeout(draftSaveTimer);
    draftSaveTimer = null;

    const store = draftStore();
    const userId = currentUserId();

    if (!store || !userId) {
      setDraftSaveState("failed");
      return false;
    }

    setDraftSaveState("saving");

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
      setDraftSaveState("saved");
      return true;
    } catch (error) {
      console.error("[apply] could not save the draft", error);
      setDraftSaveState("failed");
      return false;
    }
  }

  let draftSaveTimer = null;

  function queueDraftSave() {
    if (!state.formOpen || state.submitting) return;

    window.clearTimeout(draftSaveTimer);
    setDraftSaveState("saving");
    draftSaveTimer = window.setTimeout(saveDraft, 400);
  }

  function clearDraft() {
    window.clearTimeout(draftSaveTimer);
    draftSaveTimer = null;
    state.draft = null;
    resetDraftSaveStatus();

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
    const input = elements.documentInputs[type];

    if (input) setFieldError(input, message);
  }

  function clearDocumentError(type) {
    const input = elements.documentInputs[type];

    if (input) clearFieldError(input);
  }

  function focusDocumentInput(type) {
    const input = elements.documentInputs[type];

    if (!input) return;

    try {
      input.focus({ preventScroll: true });
    } catch (error) {
      input.focus();
    }

    input.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  function renderDocumentLists() {
    DOCUMENT_TYPES.forEach((docType) => {
      const list = elements.documentLists[docType.type];
      const summary = elements.documentSummaries[docType.type];

      if (!list) return;

      const entries = documentEntries(docType.type);

      list.innerHTML = "";

      if (summary) {
        summary.textContent = entries.length
          ? `${entries.length} file${entries.length === 1 ? "" : "s"} selected:`
          : "No files selected yet.";
      }

      entries.forEach((entry) => {
        const item = document.createElement("li");
        item.className = "document-list__item";

        const name = document.createElement("span");
        name.className = "document-list__name";
        name.textContent = entry.name;

        const size = document.createElement("span");
        size.className = "document-list__size";
        size.textContent = formatBytes(entry.size);

        const actions = document.createElement("span");
        actions.className = "document__actions";

        const replace = document.createElement("button");
        replace.type = "button";
        replace.className = "document-link";
        replace.textContent = "Replace";
        replace.setAttribute(
          "aria-label",
          `Replace ${entry.name} in ${docType.label}`,
        );
        replace.addEventListener("click", () => {
          const picker = document.createElement("input");
          picker.type = "file";
          picker.accept = ".pdf,.jpg,.jpeg,.png";
          picker.className = "sr-only";
          picker.tabIndex = -1;
          picker.setAttribute(
            "aria-label",
            `Choose a replacement for ${entry.name}`,
          );

          const removePicker = () => picker.remove();

          picker.addEventListener("change", () => {
            replaceDocumentFile(docType.type, entry, picker.files);
            removePicker();
          });
          picker.addEventListener("cancel", removePicker);

          document.body.append(picker);
          picker.click();
        });

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

          clearDocumentError(docType.type);
          renderDocumentLists();
        });

        actions.append(replace, remove);
        item.append(name, size, actions);

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

  function documentFilesError(type, files, replacing = null) {
    let error = null;
    let total = totalNewBytes();
    let count = documentEntries(type).length + files.length;

    if (replacing) {
      if (replacing.kind === "new") total -= replacing.size;
      count -= 1;
    }

    for (const file of files) {
      if (error) break;

      if (!/\.(pdf|jpe?g|png)$/i.test(file.name)) {
        error = "That file is not a PDF, JPG or PNG. Choose a supported file.";
      } else if (!file.size) {
        error = "That file is empty. Choose another file.";
      } else if (file.size > MAX_FILE_BYTES) {
        error = "Each file must be 10 MB or smaller.";
      } else if (total + file.size > MAX_APPLICATION_BYTES) {
        error =
          "The documents would be too large together. Keep the total under 30 MB.";
      } else {
        total += file.size;
      }
    }

    if (!error && count > MAX_FILES_PER_DOCUMENT) {
      error = `You can attach up to ${MAX_FILES_PER_DOCUMENT} files per document.`;
    }

    return error;
  }

  function replaceDocumentFile(type, entry, fileList) {
    const file = Array.from(fileList || [])[0];

    if (!file) return;

    const error = documentFilesError(type, [file], entry);

    if (error) {
      setDocumentError(type, error);
      focusDocumentInput(type);
      return;
    }

    const entries = documentEntries(type);
    const index = entries.indexOf(entry);

    if (index === -1) return;

    state.documents[type][index] = {
      kind: "new",
      name: file.name,
      size: file.size,
      file,
    };

    clearDocumentError(type);
    renderDocumentLists();
  }

  function addDocumentFiles(type, fileList) {
    const files = Array.from(fileList || []);

    if (!files.length) return;

    const error = documentFilesError(type, files);

    if (error) {
      setDocumentError(type, error);
      focusDocumentInput(type);
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

    clearDocumentError(type);
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

  function setUploadProgress(percent) {
    const value = Math.round(
      Math.min(100, Math.max(0, Number(percent) || 0)),
    );

    elements.uploadProgress.hidden = false;
    elements.uploadProgressValue.textContent = `${value}%`;
    elements.uploadProgressFill.style.width = `${value}%`;
    elements.uploadProgressBar.setAttribute("aria-valuenow", String(value));
    elements.uploadProgressBar.setAttribute(
      "aria-valuetext",
      `${value}% uploaded`,
    );
  }

  function hideUploadProgress() {
    elements.uploadProgress.hidden = true;
    elements.uploadProgressValue.textContent = "0%";
    elements.uploadProgressFill.style.width = "0%";
    elements.uploadProgressBar.setAttribute("aria-valuenow", "0");
    elements.uploadProgressBar.removeAttribute("aria-valuetext");
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
        setUploadProgress(percent);
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
      prefillAddress(profile.address);
    }
  }

  // ---------- Address ----------

  function setLocationHint(message) {
    if (elements.addressLocationHint) {
      elements.addressLocationHint.textContent = message;
    }
  }

  function locationOption(value, label, disabled = false) {
    const option = document.createElement("option");

    option.value = value;
    option.textContent = label;
    option.disabled = disabled;
    return option;
  }

  function resetLocationSelect(select, placeholder) {
    if (!select) return;

    select.innerHTML = "";
    select.append(locationOption("", placeholder, true));
    select.append(locationOption(MANUAL_LOCATION, "Not listed — enter manually"));
    select.value = "";
  }

  function fillLocationSelect(select, placeholder, items, preferred = "") {
    if (!select) return;

    select.innerHTML = "";
    select.append(locationOption("", placeholder, true));

    items.forEach((item) => {
      select.append(locationOption(item.code, item.name));
    });

    select.append(locationOption(MANUAL_LOCATION, "Not listed — enter manually"));

    if (preferred && optionExists(select, preferred)) {
      select.value = preferred;
    } else {
      select.value = "";
    }
  }

  async function fetchLocationList(path) {
    if (locationCache.has(path)) return locationCache.get(path);

    const request = (async () => {
      const controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), 10000);

      try {
        const response = await fetch(`${PSGC_API}${path}`, {
          headers: { Accept: "application/json" },
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error(`Location list request failed (${response.status}).`);
        }

        const data = await response.json();

        if (!Array.isArray(data)) {
          throw new Error("Unexpected location list response.");
        }

        return data
          .map((item) => ({
            code: String(item.code || ""),
            name: String(item.name || "").trim(),
          }))
          .filter((item) => item.code && item.name)
          .sort((a, b) => a.name.localeCompare(b.name));
      } finally {
        window.clearTimeout(timeout);
      }
    })();

    locationCache.set(path, request);
    request.catch(() => locationCache.delete(path));
    return request;
  }

  function ensureProvinces() {
    if (provincesPromise) return provincesPromise;

    setLocationHint(
      'Loading provinces… You can still select "Not listed" to type your address.',
    );

    provincesPromise = fetchLocationList("/provinces/")
      .then((provinces) => {
        fillLocationSelect(
          elements.addressProvince,
          "Select province",
          [METRO_MANILA, ...provinces].sort((a, b) =>
            a.name.localeCompare(b.name),
          ),
          elements.addressProvince.value,
        );
        setLocationHint(DEFAULT_LOCATION_HINT);
        return provinces;
      })
      .catch((error) => {
        console.error("[apply] could not load provinces", error);
        fillLocationSelect(
          elements.addressProvince,
          "Could not load provinces",
          [],
          elements.addressProvince.value,
        );
        setLocationHint(
          'The province list could not be loaded. Select "Not listed" to type your address.',
        );
        return [];
      });

    return provincesPromise;
  }

  async function loadCities(provinceCode) {
    const requestId = ++state.locationCityRequest;
    const path =
      provinceCode === METRO_MANILA.code
        ? `/regions/${provinceCode}/cities-municipalities/`
        : `/provinces/${provinceCode}/cities-municipalities/`;

    setLocationHint("Loading cities and municipalities…");
    fillLocationSelect(
      elements.addressCity,
      "Loading cities and municipalities…",
      [],
      elements.addressCity.value === MANUAL_LOCATION ? MANUAL_LOCATION : "",
    );
    elements.addressCity.disabled = false;

    try {
      const cities = await fetchLocationList(path);

      if (
        requestId !== state.locationCityRequest ||
        elements.addressProvince.value !== provinceCode
      ) {
        return cities;
      }

      fillLocationSelect(
        elements.addressCity,
        "Select city / municipality",
        cities,
        elements.addressCity.value,
      );
      elements.addressCity.disabled = false;
      syncManualInput(elements.addressCity, elements.addressCityManual);
      setLocationHint(DEFAULT_LOCATION_HINT);
      updateAddressField();
      return cities;
    } catch (error) {
      if (requestId !== state.locationCityRequest) return [];

      console.error("[apply] could not load cities", error);
      fillLocationSelect(
        elements.addressCity,
        "Could not load cities",
        [],
        MANUAL_LOCATION,
      );
      elements.addressCity.disabled = false;
      syncManualInput(elements.addressCity, elements.addressCityManual);
      elements.addressBarangay.disabled = false;
      resetLocationSelect(elements.addressBarangay, "Select barangay");
      elements.addressBarangay.value = MANUAL_LOCATION;
      syncManualInput(
        elements.addressBarangay,
        elements.addressBarangayManual,
      );
      setLocationHint(
        'The city or municipality list could not be loaded. Select "Not listed" to type it.',
      );
      updateAddressField();
      return [];
    }
  }

  async function loadBarangays(cityCode) {
    const requestId = ++state.locationBarangayRequest;

    setLocationHint("Loading barangays…");
    fillLocationSelect(
      elements.addressBarangay,
      "Loading barangays…",
      [],
      elements.addressBarangay.value === MANUAL_LOCATION
        ? MANUAL_LOCATION
        : "",
    );
    elements.addressBarangay.disabled = false;

    try {
      const barangays = await fetchLocationList(
        `/cities-municipalities/${cityCode}/barangays/`,
      );

      if (
        requestId !== state.locationBarangayRequest ||
        elements.addressCity.value !== cityCode
      ) {
        return barangays;
      }

      fillLocationSelect(
        elements.addressBarangay,
        "Select barangay",
        barangays,
        elements.addressBarangay.value,
      );
      elements.addressBarangay.disabled = false;
      syncManualInput(
        elements.addressBarangay,
        elements.addressBarangayManual,
      );
      setLocationHint(DEFAULT_LOCATION_HINT);
      updateAddressField();
      return barangays;
    } catch (error) {
      if (requestId !== state.locationBarangayRequest) return [];

      console.error("[apply] could not load barangays", error);
      fillLocationSelect(
        elements.addressBarangay,
        "Could not load barangays",
        [],
        MANUAL_LOCATION,
      );
      elements.addressBarangay.disabled = false;
      syncManualInput(
        elements.addressBarangay,
        elements.addressBarangayManual,
      );
      setLocationHint(
        'The barangay list could not be loaded. Select "Not listed" to type it.',
      );
      updateAddressField();
      return [];
    }
  }

  function syncManualInput(select, manual, focus = false) {
    if (!select || !manual) return;

    const isManual = select.value === MANUAL_LOCATION;

    manual.hidden = !isManual;

    if (!isManual) {
      clearFieldError(manual);
      return;
    }

    clearFieldError(select);

    if (focus) {
      try {
        manual.focus({ preventScroll: true });
      } catch (error) {
        manual.focus();
      }
    }
  }

  function locationValue(select, manual) {
    if (!select) return "";

    if (select.value === MANUAL_LOCATION) {
      return manual ? manual.value.trim() : "";
    }

    if (!select.value || select.selectedIndex < 0) return "";

    return (select.options[select.selectedIndex].textContent || "").trim();
  }

  function updateAddressField() {
    const address = [
      elements.streetAddress ? elements.streetAddress.value.trim() : "",
      locationValue(elements.addressBarangay, elements.addressBarangayManual),
      locationValue(elements.addressCity, elements.addressCityManual),
      locationValue(elements.addressProvince, elements.addressProvinceManual),
    ]
      .filter(Boolean)
      .join(", ");

    if (elements.address) elements.address.value = address;

    if (elements.addressPreview) {
      elements.addressPreview.textContent = address
        ? `Complete address: ${address}`
        : "";
      elements.addressPreview.hidden = !address;
    }
  }

  function resetLocationFields() {
    if (!elements.addressProvince) return;

    state.addressRevision += 1;
    state.locationCityRequest += 1;
    state.locationBarangayRequest += 1;

    elements.addressProvince.selectedIndex = 0;
    resetLocationSelect(elements.addressCity, "Select province first");
    elements.addressCity.disabled = true;
    resetLocationSelect(
      elements.addressBarangay,
      "Select city / municipality first",
    );
    elements.addressBarangay.disabled = true;

    [
      elements.addressProvinceManual,
      elements.addressCityManual,
      elements.addressBarangayManual,
    ].forEach((input) => {
      if (!input) return;

      input.value = "";
      input.hidden = true;
      clearFieldError(input);
    });

    clearFieldError(elements.addressProvince);
    clearFieldError(elements.addressCity);
    clearFieldError(elements.addressBarangay);
    syncManualInput(
      elements.addressProvince,
      elements.addressProvinceManual,
    );
    syncManualInput(elements.addressCity, elements.addressCityManual);
    syncManualInput(elements.addressBarangay, elements.addressBarangayManual);
    setLocationHint(DEFAULT_LOCATION_HINT);
    updateAddressField();
  }

  function handleProvinceChange({ focus = false } = {}) {
    const province = elements.addressProvince.value;

    state.addressRevision += 1;
    state.locationCityRequest += 1;
    state.locationBarangayRequest += 1;
    syncManualInput(
      elements.addressProvince,
      elements.addressProvinceManual,
      focus,
    );

    resetLocationSelect(elements.addressCity, "Select city / municipality");
    elements.addressCity.value = "";
    elements.addressCity.disabled = true;
    elements.addressCityManual.value = "";
    elements.addressCityManual.hidden = true;
    clearFieldError(elements.addressCity);
    clearFieldError(elements.addressCityManual);

    resetLocationSelect(elements.addressBarangay, "Select barangay");
    elements.addressBarangay.value = "";
    elements.addressBarangay.disabled = true;
    elements.addressBarangayManual.value = "";
    elements.addressBarangayManual.hidden = true;
    clearFieldError(elements.addressBarangay);
    clearFieldError(elements.addressBarangayManual);

    if (province === MANUAL_LOCATION) {
      elements.addressCity.disabled = false;
      elements.addressCity.value = MANUAL_LOCATION;
      elements.addressBarangay.disabled = false;
      elements.addressBarangay.value = MANUAL_LOCATION;
      syncManualInput(elements.addressCity, elements.addressCityManual);
      syncManualInput(
        elements.addressBarangay,
        elements.addressBarangayManual,
      );
      setLocationHint(DEFAULT_LOCATION_HINT);
      updateAddressField();
      return;
    }

    if (!province) {
      updateAddressField();
      return;
    }

    updateAddressField();
    void loadCities(province);
  }

  function handleCityChange({ focus = false } = {}) {
    const city = elements.addressCity.value;

    state.addressRevision += 1;
    state.locationBarangayRequest += 1;
    syncManualInput(elements.addressCity, elements.addressCityManual, focus);

    resetLocationSelect(elements.addressBarangay, "Select barangay");
    elements.addressBarangay.value = "";
    elements.addressBarangay.disabled = true;
    elements.addressBarangayManual.value = "";
    elements.addressBarangayManual.hidden = true;
    clearFieldError(elements.addressBarangay);
    clearFieldError(elements.addressBarangayManual);

    if (city === MANUAL_LOCATION) {
      elements.addressBarangay.disabled = false;
      elements.addressBarangay.value = MANUAL_LOCATION;
      syncManualInput(
        elements.addressBarangay,
        elements.addressBarangayManual,
      );
      setLocationHint(DEFAULT_LOCATION_HINT);
      updateAddressField();
      return;
    }

    updateAddressField();

    if (city) void loadBarangays(city);
  }

  function handleBarangayChange({ focus = false } = {}) {
    state.addressRevision += 1;
    syncManualInput(
      elements.addressBarangay,
      elements.addressBarangayManual,
      focus,
    );
    updateAddressField();
  }

  function parseAddressString(value) {
    const parts = String(value || "")
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean);

    if (parts.length >= 4) {
      return {
        street: parts.slice(0, -3).join(", "),
        barangay: parts[parts.length - 3],
        city: parts[parts.length - 2],
        province: parts[parts.length - 1],
      };
    }

    if (parts.length === 3) {
      return {
        street: parts[0],
        barangay: "",
        city: parts[1],
        province: parts[2],
      };
    }

    return {
      street: parts.join(", "),
      barangay: "",
      city: "",
      province: "",
    };
  }

  function setManualAddressValues({ province = "", city = "", barangay = "" }) {
    elements.addressProvince.value = MANUAL_LOCATION;
    elements.addressProvinceManual.value = province;

    elements.addressCity.disabled = false;
    resetLocationSelect(elements.addressCity, "Select city / municipality");
    elements.addressCity.value = MANUAL_LOCATION;
    elements.addressCityManual.value = city;

    elements.addressBarangay.disabled = false;
    resetLocationSelect(elements.addressBarangay, "Select barangay");
    elements.addressBarangay.value = MANUAL_LOCATION;
    elements.addressBarangayManual.value = barangay;

    syncManualInput(
      elements.addressProvince,
      elements.addressProvinceManual,
    );
    syncManualInput(elements.addressCity, elements.addressCityManual);
    syncManualInput(elements.addressBarangay, elements.addressBarangayManual);
    setLocationHint(DEFAULT_LOCATION_HINT);
    updateAddressField();
  }

  function prefillAddress(value) {
    if (!value || !elements.streetAddress || elements.streetAddress.value) {
      return;
    }

    const parsed = parseAddressString(value);

    elements.streetAddress.value = parsed.street;

    if (!parsed.province) {
      updateAddressField();
      return;
    }

    setManualAddressValues(parsed);
  }

  async function restoreAddressSelections(values) {
    if (!values || !elements.addressProvince) return;

    const revision = state.addressRevision;
    const parsed = parseAddressString(values.address);
    const provinceCode = values.addressProvince || "";
    const cityCode = values.addressCity || "";
    const barangayCode = values.addressBarangay || "";

    if (provinceCode === MANUAL_LOCATION) {
      setManualAddressValues({
        province:
          values.addressProvinceManual ||
          elements.addressProvinceManual.value ||
          parsed.province,
        city:
          values.addressCityManual ||
          elements.addressCityManual.value ||
          parsed.city,
        barangay:
          values.addressBarangayManual ||
          elements.addressBarangayManual.value ||
          parsed.barangay,
      });
      return;
    }

    if (!provinceCode) {
      if (values.address) {
        elements.streetAddress.value =
          parsed.street || elements.streetAddress.value;

        if (parsed.province) {
          setManualAddressValues(parsed);
        } else {
          updateAddressField();
        }
      } else {
        updateAddressField();
      }

      return;
    }

    await ensureProvinces();

    if (revision !== state.addressRevision) return;

    if (!optionExists(elements.addressProvince, provinceCode)) {
      setManualAddressValues({
        province:
          values.addressProvinceManual ||
          elements.addressProvinceManual.value ||
          parsed.province,
        city:
          values.addressCityManual ||
          elements.addressCityManual.value ||
          parsed.city,
        barangay:
          values.addressBarangayManual ||
          elements.addressBarangayManual.value ||
          parsed.barangay,
      });
      return;
    }

    elements.addressProvince.value = provinceCode;
    syncManualInput(
      elements.addressProvince,
      elements.addressProvinceManual,
    );

    await loadCities(provinceCode);

    if (revision !== state.addressRevision) return;

    if (cityCode === MANUAL_LOCATION) {
      elements.addressCity.value = MANUAL_LOCATION;
      elements.addressCityManual.value =
        values.addressCityManual ||
        elements.addressCityManual.value ||
        parsed.city;
      syncManualInput(elements.addressCity, elements.addressCityManual);
      elements.addressBarangay.disabled = false;
      resetLocationSelect(elements.addressBarangay, "Select barangay");
      elements.addressBarangay.value = MANUAL_LOCATION;
      elements.addressBarangayManual.value =
        values.addressBarangayManual ||
        elements.addressBarangayManual.value ||
        parsed.barangay;
      syncManualInput(
        elements.addressBarangay,
        elements.addressBarangayManual,
      );
    } else if (cityCode && optionExists(elements.addressCity, cityCode)) {
      elements.addressCity.value = cityCode;
      syncManualInput(elements.addressCity, elements.addressCityManual);

      await loadBarangays(cityCode);

      if (revision !== state.addressRevision) return;

      if (
        barangayCode === MANUAL_LOCATION ||
        (barangayCode &&
          !optionExists(elements.addressBarangay, barangayCode))
      ) {
        elements.addressBarangay.disabled = false;
        elements.addressBarangay.value = MANUAL_LOCATION;
        elements.addressBarangayManual.value =
          values.addressBarangayManual ||
          elements.addressBarangayManual.value ||
          parsed.barangay;
        syncManualInput(
          elements.addressBarangay,
          elements.addressBarangayManual,
        );
      } else if (barangayCode) {
        elements.addressBarangay.value = barangayCode;
        syncManualInput(
          elements.addressBarangay,
          elements.addressBarangayManual,
        );
      }
    } else if (cityCode) {
      elements.addressCity.value = MANUAL_LOCATION;
      elements.addressCityManual.value =
        values.addressCityManual ||
        elements.addressCityManual.value ||
        parsed.city;
      syncManualInput(elements.addressCity, elements.addressCityManual);
      elements.addressBarangay.disabled = false;
      resetLocationSelect(elements.addressBarangay, "Select barangay");
      elements.addressBarangay.value = MANUAL_LOCATION;
      elements.addressBarangayManual.value =
        values.addressBarangayManual ||
        elements.addressBarangayManual.value ||
        parsed.barangay;
      syncManualInput(
        elements.addressBarangay,
        elements.addressBarangayManual,
      );
    } else {
      elements.addressCity.value = "";
      syncManualInput(elements.addressCity, elements.addressCityManual);
      resetLocationSelect(elements.addressBarangay, "Select barangay");
      elements.addressBarangay.disabled = true;
    }

    updateAddressField();

    if (revision === state.addressRevision) {
      saveDraft();
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

  function stepHeading(step) {
    const panel = elements.steps.find(
      (candidate) => Number(candidate.dataset.step) === Number(step),
    );

    return panel ? panel.querySelector("[data-step-heading]") : null;
  }

  function focusStepHeading(step, { smooth = true } = {}) {
    const heading = stepHeading(step);

    if (!heading) return;

    try {
      heading.focus({ preventScroll: true });
    } catch (error) {
      heading.focus();
    }

    heading.scrollIntoView({
      behavior: smooth ? "smooth" : "auto",
      block: "start",
    });
  }

  function announceStep(step) {
    const total = elements.wizardSteps.length || 6;
    const completed = Math.max(0, step - 1);
    const remaining = Math.max(0, total - step);

    elements.wizardStepAnnouncement.textContent = `${savedStepLabel(step)}. ${completed} completed, ${remaining} remaining.`;
  }

  function updateWizardChrome() {
    const total = elements.wizardSteps.length || 6;
    const completed = Math.max(0, state.step - 1);
    const remaining = Math.max(0, total - state.step);

    elements.wizardSteps.forEach((item, index) => {
      const step = index + 1;
      const isCurrent = step === state.step;
      const isDone = step < state.step;

      item.classList.toggle("is-current", isCurrent);
      item.classList.toggle("is-done", isDone);
      item.classList.toggle("is-remaining", step > state.step);

      if (isCurrent) {
        item.setAttribute("aria-current", "step");
      } else {
        item.removeAttribute("aria-current");
      }

      const stateText = item.querySelector(".process__state");

      if (stateText) {
        let label = "Remaining";

        if (isCurrent) label = "Current step";
        else if (isDone) label = "Completed";

        stateText.textContent = label;
      }
    });

    elements.wizardProgressCurrent.textContent = savedStepLabel(state.step);
    elements.wizardProgressCounts.textContent = `${completed} completed · ${remaining} remaining`;
    elements.wizardProgressFill.style.width = `${(state.step / total) * 100}%`;
    elements.wizardProgressTrack.setAttribute("aria-valuenow", String(state.step));
    elements.wizardProgressTrack.setAttribute("aria-valuemax", String(total));
    elements.wizardProgressTrack.setAttribute(
      "aria-valuetext",
      `${savedStepLabel(state.step)}. ${completed} completed, ${remaining} remaining.`,
    );

    elements.steps.forEach((panel) => {
      panel.hidden = Number(panel.dataset.step) !== state.step;
    });

    elements.wizardMeta.textContent = `Step ${state.step} of ${total}`;
    elements.backBtn.hidden = state.step === 1;
    elements.nextBtn.hidden = state.step === 6;
    elements.submitBtn.hidden = state.step !== 6;

    document
      .querySelectorAll(".wizard__step [aria-invalid]")
      .forEach((field) => {
        const wrap = fieldWrap(field);

        // Keep the invalid marker while its visible error is still in place.
        if (!wrap || !wrap.querySelector(".field__error")) {
          field.removeAttribute("aria-invalid");
        }
      });
  }

  async function goToStep(
    step,
    { skipAvailability = false, smooth = true, focusHeading = true } = {},
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

    if (focusHeading) {
      focusStepHeading(state.step, { smooth });
    } else {
      window.scrollTo({
        top: panelTop,
        behavior: smooth ? "smooth" : "auto",
      });
    }

    announceStep(state.step);
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

  function errorMessageId(input) {
    return `${input.id || "field"}-error`;
  }

  function linkErrorMessage(input, error) {
    if (!error.id) error.id = errorMessageId(input);

    const ids = new Set(
      (input.getAttribute("aria-describedby") || "")
        .split(/\s+/)
        .filter(Boolean),
    );

    ids.add(error.id);
    input.setAttribute("aria-describedby", Array.from(ids).join(" "));
  }

  function unlinkErrorMessage(input, id) {
    if (!id) return;

    const ids = (input.getAttribute("aria-describedby") || "")
      .split(/\s+/)
      .filter((item) => item && item !== id);

    if (ids.length) {
      input.setAttribute("aria-describedby", ids.join(" "));
    } else {
      input.removeAttribute("aria-describedby");
    }
  }

  function clearFieldError(input) {
    input.removeAttribute("aria-invalid");

    const wrap = fieldWrap(input);
    const error = wrap ? wrap.querySelector(".field__error") : null;

    if (!error) return;

    unlinkErrorMessage(input, error.id);
    error.remove();
  }

  function setFieldError(input, message) {
    const wrap = fieldWrap(input);

    if (!wrap) return;

    input.setAttribute("aria-invalid", "true");

    let error = wrap.querySelector(".field__error");

    if (!error) {
      error = document.createElement("p");
      error.className = "field__error";

      // Keep a document error above the selected-file list, where it stays
      // visible even when several files are attached.
      const documentList = wrap.querySelector(".document-list");

      if (documentList) {
        wrap.insertBefore(error, documentList);
      } else {
        wrap.append(error);
      }
    }

    error.textContent = message;
    linkErrorMessage(input, error);
  }

  function clearFieldErrors() {
    const errors = Array.from(
      document.querySelectorAll(".wizard__step .field__error"),
    );
    const errorIds = new Set(errors.map((error) => error.id).filter(Boolean));

    if (errorIds.size) {
      document
        .querySelectorAll(".wizard__step [aria-describedby]")
        .forEach((field) => {
          errorIds.forEach((id) => unlinkErrorMessage(field, id));
        });
    }

    errors.forEach((error) => error.remove());

    document
      .querySelectorAll(".wizard__step [aria-invalid]")
      .forEach((field) => {
        field.removeAttribute("aria-invalid");
      });
  }

  function firstInvalidField(step) {
    const panel = elements.steps.find(
      (candidate) => Number(candidate.dataset.step) === Number(step),
    );

    return panel ? panel.querySelector("[aria-invalid='true']") : null;
  }

  function focusFirstInvalid(step) {
    const field = firstInvalidField(step);

    if (!field) return;

    try {
      field.focus({ preventScroll: true });
    } catch (error) {
      field.focus();
    }

    field.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  function phoneValidationMessage(input, { contact = false } = {}) {
    if (!input.value.trim()) {
      return contact
        ? "Enter the emergency contact's phone number."
        : "Enter your phone number.";
    }

    return contact
      ? "Enter a valid contact phone number with at least one digit, e.g. 0917 123 4567. Use 7–20 characters; spaces, +, -, and parentheses are allowed."
      : "Enter a valid phone number with at least one digit, e.g. 0917 123 4567. Use 7–20 characters; spaces, +, -, and parentheses are allowed.";
  }

  function validateAddress() {
    let valid = true;

    if (!elements.streetAddress.value.trim()) {
      setFieldError(
        elements.streetAddress,
        "Enter your house or street address.",
      );
      valid = false;
    }

    const locations = [
      {
        select: elements.addressProvince,
        manual: elements.addressProvinceManual,
        label: "province",
      },
      {
        select: elements.addressCity,
        manual: elements.addressCityManual,
        label: "city or municipality",
      },
      {
        select: elements.addressBarangay,
        manual: elements.addressBarangayManual,
        label: "barangay",
      },
    ];

    locations.forEach(({ select, manual, label }) => {
      if (select.value === MANUAL_LOCATION) {
        if (!manual.value.trim()) {
          setFieldError(manual, `Enter your ${label}.`);
          valid = false;
        }

        return;
      }

      if (!select.value) {
        setFieldError(
          select,
          `Choose your ${label}, or select "Not listed" to type it.`,
        );
        valid = false;
      }
    });

    updateAddressField();
    return valid;
  }

  function validateStep(step, { focus = true } = {}) {
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
      normalizePhoneField(phone);

      if (!PHONE_REGEX.test(phone.value)) {
        setFieldError(phone, phoneValidationMessage(phone));
        valid = false;
      }

      if (!validateAddress()) valid = false;
    }

    if (step === 2) {
      const dateOfBirth = document.getElementById("dateOfBirth");
      const value = dateOfBirth.value;
      const [year, month, day] = value.split("-").map(Number);
      const parsed = new Date(year, month - 1, day);

      if (
        !value ||
        Number.isNaN(parsed.getTime()) ||
        value > localDateValue()
      ) {
        setFieldError(dateOfBirth, "Enter a valid date of birth.");
        valid = false;
      } else {
        const now = new Date();
        let age = now.getFullYear() - year;
        const monthDiff = now.getMonth() - (month - 1);

        if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < day)) {
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
      normalizePhoneField(emergencyPhone);

      if (!PHONE_REGEX.test(emergencyPhone.value)) {
        setFieldError(
          emergencyPhone,
          phoneValidationMessage(emergencyPhone, { contact: true }),
        );
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

    if (!valid && focus) focusFirstInvalid(step);

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
    edit.setAttribute("aria-label", `Edit ${title} section`);
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

    addReviewGroup("Applicant", 1, [
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
      { label: "Motivation", value: valueOf("motivation") },
      {
        label: "Information confirmed",
        value: document.getElementById("acknowledgedTruthful").checked
          ? "Yes"
          : "No",
      },
    ]);

    addReviewGroup(
      "Documents",
      5,
      DOCUMENT_TYPES.map((docType) => ({
        label: docType.label,
        value: documentEntries(docType.type)
          .map((entry) => entry.name)
          .join("\n"),
      })),
    );
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
        state.justSubmitted ? "Application submitted" : "Application received",
        state.justSubmitted
          ? `Your application was sent to the training office for review. We'll email you at ${messageEmail} once a decision is made.`
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

  function savedStepLabel(step) {
    const number = Number(step);
    const item = elements.wizardSteps[number - 1];
    const name = item ? item.querySelector("strong").textContent.trim() : "";
    return name
      ? `Step ${number} of ${elements.wizardSteps.length} — ${name}`
      : `Step ${number} of ${elements.wizardSteps.length}`;
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
    elements.startOverHint.hidden = !draft;

    if (draft) {
      elements.startDraftHint.textContent = [
        `${savedStepLabel(draft.step)}.`,
        `Saved ${formatDate(draft.savedAt)}.`,
        "Resume application continues from this step.",
      ].join(" ");
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
    resetLocationFields();
    prefillContactFields();
    elements.draftBanner.hidden = true;
    resetDraftSaveStatus();
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
    setDateOfBirthMax();
    resetApplicationForm();
    renderProgramOptions();
    void ensureProvinces();

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

    if (draft) {
      void restoreAddressSelections(saved);
    }

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

  elements.dateOfBirth.addEventListener("focus", setDateOfBirthMax);

  elements.addressProvince.addEventListener("change", () => {
    handleProvinceChange({ focus: true });
  });

  elements.addressCity.addEventListener("change", () => {
    handleCityChange({ focus: true });
  });

  elements.addressBarangay.addEventListener("change", () => {
    handleBarangayChange({ focus: true });
  });

  ["phone", "emergencyContactPhone"].forEach((id) => {
    const input = document.getElementById(id);

    if (!input) return;

    input.addEventListener("paste", handlePhonePaste);
    input.addEventListener("blur", () => normalizePhoneField(input));
  });

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

  elements.draftSaveRetry.addEventListener("click", () => {
    window.clearTimeout(draftSaveTimer);
    draftSaveTimer = null;
    saveDraft();
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

    // Ignore a second submit from a double click or Enter while the first
    // request is still running, and after the form has closed on success.
    if (!state.formOpen || state.submitting || state.step !== 6) return;

    for (let step = 1; step <= 5; step += 1) {
      if (!validateStep(step, { focus: false })) {
        await goToStep(step, { smooth: false, focusHeading: false });
        focusFirstInvalid(step);
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
    setUploadProgress(0);

    try {
      await submitWithProgress(form);

      state.justSubmitted = true;
      clearDraft();

      window.history.replaceState({}, "", "apply.html?submitted=1");

      await loadApplicationState();
      showStatus();
      focusPanel(elements.status, elements.statusTitle);
      showToast("Application submitted successfully.", "success");
    } catch (error) {
      elements.submitError.textContent =
        error.message || "Unable to submit your application. Please try again.";
      elements.submitError.hidden = false;
    } finally {
      state.submitting = false;
      elements.submitBtn.disabled = false;
      elements.submitBtn.textContent = "Confirm and submit application";
      hideUploadProgress();
    }
  });

  // Clear a field's error as soon as the trainee edits it.
  elements.form.addEventListener("input", (event) => {
    const field = event.target;

    if (!field.matches("input, select, textarea")) return;

    clearFieldError(field);

    if (ADDRESS_LOCATION_IDS.has(field.id)) {
      state.addressRevision += 1;
    }
  });

  elements.form.addEventListener("input", () => {
    updateAddressField();
    queueDraftSave();
  });
  elements.form.addEventListener("change", () => {
    updateAddressField();
    queueDraftSave();
  });

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
