// Optimistic concurrency control shared by editable records.
//
// A client sends back the version it read. The update only applies when the
// stored version still matches, and the same atomic write increments it. A
// mismatch means someone else saved first, so the caller gets 409 instead of
// silently overwriting newer data.

const VERSION_CONFLICT_CODE = "VERSION_CONFLICT";
const VERSION_CONFLICT_MESSAGE =
  "This record changed while you were editing it. Refresh the record to load the latest version, then apply your changes again.";

// Returns { provided, value, invalid }. An omitted version keeps legacy
// clients working (the write still increments, it just cannot detect a stale
// read); a malformed value is rejected rather than treated as "no version".
function readExpectedVersion(body) {
  const raw = body ? body.version : undefined;

  if (raw === undefined || raw === null || raw === "") {
    return { provided: false, value: null, invalid: false };
  }

  const value = Number(raw);

  if (!Number.isInteger(value) || value < 0) {
    return { provided: true, value: null, invalid: true };
  }

  return { provided: true, value, invalid: false };
}

// Existing records predate the version field, so an expected version of 0 must
// also match a document where the field is absent.
function versionFilter(expectedVersion) {
  if (expectedVersion === null || expectedVersion === undefined) return {};

  if (expectedVersion === 0) {
    return { $or: [{ version: 0 }, { version: { $exists: false } }] };
  }

  return { version: expectedVersion };
}

function currentVersionOf(document) {
  const value = document ? document.version : undefined;

  return Number.isInteger(value) && value >= 0 ? value : 0;
}

function sendVersionConflict(res, { currentVersion = 0, current = null } = {}) {
  const payload = {
    success: false,
    code: VERSION_CONFLICT_CODE,
    message: VERSION_CONFLICT_MESSAGE,
    currentVersion
  };

  if (current) payload.current = current;

  return res.status(409).json(payload);
}

module.exports = {
  VERSION_CONFLICT_CODE,
  VERSION_CONFLICT_MESSAGE,
  readExpectedVersion,
  versionFilter,
  currentVersionOf,
  sendVersionConflict
};
