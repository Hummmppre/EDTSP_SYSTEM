# EDTSP — Esperon Dairy Training Student Portal

Single-origin Express application: the API and the static portal are served from the
same process, so the browser only ever calls relative `/api` paths.

- **Backend:** Node 22, Express 5, Mongoose 9, JWT, bcrypt
- **Frontend:** plain HTML/CSS/JS (no build step), served from `frontend/`
- **Optional:** UploadThing for payment receipt images

## Quick start

```bash
cp backend/.env.example backend/.env     # then fill in the values
npm --prefix backend install
npm --prefix backend run create-admin -- --firstName Jane --lastName Cruz \
  --email jane@example.com --password "a long password"
npm run dev                              # http://localhost:<PORT>
```

Open the server root for the landing page, `/login.html` for the portal.

## Environment variables

| Variable | Required | Purpose |
| --- | --- | --- |
| `MONGODB_URI` | yes | MongoDB connection string (Atlas or local) |
| `JWT_SECRET` | yes | Signs session tokens — use a long random value |
| `PORT` | no | Defaults to `5000` |
| `NODE_ENV` | no | `development` / `production` / `test` |
| `CORS_ORIGINS` | no | Comma-separated allowlist. Leave empty for same-origin |
| `UPLOADTHING_TOKEN` | no | Enables receipt image uploads; without it the form still works |
| `DEMO_PASSWORD` | no | Password used by the demo seed |

Generate a secret with:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

`backend/.env` is gitignored. Only `backend/.env.example` is committed.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | API + portal with nodemon |
| `npm start` | Production start |
| `npm run lint` | ESLint (backend, frontend, config) |
| `npm test` | `node --test` suite against an in-memory MongoDB |
| `npm run seed:demo` | Guarded demo dataset (`backend/scripts/seedDemo.js`) |
| `npm --prefix backend run migrate:programs` | Dry-run program migration (add `--apply` to write) |
| `npm --prefix backend run migrate:assessments` | Dry-run assessment migration |
| `npm --prefix backend run create-admin` | Non-interactive admin creation |

## API surface

All routes except auth and health require `Authorization: Bearer <token>`.

### `/api/auth`

| Method | Path | Access | Notes |
| --- | --- | --- | --- |
| POST | `/signup` | public | Creates the trainee account and profile |
| POST | `/login` | public | Returns `{ token, user }` |
| GET | `/me` | any | Fresh account + profile (session guard) |
| POST | `/logout` | any | Bumps `tokenVersion`, revoking every token |
| POST | `/change-password` | any | Returns a replacement token |
| POST | `/forgot-password` | public | Generic response; returns `resetToken` outside production |
| POST | `/reset-password` | public | Single-use token, 30 minute expiry |

### `/api/trainee`

`GET /me`, `PUT /me` (phone + address), `GET /payments`, `POST /payments`,
`GET /cows`, `GET /activities` — all trainee-scoped and read-mostly.

### `/api/assessments`

`GET /me` (trainee), `GET /trainees`, `GET /`, `POST /`, `PUT /:id/grade` (admin).

### `/api/admin`

`GET /summary`, `GET /trainees`, `PATCH /trainees/:userId`,
`GET /trainees/:userId/payments`, `GET|POST /programs`, `PATCH|DELETE /programs/:id`,
`GET|POST /payments`, `PUT /payments/:id/verify`, `PUT /payments/:id/reject`,
`GET|POST /cows`, `PATCH /cows/:id`, `GET|POST /activities`,
`PATCH /activities/:id`, `PUT /activities/:id/status`.

### List responses

```json
{
  "success": true,
  "count": 25,
  "total": 132,
  "page": 2,
  "pages": 6,
  "limit": 25,
  "assessments": []
}
```

Resource keys: `trainees | programs | payments | cows | activities | assessments`.

### Errors

```json
{ "success": false, "message": "Human-readable cause.", "field": "email", "code": "DUPLICATE_EMAIL" }
```

## Fee model

`Program.totalFee` defines the fee. A trainee's balance is
`program.totalFee − sum(Verified payments)`. Pending and rejected payments never
reduce a balance, and an amount above the remaining balance is rejected with
`AMOUNT_EXCEEDS_BALANCE`. Editing a program fee recalculates balances immediately.

## Migrations

The migrations are idempotent and dry-run by default:

```bash
npm --prefix backend run migrate:programs                 # print the plan
npm --prefix backend run migrate:programs -- --apply      # write
npm --prefix backend run migrate:assessments -- --apply
```

Take a `mongodump` backup before `--apply` against a shared database.

## Seeding

```bash
npm run seed:demo                        # create/refresh demo records
npm run seed:demo -- --reset             # remove demo records only
```

Demo records are identified by the `@demo.edtsp.local` email domain and the
`COW-901…903` IDs. Nothing outside that set is modified. The seed refuses to run
without `--demo` and blocks `NODE_ENV=production` unless `--force` is passed.

## Tests

```bash
npm test
```

`node:test` + `supertest` + `mongodb-memory-server`. The helper overrides
`MONGODB_URI`, so the suite never touches Atlas. Rate limits are disabled when
`NODE_ENV=test`.

## Deployment

### Docker

```bash
docker build -t edtsp .
docker run --env-file backend/.env -p 5000:5000 edtsp
```

The image runs as a non-root user, serves `frontend/` and the API from port 5000,
and exposes a `HEALTHCHECK` on `/api/health`.

### Docker Compose (app + local MongoDB)

```bash
docker compose up --build
```

Compose starts the app and a `mongo:7` container. To use Atlas instead, set
`MONGODB_URI` in `backend/.env` and run only the app:

```bash
docker compose up --build app
```

Any platform that runs a container image can host this unchanged; no host-specific
configuration files are required.

### Health check

`GET /api/health` reports the real Mongoose state and returns `503` when the
database is not connected:

```json
{ "success": true, "message": "EDTSP Backend API is running!", "database": "Connected", "uptime": 1234 }
```

## Security notes

- `backend/.env` was committed historically. It has been removed from the index,
  but old values remain in git history: **rotate the Atlas database password and
  `JWT_SECRET` before deploying**.
- The UploadThing token must only live in `backend/.env`. Rotate it in the
  UploadThing dashboard if it was ever shared.
- `protect` re-reads the account on every request, so deactivation and logout take
  effect immediately.
- Forgot-password returns the reset token outside production only, because no email
  provider is configured. Wire an email provider before relying on it in production.

## Project layout

```
backend/    Express app, models, controllers, routes, scripts, tests
frontend/   Static portal (admin, trainee, auth pages, css, js)
```

`frontend/css/dashboard.css` is retained as a design reference only — no page links it.
