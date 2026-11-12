# Apply Form Program & Batch Fix — Spec

**Short name:** `apply-form-program-batch`
**Status:** Draft for implementation
**Date:** 2026-11-12
**Scope owner:** Trainee application flow (`frontend/trainee/apply.html`, `frontend/js/apply.js`)
**Backend impact:** None
**Admin impact:** None

---

## 1. Problem

When a trainee opens **Apply for training** and reaches **Step 4 — Training choice**, the **Program** dropdown contains only the static placeholder ("Select a program") and the **Batch** dropdown contains only "Select a program first". No real programs or batches are ever offered, so the applicant cannot complete the form.

The data exists. A read-only check of the `EDTSP` database returns:

- Program: `Dairy Training` — status `Open`, fee ₱40,000
- Batch: `Batch 1` — status `Open`, slot capacity 10, filled 0

`GET /api/applications/open-batches` returns that program and batch correctly for a trainee account, so this is a **client-side rendering bug**, not missing or misconfigured data.

---

## 2. Root cause

`frontend/js/apply.js`, `showWizard()` (around line 641):

```js
if (!elements.program.options.length) {
    fillProgramOptions();
}
```

`frontend/trainee/apply.html` ships the Program select with one static option:

```html
<select id="program" name="program" required>
    <option value="">Select a program</option>
</select>
```

`HTMLSelectElement.options.length` is therefore **1** on first render, which is truthy, so `fillProgramOptions()` is never called. The options in `state.programs` (already loaded from the API) never reach the DOM. The batch select stays disabled because no program can be selected.

The same fragile pattern is the only thing standing between the loader and the renderer, so the fix must remove the dependency on option count, not just change the number.

**Contributing detail:** `fillProgramOptions()` (line 188) and `fillBatchOptions()` (line 204) already produce correct markup, fee hint, disabled state, and slot counts. They are simply never invoked on a fresh page load. No backend or model change is required.

---

## 3. Goals

1. Program and batch options render on Step 4 whenever the trainee is eligible to apply and open programs exist.
2. The population logic can no longer be skipped because of pre-existing placeholder options.
3. A single open batch for the chosen program is auto-selected, so the applicant is not asked to choose from a list of one.
4. When availability changes between page load and submit, the applicant gets a clear error and an automatically refreshed list.
5. The change stays inside the apply page — no schema, API, admin UI, or seed changes.

## 4. Non-goals

- Redesigning the training-choice step into cards, radio rows, or a different layout (decision: **keep the two native selects**).
- Re-fetching open programs/batches when entering Step 4 or on tab focus (decision: **load once**, plus the existing retry).
- Showing programs that currently have no open, non-full batch (decision: **hide them** — current API behaviour).
- Adding a test framework or dev dependency (decision: **manual checklist** only).
- Warning admins about programs with no open batches (decision: **no admin change**).
- Auditing selects on other trainee or admin pages (decision: **apply page only**).
- Changing `GET /api/applications/open-batches`, its filtering rules, or its response shape.

---

## 5. Functional requirements

### FR-1 — Populate options from loaded state, not option count

Replace the `options.length` guard with explicit state.

- Add `optionsLoaded: false` to the `state` object.
- `loadApplicationState()` sets `state.optionsLoaded = false` after new program data arrives, so every successful load (initial load, retry, post-submit refresh, post-withdraw refresh) rebuilds the options.
- `showWizard()` calls `fillProgramOptions()` when `!state.optionsLoaded`, then sets `state.optionsLoaded = true`.
- `fillProgramOptions()` always clears the select and writes exactly one placeholder option (`value=""`, text `Select a program`) followed by one option per program, using `program._id` as value and `program.name` as text. It must not depend on any option already being present in the HTML.
- Remove the `options.length` check entirely rather than adjusting its threshold.

### FR-2 — Preserve and restore selection

Rebuilding options must not silently change what the applicant already chose.

- Before rebuilding, capture the currently selected program and batch IDs.
- After rebuilding, re-select the program if it is still offered.
- Re-select the batch only if it is still offered under the restored program; otherwise leave the batch select at its prompt and disable it if the program has no batches.
- Navigating Back/Next between steps must not clear selections (the DOM values already persist; the fix must not introduce a reset).
- "Apply for training" after a rejected/withdrawn application must still reset program to `""` and batch to the disabled prompt (existing behaviour in the `applyAgainBtn` handler).

