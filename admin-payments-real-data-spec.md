# Admin Payments — Real Data Connection — Spec

**Status:** Draft for approval
**Requested:** "in the admin payment feature connect it to the backend to fetch real data in the data base"
**Scope agreed in interview:** build the missing payment backend (model, controllers, routes) and wire **both** the admin Payments page and the trainee Payment balance page to it. Reading and **recording** payments are in scope; editing and deleting are not.

---

## 1. Problem and outcome

`frontend/admin/payments.html` is a static mock. Every figure on it is hardcoded demo content: the four ledger cells (₱432,000 / ₱318,000 / ₱114,000 / 12), four invented trainees (`EDT-2026-001` … `-004`), two invented transactions (`PAY-001`, `PAY-002`), a hardcoded trainee `<select>` in the record-payment modal, and a submit handler that only calls `alert("This is a frontend demonstration. No payment was saved.")`. The page footer even says "Records shown here are demo data."

There is **no backend for payments at all**: no `Payment` model, no controller, no route, no mount in `server.js`. The MongoDB database does contain an empty `payments` collection (0 documents, only the default `_id` index), created without a corresponding model, so the collection name is already available for a real schema.

The trainee page (`frontend/trainee/payments.html`) is the same story — ₱18,000 / ₱13,500 / ₱4,500 / "Partial", one invented `EDT-PAY-001` record, and a 75% progress meter.

After this change:

- An administrator sees real payment accounts for every **approved applicant**, with fee, amount paid, balance, and derived status read from MongoDB.
- Ledger totals are computed from real data.
- "Record payment" saves a real `Payment` document and the page reflects it on reload.
- "View" opens a details dialog for that program account with its full transaction list.
- A trainee sees their own real fee, payments, balance, and history on their Payment balance page.
- The demo labels are gone from both pages.

---

## 2. Current state, verified

**Frontend**

- `frontend/admin/payments.html` — static `<tbody id="paymentTableBody">` with four rows carrying `data-status="Fully Paid|Partial|Unpaid"`; ledger IDs `totalFees`, `totalCollected`, `outstandingBalance`, `fullyPaidCount`; modal fields `#paymentTrainee`, `#paymentAmount`, `#paymentDate`, `#paymentMethod`, `#referenceNumber`, `#paymentRemarks`; `<span class="demo-tag">Demo data</span>` and a footer line "Records shown here are demo data."
- `frontend/js/admin-payments.js` — modal open/close, client-side search + status filter over `#paymentTableBody` rows, a View handler that alerts `row.innerText`, and a submit handler that alerts a demonstration message and never calls the API. It does not fetch anything and does not send an auth token.
- `frontend/trainee/payments.html` — ledger cells with no IDs, `#paymentHistoryBody` with one invented row, a 75% meter, a four-step "How a payment is recorded" panel, `demo-tag` + demo footer. Loads `dashboard.js` and `portal.js` only (no payment-specific script).
- `frontend/js/admin.js` — admin gate (token + `role === "admin"`), sidebar, logout, pending-application badge. Uses the hardcoded `http://localhost:5000` base like every other page in the project.

**Backend**

- Models present: `User`, `TraineeProfile`, `TrainingApplication`, `Program`, `Batch`, `Assessment`, `SystemSettings`, `Counter`. **No `Payment`.**
- Controllers present: auth, trainee, application, applicationAdmin, assessment, assessmentAdmin, program, systemSettings. **No payment.**
- Routes: no payment route; `server.js` mounts only auth, trainee, assessments, applications, admin applications, system settings, admin programs/batches.
- `authMiddleware.js` exports `protect`, `traineeOnly`, `adminOnly` — the same guard chain every existing route uses.
- `Counter` + `Counter.findOneAndUpdate({ _id: "traineeId-YYYY" }, { $inc: { seq: 1 } }, { upsert: true, new: true })` is the established sequence pattern (see `applicationAdminController.nextTraineeId`).
- Admin listing convention (see `applicationAdminController`): `{ success, count, items }`, `200`/`400`/`404`/`409`/`500`, `console.error` in the catch.

**Database (live, queried read-only during this interview)**

