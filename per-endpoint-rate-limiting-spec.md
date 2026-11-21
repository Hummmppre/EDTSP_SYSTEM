# Per-Endpoint Rate Limiting — Spec

**Status:** Superseded in part — see the amendment below
**Requested:** "Update EDTSP rate limiting so it applies only to the configured endpoint. When that endpoint reaches its limit, reject further requests to it with HTTP 429 and `Retry-After` until its limit window resets. Do not block the user, IP, or other API routes; requests to unaffected endpoints must continue working normally."
**Agreed scope (interview):** replace the single blanket `/api` limiter with per-endpoint, per-IP buckets across every `/api` route; keep the dedicated login/signup/Google/password-reset/upload/export limiters unchanged; `/api/health` exempt; backend + README only.

**Short name:** per-endpoint-rate-limiting

---

## Amendment (2026-11-20): fetch-exempt rate limiting

`fetch-exempt-rate-limiting-spec.md` supersedes this document's limiting scope. Where the two differ, the amendment and that spec win. This document remains as the historical per-endpoint design.

| This spec says | Now |
| --- | --- |
| Every `/api` route gets a 120/15m bucket, including `GET` | Reads (`GET`, `HEAD`, `OPTIONS`) are never counted, never blocked, and carry no `RateLimit-*` headers |
| 120 requests / 15 min per endpoint per IP | 60 writes / 15 min per endpoint per IP, non-safe methods only |
| 57 route definitions limited | 28 write routes limited; 28 reads unlimited; Sheets export exempt |
| Login bypass removed, login double-counts endpoint bucket | Unchanged |
| `adminExportLimiter` kept (10/h) | Deleted from code, along with `MESSAGES.export`; both export routes are unlimited |
| `apiEndpointLimiter` / prefix `api-endpoint` | `apiWriteLimiter` / prefix `api-write` with a safe-method skip |
| Path/query/case normalization, `Retry-After`, store behavior | Unchanged |

---

## 1. Problem and outcome

Today `backend/server.js` mounts one limiter for the whole API:

```js
app.use("/api", apiLimiter); // 120 requests / 15 min, keyed by IP only
```

All routes share one counter per IP. Heavy or intentional traffic against one endpoint consumes the allowance of every other endpoint, so after 120 requests anywhere the same user/IP receives `429` from *all* of `/api` — including unrelated reads, health checks, and authenticated work. The only current mitigation is a special case that skips `POST /api/auth/login`.

After this change:

- Every `/api` route keeps a 120-requests-per-15-minutes limit, counted **per endpoint and per client IP**.
- Reaching the limit returns `429` with a `Retry-After` header **for that endpoint only**, until that endpoint's window resets.
- Requests to the same endpoint from another IP, and requests to any other endpoint from the same user/IP, keep working normally.
- Route-parameter requests (`/api/admin/applications/123` and `/456`) share one bucket, so varying IDs cannot mint fresh allowances.
- `/api/health` is never limited, so uptime monitors are not throttled.
- Dedicated limiters are untouched and still apply in addition to the endpoint bucket.

This is a limiter-scoping change, not a reduction or increase of overall capacity. Because the cap is now per endpoint, the effective aggregate ceiling per IP rises (roughly 120 × the number of route patterns). That is the intended consequence of "one endpoint must not block the others."

---

## 2. Decisions locked in the interview

| Topic | Decision |
| --- | --- |
| Meaning of "only the configured endpoint" | Keep limiting every `/api` route, but each endpoint gets its own counter bucket |
| Counter key | Endpoint + client IP |
| Endpoint identity | Normalized **route pattern**, not the concrete URL (IDs share a bucket) |
| Method in key | No — GET and POST on the same pattern share one bucket |
| Limit values | Unchanged: 120 requests per 15 minutes per endpoint per IP |
| Dedicated limiters | Left exactly as-is (login 10/15m, signup 5/h, Google 10/15m, forgot-password 3/h IP + account, reset-password 3/h IP + account, uploads 20/15m, exports 10/h) |
| Window behavior | Fixed window starting at the first counted request; 429s do **not** extend it |
| Endpoint variants | Trailing slashes and query strings normalize to the same bucket |
| Implementation approach | Attach the limiter to each route (not the global `app.use("/api", ...)`) so `req.route.path` is available |
| Ordering on authenticated routes | Endpoint limiter runs first, before `protect` / `adminOnly` / `traineeOnly` |
| CORS preflight | `OPTIONS` is skipped: never counted, never blocked |
| What counts | Every request (success, 4xx, unauthorized) except `OPTIONS` |
| Exempt endpoint | `/api/health` only |
| Unmatched `/api/*` paths | Unlimited (accepted; only real route patterns are capped) |
| Login skip | Remove the `isLoginRequest` bypass — login now has its own bucket and keeps its dedicated limiter |
| 429 contract | Unchanged: status 429, `Retry-After` seconds, `{ success: false, message }`, existing `RateLimit-*` headers |
| 429 logging | None added |
| Frontend | No changes |
| Docs | README rate-limiting section updated |
| Verification | Manual `curl` against a running server; no test files |