### FR-3 — Single-batch auto-select

- When the selected program has exactly one open batch, set the batch select's value to that batch's `_id` immediately after the batch options are built.
- The batch select must be enabled in this case and the auto-selected batch must be visible in the control (not only in state).
- When the program has more than one batch, leave the placeholder `Select a batch` and require an explicit choice.
- When the program has zero batches, the select stays disabled with the existing `No open batches` placeholder — though in practice such programs are filtered out by the API (FR-5).
- Auto-select must also run when the applicant changes programs, and when options are restored on a refresh.

### FR-4 — Training-choice hint

`#programHint` currently shows only `Training fee: ₱40,000.` Extend it so the auto-selection is legible:

- No program chosen: empty string.
- Program chosen, no batch chosen: `Training fee: ₱<fee>.`
- Program and batch chosen: `Training fee: ₱<fee> · <slotsRemaining> slot(s) left in <batch label>.`
- Slot wording must be singular for 1 and plural otherwise.
- Use the same `toLocaleString("en-PH")` formatting already used for the fee.
- Hint updates on program change, on batch change, and after auto-select.

### FR-5 — Hide unavailable programs

No frontend filtering is added. The API already returns only programs with `status: "Open"` that have at least one `status: "Open"` batch with `filledCount < slotCapacity`. The frontend must not add closed or full programs into the list from any other source.

If `state.programs` is empty, keep the existing notice panel: **"Applications are closed right now."** with the existing "Back to dashboard" action. Do not render Step 4 with empty selects.

### FR-6 — Stale batch or program at submit

The applicant may have loaded the form before an admin closed a batch/program or filled the last slot.

- Keep the existing server validation as the authority. Relevant responses from `POST /api/applications`:
  - `400 This training program is not accepting applications.`
  - `400 This batch is not accepting applications.`
  - `400 The chosen batch does not belong to that program.`
  - `409 This batch is already full. Please choose another batch.`
  - `400 Please choose a valid program and batch.`
- On any of these availability errors, the page must:
  1. Show the server message inline in `#submitError` (existing).
  2. Automatically reload the open program/batch list.
  3. Keep the applicant on Step 4 with all personal fields intact.
  4. Keep the error message visible after the reload (the current `render()` path hides `#submitError`; the reload path must not erase it before the applicant reads it).
  5. Restore the program if still available; clear the batch if it disappeared, so the applicant is forced to pick a valid one.
- Availability errors are identified by HTTP status `400`/`409` from the submit call, not by string matching the message.
- If the reload itself fails, keep the inline error and fall back to the existing notice/retry panel behaviour rather than leaving a blank form.

### FR-7 — Load-once semantics

- Programs and batches are fetched once per page load through the existing `Promise.all` in `loadApplicationState()`.
- The only additional fetches are: the existing `noticeRetry` click, the post-submit refresh, the post-withdraw refresh, and the stale-choice reload in FR-6.
- No fetch on entering Step 4, on window focus, or on a timer.

### FR-8 — Diagnostics

- Log a single developer-facing line after a successful load, e.g. `[apply] open programs: 1`, and log the raw error object on load failure.
- Do not add trainee-visible text that exposes counts or technical details. The trainee sees only the existing notice panel, inline validation, and submit errors.
- Keep the existing `console.error("Application load error:", error)` on the load path.

### FR-9 — Unchanged behaviour

- Eligibility gating stays as-is: open application → status panel; `already_enrolled`, `completed`, `account_inactive` → status messages; no application + `canApply` → wizard.
- `?submitted=1` still produces the "Application received" message with `justSubmitted`.
- Validation on Step 4 still requires a program, a batch, and the truthfulness checkbox.
- Review step still displays the chosen program name and batch label from `state.programs`.
- The `program` select remains `required`; the batch select remains `required` and disabled until a program is chosen.
- No changes to `dashboard.js`, admin pages, CSS, models, controllers, or routes.

---

## 6. Behaviour matrix

