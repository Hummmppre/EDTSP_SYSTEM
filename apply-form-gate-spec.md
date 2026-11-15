# Apply Page Form Gate — Feature Spec

**Short name:** `apply-form-gate`
**Status:** Draft for approval
**Requested:** "make the application form only appear when the apply button on the apply page is clicked"
**Scope owner:** Trainee application page (`frontend/trainee/apply.html`, `frontend/js/apply.js`)
**Backend impact:** None — eligibility (`canApply`), the reason codes and the previous-application history already come from `GET /api/applications/me` and `GET /api/applications/open-batches`
**Admin impact:** None
**Other pages touched:** `frontend/trainee/dashboard.html` (CTA link only), `frontend/js/dashboard.js` (clear the draft on logout)

---

## 1. Problem and outcome

Today the apply page has no "start" moment. `render()` in `frontend/js/apply.js` calls `showWizard()` straight away whenever the trainee is eligible and has no application, so the six-step form — step 1, the step rail and the program/batch pickers — is the first thing on screen. A trainee who clicks **Apply for training** on the dashboard lands inside the form with no framing: nothing says what they need at hand, that it takes a while, or that a CV and Valid ID must be ready before they begin. Applicants whose last application was Rejected or Withdrawn get a small button on the status card (`#applyAgainBtn`), so the same action looks different depending on account state.

After this feature:

- The apply page opens on a short **start card** that says what the application needs and offers **Start application**.
- The form only appears after that button is clicked, and it replaces the card in the same column.
- The card knows why a trainee cannot start (no open batches, account inactive, enrolment complete) and shows the button **disabled with the reason** instead of hiding it.
- Trainees who already started filling the form get their answers back after a reload through a browser-side draft.
- The dashboard's Apply CTA still saves a click by opening the form directly via `?apply=1`.
- Once inside the form, a ghost **Back to overview** control on every step returns to the card without losing the draft.

---

## 2. Decisions locked in the interview

| Topic | Decision |
| --- | --- |
| What reveals the form | A **new, dedicated start card** with its own button — not the existing status card, not the page header |
| What the card shows | The short list of requirements, plus a status-dependent line |
| Dashboard CTA | Deep-links past the card (`apply.html?apply=1`) and opens the form directly |
| After the click | The card is **replaced** by the form; the two never appear together |
| Rejected / Withdrawn trainees | Also see the start card, with their last outcome (badge, decision date, office message) folded into it |
| Reload mid-form | A **draft** of the answers and the current step is restored from the browser |
| Availability | Clicking Start **re-checks** open batches first; if the last slot went, the form is not opened |
| Cannot apply | The button stays **visible but disabled**, with a line underneath saying why |
| Draft contents | Answers, program/batch, current step, and the **names** of chosen files; file contents cannot be persisted, so they must be re-attached |
| Draft lifetime | Cleared on successful submit (and by an explicit **Start over**) |
| Draft present | The card offers **Resume application** (primary) plus a secondary **Start over** |
| Closing the form | Ghost **Back to overview** on **every step**, draft kept |
| Right-hand guidance panel | Kept unchanged; the start card stays short and does not duplicate it |
| Copy | Heading **"Ready to apply?"**, button **"Start application"** |
| Reveal behaviour | Page scrolls to the form and focus moves to the form heading |
| `?apply=1` + saved draft | The draft wins: the form opens at the saved step with its banner |
| Where the outcome lives | Inside the start card for Rejected/Withdrawn (no second card) |
| Start over | Asks for confirmation before clearing the draft |
| "Restored your draft" note | Dismissible banner at the top of the form |

---

## 3. Current behaviour to change

| # | Today | After |
| --- | --- | --- |
| 1 | `render()` → `showWizard()` for `canApply && !application` | `render()` → `showStart()`; the form only opens from the button |
| 2 | `render()` → `showStatus()` (with `#applyAgainBtn`) for Rejected/Withdrawn | `showStart()` with the outcome block and the primary button |
| 3 | `#applyAgainBtn` click resets motivation, the truthful checkbox, program and batch, then `showWizard()` | The reset moves into the shared "begin application" routine used by Start and Start over |
| 4 | No open batches → `noticePanel` ("Applications are closed right now") | Start card in its disabled state with **Check again**; `noticePanel` is kept for load failures only |
| 5 | Reload loses every answer | Draft restores answers and step; a banner says so |
| 6 | No way out of the form except submitting or leaving the page | **Back to overview** on every step |

