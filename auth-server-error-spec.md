# Authentication Server Error + Integration Errors — Fix Spec

**Status:** Draft for approval
**Requested:** "fix the server error in authentication and integration errors"
**Reported symptom:** the login page shows **"Server error during login."**
**Scope agreed in interview:** repair the crashing login handler and make the reCAPTCHA / Google Sign-In integrations consistently honor the admin's system settings. **Backend `authController` only.** No frontend changes, no deployment/URL work.

---

## 1. Problem and outcome

Login is completely broken: every `POST /api/auth/login` request fails with HTTP 500 and the generic message `Server error during login.` regardless of whether the credentials are valid.

The cause is a missing import. A recent edit (uncommitted, in the working tree) added a `SystemSettings` lookup to the login handler but never added the corresponding `require`. Verified by invoking the handler directly:

```
Login Error: ReferenceError: SystemSettings is not defined
    at Object.login (backend/controllers/authController.js:126:18)
STATUS 500 {"success":false,"message":"Server error during login."}
```

Two related integration faults sit alongside it:

1. **Signup ignores the admin toggle.** `signup` unconditionally calls `verifyRecaptcha(recaptchaToken)`. `verifyRecaptcha` returns `false` when no token or no `RECAPTCHA_SECRET_KEY` is present, so registration is blocked with "Please complete the reCAPTCHA verification." even when an administrator has switched reCAPTCHA **off**.
2. **Google Sign-In is only gated in the browser.** `frontend/js/auth.js` hides the Google button when `googleAuthEnabled` is false, but `POST /api/auth/google` never checks the setting, so the endpoint still accepts requests.

After this fix:

- Email + password login works for both trainees and admins.
- reCAPTCHA is enforced for login **and** signup only when the administrator has enabled it.
- The Google endpoint refuses requests when the administrator has disabled Google auth.
- A Google sign-in with an already-registered email links the existing account instead of dead-ending.
- Failures caused by misconfiguration are distinguishable from bad credentials.
- Debug logging of credentials and password-match results is gone.

---

## 2. Decisions locked in the interview

| Topic | Decision |
| --- | --- |
| Broken flow to fix | Email + password login (the reproduced 500) |
| Google account matching | Auto-link: an existing account with the same verified Google email gets `googleId` set and signs in |
| Google linking role scope | Any role, including admins |
| Password after linking | Stays valid — both email/password and Google continue to work |
| reCAPTCHA gating | Both login and signup honor `recaptchaEnabled` |
| Google gating | Backend enforces `googleAuthEnabled` as well as the frontend |
| Disabled Google status | **503 Service Unavailable** |
| Missing settings document | Treated as **both features disabled** (no write on boot, no env fallback) |
| Unexpected error response | Generic message plus a server-side logged correlation id; no internal detail to the client |
| Misconfiguration response | 503 with a distinct message, not a generic 500 |
| reCAPTCHA secret missing while enabled | 503 configuration/server error |
| Login debug logs | Remove entirely (email, user-found, role, status, password-match) |
| Welcome email failure | Signup still succeeds silently, exactly as today (`mail.sent: false`) |
| Frontend `localhost:5000` URLs | **Out of scope** — local development only for now |
| Frontend edits generally | **Out of scope** — controller only |
| Dead "Forgot Password?" / inert "Remember me" | Leave both alone, not part of this fix |
| Verification method | Manual `curl` passes against the running server; no new test harness |

---

## 3. Files in scope

| File | Change |
| --- | --- |
| `backend/controllers/authController.js` | The only file edited |

Explicitly **not** touched: `backend/utils/recaptcha.js`, `backend/utils/googleAuth.js`, `backend/models/*`, `backend/routes/*`, everything under `frontend/`.

Because the scope is controller-only, the reCAPTCHA helper keeps its current contract (returns `false` on any failure). Configuration errors are detected in the controller by checking `process.env.RECAPTCHA_SECRET_KEY` directly. See §8 for the resulting limitation.

---

## 4. Functional requirements

### R1 — Login must not crash

- Import the settings model at the top of `authController.js`:
  `const SystemSettings = require("../models/SystemSettings");`
- `POST /api/auth/login` must return `200` for a valid active trainee/admin and `401` for a wrong password. No `ReferenceError` may reach the catch block during a normal login.

### R2 — Single settings read per request

Resolve the settings exactly once per auth request, using `SystemSettings.findOne()`.

- A missing row (`null`) means `recaptchaEnabled = false` and `googleAuthEnabled = false`.
- Do not create the settings row from the auth controller; the settings controller already seeds it when an admin opens the settings page.
- Keep the lookup inside `authController.js` (a small local helper in that file is acceptable; no new shared util module).

### R3 — reCAPTCHA on login, gated by settings

