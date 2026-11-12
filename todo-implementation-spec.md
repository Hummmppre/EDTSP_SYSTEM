# TODO.md Implementation Spec — EDTSP (Esperon Dairy Training Student Portal)

Status: draft for approval. No application code has been changed yet.
Source request: "implement @TODO.md".
Spec scope: **every item in TODO.md** — P0, P1, P2, repo/process, and cleanup — delivered in ordered phases.

---

## 1. Summary

TODO.md is a review backlog for a small Express 5 + Mongoose + vanilla-JS portal. The
application currently has working authentication, a trainee profile endpoint, and
assessment create/list/grade endpoints, but:

- one shared script (`frontend/js/portal.js`) is loaded by seven pages and 404s;
- the sidebar has three conflicting class contracts;
- a real `.env` with live credentials is committed;
- two entire modules (payments, cow maintenance) exist only as DOM/`alert()` demos;
- the admin assessments page never calls the API and has no grading UI;
- everything runs on hardcoded `http://localhost:5000` and static/demo figures.

This spec converts all of that into a single-origin Express app with a real API behind
every page, consistent portal UI, hardened middleware, tests, lint/CI, deployment files,
and a cleaned repo.

### Interview decisions (locked)

| # | Topic | Decision |
| --- | --- | --- |
| 1 | Scope | Everything in TODO.md (all phases below) |
| 2 | `.env` history | `git rm --cached` + `.env.example` + document exposure. **No history rewrite, no force-push.** |
| 3 | Database | Live MongoDB Atlas URI in `backend/.env` is available for verification |
| 4 | API origin | Express serves `frontend/`; all client code calls relative `/api` |
| 5 | Fee model | `Program` model with `totalFee`; admin manages programs on a dedicated page |
| 6 | Payment flow | Trainee submits payment (Pending) → admin verifies or rejects |
| 7 | Cow ↔ trainee | Many trainees per cow (`assignedTrainees[]`) |
| 8 | Activity status | Admin only; trainee portal is read-only for activities |
| 9 | Programs UI | Dedicated `admin/programs.html` page and sidebar entry |
| 10 | Payment proof | Reference text + optional receipt image upload via **UploadThing** |
| 11 | Account management | Change password + forgot/reset via single-use token (dev returns link, no email provider) |
| 12 | Session invalidation | `tokenVersion` on `User`, checked in `protect` on every request |
| 13 | Tests | `node:test` + `supertest` + `mongodb-memory-server` |
| 14 | Seeding | Guarded demo seed (`--demo`), safe against Atlas, demo records identified by domain |
| 15 | Assessment fields | Model both `assessmentType` and `dueDate` |
| 16 | Assessment lifecycle | `Pending → Graded` only; drop `Completed` |
| 17 | Batch duplicates | Pre-check, create the rest, report created vs skipped |
| 18 | Legacy admin pages | Full rewrite onto the portal shell (markup, classes, SVG icons) |
| 19 | Pagination | Server-side, 25 rows default, Previous/Next + page count, search resets to page 1 |
| 20 | Deployment | `Dockerfile` + `docker-compose.yml`, host-agnostic |
| 21 | Receipt storage | UploadThing (remote object storage; no local disk, no GridFS) |
| 22 | Error UI | Field-level errors + one inline `.state` region; no toast layer |
| 23 | Sidebar state | Per-page only (no localStorage persistence) |
| 24 | Demo tags | Remove all "Demo data" tags once pages are live |
| 25 | Dead CSS | Delete `landing.css` and `responsive.css` (0 bytes); keep `dashboard.css` as reference for now |
| 26 | Lint/CI | ESLint flat config + GitHub Actions (lint + tests) |
| 27 | Root package | Delegate scripts + fix `main`; **do not delete** root `node_modules`/lockfile by hand |

### Security note carried into the plan

The UploadThing token was shared in plain text during the interview. Treat it as
exposed: rotate it in the UploadThing dashboard before wiring uploads, and never write
it into a tracked file. It belongs only in `backend/.env` (gitignored) and
`backend/.env.example` gets the placeholder `UPLOADTHING_TOKEN=`.

The committed `backend/.env` (MongoDB URI + JWT secret) must be rotated for the same
reason; the chosen handling is untrack + document, not history rewrite.

---

## 2. Current state (verified)

### Backend

| File | State |
| --- | --- |
| `server.js` | `cors()` wide open, no helmet/limits/error handler/404, serves no static files, logs `MONGODB_URI exists`, health hardcodes `"Connected"` |
| `config/db.js` | Monkey-patches `dns.promises.resolveSrv` to Google DNS globally; `process.exit(1)` on failure |
| `middleware/authMiddleware.js` | Trusts JWT role/status; three `console.log` calls; no DB lookup |
| `models/User.js` | `firstName`, `lastName`, `email` (unique), `password`, `role`, `status`; no version, no reset fields |
| `models/TraineeProfile.js` | `user` (unique), `traineeId` (unique/sparse), `program` **String**, `enrollmentStatus`, `phone`, `address` |
| `models/Assessment.js` | `user`, `assessmentTitle`, `subject`, `score`, `totalScore`, `status` (Pending/Completed/Graded), `assessmentDate`, `remarks`; unique `(user, assessmentTitle)` |
| `controllers/*` | All list endpoints return the full collection; `insertMany(..., {ordered:false})` 500s on one duplicate; `getAllTrainees` returns active only, no profile |
| `scripts/createAdmin.js` | Prompt-only, no flags/env |
| `.env` | **Tracked** (`.gitignore:8` matches it), currently modified in the working tree |

### Frontend

| Area | State |
| --- | --- |
| `portal.css` | Defines the real contract: `.shell.is-open`, `.shell.is-collapsed`, `.scrim`, `.admin-modal`, `.field`, `.state`, `.data-table`, `.ledger`, `.demo-tag`, `.assessment-list` |
| `dashboard.js` / `admin.js` | Toggle legacy `sidebar.show` / `.sidebar-collapsed` on `.dashboard-container` — never `.shell.is-*` |
| `portal.js` | **Missing** but loaded by `admin/dashboard.html`, `admin/trainees.html`, and five trainee pages |
| `admin/assessments.html` | Legacy `admin.css` shell; static table; broken `for="assessmen   tDueDate"`; four hardcoded trainee checkboxes; unused Type/Due Date inputs |
| `admin/assessments` JS | `alert()` demo; no fetch; no grading |
| `admin/payments.html`, `admin/cow-maintenance.html` | Legacy shell; demo rows; DOM-only inserts; `alert()` views |
| `admin/trainees.html` | Portal shell; static rows; `traineeSearch`/`statusFilter` have no JS |
| `admin/dashboard.html` | Portal shell; hardcoded 24/18/32/12 + three invented rows |
| `trainee/dashboard.html` | Static balance/modules/average/care figures; hardcoded "Active" status |
| `trainee/profile.html` | Read-only; no phone/address form; hardcoded "Active" |
| `trainee/assessments.html` | Live data, but `assessments.js` emits `.progress-item`/`.assessment-result`/`.assessment-score`, which exist only in unreferenced `dashboard.css` |
| `trainee/payments.html`, `trainee/cow-maintenance.html` | Fully static demo pages |
| `auth.js`, `admin-*.js` | ~21 `alert()`/`confirm()` calls |
| `auth.js`, `dashboard.js`, `assessments.js` | Hardcode `http://localhost:5000`; each re-implements token/role/401 handling |
| `index.html` | Uses `☰`/`✕` glyphs in `main.js` |

---

## 3. Target architecture