`showOnly()` currently swaps four panels (`loading`, `notice`, `status`, `wizard`); it gains a fifth (`start`).

Nothing changes on the server: `GET /api/applications/me` already returns `canApply`, `reason`, `application` and `history`, and `GET /api/applications/open-batches` already returns the programs with their batches and `filledCount`/`slotCapacity`.

---

## 4. Screen model

### 4.1 Panels in the left column

| Panel | Id | Purpose |
| --- | --- | --- |
| Loading | `#loadingPanel` | Unchanged |
| Load failure | `#noticePanel` | Unchanged — only for a failed load or refresh, with **Try again** |
| **Start card** | `#startPanel` (new) | The gate: requirements, outcome when relevant, Start / Resume / Start over / Check again |
| Status | `#statusPanel` | Unchanged — live applications and the account-block explanations |
| Form | `#wizardPanel` | Unchanged markup; no longer auto-shown |

### 4.2 State matrix

| Trainee state | Visible panel | Button | Under the button |
| --- | --- | --- | --- |
| Still loading | `#loadingPanel` | — | — |
| Eligible, no application, batches open | `#startPanel` | **Start application**, enabled | Nothing |
| Eligible, no application, no open batches | `#startPanel` | **Start application**, disabled | "No open batches are accepting applications right now." + ghost **Check again** |
| Last application Rejected/Withdrawn, `canApply`, batches open | `#startPanel` + outcome block | **Start application**, enabled | Nothing |
| Last application Rejected/Withdrawn, not `canApply` or no batches | `#startPanel` + outcome block | Disabled | Reason line (see §5.4) |
| Application Submitted / Under review / Approved | `#statusPanel` | — | No start card at all; facts, documents and withdraw stay as today |
| `already_enrolled` / `completed` / `account_inactive` with no application | `#statusPanel` | — | Existing "You are enrolled" / "Training completed" / "Account inactive" message |
| Form open | `#wizardPanel` | — | — |
| Load or submit error | `#noticePanel` / inline `#submitError` | — | Unchanged |

Rationale for rows 6–7: those trainees already get a full explanation from the status card, so an additional disabled button would repeat it. This is listed in §14 as an assumption to confirm.

### 4.3 Start card markup sketch

```html
<section class="panel" id="startPanel" hidden aria-labelledby="start-title">
    <header class="panel__head">
        <h2 id="start-title">Ready to apply?</h2>
        <span class="panel__meta">Application</span>
    </header>

    <!-- Only for Rejected / Withdrawn -->
    <div id="startOutcome" hidden>
        <span class="status-badge rejected" id="startOutcomeBadge">Rejected</span>
        <dl class="facts">
            <div><dt>Decided</dt><dd id="startOutcomeDate">—</dd></div>
            <div id="startOutcomeNoteRow" hidden>
                <dt>Message from the training office</dt>
                <dd class="is-note" id="startOutcomeNote"></dd>
            </div>
        </dl>
    </div>

    <div class="state">
        <strong id="startLead">Have these ready before you begin.</strong>
        <ul class="start__requirements" id="startRequirements">
            <li>Your details and an emergency contact</li>
            <li>A Curriculum Vitae and a valid ID — PDF, JPG or PNG, up to 10 MB each</li>
            <li>About 10 minutes, in one sitting</li>
        </ul>
        <p>One application at a time. You can withdraw it while the office is reviewing.</p>
    </div>

    <div class="wizard__actions">
        <button class="btn btn--ghost" id="startOverBtn" type="button" hidden>Start over</button>
        <button class="btn btn--ghost" id="startCheckBtn" type="button" hidden>Check again</button>
        <div class="wizard__actions-end">
            <button class="btn btn--primary" id="startApplyBtn" type="button">Start application</button>
        </div>
    </div>

    <p class="field__hint" id="startReason" hidden></p>
</section>
```

The last outcome message (`#startOutcome`) reuses the existing `.status-badge` variants and `.facts` list, so no new visual language is needed. `.start__requirements` is the only new class: a plain `<ul>` using the existing `--muted` colour, 1.5 line height, and a small disc marker (see §11).

### 4.4 Button states

