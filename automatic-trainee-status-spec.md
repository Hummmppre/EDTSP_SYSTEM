# Automatic Trainee Enrolment Status — Feature Spec

**Status:** Draft for approval
**Requested:** “in the admin trainee management make the status automatic”
**Scope agreed in interview:** Enrolment status becomes system-derived instead of an admin-editable dropdown. Account access stays manual. Status is computed from the trainee’s newest approved application, the training batch’s end date, and assessment results tied to the trainee’s program. Admins cannot override the enrolment status.

---

## 1. Problem and outcome

Today `TraineeProfile.enrollmentStatus` is a manually selected field:

- The admin Trainee management page opens a Manage dialog with an **Enrolment status** dropdown (`Pending`, `Ongoing`, `Completed`, `Inactive`).
- `PUT /api/admin/trainees/:userId` accepts that value and writes it to `TraineeProfile`.
- Approving an application sets `enrollmentStatus = "Ongoing"` in `applicationAdminController.decideApplication`.
- Nothing later advances the status. A finished batch leaves trainees Ongoing forever, and an inactive account does not affect enrolment status.

After this change:

- Enrollment status is derived from real records and shown read-only.
- Approval starts a trainee as **Ongoing** immediately, even when the batch intake date is in the future.
- A trainee becomes **Completed** after the batch end date has passed **and** every program-linked assessment is graded.
- A trainee with inactive account access is **Inactive**, unless completion criteria are met or the trainee is already Completed.
- Completed is terminal: later account inactivity, batch date changes, or program setting changes never demote it.
- Existing trainees are backfilled automatically once the migration/backfill runs.
- The trainee sees the current status and a persistent in-portal banner for terminal states. No email is sent.

---

## 2. Current system context

### Backend

| Area | Current behavior |
| --- | --- |
| `backend/models/TraineeProfile.js` | `enrollmentStatus` enum `Pending`, `Ongoing`, `Completed`, `Inactive`; default `Pending`. |
| `backend/controllers/traineeAdminController.js` | `getTrainees` lists users with role `trainee`, joins profiles and newest approved applications. `updateTrainee` accepts `enrollmentStatus` and writes it. `summarize` counts the stored statuses. |
| `backend/controllers/applicationAdminController.js` | `decideApplication` sets `enrollmentStatus: "Ongoing"` when an application is approved. |
| `backend/controllers/traineeController.js` | `getMyProfile` returns the stored profile; `updateMyProfile` only allows phone/address. |
| `backend/controllers/applicationController.js` | `getMyApplication` and `submitApplication` block application when the stored status is `Ongoing` or `Completed`. |
| `backend/models/Batch.js` | Has `intakeDate`, `slotCapacity`, `filledCount`, `status`; no end date. |
| `backend/models/Program.js` | Has name, description, fee, status; no assessment requirement. |
| `backend/models/Assessment.js` | Has user, title, subject, type, dates, score, totalScore, status; no program link. |
| `backend/controllers/assessmentAdminController.js` | Creates assessments for selected active trainees and grades them; no program association. |
| `backend/controllers/programController.js` | Creates/updates programs and batches; validates intake date but not an end date. |

### Frontend

| File | Current behavior |
| --- | --- |
| `frontend/admin/trainees.html` | Manage modal contains `#enrollmentStatusInput` with the four statuses. Table has a Status column and filter. |
| `frontend/js/admin-trainees.js` | Sends `enrollmentStatus` in the PUT body and renders the stored badge. |
| `frontend/admin/programs.html` / `frontend/js/admin-programs.js` | Batch forms have label, capacity, intake date, status; no end date. Program forms have name, description, fee, status. |
| `frontend/admin/assessments.html` / `frontend/js/admin-assessments.js` | Create-assessment modal lists active trainees but does not associate the assessment with a program. |
| `frontend/trainee/dashboard.html` / `frontend/js/dashboard.js` | Shows enrolment status card from `profile.enrollmentStatus`. No status-change banner. |
| `frontend/js/apply.js` | Uses API `canApply`; the backend decides based on the stored status. |

### Terms used in this spec

- **Newest approved application:** the `TrainingApplication` for the trainee with `status: "Approved"`, sorted by `decidedAt` descending, then `submittedAt` descending. This matches the current trainee listing and payment ledger convention.
- **Current program:** the `Program` referenced by the newest approved application.
- **Current batch:** the `Batch` referenced by the newest approved application.
- **Program assessment:** an `Assessment` whose `user` is the trainee and whose `program` is the current program.
- **End date passed:** the server’s local calendar date is after the batch `endDate` (the end date is inclusive; completion can occur the next calendar day).
- **All graded:** there is at least one program assessment and every one has `status === "Graded"`. Score is irrelevant.
- **Terminal Completed:** once the stored status becomes `Completed`, no automatic recalculation changes it.

---

## 3. Decisions locked in the interview