| Collection | Count |
| --- | --- |
| users | 5 |
| programs | 1 — `Dairy Training`, fee **40000**, Open |
| batches | 1 |
| trainingapplications | 1 — `Approved`, user `test.trainee@example.com`, program `Dairy Training`, decided 2026-11-12 |
| traineeprofiles | 2 — the approved user's profile has **no `traineeId`**, program string `"Dairy Production Training"` (stale name) and `enrollmentStatus: "Pending"` |
| payments | **0** |
| assessments | 7 |

Two consequences drive the design: (a) `TraineeProfile.program` is a stale string and `traineeId` can be missing, so the approved application must be the source of truth; (b) the current approved trainee will render with a `—` trainee ID and a ₱40,000 fee, which makes a good smoke test.

---

## 3. Decisions locked in the interview

| Topic | Decision |
| --- | --- |
| Scope | Read + record. No edit/delete/void of payments |
| Who appears | Only trainees with an **Approved** `TrainingApplication` |
| Fee source | Live `Program.fee` from the application's program (no snapshot) |
| Verification | None — an admin-recorded payment is final. No Pending/Verified state |
| Program link | The **latest approved application**'s `program` reference |
| Account granularity | One account per approved application (separate rows per program), not one per trainee |
| Overpayment | Allowed; `balance` clamps at ₱0, no negative balances |
| Payment date | Any valid date **up to today**; future dates rejected |
| Reference number | Required for `GCash` and `Bank Transfer`; optional for `Cash` and `Other`; no uniqueness rule |
| Receipt email | None. No new Brevo template |
| View action | Opens a details dialog with account figures + that account's full transaction list |
| Trainee page | Included: balance summary **plus** the trainee's own transactions, combined across programs |
| Trainee multi-program display | One combined total (not per-program cards/tabs) |
| Missing Program record | Row is included with fee ₱0 and a visible flag |
| Program column | Added to the admin records table |
| Fully-paid ledger cell | Counts **distinct trainees** whose accounts are all fully paid |
| Filtering | Fetch everything, filter/search in the browser (matches trainees page) |
| Pagination | None |
| Demo labels | Removed from both payment pages |

### Assumptions to confirm (not answered explicitly)

1. **Duplicate approvals for the same program.** If a trainee has two Approved applications pointing at the *same* Program, only the most recent one becomes an account; otherwise the same fee would be billed twice. Different programs still produce different accounts.
2. **Receipt number.** Every payment gets a human-readable `PAY-YYYY-NNN` receipt number from the existing `Counter` collection (`_id: "payment-YYYY"`), matching the `EDT-YYYY-NNN` trainee-ID style. `_id` is not shown to users.
3. **Zero-fee program.** A resolved program with `fee: 0` is immediately `Fully Paid` (nothing to collect).
4. **Recorded status wording.** Since there is no verification step, the trainee history table's "Verified" badge becomes **"Recorded"**, and the ledger note "Verified payments" becomes "Recorded payments". Admin ledger note stays "Verified payments" only if reworded to match — spec changes it to "Recorded payments" for honesty.
5. **API base.** Frontend keeps the project-wide `http://localhost:5000` constant; deployment URL configuration is out of scope (same as every other page).
6. **Recent transactions limit.** The admin page shows the 20 most recent payments. The details dialog shows that account's full history.

---

## 4. Data model

### `backend/models/Payment.js` (new)

```js
{
  application: { type: ObjectId, ref: "TrainingApplication", required: true, index: true },
  user:        { type: ObjectId, ref: "User", required: true, index: true },
  program:     { type: ObjectId, ref: "Program", required: true },
  receiptNumber: { type: String, required: true, unique: true },   // PAY-YYYY-NNN
  amount:      { type: Number, required: true, min: 0.01 },
  paymentDate: { type: Date, required: true },
  method:      { type: String, required: true, enum: ["Cash", "Bank Transfer", "GCash", "Other"] },
  referenceNumber: { type: String, default: "", trim: true, maxlength: 100 },
  remarks:     { type: String, default: "", trim: true, maxlength: 500 },
  recordedBy:  { type: ObjectId, ref: "User" }
}
// { timestamps: true }
```

Indexes: `{ application: 1, paymentDate: -1 }` and `{ paymentDate: -1 }` in addition to the unique `receiptNumber`.

