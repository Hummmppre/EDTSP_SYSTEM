# Dashboard live data — specification

Status: design agreed in interview · Date: 2026-11-14
Pages: `frontend/admin/dashboard.html`, `frontend/trainee/dashboard.html`
Backend: no changes (reuse existing endpoints)

## 1. Goal

Both dashboards currently show invented figures. Replace every figure that the
database can support with live data, keep the remaining demo content clearly
labelled, and reuse the existing API instead of adding endpoints.

Success means an administrator can open the dashboard and see the real trainee,
assessment, and enrolment numbers, and a trainee can open theirs and see the
real balance, assessment average, pending work, and enrolment status — with the
same values as the module pages they link to.

## 2. Decisions from the interview

| Topic | Decision |
| --- | --- |
| Scope | Admin dashboard **and** trainee dashboard |
| Admin cards | Keep the current four: Total trainees, Active trainees, Total assessments, Pending assessments |
| Admin panel | Keep "Recent assessments", populated live |
| Refresh | Load once per page visit (no polling, no refresh button) |
| Trainee cards | Balance, Assessment average, Pending assessments, Enrolment status |
| Trainee demo content | Only Cow maintenance stays as clearly labelled sample data; the Training progress panel is removed because there is no module/progress model in the database |
| Headcounts | Total = all users with role `trainee`; Active = `enrollmentStatus === "Ongoing"` (account access does not affect it) |
| Pending assessments | Status `Pending` or `Completed` (only `Graded` is finished) |
| Admin pending card label | Keep "Pending assessments"; change the note to say it includes completed-but-ungraded records |
| Trainee pending card label | Same "Pending assessments" label and meaning |
| Trainee average | Average of normalized scores, displayed as `NN/100` (raw points on a 100 scale) |
| Average with no graded records | `—` |
| Recent rows | Newest 5 assessments, all statuses |
| Recent row date | `assessmentDate`, falling back to `createdAt` |
| Links | Every summary card links to its module page; recent rows link to `assessments.html` |
| Card links | Plain page links, no query-string filters |
| Trainee fee panel | Make it fully live |
| Trainee profile status | Show enrolment status (not account access) |
| No approved application | Balance shows `₱0` with "No fee assigned yet" |
| Loading | Keep zeros, show a small "Loading dashboard data…" note |
| Failure | One inline banner naming what failed; sections that loaded still render; failed values stay at zero |
| Data source | Reuse existing endpoints with parallel fetches |

## 3. Current state

### Admin dashboard (`frontend/admin/dashboard.html`)

- Loads only `../js/admin.js` and `../js/portal.js`; `admin.js` handles auth,
  logout, and the pending-application sidebar badge.
- Header has a `demo-tag` reading "Demo data"; footer says figures are demo.
- Four static cards: 24 trainees, 18 active, 32 assessments, 12 pending.
- "Recent assessments" table has three fabricated rows (Juan Dela Cruz, Maria
  Santos, Pedro Reyes).
- Existing element IDs: `totalTrainees`, `activeTrainees`,
  `totalAssessments`, `pendingAssessments`, `recentAssessments` (tbody).

### Trainee dashboard (`frontend/trainee/dashboard.html`)

- Loads `../js/dashboard.js` and `../js/portal.js`.
- Already live: name, initials, email, application panel, and profile panel
  name/email (from `GET /api/trainee/me` and `GET /api/applications/me`).
- Still demo: header "Demo figures" tag, all four cards (₱4,500 balance,
  03 modules, 86/100 average, 2/4 cow tasks), training progress meters, cow
  maintenance list, profile "Status: Active" row, and the whole Training fee
  panel (75% paid, ₱13,500 of ₱18,000).

## 4. Existing endpoints to reuse

All requests send `Authorization: Bearer <localStorage.edtspToken>` and keep the
hard-coded base URL `http://localhost:5000`.

### Admin

`GET /api/admin/trainees` — admin JWT

```json
{
  "success": true,
  "count": 5,
  "summary": { "total": 5, "ongoing": 0, "pending": 5, "completed": 0 },
  "trainees": [ { "userId": "...", "fullName": "...", "enrollmentStatus": "Pending", "...": "..." } ]
}
```

