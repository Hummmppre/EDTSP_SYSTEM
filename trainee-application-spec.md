# Trainee Training Application — Feature Spec

**Status:** Draft for approval
**Requested:** "Add an application feature in the trainee dashboard in which the trainees can use to apply in the portal."
**Scope agreed in interview:** trainees apply for **enrollment in a training program/batch** through a dedicated Apply page; **administrators** review, approve, or reject from a new admin page; approval **activates enrollment automatically** and sends a **Brevo** email.

---

## 1. Problem and outcome

Today a person signs up (`/signup.html` → `POST /api/auth/signup`) and immediately gets a trainee account whose `TraineeProfile.enrollmentStatus` defaults to `"Pending"`. There is no way to ask for a program, no record of an applicant's details, and no admin decision step — enrollment is invisible.

After this feature:

- A signed-in trainee can submit a structured training application (personal details, background, emergency contact, program/batch choice, motivation).
- Exactly one open application can exist per trainee.
- An administrator reviews applications with full answers, approves or rejects with a public message and an internal note, exports the list, and manages the programs/batches applicants apply into.
- Approval assigns a trainee ID, sets the program, sets `enrollmentStatus` to `Ongoing`, consumes a batch slot, and emails the trainee.
- The trainee dashboard shows the live application status and next action.

---

## 2. Decisions locked in the interview

| Topic | Decision |
| --- | --- |
| What is applied for | Enrollment in a training batch/program |
| Reviewer | Admin only (no instructor routing, no auto-approval) |
| Trainee placement | New `frontend/trainee/apply.html` page + sidebar link |
| Program source | New Program/Batch collection in MongoDB |
| Form fields | Program + preferred batch, contact details, personal demographics, educational background, emergency contact, motivation statement, truthfulness acknowledgment |
| Application limit | One open application at a time (any program) |
| Admin scope | Full admin review page (`frontend/admin/applications.html`) |
| Approval effect | Auto-activate enrollment: `enrollmentStatus = "Ongoing"`, program from application, trainee ID generated |
| Notification | Email on decision, sent through **Brevo** (`BREVO_API_KEY`) |
| Dashboard surface | New panel in the dashboard right column (does not replace a ledger cell) + sidebar link |
| Demo tag | Remove the `Demo figures` tag from the trainee dashboard — it now contains live data |
| Reapplication after rejection | Allowed immediately (new application, previous one stays in history) |
| Already enrolled (Ongoing/Completed) | Apply page shows a read-only enrolled/completed state, no form |
| Program admin | Full admin CRUD for programs and batches |
| Batch fields | Program name + description, slot capacity + filled count, training fee |
| Review notes | Separate **public** message (shown to trainee) and **internal** note (admin only) |
| Capacity | Hard limit — approval is blocked when the batch is full |
| After submit | Read-only; trainee may withdraw, which frees them to submit again |
| Form shape | Multi-step wizard with review step |
| Required fields | Everything except the motivation statement; birthdate must make the applicant 18+ |
| Trainee ID | Auto-generated server-side at approval, format `EDT-YYYY-NNN` (matches demo data `EDT-2026-001`) |
| Admin tools | Status filter, search by name/email, detail view with all answers, approve/reject confirmation dialog, CSV export |
| Admin nav | New "Applications" nav link in the admin sidebar with a live pending-count badge |

### Assumptions to confirm (were not answered explicitly)

1. **Statuses:** `Submitted → Under review → Approved | Rejected`, plus `Withdrawn`. Admin moving an application to "Under review" is optional; opening a detail view does **not** change status.
2. **No file uploads.** No multer, no cloud storage. Documents, if ever needed, would be pasted links; out of scope here.
3. **Batches do not require an intake date** (that option was not selected), but an optional `intakeDate`/`label` keeps batches distinguishable. If unset, the UI shows the batch label only.
4. **Motivation statement is optional** but shown prominently to reviewers when present.
5. **Email failure does not roll back a decision** — the decision is committed, the trainee still sees the in-portal status, and the failure is logged. See §9.

---

## 3. Data model (Mongoose, `backend/models/`)

### 3.1 `Program.js` (new)