| State | Label | `disabled` | Notes |
| --- | --- | --- | --- |
| Fresh | Start application | no | |
| Checking availability | Checking… | yes | Spinner is not added; the label change is the feedback |
| Draft saved | Resume application | no | Card also shows the saved date in `#startReason`-style hint text under the button: "Saved 12 Nov 2026, step 3 of 6." |
| Blocked | Start application | yes | `aria-describedby` points at `#startReason` |
| No batches | Start application | yes | `#startCheckBtn` visible |

---

## 5. Behaviour

### 5.1 Opening the page

1. `refresh()` loads identity, application state and open batches as today.
2. `render()` decides the panel using §4.2, defaulting to `showStart()`.
3. `showStart()` never touches the form; it does not call `renderProgramOptions()`, `fillBatchOptions()` or `resetDocumentState()`.
4. `prefillContactFields()` only runs when the form is actually being opened, so no fields are written before the trainee starts.

### 5.2 Clicking Start / Resume

1. Button text becomes **Checking…** and the button is disabled.
2. Re-fetch `GET /api/applications/open-batches` (and only that endpoint).
3. If the request fails: restore the button, show an inline error under it ("We could not check availability. Try again.") and stay on the card.
4. If the trainee is no longer eligible or no programs remain: switch the card to its disabled state with the right reason; the form is **not** opened.
5. Otherwise open the form:
   - `renderProgramOptions()`, `fillBatchOptions(elements.program.value)`, `prefillContactFields()`, `resetDocumentState()`.
   - Restore the draft if one exists (§7), then `goToStep(draft ? draft.step : 1)`.
   - Hide `#startPanel`, show `#wizardPanel`, hide `#noticePanel`.
   - Scroll `#wizardPanel` to the top (`block: "start"`) and move focus to `#wizard-title` (`tabindex="-1"`).
6. A second click while the first is in flight is impossible because the button is disabled.

### 5.3 Back to overview

- Ghost button **Back to overview** placed first in the action row of all six steps, before **Back**.
- Clicking it saves the draft, hides `#wizardPanel`, shows `#startPanel` restored to its current state (Resume application, since a draft now exists), and scrolls/focuses `#start-title`.
- No confirmation: the draft is kept, so nothing is lost.
- If the page was opened with `?apply=1`, the flag is stripped (`history.replaceState({}, "", "apply.html")`) so a reload lands on the card.
- The step is preserved in the draft, so Resume returns to the same step.

### 5.4 Disabled reasons (exact strings)

| Situation | `#startReason` |
| --- | --- |
| No open batches | "No open batches are accepting applications right now." |
| Account inactive | "This account cannot submit applications. Please contact the administrator." |
| Enrolled already | "Your enrolment is active, so a new application is not needed." |
| Completed | "Your training is complete, so applications are closed for this account." |
| Open application exists | "You already have an application under review." (only if a live application is somehow shown alongside the card — normally §4.2 row 6 applies) |

`Check again` calls the same availability re-check and re-enables the button when batches appear.

### 5.5 Start over

- Visible only when a draft exists.
- `confirm("Start over? Your saved answers will be cleared.")`; on cancel nothing happens.
- On confirm: remove the draft key, reset the form fields to the prefill defaults (contact fields re-filled from the profile, everything else cleared), clear document state, set `step = 1`, and open the form fresh.

### 5.6 Submitting

Unchanged except that a successful submit deletes the draft. If the submit fails, the draft stays and the form stays open with the error.

---

## 6. Deep links

| URL | Behaviour |
| --- | --- |
| `apply.html` | Start card (or status panel per §4.2) |
| `apply.html?apply=1` | Open the form directly — still after the eligibility and availability check; if the check fails, fall back to the card with its reason |
| `apply.html?submitted=1` | Unchanged: `state.justSubmitted = true` so the status panel uses the "we will email you" wording |
| `apply.html?apply=1` + saved draft | Draft wins: form opens at the saved step and shows the restore banner |
| `apply.html?apply=1` + Back to overview | Flag removed from the URL, card shown |

The dashboard CTA (`#applicationCta`, currently `href="apply.html"`) becomes `apply.html?apply=1`. The sidebar **Apply for training** nav item keeps pointing at plain `apply.html` so the portal's own navigation still shows the card.

Resume from the card does **not** write `?apply=1` into the URL, because the draft already survives a reload; the URL stays clean so the browser's back button is not polluted with form states.