- Amounts are Philippine pesos stored as `Number`, rounded to 2 decimals (`Math.round(value * 100) / 100`).
- `paymentDate` is stored as UTC midnight of the entered calendar date, the same way application dates are compared.
- `application` is authoritative for which account a payment belongs to; `user` and `program` are copied at write time so listings don't need a second populate.

### `backend/lib/paymentAccounts.js` (new helper)

Single place that turns approved applications + payments into accounts, used by both controllers (mirrors how `mailer.js` centralizes shared behavior).

```js
buildPaymentAccounts() → Promise<{ accounts, summary }>
```

Rules:

1. Load `TrainingApplication.find({ status: "Approved" })`, populate `user` (`firstName lastName email`) and `program` (`name fee`), sort by `decidedAt` descending.
2. Collapse duplicate `(user, program)` pairs to the newest application (assumption 1).
3. Load all `Payment` amounts grouped by application (`aggregate` `$group` on `application`, `$sum: "$amount"`).
4. Load `TraineeProfile` for the involved users to read `traineeId` (may be missing → `null`).
5. Per account:
   - `fee = program ? program.fee : 0`
   - `amountPaid = paymentsSum || 0`
   - `balance = Math.max(fee - amountPaid, 0)`
   - `needsProgram = !program`
   - `status`: `needsProgram` → `"Unpaid"`; `fee === 0` → `"Fully Paid"`; `amountPaid >= fee` → `"Fully Paid"`; `amountPaid > 0` → `"Partial"`; else `"Unpaid"`
6. `summary`:
   - `totalFees = Σ fee`
   - `totalCollected = Σ amountPaid`
   - `outstandingBalance = Σ balance`
   - `fullyPaidTrainees` = distinct users whose every account is `Fully Paid` (a flagged `needsProgram` account means not fully paid)
   - `accountCount`, `traineeCount`

Account shape:

```json
{
  "applicationId": "6af528081b0947d31267fd04",
  "traineeId": null,
  "firstName": "Test",
  "lastName": "Trainee",
  "fullName": "Test Trainee",
  "email": "test.trainee@example.com",
  "programId": "6af440f82bf2313774a3302f",
  "programName": "Dairy Training",
  "fee": 40000,
  "amountPaid": 0,
  "balance": 40000,
  "status": "Unpaid",
  "needsProgram": false
}
```

---

## 5. API contract

Mount in `backend/server.js`:

```js
const { adminPaymentRoutes, traineePaymentRoutes } = require("./routes/paymentRoutes");
app.use("/api/admin/payments", adminPaymentRoutes);
app.use("/api/trainee/payments", traineePaymentRoutes);
```

`backend/routes/paymentRoutes.js` exports two routers in the `programRoutes.js` style, each guarded by `protect` + role middleware.

### 5.1 `GET /api/admin/payments`

`protect`, `adminOnly`. No query params (client-side filtering).

```json
{
  "success": true,
  "summary": { "totalFees": 40000, "totalCollected": 5000, "outstandingBalance": 35000, "fullyPaidTrainees": 0, "accountCount": 1, "traineeCount": 1 },
  "accounts": [ /* account shape above */ ],
  "transactions": [
    {
      "id": "6af6...",
      "receiptNumber": "PAY-2026-001",
      "traineeName": "Test Trainee",
      "traineeId": null,
      "programName": "Dairy Training",
      "amount": 5000,
      "method": "GCash",
      "paymentDate": "2026-11-13T00:00:00.000Z",
      "referenceNumber": "GC-2026-002",
      "remarks": ""
    }
  ]
}
```

`transactions` are the 20 most recent payments across all accounts, sorted `paymentDate` desc then `createdAt` desc. `accounts` sorted by `fullName`, then `programName`.

### 5.2 `GET /api/admin/payments/:applicationId`

`protect`, `adminOnly`. Returns one account plus its full transaction list, used by the View dialog.

- Invalid ObjectId or no approved application → `404 { success: false, message: "Payment account not found." }`
- 200 → `{ success: true, account, payments: [ /* as in transactions, no traineeName duplication required */ ] }`

### 5.3 `POST /api/admin/payments`

`protect`, `adminOnly`. Body:

```json
{ "applicationId": "...", "amount": 5000, "paymentDate": "2026-11-13", "method": "GCash", "referenceNumber": "GC-2026-002", "remarks": "" }
```