```js
{
  name: String,              // required, unique, trimmed, e.g. "Dairy Production Training"
  description: String,       // required, trimmed
  fee: Number,               // required, min 0, PHP
  status: String,            // enum ["Open", "Closed"], default "Open"
  createdBy: ObjectId ref User,
  timestamps: true
}
```

Indexes: unique on `name`.

### 3.2 `Batch.js` (new)

```js
{
  program: ObjectId ref Program,   // required
  label: String,                   // required, e.g. "Batch 2 · 2026"
  intakeDate: Date,                // optional
  slotCapacity: Number,            // required, min 1
  filledCount: Number,             // default 0, min 0, never > slotCapacity
  status: String,                  // enum ["Open", "Closed"], default "Open"
  timestamps: true
}
```

Indexes: unique compound `{ program: 1, label: 1 }`.

Derived helpers (computed, never stored): `slotsRemaining = slotCapacity - filledCount`, `isFull = filledCount >= slotCapacity`.

### 3.3 `TrainingApplication.js` (new)

```js
{
  user: ObjectId ref User,            // required, indexed
  program: ObjectId ref Program,      // required
  batch: ObjectId ref Batch,          // required

  // Contact details (prefilled from account/profile, editable in the form)
  firstName: String, lastName: String,   // required
  email: String,                          // required, lowercase, trimmed
  phone: String,                          // required
  address: String,                        // required

  // Personal demographics
  dateOfBirth: Date,        // required, must be 18+ at submission
  sex: String,              // required, enum ["Female", "Male", "Prefer not to say"]
  civilStatus: String,      // required, enum ["Single", "Married", "Widowed", "Separated"]

  // Educational background
  highestEducation: String, // required, enum ["Elementary", "High school", "Senior high school", "Vocational", "College", "Postgraduate"]
  schoolAttended: String,   // required

  // Emergency contact
  emergencyContactName: String,         // required
  emergencyContactPhone: String,        // required
  emergencyContactRelationship: String, // required

  // Motivation
  motivation: String,       // optional, max 1000 chars

  // Acknowledgment
  acknowledgedTruthful: Boolean, // required true at submit

  status: String,           // enum ["Submitted", "Under review", "Approved", "Rejected", "Withdrawn"], default "Submitted"

  reviewer: ObjectId ref User,        // admin who decided
  decidedAt: Date,
  publicNote: String,        // shown to trainee on decision, max 1000
  internalNote: String,      // admin-only, max 2000

  submittedAt: Date,         // default Date.now
  withdrawnAt: Date,
  timestamps: true
}
```

**No partial unique index on `{ user }`** — history must survive. The "one open application" rule is enforced in the controller (§5.3) inside a check for `status in ["Submitted", "Under review"]`, plus an advisory unique partial index if MongoDB supports it cleanly:

```js
applicationSchema.index(
  { user: 1 },
  { unique: true, partialFilterExpression: { status: { $in: ["Submitted", "Under review"] } } }
);
```

If the partial index cannot be relied on, the controller's guard is authoritative and the index is a safety net. Do **not** silently swallow a duplicate-key error — return the same friendly 409 message as the guard.

### 3.4 `Counter.js` (new) — trainee ID sequence

```js
{ _id: String,  // e.g. "traineeId-2026"
  seq: Number }
```

Use `findOneAndUpdate({ _id }, { $inc: { seq: 1 } }, { upsert: true, new: true })` and format `EDT-${year}-${String(seq).padStart(3, "0")}`. Sequence resets per calendar year via the `_id` key. On approval, if the trainee already has a `traineeId`, keep it.

### 3.5 Existing model changes

- `TraineeProfile`: no schema change required — `program`, `enrollmentStatus` (`Pending|Ongoing|Completed|Inactive`), and `traineeId` already exist. `Program.name` is written into `profile.program` on approval.
- `User`: unchanged.

---

## 4. API

All routes follow existing conventions: `{ success, message, ... }` JSON, `protect` middleware, `traineeOnly` / `adminOnly` guards, `try/catch` with `console.error` and a generic 500 message. Mount new routers in `backend/server.js`.

