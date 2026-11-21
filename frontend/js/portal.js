// =============================
// EDTSP PORTAL SHELL
// Responsive navigation, scrim, and dialog behaviour shared by every portal page.
// =============================

// Shared SVG activity chart used by the admin and trainee dashboards. Bars show
// monthly volume; the smooth line and area show the monthly average score.
window.EDTSP = window.EDTSP || {};

window.EDTSP.renderActivityChart = function (container, options = {}) {
    if (!container) return false;

    const labels = Array.isArray(options.labels) ? options.labels : [];
    const bars = Array.isArray(options.bars) ? options.bars : [];
    const line = Array.isArray(options.line) ? options.line : [];
    const barLabel = options.barLabel || "Assessments";
    const lineLabel = options.lineLabel || "Average score";
    const barMax = Math.max(1, ...bars.map(value => Number(value) || 0));
    const lineValues = line.map(value =>
        value === null || value === undefined || Number.isNaN(Number(value))
            ? null
            : Number(value)
    );
    const lineMax = Math.max(
        100,
        options.lineMax || 0,
        ...lineValues.filter(value => value !== null)
    );
    const hasBars = bars.some(value => Number(value) > 0);
    const hasLine = lineValues.some(value => value !== null);

    container.innerHTML = "";

    if (!labels.length || (!hasBars && !hasLine)) return false;

    const NS = "http://www.w3.org/2000/svg";
    const width = 720;
    const height = 260;
    const pad = { top: 18, right: 14, bottom: 34, left: 14 };
    const innerWidth = width - pad.left - pad.right;
    const innerHeight = height - pad.top - pad.bottom;
    const baseline = pad.top + innerHeight;
    const slot = innerWidth / labels.length;
    const barWidth = Math.max(8, Math.min(34, slot * 0.32));

    const svg = document.createElementNS(NS, "svg");
    svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
    svg.setAttribute("preserveAspectRatio", "none");
    svg.setAttribute("aria-hidden", "true");
    svg.setAttribute("focusable", "false");

    function node(name, attributes = {}) {
        const element = document.createElementNS(NS, name);

        Object.entries(attributes).forEach(([key, value]) => {
            element.setAttribute(key, String(value));
        });

        return element;
    }

    function smoothPath(points) {
        if (!points.length) return "";
        if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;

        let path = `M ${points[0].x} ${points[0].y}`;

        for (let index = 0; index < points.length - 1; index += 1) {
            const p0 = points[index - 1] || points[index];
            const p1 = points[index];
            const p2 = points[index + 1];
            const p3 = points[index + 2] || p2;
            const c1x = p1.x + (p2.x - p0.x) / 6;
            const c1y = p1.y + (p2.y - p0.y) / 6;
            const c2x = p2.x - (p3.x - p1.x) / 6;
            const c2y = p2.y - (p3.y - p1.y) / 6;

            path += ` C ${c1x} ${c1y}, ${c2x} ${c2y}, ${p2.x} ${p2.y}`;
        }

        return path;
    }

    const grid = node("g", { class: "chart-grid" });

    [0.25, 0.5, 0.75, 1].forEach(ratio => {
        const y = pad.top + innerHeight * (1 - ratio);

        grid.appendChild(node("line", {
            x1: pad.left,
            y1: y,
            x2: width - pad.right,
            y2: y
        }));
    });

    svg.appendChild(grid);

    const barGroup = node("g");
    const centers = labels.map((_, index) => pad.left + slot * (index + 0.5));

    bars.forEach((value, index) => {
        const amount = Number(value) || 0;
        const barHeight = (amount / barMax) * innerHeight;
        const x = centers[index] - barWidth / 2;
        const y = baseline - barHeight;
        const rect = node("rect", {
            class: "chart-bar",
            x,
            y,
            width: barWidth,
            height: Math.max(barHeight, 0),
            rx: Math.min(5, barWidth / 2)
        });

        rect.appendChild(node("title")).textContent =
            `${labels[index]}: ${amount} ${barLabel.toLowerCase()}`;
        barGroup.appendChild(rect);
    });

    svg.appendChild(barGroup);

    const runs = [];
    let run = [];

    lineValues.forEach((value, index) => {
        if (value === null) {
            if (run.length) runs.push(run);
            run = [];
            return;
        }

        run.push({
            x: centers[index],
            y: baseline - (Math.min(value, lineMax) / lineMax) * innerHeight,
            label: labels[index],
            value
        });
    });

    if (run.length) runs.push(run);

    runs.forEach(points => {
        if (points.length > 1) {
            const area = node("path", {
                class: "chart-area",
                d: `${smoothPath(points)} L ${points[points.length - 1].x} ${baseline} L ${points[0].x} ${baseline} Z`
            });

            svg.appendChild(area);
        }

        if (points.length > 1) {
            svg.appendChild(node("path", {
                class: "chart-line",
                d: smoothPath(points)
            }));
        }

        points.forEach(point => {
            const circle = node("circle", {
                class: "chart-point",
                cx: point.x,
                cy: point.y,
                r: 3.5
            });

            circle.appendChild(node("title")).textContent =
                `${point.label}: ${Math.round(point.value)}% ${lineLabel.toLowerCase()}`;
            svg.appendChild(circle);
        });
    });

    const labelGroup = node("g");

    labels.forEach((label, index) => {
        const text = node("text", {
            class: "chart-axis-label",
            x: centers[index],
            y: height - 10,
            "text-anchor": "middle"
        });

        text.textContent = label;
        labelGroup.appendChild(text);
    });

    svg.appendChild(labelGroup);
    container.appendChild(svg);

    return true;
};

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

    // ---------- Account menu ----------

    const userMenus = Array.from(
        document.querySelectorAll("[data-user-menu]")
    );

    function closeUserMenu(root, restoreFocus = false) {
        const trigger = root.querySelector("[data-user-menu-trigger]");
        const panel = root.querySelector("[data-user-menu-panel]");

        if (!trigger || !panel || panel.hidden) return;

        panel.hidden = true;
        trigger.setAttribute("aria-expanded", "false");

        if (restoreFocus) trigger.focus();
    }

    function openUserMenu(root, focusLast = false) {
        userMenus.forEach(other => {
            if (other !== root) closeUserMenu(other);
        });

        const trigger = root.querySelector("[data-user-menu-trigger]");
        const panel = root.querySelector("[data-user-menu-panel]");

        if (!trigger || !panel) return;

        panel.hidden = false;
        trigger.setAttribute("aria-expanded", "true");

        const items = menuItemsOf(panel);

        if (items.length) {
            items[focusLast ? items.length - 1 : 0].focus();
        }
    }

    function menuItemsOf(panel) {
        return Array.from(
            panel.querySelectorAll('[role="menuitem"]')
        ).filter(item => !item.disabled);
    }

    userMenus.forEach(root => {
        const trigger = root.querySelector("[data-user-menu-trigger]");
        const panel = root.querySelector("[data-user-menu-panel]");

        if (!trigger || !panel) return;

        trigger.addEventListener("click", () => {
            if (panel.hidden) {
                openUserMenu(root);
            } else {
                closeUserMenu(root);
            }
        });

        trigger.addEventListener("keydown", event => {
            if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                event.preventDefault();
                openUserMenu(root, event.key === "ArrowUp");
                return;
            }

            if (event.key === "Escape" && !panel.hidden) {
                event.preventDefault();
                event.stopPropagation();
                closeUserMenu(root, true);
            }
        });

        panel.addEventListener("keydown", event => {
            const items = menuItemsOf(panel);

            if (event.key === "Escape") {
                event.preventDefault();
                event.stopPropagation();
                closeUserMenu(root, true);
                return;
            }

            if (event.key === "Home" || event.key === "End") {
                if (!items.length) return;

                event.preventDefault();
                items[event.key === "Home" ? 0 : items.length - 1].focus();
                return;
            }

            if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;

            if (!items.length) return;

            event.preventDefault();

            const current = items.indexOf(document.activeElement);
            const step = event.key === "ArrowDown" ? 1 : -1;
            const next = (current + step + items.length) % items.length;

            items[next].focus();
        });

        panel.addEventListener("click", event => {
            if (event.target.closest(".user-menu__item")) closeUserMenu(root);
        });

        root.addEventListener("focusout", event => {
            if (!root.contains(event.relatedTarget)) closeUserMenu(root);
        });

        document.addEventListener("click", event => {
            if (!root.contains(event.target)) closeUserMenu(root);
        });
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
                const active = document.activeElement;

                lastFocused =
                    active &&
                    active !== document.body &&
                    active.offsetParent !== null
                        ? active
                        : document.getElementById("userMenuButton") || active;

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

            const canRestoreFocus =
                lastFocused &&
                document.contains(lastFocused) &&
                lastFocused.offsetParent !== null;

            if (canRestoreFocus) {
                lastFocused.focus();
            } else if (lastFocused && lastFocused.closest("[data-user-menu]")) {
                const trigger = document.getElementById("userMenuButton");

                if (trigger) trigger.focus();
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

    // ---------- Navigation search ----------

    sidebar.querySelectorAll("a.nav__link").forEach(link => {
        const label = link.querySelector("span:not(.nav__badge)");

        if (label && !link.title) link.title = label.textContent.trim();
    });

    const navSearch = document.querySelector("[data-nav-search]");

    if (navSearch) {
        const searchInput = navSearch.querySelector("[data-nav-search-input]");
        const searchResults = navSearch.querySelector("[data-nav-search-results]");
        const pages = [];
        const seenHrefs = new Set();

        sidebar.querySelectorAll("a.nav__link").forEach(link => {
            const label = link.querySelector("span:not(.nav__badge)");
            const href = link.getAttribute("href");
            const text = (label ? label.textContent : link.textContent).trim();

            if (!text || !href || seenHrefs.has(href)) return;

            seenHrefs.add(href);
            pages.push({ label: text, href });
        });

        let activeIndex = -1;

        function searchItems() {
            return Array.from(searchResults.querySelectorAll(".search-result"));
        }

        function closeSearch() {
            searchResults.hidden = true;
            searchInput.setAttribute("aria-expanded", "false");
            activeIndex = -1;
        }

        function setSearchActive(index) {
            const items = searchItems();

            activeIndex = index;

            items.forEach((item, itemIndex) => {
                const isActive = itemIndex === index;

                item.classList.toggle("is-active", isActive);
                item.setAttribute("aria-selected", String(isActive));
            });

            if (index >= 0 && items[index]) {
                items[index].scrollIntoView({ block: "nearest" });
            }
        }

        function renderSearchResults(query) {
            const term = query.trim().toLowerCase();
            const matches = pages
                .filter(page => !term || page.label.toLowerCase().includes(term))
                .slice(0, 7);

            searchResults.innerHTML = "";
            activeIndex = -1;

            if (!matches.length) {
                const empty = document.createElement("p");

                empty.className = "search-empty";
                empty.textContent = term
                    ? `No pages match “${query.trim()}”.`
                    : "No pages available.";
                searchResults.appendChild(empty);
            } else {
                matches.forEach((page, index) => {
                    const link = document.createElement("a");
                    const icon = document.createElementNS(
                        "http://www.w3.org/2000/svg",
                        "svg"
                    );
                    const arrow = document.createElementNS(
                        "http://www.w3.org/2000/svg",
                        "path"
                    );
                    const label = document.createElement("span");
                    const hint = document.createElement("small");

                    link.className = "search-result";
                    link.href = page.href;
                    link.setAttribute("role", "option");
                    link.setAttribute("aria-selected", "false");

                    icon.setAttribute("viewBox", "0 0 24 24");
                    icon.setAttribute("aria-hidden", "true");
                    arrow.setAttribute("d", "M5 12h14M13 6l6 6-6 6");
                    icon.appendChild(arrow);

                    label.textContent = page.label;
                    hint.textContent = "Page";

                    link.append(icon, label, hint);
                    link.addEventListener("mouseenter", () => setSearchActive(index));
                    searchResults.appendChild(link);
                });
            }

            searchResults.hidden = false;
            searchInput.setAttribute("aria-expanded", "true");
        }

        function openFirstSearchResult() {
            const items = searchItems();
            const target = items[activeIndex >= 0 ? activeIndex : 0];

            if (target) window.location.href = target.href;
        }

        searchInput.addEventListener("focus", () => {
            renderSearchResults(searchInput.value);
        });

        searchInput.addEventListener("input", () => {
            renderSearchResults(searchInput.value);
        });

        searchInput.addEventListener("keydown", event => {
            const items = searchItems();

            if (event.key === "ArrowDown") {
                event.preventDefault();

                if (items.length) {
                    setSearchActive((activeIndex + 1) % items.length);
                }

                return;
            }

            if (event.key === "ArrowUp") {
                event.preventDefault();

                if (items.length) {
                    setSearchActive(
                        (activeIndex - 1 + items.length) % items.length
                    );
                }

                return;
            }

            if (event.key === "Enter") {
                event.preventDefault();
                openFirstSearchResult();
                return;
            }

            if (event.key === "Escape") {
                event.preventDefault();
                closeSearch();
                searchInput.blur();
            }
        });

        navSearch.addEventListener("submit", event => {
            event.preventDefault();
            openFirstSearchResult();
        });

        document.addEventListener("click", event => {
            if (!navSearch.contains(event.target)) closeSearch();
        });

        document.addEventListener("keydown", event => {
            if (
                event.key !== "/" ||
                event.metaKey ||
                event.ctrlKey ||
                event.altKey
            ) {
                return;
            }

            const active = document.activeElement;
            const tag = active ? active.tagName.toLowerCase() : "";

            if (
                tag === "input" ||
                tag === "textarea" ||
                tag === "select" ||
                (active && active.isContentEditable)
            ) {
                return;
            }

            event.preventDefault();
            searchInput.focus();
        });
    }

    // ---------- Notifications ----------

    const notify = document.querySelector("[data-notify]");

    if (notify) {
        const notifyTrigger = notify.querySelector("[data-notify-trigger]");
        const notifyPanel = notify.querySelector("[data-notify-panel]");
        const notifyList = notify.querySelector("[data-notify-list]");
        const notifyDot = notify.querySelector("[data-notify-dot]");

        function notificationEntries() {
            const entries = [];

            document.querySelectorAll("[data-pending-count]").forEach(badge => {
                const count = Number((badge.textContent || "").trim());

                if (!Number.isFinite(count) || count <= 0) return;

                const link = badge.closest("a.nav__link");
                const label = link
                    ? link.querySelector("span:not(.nav__badge)")
                    : null;
                const name = label ? label.textContent.trim() : "Applications";

                entries.push({
                    href: link ? link.getAttribute("href") : "applications.html",
                    title: `${name} awaiting review`,
                    note: `${count} ${count === 1 ? "item needs" : "items need"} a decision.`
                });
            });

            return entries;
        }

        function renderNotifications() {
            const entries = notificationEntries();

            notifyDot.hidden = entries.length === 0;
            notifyList.innerHTML = "";

            if (!entries.length) {
                const empty = document.createElement("p");

                empty.className = "search-empty";
                empty.textContent = "You're all caught up.";
                notifyList.appendChild(empty);
                return;
            }

            entries.forEach(entry => {
                const link = document.createElement("a");
                const icon = document.createElement("span");
                const text = document.createElement("span");
                const title = document.createElement("strong");
                const note = document.createElement("small");

                link.className = "notify-item";
                link.href = entry.href;

                icon.className = "notify-item__icon";
                icon.setAttribute("aria-hidden", "true");
                icon.innerHTML = `
                    <svg viewBox="0 0 24 24">
                        <rect x="5" y="4" width="14" height="17" rx="2"></rect>
                        <path d="M9 9h6M9 13h4"></path>
                    </svg>
                `;

                title.textContent = entry.title;
                note.textContent = entry.note;
                text.append(title, note);
                link.append(icon, text);
                link.addEventListener("click", closeNotifications);
                notifyList.appendChild(link);
            });
        }

        function openNotifications() {
            renderNotifications();
            notifyPanel.hidden = false;
            notifyTrigger.setAttribute("aria-expanded", "true");
        }

        function closeNotifications() {
            notifyPanel.hidden = true;
            notifyTrigger.setAttribute("aria-expanded", "false");
        }

        notifyTrigger.addEventListener("click", () => {
            if (notifyPanel.hidden) {
                openNotifications();
            } else {
                closeNotifications();
            }
        });

        document.addEventListener("click", event => {
            if (!notify.contains(event.target)) closeNotifications();
        });

        document.addEventListener("keydown", event => {
            if (event.key === "Escape" && !notifyPanel.hidden) {
                closeNotifications();
                notifyTrigger.focus();
            }
        });

        const notifyObserver = new MutationObserver(() => {
            if (notifyPanel.hidden) {
                notifyDot.hidden = notificationEntries().length === 0;
            } else {
                renderNotifications();
            }
        });

        document.querySelectorAll("[data-pending-count]").forEach(badge => {
            notifyObserver.observe(badge, {
                childList: true,
                characterData: true,
                subtree: true,
                attributes: true,
                attributeFilter: ["hidden"]
            });
        });

        notifyDot.hidden = notificationEntries().length === 0;
    }
})();