| Topic | Decision |
| --- | --- |
| Status field | Only **Enrolment status** becomes automatic. Account access (`User.status`) remains a manual admin control. |
| Status driver | Newest approved application + batch end date + program-linked assessment results. |
| Batch end date | Add an explicit end date to every batch. New batches require it. Existing batches without one must be edited by an admin. |
| Completion rule | Completed only when the batch end date has passed **and** all program assessments are graded. Both conditions are required. |
| Passing rule | “Graded” means `Assessment.status === "Graded"`; any score counts. No passing threshold is introduced. |
| Assessment scope | Add a program reference to assessments. Only assessments for the trainee’s current program count. |
| Program assessment gate | Programs have a `requiresAssessments` setting. New programs default to requiring assessments; an admin can opt out. |
| Zero assessments | For a program that requires assessments, zero assessments means the trainee stays Ongoing, not Completed. |
| Missing end date | A batch without an end date never auto-completes its trainees. The admin sees a warning and must enter the date. |
| Future batch | Approval immediately sets the trainee to Ongoing, even if the intake date is in the future. |
| Ended with ungraded work | The trainee stays Ongoing until every program assessment is graded. |
| Inactive rule | Inactive account access produces Inactive, except when completion criteria are met or the status is already Completed. Completed always wins. |
| Completed behavior | Completed is terminal. Extending the end date, inactivating the account, or changing the assessment requirement does not reopen it. |
| Manual override | None. The admin dropdown and the `enrollmentStatus` PUT input are removed; the API rejects manual status writes. |
| Recalculation timing | On relevant reads and after relevant writes. No scheduled/cron job. |
| Status history | Current status only. No status timeline or audit log. A derived reason is shown; no history is stored. |
| Existing trainees | Backfill automatically with an idempotent migration/backfill step. |
| Notifications | No email. A persistent in-portal banner reflects terminal status. |
| Multiple approved applications | The newest approved application drives the current program, batch, and status. |
| Legacy assessments | Existing assessments remain unattached (`program: null`) and are excluded from completion checks. |

---

## 4. Status model

### 4.1 Status meanings

| Status | Meaning after this change |
| --- | --- |
| `Pending` | Active account, no approved application yet. Includes newly registered trainees, applicants under review, rejected applicants, and withdrawn applicants. |
| `Ongoing` | Active account with an approved application whose batch has not ended, has no end date, or has outstanding program assessments. |
| `Completed` | Batch ended and the program’s assessment requirement is satisfied. Terminal. |
| `Inactive` | Account access is inactive, and the trainee is neither Completed nor eligible for Completed. |

No new status values are introduced.

### 4.2 Precedence

1. **Stored Completed is terminal.** If `TraineeProfile.enrollmentStatus === "Completed"`, return Completed immediately. No later condition can change it.
2. **Fresh completion criteria.** If the trainee has a newest approved application, the batch end date has passed, and the program assessment gate is satisfied, return Completed. This is evaluated before account inactivity so Completed wins for an eligible trainee.
3. **Inactive account.** If `User.status !== "active"`, return Inactive.
4. **No approved application.** If there is no newest approved application, return Pending.
5. **Missing batch end date.** Return Ongoing with a “Batch end date is missing” reason.
6. **Batch not ended.** If the current date is on or before the end date, return Ongoing with “Training in progress”.
7. **Program has no assessment gate.** If `program.requiresAssessments === false`, return Completed.
8. **No program assessments.** Return Ongoing with “No assessments recorded”.
9. **Ungraded assessments remain.** Return Ongoing with “N assessment(s) awaiting grades”.
10. **All program assessments graded.** Return Completed.

If the program or batch record referenced by an approved application is missing, return Ongoing with an admin-facing reason (“Program record unavailable” / “Batch record unavailable”) rather than throwing.

### 4.3 Completion evaluation

Use the following predicate for steps 2 and 7–10:

```text
hasApprovedApplication
  AND batch.endDate exists
  AND today > batch.endDate          // date-only comparison; end date is inclusive
  AND (
    program.requiresAssessments === false
    OR (
      count(program-linked assessments) > 0
      AND count(program-linked assessments with status !== "Graded") === 0
    )
  )
```

Important consequences:

- A program with no assessments and `requiresAssessments: true` can never auto-complete. The admin must create program-linked assessments or turn off the program’s assessment gate.
- An assessment with status `Pending` or `Completed` blocks completion. Only `Graded` satisfies the gate.
- A future intake date does not delay Ongoing. Approval is enough.
- A batch that is manually `Closed` before its end date does not itself change status. Only `endDate` and the assessment gate drive completion. The admin sees the batch state separately.
- A trainee whose account becomes inactive while training is Inactive. If the account is reactivated, the next read recomputes Pending/Ongoing/Completed from current data.
- A trainee who satisfies completion criteria while the account is inactive becomes Completed, because completion is checked first. Completed then remains sticky.

### 4.4 Derived reason

The API returns a human-readable reason alongside the status. It is generated on read and is not stored as history.

