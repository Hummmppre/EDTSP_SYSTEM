# Apply Page Document Upload — Feature Spec

**Short name:** `apply-document-upload`
**Status:** Draft for approval
**Requested:** "add a file upload in the apply page of the trainee"
**Scope owner:** Trainee application flow (`frontend/trainee/apply.html`, `frontend/js/apply.js`) + application API
**Backend impact:** Yes — new upload/download endpoints, new `multer` dependency, GridFS storage, `TrainingApplication.documents`
**Admin impact:** Yes — documents group in the application review modal (`frontend/admin/applications.html`, `frontend/js/admin-applications.js`)

---

## 1. Problem and outcome

The apply wizard collects every answer as plain JSON (`POST /api/applications`) and the training office has no way to receive the applicant's **Curriculum Vitae** or **Valid ID**. `trainee-application-spec.md` recorded "no file uploads" as an explicit assumption; this feature supersedes that assumption for these two documents.

After this feature:

- A trainee attaching their CV and Valid ID is mandatory before an application can be submitted.
- Files are stored in MongoDB **GridFS** (same Atlas database, no server disk, no third-party bucket).
- Admins open the documents from the existing application review modal; the trainee can open their own copies and can replace/remove attachments while the application is still under review.
- Re-applying after a rejection starts with the previous application's documents already attached.

---

## 2. Decisions locked in the interview

| Topic | Decision |
| --- | --- |
| Documents collected | Exactly two labelled documents: **Curriculum Vitae** and **Valid ID** |
| Required | Both required — submit is blocked without at least one file for each |
| Placement | New **Documents** step between *Training choice* and *Review* → the wizard becomes **6 steps** |
| Storage | **MongoDB GridFS** (no disk, no cloud bucket, survives redeploys) |
| Accepted types | PDF, JPG, PNG |
| Per-file size | Max **10 MB** per file |
| Files per document | No count limit in the UI; capped by the combined application size (see §4.4) |
| Upload timing | Files travel **only at final Submit**, as one `multipart/form-data` request |
| After submit | Replace/remove allowed while `Submitted` / `Under review`; frozen after a decision |
| Required-document removal | **Blocked** — a required document may never drop to zero files |
| Re-apply after rejection | Previous documents **pre-attached**, submittable as-is |
| Image handling | Store the original file as uploaded (no re-encoding, no `sharp`) |
| Retention | Keep forever, including rejected and withdrawn applications (audit trail) |
| Who can open | Admins + the owning trainee, through auth-checked download routes (no public URLs) |
| Admin surface | Documents group inside the **application review modal only** (no table column, no trainee-detail changes) |
| Display | Label + original filename + size (e.g. `Valid ID — my-id.jpg · 2.4 MB`) |

### Assumptions to confirm

1. **Combined size cap of 30 MB per application.** With no per-document file count limit, something must bound the request. 30 MB is 3× the single required minimum and matches two 10 MB documents plus replace-preserved slack. It is a single named constant (`MAX_APPLICATION_BYTES`) used by both client and server.
2. **Hard ceiling of 10 files per document** as a safety net behind "unlimited" — enforced server-side, surfaced only in an error message, never as a counter in the UI.
3. **The GridFS bucket name is `applicationDocuments`**, one bucket for all documents, with metadata identifying the owner and application.
4. **Attachments are not part of the CSV export** in this pass.
5. **Only `POST /api/applications` becomes multipart.** Every other route keeps `express.json()` as today.

---

## 3. Data model

### 3.1 `TrainingApplication.documents` (new field)

```js
documents: [
    {
        type: {
            type: String,
            enum: ["cv", "valid_id"],
            required: true
        },
        files: [
            {
                fileId: {                       // GridFS files._id
                    type: mongoose.Schema.Types.ObjectId,
                    required: true
                },
                filename: { type: String, required: true },  // original name, as uploaded
                contentType: { type: String, required: true }, // application/pdf | image/jpeg | image/png
                size: { type: Number, required: true },        // bytes
                uploadedAt: { type: Date, default: Date.now },
                reusedFrom: {                   // set only when inherited from a prior application
                    type: mongoose.Schema.Types.ObjectId,
                    ref: "TrainingApplication",
                    default: null
                }
            }
        ]
    }
]
```