---

## 7. Draft specification

### 7.1 Storage

- `localStorage`, key **`edtspApplyDraft`** (matches the `edtsp*` key convention: `edtspToken`, `edtspUser`, `edtspSidebarCollapsed`).
- Not `sessionStorage`: the trainee may close the tab and come back.
- Cleared on successful submit, on logout, and by Start over.

### 7.2 Shape

```json
{
  "version": 1,
  "userId": "<user._id>",
  "savedAt": "2026-11-15T09:12:44.118Z",
  "step": 3,
  "values": {
    "firstName": "", "lastName": "", "email": "", "phone": "", "address": "",
    "dateOfBirth": "", "sex": "", "civilStatus": "", "highestEducation": "",
    "schoolAttended": "",
    "emergencyContactName": "", "emergencyContactPhone": "", "emergencyContactRelationship": "",
    "program": "", "batch": "", "motivation": "",
    "acknowledgedTruthful": false
  },
  "documentNames": { "cv": ["my-cv.pdf"], "valid_id": ["id-front.jpg", "id-back.jpg"] }
}
```

Rules:

- Ignore and delete the draft if `version` is not `1`, `userId` does not match the signed-in user, `step` is outside 1–6, or JSON parsing fails. This keeps a shared device from leaking another account's answers into a form.
- `documentNames` holds names only, for the reminder on step 5. No `File`, no base64, no bytes.

### 7.3 When it is written

- Debounced 400 ms on `input` and `change` inside `#applicationForm` (text, selects, checkbox, motivation).
- Immediately on `goToStep()`.
- Flushed on `pagehide` and when `visibilitychange` reports hidden.
- Never while `state.submitting` is true.

### 7.4 Restoring

- Read once after `loadApplicationState()` resolves, before `render()`.
- Fields are filled through the normal element values (no synthetic `input` events), the batch select is re-enabled before its value is set, and the motivation counter is updated.
- If the saved `program` is missing from `state.programs`, or the saved `batch` is missing/full: both are cleared, everything else is kept, and step 4 shows the existing "That program is no longer available." / "Choose an available batch." validation when the trainee reaches it. A hint appears above step 4 until it is fixed: "The program or batch you picked is no longer available. Choose another."
- The banner above step 1 reads **"We restored the answers you started on 12 Nov 2026."** with a dismiss control. It is shown only on the first render after a restore, on whichever step was restored, and never after submitting.

### 7.5 Files

Chosen files cannot be persisted, so:

- On restore, step 5 shows, under each document's picker, a muted line: "Saved with your draft: my-cv.pdf, my-cv-2.pdf — attach them again." Rendered from `documentNames`.
- `state.documents` starts empty; the step 5 validation is unchanged and still blocks Next without at least one attached file.
- Inherited documents from a previous application (server-side ids, `state.inherited`) are **not** affected: they re-attach automatically from `applicationData.history` on every load.

### 7.6 Logout

`frontend/js/dashboard.js` (loaded by the apply page as well) handles `#logoutButton`. Add `localStorage.removeItem("edtspApplyDraft")` beside the existing token/user removals.

---

## 8. Copy deck

| Where | String |
| --- | --- |
| Card heading | Ready to apply? |
| Card lead | Have these ready before you begin. |
| Requirement 1 | Your details and an emergency contact |
| Requirement 2 | A Curriculum Vitae and a valid ID — PDF, JPG or PNG, up to 10 MB each |
| Requirement 3 | About 10 minutes, in one sitting |
| Card footnote | One application at a time. You can withdraw it while the office is reviewing. |
| Primary button | Start application |
| Primary button (draft) | Resume application |
| Draft hint under button | Saved 12 Nov 2026, step 3 of 6. |
| Secondary button | Start over |
| Start over confirm | Start over? Your saved answers will be cleared. |
| Blocked button | Start application (disabled) |
| No batches | No open batches are accepting applications right now. |
| Check again | Check again |
| Checking | Checking… |
| Availability error | We could not check availability. Try again. |
| Draft banner | We restored the answers you started on 12 Nov 2026. |
| Draft banner dismiss | `Dismiss` (text link) |
| Files hint | Saved with your draft: {names} — attach them again. |
| Back control | Back to overview |

Dates use the existing `formatDate()` helper (e.g. `12 Nov 2026`).

