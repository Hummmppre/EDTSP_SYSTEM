// Authenticated realtime listener. It only carries "record changed" signals;
// the page decides whether the open record matches and asks the user to
// refresh. Version checking still happens on save, so a missed signal cannot
// let stale data overwrite newer data.
(function () {
    const API_ORIGIN = "http://localhost:5000";

    let socket = null;
    let currentWatch = null;
    const listeners = new Set();

    function readToken() {
        return (
            localStorage.getItem("edtspToken") ||
            sessionStorage.getItem("edtspToken") ||
            ""
        );
    }

    function connect() {
        if (socket || !window.io) return socket;

        const token = readToken();

        if (!token) return null;

        socket = window.io(API_ORIGIN, {
            auth: { token },
            transports: ["websocket", "polling"]
        });

        socket.on("connect", () => {
            if (currentWatch) socket.emit("watch", currentWatch);
        });

        socket.on("record:updated", payload => {
            listeners.forEach(listener => {
                try {
                    listener(payload);
                } catch (error) {
                    console.error("Realtime listener error:", error);
                }
            });
        });

        // Realtime is an enhancement; a connection failure must never block
        // the page or show an error the user cannot act on.
        socket.on("connect_error", () => {});

        return socket;
    }

    window.EDTSPRealtime = {
        watch(resource, id) {
            if (!resource || !id) return;

            currentWatch = {
                resource: String(resource),
                id: String(id)
            };

            if (!socket) connect();

            if (socket && socket.connected) {
                socket.emit("watch", currentWatch);
            }
        },

        unwatch() {
            currentWatch = null;

            if (socket && socket.connected) {
                socket.emit("unwatch");
            }
        },

        onRecordUpdated(listener) {
            listeners.add(listener);

            return () => listeners.delete(listener);
        },

        disconnect() {
            currentWatch = null;

            if (socket) {
                socket.disconnect();
                socket = null;
            }
        }
    };

    connect();
})();