| Loaded programs | Selected program | Batch outcome | Step 4 state |
| --- | --- | --- | --- |
| 0 | — | — | Notice panel, no wizard |
| ≥1 | none | disabled, "Select a program first" | Program lists all programs, placeholder selected |
| ≥1 | program with 0 batches | disabled, "No open batches" | Should not occur via API; handled defensively |
| ≥1 | program with 1 batch | enabled, auto-selected | Hint shows fee + slots |
| ≥1 | program with ≥2 batches | enabled, "Select a batch" | Hint shows fee only |
| ≥1 | program removed after refresh | reset to placeholder | Hint cleared, Next blocked |

---

## 7. Edge cases

- **Two programs with identical names:** option values are `_id`s, so selection remains unambiguous; no de-duplication.
- **Program selected, then page refreshed by the applicant:** options rebuild from fresh data; if the program/batch still exist they are restored, otherwise the batch prompt returns.
- **Batch fills while the applicant is on Step 5:** submit returns `409`; error is shown, list reloads, applicant returns to a valid choice on Step 4.
- **Program closed while the applicant is on Step 5:** submit returns the program `400`; same handling as above.
- **Backend unreachable:** existing notice panel with "Try again"; the select is never shown half-populated.
- **Trainee already has an open application:** wizard never renders; no option work is performed beyond the state load.
- **Trainee account inactive / enrolled / completed:** wizard never renders; status messaging unchanged.
- **Rapid Next clicks:** the submit button is already disabled during submission; do not add an extra fetch that could race with `loadApplicationState()`.
- **Stale localStorage role/token:** existing redirect to `login.html` on load and on `401`; unchanged.
- **Fee of 0:** hint reads `Training fee: ₱0.` (no special case).
- **Null `intakeDate`:** batch option text does not depend on it; the hint only uses label and slots.
- **`slotsRemaining` missing from a batch payload:** fall back to `slotCapacity - filledCount` clamped at 0 rather than printing `undefined`.

---

## 8. Accessibility

- The program and batch selects keep their existing `<label for>` associations.
- Field errors continue to use `.field__error` plus `aria-invalid` on the control, as the rest of the wizard does.
- The disabled batch select must remain announced as unavailable until a program is chosen; do not replace the disabled state with a hidden field.
- The hint is static text tied to the field visually; if it becomes the only confirmation of auto-selection, ensure the selected option text itself also names the batch (it does: `<label> — <n> slots left`).
- Auto-selection must not move focus; the applicant keeps focus on the program select after changing it.
- No colour-only signalling: slots remaining and batch label are written in text.

---

## 9. Acceptance criteria

1. With at least one open program and one open batch in the database, a trainee with no application sees the program name(s) in the Program select on Step 4 without reloading the page a second time.
2. The Program select contains exactly one placeholder option plus one option per open program — never a duplicated placeholder after repeated refreshes.
3. Choosing a program with one batch enables the batch select and selects that batch automatically; the hint shows fee and remaining slots.
4. Choosing a program with multiple batches resets the batch select to its prompt and keeps Next blocked until a batch is chosen.
5. Review and the submitted application show the same program/batch that was visible in the selects.
6. Submitting a stale batch produces an inline error, reloads availability, keeps the trainee on Step 4 with personal data intact, and leaves the batch unselected.
7. With zero open programs, the notice panel still appears and the wizard is not rendered.
8. The console logs the number of open programs once per load.
9. No backend, admin, or CSS files changed; existing application submit/withdraw/decision flows unaffected.

---

## 10. Reproduction and evidence capture

This section is the evidence protocol for the bug and the fix. It is written to be run twice: once against the **current (buggy) code** to capture the defect, and once **after the fix** with the same inputs and the same capture points.

### 10.1 Environment setup

Run everything from the repository root. All commands below are bash (Git Bash on Windows).

0. **Create the evidence directories** (they must exist before the session token is written)

   ```bash
   mkdir -p evidence/before evidence/after
   ```

1. **Start the API**

   ```bash
   cd backend && node server.js
   ```

   Leave it running in its own terminal. Confirm it is healthy:

   ```bash
   curl -s http://localhost:5000/api/health
   ```

   Expected: `{"success":true,"database":"Connected"}`. If `database` is not `Connected`, stop here — the dropdown bug is not reproducible until data can be read.