```
Browser ── same origin ──> Express (5000)
  static frontend/  <── express.static
  /api/auth/*          authController (+ reset token, tokenVersion)
  /api/trainee/*       profile, own payments, own cows/activities
  /api/assessments/*   trainee list + admin list/create/grade/trainees
  /api/admin/*         trainees, programs, payments, cows, activities, summary
  /api/uploadthing     UploadThing route handler (receipts)
  /api/health          real mongoose readyState
                              │
                              └──> MongoDB Atlas
                              └──> UploadThing (receipt images)
```

- Frontend is served by Express, so `/api` is relative everywhere. No hardcoded host,
  no mixed content, no CORS in production unless `CORS_ORIGINS` is set.
- One API module, one session module, one portal-shell module, one UI helper module.
- All admin list endpoints are paginated/filterable server-side; the tables render
  `Previous / Page x of y / Next`.

### Shared response contracts

List success (keeps existing resource keys so current consumers keep working):

```json
{
  "success": true,
  "count": 25,
  "total": 132,
  "page": 2,
  "pages": 6,
  "limit": 25,
  "assessments": []
}
```

Resource key is one of `trainees | programs | payments | cows | activities | assessments`.

Error:

```json
{ "success": false, "message": "Human-readable cause.", "field": "email", "code": "DUPLICATE_EMAIL" }
```

`field`/`code` are optional. HTTP status carries the class of error (400 validation,
401 session, 403 role/status, 404 missing, 409 conflict, 429 rate limit, 500 unknown).

---

## 4. Phased delivery

Each phase ends in a runnable app and is independently verifiable. Phases 1–2 are the
P0/P1 work; 3–5 are P2/repo/cleanup.

| Phase | Contents | Depends on |
| --- | --- | --- |
| 0 | Repo/env hygiene, static serving, API/session/portal modules, sidebar contract, README skeleton | — |
| 1 | P0: portal.js, sidebar classes, assessment admin wiring + grading, auth status re-check | 0 |
| 2 | P1: programs, trainee management, payments + UploadThing, cows/activities, dashboards, profile editing, account management, pagination | 0–1 |
| 3 | P2: batch duplicates, health, logging, middleware, DNS, design unification, alerts, modal a11y | 0–2 |
| 4 | Tests, ESLint, CI, root package, seeding, deployment | 0–3 |
| 5 | Cleanup, README/API docs, LICENSE/CONTRIBUTING/CHANGELOG, final audit | 0–4 |

Migrations must run before Phase 2 pages are exercised against Atlas (see §10).

---

## 5. Backend specification

### 5.1 Models

**User (modify)**

| Field | Type | Notes |
| --- | --- | --- |
| `tokenVersion` | Number, default 0 | Compare with `decoded.tokenVersion`; mismatch → 401 |
| `resetPasswordToken` | String, `select: false` | SHA-256 hash of the emailed/returned token |
| `resetPasswordExpires` | Date, `select: false` | 30 minutes after issue |

Unchanged: `firstName`, `lastName`, `email` (unique, lowercase), `password` (bcrypt cost
12), `role` (`trainee|admin`), `status` (`active|inactive`), timestamps.

**TraineeProfile (modify)**

| Field | Type | Notes |
| --- | --- | --- |
| `program` | ObjectId → `Program` | Replaces the current String. Nullable during migration. |
| `traineeId` | String, unique sparse | Assigned by admin; format `EDT-YYYY-NNN` |
| `enrollmentStatus` | enum | `Pending`, `Ongoing`, `Completed`, `Inactive` (unchanged) |
| `phone`, `address` | String | Trainee-editable (unchanged) |

Read responses include `program` populated as `{ _id, name, code, totalFee }`, with a
fallback `programName` string for records not yet migrated.

**Program (new)**

| Field | Type | Rules |
| --- | --- | --- |
| `name` | String | required, unique, trim |
| `code` | String | required, unique, uppercase, e.g. `DAIRY` |
| `totalFee` | Number | required, min 0, default 18000 |
| `description` | String | optional |
| `active` | Boolean | default true; inactive programs cannot be assigned |

**Payment (new)**

| Field | Type | Rules |
| --- | --- | --- |
| `user` | ObjectId → User | required, indexed |
| `program` | ObjectId → Program | snapshot at submission time |
| `amount` | Number | required, > 0 |
| `paymentDate` | Date | required, not in the future |
| `method` | enum | `Cash`, `Bank Transfer`, `GCash`, `Other` |
| `reference` | String | optional payer reference |
| `receiptUrl` | String | UploadThing file URL (optional) |
| `receiptKey` | String | UploadThing key, used to delete the file on reject |
| `status` | enum | `Pending`, `Verified`, `Rejected` (default `Pending`) |
| `paymentRef` | String | unique, server-generated `EDT-PAY-000123` |
| `remarks` | String | admin note, also used for rejection reason |
| `verifiedBy` | ObjectId → User | set on verify/reject |
| `verifiedAt` | Date | set on verify/reject |

Indexes: `{ user: 1, status: 1 }`, `{ status: 1, createdAt: -1 }`, unique `paymentRef`.

`paymentRef` comes from an atomic `Counter` collection (`$inc`) with one retry on a
duplicate-key error.

**Cow (new)**

| Field | Type | Rules |
| --- | --- | --- |
| `cowId` | String | required, unique, uppercase, `COW-NNN` |
| `name` | String | required |
| `breed` | String | optional |
| `ageYears` | Number | min 0, max 30 |
| `healthStatus` | enum | `Healthy`, `Under Observation`, `Under Treatment` |
| `assignedTrainees` | [ObjectId → User] | many trainees allowed; empty = unassigned |
| `notes` | String | optional |

**MaintenanceActivity (new)**

| Field | Type | Rules |
| --- | --- | --- |
| `cow` | ObjectId → Cow | required |
| `type` | enum | `Feeding`, `Drinking`, `Medication`, `General`, `Other` |
| `description` | String | required |
| `scheduledAt` | Date | required (date + time) |
| `assignedTrainees` | [ObjectId → User] | default: cow's assignments if omitted |
| `status` | enum | `Pending`, `Completed` (default `Pending`) |
| `completedAt`, `completedBy` | Date, ObjectId | set on completion |
| `createdBy` | ObjectId → User | admin |

Index: `{ scheduledAt: -1 }`, `{ cow: 1, scheduledAt: -1 }`.

**Assessment (modify)**

Add:

| Field | Type | Rules |
| --- | --- | --- |
| `assessmentType` | enum | `Written`, `Practical`, `Oral`, `Performance`; required, default `Written` |
| `dueDate` | Date | nullable |

Change `status` enum to `["Pending", "Graded"]` only. Keep the unique
`(user, assessmentTitle)` index and all existing fields.

### 5.2 Middleware and app wiring

**`authMiddleware.js`**

- Async `protect`: read `Bearer` token → `jwt.verify` → load
  `User.findById(decoded.id).select("role status tokenVersion")`.
- Missing user → 401 `INVALID_SESSION`.
- `decoded.tokenVersion !== user.tokenVersion` → 401 `SESSION_REVOKED`.
- `user.status !== "active"` → 403 `ACCOUNT_INACTIVE`.
- Attach `req.user = { id, role, status }`; `traineeOnly`/`adminOnly` unchanged in
  behaviour (403 with existing messages).
- No `console.log`.

**`server.js`**

Order: security → parsers → API routes → UploadThing → health → API 404 → static →
SPA fallback → error handler.

