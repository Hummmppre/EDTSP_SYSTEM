/**
 * Shared portal shell behaviour: the desktop collapse and the mobile drawer.
 * One class contract: .shell.is-collapsed and .shell.is-open.
 */
(function initPortalShell() {
    const shell = document.getElementById("shell");
    const sidebar = document.getElementById("sidebar");

    if (!shell || !sidebar) return;

    const toggle =
        document.getElementById("sidebarToggle") ||
        document.getElementById("menuToggle");

    const scrim = document.querySelector(".scrim");
    const navLinks = sidebar.querySelectorAll(".nav__link");
    const MOBILE_BREAKPOINT = 1080;

    const isMobile = () => window.innerWidth <= MOBILE_BREAKPOINT;

    const syncExpanded = () => {
        if (!toggle) return;

        const expanded = isMobile()
            ? shell.classList.contains("is-open")
            : !shell.classList.contains("is-collapsed");

        toggle.setAttribute("aria-expanded", String(expanded));
    };

    const closeDrawer = () => {
        if (!shell.classList.contains("is-open")) return;

        shell.classList.remove("is-open");
        syncExpanded();
    };

    const openDrawer = () => {
        shell.classList.add("is-open");
        syncExpanded();
    };

    if (toggle) {
        toggle.addEventListener("click", () => {
            if (isMobile()) {
                if (shell.classList.contains("is-open")) {
                    closeDrawer();
                } else {
                    openDrawer();
                }
                return;
            }

            shell.classList.toggle("is-collapsed");
            syncExpanded();
        });
    }

    if (scrim) {
        scrim.addEventListener("click", closeDrawer);
    }

    navLinks.forEach((link) => {
        link.addEventListener("click", () => {
            if (isMobile()) closeDrawer();
        });
    });

    document.addEventListener("keydown", (event) => {
        if (event.key === "Escape") closeDrawer();
    });

    let wasMobile = isMobile();

    window.addEventListener("resize", () => {
        const nowMobile = isMobile();

        if (nowMobile === wasMobile) return;

        wasMobile = nowMobile;

        // Keep a single coherent state when crossing the breakpoint.
        if (nowMobile) {
            shell.classList.remove("is-collapsed");
        } else {
            shell.classList.remove("is-open");
        }

        syncExpanded();
    });

    syncExpanded();
})();