---

## 3. Current behavior and why it must move

| Piece | Current state |
| --- | --- |
| `backend/server.js:32` | `app.use("/api", apiLimiter)` — one limiter instance ahead of routing and body parsing |
| `backend/middleware/rateLimiters.js:103` | `apiLimiter`: 120/15m, prefix `api`, message `MESSAGES.api`, `skip: isLoginRequest` |
| `backend/middleware/rateLimiters.js:56` | `clientIp(req)` wraps `ipKeyGenerator(req.ip)` — keep this for IPv6 handling |
| `backend/middleware/rateLimiters.js:60` | `createLimiter()` builds options incl. `standardHeaders: true`, `legacyHeaders: false`, `passOnStoreError: true`, and a handler that derives `Retry-After` from `req.rateLimit.resetTime` |
| `backend/lib/rateLimitStore.js` | Mongo-backed store shared across instances when a DB is configured, in-memory otherwise; window starts on first hit with `expiresAt = now + windowMs` |

The global mount must be removed because a limiter mounted with `app.use("/api", ...)` runs before Express matches a route, so `req.route` is `undefined`. Route-pattern bucketing is only possible once a specific route layer has matched. That is the reason for the per-route attachment decision, and it is also why the two routers that apply auth with `router.use(...)` (`cowRoutes.js`, `paymentRoutes.js`) must be restructured.

---

## 4. Requirements

### R1 — One shared per-endpoint limiter

- Replace the exported `apiLimiter` with `apiEndpointLimiter` in `backend/middleware/rateLimiters.js`.
- Keep `windowMs = 15 * MINUTE`, `limit = 120`, `message: MESSAGES.api`, and the existing `createLimiter` options (standard headers, no legacy headers, `passOnStoreError: true`, existing 429 handler).
- Use a new store prefix, `api-endpoint`, so pre-existing `api:<ip>` counters are not reused and expire naturally.
- A single limiter instance may be reused by every route; the endpoint is part of the key, so buckets remain independent.

### R2 — Key generation

Implement an `endpointKeyGenerator` in `backend/middleware/rateLimiters.js` used by `apiEndpointLimiter`:

```
key = normalize(req.baseUrl + req.route.path) + "|" + clientIp(req)
```

Details:

- `req.baseUrl` is the router mount (`/api/auth`) and `req.route.path` is the matched pattern (`/login`, `/:id/decision`), so the bucket follows the route template, not the URL.
- Remove a trailing slash unless the whole path is `/`; e.g. `/api/admin/cows/` → `/api/admin/cows`, and a router root `"/"` under `/api/admin/trainees` → `/api/admin/trainees`.
- Lowercase the derived path, because Express routing is case-insensitive by default and `/api/HEALTH` must not create a second bucket.
- Ignore the query string entirely (derive from `baseUrl`/`route.path`, never `originalUrl`).
- Do not include the HTTP method.
- Use `clientIp(req)` so the existing IPv6 normalization is preserved.
- Defensive fallback: if `req.route` is ever missing, use `req.baseUrl + req.path` (concrete path) rather than throwing. This should not occur once R4 is complete, and it is the only case where IDs would get separate buckets.

Example keys:

