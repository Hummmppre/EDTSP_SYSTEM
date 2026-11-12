const escapeRegExp = (value) =>
    String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Build a case-insensitive "contains" matcher for a user supplied string.
 */
const searchRegExp = (value) =>
    new RegExp(escapeRegExp(String(value).trim()), "i");

/**
 * Parse a date-only form value ("2026-11-05") at 12:00 UTC so the calendar
 * day never shifts when displayed in Asia/Manila.
 */
const parseDateOnly = (value) => {
    if (!value) return null;

    if (/^\d{4}-\d{2}-\d{2}$/.test(String(value))) {
        const parsed = new Date(`${value}T12:00:00.000Z`);
        return Number.isNaN(parsed.getTime()) ? null : parsed;
    }

    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
};

/**
 * Combine a date + time form value. Missing time defaults to 09:00 UTC.
 */
const parseDateTime = (date, time) => {
    if (!date) return null;

    const safeTime = time && /^\d{2}:\d{2}$/.test(String(time))
        ? String(time)
        : "09:00";

    const parsed = new Date(`${date}T${safeTime}:00.000Z`);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
};

/**
 * Calendar-day comparison: a date-only value parsed at 12:00 UTC is not
 * "future" just because the current time is earlier that same day.
 */
const isFutureDate = (value) => {
    if (!value) return false;

    const date = value instanceof Date ? value : new Date(value);

    if (Number.isNaN(date.getTime())) return false;

    const startOfDay = (input) =>
        Date.UTC(
            input.getUTCFullYear(),
            input.getUTCMonth(),
            input.getUTCDate()
        );

    return startOfDay(date) > startOfDay(new Date());
};

module.exports = {
    escapeRegExp,
    searchRegExp,
    parseDateOnly,
    parseDateTime,
    isFutureDate
};