- `summary.total` → Total trainees.
- `summary.ongoing` → Active trainees.
- Already counts every user with role `trainee`, including those with no
  `TraineeProfile` (those default to `Pending`), which matches the chosen
  definition exactly. No backend change needed.

`GET /api/assessments` — admin JWT (mounted at `/api/assessments`)

```json
{
  "success": true,
  "count": 7,
  "assessments": [
    {
      "_id": "...",
      "assessmentTitle": "Dairy production assessment",
      "subject": "Dairy production",
      "status": "Pending",
      "score": null,
      "totalScore": 100,
      "assessmentDate": null,
      "dueDate": null,
      "createdAt": "2026-11-12T...",
      "user": { "firstName": "Test", "lastName": "Trainee", "email": "..." }
    }
  ],
  "summary": {
    "totalAssessments": 7,
    "pendingAssessments": 4,
    "gradedAssessments": 3,
    "averageScore": 80
  }
}
```

- `count` (or `summary.totalAssessments`) → Total assessments.
- The dashboard computes its own "Pending assessments" as
  `status === "Pending" || status === "Completed"`. This is intentionally
  different from `summary.pendingAssessments`, which counts only `Pending`.
- The response includes every assessment; the page takes the newest 5 itself.

### Trainee

`GET /api/trainee/payments`

```json
{
  "success": true,
  "hasAccounts": true,
  "summary": {
    "totalFee": 40000,
    "totalPaid": 0,
    "balance": 40000,
    "status": "Unpaid",
    "accountCount": 1
  },
  "accounts": [ "..." ],
  "payments": [ "..." ]
}
```

`GET /api/assessments/me`

```json
{ "success": true, "count": 2, "assessments": [ { "status": "Graded", "score": 85, "totalScore": 100, "...": "..." } ] }
```

`GET /api/trainee/me` — already fetched by `dashboard.js`; supplies
`profile.enrollmentStatus`.

## 5. Metric definitions

### Admin dashboard

| Card | Value | Note (ledger__note) |
| --- | --- | --- |
| Total trainees | `summary.total` from `/api/admin/trainees` | "Registered participants" (unchanged) |
| Active trainees | `summary.ongoing` | "Currently in training" (unchanged) |
| Total assessments | `count` from `/api/assessments` | "Assigned to date" (unchanged) |
| Pending assessments | count of assessments with status `Pending` or `Completed` | "Pending or completed, not graded yet" |

- Active trainees includes anyone whose profile says `Ongoing`, even if their
  account access is `inactive`. No extra exclusion.
- A trainee with no profile counts as `Pending` (backend default), so they are
  in Total but not Active.

### Trainee dashboard

| Card | Value | Note |
| --- | --- | --- |
| Payment balance | `summary.balance` as `₱N`; `₱0` when `accountCount === 0` | `"of ₱{totalFee} total fee"` when accounts exist; `"No fee assigned yet"` when none |
| Assessment average | Rounded mean of `(score / totalScore) × 100` over `Graded` records with numeric score and `totalScore > 0`, displayed `NN/100`; `—` when none | `"Based on N graded assessments"` / `"No graded assessments yet"` |
| Pending assessments | Count of own assessments with status `Pending` or `Completed` | "Pending or completed, not graded yet" |
| Enrolment status | `profile.enrollmentStatus` or `Pending` | Pending: "Awaiting confirmation"; Ongoing: "Currently in training"; Completed: "Training completed"; Inactive: "Enrolment inactive"; no profile: "No training record yet" |

Trainee average is normalized to 100 before averaging, so a 40/50 assessment
contributes 80, and the card always reads out of 100.

### Trainee Training fee panel

- Percent paid = `totalFee > 0 ? Math.min(100, Math.round((totalPaid / totalFee) * 100)) : 0`.
- Meter fill width is that percentage.
- Figure: the percentage, with the existing `% paid` unit span.
- Note: `"{₱paid} of the {₱fee} fee received."`, or "No fee assigned yet." when
  `accountCount === 0`.