| Request | Key |
| --- | --- |
| `GET /api/auth/profile` | `/api/auth/profile\|<ip>` |
| `GET /api/admin/applications/665f…aa` | `/api/admin/applications/:id\|<ip>` |
| `GET /api/admin/applications/665f…aa/documents/77` | `/api/admin/applications/:id/documents/:fileId\|<ip>` |
| `GET /api/admin/cows/` | `/api/admin/cows\|<ip>` |

Note that `/api/admin/applications/:id` and `/api/admin/applications/:id/documents/:fileId` are different patterns and therefore separate buckets; that is intended.

### R3 — Skip OPTIONS, keep existing 429 shape

- `apiEndpointLimiter` gets `skip: (req) => req.method === "OPTIONS"`. Preflights neither consume the bucket nor receive 429.
- The existing handler (`req.rateLimit.resetTime` → `Retry-After` seconds, floor 1) stays. `Retry-After` is an integer number of seconds until that endpoint's window resets; if `resetTime` is unavailable it falls back to the full window, as today.
- Response body stays `{ success: false, message: "Too many requests. Please wait a few minutes and try again." }`; no extra fields, no endpoint name in the body, no new logging.
- Headers stay the current standard set from `standardHeaders: true` (which resolves to IETF draft-6 in `express-rate-limit` 8.7.4): `RateLimit-Limit`, `RateLimit-Remaining`, `RateLimit-Reset`. `legacyHeaders: false` means no `X-RateLimit-*`.

### R4 — Attach per route, before auth

- Delete `app.use("/api", apiLimiter)` and its import from `backend/server.js`.
- In every route file under `backend/routes/` that is mounted under `/api`, add `apiEndpointLimiter` as the **first** middleware on each route definition, before `protect`, `adminOnly`, `traineeOnly`, body/upload middleware, and the controller.
- `cowRoutes.js` and `paymentRoutes.js` currently do `router.use(protect, role)`. Replace that with explicit per-route chains `apiEndpointLimiter, protect, role, handler` so the limiter runs before auth and `req.route` is set when it runs. Do not leave a leading `router.use(...)` that would place the limiter after authentication.
- The Google Calendar callback (`GET /api/integrations/google-calendar/callback`) is public but still limited like every other route.
- `/api/health` is defined directly in `server.js` and receives **no** limiter. `GET /` is not under `/api` and is unaffected.

### R5 — Remove the login bypass

- Delete `isLoginRequest` and the `skip: isLoginRequest` option, since login now has its own endpoint bucket.
- `POST /api/auth/login` therefore passes through both `apiEndpointLimiter` (120/15m) and `loginLimiter` (10/15m). The same double-counting applies to routes that already carry a dedicated limiter (signup, Google, forgot/reset password, avatar/document uploads, exports). No dedicated limiter's values, keys, or messages change.

### R6 — Dedicated limiters unchanged

- `loginLimiter`, `signupLimiter`, `googleLoginLimiter`, `forgotPasswordIpLimiter`, `forgotPasswordAccountLimiter`, `resetPasswordIpLimiter`, `traineeUploadLimiter`, `adminExportLimiter`, `loginFailureGuard`, `recordLoginFailure`, `clearLoginFailures`, `consumePasswordResetAttempt`, and `sendRateLimitResponse` keep their current behavior, limits, keys, and exports.
- `lib/rateLimitStore.js` needs no changes.
- `MESSAGES` keeps its current entries; `MESSAGES.api` wording is unchanged.

### R7 — README

Update the rate-limiting section of `README.md` to state that limits are per endpoint **and** per IP, that `/api/health` is exempt, that hitting one endpoint does not affect others, and that `429` responses carry `Retry-After`. Keep the existing `TRUST_PROXY` and `RATE_LIMIT_STORE` documentation.

---

## 5. Route coverage (57 route definitions)

Every entry below gets `apiEndpointLimiter` first in its chain. Buckets are per **pattern + mount**, so rows with different patterns are independent.

