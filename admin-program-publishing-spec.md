# Admin Program Publishing → Trainee Visibility — Spec

**Status:** Draft
**Date:** 2026-11-12
**Request:** "feat: connect the admin program to the backend to enable the trainee to see the open program"
**Related:** `apply-form-program-batch-spec.md` (evidence protocol for the empty Program/Batch dropdowns), `trainee-application-spec.md` (original application feature)

---

## 1. Request and interpretation

The request is an end-to-end outcome, not a single file change: an administrator creates or edits a program in the admin portal, that data is persisted by the backend, and a trainee opening the application form sees the program they are allowed to apply for — with accurate availability.

The interview established the concrete symptom:

> The admin Programs page loads normally, but after creating a program the trainee's Program dropdown is still empty.

That symptom has **three independent causes**, all in scope of "make it work end to end":

1. **The admin create flow cannot produce a publishable program.** Creating a program never asks for a batch, and the trainee endpoint only lists programs that have an open, non-full batch. A freshly created program is therefore invisible by design, with nothing in the UI saying so.
2. **The admin page gives no visibility feedback.** A program with no batch, a program whose batches are full, and a closed program all look like ordinary Open programs.
3. **The trainee form never renders the programs it receives.** `showWizard()` guards `fillProgramOptions()` with `if (!elements.program.options.length)`, but `apply.html` ships one static placeholder option, so `options.length` is already `1` and population never runs.

A fourth defect sits inside the first cause: `getOpenBatches` drops full batches, so the agreed "show a full program" behaviour cannot work without changing what the endpoint returns. This spec fixes all four, keeps the existing admin page, and keeps the existing trainee endpoint's URL, auth, and response shape.

---

## 2. Current state (verified in the codebase)

### 2.1 What already exists

| Layer | File | Behaviour |
| --- | --- | --- |
| Admin UI | `frontend/admin/programs.html` | Program list, summary ledger, program modal, batch modal, "Add batch" and "Edit" controls per program |
| Admin JS | `frontend/js/admin-programs.js` | Calls `GET /api/admin/programs`, `POST /api/admin/programs`, `PATCH /api/admin/programs/:id`, `POST /api/admin/programs/:id/batches`, `PATCH /api/admin/batches/:id`; renders nested batches; redirects on 401 |
| Admin routes | `backend/routes/programRoutes.js` | All program/batch routes behind `protect` + `adminOnly`; mounted at `/api/admin/programs` and `/api/admin/batches` in `backend/server.js` |
| Admin controller | `backend/controllers/programController.js` | `getPrograms` returns programs with nested batches and computed `slotsRemaining`; `createProgram`, `updateProgram`, `createBatch`, `updateBatch` validate input |
| Models | `backend/models/Program.js`, `backend/models/Batch.js` | `Program { name (unique), description, fee, status: Open\|Closed, createdBy }`; `Batch { program, label, intakeDate, slotCapacity, filledCount, status }` with unique `{ program, label }` |
| Trainee endpoint | `backend/controllers/applicationController.js` `getOpenBatches` (line ~61) | `GET /api/applications/open-batches`, `protect` + `traineeOnly`; returns Open programs whose Open batches are **not full**, and drops programs with no such batch |
| Trainee UI | `frontend/trainee/apply.html`, `frontend/js/apply.js` | Program/batch selects on Step 4; `loadApplicationState()` fetches identity, own application, and open batches in parallel; `fillProgramOptions()` at line 188, `fillBatchOptions()` at line 204 |
| Seed | `backend/scripts/seedPrograms.js` | 3 programs / 4 batches; useful for manual verification |

### 2.2 The defects in the path

**D1 — Admin creation is two disconnected steps, and step one is invisible.**
`openNewProgram()` (`admin-programs.js` line 298) clears the form and shows only name, description, and fee. `saveProgram()` (line 320) posts `{ name, description, fee }`. The program is created with `status: "Open"` but has no batches, so `getOpenBatches` filters it out. The admin sees a successful save and a normal-looking card; the trainee sees nothing.

**D2 — No visibility feedback.**
`renderProgram()` (line 175) renders `program.status` (`Open`/`Closed`) as the only badge. It never compares the program with its batches, so "no batch", "all full", and "closed" are indistinguishable. The empty-batch hint at line ~262 says applicants cannot choose the program until a batch is open, but nothing marks the program itself as hidden.

**D3 — The trainee form's population guard never fires.**
`apply.html` ships `<option value="">Select a program</option>` inside `#program` (line 354). `showWizard()` (apply.js line 641) checks `if (!elements.program.options.length)` at line 650 before calling `fillProgramOptions()`. Because the placeholder already makes length `1`, the condition is false and the API data is never rendered.

**D4 — The trainee endpoint hides full batches.**
`getOpenBatches` filters `batch.filledCount < batch.slotCapacity` (line ~76) and then discards any program left with zero batches (line ~88). The agreed trainee behaviour ("show it as Full") requires full batches to reach the client, marked unavailable.

---

## 3. Interview decisions

| # | Topic | Decision |
| --- | --- | --- |
| 1 | Observed symptom | Admin Programs page loads; trainee Program dropdown is empty |
| 2 | New program visibility | Ask for a first batch in the same create form, so a program is publishable in one flow |
| 3 | Existing admin page | Fix and finish it; do not rebuild or replace the page |
| 4 | Admin visibility cue | Show per-program visibility with the reason when hidden |
| 5 | Save atomicity | All-or-nothing: no program record remains if its first batch cannot be created |
| 6 | First-batch fields | Label (prefilled "Batch 1"), slot capacity, optional intake date |
| 7 | Later batches | Keep the current "Add batch" button and per-batch edit modal |
| 8 | Status model | Keep `Open`/`Closed`; derive trainee visibility from status + batches; no new status |
| 9 | Trainee API | Keep `/api/applications/open-batches` and its response shape; no new endpoint |
| 10 | Zero availability | Keep the current "Applications are closed right now." notice |
| 11 | Full program | Show it to trainees as full, with batches marked "Full" and unselectable |
| 12 | Closing a program | Server also closes every batch of that program |
| 13 | Endpoint inclusion | Return all Open programs with their Open batches, including full ones |
| 14 | Program with no open batch | Hide it from the trainee form |
| 15 | Freshness | Re-fetch availability every time the applicant enters Step 4 |
| 16 | Fee edits | Allowed freely; no warning and no lock |
| 17 | Badge semantics | Three states: accepting, listed-but-full, hidden-with-reason |
| 18 | Reopening a program | Leaves batches closed; admin must reopen a batch manually |
| 19 | Past intake date | Block dates before today |
| 20 | Verification | API-level checks plus a manual UI checklist; no repo test framework |