### 4.1 Trainee — `backend/routes/applicationRoutes.js` (mounted at `/api/applications`)

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| `GET` | `/open-batches` | `protect` (trainee) | Open programs whose batches are open and not full, with `slotsRemaining` |
| `GET` | `/me` | `protect`, `traineeOnly` | Current application (open one) + history + `canApply` flag and reason |
| `POST` | `/` | `protect`, `traineeOnly` | Submit an application |
| `POST` | `/:id/withdraw` | `protect`, `traineeOnly` | Withdraw own open application |

`GET /me` response shape:

```json
{
  "success": true,
  "application": { "...current open or most recent..." },
  "history": [ "..." ],
  "canApply": false,
  "reason": "You already have an application under review."
}
```

`reason` values: `"already_applied"`, `"already_enrolled"`, `"completed"`, `"account_inactive"`, or `null`.

`POST /` validation order (return 400 with a specific message per failure):

1. Required-field presence (`firstName`, `lastName`, `email`, `phone`, `address`, `dateOfBirth`, `sex`, `civilStatus`, `highestEducation`, `schoolAttended`, `emergencyContactName`, `emergencyContactPhone`, `emergencyContactRelationship`, `program`, `batch`).
2. `acknowledgedTruthful === true`.
3. Email format (same regex as `authController`).
4. Phone: 7–20 chars, digits plus optional `+ - ( ) space`.
5. `dateOfBirth` valid date and **at least 18 years old** at submission time; reject future dates with `"Enter a valid date of birth."` and under-18 with `"Applicants must be 18 years or older."`.
6. `motivation` length ≤ 1000.
7. No existing application in `Submitted` / `Under review` → 409 `"You already have an application in progress. Withdraw it before submitting a new one."`.
8. Enrollment guard → 403 `"Your enrollment is already active."` for `Ongoing`, or `"Your training is already completed."` for `Completed`.
9. `program` and `batch` exist, IDs valid, both `status === "Open"`, `batch.program` matches `program`, batch not full → 400/409 with a clear message.
10. Create with `status: "Submitted"`, `submittedAt: now`.

`POST /:id/withdraw`: only the owner; only while `Submitted` or `Under review`; sets `status = "Withdrawn"`, `withdrawnAt`. 400 `"This application can no longer be withdrawn."` otherwise. Never touches batch counts (counts increase only on approval).

### 4.2 Admin — applications (`adminOnly`)

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/admin/applications` | List; query `status`, `search` (name/email, case-insensitive), `sort` (`newest` default) |
| `GET` | `/api/admin/applications/pending-count` | `{ count }` for the sidebar badge |
| `GET` | `/api/admin/applications/:id` | Full application, populated `user`, `program`, `batch`, `reviewer` |
| `POST` | `/api/admin/applications/:id/decision` | `{ decision: "Approved" \| "Rejected", publicNote, internalNote }` |
| `GET` | `/api/admin/applications/export` | `text/csv` download of the filtered list |

Decision rules:

- Only `Submitted` / `Under review` may be decided. Otherwise 409.
- On **Approved**: `publicNote` optional; `internalNote` optional; re-check the batch is not full (409 `"This batch is already full. Close the batch or move the applicant to another batch."`); then in one logical unit:
  1. `batch.filledCount += 1` (guard with a conditional update `{ _id, $expr: { $lt: ["$filledCount", "$slotCapacity"] } }` so concurrent approvals cannot oversell; if it fails, return the full-batch 409).
  2. `program.filledCount` is **not** stored — only per batch.
  3. Upsert `TraineeProfile`: `program = program.name`, `enrollmentStatus = "Ongoing"`, `traineeId` generated only if missing.
  4. Application: `status = "Approved"`, `reviewer = req.user.id`, `decidedAt = now`, notes saved.
- On **Rejected**: application `status = "Rejected"`, reviewer, `decidedAt`, notes; no batch or profile change. `publicNote` strongly encouraged but not required server-side.
- Decision response includes the updated application and a `mail: { sent: boolean }` field.
- If the profile update fails after the batch increment, decrement `filledCount` back and return 500 — the two must not drift.
- An email send failure never changes the HTTP outcome of the decision; it is logged and reflected in `mail.sent`.

### 4.3 Admin — programs and batches (`adminOnly`)

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/admin/programs` | Programs with nested batches and computed `slotsRemaining` |
| `POST` | `/api/admin/programs` | Create program (`name`, `description`, `fee`) |
| `PATCH` | `/api/admin/programs/:id` | Update name/description/fee/status (`Open`/`Closed`) |
| `POST` | `/api/admin/programs/:id/batches` | Create batch (`label`, `slotCapacity`, optional `intakeDate`) |
| `PATCH` | `/api/admin/batches/:id` | Update `label`, `slotCapacity`, `intakeDate`, `status` |

