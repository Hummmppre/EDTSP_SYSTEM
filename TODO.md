# EDTSP — TODO

Prioritized from the codebase review. Each item names the file(s) involved and the
condition for calling it done.

## P0 — broken or unsafe right now

- [ ] **Add the missing `frontend/js/portal.js`.**
  Seven pages load it and 404 (`trainee/*.html`, `admin/dashboard.html`,
  `admin/trainees.html`).
  - Done when the drawer open/close, scrim, `aria-expanded`, and desktop collapse
    all work from one shared script.

- [ ] **Reconcile the sidebar class contract.**
  `portal.css` uses `.shell.is-open` / `.shell.is-collapsed`; `dashboard.js`
  toggles `sidebar.show` and `admin.js` toggles `sidebar-collapsed` on
  `.dashboard-container`.
  - Done when markup, CSS, and JS agree on one set of class names on every
    portal page.

- [ ] **Untrack and rotate `backend/.env`.**
  The file is committed even though `.gitignore:8` matches it.
  - Done when it is removed from the index, secrets are rotated, history is
    clean (or the exposure is documented), and `.env.example` exists with
    `MONGODB_URI`, `JWT_SECRET`, `PORT`.

- [ ] **Wire `frontend/js/admin-assessments.js` to the real API.**
  It currently `alert()`s "frontend demonstration".
  - Done when the modal loads trainees from `GET /api/assessments/trainees` and
    submits their Mongo `_id`s to `POST /api/assessments`.
  - Remove or model the `assessmentType` / `assessmentDueDate` inputs, which
    have no matching fields in `backend/models/Assessment.js`.
  - Fix the typo `for="assessmen   tDueDate"` in `admin/assessments.html`.
  - Replace the hardcoded four-name checkbox list with the fetched trainees.

- [ ] **Load and grade assessments in the admin table.**
  `getAllAssessments` and `gradeAssessment` are unreached from the UI.
  - Done when the table is populated from the API and a row action opens a
    grading form that calls `PUT /api/assessments/:id/grade`.

- [ ] **Re-check account status on every request.**
  `protect` trusts role and status from the JWT only, so a deactivated trainee
  keeps access for up to 1 day.
  - Done when `authMiddleware.js` loads the user (or at least status/role) from
    the database and rejects inactive accounts.

## P1 — promised by the UI, missing in the backend

- [ ] **Trainee management API and page.**
  - Add admin endpoints to list all trainees (with profile), assign `traineeId`,
    set `program` / `enrollmentStatus`, and activate/deactivate.
  - Replace the static rows in `frontend/admin/trainees.html` with that data.
  - Add the missing `admin-trainees.js`: the search box and status filter
    currently have no handler at all.
  - Done when search, filter, empty state, and status changes all hit the API.

- [ ] **Admin dashboard metrics.**
  `frontend/admin/dashboard.html` hardcodes 24 / 18 / 32 / 12 and three invented
  assessment rows.
  - Add a summary endpoint (counts + recent assessments).
  - Done when every ledger value and the recent-assessments table come from it.

- [ ] **Trainee dashboard metrics.**
  Balance, module count, average, and care tasks are static copy and the
  86/100 conflicts with the average the assessments page computes.
  - Done when the ledger is populated from assessment/profile/fee data, or the
    whole block is explicitly demo-tagged and consistent.

- [ ] **Payments module.**
  No model, controller, or route exists; `admin-payments.js` and the trainee
  payments page are demo only.
  - Add `Payment` model + routes (record, list, verify, balance).
  - Wire both portals; remove the `alert()` demo path.

- [ ] **Cow maintenance module.**
  No model, controller, or route; `admin-cow.js` inserts DOM rows that vanish on
  refresh.
  - Add `Cow` and `MaintenanceActivity` models + routes.
  - Wire both portals; persist adds and status changes.

- [ ] **Profile editing UI.**
  `PUT /api/trainee/me` accepts `phone` / `address` but nothing calls it.
  - Done when `trainee/profile.html` has an editing form with inline
    validation and a success/error state, and the page shows the real account
    status instead of a hardcoded "Active".

- [ ] **Account management.**
  - Change password, forgot/reset password, email verification.
  - Token revocation or refresh so logout/deactivation actually ends a session.

- [ ] **Pagination and server-side filtering.**
  `getAllAssessments` and `getAllTrainees` return the full collection.
  - Done when list endpoints accept page/limit/search and the tables use them.