---

## 9. Edge cases

| Case | Behaviour |
| --- | --- |
| Reload on step 4 with answers | Card appears (no `?apply=1`), button reads **Resume application**, form reopens on step 4 with the banner |
| Reload with `?apply=1` and a draft | Form opens immediately at the saved step |
| Draft exists, trainee clicks Start application (not Resume) | Same result — the draft is the form's starting state; the two buttons differ only in wording |
| Second tab open on the apply page | Last write wins; no conflict detection, no cross-tab sync |
| Draft from another account on a shared device | Ignored and deleted |
| Draft with a program that was unpublished meanwhile | Program and batch cleared, rest kept, hint above step 4 |
| Draft whose step is 6 | Restored at review; documents must still be re-attached, so step 5 validation runs on submit |
| Batches close while the card is open | Start re-checks, the form does not open, the card switches to the disabled state |
| Batch fills while the form is open | Unchanged: step 4 and the server both reject the full batch |
| Trainee withdraws, then clicks Apply | Start card with outcome (Withdrawn), inherited documents attach on open |
| Decision arrives while the page is open | Status panel updates on the next `refresh()`; start card disappears |
| Applications closed and `?apply=1` | Flag ignored; card shown disabled with **Check again** |
| Logged out mid-draft | Draft removed with the session |
| Storage unavailable (private mode/quota) | Draft read/write wrapped in `try/catch`; the page works as today without a draft |
| Very long filenames in the draft hint | Truncated with CSS `text-overflow: ellipsis` on one line each |
| Double-click Start | Second click blocked by `disabled` during the availability check |

---

## 10. Accessibility and responsive

- The form heading `#wizard-title` gets `tabindex="-1"` and `.focus()` after reveal, so screen readers announce the form instead of dropping the user at the top of the page.
- The start card heading `#start-title` is focusable the same way when returning via **Back to overview**.
- The disabled button stays a real `<button disabled>` with `aria-describedby="startReason"`; the reason is text, not a tooltip.
- The requirement list is a real `<ul>`; the restored-draft banner is `role="status"`, dismissible, and announced once.
- Scroll uses `scrollIntoView({ block: "start" })` with no smooth animation, so `prefers-reduced-motion` needs no special case.
- The card sits in the existing `.grid--record` left column and inherits the current stacking behaviour below 720 px; the requirement list wraps without change.
- Focus order on the card: heading → Start over (when present) → Check again (when present) → Start application.

---

## 11. Files to change

| File | Change |
| --- | --- |
| `frontend/trainee/apply.html` | Add `#startPanel` (§4.3); remove `#applyAgainBtn` from `#statusPanel`; add `tabindex="-1"` to `#wizard-title`; add the draft banner and a draft-files hint element |
| `frontend/js/apply.js` | `showStart()`, `openForm()`, availability re-check, `#startApplyBtn` / `#startOverBtn` / `#startCheckBtn` handlers, Back-to-overview button, draft save/restore/clear, `?apply=1` handling, focus management, retire `#applyAgainBtn` |
| `frontend/css/portal.css` | `.start__requirements` list, `.draft-note` banner, small ellipsis rule for draft file names — everything else reuses `.panel`, `.state`, `.facts`, `.status-badge`, `.field__hint`, `.wizard__actions` |
| `frontend/trainee/dashboard.html` | `#applicationCta` href → `apply.html?apply=1` |
| `frontend/js/dashboard.js` | Remove `edtspApplyDraft` on logout |

No backend, model, route or admin changes.

---

## 12. Out of scope

- Saving drafts on the server (no `applications/draft` endpoint).
- Persisting file contents in the draft.
- Changes to the six steps, their validation, the document upload rules or the submit payload.
- The right-hand **Before you apply** panel.
- The dashboard's own application card beyond the CTA href.
- Analytics on how many trainees click Start or abandon the form.

---

## 13. Assumptions to confirm

