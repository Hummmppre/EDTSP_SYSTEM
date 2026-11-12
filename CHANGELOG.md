# Changelog

## Unreleased

### Added
- Program model with per-program fees, plus a Programs admin page.
- Payment model, trainee submission flow, admin verification/rejection, and fee ledger.
- Cow and MaintenanceActivity models with trainee assignments and an admin care schedule.
- Admin trainee management: trainee IDs, program assignment, activation/deactivation.
- Account management: change password, forgot/reset password with single-use tokens,
  and token-version session revocation.
- Server-side pagination, search, and filtering on every large table.
- Shared frontend modules: `api.js`, `session.js`, `portal.js`, `ui.js`, `upload.js`.
- `node:test` suite, ESLint flat config, CI workflow, Docker deployment files.
- Guarded demo seed and non-interactive admin creation.

### Changed
- Express serves the frontend, so all client calls use relative `/api` paths.
- Assessments gained `assessmentType` and `dueDate`; status is `Pending` or `Graded`.
- One sidebar contract: `.shell.is-open` / `.shell.is-collapsed`.
- Every admin page uses the portal shell; demo tags removed.

### Fixed
- Missing `frontend/js/portal.js` (404 on seven pages).
- Batch assessment creation reports created vs skipped instead of failing with 500.
- `/api/health` reports the real database state.
- Trainee assessments page no longer depends on unlinked `dashboard.css`.
- `alert()` / `confirm()` replaced with inline states and an accessible dialog.
- README merge-conflict markers removed.

### Security
- Deactivated accounts and logged-out tokens are rejected on the next request.
- Helmet, rate limiting, body cap, CORS allowlist, JSON 404s, and a central error handler.
- DNS monkey-patch removed.
- `backend/.env` untracked; rotate the exposed Atlas password and `JWT_SECRET`.
