# EDTSP System

Esperon Dairy Training Student Portal — backend API (Node/Express + MongoDB) and static frontend.

## Backend setup

```bash
cd backend
npm install
npm run dev
```

The API runs on `http://localhost:5000` by default.

### Environment variables (`backend/.env`)

| Variable | Purpose |
| --- | --- |
| `PORT` | API port (defaults to `5000`) |
| `MONGODB_URI` | MongoDB connection string |
| `JWT_SECRET` | Secret used to sign login tokens |
| `BREVO_API_KEY` | Brevo transactional email API key |
| `INTEGRATION_ENCRYPTION_KEY` | 32-byte key (base64 or 64 hex characters) used to encrypt credentials saved from System settings |
| `MAIL_FROM` | Sender identity, e.g. `Esperon Dairy Training Student Portal <no-reply@example.com>` |
| `GOOGLE_CLIENT_ID` | Google Sign-In OAuth client ID |
| `RECAPTCHA_SECRET_KEY` | reCAPTCHA secret key (env fallback) |
| `RECAPTCHA_SITE_KEY` | reCAPTCHA site key (env fallback; the database value is public) |
| `APP_URL` | Public frontend URL used in emailed password reset links (defaults to `http://localhost:5500`) |
| `TRUST_PROXY` | Number of trusted proxy hops, so rate limits see the real client IP (for example `1`) |
| `RATE_LIMIT_STORE` | `mongo` (default when a database is configured) or `memory` for single-process tests |

`MAIL_FROM` may also be supplied as separate `MAIL_FROM_EMAIL` and `MAIL_FROM_NAME` values.

### Rate limiting

Limits apply to writes only — `POST`, `PUT`, `PATCH` and `DELETE`. Each write
endpoint allows **60 requests per 15 minutes per client IP**, counted per route
pattern (so `/api/admin/trainees/<id>` uses one bucket no matter which ID is
requested). Going over returns `429` with `Retry-After` and
`{ "success": false, "message": "Too many requests. Please wait a few minutes and try again." }`.

The limit is per endpoint: exhausting one endpoint does not block any other.

Reads (`GET`, `HEAD`, `OPTIONS`) are never rate limited, so page-load fetches,
dashboards, polls, downloads and exports work regardless of write traffic. Read
responses carry no `RateLimit-*` headers. `GET /api/health` and unmatched paths
are unlimited as well.

Sensitive write flows keep their own tighter limits on top of the write bucket:
login 10 per 15 minutes, signup 5 per hour, Google sign-in 10 per 15 minutes,
forgot/reset password 3 per hour (per IP and per account), and avatar/document
uploads 20 per 15 minutes. Exports (`POST /api/admin/exports/:dataset/google-sheets`
and `GET /api/admin/applications/export`) are exempt from rate limiting.

`Retry-After` reports the seconds left in the window. A rejected request does not
extend the window or consume the allowance, so the endpoint recovers on schedule.

Rate limiting uses the shared `rateLimitCounters` MongoDB collection whenever
`MONGODB_URI` is configured, including in production, so every API instance
enforces the same counters. Counters expire automatically; set
`RATE_LIMIT_STORE=memory` only for a single-process test environment. Behind a
proxy, set `TRUST_PROXY` so limits see the real client IP.

## Email (Brevo)

Transactional email is sent from `backend/lib/mailer.js` using Brevo's
`POST https://api.brevo.com/v3/smtp/email` endpoint. No extra npm package is
needed — it uses the built-in `fetch` of Node 18+.

```js
const { sendEmail, sendApplicationDecision } = require("./lib/mailer");

await sendEmail({ to, subject, text, html });
await sendApplicationDecision({ to, name, program, batch, decision, publicNote });
```

Both helpers return `{ sent, error }` and never throw, so a failed email cannot
break the request that triggered it. If `BREVO_API_KEY` or `MAIL_FROM` is
missing, the send is skipped with a warning.

Check the configuration by sending yourself a test message:

```bash
cd backend
node scripts/testEmail.js                 # sends to the MAIL_FROM address
node scripts/testEmail.js you@example.com # or to a specific address
```

**Deliverability:** Brevo only delivers to arbitrary recipients once the sender
domain or address is verified in the Brevo dashboard. Until then, test sends
must go to the address on the Brevo account.

## Training applications

Trainees apply for a program/batch at `frontend/trainee/apply.html` (API:
`/api/applications`). Administrators review and decide at
`frontend/admin/applications.html` and manage programs and batches at
`frontend/admin/programs.html`.

Approving an application claims a batch slot, sets the trainee profile to
`Ongoing`, issues an `EDT-YYYY-NNN` trainee ID when the trainee has none, and
emails the trainee. Rejections and withdrawals never change batch counts.

Seed a few programs and batches before trying the form (no applicants are
created):

```bash
cd backend
node scripts/seedPrograms.js
```