- `helmet()` with CSP: `default-src 'self'`; `script-src 'self'`;
  `style-src 'self' 'unsafe-inline'` (pages set meter widths inline);
  `img-src 'self' data: https://*.ufs.sh https://utfs.io`;
  `connect-src 'self' https://*.ingest.uploadthing.com https://utfs.io`;
  `font-src 'self'`.
- `cors()` replaced by an allowlist from `CORS_ORIGINS` (comma-separated). When unset,
  no CORS headers are sent (same-origin app).
- `express.json({ limit: "100kb" })`.
- Rate limits (disabled when `NODE_ENV === "test"`):
  - `/api/auth/login`, `/api/auth/signup`, `/api/auth/forgot-password`: 20 / 15 min / IP
  - `/api/auth/forgot-password`, `/api/auth/reset-password`: additionally 5 / hour / IP
  - global `/api`: 300 / 15 min / IP
- Static: `express.static(path.join(__dirname, "../frontend"), { extensions: ["html"] })`
  and `GET /` → `frontend/index.html`.
- API 404 handler for unmatched `/api/*` → 404 JSON.
- Centralized `errorHandler`: maps duplicate-key (409), `ValidationError` (400 with first
  field), `CastError` (400), JWT errors (401), everything else (500 with generic
  message, server-side log).
- Remove the `MONGODB_URI exists` boot log.

**`/api/health`**

```json
{ "success": true, "message": "EDTSP Backend API is running!", "database": "Connected", "uptime": 1234 }
```

`database` maps `mongoose.connection.readyState`:
`0 Uninitialized | 1 Connected | 2 Connecting | 3 Disconnecting`. Returns 503 when not
`1`.

**`config/db.js`**

Remove the `dns.promises.resolveSrv` monkey-patch. Keep connect + error logging. On
failure, log the message and exit 1 (unchanged). README documents that SRV lookups use
the host resolver and how to supply a non-SRV URI if a network blocks SRV.

### 5.3 API surface

All routes except auth and health require `protect`. "Admin" = `protect, adminOnly`;
"Trainee" = `protect, traineeOnly`.

#### Auth — `/api/auth`

| Method | Path | Access | Body / query | Behaviour |
| --- | --- | --- | --- | --- |
| POST | `/signup` | public | `firstName, lastName, email, password` | Existing validation; creates User (trainee). Creates the TraineeProfile with `enrollmentStatus: "Pending"` in the same flow. |
| POST | `/login` | public | `email, password` | Existing behaviour + `tokenVersion` in JWT payload; response unchanged otherwise |
| GET | `/me` | any | — | Fresh `user` (no password) + `profile` (populated program); used by the session guard |
| POST | `/logout` | any | — | `$inc tokenVersion`; 200 |
| POST | `/change-password` | any | `currentPassword, newPassword` | Verify current, min 8, must differ; bcrypt rehash; bump `tokenVersion`; return a **new token** so the current session survives |
| POST | `/forgot-password` | public | `email` | Always 200 generic message. If user exists: issue 32-byte token, store SHA-256 + 30 min expiry. Non-production response also returns `resetToken` (documented dev affordance); production logs nothing. Rate-limited 5/hour. |
| POST | `/reset-password` | public | `token, newPassword` | Look up by hash, check expiry, set password, clear token fields, bump `tokenVersion` |

JWT payload: `{ id, role, tokenVersion }`, expiry 1 day.

#### Trainee — `/api/trainee`

| Method | Path | Body / query | Behaviour |
| --- | --- | --- | --- |
| GET | `/me` | — | Unchanged shape; `profile.program` populated |
| PUT | `/me` | `phone, address` | Unchanged allowlist; trims; validates phone format loosely (`^[0-9+()\-\s]{7,20}$` or empty) |
| GET | `/payments` | — | Own payments (newest first) + `summary: { program, totalFee, paid, balance, status }` where `paid` sums **Verified** only and `status` is `Unpaid | Partial | Fully Paid` |
| POST | `/payments` | `amount, paymentDate, method, reference?, receiptUrl?, receiptKey?` | Validates; rejects amount > current balance (`AMOUNT_EXCEEDS_BALANCE`); creates `Pending` with program snapshot |
| GET | `/cows` | — | Cows where `assignedTrainees` contains the caller, each with the caller's activity counts |
| GET | `/activities` | `from?, to?` | Activities assigned to the caller (read-only), newest first |

#### Assessments — `/api/assessments`

| Method | Path | Access | Behaviour |
| --- | --- | --- | --- |
| GET | `/me` | Trainee | Unchanged; own assessments dated desc |
| GET | `/trainees` | Admin | Paginated/searchable active trainees for the create modal: `page, limit=50, search`; returns `trainees` with `_id, firstName, lastName, email, traineeId?` |
| GET | `/` | Admin | Paginated list: `page, limit=25, search` (title/subject/trainee name/email), `status` filter; populate `user` name/email; includes `totalScore`, `score`, dates, type |
| POST | `/` | Admin | `traineeIds[], assessmentTitle, subject, assessmentType, totalScore, assessmentDate?, dueDate?, remarks?`. Validate ids exist/active/trainee; pre-check existing `(user, title)`; `insertMany` the remainder; also catch E11000 as skipped. Response: `created[]`, `skipped[{ user, name }]`, counts, message. No 500 on partial duplicates. |
| PUT | `/:id/grade` | Admin | `score, remarks?`; score 0..totalScore; sets `status: "Graded"`; 404 if missing |

#### Admin — `/api/admin`

| Method | Path | Body / query | Behaviour |
| --- | --- | --- | --- |
| GET | `/summary` | — | See §5.4 |
| GET | `/trainees` | `page, limit=25, search, status, program` | All trainee accounts with profile: name, email, account status, traineeId, program, enrollmentStatus, joined date, balance |
| PATCH | `/trainees/:userId` | `traineeId?, program?, enrollmentStatus?, status?` | Validate role is trainee. Unique `traineeId` → 409. Setting `status: "inactive"` bumps `tokenVersion` (immediate session end); setting active does not restore old sessions. |
| GET | `/programs` | `page, limit, search, active` | Paginated with trainee counts |
| POST | `/programs` | `name, code, totalFee, description?, active?` | Unique name/code |
| PATCH | `/programs/:id` | same fields | Fee changes affect balances immediately (documented in UI copy) |
| DELETE | `/programs/:id` | — | 409 `PROGRAM_IN_USE` if any profile references it |
| GET | `/payments` | `page, limit=25, search, status` | All payments with trainee + program, newest first |
| POST | `/payments` | `userId, amount, paymentDate, method, reference?, remarks?` | Admin-recorded payment, `Pending` by default; can pass `status: "Verified"` to record-and-verify in one step |
| PUT | `/payments/:id/verify` | `remarks?` | Pending → Verified; sets `verifiedBy/verifiedAt`; 409 if already decided |
| PUT | `/payments/:id/reject` | `remarks` (required) | Pending → Rejected; deletes the UploadThing file when `receiptKey` exists |
| GET | `/cows` | `page, limit=25, search, health` | Cows with assigned trainee names |
| POST | `/cows` | `cowId, name, breed?, ageYears?, healthStatus?, assignedTrainees?, notes?` | Unique `cowId` |
| PATCH | `/cows/:id` | any cow field | Health/assignment edits persist |
| GET | `/activities` | `page, limit=25, search, type, status, cow` | Activities with cow + trainee names |
| POST | `/activities` | `cow, type, description, scheduledAt, assignedTrainees?` | Cow must exist; default assignments = cow's |
| PATCH | `/activities/:id` | `type?, description?, scheduledAt?, assignedTrainees?` | Edits |
| PUT | `/activities/:id/status` | `status` | Admin-only; sets/clears `completedAt`/`completedBy` |
| GET | `/trainees/:userId/payments` | — | Optional: per-trainee payment drawer detail |