Rules:

- Both entries (`cv`, `valid_id`) are always present on a submitted application, each with `files.length >= 1`.
- Documents are never edited for a decided application (frozen once `status` is `Approved`, `Rejected` or `Withdrawn`).
- No new database index is required; GridFS ships its own `files`/`chunks` indexes.

### 3.2 GridFS layout

- Bucket: `applicationDocuments`, created once from `mongoose.mongo.GridFSBucket` (no new dependency — `mongoose` exposes the driver).
- Chunk size: driver default (255 KB).
- `files` metadata: `{ userId, applicationId, documentType, originalName }`.
- Binary is written **after** field validation and **before** the application insert, then rolled back if the insert fails (see §6.3).
- Original bytes are preserved (no re-encode), so a 9.8 MB phone photo stays 9.8 MB.

### 3.3 Nothing else changes

- `Program`, `Batch`, `TraineeProfile`, `User`, `Counter` are untouched.
- No `.gitignore` change: nothing is written to disk.

---

## 4. Validation rules (shared by client and server)

### 4.1 Type

Accepted extensions **and** MIME types:

| Document | Allowed |
| --- | --- |
| Curriculum Vitae (`cv`) | `.pdf`, `.jpg`, `.jpeg`, `.png` |
| Valid ID (`valid_id`) | `.pdf`, `.jpg`, `.jpeg`, `.png` |

Server-side the declared MIME type is treated as a claim, not a fact: the first bytes are sniffed (`%PDF-`, `FF D8 FF`, `89 50 4E 47`) and a mismatch is rejected with *"That file is not a PDF, JPG or PNG. Please check the file and try again."* Rejection happens before any GridFS write.

### 4.2 Size

- Per file: `0 < size <= 10 MB` → otherwise 400 *"Each file must be 10 MB or smaller."*
- Empty file (0 bytes) → 400 *"That file is empty. Please choose another."*
- Combined: `sum(all new files) <= 30 MB` → otherwise 400 *"These documents are too large together. Keep the total under 30 MB."*

### 4.3 Counts

- Per document type in one request: max 10 files (400 *"You can attach up to 10 files per document."*).
- `multer` runs with `limits: { fileSize: 10 MB, files: 20, fields: 40 }`; Multer's `LIMIT_FILE_SIZE` and `LIMIT_FILE_COUNT` are translated into the 400 messages above rather than surfacing a generic 500.

### 4.4 Required presence

- At submit, each of `cv` and `valid_id` must end up with `>= 1` file after inheritance (§6.2) → otherwise 400 *"Attach your Curriculum Vitae and Valid ID before submitting."*
- A required document may not be emptied by the trainee while under review → DELETE returns 400 *"Your Valid ID is required. Replace it with another file instead of removing it."*

---

## 5. Trainee experience

### 5.1 Wizard becomes six steps

`frontend/trainee/apply.html`:

1. Applicant
2. Background
3. Emergency contact
4. Training choice
5. **Documents** *(new)*
6. Review

Changes:

- `.process--steps` list gains a `data-step="5"` item — `Documents` / *CV and valid ID* — and the Review item becomes `05 → 06`.
- New `.wizard__step[data-step="5"]` panel; the Review panel becomes `data-step="6"`.
- `#wizardMeta` copy becomes "Step X of 6".
- `frontend/js/apply.js`: clamp in `goToStep()` moves from `1..5` to `1..6`; `validateStep(5)` validates documents; the submit handler pre-validates steps `1..5`; `buildReview()` gains a Documents group.

### 5.2 The Documents step itself

Two blocks, using the existing `.field` / `.field--full` grid:

```
Curriculum Vitae            (required)
[ Choose files ]  PDF, JPG or PNG · up to 10 MB each
attached: cv-2026.pdf · 480 KB   [remove]
          scan-2.png  · 1.1 MB   [remove]

Valid ID                    (required)
[ Choose files ]  PDF, JPG or PNG · up to 10 MB each
attached: my-id.jpg · 2.4 MB     [remove]
```