| Condition | Reason copy |
| --- | --- |
| Stored Completed | “Training completed.” |
| Completed criteria met | “Batch ended and all required assessments are graded.” or “Batch ended; this program has no assessment requirement.” |
| Inactive account | “Account access is inactive.” |
| No approved application | “No approved training application.” |
| Missing batch end date | “Batch end date is missing.” |
| Before end date | “Training in progress until <date>.” |
| Requires assessments, none recorded | “No program assessments recorded.” |
| Requires assessments, ungraded | “N assessment(s) awaiting grades.” |
| Missing program/batch | “Training record is incomplete.” |

`outstandingAssessments` is the number of program assessments with `status !== "Graded"`; it is `0` when no assessments exist or the program does not require them.

### 4.5 Status matrix

| Account | Approved app | Batch end date | Program assessments | Result |
| --- | --- | --- | --- | --- |
| Active | No | — | — | Pending |
| Inactive | No | — | — | Inactive |
| Active | Yes | Missing | Any | Ongoing — missing end date |
| Inactive | Yes | Missing | Any | Inactive |
| Active | Yes | Future | Any | Ongoing — training in progress |
| Inactive | Yes | Future | Any | Inactive |
| Active | Yes | Passed | Not required | Completed |
| Inactive | Yes | Passed | Not required | Completed |
| Active | Yes | Passed | Required, none | Ongoing — no assessments |
| Active | Yes | Passed | Required, some Pending | Ongoing — awaiting grades |
| Active | Yes | Passed | Required, all Graded | Completed |
| Inactive | Yes | Passed | Required, all Graded | Completed |
| Inactive | Yes | Passed | Required, some Pending | Inactive |
| Any | Any | Any | Any, already Completed | Completed (locked) |

---

## 5. Data model changes

### 5.1 `Batch` — add `endDate`

`backend/models/Batch.js`:

```js
endDate: {
    type: Date,
    default: null
}
```

Rules:

- Stored as a date-only value at local midnight, matching the existing `intakeDate` convention in `programController.startOfDay`.
- Required by the API for **new** batches.
- Nullable at the schema level so existing batches remain valid until an admin edits them.
- May be set on an existing batch through the edit form.
- Must be on or after `intakeDate` when both are present.
- Cannot be cleared once set. The edit form can change it to another date.
- End date is inclusive: training is active through the end date; completion is possible the following calendar day.
- The API and UI must surface “End date missing” for any batch with a null `endDate`.

### 5.2 `Program` — add `requiresAssessments`

`backend/models/Program.js`:

```js
requiresAssessments: {
    type: Boolean,
    default: true
}
```

Rules:

- New programs default to `true`.
- Existing programs with no value are treated as `true` by the derivation code.
- The create/edit program form has a checkbox, default checked: “Requires all assessments to be graded before completion.”
- Turning it off means a trainee can complete at the batch end date without assessments.
- Turning it on after a trainee is already Completed does not reopen them.

### 5.3 `Assessment` — add `program`

`backend/models/Assessment.js`:

```js
program: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Program",
    default: null,
    index: true
}
```

Rules:

- New assessments are automatically associated with the trainee’s current program at creation time.
- `program` is nullable at the schema level so legacy assessments can remain valid.
- Legacy assessments with `program: null` are excluded from completion checks.
- No backfill assigns a program to legacy assessments. This is deliberate: an old assessment must never accidentally complete a trainee in a new program.
- `createAssessment` resolves the newest approved application for each selected trainee before inserting anything. If any selected trainee has no approved program, the request fails with `400` and creates no assessments. The admin assessment trainee list should therefore show only active trainees with an approved program (see §7.4).
- Grading an assessment does not change its program link.

Add an index for the completion lookup:

```js
assessmentSchema.index({ user: 1, program: 1, status: 1 });
```

### 5.4 `TraineeProfile`

No new persistent fields. Keep `enrollmentStatus` as the stored slot for the derived value. Do not add a status-history collection or timeline.

The derived reason and outstanding-assessment count are response fields, not database columns.

---

## 6. Backend design

### 6.1 New shared helper: `backend/lib/traineeStatus.js`

Create one module so every read/write path uses the same rules:

```text
STATUS = { PENDING, ONGOING, COMPLETED, INACTIVE }

deriveTraineeStatus({ user, profile, application, program, batch, assessments, now })
  -> { status, reason, outstandingAssessments, batchEndDate }

refreshTraineeStatus(userId)
  -> { status, reason, outstandingAssessments, batchEndDate, changed }

refreshTraineeStatuses(userIds)
  -> Map<userId, statusResult>
```

The helper must:

- Load the user, profile, newest approved application, populated program (`name`, `requiresAssessments`), populated batch (`label`, `endDate`, `status`), and program-linked assessments.
- Use the precedence in §4.2.
- Treat a missing `requiresAssessments` value as `true`.
- Use date-only comparisons and the same server-local `startOfDay` convention as `programController`.
- Return reason strings and `outstandingAssessments`.