### 5.4 Admin summary payload

```json
{
  "success": true,
  "summary": {
    "totalTrainees": 0, "activeTrainees": 0, "pendingEnrolment": 0, "completedTraining": 0,
    "totalAssessments": 0, "pendingAssessments": 0, "gradedAssessments": 0, "averageScore": 0,
    "totalCows": 0, "activitiesPending": 0,
    "collected": 0, "outstanding": 0, "paymentsPending": 0
  },
  "recentAssessments": [ { "assessmentTitle": "", "user": {}, "score": null, "totalScore": 100, "status": "Pending", "createdAt": "" } ]
}
```

`averageScore` = mean of `score/totalScore*100` over graded assessments with a score,
rounded to 1 decimal; `0` when none. `outstanding` = sum over trainees of
`max(program.totalFee − verified payments, 0)`.

### 5.5 Pagination, search, dates, money

- `backend/utils/pagination.js`: `page` ≥ 1, `limit` 1–100 (default 25), returns
  `{ skip, limit, page }` and a `meta(total)` helper.
- Search: case-insensitive `RegExp` on escaped input; name/email/traineeId/title/subject
  as applicable.
- Dates stored as UTC. Date-only form values are parsed at 12:00 UTC to avoid
  day-shift, displayed with `Intl.DateTimeFormat("en-PH", { timeZone: "Asia/Manila" })`.
- Money is stored as a `Number` in PHP. Display via
  `Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" })` (`₱`), 2 decimals.
- Overpayment (trainee and admin record) is rejected with `AMOUNT_EXCEEDS_BALANCE` and
  the current balance in the message. Documented assumption.

---

## 6. UploadThing integration (receipts)

Install `uploadthing` in `backend` (no React package needed — frontend is vanilla).

- `backend/uploadthing/router.js`
  - `createUploadthing()` from `uploadthing/express`.
  - Route `paymentReceipt`: `image: { maxFileSize: "4MB", maxFileCount: 1 }`.
  - `.middleware(...)`: verify the same JWT used by `protect` (passed as header by the
    uploader) and reject non-trainees/admins; attach `userId` to metadata.
  - `.onUploadComplete(...)`: no DB write; return `{ uploadedBy }`.
- `server.js`: `app.use("/api/uploadthing", createRouteHandler({ router: uploadRouter }))`
  before the API 404 handler.
- Frontend: `frontend/js/upload.js` uses `genUploader` from `uploadthing/client` with
  `url: "/api/uploadthing"`; exposes `uploadReceipt(file)` returning
  `{ url, key }`. Used only by the trainee payment form.
- CSP `connect-src` and `img-src` must include the UploadThing origins listed in §5.2.
- Reject flow deletes the object with `UTApi` (`deleteFiles(receiptKey)`), guarded by
  `isUploadthingConfigured()` so a missing token never breaks payment verification.
- Token handling: `UPLOADTHING_TOKEN` only in `backend/.env`; rotate before use because
  it was pasted into the interview. `.env.example` carries the empty key. Startup does
  **not** fail when it is unset; the upload route responds 503 with a clear message and
  the form falls back to reference-only submission.

---

## 7. Frontend specification

### 7.1 Shared modules

**`frontend/js/api.js`**

```js
window.EDTSP = window.EDTSP || {};
EDTSP.api = { base: "/api", get, post, put, patch, del };
```

- Adds `Authorization: Bearer <token>` when a token exists, `Content-Type` for JSON.
- Parses JSON safely; throws `{ status, message, field, code }`.
- On 401 or `code === "ACCOUNT_INACTIVE"`: delegate to `EDTSP.session.end()`.

**`frontend/js/session.js`**

- `getToken()`, `getUser()`, `isExpired(token)` (decode JWT `exp` locally),
  `requireRole("admin"|"trainee")` → redirect to `../login.html` when missing/expired/
  wrong role, `end({ reason })` → best-effort `POST /auth/logout`, clear storage, redirect.
- Storage keys remain `edtspToken` / `edtspUser` for continuity.
- One implementation replaces the duplicated guards in `dashboard.js`, `admin.js`,
  `assessments.js`.

**`frontend/js/portal.js`** (the missing file)

- Requires `#shell`, `#sidebar`, `#sidebarToggle` (or `#menuToggle`), `.scrim`.
- Desktop (>1080px): toggle `.is-collapsed` on `#shell`; `aria-expanded` reflects state.
- Mobile (≤1080px): toggle `.is-open` on `#shell`; scrim click and `Escape` close it;
  nav link click closes it; body scroll lock optional via `.modal-open` reuse is **not**
  applied (drawer only).
- On resize across the 1080px boundary, clear both classes to a consistent state.
- Sync `aria-expanded` on open/close and on init.

**`frontend/js/ui.js`**

- `setText(id, value)`, `formatMoney(n)`, `formatDate(v)`, `formatDateTime(v)`.
- `statusBadge(status)` → span with `.status-badge` plus tone class
  (`completed` verified/healthy/completed, `pending` pending/observation, `ongoing`,
  `inactive` rejected/under treatment, `clay` outstanding).
- `state(container, { tone, title, message, action })` for loading/empty/error regions.
- `fieldError(input, message)` / `clearFieldErrors(form)`; one shared `formState(form)`
  region (`.state--inline`, `role="status"`).
- `openModal(modal, { onClose })` / `closeModal(modal)`: `role="dialog"`,
  `aria-modal="true"`, `aria-labelledby`, focus first field, focus trap on Tab,
  `Escape` closes, focus returns to the opener, `.show` class retained for existing CSS.

### 7.2 Shell markup contract

Every portal page gets the same shell (already used by `admin/dashboard.html`,
`admin/trainees.html`, trainee pages):

- `<div class="shell" id="shell">`, `<aside class="sidebar" id="sidebar">`,
  `<div class="scrim" aria-hidden="true">`, toggle button with
  `aria-controls="sidebar" aria-expanded="true"`.
- All toggling is `.shell.is-open` / `.shell.is-collapsed`. Delete every reference to
  `sidebar.show`, `.dashboard-container`, and `sidebar-collapsed`.
- Sidebar state is per page load; no storage key.
- Icons are the existing inline 1.6px SVG set. No `☰`, `✕`, `&times;`, `+` text glyphs
  anywhere (including the landing page and modal close buttons).

### 7.3 Page-by-page

**`frontend/index.html` + `main.js`** — replace the `☰`/`✕` glyph with two inline SVGs
toggled by a class; keep `aria-expanded` honest. No other landing changes.

**`login.html`, `signup.html`, new `forgot-password.html`, new `reset-password.html`**

- Remove all `alert()`; add per-field error slots and a single inline `.auth-message`
  region (styled in `auth.css`).