## P2 — correctness and production hardening

- [ ] **Fix partial batch writes in `createAssessment`.**
  `insertMany(..., { ordered: false })` hits the unique `(user, assessmentTitle)`
  index; one duplicate returns a generic 500 even though the rest were saved.
  - Done when duplicates are pre-checked (or the bulk error is parsed) and the
    response reports created vs. skipped.

- [ ] **Make `/api/health` truthful.**
  It hardcodes `database: "Connected"`; report real `mongoose.connection.readyState`
  and drop the `MONGODB_URI exists` boot log in `server.js`.

- [ ] **Remove debug logging from `authMiddleware.js`.**
  It logs auth-header presence on every protected request.

- [ ] **Add production middleware.**
  `helmet`, rate limiting on `/api/auth/*`, a JSON body-size cap, centralized
  error handling, an API 404 handler, and an explicit CORS origin allowlist
  instead of `cors()`.

- [ ] **Remove the DNS monkey-patch in `backend/config/db.js`.**
  It overrides `dns.promises.resolveSrv` with Google DNS for every environment.

- [ ] **Make the API origin configurable.**
  `http://localhost:5000` is hardcoded in `auth.js`, `dashboard.js`, and
  `assessments.js`; any HTTPS deployment breaks on mixed content.
  - Done when a single config value (or relative `/api` with a dev proxy)
    drives all three.

- [ ] **Fix the unstyled assessments page.**
  `assessments.js` emits `.progress-item` / `.assessment-result` /
  `.assessment-score`, which exist only in `dashboard.css` — and no page links
  `dashboard.css`. `trainee/assessments.html` loads `portal.css`.
  - Done when those classes are in `portal.css` (or the JS uses portal classes).

- [ ] **Unify the two design systems.**
  `admin/assessments.html`, `payments.html`, `cow-maintenance.html` use the
  legacy `admin.css` shell; `admin/dashboard.html` and `trainees.html` use the
  portal shell.
  - Done when all admin pages use the portal shell and the emoji/glyph buttons
    (`☰`, `&times;`, `+`) are replaced with the SVG set, per `DESIGN.md`.

- [ ] **Replace `alert()` / `confirm()` with inline states.**
  ~21 alerts across `auth.js` and `admin-*.js`, plus a logout `confirm()`,
  contradict `DESIGN.md`'s "every state names the cause and the next action."
  - Done when forms show field-level errors and an inline message region.

- [ ] **Modal accessibility.**
  Add `role="dialog"`, `aria-modal`, focus trap, Escape to close, and focus
  return for the assessment, payment, cow, and activity modals.
  - Also label the unlabeled inputs/selects on the legacy admin pages.

- [ ] **Share the session guard.**
  Auth/role/token handling is duplicated in `dashboard.js`, `admin.js`, and
  `assessments.js`; expiry is only caught reactively.
  - Done when one module handles token presence, expiry, role, and 401 redirect.

## Repo and process

- [ ] **Fix `README.md`.**
  It still contains literal merge-conflict markers (`<<<<<<< HEAD` …
  `>>>>>>> 592610a`) in HEAD despite commit `01f00f1`.
  - Done when it documents setup, env vars, scripts, and the API surface.

- [ ] **Add tests.**
  Zero test files; both `package.json` test scripts are `exit 1` placeholders.
  - Start with auth (signup/login/role guard) and assessment create/grade.

- [ ] **Add linting and CI.**
  No ESLint config and no `.github/workflows`.

- [ ] **Clean up the root package.**
  Root `package.json` duplicates every backend dependency and points `main` at a
  nonexistent `index.js`; root `node_modules` has 126 unused packages.
  - Done when the root only delegates scripts and the app owns its dependencies.

- [ ] **Add non-interactive seeding.**
  `backend/scripts/createAdmin.js` is prompt-only with no arguments.
  - Done when an admin can be created from flags/env and a demo dataset can be
    seeded for local development.

- [ ] **Add deployment config.**
  No Dockerfile, Procfile, or host config; no documented build step for the
  static frontend.

- [ ] **Repo files.**
  Add `LICENSE`, `CONTRIBUTING.md`, and optionally `CHANGELOG.md`.

## Cleanup

- [ ] Delete or use `frontend/css/landing.css` and `responsive.css` (0 bytes,
  linked from no page) and decide the fate of `dashboard.css` (730 lines,
  linked from no page).