1. **The start card is not shown for live or account-blocked states** (§4.2 rows 6–7). The status panel already explains enrolment, completion, inactivity and open applications, and showing a disabled button next to that explanation would duplicate it. If the intent is a start card in *every* no-form state, the status panel content would have to move into it.
2. **Start over clears the draft** even though the interview chose "discard on submit only" — Start over is the explicit reset that makes the choice meaningful, so "submit only" is read as "no automatic/discard-on-leave, no expiry".
3. **The deep-link parameter is `?apply=1`** (mirroring the existing `?submitted=1`).
4. **Drafts live in `localStorage`**, not `sessionStorage`, and have no expiry; they are removed by submit, Start over and logout.
5. **`Check again` in the disabled card replaces the old "applications are closed" notice card**; `#noticePanel` remains only for load failures.
6. **`#applyAgainBtn` is retired** — the start card's primary button takes over the Rejected/Withdrawn path.
7. **The card's requirement list is static copy**, not generated from eligibility rules, so it stays short and truthful.
8. **The page-head deck** ("Submit your details for review. One application at a time.") stays as is.

---

## 14. Acceptance checklist

1. Loading `apply.html` as an eligible trainee with no application shows the start card, not the form.
2. The form element is still present in the DOM but hidden; no program or batch options are populated before Start.
3. Clicking **Start application** re-checks batches and opens the form at step 1, scrolled to the form with focus on "Application form".
4. If batches disappeared while the page was open, the form does not open and the card shows the disabled state with **Check again**.
5. With no open batches at load, the card shows a disabled button and the reason; **Check again** enables it once batches exist.
6. A Rejected trainee sees the start card with the outcome badge, decision date and office message; no second card.
7. A trainee with a Submitted/Under review/Approved application sees the status panel exactly as today, with no start card.
8. Answers and step survive a reload: the card offers **Resume application**, and the form reopens on the saved step with the restore banner.
9. Chosen files do not survive a reload; step 5 lists their names with "attach them again" and still blocks Next until real files are attached.
10. Inherited documents from a previous application are still attached automatically.
11. **Start over** confirms, clears the draft and reopens an empty form at step 1 with contact fields prefilled.
12. **Back to overview** appears on all six steps, keeps the draft and returns to the card.
13. `apply.html?apply=1` opens the form directly; with a draft it lands on the saved step.
14. Logging out removes `edtspApplyDraft`.
15. No draft is left behind after a successful submit.
16. Keyboard-only path works: Start → form heading announced → Back to overview → card heading announced.
17. Nothing about step validation, document upload, submit or the admin modal changes.

---

## 15. Manual verification plan

1. Log in as a trainee with no application, with at least one open batch. Open **Apply for training** from the sidebar → start card is the only thing in the left column; the form is not visible.
2. Click **Start application** → form opens at step 1, page has scrolled, focus ring is on the "Application form" heading. Fill step 1, go to step 2, reload → card shows **Resume application** with the saved date and step; resume → step 2 with the banner.
3. Pick files on step 5, go back to step 1, click **Back to overview** → card shows Resume; resume → the same step, and step 5 now lists the previously chosen filenames as a reminder.
4. Click **Start over** → confirm prompt; after confirming, the form is empty at step 1 and the card no longer offers Resume.
5. From the dashboard, click **Apply for training** → the form opens directly (no card).
6. As a Rejected trainee → card shows the badge, decision date and the office message; after starting, documents from the previous application are already attached.
7. As a trainee with a Submitted application → status panel with facts, documents and **Withdraw**; no start card.
8. Close the last open batch in the admin area, then reload the apply page → disabled button with "No open batches are accepting applications right now." and **Check again**; reopen a batch and click **Check again** → the button enables.
9. Submit an application → status panel appears and `localStorage.getItem("edtspApplyDraft")` is `null`.
10. Log out mid-draft → `edtspApplyDraft` is gone.

---

## 16. Risks and trade-offs

- **Draft privacy.** Answers (name, address, birth date, phone) sit unencrypted in `localStorage`. Scoping by user id plus clearing on submit and logout limits exposure but does not remove it from a shared machine.
- **Stale draft surprises.** A trainee who abandoned the form weeks ago returns to the card offering Resume. The banner names the date, which makes the age visible, but there is no expiry (per the interview).
- **Two clicks from the dashboard is reduced to one, from the sidebar still two.** If the sidebar link starts feeling like a dead end, the same `?apply=1` trick can be applied there later.
- **The card adds a screen for trainees who already know what they want.** The requirement list is short and the primary button is the only emphasis, so the cost is one click.
- **The retired `#applyAgainBtn`** means `showStatus()` no longer offers an apply action; any future state that needs one must return to the start card.