- Facts: Total fee, Paid, Balance (`balance` keeps `.balance` styling).
- "Next step" text:
  - no account: "Wait for an approved application."
  - balance > 0: "Settle the balance with the training office."
  - otherwise: "Fully paid. No balance due."

### Money and date formatting

- Money: `₱` + thousands separators, matching `frontend/js/payments.js`; show
  whole pesos when the amount is an integer.
- Dates on the admin table: `toLocaleDateString("en-US", { month: "short",
  day: "2-digit", year: "numeric" })`, consistent with the other admin pages.
- Invalid or missing dates render `—`.

## 6. Admin dashboard changes

### Markup (`frontend/admin/dashboard.html`)

1. Remove `<span class="demo-tag">Demo data</span>`.
2. Add `<p class="state state--inline" id="dashboardFeedback" role="status" hidden></p>`
   under the page deck (same slot pattern as the other admin pages).
3. Set all four card values to `0`; keep the existing IDs.
4. Change the Pending card note to "Pending or completed, not graded yet".
5. Convert each of the four `.ledger__cell` divs into anchors pointing at:
   - Total trainees → `trainees.html`
   - Active trainees → `trainees.html`
   - Total assessments → `assessments.html`
   - Pending assessments → `assessments.html`
   The class stays `ledger__cell`; add only the anchor reset/hover CSS below.
6. Empty `<tbody id="recentAssessments">`; remove the three demo rows.
7. Add `<p class="state state--inline" id="recentAssessmentsEmpty" hidden>No assessments recorded yet.</p>`
   below the table inside the panel.
8. Add `<script src="../js/admin-dashboard.js" defer></script>` after
   `admin.js`.
9. Replace the footer line "Figures shown here are demo data." with
   "Figures are read live from the training database."

### Recent assessments table

Columns stay: Assessment, Trainee, Date, Score, Status.

- Take the newest 5 records, sorted by `assessmentDate || createdAt`
  descending; records without a usable date sort last.
- Assessment cell: `assessmentTitle` with `class="name"`; when `subject` exists,
  append `<small class="field-note">subject</small>`.
- Trainee cell: `user.firstName + " " + user.lastName`, or "Unknown trainee".
- Date cell: as formatted above.
- Score cell (`class="num"`): `"{score}/{totalScore}"` only when status is
  `Graded` and score is numeric; otherwise `—`.
- Status cell: badge with class `status-badge pending|completed`:
  - `Pending` → `pending`
  - `Completed` → `completed`
  - `Graded` → `completed` (there is no `.status-badge.graded` rule)
- Each row links to `assessments.html` via a click handler or a full-row
  anchor; keyboard access must be preserved (row `tabindex="0"` + Enter, or a
  title link inside the first cell). Prefer a title link so the table stays
  simple.
- If there are no assessments, show the empty paragraph and leave the tbody
  empty.
- If the assessments request failed, show the banner and leave the table empty;
  the empty paragraph stays hidden so the failure is not mistaken for "no
  records".

### Behaviour (`frontend/js/admin-dashboard.js`, new)

- Runs on `DOMContentLoaded`; `admin.js` already redirects non-admins and
  missing sessions, but the script must still handle a 401 by clearing
  `edtspToken`/`edtspUser` and redirecting to `../login.html`.
- Fetch both endpoints in parallel (`Promise.all` with per-call error capture,
  or `Promise.allSettled`).
- While loading: show "Loading dashboard data…" in `#dashboardFeedback`
  (keep cards at 0).
- On success with no errors: hide the feedback note.
- On partial failure: render whatever succeeded; feedback reads
  "Some dashboard data could not load: trainees." / "…assessments." (list the
  failed sections); failed values remain 0. No retry button.
- No auto-refresh, no timers.
- Use `textContent` for all injected values (no `innerHTML` with data).

## 7. Trainee dashboard changes

### Markup (`frontend/trainee/dashboard.html`)