### Emails sent automatically

| Event | Helper in `backend/lib/mailer.js` |
| --- | --- |
| Trainee signup or admin account created | `sendWelcomeEmail` |
| Application submitted | `sendApplicationReceived` |
| Application approved or rejected | `sendApplicationDecision` |
| Assessment assigned | `sendAssessmentAssigned` |
| Assessment graded | `sendAssessmentGraded` |

All of them return `{ sent, error }` and never throw, so an email failure never
fails the request that triggered it.

## Google Calendar (cow maintenance)

Maintenance activities are added to a Google Calendar automatically once an
administrator connects an account from **Cow maintenance → Google Calendar**.
Activities scheduled before connecting, or while a token was revoked, are
backfilled with **Sync existing activities**.

Add these values to `backend/.env` (OAuth client of type *Web application*):

| Variable | Purpose |
| --- | --- |
| `GOOGLE_CALENDAR_CLIENT_ID` | OAuth client ID |
| `GOOGLE_CALENDAR_CLIENT_SECRET` | OAuth client secret |
| `GOOGLE_CLIENT_SECRET` | Google Sign-In client secret, used only to validate the credential pair from System settings |
| `GOOGLE_CALENDAR_REDIRECT_URI` | Must match the API callback, e.g. `http://localhost:5000/api/integrations/google-calendar/callback` |
| `GOOGLE_CALENDAR_ID` | Target calendar (defaults to `primary`) |
| `GOOGLE_CALENDAR_TIMEZONE` | IANA zone for event times (defaults to `Asia/Manila`) |

Register the same redirect URI under **Authorized redirect URIs** in the Google
Cloud console, otherwise Google rejects the connect request with
`redirect_uri_mismatch`.

The refresh token is stored in MongoDB (`googlecalendarcredentials`); a token
supplied through `GOOGLE_CALENDAR_REFRESH_TOKEN` takes precedence.
`GET /api/integrations/google-calendar/status` verifies the stored token, so a
revoked connection is reported as disconnected with `needsReconnect: true`.
`POST /api/integrations/google-calendar/sync` (admin) backfills up to 100 pending
activities that have no calendar event.

## Integration credentials (System settings)

Administrators can enter and validate credentials for Google Authentication,
Brevo, Google Calendar, Google Sheets, and reCAPTCHA from **System settings**.
`Test` checks the entered values without saving. `Save` validates first and
stores the values only when validation succeeds. `Clear saved key` removes the
database override and returns to the environment value.

Encryption:

```bash
# 32 bytes, base64 (recommended) or 64 hex characters
openssl rand -base64 32
```

Set the result as `INTEGRATION_ENCRYPTION_KEY` before saving any credential.
Credentials are encrypted with AES-256-GCM; the key is never accepted from the
browser. If the variable is missing or malformed, saves and clears return `503`
and existing database credentials fail closed. Losing the key requires
re-entering every saved credential.

Precedence and resolution:

- A value saved in the UI overrides the matching environment variable per field.
- If a database record exists but a field is absent or cannot be decrypted, the
  environment value is **not** used; the integration reports an unreadable or
  missing credential.
- `Clear saved key` restores environment resolution.
- Calendar and Sheets share one encrypted OAuth client record; clearing either
  Google card clears that shared client. Calendar keeps its own calendar ID.

Validation behavior:

- Google Authentication checks the client ID format and verifies the client
  ID/secret pair with Google's token endpoint.
- Google Calendar refreshes the stored Google token and reads one calendar event.
  Google Sheets refreshes the token and performs a minimal Drive read; no
  spreadsheet ID is configured, so Sheets API enablement is not checked.
- Brevo calls `GET https://api.brevo.com/v3/account`. Sender identity is not
  checked.
- reCAPTCHA checks that both keys are present and match Google's key shape. Key
  pairing cannot be verified without a live challenge.
- Validation calls time out after 8 seconds. Any failure, including a timeout or
  provider outage, rejects the save and leaves the previous credential active.

Endpoints (admin only, under `/api/system-settings`):

| Method | Path | Purpose |
| --- | --- | --- |
| `POST` | `/integrations/:integration/test` | Validate candidate values without saving |
| `PUT` | `/integrations/:integration` | Validate, encrypt, and save |
| `DELETE` | `/integrations/:integration` | Remove the database override |
| `GET` | `/integrations/audit?limit=20&before=<ISO>` | Read the audit trail |

Audit entries record the integration, action, outcome, code, administrator,
IP, and timestamp for 12 months. No secret value, prefix, suffix, or hash is
written to the audit collection. Validation requests are limited to 20 per 15
minutes per administrator in addition to the normal write limiter.

## Frontend

`frontend/` is plain HTML/CSS/JS and can be served by any static file server
(for example `npx serve frontend`). Pages call the API at `http://localhost:5000`.