- If `recaptchaEnabled` is `true`:
  - If `process.env.RECAPTCHA_SECRET_KEY` is missing → `503` with a distinct "verification unavailable / not configured" message.
  - Otherwise call `verifyRecaptcha(recaptchaToken)`; on `false` → existing `400` "Please complete the reCAPTCHA verification."
- If `recaptchaEnabled` is `false`: skip verification entirely and ignore any token sent by the client, so an old cached page with a captcha widget cannot block login.

### R4 — reCAPTCHA on signup, gated by the same settings

- Apply exactly the same rules as R3 to `POST /api/auth/signup`.
- Preserve the current validation order: reCAPTCHA check stays before the required-field, email-format, password-length, duplicate-email, and creation steps. The visible difference is only that the captcha step is skipped when the setting is off.
- The frontend already omits the token when the feature is off (`getRecaptchaToken()` returns `""`), so no frontend change is needed.

### R5 — Google endpoint gated by settings

- In `POST /api/auth/google`, after confirming `credential` is present, read the settings.
- If `googleAuthEnabled` is `false` → `503` with `{ success: false, message: "Google Sign-In is currently disabled." }`.
- If the settings row is missing → treat Google as disabled → same `503`.
- This check runs before token verification so a disabled integration never calls Google.

### R6 — Google account matching and auto-link

For a verified Google identity with email `E`:

| Existing account state | Behavior |
| --- | --- |
| No account with email `E` | Create a trainee account (unchanged: `role: "trainee"`, `status: "active"`, `googleId` set) and sign in |
| Account with `E`, `googleId` equals Google `sub` | Sign in |
| Account with `E`, `googleId` missing | **Link**: check status first, then set `googleId`, `await user.save()`, sign in. Keep the existing password untouched |
| Account with `E`, `googleId` is a different Google `sub` | `409` — this email is already linked to another Google account |
| Account with `E`, `status !== "active"` | `403` inactive-account message, **before** any link is saved |

Linking applies to any role. After linking, both Google and email + password sign-in must work for that account.

### R7 — Distinguishable error handling

- Each handler keeps its own catch block.
- On an unexpected error, generate a short correlation id (e.g. first 8 chars of `crypto.randomUUID()`), log it together with the error (stack included), and return the existing generic message — unchanged public wording:
  - login: `Server error during login.`
  - signup: `Server error during registration.`
  - google: `Authentication failed. Please try again.` (current 401 wording may be kept, but it must still carry the logged id)
- Configuration failures that are detected explicitly return `503`, not `500`, and are not logged as unexpected exceptions.
- The correlation id is logged only; it is **not** added to the JSON response (open question in §10).

### R8 — Logging hygiene

Remove these login-path logs completely:

- `console.log("Login email:", ...)`
- `console.log("User found:", ...)`
- `console.log("Account role:", ...)` / `console.log("Account status:", ...)`
- `console.log("Password match:", ...)`

Keep `console.error(...)` for real errors and the existing welcome-email error log. No credential, password-match, or role/status values may be printed on the success path.

---

## 5. Exact response contract

| Situation | Status | Message |
| --- | --- | --- |
| Valid login | 200 | `Login successful!` |
| Missing email/password | 400 | `Please enter your email and password.` |
| Wrong password / unknown email | 401 | `Invalid email or password.` |
| Inactive account | 403 | `Your account is inactive. Please contact the administrator.` |
| Invalid role | 403 | `Invalid account role. Please contact the administrator.` |
| Captcha enabled, token invalid | 400 | `Please complete the reCAPTCHA verification.` |
| Captcha enabled, secret missing | 503 | Configuration message, e.g. `reCAPTCHA verification is not configured. Please contact the administrator.` |
| Google disabled (setting off or no settings row) | 503 | `Google Sign-In is currently disabled.` |
| Google email has a different `googleId` | 409 | Existing "already linked" wording |
| Google email matches an unlinked account | 200 | Linked, then `Google Sign-In successful!` |
| Unexpected exception | 500 | Generic per-handler message |

---

## 6. Edge cases to handle deliberately

1. **No settings document at all** — login and signup run with captcha off; Google returns 503. This is the fresh-database case and must not throw.
2. **Captcha disabled but client still sends a stale token** — token is ignored, not verified.
3. **Captcha enabled but `RECAPTCHA_SECRET_KEY` missing** — 503 before spending a request on Google's endpoint.
4. **Google account created earlier, now trying password login** — such records have no `password`; the existing `!user.password` guard already returns 401 `Invalid email or password.` This stays; no password-reset flow is added.
5. **Linking an inactive account** — status is checked before `googleId` is written, so a disabled account never gains a Google link.
6. **Google returns no first/last name** — existing `"Google"` / `"User"` fallbacks satisfy the `User` schema; unchanged.
7. **Duplicate signup email** — case-normalized lookup already in place; unchanged. With captcha off, the duplicate check is reached without a token.
8. **Mongo unavailable during the settings lookup** — falls into the catch block → generic 500 with a logged correlation id (acceptable; not a 503 in this pass).
9. **Google's verify endpoint unreachable while captcha is enabled** — `verifyRecaptcha` still returns `false`, so the user sees the 400 "complete the reCAPTCHA" message. Known limitation, see §8.