- Login: disable submit while pending; on success store token/user and redirect by role.
- Signup: keep field validation (names, email shape, password ≥ 8, match).
- Forgot: email field; success copy is generic ("If that email exists, a reset link has
  been created"). In development the returned `resetToken` is rendered as a copyable
  link to `reset-password.html?token=...` (this is the only dev-only affordance).
- Reset: reads `?token=`, new password + confirm, inline result, then links to login.
- Expired/invalid reset token: `.state` with cause and "Request a new link".

**`admin/dashboard.html` + new `admin-dashboard.js`**

- Remove the demo tag.
- Ledger from `GET /api/admin/summary`: total trainees, active trainees, total
  assessments, pending assessments (focus cell). Notes stay human ("Registered
  participants", etc.).
- Recent assessments table from `summary.recentAssessments` (5 rows): title, trainee,
  date, `score/totalScore` or `—`, status badge.
- Loading skeleton state, error state with retry, empty state ("No assessments have been
  assigned yet" + link to assessments).

**`admin/trainees.html` + new `admin-trainees.js`**

- Remove demo tag and static rows.
- Ledger from `/api/admin/summary` (total, active, pending enrolment, completed).
- Table from `GET /api/admin/trainees` with server-side search (300 ms debounce on
  `traineeSearch`) and `statusFilter` (enrollment status) plus account-status filter.
- Columns: trainee ID (mono), name, email, program, enrollment status, account status,
  actions.
- Row action "Manage" opens a modal: assign `traineeId` (pattern `EDT-\d{4}-\d{3}`),
  select program, select enrollment status, activate/deactivate account. Save →
  `PATCH /api/admin/trainees/:userId`; deactivation copy warns that the session ends
  immediately.
- Empty state distinguishes "no trainees yet" from "nothing matches this search/status"
  and offers "Clear filters".
- Pagination controls shared with other tables.

**`admin/programs.html` + new `admin-programs.js`** (new page)

- Portal shell, sidebar entry "Programs" under Records.
- Ledger: programs, active programs, trainees enrolled, total fees configured.
- Table: code (mono), name, fee, trainee count, active, actions.
- "New program" modal: name, code, totalFee, description, active. Edit uses the same
  modal. Delete is disabled with a reason when trainees are assigned.
- Fee edits show a note that balances recalculate immediately.

**`admin/assessments.html` + rewritten `admin-assessments.js`**

- Full portal shell rewrite (no `admin.css`), SVG close icon, correct labels
  (`for="assessmentDueDate"`), Type and Due Date kept and wired to the new fields.
- Ledger from `GET /api/assessments` meta/summary: total, pending, graded, average.
- Table from `GET /api/assessments` (server-side search + status filter + pagination):
  assessment, subject, type, trainee, due/assessment date, score, status, action.
- Create modal: fetch trainees from `GET /api/assessments/trainees` when opened (loading
  state), render checkboxes with real `_id`s, keep "Select all", disable submit while
  pending. On success with skips, show "N created, M skipped" plus the skipped names in
  the inline region; refresh the table.
- Row action "Grade" opens a grading modal: score (number, 0..totalScore), remarks,
  inline validation, `PUT /api/assessments/:id/grade`; updates the row in place and
  refreshes ledger values.
- Empty/error/filtered-to-nothing states; no `alert()`.

**`admin/payments.html` + rewritten `admin-payments.js`**

- Portal shell rewrite.
- Ledger: collected (verified), outstanding, pending verification (focus), payments
  count. Values from `/api/admin/summary` or the payments list meta + a summary block.
- Table from `GET /api/admin/payments` with server-side search + status filter +
  pagination: ref (mono), trainee, program, amount, date, method, reference, receipt
  (link if present), status, actions.
- "Record payment" modal: trainee select from `/api/admin/trainees` (searchable or
  limited to 100 with search), amount, date, method, reference, remarks, optional
  "record as verified" checkbox.
- Pending rows: "Verify" and "Reject" actions. Reject requires a reason in a small
  inline form (no prompt()). Verified/Rejected rows are read-only with verifier + date.
- Empty/error/filtered states; no `alert()`.

**`admin/cow-maintenance.html` + rewritten `admin-cow.js`**

- Portal shell rewrite.
- Cow ledger: cows, healthy, under observation, under treatment.
- Cow table from `/api/admin/cows` (server search + health filter + pagination) with
  COW ID (mono), name, breed, age, assigned trainees, health, actions.
- "Add cow" / "Edit cow" modal: cowId (pattern `COW-\d{3}`), name, breed, age, health,
  trainee multi-select from `/api/admin/trainees`, notes.
- Activity table from `/api/admin/activities` (search + type + status filters +
  pagination): cow, type, description, schedule, assigned trainees, status, actions.
- "Add activity" modal: cow select (from cows), type, description, date + time,
  trainee multi-select defaulting to the cow's assignments.
- Status control is admin-only: a row action flips Pending/Completed via
  `PUT /api/admin/activities/:id/status`.
- Empty/error/filtered states; no `alert()`.

**`trainee/dashboard.html` + `dashboard.js`**

- Remove demo tag. Ledger from real data:
  - Payment balance (fee − verified payments) with "remaining of ₱X" note; focus cell.
  - Assessment average from graded assessments (`x/100`), `—` when none.
  - Cow tasks: `completed/total` for today's assigned activities.
  - Active courses/modules: **replace the invented "03"** with graded/assigned
    assessment counts or the program name; no invented metric.
- Training progress panel: replace static module meters with per-subject progress
  computed from assessments (average score per subject, or pending count when none).
  Empty state when no assessments exist.
- Cow maintenance panel: real assigned cows and today's activities, linking to
  `cow-maintenance.html`; empty state when unassigned.
- Profile panel: name, email, real account status from `GET /trainee/me`.
- Fee panel: total/paid/balance and meter from the payments summary.
- Keep the single `loadTraineeProfile` + one new `loadDashboardData` using
  `Promise.all`, each with its own error row rather than failing the whole page.

**`trainee/profile.html` + new `profile.js` (or extended `dashboard.js`)**

- Remove hardcoded "Active"; show `user.status` (Active/Inactive) and
  `profile.enrollmentStatus` distinctly.
- Add an edit form for `phone` and `address` with:
  - inline field validation (phone pattern, address length ≤ 200),
  - submit disabled while saving,
  - success message with the saved values ("Saved at 10:32 AM"),
  - API error mapped to the field when `field` is present.
- Show the populated program name, trainee ID (or "Not assigned"), and training status.
- Read-only account fields remain (email, role, institution).

**`trainee/assessments.html` + `assessments.js`**

- Remove dependence on `dashboard.css` classes: render `.assessment-list` items using
  portal classes (`.record`, `.record__head`, `.record__meta`, `.status-badge`,
  `.figure`, `.facts`) or add the missing `.assessment-*` rules to `portal.css`.
  Preferred: use portal classes and delete the legacy JS class names.
- Summary values unchanged in meaning (total, completed/graded, pending, average of
  graded percentages).
- Per-record: title, subject, type, dates, status badge, score block when graded,
  remarks. Empty state: "You have no assigned assessments yet."
- Error state names the cause and offers retry.

**`trainee/payments.html` + new `payments.js`**

- Remove demo tag and static ledger/table.
- Ledger from `GET /api/trainee/payments`: total fee, paid (verified), remaining
  (focus), status (Unpaid/Partial/Fully Paid).
- History table: ref (mono), date, description/program, method, amount, status,
  receipt link. Pending rows show "Awaiting verification"; rejected rows show the
  rejection remark.
- "Submit payment" form (new panel): amount, date, method, reference, optional receipt
  upload (UploadThing). Inline validation, upload progress, success state
  ("Payment submitted for verification"), and a clear fallback when uploads are not
  configured. Form hides/disables when balance is 0 with a "fully paid" state.
- Fee progress panel: real percentage, meter, total/paid/balance, and a next-step note.

**`trainee/cow-maintenance.html` + new `cow-maintenance.js`**

- Remove demo tag and static content.
- Ledger from `GET /api/trainee/cows` + `/activities`: assigned animals, completed
  today, pending today (focus), animal status summary.
- Assigned animals list: each cow as a `.plate` with id (mono), name, breed, health
  badge, and its upcoming activities.
- Today's care list from real activities with status badges; read-only (no completion
  controls — admin-only status).
- Empty states: "No animals assigned to you yet" and "No activities scheduled today".
- Keep the explanatory process panel; it is copy, not data.

### 7.4 CSS work

- Add to `portal.css` (already contains `.assessment-list`, `.admin-modal`, `.field`,
  `.state`, `.data-table`, `.ledger`): assessment record layout, receipt link styling,
  pagination bar (`.pager`, `.pager__status`), inline field error text
  (`.field__error`), and upload preview styles.
- `admin.css` becomes unused after the three legacy pages migrate. Keep the file only
  until Phase 5; it is not linked from any page at the end (recorded in the cleanup
  audit).
- Delete `frontend/css/landing.css` and `frontend/css/responsive.css` (0 bytes,
  unreferenced).
- Keep `frontend/css/dashboard.css` per decision; it must remain unlinked. Add a
  one-line comment at the top: "Reference only — no page links this file."
- Verify no page links `dashboard.css`; `assessments.js` no longer depends on it.
- All motion/design rules follow `DESIGN.md`: no gradients, no shadows on panels, hay
  accent only for active nav marker/focus cell/focus ring, reduced-motion respected
  (already implemented in `portal.css`).

---

## 8. Auth/session UX details

- Client session guard (`session.js`) runs on every portal page before data loads:
  token present, not expired, role matches page family. Fail → `login.html`.
- Any API 401 or `ACCOUNT_INACTIVE` → clear storage, redirect to
  `login.html?reason=expired|inactive`, and the login page shows one inline message
  ("Your session ended. Please sign in again." / "This account has been deactivated.
  Contact the administrator.").
- Logout button: inline confirmation (a small dialog, not `confirm()`), then
  `POST /auth/logout` and redirect. If the call fails, still clear locally.
- Change password: available on the trainee profile page and in the admin sidebar
  footer area (same modal component). New token replaces the stored one.
- Admin deactivation of a trainee bumps `tokenVersion`; the trainee's next request gets
  403 `ACCOUNT_INACTIVE` and the guard ends the session.

---

## 9. Security and production hardening

| Item | Implementation |
| --- | --- |
| Committed env | `git rm --cached backend/.env`; confirm `.gitignore` already matches; add `backend/.env.example` with `MONGODB_URI`, `JWT_SECRET`, `PORT`, `NODE_ENV`, `CORS_ORIGINS`, `UPLOADTHING_TOKEN` (empty). Document in README + `SECURITY.md` note that old values remain in history and must be rotated. |
| Secrets | Rotate Atlas DB user password and `JWT_SECRET` as a manual step; README instructs generating with `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`. |
| helmet | As specified in §5.2 |
| Rate limiting | `express-rate-limit` with the limits in §5.2, disabled under test |
| Body cap | `express.json({ limit: "100kb" })` |
| CORS | Allowlist from `CORS_ORIGINS`; no wildcard |
| Errors | Central handler, no stack traces to clients, generic 500 message |
| 404 | JSON for `/api/*`, static fallback otherwise |
| Health | Real `readyState`; 503 when disconnected |
| Auth | `protect` loads the user each request; `tokenVersion`; inactive rejection |
| DNS | Monkey-patch removed; README documents SRV troubleshooting |
| Logging | Remove `console.log` from `authMiddleware`; keep `console.error` in the error handler |

---

## 10. Data migration (live Atlas)

Because the interview confirmed a live Atlas database, migrations must be explicit,
idempotent, and dry-run by default.

`backend/scripts/migratePrograms.js`

1. Find or create program `{ name: "Dairy Production Training", code: "DAIRY", totalFee: 18000 }`.
2. For each `TraineeProfile` whose `program` is a String: match by name
   (case-insensitive) to a Program, create a Program with `totalFee: 18000` when no match,
   then set `program` to that `_id`. Record the original string in a `legacyProgramName`
   field for audit.
3. Report: profiles scanned, programs created, profiles updated, unmatched.
4. `--dry-run` (default) prints the plan; `--apply` writes.

`backend/scripts/migrateAssessments.js`

1. Add `assessmentType` (`"Written"`) where missing.
2. Convert `status: "Completed"` → `"Pending"` when `score` is null, `"Graded"` when a
   score exists. Report counts.

Both scripts: connect with `mongoose`, exit non-zero on error, disconnect in `finally`.
README requires a `mongodump` backup before `--apply` against Atlas.

Seed data is never created by migrations.

---

## 11. Seeding and admin creation

**`backend/scripts/seedDemo.js`**

- Runs only with `--demo`; refuses with a clear message otherwise.
- Refuses when `NODE_ENV === "production"` unless `--force` is also passed.
- Demo records use emails ending in `@demo.edtsp.local` (constant `DEMO_DOMAIN`). Nothing
  outside that domain is ever modified or deleted.
- Creates: 3 programs (Dairy Production Training ₱18,000; Animal Nutrition ₱15,000;
  Farm Safety ₱12,000), 4 demo trainees (Ongoing/Pending/Completed/Inactive) with
  profiles, 6 assessments across statuses, 3 cows with assignments, 6 activities
  (mixed status), and payments covering Unpaid/Partial/Verified/Pending.
- Idempotent: upserts by demo email/`cowId`/`paymentRef` seed key.
- `--reset` deletes only demo-domain users and records referencing them (payments,
  assessments, and cow assignments are cleaned; cows created by the seed are removed by
  `cowId`).
- Prints a summary and the demo login credentials (password from
  `DEMO_PASSWORD` or `DemoPass123!`).

**`backend/scripts/createAdmin.js`**

- Non-interactive: `--firstName`, `--lastName`, `--email`, `--password`, or
  `ADMIN_FIRST_NAME` / `ADMIN_LAST_NAME` / `ADMIN_EMAIL` / `ADMIN_PASSWORD`.
- Missing values fall back to the existing prompt (only when stdin is a TTY; otherwise
  fail with usage text).
- Same validation as signup (email shape, password ≥ 8); duplicate email → clear error,
  exit 1.

---

## 12. Tests

Runner: `node:test` (`node --test`), assertions from `node:assert/strict`, HTTP via
`supertest`, DB via `mongodb-memory-server`. Backend only; no browser automation.

`backend/test/helpers/`
- `db.js`: start/stop memory server, connect mongoose, clear collections between tests.
- `app.js`: build the Express app without listening (extract `createApp()` from
  `server.js` so tests can mount it).
- `auth.js`: factories for admin/trainee users and signed tokens.

Suites:

| File | Covers |
| --- | --- |
| `auth.test.js` | signup required fields/email/password length/duplicate; login success, wrong password, inactive 403; `/me`; change-password; logout bumps `tokenVersion` and old token 401; forgot/reset happy path + expired token + password change revokes sessions |
| `guards.test.js` | missing/invalid token 401; trainee hitting admin routes 403; admin hitting trainee-only 403; deactivated user rejected on next request |
| `assessments.test.js` | create for several trainees; duplicate title skipped and reported; invalid total score; inactive/missing trainee; grade bounds (negative, over total, non-numeric); trainee list only own; pagination and search |
| `trainees.test.js` | admin list includes profile; assign traineeId; duplicate traineeId 409; program assignment; deactivation bumps version; status filter/search pagination |
| `payments.test.js` | trainee submit pending; balance math with fee; overpayment rejected; admin verify/reject; rejected does not count toward paid; role guards; pagination |
| `cows.test.js` | create/edit cow; unique cowId; multi-trainee assignment; activity create; admin-only status change; trainee read-only 403 |
| `summary.test.js` | counts and average score with mixed data; zero state |
| `health.test.js` | database field reflects readyState; 503 shape when disconnected (mock state) |

Commands: `npm --prefix backend test`. `NODE_ENV=test` disables rate limits. Tests never
touch the Atlas URI: `db.js` overrides `MONGODB_URI` with the memory-server URI before
requiring the app.

---

## 13. Lint, CI, scripts

**ESLint flat config (`eslint.config.js` at root)**

- `@eslint/js` recommended base.
- Backend/scripts/tests: `globals.node`, CommonJS source type, `no-console` off for
  scripts/server boot logs, `no-unused-vars` error with `argsIgnorePattern: "^_"`.
- Frontend: `globals.browser`, script source type, `window`/`document` allowed,
  `EDTSP` global declared.
- Ignores: `node_modules`, `frontend/assets`, `backend/uploads`.

**Scripts**

- `backend/package.json`: `start`, `dev`, `test`, `lint` (`eslint .`), `seed:demo`,
  `migrate:programs`, `migrate:assessments`, `create-admin`.
- root `package.json`: scripts delegate (`dev`, `start`, `test`, `lint`,
  `seed:demo`); `main` fixed or removed; duplicated dependencies removed; root
  `package-lock.json` regenerated with `npm install --package-lock-only` so it stays
  consistent. Root `node_modules` is **not** deleted in this pass (per decision); README
  notes it can be pruned with `npm prune`.
- New direct dependencies (backend): `helmet`, `express-rate-limit`, `uploadthing`.
  Dev: `supertest`, `mongodb-memory-server`, `eslint`, `@eslint/js`, `globals`.

**CI — `.github/workflows/ci.yml`**

- Trigger: push + pull_request.
- Node 22, `npm ci` in `backend`, cache `~/.cache/mongodb-binaries` keyed on lockfile.
- Steps: `npm --prefix backend run lint`, `npm --prefix backend test` with
  `NODE_ENV=test`. Root lint also runs (config covers frontend).
- No secrets required; tests use the in-memory DB and `JWT_SECRET=test-secret`.

---

## 14. Deployment

**`Dockerfile`**

- `node:22-alpine`, non-root user, `WORKDIR /app`.
- Copy `backend/package*.json` → `npm ci --omit=dev`; copy `backend/`, `frontend/`,
  root `package.json`.
- `ENV NODE_ENV=production`, `EXPOSE 5000`,
  `CMD ["node", "backend/server.js"]`.
- `HEALTHCHECK` hitting `http://127.0.0.1:5000/api/health`.

**`docker-compose.yml`**

- `app`: build `.`, `env_file: backend/.env`, `PORT=5000`, ports `5000:5000`,
  `depends_on: mongo` (compose variant only).
- `mongo`: `mongo:7`, named volume, no auth (local dev only).
- Documented alternate: set `MONGODB_URI` to Atlas and run only `app`.

**`.dockerignore`**: `node_modules`, `.git`, `.github`, `backend/uploads`, `*.log`,
`.env`.

**README deployment section**: env var table (including `UPLOADTHING_TOKEN`), the
single-origin static-serving model, Docker build/run, compose usage, migration/seed
order, and the required secret rotation. A PaaS can run the same image; no host-specific
files are added (per decision).

---

## 15. Per-item acceptance map

### P0

| TODO item | Deliverable | Done when |
| --- | --- | --- |
| Missing `frontend/js/portal.js` | New shared module (§7.1) | Drawer open/close, scrim, `aria-expanded`, desktop collapse work on all seven pages from one script; no 404s in console |
| Sidebar class contract | `portal.js` + `dashboard.js`/`admin.js` cleanup; `.shell.is-*` only | No occurrences of `sidebar.show` or `sidebar-collapsed`; collapse/drawer verified at >1080px and ≤1080px |
| Untrack and rotate `.env` | `git rm --cached`, `.env.example`, README note | `git ls-files` shows no `.env`; `.env.example` lists the five vars; exposure documented; rotation steps documented |
| Wire `admin-assessments.js` | Rewritten page + JS | Modal loads real trainees with `_id`s; submit hits `POST /api/assessments`; Type/Due Date modeled; label typo gone; hardcoded names gone |
| Load and grade assessments | Table + grade modal | Table from API; row action calls `PUT /api/assessments/:id/grade`; score bounds validated inline; ledger refreshes |
| Re-check status on every request | Async `protect` + `tokenVersion` | Deactivated user gets 403 on the next request; logout invalidates the token |

### P1

| TODO item | Deliverable | Done when |
| --- | --- | --- |
| Trainee management API + page | `/api/admin/trainees` + `admin-trainees.js` + modal | List/search/filter/pagination from API; assign ID, program, enrollment status; activate/deactivate; empty states |
| Admin dashboard metrics | `/api/admin/summary` + wiring | Every ledger value and the recent table come from the API; demo tag removed |
| Trainee dashboard metrics | `dashboard.js` + HTML ids | Balance, average, cow tasks, and per-subject progress from real data; 86/100 contradiction gone |
| Payments module | `Program` + `Payment` + routes + both portals + UploadThing | Record/list/verify/reject/submit work; balances correct; no demo `alert()` path; pages show real data |
| Cow maintenance module | `Cow` + `MaintenanceActivity` + routes + both portals | Adds and status changes persist across refresh; trainee view read-only |
| Profile editing UI | Form + `PUT /api/trainee/me` | Phone/address save with inline validation and success/error state; real account status shown |
| Account management | Change password, forgot/reset, `tokenVersion` | All flows work end-to-end; reset token expires and is single-use; logout/deactivation ends sessions |
| Pagination + server-side filtering | Utility + list endpoints + tables | All large tables use `page/limit/search`; 25 default; pager UI present |

### P2

| TODO item | Deliverable | Done when |
| --- | --- | --- |
| Partial batch writes | Pre-check + skip reporting | One duplicate returns 201 with `created`/`skipped`; no generic 500 |
| Truthful health | `readyState` mapping | Health reflects disconnect; boot log removed |
| Remove debug logging | `authMiddleware` cleanup | No per-request auth logs |
| Production middleware | helmet, limits, cap, error handler, 404, CORS allowlist | Middleware present and covered by tests where practical |
| Remove DNS monkey-patch | `db.js` cleanup | No `resolveSrv` override; Atlas connects in the verified environment |
| Configurable API origin | Relative `/api` + static serving | No `localhost:5000` in frontend JS; app works from one origin |
| Unstyled assessments page | Portal classes or ported CSS | Assessment cards render with portal styling; no `dashboard.css` dependency |
| Unify design systems | Three legacy pages rewritten | All admin pages use `.shell`; no `☰`/`&times;`/`+` glyphs |
| Replace `alert()`/`confirm()` | Field errors + inline `.state`; logout dialog | `rg "alert\(|confirm\(" frontend/js` returns nothing |
| Modal accessibility | `ui.js` modal controller | Every modal: `role="dialog"`, `aria-modal`, labelled, focus trap, Escape, focus return; inputs labelled |
| Share session guard | `session.js` | One guard used by all pages; 401/inactive handled centrally |

### Repo and process

| TODO item | Deliverable | Done when |
| --- | --- | --- |
| Fix README | Rewritten README | No conflict markers; documents setup, env vars, scripts, API surface, deploy, tests |
| Add tests | Test suite (§12) | `npm --prefix backend test` passes locally and in CI |
| Lint + CI | ESLint flat config + workflow | `npm run lint` clean; workflow runs lint + tests |
| Clean root package | Delegate-only changes | `main` correct, no duplicated deps, scripts delegate, lock regenerated |
| Non-interactive seeding | Flags/env + `seedDemo.js` | Admin created from flags; demo seed guarded and idempotent |
| Deployment config | Dockerfile, compose, dockerignore | `docker build` succeeds; compose starts app + mongo; docs complete |
| Repo files | `LICENSE`, `CONTRIBUTING.md`, `CHANGELOG.md` | Files present and accurate (license assumed MIT — confirm, see §18) |

### Cleanup

| TODO item | Deliverable | Done when |
| --- | --- | --- |
| Dead CSS | Delete two 0-byte files; keep `dashboard.css` unlinked | `rg "landing.css|responsive.css"` returns nothing; `dashboard.css` referenced by no page and marked reference-only |

---

## 16. File inventory

### New backend

```
backend/models/Program.js
backend/models/Payment.js
backend/models/Cow.js
backend/models/MaintenanceActivity.js
backend/models/Counter.js
backend/controllers/adminDashboardController.js
backend/controllers/adminTraineeController.js
backend/controllers/programController.js
backend/controllers/adminPaymentController.js
backend/controllers/traineePaymentController.js
backend/controllers/cowController.js
backend/controllers/activityController.js
backend/middleware/errorHandler.js
backend/utils/pagination.js
backend/utils/serializers.js
backend/utils/paymentRef.js
backend/uploadthing/router.js
backend/routes/adminRoutes.js
backend/scripts/migratePrograms.js
backend/scripts/migrateAssessments.js
backend/scripts/seedDemo.js
backend/test/helpers/db.js
backend/test/helpers/app.js
backend/test/helpers/auth.js
backend/test/{auth,guards,assessments,trainees,payments,cows,summary,health}.test.js
backend/.env.example
```

### New frontend

```
frontend/js/api.js
frontend/js/session.js
frontend/js/portal.js
frontend/js/ui.js
frontend/js/upload.js
frontend/js/admin-dashboard.js
frontend/js/admin-trainees.js
frontend/js/admin-programs.js
frontend/js/payments.js            (trainee)
frontend/js/cow-maintenance.js     (trainee)
frontend/js/profile.js             (trainee)
frontend/admin/programs.html
frontend/forgot-password.html
frontend/reset-password.html
```

### New repo root

```
eslint.config.js
Dockerfile
docker-compose.yml
.dockerignore
.github/workflows/ci.yml
LICENSE
CONTRIBUTING.md
CHANGELOG.md
todo-implementation-spec.md  (this file)
```

### Modified

```
backend/server.js, backend/config/db.js, backend/middleware/authMiddleware.js,
backend/models/User.js, backend/models/TraineeProfile.js, backend/models/Assessment.js,
backend/controllers/authController.js, backend/controllers/assessmentController.js,
backend/controllers/assessmentAdminController.js, backend/controllers/traineeController.js,
backend/routes/authRoutes.js, backend/routes/traineeRoutes.js, backend/routes/assessmentRoutes.js,
backend/scripts/createAdmin.js, backend/package.json,
frontend/js/{auth,dashboard,assessments,admin,admin-assessments,admin-payments,admin-cow,main}.js,
frontend/{login,signup,index}.html,
frontend/admin/{dashboard,trainees,assessments,payments,cow-maintenance}.html,
frontend/trainee/{dashboard,profile,assessments,payments,cow-maintenance}.html,
frontend/css/{portal,auth,dashboard}.css, README.md, package.json, .gitignore
```

### Deleted

```
frontend/css/landing.css
frontend/css/responsive.css
backend/.env  (removed from the index only; file stays on disk)
```

---

## 17. Verification plan

Per phase, run from the repo root:

1. `npm --prefix backend run lint` — no errors.
2. `npm --prefix backend test` — all suites pass (in-memory DB).
3. `npm --prefix backend run dev` with the real Atlas URI:
   - `GET /api/health` → `database: "Connected"`.
   - Log in as admin and trainee; walk each page: no console 404s, no `alert()`.
   - Create an assessment for 2 trainees, re-submit the same title for one of them →
     "1 created, 1 skipped".
   - Grade it; confirm trainee sees the score and dashboard average changes.
   - Submit a trainee payment with a receipt; verify it as admin; confirm the trainee
     balance, ledger, and fee meter change.
   - Add a cow, assign two trainees, add an activity, mark it Completed; confirm the
     trainee sees it read-only.
   - Edit trainee phone/address; confirm persistence after reload.
   - Deactivate a trainee with an open session; confirm the next request redirects with
     the inactive message.
   - Reset a password via the dev token; confirm old tokens stop working.
4. Sidebar at >1080px and ≤1080px: collapse, drawer, scrim, Escape, `aria-expanded`.
5. Keyboard pass on each modal: Tab stays inside, Escape closes, focus returns.
6. `docker build .` and `docker compose up` (app + mongo) → health OK.
7. `rg "alert\(|confirm\(|localhost:5000|<<<<<<<" frontend backend README.md` → no
   matches.
8. `git ls-files | rg "\.env$"` → empty.

Manual secret rotation is outside the codebase and must be confirmed by the owner
before deployment.

---

## 18. Assumptions and open questions

1. **License**: `LICENSE` will be MIT unless told otherwise.
2. **Existing production data**: migrations are dry-run by default and require a
   `mongodump` backup; if the Atlas database is only test data, the owner may skip the
   backup.
3. **Fee changes**: editing `Program.totalFee` recalculates outstanding balances
   immediately; historical payments keep their amounts. No fee-change audit trail in
   this pass.
4. **Overpayment**: rejected for both trainees and admins. If overpayment/credit is
   needed, it becomes a follow-up.
5. **Email**: no transactional email provider; reset links surface in dev only. Password
   reset in production needs an email provider later.
6. **Trainee self-service**: trainees can submit payments and edit phone/address; they
   cannot mark assessments or activities complete (activities are admin-only, and the
   assessment lifecycle is Pending → Graded by an admin).
7. **UploadThing limits**: 4 MB, images only, one file per payment. Rotating the exposed
   token is mandatory before use.
8. **Pagination defaults**: 25 for tables, 50 for the assessment trainee picker.
9. **Date/timezone**: display in Asia/Manila; storage in UTC.
10. **Landing page**: only the glyph-button accessibility change; no redesign.
11. **Scale**: pagination and indexes target the current few-hundred-record dataset; no
    caching layer.

---

## 19. Out of scope

- Git history rewriting or force-pushing.
- Deleting root `node_modules` or `package-lock.json`.
- A real email provider, email verification, or 2FA.
- Object storage beyond UploadThing; image resizing/thumbnailing.
- CSV/PDF export, notifications, audit logs beyond `verifiedBy`/`completedBy`.
- Full redesign of the marketing landing page or the login/signup visual language.
- Multi-tenant institutions, multiple admins with granular permissions.
- Browser E2E automation (Playwright/Cypress).

---

## 20. Definition of done

- All P0/P1/P2, repo/process, and cleanup items above are implemented and their
  acceptance conditions verified.
- Every page loads under Express with no 404s, no hardcoded API host, no demo tags, no
  `alert()`/`confirm()`, and all figures come from the API.
- One sidebar class contract (`.shell.is-open` / `.shell.is-collapsed`) across all
  portal pages.
- `backend/.env` untracked, `.env.example` committed, exposure and rotation documented.
- `npm --prefix backend test` passes; `npm run lint` clean; CI workflow present.
- Docker image builds and serves both API and frontend; README documents setup, env,
  scripts, API surface, migrations, seeding, and deployment.
- The only retained dead asset is `dashboard.css`, unlinked and marked reference-only
  (per the interview decision).