### 6.2 Persisting the derived status

- If the profile exists, update `enrollmentStatus` only when the derived value differs.
- Use an atomic guard so a concurrent request cannot overwrite a terminal Completed:
  - For a derived **Completed**, update with `{ $set: { enrollmentStatus: "Completed" } }`.
  - For any other derived status, filter with `{ user, enrollmentStatus: { $ne: "Completed" } }`.
  - If the guarded update matches nothing because the record is already Completed, reload/return Completed.
- Do not create a `TraineeProfile` from a read path. Existing behavior creates one on `GET /api/trainee/me`; keep that. Approval already upserts a profile.
- If the profile does not exist, return the derived status without writing it. The next profile-creating path will store it.
- Recalculation is best-effort after a primary write. If the refresh fails after a successful grade, approval, or batch update, log the error and preserve the primary write; the next read recomputes. Do not return a 500 solely because the status refresh failed after the main record was committed.

### 6.3 Read/write call sites

| Location | Change |
| --- | --- |
| `traineeAdminController.getTrainees` | Refresh all returned trainees in one batch; use computed statuses for rows, summary, filter data. Include reason, batch end date, and outstanding count. |
| `traineeAdminController.loadTrainee` | Refresh the trainee before building the row. |
| `traineeAdminController.updateTrainee` | Remove `enrollmentStatus` from accepted fields. If the body contains it, return `400` with “Enrolment status is automatic and cannot be set manually.” Keep account access, trainee ID, phone, address, and the existing validation. After saving, refresh. |
| `traineeController.getMyProfile` | After creating/finding the profile, refresh and return the computed fields on the profile view. |
| `applicationController.getMyApplication` | Refresh before checking `canApply` so a stale Pending cannot allow a duplicate application after approval. |
| `applicationController.submitApplication` | Refresh before the Ongoing/Completed checks for the same reason. |
| `applicationAdminController.decideApplication` | After the approval profile upsert, refresh the trainee. Do not rely only on the explicit `$set: { enrollmentStatus: "Ongoing" }`. If refresh fails, approval still succeeds. |
| `assessmentAdminController.createAssessment` | Resolve and store each trainee’s current program; reject the whole request if any selected trainee lacks one. Refresh affected trainees after insert. |
| `assessmentAdminController.gradeAssessment` | After saving the grade, refresh that trainee. |
| `programController.updateProgram` | When `requiresAssessments` changes, refresh trainees with approved applications for that program. |
| `programController.updateBatch` | When `endDate` changes, refresh trainees with approved applications in that batch. |
| `programController.createBatch` / `createProgram` | Validate and store `endDate`; no status refresh is needed for a brand-new empty batch. |

### 6.4 API contract changes

#### `GET /api/admin/trainees`

Each trainee row keeps its current fields and adds:

```json
{
  "enrollmentStatus": "Ongoing",
  "enrollmentStatusReason": "2 assessments are awaiting grades.",
  "outstandingAssessments": 2,
  "batchEndDate": "2026-12-31T00:00:00.000Z"
}
```

- `enrollmentStatus` is the computed value, not merely the stored value.
- `summary` counts the computed statuses.
- Status filtering remains client-side over row data.

#### `PUT /api/admin/trainees/:userId`

Allowed body fields:

```json
{
  "traineeId": "EDT-2026-001",
  "phone": "...",
  "address": "...",
  "accountStatus": "active"
}
```

- `enrollmentStatus` is rejected with `400` if present.
- `accountStatus` remains `active` / `inactive`.
- The response carries the refreshed trainee row, including the computed status and reason.

#### `GET /api/trainee/me`

Return the profile plus computed status fields:

```json
{
  "success": true,
  "user": { "...": "..." },
  "profile": {
    "enrollmentStatus": "Completed",
    "enrollmentStatusReason": "Batch ended and all required assessments are graded.",
    "outstandingAssessments": 0,
    "batchEndDate": "2026-11-30T00:00:00.000Z"
  }
}
```

The existing `enrollmentStatus`, `program`, `traineeId`, phone, and address fields remain for current dashboard code.

#### `GET /api/admin/programs`

- Each program includes `requiresAssessments`.
- Each batch includes `endDate`.
- `getPrograms` and `batchView` must return those fields so the admin UI can render and edit them.

#### `POST /api/assessments`

- The request body is unchanged.
- The server resolves `program` per trainee from the newest approved application.
- If any trainee lacks an approved program, return `400`; insert nothing.
- Response assessments include `program`.

#### `PUT /api/assessments/:id/grade`

- Behavior remains the same, then refresh the trainee status.
- A grade that satisfies the last outstanding assessment can complete the trainee if the batch has ended.

### 6.5 Date and validation rules

`parseEndDate` / equivalent in `programController`:

- Accept `YYYY-MM-DD` or an ISO date string, matching `parseDateOnly`.
- Empty value for a new batch → `400`: “Please provide a batch end date.”
- Empty value on an existing batch update → leave the existing value unchanged; do not clear it.
- Invalid date → `400`: “Enter a valid batch end date.”
- If `intakeDate` is present and `endDate < intakeDate` → `400`: “Batch end date cannot be earlier than the intake date.”
- No blanket future-date restriction; historical end dates may be entered when fixing legacy batch records.
- Do not use the current `parseIntakeDate` future restriction for end dates.

### 6.6 Backfill

Add `backend/scripts/backfillTraineeStatuses.js` and an npm script, for example:

```json
"backfill:trainee-status": "node scripts/backfillTraineeStatuses.js"
```

Script behavior:

1. Connect with the existing `config/db` / `.env` setup.
2. Set `requiresAssessments: true` on programs missing the field (or rely on the derivation default; setting it makes the data explicit).
3. Iterate every trainee user/profile and compute the status using the same helper.
4. Save changed statuses; preserve existing Completed values.
5. Do **not** assign programs to legacy assessments; leave `program: null`.
6. Do **not** invent batch end dates.
7. Log counts: users scanned, statuses changed, completed, inactive, pending, ongoing, skipped/no profile.
8. Be idempotent; safe to run again.
9. Support `--dry-run` to report without writing.

Run this once as part of rollout. Because every relevant read also recomputes, the application remains usable before the backfill finishes.

**Backfill consequence to state in release notes:** existing approved trainees whose batches have no end date will remain Ongoing until an admin enters the end date. Existing assessments have no program link, so they do not count toward completion; the admin must create program-linked assessments or turn off the program’s assessment requirement.

---

## 7. Frontend changes

### 7.1 Admin Trainee management — `frontend/admin/trainees.html`

- Remove the editable `<select id="enrollmentStatusInput">` from the Manage dialog.
- Replace it with a read-only status block:
  - current status badge using the existing `status-badge` classes;
  - a small “Automatic” label;
  - the derived reason (for example, “2 assessments are awaiting grades”);
  - batch end date when present.
- Add a “Status reason” row to the modal facts.
- Keep the table Status column and the status filter. The table badge shows the computed status.
- Keep the existing account-inactive note. It is separate from the enrolment badge.
- Do not add a manual “fix status” control anywhere.

Suggested markup after the trainee ID field:

```html
<div class="field">
    <span class="field__label">Enrolment status</span>
    <span class="status-badge ongoing" id="traineeStatusBadge">Ongoing</span>
    <p class="field__hint" id="traineeStatusReason">Training in progress.</p>
</div>
```

Use existing classes; no new CSS is required. If the badge needs a wrapper for spacing, reuse `.field`.

### 7.2 Admin Trainee management — `frontend/js/admin-trainees.js`

- Remove `enrollmentInput` lookup and its value assignments.
- Remove `enrollmentStatus` from the PUT body.
- Render the computed status badge and reason from the API.
- Add the status reason and end date to `openModal`.
- Keep search, filter, summary, account-status, trainee ID, phone, and address behavior.
- The table row data should still use `row.dataset.status = trainee.enrollmentStatus`.

### 7.3 Admin Programs — batch end date and assessment gate

`frontend/admin/programs.html`:

- Add a checkbox to the program create/edit form:
  - label: “Requires all assessments to be graded before completion”
  - default: checked
  - edit state: current `requiresAssessments`
- Add `firstBatchEnd` date input to the first-batch fieldset.
- Add `batchEnd` date input to the batch create/edit modal.
- Label end date as required for new batches.
- Add hint: “Trainees complete the day after this date, once all required assessments are graded.”
- Do not remove the existing program/batch status controls.

`frontend/js/admin-programs.js`:

- Read/write `requiresAssessments`.
- Read/write `endDate` for first and later batches.
- Validate end date on the client:
  - required for a new batch;
  - not earlier than intake date when both are set;
  - valid date.
- Send `endDate` as `YYYY-MM-DD` or the existing API’s accepted date format.
- Render batch metadata with `Ends <date>` or `End date missing`.
- For a batch with no end date, add a visible note: “Trainees in this batch stay Ongoing until an end date is entered.”
- Show program assessment setting in the program facts: “Assessments: required” / “Assessments: not required”.

### 7.4 Admin Assessments — program association

- Keep the existing create-assessment form; do not add a program selector.
- The server assigns each assessment to the selected trainee’s current program.
- Add a note to the form: “Assessments are linked to each trainee’s current approved program.”
- Add a Program column to the assessment table and populate it from the API.
- `GET /api/assessments/trainees` should return only active trainees with an approved program, plus `programName`, so the admin cannot select an unlinked trainee. If the endpoint is kept broad, disable or omit trainees without an approved program and explain why.
- Legacy assessments with no program display `—` / “Unassigned” and do not count toward completion.

### 7.5 Trainee dashboard — status banner

`frontend/trainee/dashboard.html`:

- Add a status notice element near the existing page feedback, using the existing `.state state--inline` pattern:

```html
<p class="state state--inline" id="enrollmentStatusNotice" role="status" hidden></p>
```

`frontend/js/dashboard.js`:

- After the profile loads, show a persistent banner based on current status:
  - `Completed`: “Training complete. Your batch has ended and your required assessments are graded.”
  - `Inactive`: “Your enrolment is inactive because your account access is inactive. Contact the training office.”
  - Other statuses: keep the existing status card; do not show a banner.
- This is not a one-time “changed” notice and does not require history. It appears whenever the current status is terminal.
- Do not send email.
- The existing status card remains and should use the new reason when available.

### 7.6 Trainee application page

`frontend/js/apply.js` needs no new UI. Its `canApply` behavior comes from the backend, which now refreshes the status before deciding. The existing read-only enrolled/completed states remain.

---

## 8. Migration and rollout order

1. Deploy the schema/API changes.
2. Deploy the admin/trainee UI changes.
3. Run `npm run backfill:trainee-status -- --dry-run`, review counts.
4. Run `npm run backfill:trainee-status`.
5. Admins enter missing batch end dates in Programs.
6. Admins review programs’ assessment requirement and existing assessments.
7. Verify with the acceptance scenarios in §11.

No data is deleted. No existing assessment is assigned to a program automatically. No batch end date is invented.

### Existing data effects

- A trainee with an approved application but no batch end date remains Ongoing.
- A trainee with a manually set Completed status remains Completed because Completed is terminal.
- A trainee with a manually set Inactive status and an active account is recomputed to Pending/Ongoing/Completed.
- A trainee with no approved application and an active account becomes/remains Pending.
- A trainee whose account is inactive becomes Inactive unless their completion criteria are met or they are already Completed.
- Legacy assessments (`program: null`) never affect completion.

---

## 9. Edge cases and required behavior

| # | Situation | Required behavior |
| --- | --- | --- |
| E1 | New signup, no application | Pending on admin list and dashboard. |
| E2 | Open application, no approval | Pending; application remains visible. |
| E3 | Approved application, future intake date | Ongoing immediately. |
| E4 | Batch has no end date | Ongoing; admin sees a missing-end-date warning. |
| E5 | Batch end date is today | Still Ongoing; completion is possible the next calendar day. |
| E6 | Batch ended, program requires assessments, none exist | Ongoing; reason “No program assessments recorded.” |
| E7 | Batch ended, one assessment Pending/Completed | Ongoing; reason counts outstanding assessments. |
| E8 | Batch ended, all program assessments Graded | Completed. |
| E9 | Batch ended, program `requiresAssessments: false` | Completed regardless of assessment status. |
| E10 | Account inactive during training | Inactive; on reactivation recompute. |
| E11 | Account inactive and completion criteria are met | Completed (completion wins). |
| E12 | Completed account later set inactive | Remains Completed. |
| E13 | Completed batch end date later extended | Remains Completed. |
| E14 | Program assessment gate turned on after completion | Remains Completed. |
| E15 | Admin sends `enrollmentStatus` manually | `400`; no write. |
| E16 | Admin changes account access | Status recomputes on the response and next read. |
| E17 | Admin grades the last outstanding assessment after batch end | Status becomes Completed immediately in the response/next read. |
| E18 | Two concurrent requests compute different statuses | Terminal Completed cannot be overwritten by a non-Completed update. |
| E19 | Assessment created for trainee with no approved program | `400`; no assessments inserted. |
| E20 | Legacy assessment with no program | Displayed as unassigned; excluded from completion. |
| E21 | Program or batch record missing/incomplete | Ongoing with an admin-facing reason; no 500. |
| E22 | Backfill run twice | Second run changes nothing and reports zero changes. |
| E23 | Admin extends a batch before completion | Trainee remains/returns Ongoing until the new end date and grades are satisfied. |
| E24 | Batch closed early before end date | Batch status changes; enrolment remains Ongoing until end date/assessment rules. |
| E25 | Trainee account reactivated after Inactive | Next read derives Pending/Ongoing/Completed from current data. |

---

## 10. Worked end-to-end status timeline

This example follows one trainee through the full lifecycle. The dates are illustrative; the rules compare server-local calendar dates. “Recompute” means the shared status helper ran on a relevant read or after a relevant write. This timeline is reconstructed from the trainee, application, batch, and assessment records; it is not stored as a status-history log.

### 10.1 Scenario setup

- **Program:** Dairy Production Training, `requiresAssessments: true`.
- **Batch:** Batch 2026-A, intake `2026-02-01`, end `2026-04-30`.
- **Assessments:** two program-linked assessments, “Safety” and “Milking Practical”.
- **Account:** active at signup.
- **Completion rule applicable here:** the batch end date must have passed and both assessments must be graded.

### 10.2 Timeline