Guards:

- `slotCapacity` cannot be set below `filledCount` → 400 `"Capacity cannot be lower than the number of approved applicants already in this batch."`
- Deleting is **not** supported in this pass (no delete endpoints, no delete buttons).
- Closing a program closes applications into all its batches; existing applications remain reviewable.

---

## 5. Trainee experience

### 5.1 Sidebar and dashboard

- Add a nav link in `frontend/trainee/*.html` (all five trainee pages: dashboard, assessments, payments, cow-maintenance, profile) between "Cow maintenance" and the Account group: label **Apply for training**, icon: clipboard/document with a check (new 1.6px stroke SVG matching the existing set); `is-active` + `aria-current="page"` on `apply.html` only.
- Trainee dashboard (`frontend/trainee/dashboard.html`):
  - Remove `<span class="demo-tag">Demo figures</span>` from the page header and remove the footer sentence "Figures marked as demo are not yet connected to live records." Keep the footer copyright.
  - Add a new panel in the right column (`<div class="stack">`) above the profile panel:

    ```
    Panel head: "Training application" + text-link "Apply" (or "View")
    Body: status badge, program + batch, submitted date, decision date
          + public decision note when present
          + primary button "Apply for training" (no open application, eligible)
          + ghost button "Withdraw application" (open application)
    States: loading skeleton-free text, "No application yet", "Under review —
            we will email you once a decision is made", Approved, Rejected
            (with "Apply again" link), Withdrawn, "Already enrolled" (Ongoing/Completed)
    ```

  - The panel is live data; do not label it as demo.

### 5.2 `frontend/trainee/apply.html` + `frontend/js/apply.js`

Page structure mirrors existing pages: same sidebar/topbar/shell, `page__head` with title **"Apply for training"** and deck "Submit your details for review. One application at a time." No demo tag.

**Multi-step wizard** (single page, four steps, client-side state):

1. **Applicant details** — first name, last name, email, phone, address (prefilled from `GET /api/trainee/me`; editable).
2. **Background** — date of birth, sex, civil status, highest education, school attended.
3. **Emergency contact** — name, phone, relationship.
4. **Training choice** — program select → dependent batch select (only open, non-full batches, showing "N slots left"), optional motivation textarea, truthfulness checkbox.
5. **Review & submit** — read-only summary of every answer with "Edit" links back to the relevant step, then **Submit application**.

Wizard behavior:

- Progress indicator using the existing ledger/`process` visual language (four numbered steps, hairline separators) — reuse `.process` markup patterns, no pill stepper.
- **Next** validates only the current step; errors appear inline beneath the field (`.field__error`, new style) and the step does not advance.
- Back preserves entered values. No data is persisted until submit.
- Step 5 submit: button enters a disabled "Submitting…" state, double submission is blocked, network failure keeps the form and shows a `.state` error with a Retry action.
- On success: redirect to the status view on the same page (`?submitted=1` → success state that names the next step: "Your application is under review. We'll email you at <email>.").
- Withdrawal uses a native `confirm()` dialog consistent with the logout pattern, then refreshes status.
- Future-dated or under-18 birthdate is caught client-side *and* server-side.

**Page states** (each must name cause and next action, per DESIGN.md):

| Condition | Rendered |
| --- | --- |
| No open application, eligible | Wizard |
| Open application | Status summary card + Withdraw; no form |
| Approved | Status + program/batch + decision note + what happens next |
| Rejected | Status + public note + "Apply again" (new application allowed immediately) |
| Withdrawn | Status + "Apply again" |
| `enrollmentStatus` Ongoing | Read-only "You are enrolled" card; no form |
| `enrollmentStatus` Completed | Read-only "Training completed" card; no form |
| No open batches | "Applications are closed right now." + note to check back; no form |
| API/auth failure | `.state` error with retry; 401 redirects to login |