Validation, in this order:

| Check | Failure response |
| --- | --- |
| `applicationId` missing/invalid | `400` "Please choose a trainee account." |
| Application missing or `status !== "Approved"` | `404` "Payment account not found." |
| `amount` not finite or `<= 0` | `400` "Enter a valid payment amount." |
| `paymentDate` missing/invalid | `400` "Enter a valid payment date." |
| `paymentDate` after today (local end of day) | `400` "Payment date cannot be in the future." |
| `method` not in enum | `400` "Choose a valid payment method." |
| `method` is `GCash`/`Bank Transfer` and trimmed reference is empty | `400` "A reference number is required for GCash and bank transfers." |
| `referenceNumber` > 100 chars / `remarks` > 500 chars | `400` with the field limit |

Then: generate `PAY-YYYY-NNN`, create the document with `recordedBy: req.user.id`, recompute that account and the summary, and return

```json
{ "success": true, "message": "Payment recorded successfully.", "payment": { ... }, "account": { ... }, "summary": { ... } }
```

with `201`. Overpayment is accepted (amount stored in full, `balance` clamps to 0). No email is sent. `500` catch: `console.error("Record payment error:", error)` → "Unable to record this payment." Duplicate `receiptNumber` (unique index race) is retried once, then `500`.

### 5.4 `GET /api/trainee/payments`

`protect`, `traineeOnly`. Scoped to `req.user.id` — no id in the URL, so a trainee can never read another's data.

```json
{
  "success": true,
  "summary": { "totalFee": 40000, "totalPaid": 5000, "balance": 35000, "status": "Partial", "accountCount": 1 },
  "accounts": [ /* this trainee's accounts only */ ],
  "payments": [ /* merged across accounts, newest first, each with programName */ ]
}
```

- Combined totals: `totalFee = Σ fee`, `totalPaid = Σ amountPaid`, `balance = Σ balance`, `status` from the same rule applied to the totals (`Fully Paid` / `Partial` / `Unpaid`).
- No approved application → `200` with `{ totalFee: 0, totalPaid: 0, balance: 0, status: "Unpaid", accountCount: 0 }`, `accounts: []`, `payments: []`, plus `hasAccounts: false` so the UI can explain why.

---

## 6. Admin page changes

### `frontend/admin/payments.html`

- **Remove** `<span class="demo-tag">Demo data</span>` and the footer line "Records shown here are demo data." (replace with a neutral record-count or nothing).
- Add a feedback element under the page head: `<p class="state state--inline" id="paymentFeedback" role="status" hidden></p>` (same pattern as `programFeedback` / `applicationFeedback`).
- Add a **Program** column to the records table header after "Trainee name". New cell order: Trainee ID · Trainee name · **Program** · Total fee · Amount paid · Balance · Status · Action.
- Replace the four hardcoded `<tbody>` rows with an empty `<tbody id="paymentTableBody"></tbody>`.
- Add an empty/loading state paragraph `#paymentEmpty` (`.empty-state`, `hidden`) after the table wrap.
- Keep `#paymentStatusFilter` values `all` / `Fully Paid` / `Partial` / `Unpaid`.
- Record-payment modal: delete the four hardcoded `<option>`s from `#paymentTrainee` (keep the placeholder). Add `<p class="state state--inline" id="paymentFormError" role="status" hidden></p>` above the modal actions.
- Add a details modal `#paymentDetailsModal` (`admin-modal` markup, `data-portal-modal`, `aria-labelledby`): account header (name, trainee ID, program, status badge), a facts block (fee, paid, balance, program flag when `needsProgram`), a transactions table (`ticket`/`Reference`, date, amount, method, reference, remarks) and a close button.
- The ledger IDs `#totalFees`, `#totalCollected`, `#outstandingBalance`, `#fullyPaidCount` stay; their text is overwritten at load.
- Change the ledger note "Verified payments" → "Recorded payments".

### `frontend/js/admin-payments.js`

Keep the existing modal wiring and filter function; add data loading.

