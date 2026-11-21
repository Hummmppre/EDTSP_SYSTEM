const IntegrationAudit = require("../models/IntegrationAudit");
const { isCard } = require("./integrations/catalog");

const ACTIONS = new Set(["test", "save", "clear"]);
const OUTCOMES = new Set(["success", "failure"]);

function bounded(value, max) {
  return String(value === undefined || value === null ? "" : value)
    .trim()
    .slice(0, max);
}

// Audit writes are best-effort: a logging failure must never fail the
// credential operation that triggered it.
async function recordAudit({ card, action, outcome, code, admin, ip }) {
  if (
    !isCard(card) ||
    !ACTIONS.has(action) ||
    !OUTCOMES.has(outcome) ||
    !admin ||
    !admin.id
  ) {
    return false;
  }

  try {
    await IntegrationAudit.create({
      integration: card,
      action,
      outcome,
      code: bounded(code || "unknown", 64),
      adminId: admin.id,
      adminEmail: bounded(admin.email || "unknown", 254),
      ip: bounded(ip || "", 64),
    });

    return true;
  } catch (error) {
    console.error(`[integration-audit] Could not record ${action}: ${error.message}`);

    return false;
  }
}

module.exports = { recordAudit };