2. **Seed open programs and batches**

   ```bash
   (cd backend && node scripts/seedPrograms.js)
   ```

   This upserts three open programs and four open batches (`Dairy Production Training` with two batches, `Animal Nutrition & Feeding` with one, `Farm Safety & Hygiene` with one). It does not create applicants. One program with two batches plus two programs with one batch gives both FR-3 paths (auto-select and explicit choice) without any admin edits.

   The baseline API response is captured from the browser Network panel in 10.4 step 9, using the authenticated session rather than a hand-built curl request. It must show at least one program with at least one batch; that is what proves the empty dropdowns are a client bug.

3. **Serve the static frontend**

   ```bash
   npx serve frontend -l 5500
   ```

   The apply page is then `http://localhost:5500/trainee/apply.html`. Do not open the page with `file://`: the page redirects through `../login.html` on a missing session and relative paths are easier to reason about over HTTP. `frontend/js/apply.js` hardcodes the API at `http://localhost:5000/api`, so the port matters.

4. **Pick a disposable trainee**

   Use a trainee account that has **no active application** and has not completed training; otherwise the wizard never renders and there is nothing to reproduce. List candidates (read-only):

   ```bash
   (cd backend && node -e "
   require('dotenv').config();
   const mongoose = require('mongoose');
   (async () => {
     await mongoose.connect(process.env.MONGODB_URI);
     const users = await mongoose.connection.db.collection('users')
       .find({ role: 'trainee' }, { projection: { email: 1, firstName: 1, lastName: 1 } })
       .limit(10).toArray();
     console.log(users);
     await mongoose.disconnect();
   })();")
   ```

   If none is eligible, create one through `signup.html` (reCAPTCHA applies — see 10.2) or ask an admin to create it. Use a dedicated account for evidence runs so the application you submit can be withdrawn afterwards, leaving the account reusable.

### 10.2 Authenticating the evidence session

The login form posts `recaptchaToken` and the API rejects login without a valid reCAPTCHA (`backend/controllers/authController.js` → `verifyRecaptcha`). In a local environment without `RECAPTCHA_SECRET_KEY`, or where reCAPTCHA cannot be solved repeatedly, bootstrap the session directly. This is a **local development shortcut only** and must never be used against a deployed environment.

Preferred path — normal login:

1. Open `http://localhost:5500/login.html`.
2. Sign in with the disposable trainee, complete reCAPTCHA, accept the "Login successful" alert.
3. The app redirects to `trainee/dashboard.html` and stores `edtspToken` / `edtspUser` in `localStorage`.

Fallback path — mint a local session token (no secrets are printed):

```bash
(cd backend && node -e "
require('dotenv').config();
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
(async () => {
  await mongoose.connect(process.env.MONGODB_URI);
  const u = await mongoose.connection.db.collection('users').findOne({ role: 'trainee' });
  await mongoose.disconnect();
  if (!u) throw new Error('No trainee account found');
  const token = jwt.sign({ id: String(u._id), role: 'trainee' }, process.env.JWT_SECRET, { expiresIn: '2h' });
  console.log(JSON.stringify({
    token,
    user: { firstName: u.firstName, lastName: u.lastName, email: u.email, role: u.role }
  }));
})();") > evidence/session.json
```

This picks the first trainee document; if that account is ineligible (has an open application, is enrolled, or has completed training), pass its email explicitly with `.findOne({ role: 'trainee', email: '<email>' })`. Check eligibility with `GET /api/trainee/me` or by watching which panel renders after login.

Then in DevTools on `http://localhost:5500/trainee/apply.html`, run:

```js
const session = /* paste the JSON from evidence/session.json */;
localStorage.setItem("edtspToken", session.token);
localStorage.setItem("edtspUser", JSON.stringify(session.user));
location.reload();
```

`apply.js` reads exactly those two keys and redirects to `../login.html` if either is missing or the role is not `trainee`. The token payload shape (`{ id, role }`) matches what `authController` issues, so the API accepts it for up to two hours.

