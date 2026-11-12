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
| `MAIL_FROM` | Sender identity, e.g. `Esperon Dairy Training Student Portal <no-reply@example.com>` |

`MAIL_FROM` may also be supplied as separate `MAIL_FROM_EMAIL` and `MAIL_FROM_NAME` values.

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

## Frontend

`frontend/` is plain HTML/CSS/JS and can be served by any static file server
(for example `npx serve frontend`). Pages call the API at `http://localhost:5000`.
