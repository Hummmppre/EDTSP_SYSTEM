/**
 * Formatting, state regions, field errors, pagers and accessible modals.
 */
window.EDTSP = window.EDTSP || {};

(function initUi() {
    const moneyFormatter = new Intl.NumberFormat("en-PH", {
        style: "currency",
        currency: "PHP",
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });

    const dateFormatter = new Intl.DateTimeFormat("en-PH", {
        timeZone: "Asia/Manila",
        year: "numeric",
        month: "short",
        day: "2-digit"
    });

    const dateTimeFormatter = new Intl.DateTimeFormat("en-PH", {
        timeZone: "Asia/Manila",
        year: "numeric",
        month: "short",
        day: "2-digit",
        hour: "numeric",
        minute: "2-digit"
    });

    const setText = (id, value) => {
        const element = document.getElementById(id);
        if (element) element.textContent = value ?? "";
    };

    const formatMoney = (value) => {
        const number = Number(value);
        return Number.isFinite(number) ? moneyFormatter.format(number) : "—";
    };

    const formatNumber = (value, digits = 1) => {
        const number = Number(value);
        return Number.isFinite(number) ? number.toFixed(digits) : "—";
    };

    const formatDate = (value) => {
        if (!value) return "—";
        const date = new Date(value);
        return Number.isNaN(date.getTime()) ? "—" : dateFormatter.format(date);
    };

    const formatDateTime = (value) => {
        if (!value) return "—";
        const date = new Date(value);
        return Number.isNaN(date.getTime()) ? "—" : dateTimeFormatter.format(date);
    };

    const TONES = {
        healthy: "completed",
        completed: "completed",
        verified: "completed",
        graded: "completed",
        active: "completed",
        ongoing: "ongoing",
        pending: "pending",
        "under observation": "pending",
        inactive: "inactive",
        rejected: "inactive",
        "under treatment": "inactive",
        unpaid: "clay",
        partial: "pending",
        "fully paid": "completed"
    };

    const statusTone = (status) =>
        TONES[String(status || "").trim().toLowerCase()] || "pending";

    const statusBadge = (status, label) => {
        const span = document.createElement("span");
        span.className = `status-badge ${statusTone(status)}`;
        span.textContent = label || status || "—";
        return span;
    };

    const element = (tag, className, text) => {
        const node = document.createElement(tag);
        if (className) node.className = className;
        if (text !== undefined) node.textContent = text;
        return node;
    };

    /**
     * Render a loading/empty/error block into a container.
     */
    const state = (container, { tone = "loading", title, message, action } = {}) => {
        if (!container) return;

        container.replaceChildren();

        const wrap = element("div", `state${tone === "inline" ? " state--inline" : ""}`);
        wrap.setAttribute("role", tone === "error" ? "alert" : "status");

        if (tone === "error") wrap.classList.add("state--error");
        if (tone === "empty") wrap.classList.add("state--empty");

        if (title) wrap.append(element("strong", null, title));
        if (message) wrap.append(element("p", null, message));

        if (action && action.label && action.onClick) {
            const button = element("button", "btn btn--ghost", action.label);
            button.type = "button";
            button.addEventListener("click", action.onClick);
            wrap.append(button);
        }

        container.append(wrap);
    };

    const fieldWrapper = (input) =>
        input.closest(".field") ||
        input.closest(".form-group") ||
        input.parentElement;

    const clearFieldErrors = (form) => {
        if (!form) return;

        form.querySelectorAll(".field__error, .field-error").forEach((node) =>
            node.remove()
        );

        form.querySelectorAll("[aria-invalid='true']").forEach((node) =>
            node.removeAttribute("aria-invalid")
        );
    };

    const fieldError = (input, message) => {
        if (!input) return;

        const wrapper = fieldWrapper(input);
        if (!wrapper) return;

        const errorClass = wrapper.classList.contains("field")
            ? "field__error"
            : "field-error";

        let node = wrapper.querySelector(`.${errorClass}`);

        if (!node) {
            node = element("p", errorClass);
            wrapper.append(node);
        }

        node.textContent = message;
        input.setAttribute("aria-invalid", "true");
    };

    const formState = (form) => {
        if (!form) return null;

        let region = form.querySelector(".state--inline");

        if (!region) {
            region = element("p", "state state--inline");
            region.setAttribute("role", "status");
            region.hidden = true;
            form.append(region);
        }

        return region;
    };

    const setFormState = (form, { tone = "info", message = "" } = {}) => {
        const region = formState(form);
        if (!region) return;

        region.className = `state state--inline${tone === "error" ? " state--error" : ""}`;
        region.textContent = message;
        region.hidden = !message;
    };

    const debounce = (fn, delay = 300) => {
        let timer = null;

        return (...args) => {
            window.clearTimeout(timer);
            timer = window.setTimeout(() => fn(...args), delay);
        };
    };

    /**
     * Previous / Page x of y / Next control shared by every table.
     */
    const pager = (container, meta, onPage) => {
        if (!container) return;

        container.replaceChildren();

        if (!meta || !meta.total) {
            container.hidden = true;
            return;
        }

        container.hidden = false;
        container.className = "pager";

        const previous = element("button", "btn btn--ghost", "Previous");
        previous.type = "button";
        previous.disabled = meta.page <= 1;
        previous.addEventListener("click", () => onPage(meta.page - 1));

        const status = element(
            "span",
            "pager__status",
            `Page ${meta.page} of ${meta.pages} · ${meta.total} record${meta.total === 1 ? "" : "s"}`
        );

        const next = element("button", "btn btn--ghost", "Next");
        next.type = "button";
        next.disabled = meta.page >= meta.pages;
        next.addEventListener("click", () => onPage(meta.page + 1));

        container.append(previous, status, next);
    };

    /* ---------- Modal controller ---------- */

    const openModals = [];

    const focusables = (modal) =>
        Array.from(
            modal.querySelectorAll(
                'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
            )
        ).filter((node) => node.offsetParent !== null);

    const openModal = (modal, { onClose, initialFocus } = {}) => {
        if (!modal) return;

        modal.hidden = false;
        modal.classList.add("show");
        modal.setAttribute("role", "dialog");
        modal.setAttribute("aria-modal", "true");

        const heading = modal.querySelector("h2");
        if (heading && !heading.id) {
            heading.id = `modal-title-${Date.now()}`;
        }

        if (heading) {
            modal.setAttribute("aria-labelledby", heading.id);
        }

        if (!modal.dataset.modalBound) {
            modal.dataset.modalBound = "true";

            modal.addEventListener("click", (event) => {
                if (event.target === modal) closeModal(modal);
            });
        }

        const entry = { modal, onClose, opener: document.activeElement };
        openModals.push(entry);

        const target = initialFocus || focusables(modal)[0];
        if (target) {
            window.setTimeout(() => target.focus(), 30);
        }
    };

    const closeModal = (modal) => {
        if (!modal) return;

        const index = openModals.findIndex((entry) => entry.modal === modal);
        const entry = index >= 0 ? openModals.splice(index, 1)[0] : null;

        modal.classList.remove("show");
        modal.hidden = true;

        if (entry && entry.onClose) {
            entry.onClose();
        }

        if (entry && entry.opener && typeof entry.opener.focus === "function") {
            entry.opener.focus();
        }
    };

    document.addEventListener("keydown", (event) => {
        if (!openModals.length) return;

        const { modal } = openModals[openModals.length - 1];

        if (event.key === "Escape") {
            event.preventDefault();
            closeModal(modal);
            return;
        }

        if (event.key !== "Tab") return;

        const nodes = focusables(modal);

        if (nodes.length === 0) return;

        const first = nodes[0];
        const last = nodes[nodes.length - 1];

        if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first.focus();
        }
    });

    /**
     * Small confirmation dialog built on the shared modal component.
     */
    const confirmDialog = ({ title, message, confirmLabel = "Confirm", onConfirm }) => {
        const modal = element("div", "admin-modal");
        modal.hidden = false;

        const content = element("div", "admin-modal-content");
        const heading = element("div", "modal-heading");
        const headingText = element("div");
        headingText.append(
            element("h2", null, title || "Please confirm"),
            element("p", null, message || "")
        );

        const closeButton = element("button", "modal-close");
        closeButton.type = "button";
        closeButton.setAttribute("aria-label", "Close dialog");
        closeButton.innerHTML =
            '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>';

        heading.append(headingText, closeButton);

        const actions = element("div", "modal-actions");
        const cancel = element("button", "btn btn--ghost", "Cancel");
        cancel.type = "button";
        const accept = element("button", "btn btn--primary", confirmLabel);
        accept.type = "button";

        actions.append(cancel, accept);
        content.append(heading, actions);
        modal.append(content);
        document.body.append(modal);

        const destroy = () => {
            closeModal(modal);
            modal.remove();
        };

        closeButton.addEventListener("click", destroy);
        cancel.addEventListener("click", destroy);
        accept.addEventListener("click", () => {
            destroy();
            if (onConfirm) onConfirm();
        });

        openModal(modal, { initialFocus: accept });
    };

    window.EDTSP.ui = {
        setText,
        formatMoney,
        formatNumber,
        formatDate,
        formatDateTime,
        statusTone,
        statusBadge,
        element,
        state,
        fieldError,
        clearFieldErrors,
        formState,
        setFormState,
        debounce,
        pager,
        openModal,
        closeModal,
        confirmDialog
    };
})();