### 10.3 Create the evidence bundle

Use one directory per run, inside the repo but ignored by git (or outside the repo entirely):

```bash
mkdir -p evidence/before evidence/after
```

Every capture set must be self-identifying:

- **Commit:** `git rev-parse --short HEAD` written to `evidence/<run>/commit.txt` (note `dirty` if the working tree has changes).
- **Environment:** browser name/version, viewport, OS, and the API base URL in `evidence/<run>/env.txt`.
- **Screenshots:** full-page PNGs of Step 4 and, after the fix, the review and status panels.
- **DOM snapshot:** the option list as JSON (exact command in 10.4).
- **Network snapshot:** the `/api/applications/open-batches` response body.
- **Console:** the relevant console lines as text.

If `evidence/` is not already ignored, add it to `.gitignore` as part of the evidence work — do not commit screenshots or session tokens. `evidence/session.json` contains a live bearer token and must never be committed, pasted into a ticket, or attached to the PR.

### 10.4 Manual reproduction — BEFORE the fix

Perform this on the current code, before touching `apply.js`. It must fail at step 7.

1. Open DevTools → **Console** and **Network**, then load `http://localhost:5500/trainee/apply.html` with a valid session.
2. Confirm `#wizardPanel` is visible and the step indicator reads `Step 1 of 5`.
3. Fill Step 1 and click **Next** (`#nextBtn`):
   - `#firstName`: `Evidence`
   - `#lastName`: `Trainee`
   - `#email`: the account email
   - `#phone`: `09171234567`
   - `#address`: `123 Evidence Street, Los Baños, Laguna`
4. Fill Step 2 and click **Next**:
   - `#dateOfBirth`: `1990-01-01`
   - `#sex`: `Female`
   - `#civilStatus`: `Single`
   - `#highestEducation`: `College`
   - `#schoolAttended`: `University of the Philippines Los Baños`
5. Fill Step 3 and click **Next**:
   - `#emergencyContactName`: `Evidence Contact`
   - `#emergencyContactPhone`: `09179876543`
   - `#emergencyContactRelationship`: `Sibling`
6. Confirm the indicator reads `Step 4 of 5`.
7. **Observe the defect.** The Program select contains a single option, `Select a program`; the Batch select is disabled with `Select a program first`. Record the DOM state in the Console:

   ```js
   JSON.stringify({
     url: location.href,
     step: document.getElementById("wizardMeta").textContent,
     program: [...document.querySelectorAll("#program option")].map(o => ({ value: o.value, text: o.textContent.trim() })),
     batch: [...document.querySelectorAll("#batch option")].map(o => ({ value: o.value, text: o.textContent.trim() })),
     batchDisabled: document.getElementById("batch").disabled,
     hint: document.getElementById("programHint").textContent
   }, null, 2)
   ```

   Expected on current code:

   ```json
   {
     "step": "Step 4 of 5",
     "program": [{ "value": "", "text": "Select a program" }],
     "batch": [{ "value": "", "text": "Select a program first" }],
     "batchDisabled": true,
     "hint": ""
   }
   ```

   Save it as `evidence/before/step4-dom.json`.
8. Click **Next** once more. The form must block with `Choose a program.` under the Program field and keep the indicator on Step 4. This is the user-facing symptom; save `evidence/before/step4-empty.png` (full page, DevTools closed so the step indicator and both selects are visible).
9. **Capture the data proof.** In the Network panel, select the `open-batches` request and save the response as `evidence/before/open-batches.json`. It must contain a `programs` array with at least one entry whose `batches` array is non-empty. This distinguishes "no data" from "data not rendered" and is the core before/after comparison.
10. **Capture the console.** Save the visible console lines, including the `[apply]` load line (or its absence on the buggy build), as `evidence/before/console.txt`.
11. Reload the page and confirm the same empty dropdowns occur on a **fresh** load — the defect must not depend on stale in-memory state.

### 10.5 Manual verification — AFTER the fix

Repeat 10.4 steps 1–6 on the fixed build, then continue. Each numbered item is a pass/fail check for the evidence record.