| Mount | Route patterns |
| --- | --- |
| `/api/auth` | `POST /signup`, `POST /login`, `POST /google`, `POST /forgot-password`, `POST /reset-password`, `GET /profile`, `PATCH /profile`, `PATCH /profile/password`, `GET /profile/avatar`, `POST /profile/avatar` |
| `/api/trainee` | `GET /me`, `PUT /me`, `GET /me/avatar`, `POST /me/avatar` |
| `/api/assessments` | `GET /me`, `GET /trainees`, `POST /`, `GET /`, `PUT /:id/grade` |
| `/api/applications` | `GET /open-batches`, `GET /me`, `POST /`, `GET /:id/documents/:fileId`, `POST /:id/documents/:type`, `DELETE /:id/documents/:fileId`, `POST /:id/withdraw` |
| `/api/admin/applications` | `GET /pending-count`, `GET /export`, `GET /`, `GET /:id/documents/:fileId`, `GET /:id`, `POST /:id/decision` |
| `/api/system-settings` | `GET /public`, `GET /`, `PUT /` |
| `/api/admin/payments` | `GET /`, `GET /:accountId`, `POST /` |
| `/api/trainee/payments` | `GET /` |
| `/api/admin/programs` | `GET /`, `POST /`, `PATCH /:id`, `POST /:id/batches` |
| `/api/admin/batches` | `PATCH /:id` |
| `/api/admin/trainees` | `GET /`, `PUT /:userId` |
| `/api/admin/cows` | `GET /`, `POST /`, `GET /activities`, `POST /activities` |
| `/api/trainee/cows` | `GET /` |
| `/api/integrations/google-calendar` | `GET /callback`, `GET /status`, `GET /connect`, `POST /disconnect`, `POST /sync` |
| `/api/admin/exports` | `POST /:dataset/google-sheets` |

Not limited: `GET /api/health`, `GET /`, unmatched `/api/*` paths.

---

## 6. Response contract

| Situation | Status | Headers | Body |
| --- | --- | --- | --- |
| Endpoint under 120 hits in the current window | Normal route response | `RateLimit-Limit`, `RateLimit-Remaining`, `RateLimit-Reset` (no `X-RateLimit-*`) | Unchanged |
| 121st hit on that endpoint/IP within the window | `429` | `Retry-After: <integer seconds>`, plus the same `RateLimit-*` headers | `{ "success": false, "message": "Too many requests. Please wait a few minutes and try again." }` |
| Same IP, any other endpoint | Normal route response | `RateLimit-*` for that endpoint | Unchanged |
| Any IP, other endpoint | Normal route response | `RateLimit-*` for that endpoint | Unchanged |
| `OPTIONS` on any route | Passes through (CORS middleware may answer preflight itself) | — | — |
| `GET /api/health` | `200` regardless of other endpoint usage | — | Existing health JSON |
| Dedicated limiter also tripped (e.g. 11th login) | `429` from the dedicated limiter | `Retry-After` from that limiter | That limiter's message |

`Retry-After` is calculated from the bucket's `resetTime`, `Math.ceil(ms / 1000)`, minimum 1. A rejected request does not increment the counter, so the reset does not move and recovery happens on schedule even under sustained hammering.

---

## 7. Edge cases to handle deliberately

1. **Route parameters** — `/api/applications/abc/documents/passport.jpg` and `/api/applications/def/documents/cv.pdf` share the `/:id/documents/:fileId` bucket. Varying IDs cannot bypass the limit.
2. **Trailing slash and query string** — `/api/system-settings/public/`, `/api/system-settings/public?ts=1`, and `/api/system-settings/public` are one bucket.
3. **Case variants** — `/api/SYSTEM-settings/PUBLIC` matches the same Express route (case-insensitive by default) and must hash to the same bucket.
4. **Mount roots** — a route declared as `/` inside a router keys on the mount path (e.g. `/api/admin/trainees`), not `"//"` or `/api/admin/trainees/`.
5. **Two routers, same-looking paths** — `/api/trainee/cows` and `/api/admin/cows` are different mounts and therefore different buckets, even at the same pattern `/`.
6. **Login** — consumes both the endpoint bucket (120/15m) and the login limiter (10/15m). A user locked out by the login limiter still gets their 429 from login even though the endpoint bucket has headroom, and login attempts still consume endpoint headroom.
7. **Uploads and exports** — likewise consume both buckets; endpoint headroom does not relax the tighter dedicated limit, and the tighter limit can 429 while other endpoints remain usable.
8. **Authenticated users behind one NAT** — the bucket is IP-based even after `protect` runs. Two trainees on the same office IP share that endpoint's 120/15m allowance. Accepted; the request explicitly asked not to key on the user.
9. **Unauthenticated or unauthorized traffic** — because the limiter runs before `protect`, `401`/`403` responses consume the bucket. This is the chosen "every request counts" behavior.
10. **Mongo store unavailable** — `passOnStoreError: true` means requests proceed unlimited rather than fail closed; existing behavior is preserved.
11. **Multiple server instances** — the shared `rateLimitCounters` collection and the `api-endpoint` prefix keep per-endpoint counters consistent across instances; the existing TTL index expires them.
12. **Removed or renamed routes** — old keys simply expire via TTL; no migration.
13. **Unmatched `/api` paths** — no bucket, no 429 (accepted). They still get Express's 404.
14. **CORS preflight** — `cors()` is mounted before routing and normally terminates preflight itself; the `skip` guarantees `OPTIONS` cannot consume a bucket if a preflight reaches the route limiter.
15. **`passOnStoreError` + handler** — if `req.rateLimit.resetTime` is absent, `Retry-After` falls back to the full 900 seconds rather than omitting the header.

