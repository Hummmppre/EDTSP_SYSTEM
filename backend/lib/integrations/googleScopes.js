const SERVICE_SCOPES = Object.freeze({
  calendar: ["https://www.googleapis.com/auth/calendar.events"],
  sheets: [
    "https://www.googleapis.com/auth/spreadsheets",
    "https://www.googleapis.com/auth/drive.file",
    "https://www.googleapis.com/auth/drive",
  ],
});

const SCOPES = Object.freeze([
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/userinfo.email",
  "https://www.googleapis.com/auth/drive.file",
]);

function parseScopes(scope) {
  return String(scope || "")
    .split(/\s+/)
    .filter(Boolean);
}

function hasServiceAccess(service, scopes) {
  const granted = Array.isArray(scopes) ? scopes : [];

  if (!granted.length) return true;

  const required = SERVICE_SCOPES[service] || [];

  return required.some((scope) => granted.includes(scope));
}

module.exports = {
  SERVICE_SCOPES,
  SCOPES,
  parseScopes,
  hasServiceAccess,
};