| # | Date | Event or trigger | Key data after the event | Status after refresh | Reason and visible result |
| --- | --- | --- | --- | --- | --- |
| 1 | 2026-01-05 | Maria signs up. `GET /api/trainee/me` creates her profile. | Active account; no approved application. | **Pending** | “No approved training application.” Admin list and dashboard show Pending. |
| 2 | 2026-01-08 | Maria submits an application. | Application is `Submitted`; no approved application yet. | **Pending** | “No approved training application.” The application page shows the Submitted status; there is no separate “Applied” enrolment status. |
| 3 | 2026-01-15 | Admin approves the application. | Newest approved application points to Batch 2026-A; end date is in the future. | **Ongoing** | “Training in progress until Apr 30, 2026.” Approval starts Ongoing immediately; the Feb 1 intake date does not delay it. |
| 4 | 2026-02-01 | Batch intake date. | Same records; no status change. | **Ongoing** | “Training in progress until Apr 30, 2026.” |
| 5 | 2026-03-15 | Admin creates the two assessments. | Both assessments are linked to Dairy Production Training and start as `Pending`. | **Ongoing** | “Training in progress until Apr 30, 2026.” The assessment gate is not evaluated until the batch ends. |
| 6 | 2026-04-20 | Admin grades “Safety”. | Safety is `Graded`; Milking Practical is still `Pending`. | **Ongoing** | Training is still in progress; the batch has not ended. |
| 7 | 2026-04-30 | Batch end date. | The end date is today; the end date is inclusive. | **Ongoing** | “Training in progress until Apr 30, 2026.” The trainee does not complete on the end date itself. |
| 8 | 2026-05-01 | First read after the end date. | End date has passed; Safety is `Graded`; Milking Practical is `Pending`. | **Ongoing** | “1 assessment awaiting grade.” This is the deliberate holding state: the batch ended, but the assessment gate is not satisfied. |
| 9 | 2026-05-04 | Admin grades “Milking Practical”. | End date has passed; both program assessments are `Graded`. | **Completed** | “Batch ended and all required assessments are graded.” The dashboard shows the persistent Completed banner. The stored status is now terminal. |
| 10 | 2026-05-10 | Admin extends the batch end date to 2026-06-30. | Stored status is already `Completed`; the new end date is in the future. | **Completed** | “Training completed.” Completed is terminal, so extending the batch does not reopen the enrolment. |
| 11 | 2026-06-01 | Admin sets Maria’s account access to inactive. | Stored status is `Completed`; `User.status` is now `inactive`. | **Completed** | “Training completed.” The separate account-inactive note appears on the admin record, but the enrolment badge stays Completed because Completed wins. |
| 12 | 2026-06-10 | Admin reactivates Maria’s account. | Stored status remains `Completed`. | **Completed** | “Training completed.” Reactivation does not change a terminal status. |

### 10.3 What each surface shows

| Point in the timeline | Admin Trainee management | Trainee dashboard | Application page |
| --- | --- | --- | --- |
| Steps 1–2 | Pending badge; reason “No approved training application.” | Pending status card. | Application submitted; no enrolment action. |
| Step 3 | Ongoing badge; batch end date shown. | Ongoing status card. | Read-only enrolled state; no new application. |
| Steps 5–8 | Ongoing badge; reason names outstanding assessments once the end date has passed. | Ongoing status card; reason explains what is pending. | Read-only enrolled state. |
| Step 9 | Completed badge; reason confirms the end date and grades. | Completed status card plus the persistent completion banner. | Completed read-only state. |
| Steps 10–12 | Completed badge plus a separate “Account inactive” note when applicable. | Completed banner remains. | Completed read-only state. |

### 10.4 The important counterfactual

If Maria’s account had been set inactive on **2026-05-02**, while Milking Practical was still Pending, the next read would have produced **Inactive** (“Account access is inactive”). When the final grade was saved on **2026-05-04**, the completion predicate would be evaluated before the account-inactivity check, so the status would become **Completed** even though the account was still inactive. This is the intended meaning of “Completed wins.”

### 10.5 Why the end date and grade order matter

- If Milking Practical had been graded on **2026-04-29**, the status would still be Ongoing on April 29 and April 30 because the batch had not ended. It would become Completed on the first read after April 30.
- If the batch end date were missing, the trainee would remain Ongoing even after both assessments were graded; the admin would see “Batch end date is missing” until the batch was edited.
- If the program had `requiresAssessments: false`, the trainee would become Completed on the first read after April 30 without waiting for either assessment.
- If no assessments had been created and the program required them, the trainee would remain Ongoing after April 30 with “No program assessments recorded.”

---

## 11. Acceptance criteria