---

## 4. Goals and non-goals

### 4.1 Goals

1. An admin can create a program **and** its first open batch in one modal submit.
2. The save is atomic from the admin's point of view: either both records exist or neither does.
3. Each program card states exactly what trainees see and why.
4. Closing a program cannot leave contradictory open batches behind.
5. A trainee who reaches Step 4 sees every Open program that has at least one open batch, including programs whose batches are full, correctly marked.
6. The trainee list refreshes on Step 4 entry, so a program published while the form is open appears without a page reload.
7. No new endpoint, no schema change, no new dependency, no change to the trainee endpoint's response shape.

### 4.2 Non-goals

- Deleting or archiving programs or batches; manual sort order.
- A `Draft`/`Published` state, a public `/api/programs` endpoint, or a preview of the trainee view.
- Creating multiple batches in the program create flow; batch management stays where it is.
- Fee history or freezing a fee into an application/payment record.
- Listing open programs on the trainee dashboard or landing page.
- Changing the application fields, review flow, approval logic, or email notifications.
- Automated tests committed to the repo (verification is API calls plus a manual pass).
- Fixing the unrelated submit-error path that switches to the status panel on a 400/409 (`apply.js` submit handler); noted in §15 as a follow-up.

---

## 5. Definitions

| Term | Meaning |
| --- | --- |
| **Open batch** | `batch.status === "Open"` |
| **Available batch** | Open **and** `filledCount < slotCapacity` |
| **Full batch** | Open **and** `filledCount >= slotCapacity` |
| **Listed program** | `program.status === "Open"` **and** it has at least one Open batch (available or full) |
| **Accepting program** | Listed **and** has at least one available batch |
| **Full program** | Listed **and** every Open batch is full |
| **Hidden program** | `Closed`, or Open with no Open batch |
| **Today** | The server's local calendar date, compared date-only (no time component) |

Visibility is **derived**, never stored. There is no `visible` field in the database and no new program status.

---

## 6. Functional requirements

### FR-1 — Program modal collects the first batch

`frontend/admin/programs.html` + `frontend/js/admin-programs.js`

The "New program" modal keeps Name, Description, and Training fee, then adds a visually separated **First batch** section:

| Field | ID | Type | Rules |
| --- | --- | --- | --- |
| Batch label | `firstBatchLabel` | text | Required, trimmed, prefilled with `Batch 1` |
| Slot capacity | `firstBatchCapacity` | number, `min="1"`, `step="1"` | Required, integer ≥ 1 |
| Intake date | `firstBatchIntake` | date | Optional; cannot be before today |

- The section is visible **only** when creating. `openEditProgram()` hides it and keeps today's edit form untouched.
- `openNewProgram()` resets the form, sets the label value to `Batch 1` after `reset()` (a reset would clear it), and leaves capacity/intake empty.
- The primary button reads **Create program & batch** in create mode and **Save program** in edit mode.
- The modal heading stays "New program"; the batch section uses a `<fieldset>` with `<legend>First batch</legend>` and the hint "A program is only shown to trainees once it has an open batch."
- Client-side validation mirrors the server: name and description non-empty, fee a finite number ≥ 0, label non-empty, capacity a whole number ≥ 1, intake not in the past when provided. The first invalid field receives focus; `#programError` shows one message at a time.
- While saving, the button is disabled and reads "Saving…"; errors keep the modal open with all entered values intact.
- On success: close the modal, reload the list, and set `#programFeedback` to **"Program and first batch saved."**

### FR-2 — Server accepts and validates `firstBatch`

`POST /api/admin/programs` gains an optional `firstBatch` object (see §8.2). All validation happens **before any write**:

- Program: name, description, fee as today.
- Batch: label non-empty; `slotCapacity` an integer ≥ 1; `intakeDate` either absent/null or a valid date not earlier than today.
- Duplicate program name → `409`; duplicate `{ program, label }` → `409` (this can only happen if an earlier partial state exists, but the check is still explicit).

Error messages are listed in §8.2. No program is created when any validation fails.

### FR-3 — Atomic create with compensation

The create handler must not leave an orphan program when the batch insert fails.

1. Validate the full payload (program + batch) first.
2. Create the program.
3. Create the batch with `program: program._id`, `status: "Open"`, `filledCount: 0`.
4. If step 3 fails for any reason, delete the just-created program and return the appropriate 4xx/5xx.
5. If the delete also fails, log both errors with the program `_id`; return `500` with **"Unable to create this program."** The orphan has no batch, so it is hidden from trainees and visible to the admin as "Hidden — no open batch" for manual cleanup.

Implementation preference: use a MongoDB transaction when the deployment supports it (replica set / Atlas); otherwise the compensating delete above. The visible contract is identical either way. Never return `201` unless both records exist.

Backward compatibility: a request without `firstBatch` still creates a program only, exactly as today (used by scripts, not by the admin UI). Such a program is hidden until a batch is added.

### FR-4 — Admin visibility badge (three states)

Replace the raw `Open`/`Closed` badge in `renderProgram()` with one derived badge:

| Condition | Badge text | Class |
| --- | --- | --- |
| Program Open + ≥ 1 available batch | `Accepting applications` | `open` |
| Program Open + ≥ 1 Open batch, all full | `Listed — all batches full` | `full` (new modifier) |
| Program Open + 0 Open batches | `Hidden — no open batch` | `closed` |
| Program Closed | `Hidden — program closed` | `closed` |

- Priority order: Closed first, then no Open batch, then full, then accepting.
- The badge is computed from `program.status` and `program.batches` already returned by `GET /api/admin/programs`; no API change.
- When the state is hidden or full, add a one-line note under the badge area (reuse `.field__hint`):
  - no batch: "Add an open batch so trainees can apply."
  - all full: "Trainees can see this program but cannot choose a batch."
  - program closed: "Reopen the program and one of its batches to accept applications."
- `.status-badge.full` uses the existing amber/pending palette (same token as `.status-badge.pending`), not a new colour system.
- Keep the existing "No batches yet…" line in the batch list; it reinforces the same fact.
- The Edit modal still exposes the raw Open/Closed status select, so the administrator can still see and change it.

### FR-5 — Closing a program closes its batches

`PATCH /api/admin/programs/:id` with `status: "Closed"`:

1. Set the program to `Closed`.
2. Set every batch of that program to `Closed` in the same request (`Batch.updateMany({ program: id, status: "Open" }, { status: "Closed" })`).
3. Return `closedBatchCount` alongside the program.
4. If the batch update fails, revert the program to its previous status and return `500`; do not report a successful close that left batches open.

Effects:

- Existing applications are untouched; `filledCount` is untouched.
- Trainees lose the program on their next Step 4 refresh (or reload).
- The admin badge becomes `Hidden — program closed` regardless of batch state.
- Reopening (`status: "Open"`) changes **only** the program. Batches stay `Closed` (decision 18), so the badge becomes `Hidden — no open batch` and the admin must reopen a batch manually. The hint text makes this explicit.

### FR-6 — Batch status stays consistent with program status