- `const PAYMENTS_API_URL = "http://localhost:5000/api/admin/payments";` plus `authHeaders()` reading `edtspToken`.
- `loadPayments()` on `DOMContentLoaded` after the admin gate has already run in `admin.js` (script order is `admin.js` then `admin-payments.js`). `401` → clear `edtspToken`/`edtspUser`, redirect to `../login.html`. Other failures → `#paymentFeedback` shows "Unable to load payment records." and the table stays empty.
- `renderSummary(summary)` formats with `toLocaleString("en-PH")`, prefixing `₱`. Empty database → all zeros.
- `renderTable(accounts)` builds rows with `document.createElement` (no `innerHTML` interpolation of API strings — the assessments page uses `innerHTML`, but names must not be injectable). Each `<tr>` gets `data-status` for the existing filter, `data-application-id`, and a status badge class: `Fully Paid → completed`, `Partial → pending`, `Unpaid → inactive`, matching the demo markup's classes.
- Flagged account (`needsProgram`): fee/balance show `₱0`, status badge `Unpaid`, and a small note "Program unavailable" in the status cell.
- Missing `traineeId` renders `—`.
- Empty state: `#paymentEmpty` text "No approved trainee accounts yet. Approve an application to start recording payments." and `hidden = false`; the table's `<tbody>` gets one `colspan="8"` "No payment accounts found." row so the table never looks broken.
- Search + filter keep working unchanged (they read `row.textContent` and `row.dataset.status`), now covering the program name too.
- `View` → `openDetails(applicationId)`: show the modal, fetch `GET /api/admin/payments/:applicationId`, render figures and the full payment list, or an inline error if the fetch fails. Replaces the current `alert(row.innerText)`.
- Record modal: `populateTraineeOptions(accounts)` builds one option per account, `value = applicationId`, label `"<Full name> — <program> (<traineeId or 'no ID'>) · ₱<balance> left"`. Options are not disabled (overpayment is allowed).
- `#paymentTrainee` default amount/date: date defaults to today (`new Date().toISOString().slice(0,10)`), but must be computed from the local date to avoid an off-by-one in +08:00.
- Submit: client-side guard (trainee, amount > 0, date, method), reference required when method is GCash/Bank Transfer (mirror the server message), button disabled with "Saving…", `POST`, then on success: close modal, reset form, show `#paymentFeedback` "Payment recorded successfully." and `loadPayments()` again. On `400`/`404`, keep the modal open and put the server message in `#paymentFormError`.
- Remove the demonstration `alert` entirely.

---

## 7. Trainee page changes

### `frontend/trainee/payments.html`

- Add `<script src="../js/payments.js" defer></script>` (after `dashboard.js`).
- Remove `<span class="demo-tag">Demo records</span>` and the footer line "Payment records shown here are demo data."
- Give the four ledger values IDs: `#traineeTotalFee`, `#traineeAmountPaid`, `#traineeBalance`, `#traineeStatus`, and their notes `#traineeAmountPaidNote`, `#traineeStatusNote` for status-dependent wording.
- Give the progress panel hooks: `#feeProgressPercent`, `#feeProgressFill`, `#feeProgressNote`, `#factTotalFee`, `#factPaid`, `#factBalance`, `#factNextStep`.
- History table: add a **Program** column (Reference · Payment date · Program · Description · Method · Amount · Status) and replace the seeded row with an empty `<tbody id="paymentHistoryBody">`. Reference cell shows `receiptNumber`; Description shows `remarks` or `—`; Status badge reads **"Recorded"** (`completed` class).
- Keep `#paymentEmptyState`, use it for "No payments recorded yet."
- Change "Verified payments" note to "Recorded payments" and step 04 copy "The administrator verifies and records the payment." → "The administrator records the payment in the portal."
- Add a page-level notice element `#paymentNotice` (`.state state--inline`, hidden) for the no-account case.

### `frontend/js/payments.js` (new)