---

## 8. Files in scope

| File | Change |
| --- | --- |
| `backend/middleware/rateLimiters.js` | Add `endpointKeyGenerator` + `apiEndpointLimiter`; remove `apiLimiter` and `isLoginRequest`; update exports; reuse `createLimiter`, `clientIp`, `MESSAGES` |
| `backend/server.js` | Remove `app.use("/api", apiLimiter)` and the `apiLimiter` import; leave `/api/health` unlimited |
| `backend/routes/authRoutes.js` | Add limiter first on all 10 routes |
| `backend/routes/traineeRoutes.js` | Add limiter first on all 4 routes (avatar upload keeps `traineeUploadLimiter` after it) |
| `backend/routes/assessmentRoutes.js` | Add limiter first on all 5 routes |
| `backend/routes/applicationRoutes.js` | Add limiter first on all 7 routes |
| `backend/routes/adminApplicationRoutes.js` | Add limiter first; keep `adminExportLimiter` on `/export` |
| `backend/routes/systemSettingsRoutes.js` | Add limiter first on all 3 routes |
| `backend/routes/paymentRoutes.js` | Replace `router.use(protect, role)` with per-route chains: limiter → protect → role |
| `backend/routes/programRoutes.js` | Add limiter first on both routers' routes |
| `backend/routes/adminTraineeRoutes.js` | Add limiter first on both routes |
| `backend/routes/cowRoutes.js` | Replace `router.use(protect, role)` with per-route chains: limiter → protect → role |
| `backend/routes/googleCalendarRoutes.js` | Add limiter first on all 5 routes (including the public callback) |
| `backend/routes/adminExportRoutes.js` | Add limiter first; keep `adminExportLimiter` |
| `README.md` | Document per-endpoint/per-IP limits, health exemption, and `Retry-After` |

Explicitly **not** touched: `backend/lib/rateLimitStore.js`, controllers, models, `frontend/`, `backend/config/`, deployment config.

---

## 9. Acceptance criteria

- [ ] 120 requests to one endpoint from one IP succeed; the 121st returns `429` with `Retry-After` and the existing JSON shape.
- [ ] While that endpoint is returning 429, a different endpoint from the same IP returns its normal status (not 429).
- [ ] While that endpoint is returning 429, the same endpoint from a different IP is not blocked.
- [ ] `/api/health` returns `200` after at least 130 requests from the same IP.
- [ ] `/api/admin/applications/<id1>` and `/api/admin/applications/<id2>` share one bucket; alternating 121 requests trips it.
- [ ] `/api/system-settings/public/` and `/api/system-settings/public?x=1` consume the same bucket as `/api/system-settings/public`.
- [ ] 121 `OPTIONS` requests to an endpoint leave that endpoint's bucket usable.
- [ ] `POST /api/auth/login` is limited by both its dedicated 10/15m limiter and the endpoint bucket; no `isLoginRequest` bypass remains.
- [ ] `Retry-After` equals the seconds remaining in the endpoint's window (rounded up, minimum 1) and the header persists across repeated 429s without the reset moving.
- [ ] After the window elapses, the endpoint accepts requests again.
- [ ] Dedicated limiter values and messages are unchanged; uploads and exports still enforce their own caps.
- [ ] `git status` shows only the route/middleware/server/README files listed in §8 changed.