1. Remove `<span class="demo-tag">Demo figures</span>`.
2. Add `<p class="state state--inline" id="dashboardFeedback" role="status" hidden></p>`
   under the page deck.
3. Replace the four cards with anchors (same `.ledger__cell` class):
   - Payment balance → `payments.html`; value `id="paymentBalance"`, note
     `id="paymentBalanceNote"`.
   - Assessment average → `assessments.html`; value
     `id="assessmentAverage"`, note `id="assessmentAverageNote"`.
   - Pending assessments → `assessments.html`; value
     `id="pendingAssessments"`, note `id="pendingAssessmentsNote"`.
   - Enrolment status → `profile.html`; value     `id="enrollmentStatus"`, note `id="enrollmentStatusNote"`. The
     `ledger__cell--focus` highlight stays on the Balance card.
4. Training fee panel gets IDs:
   - percent figure text: `feePercent`
   - meter fill: `feeMeterFill` (set `style.width`)
   - note: `feeNote`
   - Total fee: `feeTotal`; Paid: `feePaid`; Balance: `feeBalance`
   - next step: `feeNextStep`
   All start at `0` / `₱0` / `0%` and "No fee assigned yet." so the page is
   honest before load.
5. Profile panel status: replace the hard-coded
   `<span class="status-badge completed">Active</span>` with
   `<span class="status-badge" id="profileStatus">Pending</span>`.
   `dashboard.js` already sets that ID's text and badge class from the profile,
   so no extra JS is needed for this row.
6. Remove the Training progress panel entirely — heading, meter list, and
   header. There is no module/progress model in the database, so nothing in it
   can be real; it is the only demo block besides cow maintenance and must go.
   The page still uses `grid grid--record`; the left stack simply contains the
   Cow maintenance panel alone now, and the right stack keeps the application
   and profile panels.
7. Cow maintenance stays as sample content and gets the only demo label:
   wrap its header meta and the "Care schedule" link in
   `<div class="panel__head-actions">` with
   `<span class="panel__meta">Sample data</span>` before the link.
8. Footer: add a line stating that cow maintenance is sample data and the
   remaining figures come from the training database.

### Behaviour (`frontend/js/dashboard.js`, extend)

- Add a `loadDashboardSummary()` that only runs when
  `document.getElementById("paymentBalance")` exists, so other trainee pages
  are unaffected.
- Fetch `/api/trainee/payments` and `/api/assessments/me` in parallel with
  the existing token.
- Profile data continues to come from `loadTraineeProfile()`; render the
  Enrolment status card from `traineeProfile.enrollmentStatus` after that
  resolves. When there is no profile, keep `Pending` and the "No training
  record yet" note.
- One 401 on either call clears storage and redirects to `../login.html`.
- Loading: "Loading dashboard data…" in `#dashboardFeedback`.
- Partial failure: successful sections render; banner reads
  "Some dashboard data could not load: payments." or "…assessments."; failed
  figures keep their zero/— defaults.
- No polling or refresh control.

## 8. Shared CSS (`frontend/css/portal.css`)

Minimal additions only, appended near the existing ledger rules:

```css
a.ledger__cell {
    color: inherit;
    text-decoration: none;
}

a.ledger__cell:hover,
a.ledger__cell:focus-visible {
    background: var(--paper);
}

.panel__head-actions {
    display: flex;
    align-items: baseline;
    gap: 14px;
    flex: none;
}
```

Focus outlines must remain visible; do not remove them. No other design-system
changes.

## 9. Edge cases

- **No trainee accounts:** all admin cards are 0; the recent table is empty with
  "No assessments recorded yet."
- **Trainee with no approved application:** balance `₱0`, note "No fee
  assigned yet"; fee panel 0%, all facts `₱0`, next step "Wait for an approved
  application."
- **Trainee with a free (₱0) program:** percent stays 0 (never divide by zero);
  note reads "Fully paid. No balance due." if the balance is 0.
- **No graded assessments:** average `—`, "No graded assessments yet".
- **Assessment with no date:** sorts after dated records and shows `—`.
- **Assessment whose `totalScore` is not 100:** normalized to 100 before
  averaging, so the card always reads `/100`.