- `GET http://localhost:5000/api/trainee/payments` with `Authorization: Bearer <edtspToken>`; `401` → redirect `../login.html`.
- Fill the ledger and the facts/meter from the combined summary: percent = `totalFee > 0 ? Math.min(100, Math.round(totalPaid / totalFee * 100)) : (accountCount ? 100 : 0)`; note "₱X of ₱Y received."
- Status cell/badge text from `summary.status`; next-step copy: `Fully Paid` → "Your training fee is settled." / `Partial` → "Settle the remaining ₱X with the training office." / `Unpaid` → "Pay the training fee with the training office to begin." / no account → "Your fee appears once your application is approved."
- `hasAccounts === false` → hide the progress panel and history panel, show `#paymentNotice` "No training fee account yet. Your fee appears here once an application is approved." Ledger shows zeros and status `—`.
- Render payment rows with `createElement`/`textContent`, sorted newest first; empty table → `#paymentEmptyState` visible.
- Multiple program accounts: the combined total is displayed; each payment row carries its own program in the Program column, so the split stays legible.

---

## 8. Files

| File | Change |
| --- | --- |
| `backend/models/Payment.js` | **New** — schema above |
| `backend/lib/paymentAccounts.js` | **New** — account + summary derivation shared by both controllers |
| `backend/controllers/paymentAdminController.js` | **New** — `listPayments`, `getPaymentAccount`, `recordPayment` |
| `backend/controllers/paymentController.js` | **New** — `getMyPayments` |
| `backend/routes/paymentRoutes.js` | **New** — `adminPaymentRoutes`, `traineePaymentRoutes` |
| `backend/server.js` | Mount the two routers |
| `frontend/admin/payments.html` | Program column, feedback/empty state, dynamic tbody, details modal, remove demo labels, ledger note |
| `frontend/js/admin-payments.js` | Fetch, render, View dialog, real POST, remove demo alert |
| `frontend/trainee/payments.html` | IDs/hooks, Program column, dynamic tbody, empty/notice states, copy fixes, remove demo labels |
| `frontend/js/payments.js` | **New** — trainee fetch + render |

Not touched: `frontend/js/admin.js`, `frontend/js/dashboard.js`, `backend/utils/*`, `backend/lib/mailer.js`, `portal.css` (existing `.ledger`, `.status-badge`, `.state`, `.admin-modal`, `.empty-state` classes cover everything; add no new styles unless a flag note needs one small `.is-note` usage).

---

## 9. Edge cases

| # | Case | Expected behavior |
| --- | --- | --- |
| E1 | No approved applications at all | Admin page: zeros in the ledger, empty table, empty-state message. Trainee page: notice, zeros. No errors |
| E2 | Approved trainee with no `traineeId` (current DB reality) | Row renders with `—` in the Trainee ID cell; account still usable |
| E3 | `TraineeProfile.program` string disagrees with the application | Ignored. The application's Program reference wins |
| E4 | Program deleted / populate returns null | Row included, fee ₱0, balance ₱0, `needsProgram: true`, visible "Program unavailable" note, excluded from the fully-paid count |
| E5 | Two approved applications, different programs | Two rows, two accounts, two fees; trainee page shows one combined total |
| E6 | Two approved applications, same program | Newest application only (assumption 1) |
| E7 | Payment equals the fee exactly | `Fully Paid`, balance ₱0, counts toward `fullyPaidTrainees` |
| E8 | Overpayment (₱45,000 on a ₱40,000 fee) | Accepted; `amountPaid` 45,000, balance ₱0, summary `totalCollected` includes the full 45,000, `outstandingBalance` 0 |
| E9 | Fee edited after payments exist | Balance recomputes from the live fee; a fully paid account can become `Partial` again. Accepted by decision |
| E10 | Fee set to 0 | `Fully Paid` with balance 0 (assumption 3) |
| E11 | Two payments in one second | Distinct `PAY-YYYY-NNN` numbers from the atomic `Counter` increment |
| E12 | POST with a non-approved or unknown application | `404`, nothing written |
| E13 | POST with `paymentDate` tomorrow | `400`, nothing written |
| E14 | POST with GCash and blank reference | `400`, nothing written |
| E15 | POST with amount `0`, negative, `NaN`, or `"abc"` | `400` "Enter a valid payment amount." |
| E16 | Amount with 3 decimals (e.g. 10.005) | Stored rounded to 2 decimals (10.01) |
| E17 | Trainee with a cancelled/withdrawn application only | Not listed anywhere (only `Approved` counts) |
| E18 | Trainee calls the admin endpoint | `403` from `adminOnly` |
| E19 | Admin calls the trainee endpoint | `403` from `traineeOnly` |
| E20 | Expired token on either page | `401` → redirect to `../login.html` and clear stored session |
| E21 | Payment recorded for an account, then the browser refreshes | Payment persists and the balance reflects it (proves MongoDB, not memory) |
| E22 | Server down | Feedback line "Unable to load payment records." / trainee notice; no unhandled rejection in the console |
| E23 | XSS attempt in a trainee name or remarks | Rendered as text via `textContent`; never parsed as HTML |