1. **Program options render.** `#program` contains one `Select a program` placeholder plus one option per open program from the API response. Option values are 24-character ObjectId strings. Save `evidence/after/step4-dom.json` and `evidence/after/step4-populated.png`.
2. **No duplicate placeholders.** Reload the page twice, return to Step 4 both times, and confirm `#program option[value=""]` has length exactly 1 and the program count matches the API count each time.
3. **Single-batch auto-select.** Choose `Animal Nutrition & Feeding` (one batch). Confirm `#batch` is enabled, its selected option is that batch, and `#programHint` reads `Training fee: ₱12,000 · 15 slots left in Batch 1 · 2026.` Save `evidence/after/single-batch-autoselect.png`. (Fee and slot count must come from the API response, not be hardcoded in the test data.)
4. **Multi-batch requires a choice.** Choose `Dairy Production Training` (two batches). Confirm `#batch` resets to `Select a batch`, is enabled, and **Next** blocks with `Choose a batch.` until one is picked. Save `evidence/after/multi-batch-prompt.png`.
5. **Selection survives navigation.** Pick a program and batch, click **Back** to Step 3, then **Next**; confirm both selects still hold the same values.
6. **Review reflects the choice.** Click **Next** to Step 5 and confirm `#reviewSummary` shows the chosen program name and batch label. Save `evidence/after/review.png`.
7. **Submit succeeds.** Tick `#acknowledgedTruthful`, submit, and confirm the status panel shows `Application received` with the same program and batch. Save `evidence/after/status.png`.
8. **Re-entry still populates.** Click **Withdraw application**, confirm, then **Apply for training**; confirm Step 4 populates again and that `#program` is back to the placeholder (not a stale selection).
9. **Zero open programs.** As admin, close every open batch and every program; reload the apply page (or press **Try again** if the notice panel is already showing). Confirm the notice panel appears with `Applications are closed right now.` and the wizard is hidden.
10. **Full batch hidden.** Make a single-batch program's batch full — approve enough applications to reach `slotCapacity`, or set `filledCount` equal to `slotCapacity` directly in the database — then reload the apply page. Confirm that program disappears from `#program` rather than being selectable.
11. **Stale batch at submit.** Load Step 4, select a batch, then close that batch as admin while the page stays open. Submit from Step 5; confirm:
    - the inline `#submitError` shows `This batch is not accepting applications.`
    - the availability list reloads automatically
    - the applicant stays on Step 4 with Steps 1–3 data intact
    - the batch is unselected and cannot be submitted until a valid one is chosen
    - the error text is still visible after the reload

    Save `evidence/after/stale-batch.png` with the error and the unselected batch visible.
12. **Console diagnostics.** Confirm exactly one `[apply] open programs: N` line per page load, matching the API count, and no uncaught errors.

Record each result in `evidence/results.md` as `pass`/`fail` with the screenshot or JSON filename beside it. A fail is evidence too — do not delete it.

### 10.6 Evidence matrix

| ID | File (before → after) | Capture point | Proves |
| --- | --- | --- | --- |
| E1 | `before/step4-empty.png` → `after/step4-populated.png` | Step 4, full page | Symptom exists, then is gone |
| E2 | `before/step4-dom.json` → `after/step4-dom.json` | Program/batch options + disabled state | Options went from 1/1 to N/M, batch enabled |
| E3 | `before/open-batches.json` → `after/open-batches.json` | Network response | Data was always available; counts match the DOM |
| E4 | `after/single-batch-autoselect.png` | Step 4 after choosing one-batch program | FR-3 auto-select + FR-4 hint |
| E5 | `after/multi-batch-prompt.png` | Step 4 after choosing two-batch program | No auto-select when ambiguous |
| E6 | `after/review.png`, `after/status.png` | Step 5 and status panel | The chosen program/batch is what gets submitted |
| E7 | `after/stale-batch.png` | Step 4 after a 400/409 submit | FR-6 error + reload + data retention |
| E8 | `before/console.txt` → `after/console.txt` | Console | FR-8 diagnostic line, no uncaught errors |

### 10.7 Optional Playwright capture

There is no Playwright dependency in the repo and this spec does not add one. The script below is for **repeatable evidence capture only**; run it from a scratch directory outside the project (or from `evidence/`, which is git-ignored). Do not add it to `package.json`, and do not make it a required check.