**Mobile:** wizard controls stack to one column below 720px; step actions stay reachable (no fixed footers that overlap the keyboard); tap targets ≥ 44px; `font-size: 16px` on inputs to stop iOS zoom.

### 5.3 One-open-application rule, spelled end to end

- Server blocks a second submission (`Submitted`/`Under review`) with 409.
- Client hides the wizard whenever `canApply === false` and shows the reason.
- Withdrawal re-enables the wizard immediately.
- Rejection re-enables the wizard immediately (history retained).

---

## 6. Admin experience

### 6.1 Navigation

- New nav link **Applications** in `frontend/admin/*.html` (dashboard, trainees, assessments, payments, cow-maintenance) with the same SVG conventions and a pending-count badge (`.nav__badge`, new style: hay background, ink text, 10px tabular numeral) fed by `GET /api/admin/applications/pending-count`.
- Also add **Programs** to the admin nav — needed because program CRUD is in scope.
- Badge count refreshes on page load; no polling, no websockets.

### 6.2 `frontend/admin/applications.html` + `frontend/js/admin-applications.js`

- Header: title, deck, no demo tag (live data). Ledger strip: Pending review (focus cell), Approved, Rejected, Open batches.
- Panel with toolbar: status `<select>` (`All`, `Submitted`, `Under review`, `Approved`, `Rejected`, `Withdrawn`), search input (name or email), CSV export button.
- Table columns: Applicant (name + email sub), Program · Batch, Submitted, Status badge, Actions ("Review"). Uses `.data-table`, monospace application reference (`APP-YYYY-NNNN` optional — if added, derive from `_id`; not required).
- **Detail view:** right-side modal (reuse `.admin-modal` / `.admin-modal-content` with a wider modifier, e.g. `admin-modal-content--wide`) showing every submitted field in `<dl class="facts">` groups, chosen program/batch with slots remaining, motivation, submitted date, prior applications for the same user (compact, read-only), and the decision area.
- **Decision dialog:** within the detail view — `Approve` / `Reject` radio or segmented buttons; required-on-reject public message textarea (client-side), optional on approve; internal note textarea; explicit confirm button whose label repeats the outcome ("Approve application" / "Reject application"); irreversible-decision warning text. Buttons disabled while the request is in flight.
- Batch-full state: Approve disabled with the server's message surfaced inline, pointing to closing the batch or moving the applicant.
- Empty states: no applications at all; no matches for filters ("No applications match this status and search." — mirrors `trainees.html`).
- Errors: `.state` block with retry, never a silent failure.

### 6.3 `frontend/admin/programs.html` + `frontend/js/admin-programs.js`

- List of programs with fee, status, batch count, total slots/remaining.
- Create/edit program via `.admin-modal` with `.form-grid` + `.field`.
- Batch management inside the program's panel: add batch (label, capacity, optional intake date), edit, open/close. Full batches and closed batches are visually distinct via `.status-badge`.
- Capacity cannot be lowered below approved count; surfaces the server error inline.

### 6.4 CSV export

- `GET /api/admin/applications/export` with the same filters, `Content-Type: text/csv; charset=utf-8`, `Content-Disposition: attachment; filename="applications-YYYY-MM-DD.csv"`.
- Columns: Reference, First name, Last name, Email, Phone, Program, Batch, Submitted, Status, Decided, Public note, Internal note.
- Escape commas/quotes/newlines; prefix values starting with `= + - @` with a single quote to prevent spreadsheet formula injection.
- Note: the frontend uses bearer-token auth, so a plain `<a href>` cannot carry the JWT. Export must be fetched with the token and saved via a Blob + temporary object URL.

---

## 7. Approval transaction detail

Order of operations for `POST /api/admin/applications/:id/decision` when `Approved`:

1. Load application (populate `program`, `batch`).
2. Assert status is decidable.
3. Atomic slot claim: `Batch.findOneAndUpdate({ _id, status: "Open", $expr: { $lt: ["$filledCount", "$slotCapacity"] } }, { $inc: { filledCount: 1 } }, { new: true })`. If `null`, respond 409 (full or closed) without touching anything else.
4. Generate trainee ID from `Counter` if `TraineeProfile.traineeId` is empty.
5. Upsert profile: `{ $set: { program: program.name, enrollmentStatus: "Ongoing" }, $setOnInsert: { user: application.user } }`, and set `traineeId` only when generated.
6. Update application with decision fields.
7. On failure in steps 5–6: decrement `filledCount` and return 500 (do not leave a phantom slot).
8. Send the email; record `mail.sent` in the response only, not in the DB.