---

## 10. Acceptance criteria

- [ ] `GET /api/admin/payments` returns the one real approved trainee with fee 40000, paid 0, balance 40000, status `Unpaid`, `traineeId: null`.
- [ ] The admin page shows that real row and the real ledger totals (₱40,000 / ₱0 / ₱40,000 / 0) instead of the demo numbers.
- [ ] Recording a ₱5,000 payment through the modal creates a `payments` document visible in MongoDB with `recordedBy` set and a `PAY-2026-NNN` receipt number.
- [ ] After recording, the admin row reads paid ₱5,000 / balance ₱35,000 / `Partial`, and the ledger updates without a manual reload.
- [ ] The same payment appears in "Recent payment transactions" and in the View dialog.
- [ ] The trainee page for `test.trainee@example.com` shows ₱40,000 / ₱5,000 / ₱35,000, `Partial`, 13% paid, and the payment row labeled with its program.
- [ ] Overpayment is accepted and the balance never goes negative.
- [ ] GCash without a reference, a future date, and a zero amount are all rejected with 400 and write nothing.
- [ ] `demo-tag` and the demo footer sentence are gone from both payment pages.
- [ ] Searching by trainee name, trainee ID, or program name filters the real rows; the status filter matches the derived status.
- [ ] No hardcoded payment rows, amounts, or trainee options remain in either page's initial HTML.
- [ ] No new npm dependencies.

---

## 11. Verification plan (manual; no test framework exists)

1. `cd backend && npm run dev`; log in as an admin in the browser to obtain a token (`POST /api/auth/login`), then
   `curl -s localhost:5000/api/admin/payments -H "Authorization: Bearer $TOKEN"` → one account, fee 40000, empty transactions.
2. `curl -i -X POST localhost:5000/api/admin/payments -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{"applicationId":"<from step 1>","amount":5000,"paymentDate":"2026-11-13","method":"Cash"}'` → `201`; re-run step 1 → paid 5000, balance 35000, one transaction.
3. Reload the admin page → row and ledger match the API; footer no longer claims demo data.
4. Record ₱50,000 more through the UI → status `Fully Paid`, balance ₱0, `fullyPaidTrainees` 1.
5. Trainee login for `test.trainee@example.com` → Payment balance shows the combined figures, 100%, history with both payments and program labels.
6. Negative checks: GCash with no reference, tomorrow's date, amount 0, and a non-approved application id → all `400`/`404`, and `payments` count unchanged.
7. Confirm the DB: `payments` count equals the number recorded; documents carry `application`, `user`, `program`, `receiptNumber`, `recordedBy`.
8. `git status` → only the files listed in §8 changed.

---

## 12. Non-goals

- Editing, voiding, refunding, or deleting a recorded payment (a mistake currently needs a database fix).
- Verification / approval workflow for payments, proof-of-payment uploads, or trainee-submitted payments.
- Receipt or notification email.
- Fee snapshots per account or per payment (live `Program.fee` was chosen deliberately, with the E9 consequence accepted).
- Pagination, server-side sorting, or server-side search.
- Invoices/PDF export and payment reporting beyond the four ledger totals.
- Deployment API base configuration (the `localhost:5000` convention stays).
- Any change to `backend/utils/recaptcha.js`, the auth flow, or the leftover debug `console.log`s in `authMiddleware.js`.

---

## 13. Open questions (non-blocking)

1. Should fully paid accounts stay in the record-payment dropdown? Current plan lists them (overpayment allowed) with their remaining balance shown as `₱0`.
2. Should the admin page default to hiding `Fully Paid` rows? The filter defaults to "All payment status" for now.
3. The empty `payments` collection predates this work — drop it or let the new model write into it? Current plan reuses the name, so no migration is needed.
4. Should `traineeId` be backfilled for approved applicants whose profile lacks one? Out of scope, but it would make the Trainee ID column fully populated.