- **Create a batch under a Closed program:** allow it, but create it with `status: "Closed"` (the program's state wins). Response message: "Batch created. Reopen the program to accept applications."
- **Open a batch whose program is Closed:** reject with `409` and **"Reopen the program before opening this batch."** This prevents an Open batch that trainees can never see.
- **Close a batch:** unchanged.
- **Capacity below `filledCount`:** unchanged (`400`, existing message).
- **Full batch:** unchanged; fullness comes from `filledCount` and does not change program status.

### FR-7 — Trainee endpoint returns all Open programs and their Open batches

`GET /api/applications/open-batches` keeps its route, auth (`protect` + `traineeOnly`), and response shape, but changes inclusion:

- Programs: every program with `status: "Open"`, sorted by `name`.
- Batches: every batch of those programs with `status: "Open"`, sorted by `label`, **including full ones**.
- Programs with no Open batches are still returned, with `batches: []`. The trainee form hides them (FR-9).
- Each batch keeps the existing fields and `slotsRemaining` (`max(slotCapacity - filledCount, 0)`), so a full batch has `slotsRemaining: 0`.
- No new fields, no new endpoint, no new query parameters. The only contract change is inclusion: a client that assumed "every returned program has at least one non-full batch" must now check `slotsRemaining`.

Rationale for returning empty programs: the response is the single availability snapshot; the client decides what is displayable. It also keeps the "hide no-batch programs" rule in one place (the form).

### FR-8 — Trainee form fixes the population guard

`frontend/js/apply.js`

- Remove the `options.length` guard in `showWizard()` (line 650). Program options are populated from `state.programs` whenever the wizard is shown or availability is refreshed.
- Extract a `renderProgramOptions()` that rebuilds `#program` from `state.programs`, always emitting **exactly one** `value=""` placeholder (`Select a program`), and restores the previous selection when that program is still present.
- `fillBatchOptions(programId)` keeps its current structure but gains full-batch handling:
  - placeholder: `Select a batch`, or `All batches are full` when no batch is available;
  - each batch option text: `` `${label} — ${slotsRemaining} slot(s) left` `` for available batches, `` `${label} — Full` `` for full ones;
  - full batches get `option.disabled = true`;
  - `#batch` stays enabled when the program is selectable, even if every batch is full, so the trainee can open it and see why;
  - `#programHint` becomes `` `Training fee: ₱${fee}.` `` plus ` All batches are full.` when applicable.
- Programs whose `batches` array is empty are **not** added to the program select (decision 14).
- A program with only full batches **is** added (decision 11); selecting it shows the disabled full batches and the hint. The trainee cannot proceed because no batch can be selected.
- Placeholder count must stay at exactly one across repeated refreshes; the bug being fixed was caused by an option-count guard, so this gets an explicit acceptance check.

### FR-9 — Empty and full states on the trainee page

- If no program has at least one Open batch (or the list is empty), show the existing notice panel unchanged:
  - title: **Applications are closed right now.**
  - text: **There are no open batches accepting applications. Check back with the training office.**
  - `#wizardPanel` stays hidden; `#noticeRetry` stays hidden (this is not an error).
- If at least one program is listed, show the wizard even when every listed program is full. Step 4 explains fullness through disabled options and the fee hint.
- Selecting a full-only program and clicking **Next** blocks with **"Choose an available batch."** under the Batch field and stays on Step 4.
- No application data, steps 1–3, or prefilled contact fields are reset by these states.

### FR-10 — Refresh availability on Step 4 entry

Every transition **into** Step 4 (Next from Step 3, Back from Step 5) triggers an availability refresh before the step is shown:

1. Fetch only `GET /api/applications/open-batches` (not identity or own application).
2. Replace `state.programs`; re-render program options and the batch select.
3. Preserve the current program and batch if they are still listed and still available (program Open, batch Open and not full). Preserve the program if it is still listed but its batch became full, and clear only the batch.
4. If the selected program disappeared, clear both fields and set `#programHint` to **"That program is no longer available. Choose another."**
5. If the selected batch disappeared or filled, keep the program, clear the batch, and set the hint to **"That batch is no longer available. Choose another."**
6. While the request is in flight, set the hint to **"Checking availability…"**; do not block navigation or disable **Next** — the server re-checks at submit.
7. If the refresh fails, keep the last known list and selection, log `[apply] availability refresh failed`, and set the hint to **"Could not check availability. Showing the last known list."**
8. Ignore out-of-order responses with a monotonically increasing request id.

On initial page load, the existing parallel load already supplies availability; do not fire a second request for Step 1. The refresh applies when the trainee actually reaches Step 4.

### FR-11 — Step 4 validation against availability

`validateStep(4)` must not accept a value that is absent from `state.programs`:

- No program value → **"Choose a program."**
- Program value not in `state.programs`, or program has no Open batches → **"That program is no longer available."**
- No batch value → **"Choose a batch."**
- Batch value not among the selected program's Open, non-full batches → **"Choose an available batch."**
- The submit handler already re-validates steps 1–4; it now also benefits from this check. The server remains the final authority (existing 400/409 responses).

### FR-12 — Past intake dates are rejected

- New batch, whether from the program create flow or the existing "Add batch" modal: any `intakeDate` earlier than today → inline **"Intake date cannot be in the past."** and `400` from the server.
- Editing a batch: reject only when the submitted date **differs** from the stored date and is in the past. Leaving an existing past date untouched is allowed, so an admin can still correct capacity or close a legacy batch without being forced to invent a new date.
- Empty intake date remains valid and stores `null`.
- Comparison is date-only in the server's local timezone: parse the `YYYY-MM-DD` value, zero its time, and compare with today at 00:00. An invalid date string → `400` **"Enter a valid intake date."**
- The admin date input gets `min` set to today's `YYYY-MM-DD` when creating; the edit modal leaves the stored value visible. Server validation is authoritative either way.

### FR-13 — Fee edits stay unrestricted

- Changing a program's fee is always allowed (decision 16), regardless of existing applications.
- No stored fee is added to applications; the program's current fee is what the admin and trainee see.
- No confirmation dialog, lock, or audit entry is added in this work.
- The spec notes the consequence: past applications/payments that recompute from the live program fee will follow the new amount; payments remain out of scope.

### FR-14 — Preserve existing behaviour

- Programs are listed alphabetically by name; batches alphabetically by label.
- `Program.name` uniqueness, `{ program, label }` uniqueness, and all current validation messages stay.
- Admin routes stay `protect` + `adminOnly`; trainee routes stay `protect` + `traineeOnly`.
- The admin summary ledger keeps counting Open batches with `filled < capacity`; full batches are not "open" for that count.
- The admin page's 401 redirect and error feedback stay.
- Trainee `#batch` remains a native `<select>`; no custom dropdown.

---

## 7. Visibility behaviour matrix

| Program status | Batches | Admin badge | Trainee Step 4 | Batch options | Next |
| --- | --- | --- | --- | --- | --- |
| Open | ≥ 1 available (mixed full allowed) | Accepting applications | Listed | Available selectable; full disabled and labelled "Full" | Proceeds when an available batch is chosen |
| Open | All Open batches full | Listed — all batches full | Listed | Placeholder "All batches are full"; every batch disabled | Blocked: "Choose an available batch." |
| Open | No batches at all | Hidden — no open batch | Not listed | — | — |
| Open | Batches exist but all Closed | Hidden — no open batch | Not listed | — | — |
| Closed | Any (auto-closed with the program) | Hidden — program closed | Not listed | — | — |
| Closed (legacy) | A batch manually left Open | Hidden — program closed | Not listed (endpoint filters by program status) | — | — |
| Any | Batch fills after selection, before submit | — | Next Step 4 refresh marks it Full and clears the batch | Server returns 409 for a stale batch | Current client switches to the status panel on 409; keeping the trainee on Step 4 is a follow-up (§16) |

Trainee empty notice appears when the set of listed programs is empty, including the all-hidden cases.

---

## 8. API contract

### 8.1 `GET /api/admin/programs` — unchanged

Returns `{ success, count, programs: [...] }`, each program with nested `batches`, `totalSlots`, `slotsRemaining`. Used to compute badges client-side.

### 8.2 `POST /api/admin/programs` — first batch support

**Request**

```json
{
  "name": "Dairy Production Training",
  "description": "Hands-on training in milk production and farm records.",
  "fee": 18000,
  "firstBatch": {
    "label": "Batch 1",
    "slotCapacity": 25,
    "intakeDate": "2027-01-12"
  }
}
```

`intakeDate` may be `null` or omitted. `firstBatch` itself is optional for backward compatibility.

**Success — `201`**

```json
{
  "success": true,
  "message": "Program and first batch created.",
  "program": { "_id": "...", "name": "...", "status": "Open", "fee": 18000, "...": "..." },
  "batch": {
    "_id": "...",
    "program": "...",
    "label": "Batch 1",
    "intakeDate": "2027-01-12T00:00:00.000Z",
    "slotCapacity": 25,
    "filledCount": 0,
    "slotsRemaining": 25,
    "status": "Open"
  }
}
```

Without `firstBatch`, the message stays **"Program created."** and no `batch` key is returned.

**Errors**

| Status | Message | When |
| --- | --- | --- |
| 400 | Please provide a program name and description. | Name or description empty/whitespace |
| 400 | Please provide a valid training fee. | Fee missing, NaN, or negative |
| 400 | Please provide a batch label. | `firstBatch` present, label empty |
| 400 | Slot capacity must be a whole number of at least 1. | Capacity missing, fractional, 0, or negative |
| 400 | Intake date cannot be in the past. | Date earlier than today |
| 400 | Enter a valid intake date. | Unparseable date string |
| 409 | A program with this name already exists. | Duplicate name |
| 409 | This program already has a batch with that label. | Duplicate label (partial-state guard) |
| 500 | Unable to create this program. | Unexpected failure; program rolled back |

Order of checks: program fields → batch fields → duplicate/name/DB. All before writes, except the duplicate-label race which is caught at insert and rolled back.

### 8.3 `PATCH /api/admin/programs/:id` — cascade close

- `status: "Closed"` also closes the program's Open batches and returns `closedBatchCount`.
- `status: "Open"` never touches batches.
- Other fields behave as today.
- Response: existing program plus `closedBatchCount` (integer, 0 when not applicable).
- If the batch cascade fails, revert the program status and return `500` **"Unable to close this program."**

### 8.4 `POST /api/admin/programs/:id/batches` — closed-parent rule

- Program missing → `404` (existing).
- Program `Closed` → create the batch with `status: "Closed"` and message **"Batch created. Reopen the program to accept applications."**
- Program `Open` → create `status: "Open"` (existing).
- Past date → `400` per FR-12.
- Response shape unchanged (`batch: batchView(...)`), plus the conditional message.

### 8.5 `PATCH /api/admin/batches/:id` — open-parent rule

- Setting `status: "Open"` while the parent program is `Closed` → `409` **"Reopen the program before opening this batch."**
- Past-date rules per FR-12.
- Everything else unchanged.

### 8.6 `GET /api/applications/open-batches` — inclusion change only

**Response shape (unchanged):**

```json
{
  "success": true,
  "programs": [
    {
      "_id": "...",
      "name": "Dairy Production Training",
      "description": "...",
      "fee": 18000,
      "batches": [
        {
          "_id": "...",
          "label": "Batch 1",
          "intakeDate": "2027-01-12T00:00:00.000Z",
          "slotCapacity": 25,
          "filledCount": 25,
          "slotsRemaining": 0,
          "status": "Open"
        }
      ]
    },
    {
      "_id": "...",
      "name": "Farm Safety & Hygiene",
      "description": "...",
      "fee": 9000,
      "batches": []
    }
  ]
}
```

- Full batches now appear with `slotsRemaining: 0`.
- Programs with no Open batches now appear with `batches: []`; the form hides them.
- Ordering unchanged: programs by name, batches by label.
- No new query params, no pagination, no public access.

---

## 9. Edge cases

| # | Case | Expected behaviour |
| --- | --- | --- |
| E1 | Program name duplicated across admins, concurrent requests | One `201`, one `409`; the losing request has no batch and no program |
| E2 | First batch label duplicates an existing batch of the same program | `409`; the just-created program is deleted (compensation) |
| E3 | `firstBatch` has a past intake date | `400`; no program created |
| E4 | Batch insert fails after program insert | Compensation delete; `400`/`500`; admin list unchanged after reload |
| E5 | Compensation delete itself fails | Orphan program with no batch remains, hidden from trainees; `500` logged with its `_id`; admin sees "Hidden — no open batch" and can add a batch manually |
| E6 | Program created through an older client with no `firstBatch` | Succeeds as before; badge says Hidden — no open batch |
| E7 | Admin closes program while a trainee is on Step 4 | Trainee keeps the stale list until the next Step 4 entry; submit returns `400`; next refresh drops the program |
| E8 | Admin closes a program, then reopens it | Program Open, all batches Closed, badge Hidden — no open batch; trainee does not see it until a batch is reopened |
| E9 | Admin tries to open a batch under a Closed program | `409` "Reopen the program before opening this batch." |
| E10 | Admin adds a batch to a Closed program | Batch is created Closed; visible in admin list, hidden from trainees |
| E11 | Batch becomes full between Step 4 and submit | Server `409` "This batch is already full…"; the current client switches to the status panel (known gap, §16); the next Step 4 refresh marks the batch Full and clears it |
| E12 | Every batch of every program is full | Form shows all programs, all full; no notice; Next blocked with "Choose an available batch." |
| E13 | No program has an Open batch (none exist or all Closed) | Notice "Applications are closed right now."; wizard hidden |
| E14 | All programs are Closed | Same notice; endpoint returns no programs |
| E15 | Trainee has an open application | Status panel, not the wizard; visibility changes do not affect it |
| E16 | Program has a single available batch | Listed and selectable; no auto-selection is added (the applicant still chooses the batch) |
| E17 | Program has zero batches but was created before this feature | Badge Hidden — no open batch with the "Add an open batch" hint |
| E18 | Admin edits capacity from 25 to 10 with 12 filled | Existing `400` "Capacity cannot be lower than…" |
| E19 | Admin edits a batch with a past intake date, changes only capacity | Allowed: the stored date is unchanged, so FR-12's "changed date" rule does not trigger |
| E20 | Admin enters a fractional capacity in the first-batch form | Inline "Slot capacity must be a whole number of at least 1."; no request sent |
| E21 | Program name differs only by case | Allowed by the current unique index; unchanged in this work |
| E22 | Step 4 entered repeatedly (Next/Back loops) | One placeholder remains, selection preserved, no duplicate options |
| E23 | Availability refresh request fails | Last known list retained, hint explains, Next still usable, server re-checks |
| E24 | Two refresh responses arrive out of order | Only the latest request id updates state |
| E25 | Program’s batches are all full but one is closed | Closed batch excluded; remaining full batches shown as Full |
| E26 | Fee edited after applications exist | Allowed; no warning, no stored fee change (FR-13) |

---

## 10. UI copy reference

| Location | Copy |
| --- | --- |
| Program modal, create title | New program |
| First batch legend | First batch |
| First batch hint | A program is only shown to trainees once it has an open batch. |
| Batch label label | Label |
| Capacity label | Slot capacity |
| Intake label | Intake date (optional) |
| Create submit button | Create program & batch |
| Saving state | Saving… |
| Success feedback (create) | Program and first batch saved. |
| Success feedback (edit program) | Program saved. |
| Success feedback (batch) | Batch saved. |
| Badge — accepting | Accepting applications |
| Badge — full | Listed — all batches full |
| Badge — no batch | Hidden — no open batch |
| Badge — closed | Hidden — program closed |
| Hint — no batch | Add an open batch so trainees can apply. |
| Hint — full | Trainees can see this program but cannot choose a batch. |
| Hint — closed | Reopen the program and one of its batches to accept applications. |
| Trainee placeholder (program) | Select a program |
| Trainee placeholder (batch) | Select a batch |
| Trainee placeholder (all full) | All batches are full |
| Trainee option (available) | {label} — {n} slot(s) left |
| Trainee option (full) | {label} — Full |
| Trainee hint | Training fee: ₱{fee}. / Training fee: ₱{fee}. All batches are full. |
| Refresh hint | Checking availability… |
| Refresh mismatch (program) | That program is no longer available. Choose another. |
| Refresh mismatch (batch) | That batch is no longer available. Choose another. |
| Refresh failure | Could not check availability. Showing the last known list. |
| Validation | Choose a program. / Choose a batch. / Choose an available batch. / That program is no longer available. |
| Intake error | Intake date cannot be in the past. / Enter a valid intake date. |
| Closed-parent batch open | Reopen the program before opening this batch. |
| Batch under closed program | Batch created. Reopen the program to accept applications. |

---

## 11. Accessibility and responsive behaviour

- New fields reuse `.field`, `<label for>`, and `.form-grid`; no placeholder-only labels.
- The first-batch `<fieldset>`/`<legend>` groups the new inputs for screen readers.
- Inline errors use the existing `role="alert"` container; the first invalid field receives focus.
- Full batches are disabled natively (`<option disabled>`), not just styled; the reason is in the option text ("Full").
- Visibility badges are text plus colour; `Hidden —` / `All batches full` carry the meaning without colour.
- Step 4 refresh updates `#programHint`, which is a visible hint but not a live region today. Announce the mismatch messages via the existing submit-error pattern or add `aria-live="polite"` to `#programHint`; do not move focus.
- Modal behaviour (focus, Escape, backdrop click) is unchanged.
- The three-column first-batch fieldset stacks on mobile through the existing `.form-grid` rules; the admin modal scroll behaviour is unchanged.

---

## 12. Acceptance criteria

1. Creating a program with a valid first batch returns `201`, persists exactly one program and one batch, and the card immediately reads **Accepting applications**.
2. That program appears in the trainee's Step 4 dropdown after entering Step 4, without a page reload.
3. A failed first batch (past date, bad capacity, duplicate label) leaves **no** program record; the admin list does not gain a card.
4. A duplicate program name returns `409` and creates no batch.
5. Program creation without `firstBatch` still works and is hidden with the correct badge.
6. A program with only full batches shows **Listed — all batches full** to the admin and is listed to trainees with every batch disabled and labelled **Full**; **Next** is blocked.
7. A program with no open batch shows **Hidden — no open batch** and is absent from the trainee dropdown.
8. Closing a program sets all its batches to Closed; the endpoint response includes `closedBatchCount`; the trainee loses it on the next Step 4 refresh.
9. Reopening a program leaves batches Closed; the badge says **Hidden — no open batch**; trainees still do not see it.
10. Opening a batch under a Closed program returns `409`; creating a batch under a Closed program yields a Closed batch.
11. A past intake date is rejected for new batches; an unchanged past date on edit is accepted.
12. `GET /api/applications/open-batches` returns full batches (`slotsRemaining: 0`) and empty-batch programs (`batches: []`), with the same field set as before.
13. The trainee form shows exactly one placeholder after repeated render/refresh cycles, and the batch select updates per program without duplicate options.
14. No new endpoint, environment variable, npm dependency, or database field is introduced.
15. Existing application submission, withdrawal, review, and approval flows are unaffected; a trainee with an open application still sees the status panel.

---

## 13. Verification plan

### 13.1 Preconditions

```bash
# API
cd backend && node server.js
curl -s http://localhost:5000/api/health

# Frontend
npx serve frontend -l 5500
```

- One admin account and one trainee account with no open application.
- A `$TOKEN` for each. Admin login is reCAPTCHA-gated like trainee login; obtain the token from the browser's `localStorage.edtspToken` after signing in, or use the local JWT bootstrap described in `apply-form-program-batch-spec.md` §10.2. Do not paste the secret into this spec.
- Use a test program name prefixed `ZZ Test —` so cleanup is unambiguous.

```bash
API=http://localhost:5000/api
ADMIN_TOKEN=...   # admin
TRAINEE_TOKEN=... # trainee
```

### 13.2 API checks

**A1 — Create with first batch**

```bash
curl -s -X POST "$API/admin/programs" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "ZZ Test — Publishing",
    "description": "Verification record.",
    "fee": 1000,
    "firstBatch": { "label": "Batch 1", "slotCapacity": 2, "intakeDate": "2027-01-12" }
  }' | tee /tmp/a1.json
```

Expect `success: true`, a `program._id`, a `batch._id`, `batch.status == "Open"`, `batch.slotsRemaining == 2`.

**A2 — Admin list contains the nested batch**

```bash
curl -s "$API/admin/programs" -H "Authorization: Bearer $ADMIN_TOKEN" \
  | grep -o '"name":"ZZ Test — Publishing"' | head -1
```

**A3 — Trainee availability includes it**

```bash
curl -s "$API/applications/open-batches" -H "Authorization: Bearer $TRAINEE_TOKEN" \
  | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const p=JSON.parse(s).programs.find(x=>x.name==='ZZ Test — Publishing');console.log(p&&p.batches.map(b=>[b.label,b.slotsRemaining,b.status]))})"
```

Expect `[ [ 'Batch 1', 2, 'Open' ] ]`.

**A4 — Past intake rejected, no program left**

```bash
curl -s -o /tmp/a4.json -w '%{http_code}\n' -X POST "$API/admin/programs" \
  -H "Authorization: Bearer $ADMIN_TOKEN" -H "Content-Type: application/json" \
  -d '{"name":"ZZ Test — Past","description":"x","fee":1,"firstBatch":{"label":"Batch 1","slotCapacity":2,"intakeDate":"2020-01-01"}}'

curl -s "$API/admin/programs" -H "Authorization: Bearer $ADMIN_TOKEN" \
  | grep -c 'ZZ Test — Past' || true
```

Expect `400` and `0` matches.

**A5 — Duplicate program name**

Repeat A1's exact `name`. Expect `409` with "A program with this name already exists."; no new batch is created.

**A6 — Full batch is returned, marked full**

Set the test batch full (test data only, via `mongosh` or Compass):

```js
db.batches.updateOne({ _id: ObjectId("<BATCH_ID>") }, { $set: { filledCount: 2 } })
```

Re-run A3. Expect `[ [ 'Batch 1', 0, 'Open' ] ]`.

**A7 — Close cascade**

```bash
curl -s -X PATCH "$API/admin/programs/<PROGRAM_ID>" \
  -H "Authorization: Bearer $ADMIN_TOKEN" -H "Content-Type: application/json" \
  -d '{"status":"Closed"}'
```

Expect `closedBatchCount: 1`; admin list shows the batch as `Closed`; trainee availability no longer includes the program.

**A8 — Reopen does not reopen batches**

PATCH `{"status":"Open"}`; expect `closedBatchCount: 0`, batch still `Closed`, program absent from trainee availability.

**A9 — Opening a batch under a closed program**

Close the program again, set the batch `{"status":"Open"}`. Expect `409` "Reopen the program before opening this batch."

**A10 — Batch under closed program is created Closed**

Close the program, then `POST /api/admin/programs/<ID>/batches` with a new label. Expect `201` and `status: "Closed"`.

**A11 — Shape regression**

Compare keys of the first program and batch in the response with the pre-change response: `_id, name, description, fee, batches` and `_id, label, intakeDate, slotCapacity, filledCount, slotsRemaining, status`. No keys added or removed.

**Cleanup (test records only)**

No delete endpoints exist. Remove the `ZZ Test —` programs and their batches through `mongosh`/Compass after verification:

```js
const ids = db.programs.find({ name: /^ZZ Test —/ }).map(p => p._id);
db.batches.deleteMany({ program: { $in: ids } });
db.programs.deleteMany({ _id: { $in: ids } });
```

### 13.3 Manual UI checklist

Setup: sign in as admin in one browser profile, as a trainee in another (or a private window).

**Admin**

1. Open `/admin/programs.html`. Confirm the list loads and the ledger shows counts.
2. Click **New program**. Confirm the **First batch** section is visible with **Batch 1** prefilled.
3. Submit with an empty capacity → inline capacity error, modal stays open, no request.
4. Set capacity `2`, intake date tomorrow, and save. Confirm the modal closes, the feedback reads **Program and first batch saved.**, and the card shows **Accepting applications** with the batch listed.
5. Open the same program's **Edit program** → the First batch section is hidden; change the fee and save → **Program saved.** and the new fee is on the card.
6. Try a new program with a past intake date → inline error, no card appears after reload.
7. Try a duplicate name → server message appears inline; no duplicate card.
8. Set the program's status to Closed → the card shows **Hidden — program closed**, and its batch row shows `Closed` without a separate action.
9. Reopen the program → badge becomes **Hidden — no open batch**, with the "Add an open batch" hint; the batch remains Closed.
10. Reopen the batch via **Edit** → badge becomes **Accepting applications**.
11. Add a second batch with a different label; confirm both appear and summary counts update.

**Trainee**

12. Sign in as the trainee, open `/trainee/apply.html`, complete Steps 1–3, and click **Next**.
13. Confirm the new program appears in the Program select exactly once, with one `Select a program` placeholder, and the batch is selectable.
14. While the form stays open, close the program as admin. Click **Back**, then **Next** into Step 4. Confirm the program is gone and, if it was the only one, the notice appears.
15. Reopen the program and its batch as admin. Click **Back**, then **Next** again. Confirm the program reappears without a page reload.
16. As admin, make the only batch full — approve enough applications or set `filledCount = slotCapacity` in the database for test data. Re-enter Step 4. Confirm the program is listed, the batch shows **Full** and is not selectable, the hint says **All batches are full**, and **Next** blocks.
17. Close the batch while leaving the program Open. Re-enter Step 4. Confirm the program is hidden.
18. Reload the page and repeat Steps 1–4 twice. Confirm there is still exactly one placeholder and no duplicate options.
19. Submit a valid application and confirm the status panel and review still show the chosen program/batch (no regression).

Record pass/fail for each item with the date and build; screenshots are optional but useful for the badge states and the full-batch Step 4 state.

### 13.4 What is not verified

- No Playwright or other browser automation is added; the UI pass is manual (decision 20).
- The compensating-delete path is verified by forcing a batch failure (duplicate label/past date), not by simulating a database crash.
- Concurrency (two admins saving the same name at the same instant) is covered by the unique index; it is not load-tested.

---

## 14. Implementation notes

### 14.1 Backend

| File | Change |
| --- | --- |
| `backend/controllers/programController.js` | Add `validateFirstBatch`/`parseIntakeDate` helpers; accept `firstBatch` in `createProgram`; atomic create + compensation; cascade close in `updateProgram`; closed-parent rule in `createBatch`; open-parent rule and past-date rule in `updateBatch` |
| `backend/controllers/applicationController.js` | Remove the fullness filter from `getOpenBatches`; stop discarding programs with empty batches. Keep `batchSummary` and sorting |
| `backend/routes/programRoutes.js` | No route changes |
| Models | No schema changes; `filledCount` still changes only on approval |
| Tests/scripts | No change; leave `seedPrograms.js` and the existing seed data alone |

Suggested create flow:

```js
const { firstBatch } = req.body || {};
validate program fields;
const batchInput = firstBatch ? validateBatchFields(firstBatch) : null;

const program = await Program.create({...});
if (!batchInput) return 201 program-only;

try {
  const batch = await Batch.create({ program: program._id, status: "Open", ...batchInput });
  return 201 { program, batch };
} catch (error) {
  await Program.deleteOne({ _id: program._id }).catch(logRollbackFailure);
  return mapBatchError(error);
}
```

Use a session/transaction instead when `mongoose.connection` supports it; keep the same status codes and messages.

### 14.2 Frontend — admin

| File | Change |
| --- | --- |
| `frontend/admin/programs.html` | Add the First batch fieldset inside `#programModal`; IDs `firstBatchLabel`, `firstBatchCapacity`, `firstBatchIntake`, wrapper `firstBatchFields` |
| `frontend/js/admin-programs.js` | Cache the new elements; toggle the fieldset in `openNewProgram`/`openEditProgram`; validate and include `firstBatch` in the POST; update button text; compute and render the three-state badge; add the reason hint; set feedback copy |
| `frontend/css/portal.css` | One rule for `.status-badge.full` reusing the pending palette; no layout changes |

Badge computation (single helper):

```js
function visibilityFor(program) {
  if (program.status !== "Open") return { label: "Hidden — program closed", className: "closed", note: "…" };
  const openBatches = program.batches.filter(b => b.status === "Open");
  if (!openBatches.length) return { label: "Hidden — no open batch", className: "closed", note: "…" };
  const hasSpace = openBatches.some(b => b.filledCount < b.slotCapacity);
  return hasSpace
    ? { label: "Accepting applications", className: "open", note: "" }
    : { label: "Listed — all batches full", className: "full", note: "…" };
}
```

### 14.3 Frontend — trainee

| File | Change |
| --- | --- |
| `frontend/js/apply.js` | Remove the options-length guard; add `renderProgramOptions()`; extend `fillBatchOptions()` for full batches and hints; add availability refresh in `goToStep(4)`; extend `validateStep(4)`; add request-id guard |
| `frontend/trainee/apply.html` | No structural change required; keep the placeholder option and `#programHint`. Optionally add `aria-live="polite"` to `#programHint` |
| `frontend/css/portal.css` | No change unless the refresh hint needs a muted style; reuse `.field__hint` |

Data flow on Step 4 entry:

```
Next (Step 3) → validateStep(3) → goToStep(4)
  → refreshAvailability()  [GET /applications/open-batches]
  → state.programs = data.programs
  → renderProgramOptions() + fillBatchOptions(selectedProgram)
  → restore selection when still valid
  → updateWizardChrome() shows Step 4
```

The refresh must not re-run the identity or own-application calls; a closed program should not push the trainee into the status panel. Errors stay inline.

### 14.4 No schema migration

Existing programs need no data change. A legacy program with no batches simply renders as Hidden with the "Add an open batch" hint. Existing batches with past intake dates remain valid and editable under FR-12's changed-date rule.

---

## 15. Risks and trade-offs

| Risk | Mitigation / note |
| --- | --- |
| Compensating delete is not a true transaction on standalone MongoDB | Validate before writes; delete on failure; log orphan `_id`; orphan is hidden from trainees and fixable in the admin UI |
| Returning programs with empty batches changes client assumptions | Only one client consumes the endpoint (`apply.js`); it now filters and is covered by acceptance checks |
| Step 4 refresh can overwrite a selection | Preserve by ID; clear only what disappeared; explain in the hint |
| Admin closing a program cascades to batches and may surprise | The badge and edit control make the result visible; no confirmation dialog was requested |
| Reopening a program does not restore batches | Explicit badge/hint; documented in FR-5 and acceptance #9 |
| Fee changes affect existing totals | Accepted by decision 16; payments are out of scope; no stored fee is introduced |
| Hardcoded API base in both frontends | Pre-existing deployment concern; not changed here |
| Submit 400/409 still routes to the status panel (`apply.js` submit catch) | Out of scope; the new refresh reduces the chance of a stale selection, but a last-second change can still hit it. Follow-up: keep the trainee on Step 4 with the server message |
| Admin list badge replaces the raw status badge | Status remains editable in the modal and its effect is encoded in the hidden reason; avoids two competing badges |

---

## 16. Out of scope / follow-ups

1. Fix the submit-error branch so a stale program/batch keeps the trainee on Step 4 instead of switching to the status panel.
2. Delete/archive programs and batches (needed for cleaning up test data through the UI).
3. Manual ordering of programs/batches, or ordering by next intake date.
4. Fee snapshots on applications and payment reconciliation.
5. Showing open programs and next intake dates on the trainee dashboard.
6. A public read-only programs endpoint for the landing page.
7. A `Draft`/`Published` workflow or an admin preview of the trainee view.
8. Automated regression tests in the repo for visibility rules.

---

## 17. Assumptions to confirm during implementation

1. The trainee endpoint may include programs with `batches: []`; the form filters them. This was chosen to keep the endpoint a complete availability snapshot while obeying "hide no-batch programs" in the UI.
2. Full program options remain selectable in the Program dropdown, with all batch options disabled, so the trainee can see why they cannot continue. The alternative — disabling the program option itself — would hide the explanation.
3. A batch created under a Closed program is created Closed rather than rejected, so the admin's data entry is not lost.
4. Past-date comparison uses the server's local calendar date; no timezone library is added.
5. Existing past-dated batches can still be edited when the date itself is unchanged.
6. The admin badge replaces the raw status badge rather than adding a second badge.
