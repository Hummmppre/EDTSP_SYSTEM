// Optimistic concurrency control shared by editable records.
//
// Mongoose's built-in `__v` version key is the only counter. A client sends
// back the version it read. The update only applies when the stored `__v`
// still matches, and the same atomic write increments it. A mismatch means
// someone else saved first, so the caller gets 409 instead of silently
// overwriting newer data.

const VERSION_KEY = "__v";

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

// Documents written before `__v` was the counter may not have the key yet, so
// an expected version of 0 also matches a missing version key.
function versionFilter(expectedVersion) {
  if (expectedVersion === null || expectedVersion === undefined) return {};

  if (expectedVersion === 0) {
    return {
      $or: [
        { [VERSION_KEY]: 0 },
        { [VERSION_KEY]: { $exists: false } }
      ]
    };
  }

  return { [VERSION_KEY]: expectedVersion };
}

function currentVersionOf(document) {
  const value = document ? document[VERSION_KEY] : undefined;

  return Number.isInteger(value) && value >= 0 ? value : 0;
}

// Serialize `__v` under the API's existing `version` name so clients keep the
// same contract while the database stores a single counter.
function exposeVersionAsJson(schema) {
  const options = schema.options.toJSON || {};
  const existingTransform = options.transform;

  schema.set("toJSON", {
    ...options,
    transform(document, result, transformationOptions) {
      if (typeof existingTransform === "function") {
        existingTransform(document, result, transformationOptions);
      }

      result.version = currentVersionOf(result);
      delete result.__v;
    }
  });
}

// Lean queries bypass toJSON, so use this to build the same response shape.
function versionedRecord(record) {
  if (!record) return record;

  const { __v, ...rest } = record;

  return {
    ...rest,
    version: Number.isInteger(__v) && __v >= 0 ? __v : 0
  };
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
  VERSION_KEY,
  VERSION_CONFLICT_CODE,
  VERSION_CONFLICT_MESSAGE,
  readExpectedVersion,
  versionFilter,
  currentVersionOf,
  exposeVersionAsJson,
  versionedRecord,
  sendVersionConflict
};