Setup (once per machine):

```bash
SCRATCH="$TEMP/edtsp-evidence"
mkdir -p "$SCRATCH" && cd "$SCRATCH"
npm init -y
npm i -D @playwright/test@1.49.1
npx playwright install chromium
```

The script reads `evidence/session.json` (from 10.2), sets the same `localStorage` keys the app expects before the first navigation, drives Steps 1–4 with the same inputs as 10.4, and writes the bundle. It captures unconditionally, and only asserts when `EXPECT_FIXED=1`, so the identical file produces the before and after artifacts.

```js
// apply-options.evidence.js — run: npx playwright test apply-options.evidence.js
const { test, expect } = require("@playwright/test");
const fs = require("fs");
const path = require("path");

const APP_URL = process.env.APP_URL || "http://localhost:5500";
const REPO = process.env.REPO_DIR || process.cwd();
const OUT = process.env.EVIDENCE_DIR || path.join(REPO, "evidence/run");
const SESSION = JSON.parse(fs.readFileSync(process.env.SESSION_FILE || path.join(REPO, "evidence/session.json"), "utf8"));
const EXPECT_FIXED = process.env.EXPECT_FIXED === "1";

fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, "commit.txt"), require("child_process")
  .execSync("git rev-parse --short HEAD", { cwd: REPO }).toString().trim());

test.use({ viewport: { width: 1280, height: 900 } });

test("step 4 exposes programs and batches", async ({ page }) => {
  const consoleLines = [];
  page.on("console", msg => consoleLines.push(`${msg.type()}: ${msg.text()}`));

  await page.addInitScript(([token, user]) => {
    localStorage.setItem("edtspToken", token);
    localStorage.setItem("edtspUser", JSON.stringify(user));
  }, [SESSION.token, SESSION.user]);

  const openBatches = page.waitForResponse(r => r.url().includes("/applications/open-batches"));
  await page.goto(`${APP_URL}/trainee/apply.html`);
  const response = await openBatches;
  const responseBody = await response.json();
  fs.writeFileSync(path.join(OUT, "open-batches.json"), JSON.stringify(responseBody, null, 2));

  await page.waitForSelector("#wizardPanel:not([hidden])");
  await page.fill("#firstName", "Evidence");
  await page.fill("#lastName", "Trainee");
  await page.fill("#email", SESSION.user.email);
  await page.fill("#phone", "09171234567");
  await page.fill("#address", "123 Evidence Street, Los Baños, Laguna");
  await page.click("#nextBtn");

  await page.fill("#dateOfBirth", "1990-01-01");
  await page.selectOption("#sex", { label: "Female" });
  await page.selectOption("#civilStatus", { label: "Single" });
  await page.selectOption("#highestEducation", { label: "College" });
  await page.fill("#schoolAttended", "University of the Philippines Los Baños");
  await page.click("#nextBtn");

  await page.fill("#emergencyContactName", "Evidence Contact");
  await page.fill("#emergencyContactPhone", "09179876543");
  await page.fill("#emergencyContactRelationship", "Sibling");
  await page.click("#nextBtn");

  await expect(page.locator("#wizardMeta")).toHaveText("Step 4 of 5");

  const snapshot = await page.evaluate(() => ({
    url: location.href,
    step: document.getElementById("wizardMeta").textContent,
    program: [...document.querySelectorAll("#program option")]
      .map(o => ({ value: o.value, text: o.textContent.trim() })),
    batch: [...document.querySelectorAll("#batch option")]
      .map(o => ({ value: o.value, text: o.textContent.trim() })),
    batchDisabled: document.getElementById("batch").disabled,
    hint: document.getElementById("programHint").textContent
  }));

  fs.writeFileSync(path.join(OUT, "step4-dom.json"), JSON.stringify(snapshot, null, 2));
  await page.screenshot({
    path: path.join(OUT, EXPECT_FIXED ? "step4-populated.png" : "step4-empty.png"),
    fullPage: true
  });

  if (!EXPECT_FIXED) {
    fs.writeFileSync(path.join(OUT, "console.txt"), consoleLines.join("\n"));
    return; // buggy build: capture only, never assert
  }

  expect(snapshot.program.length).toBeGreaterThan(1);
  expect(snapshot.program.filter(o => o.value === "").length).toBe(1);
  expect(snapshot.batchDisabled).toBe(false);

  // Pick the program with exactly one batch from the API response to prove auto-select.
  const singleBatchProgram = responseBody.programs.find(p => p.batches.length === 1);
  expect(singleBatchProgram).toBeTruthy();

  await page.selectOption("#program", { label: singleBatchProgram.name });
  const batchState = await page.evaluate(() => ({
    options: [...document.querySelectorAll("#batch option")].map(o => ({ value: o.value, text: o.textContent.trim() })),
    disabled: document.getElementById("batch").disabled,
    value: document.getElementById("batch").value,
    hint: document.getElementById("programHint").textContent
  }));
  fs.writeFileSync(path.join(OUT, "batch-after-program.json"), JSON.stringify(batchState, null, 2));
  await page.screenshot({ path: path.join(OUT, "step4-program-chosen.png"), fullPage: true });

  expect(batchState.disabled).toBe(false);
  expect(batchState.value).toBe(singleBatchProgram.batches[0]._id);
  expect(batchState.options.length).toBe(2); // placeholder + the one batch
  expect(batchState.hint).toContain(singleBatchProgram.batches[0].label);
  expect(batchState.hint).toMatch(/slot/);
  fs.writeFileSync(path.join(OUT, "console.txt"), consoleLines.join("\n"));
});
```

