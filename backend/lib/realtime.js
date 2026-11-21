const jwt = require("jsonwebtoken");
const { Server } = require("socket.io");

// Record rooms carry only a change signal (resource, id, version). No record
// data is pushed, so a listener can never render stale content.
const WATCHABLE_RESOURCES = new Set([
  "trainee",
  "payment",
  "assessment",
  "cow"
]);

let io = null;

function tokenFromSocket(socket) {
  const authToken = socket.handshake.auth && socket.handshake.auth.token;

  if (authToken) {
    return String(authToken).replace(/^Bearer\s+/i, "");
  }

  const header = socket.handshake.headers.authorization || "";

  return header.startsWith("Bearer ") ? header.slice(7) : "";
}

function recordRoom(resource, id) {
  return `record:${resource}:${id}`;
}

// Same JWT the REST API uses. Only administrator sessions may watch records.
function initRealtime(httpServer) {
  io = new Server(httpServer, {
    cors: { origin: "*" }
  });

  io.use((socket, next) => {
    try {
      const token = tokenFromSocket(socket);

      if (!token) return next(new Error("unauthorized"));

      const decoded = jwt.verify(token, process.env.JWT_SECRET);

      socket.user = {
        id: String(decoded.id),
        role: decoded.role
      };

      return next();

    } catch (error) {
      return next(new Error("unauthorized"));
    }
  });

  io.on("connection", socket => {
    socket.join(`user:${socket.user.id}`);

    socket.data.watching = null;

    socket.on("watch", (payload, acknowledge) => {
      if (socket.user.role !== "admin") return;

      const resource = String((payload && payload.resource) || "");
      const id = String((payload && payload.id) || "");

      if (!WATCHABLE_RESOURCES.has(resource) || !id) return;

      if (socket.data.watching) {
        socket.leave(socket.data.watching);
      }

      const room = recordRoom(resource, id);

      socket.join(room);
      socket.data.watching = room;

      if (typeof acknowledge === "function") acknowledge({ ok: true });
    });

    socket.on("unwatch", () => {
      if (!socket.data.watching) return;

      socket.leave(socket.data.watching);
      socket.data.watching = null;
    });
  });

  return io;
}

// Called after a versioned write succeeds. The acting user's own sockets are
// excluded so only the other viewers are told to refresh.
function notifyRecordUpdated({ resource, id, version, actorId } = {}) {
  if (!io || !WATCHABLE_RESOURCES.has(resource) || !id) return;

  let targets = io.to(recordRoom(resource, String(id)));

  if (actorId) {
    targets = targets.except(`user:${actorId}`);
  }

  targets.emit("record:updated", {
    resource,
    id: String(id),
    version: version === undefined ? null : version,
    changedAt: new Date().toISOString()
  });
}

module.exports = {
  initRealtime,
  notifyRecordUpdated
};