---

## 10. Verification plan (manual, curl)

Prerequisites: `cd backend && node server.js` with the existing `.env` (Mongo available), and `RATE_LIMIT_STORE=memory` so counters can be reset by restarting the server between scenarios. Mongo must still be connected for startup. For a fast reset check, temporarily set the endpoint limiter's `windowMs` to `10000` in a scratch edit, verify recovery, then restore `15 * MINUTE` before finishing.

1. **Baseline** — `curl -i localhost:5000/api/health` → `200`; `curl -i localhost:5000/api/system-settings/public` → `200`.
2. **Trip one endpoint** — loop 121 times:
   `for i in $(seq 1 121); do curl -s -o /dev/null -w "%{http_code}\n" localhost:5000/api/system-settings/public; done`
   Expect 120 × `200`, then `429`.
3. **Inspect the rejection** — `curl -i localhost:5000/api/system-settings/public` → `429`, `Retry-After: <n>`, body `{"success":false,"message":"Too many requests. Please wait a few minutes and try again."}`.
4. **Other endpoint unaffected** — `curl -i localhost:5000/api/applications/open-batches` → `401` (no token), **not** `429`; `curl -i localhost:5000/api/health` → `200`.
5. **Other IP unaffected** — repeat the tripped endpoint with `-H "X-Forwarded-For: 203.0.113.9"` only if `TRUST_PROXY` is configured; otherwise use a second machine/interface. Confirm a non-429 response when the limiter sees a different client IP.
6. **Pattern sharing** — trip `GET /api/admin/applications/<id>` by alternating two valid ObjectId strings; confirm the 121st returns `429`, proving both IDs shared the bucket.
7. **Variant normalization** — after restarting, send `/api/system-settings/public/` and `/api/system-settings/public?x=1` within the same 120 requests; confirm no separate allowance appears.
8. **OPTIONS skip** — send 125 `OPTIONS` requests, then a normal `GET` on the same endpoint; expect the GET to still succeed.
9. **Health exemption** — send 150 `GET /api/health`; expect all `200`.
10. **Reset** — with the temporary 10-second window, trip an endpoint, wait for the reported `Retry-After`, then confirm `200` again; restore the 15-minute window and rerun `git diff` to confirm it is back.
11. **Scope check** — `git status` contains only §8 files; scan server output to confirm no new 429 logging.

---

## 11. Known limitations

- **Per-IP, not per-account.** Shared NATs/offices share each endpoint's allowance even for authenticated users. Chosen deliberately.
- **Aggregate capacity rises.** A caller can now make 120 requests to each of ~50 distinct route patterns per 15 minutes; this change removes the global cap rather than replacing it with an equivalent one.
- **Unmatched `/api/*` paths are unlimited.** Accepted in the interview; 404s are cheap.
- **Double-counting on protected endpoints.** Login, uploads, and exports consume both the general endpoint bucket and their dedicated limiter. Accepted so no dedicated limiter changes.
- **Heuristic fallback.** If a future route is added without `apiEndpointLimiter` (or a limiter is placed on a `router.use` instead of a route), that path is unlimited or falls back to concrete-path buckets. Route coverage must be maintained by convention; there is no automated assertion.
- **No observability.** 429 rejections are not logged or counted; operators can only infer throttling from the `RateLimit-*`/`Retry-After` headers or client reports.
- **`RATE_LIMIT_STORE=memory` is per-process.** Multi-instance deployments must use the Mongo store, as today.
- **No automated tests.** `npm test` is still a stub (`exit 1`); verification is manual.

---

## 12. Open questions (non-blocking)

1. Should `/` (the root banner route) also be exempt or explicitly limited? It is outside `/api` and currently unlimited.
2. Should a future per-endpoint override table exist (e.g. lower limits for export-like endpoints, higher for polling) instead of a uniform 120/15m? Deferred.
3. Should 429s eventually be logged or counted in a metrics endpoint, given abuse visibility is now spread across many buckets? Deferred; logging was explicitly declined for this change.
4. Should the frontend show a friendlier "try again in N minutes" message using `Retry-After`? Explicitly out of scope; existing error display is unchanged.