The script runs from the scratch directory (where `@playwright/test` is installed), so pass absolute paths for the repo, session file, and output directory. From the repository root:

```bash
REPO="$(pwd)"
SCRATCH="$TEMP/edtsp-evidence"
mkdir -p "$SCRATCH"
cp apply-options.evidence.js "$SCRATCH/"
cd "$SCRATCH"

# before
SESSION_FILE="$REPO/evidence/session.json" EVIDENCE_DIR="$REPO/evidence/before" \
  REPO_DIR="$REPO" npx playwright test apply-options.evidence.js

# after
EXPECT_FIXED=1 SESSION_FILE="$REPO/evidence/session.json" EVIDENCE_DIR="$REPO/evidence/after" \
  REPO_DIR="$REPO" npx playwright test apply-options.evidence.js
```

Notes for the script: it uses whichever trainee `evidence/session.json` was minted from, so that account must have no active application; it submits nothing, so there is nothing to clean up; and a redirect to `login.html` (no `#wizardPanel`) means the session file is stale or the account is not a trainee. The script covers Step 4 evidence only — review, submit, stale-batch, and zero-program captures stay manual, per 10.5.

### 10.8 Cleanup

- Restore any admin changes made for 10.5 items 9–11 (reopen programs/batches, reset `filledCount`).
- Withdraw the application submitted in 10.5 item 7 so the evidence account can run again.
- Delete `evidence/session.json` (it is a bearer token) and do not commit the `evidence/` directory.

---

## 11. Implementation notes (for the coding step)

- Touch only `frontend/js/apply.js`; `apply.html` already contains the necessary IDs and placeholder options.
- Keep the existing function boundaries: `fillProgramOptions()`, `fillBatchOptions(programId)`, `showWizard()`, `loadApplicationState()`, `refresh()`.
- Keep the DOM-safe pattern (`createElement` + `textContent`); no `innerHTML` with interpolated data.
- Prefer a small `syncProgramHint()` helper so the fee/slots string is produced in one place and stays consistent across program change, batch change, auto-select, and restore.
- Do not add dependencies, build steps, or new files.
- The existing `frontend/js/portal.js` 404 is pre-existing and out of scope.

---

## 12. Risks

- Rebuilding options on every load could drop a valid selection if restore logic is skipped — covered by FR-2 and evidence item 10.5.5.
- Auto-select could mask a second batch added later — covered by FR-3 (only when exactly one) and evidence items 10.5.3–10.5.4.
- Reloading availability inside the submit catch could hide the error message — covered by FR-6.4.
- The options guard could regress if reintroduced as `options.length` — the state flag in FR-1 is the single source of truth.
