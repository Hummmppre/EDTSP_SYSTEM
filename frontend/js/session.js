/**
 * Single session guard for every portal page: token presence, local expiry,
 * role check, identity chips, logout and 401 handling.
 */
window.EDTSP = window.EDTSP || {};

(function initSession() {
    const TOKEN_KEY = "edtspToken";
    const USER_KEY = "edtspUser";

    const rootPrefix = () => {
        const path = window.location.pathname;
        return path.includes("/admin/") || path.includes("/trainee/") ? "../" : "";
    };

    const loginUrl = (reason) => {
        const query = reason ? `?reason=${encodeURIComponent(reason)}` : "";
        return `${rootPrefix()}login.html${query}`;
    };

    const getToken = () => localStorage.getItem(TOKEN_KEY);

    const getUser = () => {
        try {
            return JSON.parse(localStorage.getItem(USER_KEY) || "null");
        } catch (error) {
            return null;
        }
    };

    const setSession = (token, user) => {
        localStorage.setItem(TOKEN_KEY, token);
        localStorage.setItem(USER_KEY, JSON.stringify(user));
    };

    const clear = () => {
        localStorage.removeItem(TOKEN_KEY);
        localStorage.removeItem(USER_KEY);
    };

    const isExpired = (token) => {
        if (!token) return true;

        try {
            const payload = token.split(".")[1];
            const normalized = payload
                .replace(/-/g, "+")
                .replace(/_/g, "/");
            const decoded = JSON.parse(atob(normalized));

            if (!decoded.exp) return false;

            return decoded.exp * 1000 <= Date.now();
        } catch (error) {
            return true;
        }
    };

    const paintIdentity = (user) => {
        if (!user) return;

        const fullName = `${user.firstName || ""} ${user.lastName || ""}`.trim();
        const initials =
            `${(user.firstName || "").charAt(0)}${(user.lastName || "").charAt(0)}`
                .toUpperCase() || "?";

        const paint = (id, value) => {
            const element = document.getElementById(id);
            if (element) element.textContent = value;
        };

        paint("sidebarName", fullName || "Trainee");
        paint("topbarName", fullName || "Trainee");
        paint("userInitials", initials);
        paint("topbarInitials", initials);
        paint("welcomeName", user.firstName || "");
    };

    /**
     * Redirect when the stored session is missing, expired, or the wrong role.
     * Returns the cached user on success, otherwise null.
     */
    const requireRole = (role) => {
        const token = getToken();
        const user = getUser();

        if (!token || !user) {
            clear();
            window.location.replace(loginUrl("signin"));
            return null;
        }

        if (isExpired(token)) {
            clear();
            window.location.replace(loginUrl("expired"));
            return null;
        }

        if (role && user.role !== role) {
            window.location.replace(loginUrl("role"));
            return null;
        }

        paintIdentity(user);

        return user;
    };

    /**
     * End the local session. Best-effort server revocation unless the session is
     * already known to be invalid.
     */
    const end = async ({ reason = "expired", skipRequest = false } = {}) => {
        if (!skipRequest && getToken()) {
            try {
                await window.EDTSP.api.post("/auth/logout");
            } catch (error) {
                // Local sign-out still happens if the server call fails.
            }
        }

        clear();
        window.location.replace(loginUrl(reason));
    };

    const bindLogout = (button) => {
        if (!button) return;

        button.addEventListener("click", (event) => {
            event.preventDefault();

            const confirmDialog = window.EDTSP.ui && window.EDTSP.ui.confirmDialog;

            if (!confirmDialog) {
                end({ reason: "signed-out" });
                return;
            }

            confirmDialog({
                title: "Sign out of EDTSP?",
                message:
                    "Your current session will end on this device. You can sign in again at any time.",
                confirmLabel: "Sign out",
                onConfirm: () => end({ reason: "signed-out" })
            });
        });
    };

    window.EDTSP.session = {
        getToken,
        getUser,
        setSession,
        clear,
        isExpired,
        requireRole,
        end,
        bindLogout,
        paintIdentity,
        loginUrl,
        rootPrefix
    };
})();