- Native `<input type="file" multiple accept=".pdf,.jpg,.jpeg,.png">` per document, visually replaced by a bordered button styled from existing tokens (no custom drop-zone invention, no drag-and-drop in this pass).
- Selected files are listed immediately (label + original filename + human size), each with a **remove** button — purely client-side state; nothing is uploaded yet.
- Client-side checks on selection and again before submit: type, per-file size, combined size, file count. Failures set `.field__error` on the document block and mark the input `aria-invalid`.
- Files chosen during a session are held in memory (`File` objects) and survive stepping Back/Next within the wizard.
- Step 5 cannot be passed while either document has zero files (blocked by inline error, not a toast).
- Copy under each block: *"Only the training office can open this file."* — honest about the fact that it is not a public link.

### 5.3 Submit (multipart)

- Submit builds `FormData`: every field that is in today's payload (unchanged names), plus repeated `cv` and `validId` entries for the files.
- The request uses `XMLHttpRequest` rather than `fetch` solely to obtain upload progress; the button shows `Uploading documents… 42%` and then `Submitting…`, and is disabled for the whole flight (double submit impossible).
- On success: same behaviour as today (`?submitted=1`, reload state, show status panel).
- On failure the wizard stays on step 6 with everything intact and an inline `.state`-style error naming the cause (too large / wrong type / network) — the trainee never loses their attached files.
- Cancel/abort (`xhr.abort()` when the user navigates away) is not required in this pass; a failed request simply leaves the form intact.

### 5.4 Status panel and post-submit management

`#statusFacts` gains a **Documents** row:

- Read-only (`Approved`/`Rejected`/`Withdrawn`): each document lists its files as label + filename + size with a **download** link.
- `Submitted` / `Under review`: same list plus **Replace** (opens a single-file picker for that document) and **Remove** per file. Remove is hidden for the last remaining file of a required document, so the block cannot be hit by accident.
- After replacing/removing, the status panel re-renders from the API response; failures show the server message inline.
- Downloads are fetched with the bearer token and saved through a Blob + object URL (the same technique the admin CSV export already needs), because a plain `<a href>` cannot carry the JWT.

### 5.5 Re-apply after rejection

- Opening the wizard for a fresh application after a `Rejected`/`Withdrawn` application pre-populates the Documents step from the **most recent** application that has documents.
- Files show the same label + filename + size rows, tagged *"from your last application"*, with no confirmation checkbox (per interview).
- The trainee may attach additional files or remove an inherited one, subject to §4.4; Submit with the inherited set untouched is valid.

---

## 6. API

All routes keep the project's `{ success, message, ... }` envelope, `protect` + role guards, `try/catch` with `console.error`, and generic 500 copy.

### 6.1 Changed: `POST /api/applications`

- `Content-Type: multipart/form-data`, parsed by `multer` (memory storage, empty-target) before the controller; file fields `cv` and `validId` (both `multiple`).
- Field validation order is unchanged and runs **first** (required text fields, ack, email, phone, date/age, motivation, open-application rule, enrollment guards, program/batch/status/capacity). Files are validated only after the application-level checks pass, so a bad form never costs an upload.
- New rejection: plain JSON bodies are no longer accepted → 400 *"Attach your Curriculum Vitae and Valid ID before submitting."* (the required-presence rule covers it without a bespoke content-type error).
- Response adds `documents` to the returned application in the same shape stored.

### 6.2 Inheritance of previous documents

Inside submit, before required-presence validation:

1. Find the applicant's most recent prior application with non-empty `documents`.
2. For each document type with **no** new files in this request, copy that prior application's file entries and stamp `reusedFrom: <prior application id>`.
3. GridFS blobs are **shared by reference** (same `fileId`), which is safe because retention is forever and no per-application deletion path exists.
4. If both types supplied new files, nothing is inherited.

### 6.3 Orphan-proofing

Upload happens at submit, so a failed submit must not leave blobs behind. Order:

1. Validate all non-file rules.
2. Validate files (type sniff, size, counts, combined cap).
3. Stream each file into GridFS (`bucket.openUploadStream`), collecting `fileId`s.
4. `TrainingApplication.create(...)`.
5. On **any** error in step 4 (including the `11000` one-open-application conflict and Mongoose `ValidationError`), delete every blob created in step 3, then return the same status/message the controller returns today.
6. If the blob write itself fails, abort the partially written stream, delete what was written, return 500 *"Unable to upload your documents. Please try again."*

### 6.4 New: attachment management (trainee)

| Method | Path | Body | Rules |
| --- | --- | --- | --- |
| `POST` | `/api/applications/:id/documents/:type` | multipart, single field `file` | Owner only; `type` ∈ `cv`,`valid_id`; application must be `Submitted`/`Under review`; same type/size rules; appends to that document's `files` |
| `DELETE` | `/api/applications/:id/documents/:fileId` | — | Owner only; `Submitted`/`Under review` only; 400 if it is the last file of a required document; deletes the GridFS blob and the subdocument |

Responses return the updated `documents` array. Status codes: 404 unknown application/file (never reveal another user's application), 400 rule violations, 409 when the application is already decided (*"This application has already been decided, so its documents can no longer be changed."*).

### 6.5 New: downloads

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| `GET` | `/api/applications/:id/documents/:fileId` | `protect` + trainee, owner only | Trainee downloads their own file |
| `GET` | `/api/admin/applications/:id/documents/:fileId` | `protect` + `adminOnly` | Admin opens any application's file |

Both:

- Verify the `fileId` is actually referenced by that application's `documents` (never stream an arbitrary GridFS id).
- Stream the blob with `Content-Type` from the stored `contentType`, `Content-Length` from `size`, `X-Content-Type-Options: nosniff`, `Cache-Control: private, no-store`, and `Content-Disposition: attachment` with a sanitized filename (strip CR/LF and path separators; use `filename*` for non-ASCII).
- Return 404 with the standard envelope when the blob is missing (e.g. a legacy application with no documents).

`GET /api/applications/me` and `GET /api/admin/applications/:id` must include `documents` (with `fileId`, `filename`, `contentType`, `size`, `uploadedAt`, `reusedFrom`) so both surfaces can render lists without extra calls.

---

## 7. Admin experience

Only `frontend/admin/applications.html` + `frontend/js/admin-applications.js` change.

- The review modal's facts area gains a **Documents** group listing each document by its label with every file as `filename · size · uploaded <date>` and a **Download** action per file.
- Download uses the existing token-plus-Blob pattern (no new tab with a bare URL, because the URL needs the Authorization header). Buttons show a busy state while fetching and surface a message if the file cannot be retrieved.
- No inline PDF/image preview in this pass (per interview); the file opens in the browser's PDF viewer or image viewer after download.
- `reusedFrom` is shown as a quiet note (*"from a previous application"*) so a reviewer is not surprised by an older file.
- Nothing shows in the applications table; no admin/trainee changes.

---

## 8. Errors, states and copy

| Situation | Surface | Copy |
| --- | --- | --- |
| Nothing attached on step 5 | Inline field error | "Attach your Curriculum Vitae and Valid ID before submitting." |
| Wrong type | Inline field error | "That file is not a PDF, JPG or PNG. Please check the file and try again." |
| File over 10 MB | Inline field error | "Each file must be 10 MB or smaller." |
| Combined over 30 MB | Inline field error | "These documents are too large together. Keep the total under 30 MB." |
| Too many files | Inline field error | "You can attach up to 10 files per document." |
| Removal of last required file | Inline error in status panel | "Your Valid ID is required. Replace it with another file instead of removing it." |
| Change after a decision | Inline error | "This application has already been decided, so its documents can no longer be changed." |
| Upload network/server failure | `.state` block on step 6 | "We could not upload your documents. Check your connection and try again." |
| Blob missing on download | Inline error | "That file is no longer available. Please contact the training office." |

Never a silent failure, never a raw Multer message, never a stack trace.

---

## 9. Mobile and accessibility

- Below 720px each document block stacks to one column; the file list wraps filename with `overflow-wrap: anywhere` so long or unbreakable names never widen the page.
- File inputs keep a real, focusable `<input type="file">` (visually hidden but labelled); the visible button is a `<label for>` so keyboard and screen-reader users can use it, and the file list is a `<ul>` with `aria-label="Curriculum Vitae files"`.
- Remove/Replace are real `<button type="button">`s with text labels (no icon-only controls), tap targets ≥ 44px, and the same 90ms press feedback as other buttons.
- Upload progress is announced through an `aria-live="polite"` region.
- Sizes and counts use tabular numerals, matching the ledger language in `DESIGN.md`.
- No colour-only meaning: "required" is text, not just a colour.

---

## 10. Dependencies and configuration

- **New dependency:** `multer` (^2.x) in `backend/package.json` — required for `multipart/form-data`. Nothing else is added; GridFS comes from `mongoose.mongo`.
- No new environment variables, no new keys, no new service account, no disk path to configure.
- `express.json()` stays for every other route; Multer is mounted only on the three multipart routes.
- Constants live in one place (`backend/lib/documentUpload.js`): `DOCUMENT_TYPES`, `ALLOWED_TYPES`, `MAX_FILE_BYTES = 10 MB`, `MAX_APPLICATION_BYTES = 30 MB`, `MAX_FILES_PER_DOCUMENT = 10`, bucket name.

---

## 11. Out of scope

- Drag-and-drop uploads, camera capture, client-side cropping or compression.
- Inline PDF/image preview in the admin modal.
- Attachments on any other form (payments, cow maintenance, assessments) and payment proof-of-payment uploads.
- Virus scanning / external AV service.
- Document verification status per file (e.g. "ID verified") and reviewer checkboxes.
- CSV export of file names, admin table document columns, trainee-detail modal documents.
- Editing attachments after a decision, and any admin-side replacement of a trainee's file.
- Purging documents (retention is permanent by decision).
- Updating `trainee-application-spec.md`'s "no file uploads" assumption beyond a one-line note pointing at this spec.

---

## 12. Acceptance checklist

1. Step 5 (**Documents**) appears between Training choice and Review; the wizard reads "Step X of 6" and Review is step 6.
2. Submit without a CV or without a Valid ID is blocked client-side *and* by the API with the documented 400 message.
3. A 12 MB PDF is rejected on selection (client) and would be rejected by the server if forced.
4. A `.docx` renamed to `.pdf` is rejected by the magic-byte check.
5. A valid 3-file CV set plus a 2-file Valid ID submits successfully; both documents are scoped to the trainee id and appear in `GET /api/applications/me`.
6. The admin review modal lists every file with filename, size, upload date, and downloads it successfully; a non-admin and a different trainee both get 404/403 on the same file id.
7. The trainee can download their own file; after `Approved` the Replace/Remove controls disappear and the API refuses changes with 409.
8. While `Under review`, replacing a file updates the list; removing the last Valid ID file returns the 400 required-document message.
9. A rejected applicant re-opens the wizard and both documents are already attached (tagged as from the previous application); submitting with them untouched succeeds and the admin sees the `reusedFrom` note.
10. A forced failure during `TrainingApplication.create` (e.g. duplicate open application) leaves **no** orphan blobs in `applicationDocuments.files`.
11. Every GridFS document carries `userId`, `applicationId`, `documentType`, `originalName` metadata, and no static `/uploads` folder or public URL exists anywhere.
12. `node --check` passes on every changed JS file; the flow was exercised end to end against the live database with a real PDF and a real JPG.

---

## 13. Verification plan (this repo has no test framework)

Manual scripts against the running server, in the style already used for payments:

1. Start `backend` (`node server.js`), sign a trainee JWT and an admin JWT.
2. Submit a real multipart application with `curl -F` and both documents; inspect the response, then confirm the blobs exist with a small script listing `applicationDocuments.files` and their metadata.
3. GET the trainee download route → 200 + correct bytes; GET it with another trainee's token → 404; GET the admin route with the admin token → 200.
4. DELETE the last Valid ID file → 400 required message; POST a replacement file → 200.
5. Force the duplicate-open-application path and confirm `applicationDocuments.files` count returns to its pre-request value.
6. Drive the six-step wizard in the browser with a PDF and a JPG, then repeat as a rejected applicant to confirm pre-attachment and the `reusedFrom` note.