- **`Completed` assessment status:** counts as pending on both dashboards but
  shows a `completed` badge.
- **Account access inactive but enrolment Ongoing:** counted as Active (by
  decision).
- **Multiple approved programs for one trainee:** payment summary totals are
  already aggregated by the backend; the card and fee panel show the combined
  figures.
- **API returns success but empty arrays:** cards show 0, empty notes appear,
  no banner.

## 10. Out of scope

- No backend, model, route, or controller changes.
- No new npm dependencies.
- No modules backend; the Training progress panel is removed rather than fed
  placeholder data. Cow maintenance keeps its sample content and label.
- No auto-refresh, websockets, or polling.
- No filtered card links or query-string filters on module pages.
- No per-assessment detail page; rows open `assessments.html`.
- No changes to the application panel, auth flow, or sidebar badge.
- No changes to the trainee payments/assessments pages.

## 11. Acceptance criteria

1. Admin dashboard shows real values from the database: with current data,
   5 total trainees, 0 active, 7 total assessments, 4 pending
   (Pending + Completed).
2. The recent table lists the newest 5 real assessments with trainee name,
   date, score, and status; no fabricated names remain.
3. Every admin card links to its module; each recent row opens the assessments
   page.
4. Trainee dashboard shows the logged-in trainee's real balance, average,
   pending count, and enrolment status.
5. The fee panel reflects the trainee's real fee, payments, balance, and
   percent paid.
6. The profile panel shows the trainee's real enrolment status badge.
7. No demo money or count figures remain on either page (`24`, `18`, `32`,
   `12`, `₱4,500`, `₱13,500`, `₱18,000`, `86/100`, `75%`, `2/4`, `03`).
8. Cow maintenance carries a visible "Sample data" label, the Training
   progress section is gone, and the page-wide demo tag is gone from both
   pages.
9. Loading shows the small note and zeros; a failed request shows one banner
   while loaded sections still render; a 401 redirects to login.
10. `node --check` passes for both scripts, and the page's `getElementById`
    IDs all exist in the corresponding HTML.

## 12. Verification plan

No test framework exists in this repo; verification is manual/ad hoc.

1. `node --check frontend/js/admin-dashboard.js` and
   `node --check frontend/js/dashboard.js`.
2. Script that extracts every `getElementById("…")` from the two scripts/HTML
   pair and asserts the IDs exist.
3. Curl with a signed admin JWT:
   - `GET /api/admin/trainees` → summary total 5 / ongoing 0.
   - `GET /api/assessments` → count 7, statuses 4 Pending + 3 Graded.
4. Curl with a trainee JWT:
   - `GET /api/trainee/payments` → summary balances.
   - `GET /api/assessments/me` → for a trainee with graded and ungraded
     records, check the average and pending count by hand.
   - Use a trainee with no approved application to confirm the ₱0 / "No fee
     assigned yet" path, and one with no assessments to confirm `—`.
5. Grep both pages for the removed demo constants and demo tags.
6. Open both pages in a browser only if a visual check is requested; confirm
   the console has no errors and the cards/table match the API output.

## 13. Risks and open questions

- **`Completed` semantics:** the dashboard treats `Completed` as unfinished.
  If that status is meant to be finished-but-ungraded forever, the pending
  number will overstate work. Worth confirming with the training office.
- **Payload size:** `/api/assessments` returns every assessment. Fine at
  current scale; if the table grows, this page should switch to a limited
  endpoint rather than paginate client-side.
- **Badge colour for `Graded`:** no `.status-badge.graded` rule exists; mapping
  it to `completed` keeps the visual language consistent but means Graded and
  Completed look identical. If that matters, add a dedicated style later.
- **Card anchors:** turning `.ledger__cell` into links changes semantics; the
  hover/focus treatment above is the proposed minimum. A design pass may want
  an arrow affordance.
- **Row navigation:** there is no assessment detail route, so rows land on the
  general assessments page rather than the specific record.
- **No timestamp:** the page does not show "last updated"; data freshness is
  whatever loaded on page open, by design.