---

## 7. Acceptance criteria

- [ ] `POST /api/auth/login` with valid trainee credentials returns `200` + token + user; previously it returned `500`.
- [ ] `POST /api/auth/login` with a wrong password returns `401`, not `500`.
- [ ] No `SystemSettings is not defined` in server logs during any login.
- [ ] With captcha off, login and signup succeed with no token.
- [ ] With captcha on and a bad/empty token, both return `400` with the captcha message.
- [ ] With captcha on and no `RECAPTCHA_SECRET_KEY`, both return `503`.
- [ ] With Google off, `POST /api/auth/google` returns `503` even with a valid-looking credential, and no outbound Google verification happens.
- [ ] With Google on, an existing email/password account signing in via Google is linked and can afterwards log in with either method.
- [ ] A second, different Google identity on the same email still returns `409`.
- [ ] Server logs contain no email, role, status, or password-match values from login, and contain no passwords/secrets.
- [ ] No files outside `backend/controllers/authController.js` are modified.

---

## 8. Known limitations (documented, not fixed here)

- **Transient reCAPTCHA outages are indistinguishable from failed verification.** Fixing that needs `backend/utils/recaptcha.js` to signal configuration/network failure separately, which is outside the agreed controller-only scope.
- **Frontend API base is hardcoded** to `http://localhost:5000` in ten files (`auth.js`, `dashboard.js`, `apply.js`, `admin.js`, `assessments.js`, `admin-applications.js`, `admin-programs.js`, `admin-settings.js`, `admin-assessments.js`, plus inline fetches). Fine for local development; it will break on any other host. Explicitly deferred.
- **Google client id is duplicated in the frontend** (`frontend/js/auth.js` and the `g_id_onload` blocks in `login.html` / `signup.html`) and is independent of `GOOGLE_CLIENT_ID` in the backend `.env`. A mismatch produces Google verification failures that surface as a generic 401.
- **No rate limiting, lockout, or password-reset flow.** The "Forgot Password?" link is inert by decision.
- **`backend` has no working test command** (`npm test` exits 1). Verification for this change is manual.

---

## 9. Verification plan (manual, curl)

Prerequisite: `cd backend && npm run dev` (or `node server.js`) with the existing `.env`; all eight keys (`MONGODB_URI`, `JWT_SECRET`, `RECAPTCHA_SECRET_KEY`, `GOOGLE_CLIENT_ID`, `BREVO_API_KEY`, `MAIL_FROM`, `PORT`) are currently present. Never echo secret values in output.

1. **Settings off** — via the admin settings page (or `PUT /api/system-settings` with an admin token) set both flags to `false`.
2. **Login, valid account** — `curl -i -X POST localhost:5000/api/auth/login -H "Content-Type: application/json" -d '{"email":"<existing trainee>","password":"<password>"}'` → expect `200`; confirm no `SystemSettings` error in the server log.
3. **Login, wrong password** → expect `401`.
4. **Signup, no captcha token** → expect `201` with a new email; confirm `mail.sent` reflects Brevo's result and the request still succeeds if Brevo fails.
5. **Google disabled** — `POST /api/auth/google` with any credential string → expect `503`.
6. **Captcha path** — temporarily enable `recaptchaEnabled` through the settings API, then login with no token → expect `400`; blank `RECAPTCHA_SECRET_KEY` in a throwaway environment → expect `503`; re-enable and restore values afterwards.
7. **Google enabled** — enable via settings; attempt Google sign-in from the browser for an account that already has a password → expect linking; then confirm the same account still logs in with email + password.
8. **Log hygiene** — scan the server output from steps 2–7 for the login email, `Password match`, and role/status lines; expect none.
9. **Scope check** — `git status` shows only `backend/controllers/authController.js` changed.

---

## 10. Open questions (non-blocking)

1. Should the correlation id also be returned to the client (`errorId` in the JSON) so a user can quote it to support? Currently spec'd as log-only.
2. Should `googleLogin`'s catch keep returning `401` for unexpected errors, or become `500` to match the other two handlers? This spec keeps the current status but adds the logged id.
3. Should auth requests cache the settings row for a few seconds to avoid one `findOne()` per login attempt? Not needed at current traffic; deferred.
4. Should Google-created accounts later be allowed to set a password (making Google optional)? Out of scope for this fix.
