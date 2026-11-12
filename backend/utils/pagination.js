const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;

/**
 * Normalise page/limit query values into a skip/limit/page triple.
 */
const getPagination = (query = {}, fallbackLimit = DEFAULT_LIMIT) => {
    const rawPage = Number.parseInt(query.page, 10);
    const rawLimit = Number.parseInt(query.limit, 10);

    const page = Number.isFinite(rawPage) && rawPage > 0 ? rawPage : 1;

    let limit = Number.isFinite(rawLimit) && rawLimit > 0
        ? rawLimit
        : fallbackLimit;

    limit = Math.min(Math.max(limit, 1), MAX_LIMIT);

    return {
        page,
        limit,
        skip: (page - 1) * limit
    };
};

const paginationMeta = (total, { page, limit }) => {
    const safeTotal = Number(total) || 0;

    return {
        total: safeTotal,
        page,
        pages: Math.max(Math.ceil(safeTotal / limit), 1),
        limit
    };
};

module.exports = {
    DEFAULT_LIMIT,
    MAX_LIMIT,
    getPagination,
    paginationMeta
};
