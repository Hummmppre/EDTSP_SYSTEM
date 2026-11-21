# Fetch-Exempt Rate Limiting — Spec

**Status:** Draft for approval
**Requested:** "in the ratelimiter don't include the fetch request to block" / "don't include the fetch request in the ratelimiter"
**Agreed scope (interview):** reads and automatic page fetches are never counted or blocked; the Google Sheets export is exempt from every limit; server-side outbound `fetch` calls are out of scope; only non-safe methods stay limited, at 60 requests / 15 minutes per endpoint per IP; this amends `per-endpoint-rate-limiting-spec.md`.

**Short name:** fetch-exempt-rate-limiting

---

## 1. Problem and outcome

Today `backend/server.js` mounts one limiter over the whole API:

```js
app.use("/api", apiLimiter); // 120 requests / 15 min, counted per IP
```

Every request counts, including the reads each admin page fires on load — most visibly the sidebar pending-applications badge (`frontend/js/admin.js`, `GET /api/admin/applications/pending-count`, requested on every admin page). A user who loads pages and reads data consumes the same allowance they need for saving, uploading, or exporting, so ordinary browsing can produce `429`s. The pending-application spec (`per-endpoint-rate-limiting-spec.md`, not yet implemented) fixed cross-endpoint interference but still counted reads.

After this change:

- `GET`, `HEAD`, and `OPTIONS` are never counted and can never receive `429`. That covers every page-load fetch, every poll, every document/avatar download, and CORS preflights.
- Reads no longer emit `RateLimit-*` headers, because no limiter runs on them.
- The Google Sheets export (`POST /api/admin/exports/:dataset/google-sheets`) is exempt from **all** limits, including its dedicated 10-per-hour cap. The CSV export (`GET /api/admin/applications/export`) is likewise unlimited.
- Non-safe requests (`POST`, `PUT`, `PATCH`, `DELETE`) remain limited at **60 per 15 minutes, per route pattern, per client IP**.
- Automatic frontend writes (for example the applicant form's draft autosave) still count, because the rule is method-based, not "background vs. click".
- Server-side outbound `fetch` calls (Brevo email, Google Calendar/Sheets, any future HTTP client) were never part of this limiter — they are incoming-request middleware only. The spec records this so nobody "fixes" it later.
- Dedicated limiters on write flows (login, signup, Google sign-in, forgot/reset password, avatar/document uploads) are unchanged.
- `adminExportLimiter` becomes unused and is deleted, along with `MESSAGES.export`.

---

## 2. Decisions locked in the interview

| Topic | Decision |
| --- | --- |
| What "the fetch request" means | Page-load/background fetches, read requests generally, the Sheets export call, and server-side outbound fetches |
| Exempt methods | `GET`, `HEAD`, `OPTIONS` — never counted, never blocked |
| Exempt detection | Method-based only: no route allowlist, no `X-Background-Request` header, no client tagging |
| Exempt outcome | Not counted at all, not "counted but allowed" |
| Reads ceiling | None: no limiter instance is mounted on read routes |
| Read headers | No `RateLimit-*` headers on read responses |
| Google Sheets export | Exempt from every limit; route keeps `protect, adminOnly` |
| CSV export | Unlimited (it is a `GET`, and its dedicated limiter is removed) |
| Export limiter | `adminExportLimiter` deleted from code, along with `MESSAGES.export` |
| Server-side outbound fetch | Out of scope; documented as never limited |
| Limited methods | `POST`, `PUT`, `PATCH`, `DELETE` |
| Write limit | 60 requests / 15 minutes per endpoint per IP |
| Write key | Route pattern + client IP (method not part of the key) |
| Failed writes | Count: `401`/`403`/`400` consume the allowance (no `skipFailedRequests`, no `skipSuccessfulRequests`) |
| Limiter ordering | General write limiter first on the route, ahead of `protect` and ahead of dedicated limiters |
| Dedicated limiters | All kept except export; values, keys, messages, and order unchanged |
| Auth flows | Unchanged: limiter ahead of auth, same keys |
| Window | Fixed window from the first counted request; `429`s do not extend it |
| Endpoint variants | Trailing slashes, query strings, and case normalize to one bucket |
| `OPTIONS` | Skipped by a defensive method guard as well as by `cors()` |
| Baseline | Amend the per-endpoint spec; delete the global `/api` limiter |
| `/api/health` | Unlimited (already exempt; also a `GET`) |
| Unmatched `/api/*` | Unlimited |
| 429 contract | Unchanged: `429`, `Retry-After`, `{ success: false, message }`, standard headers |
| 429 logging | None |
| Frontend | No changes |
| Docs | New spec + amendment banner in `per-endpoint-rate-limiting-spec.md` + README rate-limiting section |
| Verification | Manual `curl`; no test files |

---

## 3. Current state

| Piece | Current state |
| --- | --- |
| `backend/server.js` | `app.use("/api", apiLimiter)` before body parsing; one bucket per IP for all of `/api` |
| `backend/middleware/rateLimiters.js` | `apiLimiter` 120/15m, prefix `api`, `skip: isLoginRequest`; `adminExportLimiter` 10/h keyed by admin ID |
| `backend/routes/adminExportRoutes.js` | `protect, adminOnly, adminExportLimiter` on `POST /:dataset/google-sheets` |
| `backend/routes/adminApplicationRoutes.js` | `adminExportLimiter` on `GET /export` (CSV) |
| `backend/routes/paymentRoutes.js`, `backend/routes/cowRoutes.js` | `router.use(protect, role)` — auth applies to the whole router, so a limiter must move into each route chain |
| `backend/lib/rateLimitStore.js` | Mongo-backed store shared across instances when a DB is configured, in-memory otherwise; TTL index on `expiresAt` |
| `frontend/js/admin.js` | Fetches `GET /api/admin/applications/pending-count` on every admin page load |
| `frontend/js/apply.js` | Debounced draft autosave (a non-GET request, so it keeps counting) |

The global mount must go for the same reason as in the earlier spec: a limiter mounted with `app.use("/api", ...)` runs before Express matches a route, so `req.route` is unavailable and route-pattern bucketing is impossible. Reads simply get no limiter at all, so this change also removes their headers.

---

## 4. Requirements

### R1 — Replace `apiLimiter` with `apiWriteLimiter`

- In `backend/middleware/rateLimiters.js`, delete `apiLimiter` and `isLoginRequest`.
- Add `apiWriteLimiter` using the existing `createLimiter` helper with:
  - `windowMs: 15 * MINUTE`
  - `limit: 60`
  - `prefix: "api-write"`
  - `message: MESSAGES.api` (wording unchanged)
- Keep the shared options in `createLimiter`: `standardHeaders: true`, `legacyHeaders: false`, `passOnStoreError: true`, and the existing `Retry-After` handler.
- Add a defensive `skip` so a mistaken future mount cannot throttle reads:

```js
skip: (req) => ["GET", "HEAD", "OPTIONS"].includes(req.method)
```

- New prefix `api-write` means existing `api:*` counters are abandoned and expire by TTL; no migration.
- One limiter instance is reused by every write route; the endpoint is part of the key, so buckets stay independent.

### R2 — Key generation (unchanged from the earlier spec)

`endpointKeyGenerator` produces:

```
key = normalize(req.baseUrl + req.route.path) + "|" + clientIp(req)
```

- Route template, not concrete URL, so `/api/admin/trainees/665f…` and `/api/admin/trainees/aaa…` share the `PUT /:userId` bucket.
- Strip a trailing slash unless the path is `/`.
- Lowercase the path (Express routing is case-insensitive).
- Ignore the query string.
- Do not include the HTTP method: `PATCH /api/auth/profile` and `PATCH /api/auth/profile/password` are different patterns; `PUT`/`PATCH` on the same pattern share one bucket.
- Use `clientIp(req)` so the existing IPv6 handling via `ipKeyGenerator` is preserved.
- Defensive fallback: if `req.route` is missing, key on `req.baseUrl + req.path` instead of throwing.

Example keys:

| Request | Key |
| --- | --- |
| `POST /api/auth/login` | `/api/auth/login\|<ip>` |
| `POST /api/admin/exports/trainees/google-sheets` | *(no key — exempt)* |
| `PUT /api/admin/trainees/665f…aa` | `/api/admin/trainees/:userId\|<ip>` |
| `GET /api/admin/applications/pending-count` | *(no key — exempt)* |

### R3 — Attach only to non-safe routes

- Delete `app.use("/api", apiLimiter)` and the `apiLimiter` import from `backend/server.js`.
- In each route file, add `apiWriteLimiter` as the **first** middleware on every `POST` / `PUT` / `PATCH` / `DELETE` definition, before `protect`, role checks, upload middleware, dedicated limiters, and the controller.
- Leave every `GET` definition untouched, including `GET /api/admin/applications/export`, `GET /api/integrations/google-calendar/callback`, and `GET /api/health`.
- In `paymentRoutes.js` and `cowRoutes.js`, remove the `router.use(protect, role)` lines and spell out `apiWriteLimiter, protect, role, handler` on each write route. Read routes get `protect, role, handler` inline.
- Do not add a limiter to `/api/health` or to unmatched `/api/*` paths.

### R4 — Exempt the export routes completely

- `backend/routes/adminExportRoutes.js`: chain becomes `protect, adminOnly, exportToGoogleSheets` — no limiter of any kind. Authorization still applies.
- `backend/routes/adminApplicationRoutes.js`: remove `adminExportLimiter` from `GET /export` and drop the import. The CSV export is unlimited because it is a read.
- Delete `adminExportLimiter` from `backend/middleware/rateLimiters.js` (definition and export) and delete `MESSAGES.export`.
- No replacement cap for exports. If Google quota becomes a problem, it is a separate decision (see §11).

### R5 — Keep dedicated limiters exactly as they are

- `loginLimiter` (10/15m, `skipSuccessfulRequests`), `signupLimiter` (5/h), `googleLoginLimiter` (10/15m), `forgotPasswordIpLimiter` (3/h), `forgotPasswordAccountLimiter` (3/h by hashed email), `resetPasswordIpLimiter` (3/h), `traineeUploadLimiter` (20/15m by user) keep their values, keys, messages, ordering, and exports.
- `loginFailureGuard`, `recordLoginFailure`, `clearLoginFailures`, `consumePasswordResetAttempt`, and `sendRateLimitResponse` are untouched.
- `lib/rateLimitStore.js` needs no changes.
- `MESSAGES` keeps `api`, `login`, `signup`, `passwordReset`, `upload`; only `export` is removed.

### R6 — Response contract

- Write limit rejection stays: status `429`, `Retry-After` (seconds, `Math.ceil`, minimum 1), body `{ "success": false, "message": "Too many requests. Please wait a few minutes and try again." }`, and the standard `RateLimit-*` headers (`standardHeaders: true` → draft-6 in `express-rate-limit` 8.7.4; no `X-RateLimit-*`).
- A rejected request does not increment the counter, so the reset time does not move under sustained hammering.
- Read responses carry **no** `RateLimit-*` headers and never return `429` from this limiter.
- Dedicated limiters keep their own messages and `Retry-After`.

### R7 — README

Update the rate-limiting section of `README.md` to state:

- limits apply to write requests only (`POST`/`PUT`/`PATCH`/`DELETE`), 60 per 15 minutes per endpoint and per IP;
- reads (`GET`/`HEAD`/`OPTIONS`) are never limited and carry no `RateLimit-*` headers;
- exports are not rate limited;
- the dedicated login/signup/password-reset/upload caps still apply;
- `/api/health` is exempt;
- `429` responses carry `Retry-After`;
- existing `TRUST_PROXY` / `RATE_LIMIT_STORE` documentation stays.

### R8 — Amend the earlier spec

- Add a prominent amendment banner to `per-endpoint-rate-limiting-spec.md` stating that `fetch-exempt-rate-limiting-spec.md` supersedes its limiting scope, and list the changed decisions: reads unlimited, write cap 60/15m, export exempt, `adminExportLimiter` deleted, no `RateLimit-*` on reads, 28 limited routes instead of 57.
- Leave the rest of that document intact as the historical design; state that the new spec wins where they differ.

---

## 5. Route coverage

57 route definitions exist. **28** keep the general limiter; **28** are reads and get none; **1** write (the Sheets export) is exempt from all limits.

### 5.1 Limited write routes (28)

`apiWriteLimiter` first in each chain.

| Mount | Limited patterns |
| --- | --- |
| `/api/auth` | `POST /signup`, `POST /login`, `POST /google`, `POST /forgot-password`, `POST /reset-password`, `PATCH /profile`, `PATCH /profile/password`, `POST /profile/avatar` |
| `/api/trainee` | `PUT /me`, `POST /me/avatar` |
| `/api/assessments` | `POST /`, `PUT /:id/grade` |
| `/api/applications` | `POST /`, `POST /:id/documents/:type`, `DELETE /:id/documents/:fileId`, `POST /:id/withdraw` |
| `/api/admin/applications` | `POST /:id/decision` |
| `/api/system-settings` | `PUT /` |
| `/api/admin/payments` | `POST /` |
| `/api/admin/programs` | `POST /`, `PATCH /:id`, `POST /:id/batches` |
| `/api/admin/batches` | `PATCH /:id` |
| `/api/admin/trainees` | `PUT /:userId` |
| `/api/admin/cows` | `POST /`, `POST /activities` |
| `/api/integrations/google-calendar` | `POST /disconnect`, `POST /sync` |

Dedicated limiters remain in the same position after `apiWriteLimiter` where they already exist (`signup`, `login`, `google`, forgot/reset password, avatar uploads, document uploads).

### 5.2 Exempt from every limit (1 write)

| Mount | Pattern | Chain |
| --- | --- | --- |
| `/api/admin/exports` | `POST /:dataset/google-sheets` | `protect, adminOnly, exportToGoogleSheets` |

### 5.3 Reads — no limiter, no headers (28)

| Mount | Patterns |
| --- | --- |
| `/api/auth` | `GET /profile`, `GET /profile/avatar` |
| `/api/trainee` | `GET /me`, `GET /me/avatar` |
| `/api/assessments` | `GET /me`, `GET /trainees`, `GET /` |
| `/api/applications` | `GET /open-batches`, `GET /me`, `GET /:id/documents/:fileId` |
| `/api/admin/applications` | `GET /pending-count`, `GET /export`, `GET /`, `GET /:id/documents/:fileId`, `GET /:id` |
| `/api/system-settings` | `GET /public`, `GET /` |
| `/api/admin/payments` | `GET /`, `GET /:accountId` |
| `/api/trainee/payments` | `GET /` |
| `/api/admin/programs` | `GET /` |
| `/api/admin/trainees` | `GET /` |
| `/api/admin/cows` | `GET /`, `GET /activities` |
| `/api/trainee/cows` | `GET /` |
| `/api/integrations/google-calendar` | `GET /callback`, `GET /status`, `GET /connect` |
| `/api/admin/batches` | *(none — mutations only)* |

Also unlimited: `GET /api/health`, `GET /`, and any unmatched `/api/*` path.

> `GET /api/admin/applications/export` loses `adminExportLimiter`, so the CSV export becomes unlimited. This is intentional per the interview answer "exports are exempt from all limits".

---

## 6. Edge cases handled deliberately

1. **Page-load fetches** — the pending-count badge, program lists, trainee tables, dashboards, and settings reads are all `GET`s, so they never touch a counter. Ordinary browsing cannot produce `429`.
2. **Autosave and other automatic writes** — the applicant form's draft save is a non-GET request; it counts like any other write. Chosen over a header/allowlist scheme.
3. **`HEAD` requests** — Express serves `HEAD` for `GET` routes; the method guard exempts it and no limiter is mounted anyway.
4. **`OPTIONS` preflight** — `cors()` answers most preflights before routing; the guard ensures a preflight that reaches the limiter never consumes a bucket or returns `429`.
5. **Failed writes** — `401` from an unauthenticated `PATCH /api/auth/profile` and `403` from a wrong-role write both consume the 60-request allowance. There is no `skipSuccessfulRequests` on the general limiter, so a bad token cannot probe unlimited writes.
6. **Login double-counting** — `POST /api/auth/login` consumes both the write bucket (60/15m) and `loginLimiter` (10/15m). The tighter login limiter still produces the 429 in practice; the general bucket still counts those attempts.
7. **Exports** — the Sheets route can be called any number of times; only `protect`/`adminOnly` and Google's own API errors apply. The CSV export is a read and is likewise unlimited.
8. **Authorized vs. anonymous exports** — exemption is about rate limiting only; an unauthenticated call still gets `401` before any Google work happens.
9. **Route params** — alternating IDs on `PUT /api/admin/trainees/:userId` share one bucket. Varying IDs cannot mint fresh allowance on writes.
10. **Query strings / trailing slashes / case** — `/api/system-settings?x=1`, `/api/system-settings/`, and `/api/SYSTEM-SETTINGS` normalize to one bucket. Reads are exempt regardless.
11. **Same pattern, different methods** — `GET /` and `POST /` on `/api/assessments` share the pattern but only the `POST` is limited. `PATCH /api/auth/profile` and `PATCH /api/auth/profile/password` are distinct patterns and separate buckets.
12. **Mount roots** — `POST /` under `/api/admin/cows` keys as `/api/admin/cows`, not `"//"` or `/api/admin/cows/`.
13. **Two routers, similar paths** — `/api/trainee/cows` and `/api/admin/cows` are different mounts; only the admin one has writes.
14. **Mongo store unavailable** — `passOnStoreError: true` keeps writes working unlimited rather than failing closed.
15. **Multiple instances** — shared `rateLimitCounters` collection and the new `api-write` prefix keep write buckets consistent; the TTL index expires them.
16. **Removed routes** — old keys expire by TTL; no cleanup required.
17. **CORS** — `cors()` stays mounted before routing and is unchanged.
18. **Server-side outbound `fetch`** — `lib/mailer.js` (Brevo) and Google API calls are outbound; `express-rate-limit` only sees inbound requests, so nothing changes there and no exemption code is added.
19. **Google Calendar callback** — a public `GET`; unlimited, as intended for a browser redirect from Google.
20. **Health checks and uptime monitors** — `GET /api/health` unlimited.

---

## 7. Files in scope

| File | Change |
| --- | --- |
| `backend/middleware/rateLimiters.js` | Replace `apiLimiter` with `apiWriteLimiter` (60/15m, prefix `api-write`, method guard); delete `isLoginRequest`, `adminExportLimiter`, `MESSAGES.export`; update exports |
| `backend/server.js` | Remove `app.use("/api", apiLimiter)` and the import |
| `backend/routes/authRoutes.js` | Add limiter first on 8 write routes; reads untouched |
| `backend/routes/traineeRoutes.js` | Add limiter first on `PUT /me`, `POST /me/avatar` |
| `backend/routes/assessmentRoutes.js` | Add limiter first on `POST /`, `PUT /:id/grade` |
| `backend/routes/applicationRoutes.js` | Add limiter first on 4 write routes (uploads keep `traineeUploadLimiter` after it) |
| `backend/routes/adminApplicationRoutes.js` | Add limiter on `POST /:id/decision`; remove `adminExportLimiter` from `GET /export` and its import |
| `backend/routes/systemSettingsRoutes.js` | Add limiter first on `PUT /` |
| `backend/routes/paymentRoutes.js` | Remove `router.use(protect, role)`; add limiter first on `POST /` only |
| `backend/routes/programRoutes.js` | Add limiter first on `POST /`, `PATCH /:id`, `POST /:id/batches`, `PATCH /:id` (batches router) |
| `backend/routes/adminTraineeRoutes.js` | Add limiter first on `PUT /:userId` |
| `backend/routes/cowRoutes.js` | Remove `router.use(protect, role)`; add limiter first on `POST /` and `POST /activities` |
| `backend/routes/googleCalendarRoutes.js` | Add limiter first on `POST /disconnect`, `POST /sync` |
| `backend/routes/adminExportRoutes.js` | Remove `adminExportLimiter` and its import; chain becomes `protect, adminOnly, handler` |
| `README.md` | Document write-only limits, unlimited reads/exports, dedicated caps, health exemption, `Retry-After` |
| `per-endpoint-rate-limiting-spec.md` | Amendment banner listing superseded decisions |
| `fetch-exempt-rate-limiting-spec.md` | This file |

Explicitly **not** touched: `backend/lib/rateLimitStore.js`, controllers, models, `frontend/`, `backend/config/`, deployment config.

---

## 8. Acceptance criteria

- [ ] 60 writes to one endpoint from one IP succeed (or fail normally); the 61st returns `429` with `Retry-After` and the existing JSON body.
- [ ] While that endpoint is returning `429`, a different write endpoint from the same IP returns its normal status.
- [ ] While that endpoint is returning `429`, a different IP is not blocked on it.
- [ ] 200 `GET`s to any endpoint, including `/api/admin/applications/pending-count`, return their normal status and no `RateLimit-*` headers.
- [ ] `GET /api/admin/applications/export` is unlimited (no 10-per-hour cap, no headers).
- [ ] `POST /api/admin/exports/:dataset/google-sheets` is never rate limited, even past 10 calls in an hour, and still requires an admin token.
- [ ] `HEAD` and `OPTIONS` requests never consume a write bucket and never return `429`.
- [ ] `/api/health` stays `200` after more than 60 writes and any number of reads.
- [ ] Failed writes (`401`/`403`/`400`) consume the write bucket.
- [ ] Two IDs on `PUT /api/admin/trainees/:userId` share one bucket.
- [ ] `/api/system-settings/`, `/api/system-settings?x=1`, and `/api/SYSTEM-SETTINGS` on `PUT` share one bucket.
- [ ] Login still trips its dedicated 10/15m limiter before the 60/15m write bucket.
- [ ] Uploads still trip `traineeUploadLimiter` at 20/15m.
- [ ] `Retry-After` equals the seconds remaining in the write window (rounded up, minimum 1) and does not move on repeated 429s.
- [ ] After the window elapses, writes are accepted again.
- [ ] `git status` shows only the files listed in §7 changed.

---

## 9. Verification plan (manual, curl)

Prerequisites: `cd backend && node server.js` with the existing `.env`, plus `RATE_LIMIT_STORE=memory` so counters reset on restart. For a quick reset check, temporarily set `limit` to `3` and `windowMs` to `10000` in a scratch edit, verify, then restore before finishing.

1. **Reads are unlimited and header-free**
   ```bash
   for i in $(seq 1 200); do curl -s -o /dev/null -w "%{http_code}\n" \
     localhost:5000/api/system-settings/public; done | sort | uniq -c
   curl -i localhost:5000/api/system-settings/public   # no RateLimit-* headers
   ```
   Expect all `200`, no `429`.
2. **Background badge fetch**
   ```bash
   curl -i -H "Authorization: Bearer <admin token>" \
     localhost:5000/api/admin/applications/pending-count
   ```
   Expect `200` and no rate-limit headers.
3. **Trip a write endpoint** (unauthenticated `PATCH` counts and has no dedicated limiter):
   ```bash
   for i in $(seq 1 61); do curl -s -o /dev/null -w "%{http_code}\n" -X PATCH \
     -H "Content-Type: application/json" -d '{}' \
     localhost:5000/api/auth/profile; done
   ```
   Expect 60 × `401`, then `429`.
4. **Inspect rejection** — `curl -i -X PATCH ... /api/auth/profile` → `429`, `Retry-After`, `{ "success": false, "message": "Too many requests. Please wait a few minutes and try again." }`.
5. **Other write endpoint unaffected** — `PUT /api/system-settings` without a token → `401`, not `429`.
6. **Other read endpoint unaffected** — `GET /api/applications/open-batches` → `401`, and `GET /api/health` → `200`.
7. **`OPTIONS` skip** — 70 `OPTIONS` requests, then a write on the same pattern → still counted from zero.
8. **Exempt export** — with a valid admin token, call `POST /api/admin/exports/trainees/google-sheets` more than 10 times in an hour; none may return a rate-limit `429`. (Requires Sheets enabled and a connected Google account; failure there is a Google/config error, not a `429`.)
9. **Reset** — with the temporary 10-second window, wait out `Retry-After` and confirm a write is accepted; restore the real values and `git diff` to prove restoration.
10. **Scope check** — `git status` shows only §7 files; no new 429 logging in server output.

---

## 10. Known limitations

- **Read endpoints are unprotected.** Scraping or hammering a `GET` endpoint is not throttled at this layer. That is the requested behavior; if abuse protection is needed later it belongs at the proxy/WAF or a separate opt-in read limiter.
- **Exports are unprotected.** Any admin can create unlimited spreadsheets, limited only by Google API quotas and the connected account. The previous 10/hour guard is gone by request.
- **Write allowance is per IP, not per account.** Two admins behind one office IP share each write endpoint's 60/15m bucket.
- **Automatic writes count.** The draft autosave consumes write headroom; a very chatty autosave could contribute to a `429` for that endpoint.
- **Double-counting on protected writes.** Login, signup, uploads still consume both the general bucket and their dedicated limiter.
- **No read headers.** Clients cannot see remaining write allowance from a read response; they see it only on write responses (and after the write has been counted).
- **Unmatched `/api/*` paths are unlimited** and return the normal 404.
- **No automated tests.** `npm test` is still a stub (`exit 1`); verification is manual.
- **Heuristic fallback.** A future write route added without `apiWriteLimiter` is unlimited. There is no automated assertion; convention plus review is the only guard.

---

## 11. Open questions (non-blocking)

1. Should pulls of large exports (CSV, Sheets) get a quota at the Google/integration layer instead of the HTTP limiter, now that HTTP-level export caps are gone?
2. Should the draft autosave get its own allowance or coalescing so it cannot eat a trainee's write budget?
3. Should reads later get a very high, opt-in limiter (for example via a reverse proxy) to blunt scraping without affecting normal users?
4. Should clients be told the write allowance on read responses once a logging/metrics story exists?
