// =============================
// EDTSP PORTAL SHELL
// Responsive navigation, scrim, and dialog behaviour shared by every portal page.
// =============================

(() => {
    // Inline field errors shared by portal forms. The error paragraph is created
    // on first use inside the field and toggled with [hidden].
    function fieldErrorFor(target) {
        const field = target.closest(".field");

        if (!field) return null;

        let error = field.querySelector(".field__error--inline");

        if (!error) {
            error = document.createElement("p");
            error.className = "field__error field__error--inline";
            error.setAttribute("role", "alert");
            error.hidden = true;
            field.appendChild(error);
        }

        return error;
    }

    window.setFieldError = function (target, message) {
        if (!target) return;

        const error = fieldErrorFor(target);

        if (!error) return;

        error.textContent = message || "";
        error.hidden = !message;

        if (target.matches("input, select, textarea")) {
            if (message) {
                target.setAttribute("aria-invalid", "true");
            } else {
                target.removeAttribute("aria-invalid");
            }
        }
    };

    window.clearFieldErrors = function (root) {
        if (!root) return;

        root.querySelectorAll(".field__error--inline").forEach(error => {
            error.textContent = "";
            error.hidden = true;
        });

        root.querySelectorAll('[aria-invalid="true"]').forEach(control => {
            control.removeAttribute("aria-invalid");
        });
    };

    document.addEventListener("input", event => {
        const control = event.target.closest(
            ".modal-form input, .modal-form select, .modal-form textarea"
        );

        if (!control) return;

        const field = control.closest(".field");
        const error = field ? field.querySelector(".field__error--inline") : null;

        if (error && !error.hidden) window.setFieldError(control, "");
    });

    const shell = document.getElementById("shell");
    const sidebar = document.getElementById("sidebar");
    const scrim = document.querySelector(".scrim");
    const navToggle =
        document.getElementById("menuToggle") || document.getElementById("sidebarToggle");

    if (!shell || !sidebar) return;

    const mobileQuery = window.matchMedia("(max-width: 1080px)");
    const COLLAPSE_KEY = "edtspSidebarCollapsed";

    function isMobile() {
        return mobileQuery.matches;
    }

    function setExpanded(expanded) {
        if (navToggle) {
            navToggle.setAttribute("aria-expanded", String(expanded));
        }
    }

    function syncSidebarInert() {
        // Keep the closed drawer out of the tab order on small screens.
        sidebar.inert = isMobile() && !shell.classList.contains("is-open");
    }

    function restoreDesktopState() {
        const collapsed = localStorage.getItem(COLLAPSE_KEY) === "true";

        shell.classList.toggle("is-collapsed", !isMobile() && collapsed);
        setExpanded(isMobile() ? shell.classList.contains("is-open") : !collapsed);
        syncSidebarInert();
    }

    function openDrawer() {
        shell.classList.add("is-open");
        document.body.classList.add("nav-open");
        setExpanded(true);
        syncSidebarInert();

        if (drawerClose) drawerClose.focus();
    }

    function closeDrawer() {
        shell.classList.remove("is-open");
        document.body.classList.remove("nav-open");
        setExpanded(false);
        syncSidebarInert();

        if (isMobile() && navToggle) navToggle.focus();
    }

    restoreDesktopState();

    const drawerClose = document.createElement("button");

    drawerClose.type = "button";
    drawerClose.className = "sidebar__close";
    drawerClose.setAttribute("aria-label", "Close navigation");
    drawerClose.innerHTML = `
        <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M6 6l12 12M18 6 6 18"></path>
        </svg>
    `;
    drawerClose.addEventListener("click", closeDrawer);
    sidebar.prepend(drawerClose);

    if (navToggle) {
        navToggle.addEventListener("click", () => {
            if (isMobile()) {
                if (shell.classList.contains("is-open")) {
                    closeDrawer();
                } else {
                    openDrawer();
                }

                return;
            }

            shell.classList.toggle("is-collapsed");

            const collapsed = shell.classList.contains("is-collapsed");

            localStorage.setItem(COLLAPSE_KEY, collapsed ? "true" : "false");
            setExpanded(!collapsed);
        });
    }

    if (scrim) {
        scrim.addEventListener("click", closeDrawer);
    }

    sidebar.querySelectorAll("a.nav__link").forEach(link => {
        link.addEventListener("click", () => {
            if (isMobile()) closeDrawer();
        });
    });

    mobileQuery.addEventListener("change", () => {
        if (!isMobile()) {
            document.body.classList.remove("nav-open");

            // A drawer left open on mobile must not swallow focus on desktop.
            shell.classList.remove("is-open");
        }

        restoreDesktopState();
    });

    // ---------- Dialogs ----------

    const dialogs = Array.from(
        document.querySelectorAll(".admin-modal[data-portal-modal]")
    );

    let lastFocused = null;

    function closeDialog(dialog) {
        dialog.classList.remove("show");
    }

    function focusableItems(dialog) {
        return Array.from(
            dialog.querySelectorAll(
                'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
            )
        ).filter(element => element.offsetParent !== null);
    }

    dialogs.forEach(dialog => {
        const observer = new MutationObserver(() => {
            const isOpen = dialog.classList.contains("show");

            if (isOpen) {
                lastFocused = document.activeElement;
                document.body.classList.add("modal-open");

                window.requestAnimationFrame(() => {
                    const firstField = dialog.querySelector(
                        "input:not([type='checkbox']), select, textarea"
                    );
                    const closeButton = dialog.querySelector(".modal-close");

                    (firstField || closeButton || dialog).focus();
                });

                return;
            }

            if (lastFocused && document.contains(lastFocused)) {
                lastFocused.focus();
            }

            if (!document.querySelector(".admin-modal.show")) {
                document.body.classList.remove("modal-open");
            }
        });

        observer.observe(dialog, { attributes: true, attributeFilter: ["class"] });

        dialog.addEventListener("click", event => {
            if (event.target === dialog) closeDialog(dialog);
        });
    });

    document.addEventListener("keydown", event => {
        const openDialog = document.querySelector(".admin-modal.show[data-portal-modal]");

        if (event.key === "Escape") {
            if (openDialog) {
                closeDialog(openDialog);
                return;
            }

            // Dialogs on other pages manage their own Escape handling.
            if (document.querySelector(".admin-modal.show")) return;

            if (shell.classList.contains("is-open")) {
                closeDrawer();
            }

            return;
        }

        if (event.key !== "Tab" || !openDialog) return;

        const items = focusableItems(openDialog);

        if (!items.length) return;

        const first = items[0];
        const last = items[items.length - 1];

        if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first.focus();
        }
    });
})();