Rejection path: update application only. `Withdrawn` never affects counts.

---

## 8. Tension with existing demo data

- `TraineeProfile.enrollmentStatus` in the dashboard ledger/assessment figures remain static demo values. Only the application panel is live.
- Do **not** invent applications in seed data as if they were real people's records. If a seed is provided for local dev (`backend/scripts/seedPrograms.js`), create 2–3 **programs and batches only**, clearly documented as seed data — not fake applicants, per DESIGN.md's honesty rule.
- The removed "Demo figures" tag stays removed; do not add fake live numbers to replace it. If a figure remains static (payment balance, assessment average), its panel keeps its own honest wording or the page foot notes it — the spec's minimum is removing the single global tag as requested, without asserting the remaining figures are live.

---

## 9. Email notifications (Brevo)

- Provider: **Brevo** (researched in Gravity; transactional email API). Only env var: `BREVO_API_KEY`.
- Add `BREVO_API_KEY` and `MAIL_FROM_EMAIL` / `MAIL_FROM_NAME` to `backend/.env` (and document them in README; no `.env.example` exists yet — creating one is optional and should omit real values).
- No new npm dependency is required: Node 18+ `fetch` against `https://api.brevo.com/v3/smtp/email` with headers `api-key: process.env.BREVO_API_KEY` and `content-type: application/json`.
- New `backend/lib/mailer.js` exporting `sendApplicationDecision({ to, name, program, batch, decision, publicNote })`. It must:
  - No-op with a `console.warn` when `BREVO_API_KEY` is missing (development).
  - Never throw into the request path; return `{ sent, error }`.
  - Time out (e.g. `AbortSignal.timeout(8000)`).
  - Log the decision and failure reason without logging secrets.
- Email content (plain, plain-text plus simple HTML, matching the ledger tone, no marketing imagery):
  - Subject: `Your EDTSP application was approved — <program>` / `Your EDTSP application was not approved — <program>`.
  - Body: greeting by first name, decision, program and batch, public note when present, next step (pay the training fee at the portal / contact the training office), sign-off "Esperon Dairy Training".
- Not sent for withdrawals or for admin-created status changes other than a decision.
- Deliverability constraint: Brevo requires a verified sender domain/address (`MAIL_FROM_EMAIL`); until verified, test sends can only go to the account's own address. Document this in the README.

---

## 10. Files to add / change

**Backend — new**
- `backend/models/Program.js`
- `backend/models/Batch.js`
- `backend/models/TrainingApplication.js`
- `backend/models/Counter.js`
- `backend/controllers/applicationController.js`
- `backend/controllers/applicationAdminController.js`
- `backend/controllers/programController.js`
- `backend/routes/applicationRoutes.js`
- `backend/routes/adminApplicationRoutes.js`
- `backend/routes/programRoutes.js`
- `backend/lib/mailer.js`
- `backend/scripts/seedPrograms.js` (dev convenience, programs/batches only)

**Backend — changed**
- `backend/server.js` — mount three routers under `/api/applications`, `/api/admin/applications`, `/api/programs` + `/api/admin/programs`.
- `backend/.env` — add `BREVO_API_KEY`, `MAIL_FROM_EMAIL`, `MAIL_FROM_NAME` (values supplied by owner).
- `README.md` — setup notes for programs seed and Brevo.

**Frontend — new**
- `frontend/trainee/apply.html`
- `frontend/js/apply.js`
- `frontend/admin/applications.html`
- `frontend/js/admin-applications.js`
- `frontend/admin/programs.html`
- `frontend/js/admin-programs.js`