- [ ] The Manage trainee dialog has no editable enrolment status control.
- [ ] `PUT /api/admin/trainees/:userId` rejects `enrollmentStatus` with `400`; trainee ID, phone, address, and account access still update.
- [ ] Admin trainee rows show computed statuses and reasons; summary counts match the rows.
- [ ] A new trainee with no approved application displays Pending.
- [ ] An approved trainee with a future intake date displays Ongoing.
- [ ] A batch with no end date cannot complete its trainees and shows an admin warning.
- [ ] A batch whose end date has passed and whose program requires assessments with none recorded keeps the trainee Ongoing.
- [ ] A batch whose end date has passed and whose assessments are all Graded marks the trainee Completed.
- [ ] A program with `requiresAssessments: false` completes trainees at the end date.
- [ ] An inactive account displays Inactive unless completion criteria are met or the trainee was already Completed.
- [ ] Completed is never demoted by account inactivity, a later end date, or a program setting change.
- [ ] The trainee dashboard displays the persistent Completed/Inactive banner and no email is sent.
- [ ] The application page and submit endpoint use the refreshed status; an approved future-batch trainee cannot submit a duplicate application as Pending.
- [ ] New batches require an end date; existing batches can add one.
- [ ] New assessments store the trainee’s current program; legacy assessments remain unassigned and excluded.
- [ ] The backfill script is idempotent and reports accurate counts.
- [ ] No new npm dependencies or background scheduler are added.

---

## 12. Verification plan

There is no test framework in the repository (`npm test` is not configured). Use static checks plus live API/database scenarios.

### Static checks

- Run `node --check` on every changed backend file.
- Run the project’s existing syntax/lint checks if available.
- Inspect `git diff --check` for whitespace errors.

### API scenarios

Create temporary trainee/program/batch/assessment records, exercise the rules, then delete them.

1. New active trainee with no application → `GET /api/admin/trainees` returns Pending.
2. Approved application with future intake → refresh → Ongoing.
3. Set batch end date in the past and create zero program assessments → Ongoing; reason says no assessments.
4. Create one assessment in `Pending` → Ongoing with one outstanding.
5. Grade it → Completed if the end date has passed.
6. Repeat with `requiresAssessments: false` → Completed at end date even with no assessments.
7. Set account inactive on an Ongoing trainee → Inactive.
8. Set account inactive on a completed trainee → still Completed.
9. Extend a completed trainee’s batch end date → still Completed.
10. PUT `enrollmentStatus: "Pending"` → 400 and no change.
11. Create an assessment for a trainee without an approved program → 400 and no inserted records.
12. Run the backfill twice → second run reports zero changes.
13. Confirm a new batch without `endDate` → 400; with an end date → 201.
14. Confirm `GET /api/trainee/me` and `GET /api/applications/me` see the refreshed status.

### Manual UI checks

- Open Trainee management and confirm the read-only status, reason, and filter.
- Open Programs, create a batch with and without an end date, and confirm the validation/warning.
- Toggle the program assessment requirement and confirm the card copy.
- Create an assessment and confirm the Program column is populated.
- Log in as a trainee with Completed/Inactive status and confirm the banner; confirm the existing status card still works.
- Confirm no `enrollmentStatus` field is sent by `admin-trainees.js`.

### Cleanup

Delete every temporary test user, profile, application, program, batch, assessment, and payment fixture created for verification. Re-run the standard database counts to confirm no test records remain.

---

## 13. Out of scope / non-goals

- Automatic account access changes. `User.status` remains manual.
- New status values such as “For completion”, “Dropped”, or “Withdrawn”.
- A scheduled/cron job or background worker.
- Email notifications for automatic status changes.
- A status-history/audit timeline.
- Automatic grading or passing thresholds.
- Automatic completion based only on elapsed time; an end date and the assessment gate are required.
- Backfilling programs onto legacy assessments.
- Inventing end dates for existing batches.
- Editing an assessment’s program after creation.
- Reopening Completed trainees through the admin UI.
- Changing the application review/approval workflow, payment ledger, cow maintenance, or Google Calendar integration.

---

## 14. Risks and deliberate consequences

1. **Completed is irreversible without direct database intervention.** A wrong batch end date or an incorrect final grade can complete a trainee permanently because there is no override and no history-based rollback. The admin should enter end dates carefully. A future “reopen with reason” feature would be a separate request.
2. **Legacy assessments do not count.** Existing assessments remain unassigned, so current trainees cannot satisfy the assessment gate with them. The admin must create new program-linked assessments or turn off the program’s requirement. This is intentional to avoid old records completing a new program.
3. **No scheduler means no background update.** A batch end date passing alone does not rewrite the database until someone reads a relevant record. Every visible/admin/trainee path recomputes, so users do not see a stale value.
4. **No history means no audit trail.** The UI explains the current reason but cannot show when a transition happened or what the previous status was.
5. **Pending has no separate “applied” meaning.** Applicants with Submitted/Under review applications still display Pending, matching the existing four-status model.
6. **Batch closure is not completion.** Closing a batch early only changes the batch’s Open/Closed state; trainees remain Ongoing until the end date and assessment gate are satisfied.
7. **Assessment creation is narrower.** Assessments can only be created for active trainees with an approved program. This is required so every new assessment has a program to count against; allowing unlinked new assessments would silently prevent completion.