**Frontend — changed**
- `frontend/trainee/dashboard.html` — remove demo tag/footnote, add application panel, add nav link.
- `frontend/trainee/assessments.html`, `payments.html`, `cow-maintenance.html`, `profile.html` — nav link only.
- `frontend/admin/dashboard.html`, `trainees.html`, `assessments.html`, `payments.html`, `cow-maintenance.html` — Applications + Programs nav links, pending badge.
- `frontend/js/dashboard.js` — load application state for the panel (or a small `trainee-application-panel.js`), and keep the existing auth guard.
- `frontend/js/admin.js` — pending-count badge loader shared by admin pages.
- `frontend/css/portal.css` — wizard stepper styles, `.field__error`, `.field__hint`, `.nav__badge`, `.admin-modal-content--wide`, review-summary list, decision segmented control, mobile rules. Follow existing tokens/radii; no shadows except the modal, no pills, no gradients.

---

## 11. Out of scope (explicitly)

- File uploads / document storage.
- Payment of the training fee from the application flow (the existing payments page and its demo figures are untouched).
- Emailing reminders, rejection cooldowns, waitlists, or auto-promotion from a waitlist.
- Editing a submitted application (read-only + withdraw only).
- Deleting programs, batches, or applications.
- Instructor/reviewer assignment, multi-reviewer approval chains, audit log of every admin view.
- SMS or in-app realtime notifications.
- Rewriting the dashboard's other demo figures to be live.

---

## 12. Acceptance criteria

**Trainee**
1. Sidebar on every trainee page shows "Apply for training" and navigates to `apply.html`.
2. A trainee with no application sees a four-step wizard; Next blocks on invalid fields with inline errors; Back preserves values.
3. Program select lists only open programs with open, non-full batches; batch select updates when program changes and shows remaining slots.
4. Submitting with a birthdate under 18 is blocked client-side and server-side with "Applicants must be 18 years or older."
5. Submitting without checking the truthfulness box is blocked.
6. A successful submit shows a confirmation state naming the next step and the email address.
7. Reloading `apply.html` shows the read-only status, not the form.
8. A second submission attempt (API) returns 409 and creates no record.
9. Withdrawing asks for confirmation, sets the status to Withdrawn, and immediately restores the form.
10. An `Ongoing` or `Completed` trainee sees the enrolled/completed state and no form.
11. The dashboard panel shows the live status; the page no longer carries the "Demo figures" tag.

**Admin**
12. Admin sidebar shows Applications with a pending count and Programs.
13. Applications page filters by status, searches name/email, and shows a no-match state.
14. Detail view shows every submitted field, program/batch with slots remaining, and notes.
15. Approving with a full batch is blocked with a clear message and no partial writes.
16. Approving a valid application sets status Approved, decision date, reviewer, increments `filledCount` once, sets the profile to Ongoing with the program and a generated `EDT-YYYY-NNN` ID.
17. Rejecting requires a public message (client-side) and sends no slot change.
18. Decision sends a Brevo email when configured; an email failure still returns success with `mail.sent: false` and logs the error.
19. CSV export downloads only the filtered rows, is properly quoted, and cannot be opened unauthenticated.
20. Program CRUD creates a program and a batch; lowering capacity below approved count is refused.
21. An approved trainee's dashboard/profile reflects the new program, status, and trainee ID.

**Quality**
22. No inline event handlers; all JS is DOM-safe (`textContent`, no `innerHTML` with user data).
23. All new interactive controls are keyboard reachable with a visible focus ring and have labels (`.sr-only` where needed).
24. Works at 360px width with no horizontal overflow outside `.table-wrap`.
25. `prefers-reduced-motion` collapses wizard/step and modal transitions.
26. Existing auth redirect (401 → login) and role guards still work on every new page.

---

## 13. Open questions for confirmation

1. Are the assumed statuses correct, or should `Under review` be dropped in favor of a single `Pending`?
2. Should the trainee be able to attach an ID/proof document? (Assumed no uploads.)
3. Should rejection include an automatic cooldown, even though immediate reapply was chosen?
4. Is `EDT-YYYY-NNN` the right ID format and year scope, and does the sequence reset each year?
5. Who owns the Brevo account and the verified sender address, and what should `MAIL_FROM_EMAIL` be?
6. Should the application fee shown on the batch be copied onto the application as a snapshot (useful if fees change later)?
7. Should admins be able to move an application to another batch during approval (currently: reject and ask the trainee to reapply)?
8. Is an `APP-YYYY-NNNN` human-readable application reference wanted in the UI/CSV, or is the Mongo `_id` enough?
