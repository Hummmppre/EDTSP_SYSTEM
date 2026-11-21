# Integration Key Validation — Spec

**Status:** Draft, ready for review
**Requested:** "ask user question, add a validation api key in every integration in the system settings"
**Agreed scope (interview):** add editable, encrypted credentials and live "Test"/"Save" validation to all five System Settings integrations (Google Authentication, Brevo, Google Calendar, Google Sheets, reCAPTCHA), keeping env vars as fallback, with a 12-month audit trail.
**Short name:** `integration-key-validation`

---

## 1. Problem and outcome

System Settings today shows five integrations as on/off switches. Their credentials live only in `backend/.env`:

- Google Authentication — `GOOGLE_CLIENT_ID`
- Brevo email — `BREVO_API_KEY`
- Google Calendar — `GOOGLE_CALENDAR_CLIENT_ID`, `GOOGLE_CALENDAR_CLIENT_SECRET`, `GOOGLE_CALENDAR_REDIRECT_URI`, `GOOGLE_CALENDAR_ID`
- Google Sheets — reuses the Calendar OAuth client and stored Google token
- reCAPTCHA — `RECAPTCHA_SECRET_KEY`, while the site key is hardcoded in `login.html` and `signup.html`

An administrator has no way to tell whether a credential is present, correct, or still working without triggering a real email, sign-in, calendar event, export, or captcha challenge. A bad key is discovered by end users.

After this change:

- Each integration card can show which credential fields are configured, whether the value came from the database or `.env`, and the last validation result.
- An administrator can enter replacement credentials, test them without saving, and save them only after a successful live validation.
- A saved database value overrides the matching env var; env remains the fallback.
- Credentials are encrypted at rest; full values are never returned to the browser or written to logs.
- Failed validations (including timeouts and provider outages) never change the stored credential.
- Every test, save, clear, and failure is audited for 12 months and viewable on the Settings page.

---

## 2. Decisions locked in the interview

| Topic | Decision |
| --- | --- |
| Feature shape | Admins enter credentials in the UI; backend validates against the provider and stores them. Env becomes fallback. |
| Integrations | All five cards: Google Authentication, Brevo, Google Calendar, Google Sheets, reCAPTCHA. |
| Credential types | All values an integration needs, including OAuth client pairs, calendar ID, and reCAPTCHA site key. |
| Storage | MongoDB, AES-256-GCM encrypted with a new server-side secret. |
| Precedence | Database over `.env` per field. |
| Key display | Mask everything; never return real characters, prefixes, or suffixes. |
| Auditing | Full audit log, 12-month retention, panel on the Settings page. |
| reCAPTCHA validation | No live call; format check plus a paired site key. |
| Google depth | OAuth credential verification, token refresh, and a real read call against Calendar/Sheets. |
| Invalid save | Rejected; previous credential stays in place. |
| Toggle gating | None; validation never enables or disables an integration. |
| Google refresh token | Obtainable only through Connect Google; read-only in the UI. |
| Result display | Persisted per card; no automatic revalidation on page load. |
| Provider outage/timeout | Save is rejected (same as an invalid key). |
| Buttons | Two per card: **Test** (validate without storing) and **Save** (validate, then store). |
| Google Authentication | Validate a full client ID + client secret pair. |
| Brevo | Validate the API key only; `MAIL_FROM` is not checked. |
| Audit contents | Integration, action, outcome, provider code, admin id/email, IP, timestamp. No secrets or fragments. |
| Missing encryption secret | Saves/clears are refused with a clear error; reads and env fallback keep working. |
| Google pair edit | Keep the stored refresh token; test it against the new pair. |
| Undecryptable credential | Fail closed; no env fallback; prompt re-entry. |
| Bulk validate | Not included. |
| Supporting work | Automated tests + README/env documentation. |
| No refresh token yet | Calendar/Sheets may save a validated OAuth pair marked "awaiting Google connection"; full check runs after Connect Google. |
| Shared Google pair | One shared pair, but Calendar and Sheets validate independently and keep separate statuses. |

### Resolved ambiguity: shared Google credentials

Google Calendar and Google Sheets continue to share one OAuth client pair and one stored Google account token. The pair is editable from either card. Validation and saved status are **per card**:

- Saving from the Calendar card validates Calendar only and does not require the Sheets check to pass.
- Saving from the Sheets card validates Sheets only.
- Each card keeps its own last-result record.
- If the shared pair changes after a card's last validation, that card is shown as **stale** ("Google credentials changed after this check") without erasing its historical result.

---

## 3. Credential inventory

| Card | Editable fields | Read-only / derived | Validation |
| --- | --- | --- | --- |
| Google Authentication | `clientId`, `clientSecret` | — | OAuth client pair accepted by Google |
| Brevo | `apiKey` | — | `GET https://api.brevo.com/v3/account` |
| Google Calendar | `clientId`, `clientSecret` (shared), `calendarId` | Refresh token, granted scopes | Pair + token refresh + real Calendar read |
| Google Sheets | `clientId`, `clientSecret` (shared) | Refresh token, granted scopes | Pair + token refresh + real Sheets/Drive read |
| reCAPTCHA | `secretKey`, `siteKey` | — | Format + presence checks only |

Field-level env fallback names:

| Integration | Database field | Env fallback |
| --- | --- | --- |
| `google-auth` | `clientId` | `GOOGLE_CLIENT_ID` |
| `google-auth` | `clientSecret` | `GOOGLE_CLIENT_SECRET` (new) |
| `brevo` | `apiKey` | `BREVO_API_KEY` |
| `google-calendar` | `clientId` | `GOOGLE_CALENDAR_CLIENT_ID` |
| `google-calendar` | `clientSecret` | `GOOGLE_CALENDAR_CLIENT_SECRET` |
| `google-calendar` | `calendarId` | `GOOGLE_CALENDAR_ID` |
| `google-sheets` | `clientId` | `GOOGLE_CALENDAR_CLIENT_ID` |
| `google-sheets` | `clientSecret` | `GOOGLE_CALENDAR_CLIENT_SECRET` |
| `recaptcha` | `secretKey` | `RECAPTCHA_SECRET_KEY` |
| `recaptcha` | `siteKey` | `RECAPTCHA_SITE_KEY` (new) |

Notes:

- `GOOGLE_CLIENT_SECRET` and `RECAPTCHA_SITE_KEY` are introduced for validation/fallback. Existing deployments without them remain valid as long as env fallbacks resolve.
- Google Sign-In still verifies ID tokens with the client ID as the audience. The client secret is stored and validated but is not used in the sign-in verification call.
- `GOOGLE_CALENDAR_REDIRECT_URI`, timezone, and sender identity are configuration, not API keys; they stay env-only.
- `GOOGLE_CALENDAR_REFRESH_TOKEN` remains an env-only, server-managed fallback. It is never editable in the UI and never returned. Database `GoogleCalendarCredential` remains the primary token store.

---

## 4. Data model

### 4.1 `IntegrationCredential`

One document per **encrypted storage group**, not per card. Google Calendar and Sheets share the client pair through a single `google-oauth` record, which removes the need to mirror ciphertext between two documents.

| Field | Type | Notes |
| --- | --- | --- |
| `integration` | String, unique, enum | `google-auth`, `google-oauth`, `brevo`, `google-calendar`, `recaptcha` |
| `ciphertext` | String, required | Base64 AES-256-GCM ciphertext of `{ v: 1, fields }` |
| `iv` | String, required | Base64, 12 random bytes per save |
| `authTag` | String, required | Base64, 16 bytes |
| `keyVersion` | Number, required, min 1 | `1` for the initial encryption secret |
| `updatedBy` | ObjectId → User, required | Last admin who saved |
| `createdAt`, `updatedAt` | Date | Mongoose timestamps |

Card-to-storage mapping:

| Card | Encrypted storage | Fields stored there |
| --- | --- | --- |
| `google-auth` | `google-auth` | `clientId`, `clientSecret` |
| `brevo` | `brevo` | `apiKey` |
| `google-calendar` | `google-oauth` | `clientId`, `clientSecret` |
| `google-calendar` | `google-calendar` | `calendarId` |
| `google-sheets` | `google-oauth` | `clientId`, `clientSecret` |
| `recaptcha` | `recaptcha` | `secretKey` |
| `recaptcha` | `SystemSettings` (plain) | `recaptchaSiteKey` |

Rules:

- The plaintext JSON map contains only encrypted fields assigned to that storage group in §3.
- `google-oauth` is written once per Google save; Calendar and Sheets read the same record but keep independent statuses.
- `GoogleCalendarCredential` (refresh token) is untouched.

### 4.2 `IntegrationValidationStatus`

Per-card, not per-shared-credential:

| Field | Type | Notes |
| --- | --- | --- |
| `integration` | String, unique, enum | Card key |
| `valid` | Boolean | Last definitive result |
| `state` | String enum | `valid`, `invalid`, `unverified`, `awaiting_connection`, `unreadable_credential`, `not_configured` |
| `code` | String | Stable provider/application code (§8) |
| `message` | String | Safe, user-facing message; no provider payload echoes |
| `checkedAt` | Date | When validation last ran |
| `credentialUpdatedAt` | Date or null | Shared credential timestamp used by that check; drives staleness |

Staleness is computed at read time: a card is stale when its stored `credentialUpdatedAt` is older than the current shared credential's `updatedAt`.

### 4.3 `IntegrationAudit`

| Field | Type | Notes |
| --- | --- | --- |
| `integration` | String | Card key |
| `action` | String enum | `test`, `save`, `clear` |
| `outcome` | String enum | `success`, `failure` |
| `code` | String | Stable code, e.g. `invalid_credentials`, `network_error` |
| `adminId` | ObjectId → User | Actor |
| `adminEmail` | String | Snapshot so the entry survives account deletion |
| `ip` | String | Request IP |
| `createdAt` | Date | TTL index, 12 months |

Never store secret values, prefixes, suffixes, hashes, or fingerprints of secrets. Provider error text is normalized to a code and a fixed message; raw provider bodies are not persisted.

### 4.4 `SystemSettings`

Add one plain field: `recaptchaSiteKey` (String, default `""`). The secret stays in `IntegrationCredential`; the site key is public by design. `GET /api/system-settings/public` adds `recaptchaSiteKey` alongside the existing flags. No other public exposure changes.

---

## 5. Encryption and key management

- Algorithm: AES-256-GCM.
- Master key: `INTEGRATION_ENCRYPTION_KEY`, supplied as 32 bytes (base64 or 64 hex characters).
- AAD: `edtsp:integration:<integration>` so a ciphertext cannot be moved between integrations.
- Each save generates a fresh 12-byte IV.
- `keyVersion` is stored now so rotation can be added later without a schema change.
- Secrets are decrypted on demand at the point of use; they are not cached in process memory or embedded in responses.
- Decrypted values never appear in logs, error messages, audit rows, validation status messages, or API responses.
- If `INTEGRATION_ENCRYPTION_KEY` is missing or malformed:
  - `Test` still works for values typed in the request.
  - `Save` and `Clear` return `503 encryption_not_configured`.
  - Existing database credentials cannot be decrypted, so runtime resolution fails closed (no env fallback) and the affected cards show `unreadable_credential`.
  - The server still boots; env-only configuration continues to work if no database overrides exist.
- A decrypt failure (tampering, rotated key, corrupt record) is treated the same as unreadable: fail closed, do not delete the record automatically, and prompt re-entry.
- The README documents how to generate the key (`openssl rand -base64 32` or equivalent) and warns that losing it requires re-entering all saved credentials.

---

## 6. Resolution and runtime integration

Create a credential resolver used everywhere an integration secret is currently read from `process.env`:

- `backend/lib/mailer.js` (Brevo key)
- `backend/utils/recaptcha.js` (reCAPTCHA secret)
- `backend/utils/googleAuth.js` (Google Sign-In client ID)
- `backend/lib/googleConnection.js` (Calendar/Sheets client pair, refresh token, calendar ID)

Resolution rules, per field (through the card-to-storage mapping in §4.1):

1. If a database override exists for the integration and field, decrypt and use it.
2. If the database record exists but the field is missing or cannot be decrypted, do **not** fall back to env; the integration reports an unavailable credential.
3. Otherwise use the env var.
4. If neither exists, report `not_configured`.

Resolution happens per call. Changing a value in the UI takes effect without a server restart.

---

## 7. Validation rules

All provider calls use an 8-second timeout and no automatic retries. Validation is a read-only probe; it must not send email, create calendar events, or change provider state.

| Card | Probe | Pass | Distinct failures |
| --- | --- | --- | --- |
| Google Authentication | Check client ID shape (`.apps.googleusercontent.com`), then perform an OAuth token request with the candidate pair and a dummy authorization code | Google authenticates the client (a code/redirect complaint is not a credential failure) | `format_invalid`, `invalid_credentials`, `network_error`, `timeout` |
| Brevo | `GET https://api.brevo.com/v3/account` with `api-key` | HTTP 200 | `invalid_credentials` (401/403), `network_error`, `timeout` |
| Google Calendar | Verify pair if provided, refresh the stored token, then `events.list` with `maxResults=1` on the configured calendar ID | Token refresh + event read succeed | `invalid_credentials`, `not_connected`, `awaiting_connection`, `invalid_calendar_id`, `missing_scope`, `api_disabled`, `needs_reconnect`, `network_error`, `timeout` |
| Google Sheets | Verify pair if provided, refresh the stored token, then a minimal Drive read | Token refresh + read succeed with Sheets/Drive scopes | `invalid_credentials`, `not_connected`, `awaiting_connection`, `missing_scope`, `api_disabled`, `needs_reconnect`, `network_error`, `timeout` |
| reCAPTCHA | Both values present; secret and site key match Google's key shape (40 characters, `6L`/`6A` prefix) | Both fields pass format checks | `format_invalid`, `site_key_missing` |

Additional rules:

- **Google Authentication** requires both a client ID and secret. Even though sign-in runtime only uses the client ID, the card collects and validates the pair.
- **Google Calendar/Sheets with no refresh token:** if the OAuth pair validates but no token exists, the save is allowed with state `awaiting_connection`. The credentials are stored. After a successful Connect Google callback, the backend immediately runs the full live validation for both Google cards and persists the results. This avoids a bootstrap deadlock while still requiring a live check once a token exists.
- **Google Calendar/Sheets with an existing token that fails refresh:** the save is rejected (`needs_reconnect`); the admin must reconnect Google. The stored token is not deleted by validation.
- **Shared pair edits:** saving Calendar credentials validates Calendar only; saving Sheets credentials validates Sheets only. The other card is marked stale by timestamp comparison, not erased.
- **reCAPTCHA limitation:** there is no offline or token-free way to prove that a site key and secret belong to the same key pair. The validation is presence + format, and the UI states this explicitly. A real captcha challenge is never part of validation.
- **Brevo sender:** `MAIL_FROM` and sender verification are out of validation scope.
- **Sheets API enablement:** no spreadsheet ID is configured, so the Sheets probe confirms the OAuth pair, token, Drive access, and spreadsheet scope, but cannot prove the Sheets API itself is enabled.

---

## 8. API contract

Except for `GET /public`, all integration routes are admin-only (`protect`, `adminOnly`) and mounted under `/api/system-settings`.

### `GET /api/system-settings`

Extend the existing response with integration metadata (no existing fields removed):

```json
{
  "success": true,
  "settings": { "...existing flags...": true },
  "integrations": {
    "google-auth": {
      "configured": true,
      "fields": [
        { "name": "clientId", "configured": true, "source": "database", "readable": true },
        { "name": "clientSecret", "configured": true, "source": "database", "readable": true }
      ],
      "lastValidation": {
        "valid": true,
        "state": "valid",
        "code": "ok",
        "message": "Google OAuth client accepted.",
        "checkedAt": "2026-11-21T09:00:00.000Z",
        "stale": false
      }
    }
  }
}
```

- `source` is `database`, `environment`, or `none`.
- No masked value may encode the real length or any character of the secret. Use a fixed mask such as `••••••••`.
- The refresh token is reported as `configured` plus its scopes; never as a value and never as editable.

### `POST /api/system-settings/integrations/:integration/test`

Body:

```json
{ "fields": { "clientId": "...", "calendarId": "primary" } }
```

- Validates the submitted fields plus currently resolved values for omitted fields.
- Refresh tokens are never accepted in the body.
- Returns HTTP 200 whether valid or not:

```json
{
  "success": true,
  "valid": false,
  "state": "invalid",
  "code": "invalid_credentials",
  "message": "Google rejected this client ID or secret.",
  "checkedAt": "2026-11-21T09:00:00.000Z"
}
```

- May include the safe `checks` array from the validator; never includes provider bodies, headers, tokens, or values.
- Returns `409 unreadable_credential` when an unreadable stored record blocks resolving omitted fields and the request does not supply all required values.
- Writes an audit entry (`action: test`).
- Does not modify credentials or persisted status.

### `PUT /api/system-settings/integrations/:integration`

- Body has the same `fields` map.
- Runs the same validation first.
- On failure: HTTP `422`, no write, previous credential and previous status unchanged; audit `failure`.

```json
{
  "success": false,
  "code": "invalid_credentials",
  "message": "Brevo rejected this API key.",
  "integration": "brevo"
}
```

- On success: encrypt and upsert, update status to `valid`, audit `success`, return the single-card metadata shape.
- For Calendar/Sheets with no token, success stores the pair with `awaiting_connection`.

```json
{ "success": true, "integration": { "configured": true, "fields": [], "lastValidation": {} } }
```

- If the encryption secret is unavailable: `503 encryption_not_configured`, no write and no provider call.
- If an unreadable record blocks omitted fields: `409 unreadable_credential`, no write.
- If the credential write or its best-effort rollback fails: `500 credential_write_failed`, no success response.

### `DELETE /api/system-settings/integrations/:integration`

- Removes the database override so resolution falls back to env.
- Clearing `google-calendar` also clears the shared `google-oauth` record; clearing `google-sheets` clears `google-oauth` only. The confirmation copy warns that both Google cards are affected.
- Clearing `google-oauth` resets the persisted status for both Google cards to `unverified`.
- Clearing `recaptcha` deletes the encrypted secret and sets `SystemSettings.recaptchaSiteKey` to `""`, so the public endpoint falls back to `RECAPTCHA_SITE_KEY`.
- Clears the persisted validation status into `not_configured` or `unverified` based on what remains.
- Audit `clear` with success/failure.
- No validation is required; this is the rollback path after a bad-but-saved credential.
- Requires an explicit confirmation in the UI.
- Returns `{ "success": true, "clearedKeys": ["google-oauth"], "integrations": { "google-calendar": {}, "google-sheets": {} } }` for affected cards; a no-op returns an empty `clearedKeys`.
- Requires the encryption secret; otherwise `503 encryption_not_configured`.

### `GET /api/system-settings/integrations/audit?limit=20&before=<ISO>`

- Admin-only, newest first, maximum 100 per request.
- Returns integration, action, outcome, code, admin email, IP, timestamp.
- Never returns secrets or provider payloads.
- Response: `{ "success": true, "entries": [], "nextBefore": null }`; invalid `limit`/`before` values return `400 invalid_field`.

### `GET /api/system-settings/public`

Adds `settings.recaptchaSiteKey` (database value, else `RECAPTCHA_SITE_KEY`, else `""`). The login and signup pages render `data-sitekey` from this value before loading the reCAPTCHA script. If it is empty, they keep the current hardcoded value as a fallback so existing deployments do not break.

### Rate limiting

`POST .../test`, `PUT .../integrations/:integration`, and `DELETE .../integrations/:integration` use the standard write limiter plus a dedicated `integrationValidationLimiter`:

- 20 requests per 15 minutes per admin account, keyed by admin ID (falling back to IP).
- 429 responses keep the existing shape and `Retry-After`.

---

## 9. Admin UI

Each of the five cards in `frontend/admin/settings.html` gains an expandable credential area below the existing description, and `frontend/js/admin-settings.js` gains the behavior. The existing toggle stays in place and remains independent.

Card layout:

1. Title, description, toggle (unchanged).
2. **Credential fields** — password inputs for secrets (`clientSecret`, `apiKey`, `secretKey`), text inputs for `clientId`, `calendarId`, and the public `siteKey`; `autocomplete="new-password"` and an explicit `<label>` per field. When a value is already stored, show a fixed mask and the source badge (`Saved` / `Server env` / `Not configured`); typing replaces it. Secret fields include a Show/Hide control, but it must never display a stored value from the server.
3. **Actions** — `Test` (validates without saving) and `Save` (validates then saves). Both are disabled while a request is in flight and show progress text.
4. **Status line** — last result, relative time, and message, using an `aria-live="polite"` region. Stale results read "Credentials changed since this check — validate again."
5. **Clear saved key** — only visible when a database override exists; opens a confirm dialog explaining the env fallback. On either Google card the dialog also states that the shared OAuth client is cleared for both Calendar and Sheets.
6. Google cards additionally show the read-only refresh-token state, granted scopes, and the existing Connect/Reconnect/Disconnect controls. Editing the OAuth pair never deletes the token.
7. Google Authentication shows client ID and client secret. The secret is used for validation only.
8. reCAPTCHA shows secret key and site key, with helper text that pairing cannot be verified without a live challenge.
9. Brevo shows the API key only, with helper text that sender identity is not checked.

Error presentation:

- Field-level or card-level error from the stable code + message; never a raw provider body.
- Save failure leaves the entered values in the form (so the admin can correct them) but the stored credential is unchanged.
- Successful save clears the inputs, refreshes metadata, and shows the new masked state.

Audit panel:

- A collapsible "Integration activity" section at the bottom of the Settings page.
- Newest 20 entries, "Load more" pagination.
- Columns: time, integration, action, outcome/code, admin, IP.
- Empty state: "No integration activity yet."

No bulk validation, no automatic validation on page load, no relationship between validation and the enable toggle.

---

## 10. Error codes and states

| Code | Meaning | Save behavior |
| --- | --- | --- |
| `ok` | Validation passed | Allowed |
| `format_invalid` | Value does not match the provider's shape | Rejected |
| `site_key_missing` | reCAPTCHA secret present without a site key | Rejected |
| `invalid_credentials` | Provider definitively rejected the key/pair | Rejected |
| `not_connected` | Google account token is absent | Pair-only save → `awaiting_connection` |
| `needs_reconnect` | Stored Google token is revoked/expired | Rejected |
| `missing_scope` | Token lacks Calendar/Sheets permission | Rejected |
| `invalid_calendar_id` | Calendar ID not found or not readable | Rejected |
| `api_disabled` | Calendar/Sheets/Drive API disabled in the Google project | Rejected |
| `network_error` | DNS/TLS/connection failure | Rejected |
| `timeout` | Probe exceeded 8 seconds | Rejected |
| `encryption_not_configured` | Server encryption secret missing/malformed | Rejected (`503`) |
| `unreadable_credential` | Stored ciphertext cannot be decrypted | Fail closed; no env fallback; Save returns `409` unless all required values are supplied |
| `not_configured` | No database value and no env value | Test can still validate typed values |
| `awaiting_connection` | OAuth pair is valid but no Google token exists | Pair-only save allowed for Calendar/Sheets |
| `unknown_integration` | Card key is not one of the five integrations | Rejected (`400`) |
| `unknown_field` | Request contains a field not in the card catalog | Rejected (`400`) |
| `missing_field` | A required field has no candidate or resolved value | Rejected (`400`) |
| `invalid_field` | Non-string or over 512 characters (empty strings are omitted, not rejected) | Rejected (`400`) |
| `credential_write_failed` | Validation passed but the encrypted write failed | Rejected (`500`); retry is safe |
| `provider_error` | Provider returned an unexpected response or registry caught an exception | Rejected (`422`) |
| `internal_error` | Unexpected controller failure | Rejected (`500`) |

Successful saves set `state: valid`. Failed tests set `state: invalid` in the response but do not overwrite a previously stored successful status; only a failed save leaves the previous status untouched. A successful save from `awaiting_connection` becomes `valid` after the Connect Google callback validation.

---

## 11. Edge cases

- **Two admins save at once:** last successful save wins; both attempts are audited. Optimistic concurrency is not required for credentials.
- **Integration disabled:** Test and Save still work; the toggle is never blocked or changed by validation.
- **Env-only values:** shown as `Server env` with Save available to create an override. `Clear` restores env resolution.
- **Env changes require a restart:** env fallback is read from `process.env` as usual; database values apply immediately.
- **Google account connected after pair-only save:** the OAuth callback triggers live validation for both Google cards; a failure is surfaced on the card and audited without breaking the callback redirect.
- **Shared pair edit:** the other Google card becomes stale by timestamp comparison but keeps its last result and does not lose its status.
- **Token revoked between checks:** a later Test/Save reports `needs_reconnect`; the token is not deleted by validation (existing calendar sync behavior may still clear it).
- **Undecryptable record:** all runtime calls for that integration fail closed; the card shows `unreadable_credential` with "Re-enter this credential"; Clear is available to remove the bad record.
- **Missing encryption secret with existing overrides:** fail closed; env is not silently used. Save/Clear return 503.
- **Provider outage:** the save is rejected, the old key stays active, and the audit records `network_error`/`timeout`.
- **reCAPTCHA site key changed:** public settings serve the new value; login/signup pick it up on next load. The secret and site key are always saved together.
- **Clear while enabled:** resolution falls back to env; if neither remains, runtime calls surface `not_configured`. The toggle state is unchanged, by design.
- **Audit write failure:** logged to the server console; it must never fail or roll back the credential operation.
- **Secrets in transit:** existing HTTPS/deployment assumptions apply; the API never returns stored plaintext, including in error paths.

---

## 12. Security requirements

- Admin-only access on every read/write route; no change to the public endpoint beyond the site key.
- AES-256-GCM with per-save IV and AAD binding.
- No secret values, prefixes, suffixes, hashes, or fingerprints in responses, logs, audit rows, or status messages.
- Provider error bodies are scrubbed before being mapped to a code/message.
- Inputs are length-bounded (e.g. 512 characters) and trimmed; unknown fields are ignored.
- Validation makes outbound calls only to the known provider hosts; no admin-supplied URL is ever fetched.
- Rate limiting and the 8-second timeout limit abuse and hanging requests.
- `GET /api/system-settings` never exposes ciphertext, IV, tag, env values, or refresh tokens.

---

## 13. Tests

Use the existing `node --test` setup and `TEST_MONGODB_URI` pattern.

Unit:

- Encryption round-trip for every integration; random IVs differ; wrong AAD/key fails; tampered ciphertext/tag fails.
- Missing/malformed `INTEGRATION_ENCRYPTION_KEY` blocks save/clear with 503.
- Resolver precedence: database > env; missing database field → env; undecryptable database value → no env fallback.
- Validation adapters with mocked `fetch`: success, 401, 403, timeout, 5xx, malformed JSON, redirect-URI complaint treated as pair accepted for Google Auth.
- reCAPTCHA format rules and paired-field requirement.
- Status transitions: valid → stale when shared credential timestamp advances; failed test does not overwrite stored status; failed save writes nothing.
- Audit entries contain no submitted secret material and get the 12-month TTL.
- Calendar/Sheets pair-only save with no token → `awaiting_connection`; existing invalid token → `needs_reconnect` and no write.

Route/integration:

- Unauthorized/non-admin requests to test/save/clear/audit are rejected.
- Rate limiter returns 429 after 20 validation requests.
- Save rejects with 422 and leaves the old ciphertext/status unchanged.
- Clear reverts to env and audits.
- Public settings returns the site key but never the secret.
- `GET /api/system-settings` metadata never includes secret values.

Manual checklist:

- All five cards show source, mask, status, and Test/Save behavior.
- Google Auth pair, Brevo key, Calendar ID, Sheets shared pair, and reCAPTCHA pair each succeed with real credentials and fail cleanly with a wrong value.
- Connect Google after a pair-only save triggers both Google checks.
- Clear restores env fallback.
- Audit panel paginates and shows no secrets.
- Login/signup render the site key from public settings and captcha still works.

---

## 14. Documentation

Update `README.md`:

- New env vars: `INTEGRATION_ENCRYPTION_KEY`, `GOOGLE_CLIENT_SECRET`, `RECAPTCHA_SITE_KEY`.
- How to generate the encryption key and the consequence of losing it.
- Database-over-env precedence and the Clear/fallback behavior.
- New endpoints and the 12-month audit retention.
- Validation behavior per provider, including the reCAPTCHA pairing limitation and that Brevo sender identity is not checked.
- Note that changing credentials applies without restart.

---

## 15. Phased implementation plan

Five phases, one reviewable change each. Phases 1–3 are backend-only and leave the UI unchanged, so they can ship without visible behavior changes. Phase 4 is the visible feature. Phase 5 hardens and documents it. Each phase has its own tests and a review checkpoint; later phases must not start before the previous checkpoint clears.

### Phase 1 — Storage, encryption, and credential resolution

**Goal:** make database-stored credentials possible and safely readable, without changing any route or screen.

#### Storage design refinement

Google Calendar and Sheets share one `google-oauth` credential record instead of mirroring the pair into two documents. This removes partial-write drift and gives both cards the same `updatedAt` for staleness checks. Calendar keeps `calendarId` in its own `google-calendar` record. Google Authentication remains a separate `google-auth` pair because it is a different OAuth client.

#### File map

| File | Responsibility | Depends on |
| --- | --- | --- |
| `backend/lib/integrations/catalog.js` | Card definitions, field names, env fallbacks, storage groups, required fields, max lengths | — |
| `backend/lib/credentialCrypto.js` | AES-256-GCM envelope, key parsing, typed errors | `catalog.js` only for type docs |
| `backend/lib/integrationCredentials.js` | Resolution, metadata, candidate merging, save/clear orchestration | catalog, crypto, models |
| `backend/lib/integrationAudit.js` | Best-effort audit writer | audit model |
| `backend/lib/integrationStatus.js` | Validation-status read/write and staleness | status model, credential model |
| `backend/models/IntegrationCredential.js` | Encrypted storage group | — |
| `backend/models/IntegrationValidationStatus.js` | Per-card last result | — |
| `backend/models/IntegrationAudit.js` | Audit trail with TTL | — |

Models never import resolver code; the dependency direction stays `models ← lib → controllers`.

#### Model definitions

`IntegrationCredential`:

```js
const integrationCredentialSchema = new mongoose.Schema(
  {
    integration: {
      type: String,
      required: true,
      unique: true,
      enum: ["google-auth", "google-oauth", "brevo", "google-calendar", "recaptcha"],
    },
    ciphertext: { type: String, required: true },
    iv: { type: String, required: true },
    authTag: { type: String, required: true },
    keyVersion: { type: Number, required: true, min: 1, default: 1 },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true },
);
```

`IntegrationValidationStatus`:

```js
const integrationValidationStatusSchema = new mongoose.Schema(
  {
    integration: {
      type: String,
      required: true,
      unique: true,
      enum: ["google-auth", "brevo", "google-calendar", "google-sheets", "recaptcha"],
    },
    valid: { type: Boolean, default: false },
    state: {
      type: String,
      default: "unverified",
      enum: [
        "valid", "invalid", "unverified", "awaiting_connection",
        "unreadable_credential", "not_configured",
      ],
    },
    code: { type: String, default: "not_configured", maxlength: 64 },
    message: { type: String, default: "", maxlength: 300 },
    checkedAt: { type: Date, default: null },
    credentialUpdatedAt: { type: Date, default: null },
  },
  { timestamps: true },
);
```

`IntegrationAudit`:

```js
const integrationAuditSchema = new mongoose.Schema(
  {
    integration: {
      type: String,
      required: true,
      enum: ["google-auth", "brevo", "google-calendar", "google-sheets", "recaptcha"],
    },
    action: { type: String, required: true, enum: ["test", "save", "clear"] },
    outcome: { type: String, required: true, enum: ["success", "failure"] },
    code: { type: String, required: true, maxlength: 64 },
    adminId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    adminEmail: { type: String, required: true, maxlength: 254 },
    ip: { type: String, default: "", maxlength: 64 },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

integrationAuditSchema.index({ createdAt: 1 }, { expireAfterSeconds: 365 * 24 * 60 * 60 });
```

`SystemSettings` gains `recaptchaSiteKey: { type: String, default: "", maxlength: 256 }`.

#### Crypto API

```js
// backend/lib/credentialCrypto.js
const ALGORITHM = "aes-256-gcm";
const KEY_BYTES = 32;
const IV_BYTES = 12;
const TAG_BYTES = 16;
const KEY_VERSION = 1;

/** @returns {Buffer} 32-byte key; throws IntegrationCryptoError("encryption_not_configured") */
function parseMasterKey(raw);

/** @returns {boolean} */
function encryptionConfigured(env = process.env);

/**
 * @param {string} storageIntegration
 * @param {Record<string,string>} fields  already filtered to catalog fields
 * @param {Buffer} masterKey
 * @returns {{ ciphertext: string, iv: string, authTag: string, keyVersion: number }}
 */
function encryptFields(storageIntegration, fields, masterKey);

/**
 * @param {string} storageIntegration
 * @param {{ ciphertext: string, iv: string, authTag: string, keyVersion: number }} record
 * @param {Buffer} masterKey
 * @returns {Record<string,string>}
 * @throws IntegrationCryptoError("unreadable_credential")
 */
function decryptFields(storageIntegration, record, masterKey);
```

Envelope and AAD:

- Plaintext is `JSON.stringify({ v: 1, fields })`.
- AAD is `edtsp:integration:<storageIntegration>:v<keyVersion>`.
- Key parsing accepts 44-character base64 or 64-character hex that decodes to exactly 32 bytes; anything else throws `encryption_not_configured`.
- Error messages never include the key, plaintext, ciphertext, or provider payload. Decrypt failures are wrapped with `cause` for server logs only.
- `keyVersion` is written from the crypto constant; it is not accepted from request input.
- `IntegrationCryptoError` carries `code` and `httpStatus` (`503` for config, `500` for unreadable).

#### Catalog API

```js
// backend/lib/integrations/catalog.js
const CARD_INTEGRATIONS = ["google-auth", "brevo", "google-calendar", "google-sheets", "recaptcha"];
const STORAGE_INTEGRATIONS = ["google-auth", "google-oauth", "brevo", "google-calendar", "recaptcha"];
const FIELD_MAX_LENGTH = 512;

/** @returns {object|null} definition for a card key */
function getDefinition(card);

/** @returns {{ name, env, storage?, setting?, maxLength }|null} */
function getFieldDefinition(card, fieldName);

/** @returns {string[]} required field names for Save/Test */
function getRequiredFields(card);

/** @returns {Array<{ storageIntegration: string, fields: string[] }>} ordered write targets */
function getStorageTargets(card);

/** @returns {{ ok: boolean, errors: Array<{field: string, code: string}> }} */
function validateFieldNames(card, fields);
```

Definition shape, with Google Calendar shown:

```js
"google-calendar": {
  fields: {
    clientId: { env: "GOOGLE_CALENDAR_CLIENT_ID", storage: "google-oauth" },
    clientSecret: { env: "GOOGLE_CALENDAR_CLIENT_SECRET", storage: "google-oauth" },
    calendarId: { env: "GOOGLE_CALENDAR_ID", storage: "google-calendar" },
  },
  required: ["clientId", "clientSecret", "calendarId"],
  sharedWith: ["google-sheets"],
}
```

`recaptcha.siteKey` uses `{ env: "RECAPTCHA_SITE_KEY", setting: "recaptchaSiteKey" }` instead of `storage`. Unknown field names are rejected with code `unknown_field`; missing required names with `missing_field`; non-string values or values over `maxLength` with `invalid_field`.

#### Resolver API

```js
// backend/lib/integrationCredentials.js

/**
 * @typedef {object} ResolvedField
 * @property {string|null} value
 * @property {"database"|"environment"|"none"} source
 * @property {boolean} readable
 * @property {string|null} code
 */

/** @returns {Promise<ResolvedField>} */
async function resolveField(card, fieldName, { env = process.env } = {});

/**
 * @returns {Promise<{
 *   fields: Record<string, ResolvedField>,
 *   complete: boolean,
 *   unreadable: boolean,
 *   missing: string[]
 * }>}
 */
async function resolveIntegration(card, { env = process.env } = {});

/**
 * Merge candidate values over resolved values for Test/Save.
 * Candidates are trimmed, limited to catalog fields, and never include read-only values.
 * @returns {Promise<{
 *   values: Record<string,string>,
 *   sources: Record<string, "database"|"environment"|"candidate">,
 *   missing: string[],
 *   unreadable: boolean,
 *   errors: Array<{ field: string, code: string }>
 * }>}
 */
async function resolveForValidation(card, candidates, { env = process.env } = {});

/** Runtime accessor: throws CredentialUnavailableError when unresolved. */
async function requireField(card, fieldName, { env = process.env } = {});

/** Metadata for GET /api/system-settings; contains no values. */
async function getMetadata(card, { env = process.env } = {});

/** Validate + encrypt + upsert. Used only after provider validation succeeds. */
async function saveOverride({ card, fields, adminId, env = process.env });

/** Delete database overrides so env resolution resumes. */
async function clearOverride(card, { env = process.env } = {});
```

Resolution semantics:

- For encrypted fields, a missing `IntegrationCredential` document allows env fallback. If the document exists but the field is absent, the field is `value: null, source: "database", code: "not_configured"` and does **not** fall back to env.
- A decrypt/config failure yields `value: null, source: "database", readable: false, code: "unreadable_credential"`.
- `recaptcha.siteKey` reads `SystemSettings.recaptchaSiteKey`; an empty setting falls back to `RECAPTCHA_SITE_KEY`, unlike encrypted docs where document presence blocks fallback.
- Candidate values are trimmed; an empty string is treated as omitted and resolves from storage/env. Removing a value requires `DELETE`, not an empty Save.
- Required completeness is checked **after** candidates are merged with resolved values, so a masked field left blank keeps its stored value during Test/Save.
- `complete` is true when every required field has a non-null value and is readable.
- Metadata returns `{ integration, configured, complete, fields: [{ name, configured, source, readable }], lastValidation }`, with `stale` computed by `integrationStatus`.
- Values are decrypted per call and never cached; the parsed master key may be memoized by raw env string.

Save ordering:

1. Reject unknown field names and non-string/oversized values.
2. Confirm encryption is configured; otherwise throw `encryption_not_configured`.
3. Merge candidates over existing database/env values, then check required completeness.
4. Encrypt each target map separately.
5. Upsert shared storage first (`google-oauth`), then the card-specific record (`google-calendar`); for `recaptcha`, write the encrypted secret and `SystemSettings.recaptchaSiteKey` in the same save. A failure throws `credential_write_failed`; a retry is idempotent.
6. Audit/status writes belong to the Phase 3 controller.
7. Return `getMetadata(card)`.

Clear semantics:

- `google-calendar` clears both `google-calendar` and `google-oauth`.
- `google-sheets` clears `google-oauth` only.
- `recaptcha` clears its encrypted record and resets `recaptchaSiteKey` to `""`.
- Other cards clear their single storage record.
- Clear requires encryption to be configured (consistent with the interview decision) and returns which storage keys were removed.

#### Status and audit helpers

```js
// backend/lib/integrationStatus.js
async function getValidationStatus(card);
async function upsertValidationStatus({ card, valid, state, code, message, checkedAt = new Date(), credentialUpdatedAt = null });
async function resetValidationStatus(card, state = "not_configured");

// backend/lib/integrationAudit.js
async function recordAudit({ card, action, outcome, code, admin, ip });
```

- `recordAudit` accepts `admin: { id, email }`, truncates bounded strings, swallows write failures after logging, and never accepts a payload/metadata object that could carry a secret.
- `credentialUpdatedAt` for a card comes from the newest `updatedAt` among its storage groups: Calendar uses `max(google-oauth.updatedAt, google-calendar.updatedAt)`; Sheets uses `google-oauth.updatedAt` only.
- `upsertValidationStatus` is the only writer; it sets `valid = state === "valid"`.

#### Runtime call-site contract (wired in Phase 3)

| Consumer | Field | Missing/unreadable behavior |
| --- | --- | --- |
| `backend/lib/mailer.js` | `brevo.apiKey` | Return `{ sent: false, error }`; never throw to the request |
| `backend/utils/recaptcha.js` | `recaptcha.secretKey` | Return `false` |
| `backend/utils/googleAuth.js` | `google-auth.clientId` | Throw a typed unavailable error; caller already surfaces auth failure |
| `backend/lib/googleConnection.js` | Calendar/Sheets `clientId`, `clientSecret`, `calendarId` | Throw `not_configured` / `unreadable_credential` integration errors |
| `backend/controllers/systemSettingsController.js` | `recaptcha.siteKey` | Return `""`; frontend keeps its hardcoded fallback |

`googleAuth.js` currently constructs `new OAuth2Client(process.env.GOOGLE_CLIENT_ID)` at module load; Phase 3 must make that lazy and per-call so a saved override applies without restart.

#### Phase 1 test list

- Crypto: round-trip per storage group; distinct IVs; wrong AAD; wrong key version; tampered ciphertext/tag; missing, malformed, base64/hex key parsing; error messages contain no payload.
- Catalog: every card field maps to exactly one target; required lists match §3; unknown/missing/oversized values rejected.
- Resolver: database > env; absent field in an existing document does not fall back; unreadable document does not fall back; empty site-key setting falls back; metadata contains no values.
- Save: Google write order; duplicated save is idempotent; `updatedBy` set; `keyVersion` 1; clear removes the documented keys; clear without encryption fails 503.
- Status/audit: staleness flips when `google-oauth.updatedAt` advances; audit TTL index exists; audit rows reject/ignore extra fields.
- Regression: existing backend suite passes with no route or UI changes.

**Review checkpoint:** model fields and indexes approved; crypto envelope and error codes approved; resolver return shapes frozen for Phase 2/3; shared `google-oauth` storage confirmed; fail-closed behavior demonstrated; no secret appears in logs or test output.

### Phase 2 — Provider validators

**Goal:** a pure validation service that tests candidate credentials and reports stable codes, with no persistence and no provider mutations.

#### Boundary rules

- Validators receive a resolved `values` map from Phase 1 and a `context`; they never read models, env, or the request.
- Validators never write credentials, statuses, or audit rows. Phase 3 owns all persistence.
- Only `POST https://oauth2.googleapis.com/token` and read-only provider `GET`s are allowed. No email sends, event creation, file creation, or challenge submission.
- Refresh tokens are supplied through `context.refreshToken`; they are never part of `values` and never accepted from the request body.
- Every validator returns a result; unexpected errors are caught by the registry and mapped to `provider_error`.

#### File map

| File | Responsibility |
| --- | --- |
| `backend/lib/integrations/result.js` | Result types, builders, fixed messages, safe check summaries |
| `backend/lib/integrations/http.js` | `fetchProvider`, JSON parsing, AbortSignal timeout, transport error codes |
| `backend/lib/integrations/googleScopes.js` | Required scope sets shared with `googleConnection` in Phase 3 |
| `backend/lib/integrations/googleToken.js` | Client-pair probe with a dummy code and refresh-token exchange |
| `backend/lib/integrations/validators/brevo.js` | Brevo account probe |
| `backend/lib/integrations/validators/googleAuth.js` | Client ID shape + pair probe |
| `backend/lib/integrations/validators/googleCalendar.js` | Pair/token + Calendar read |
| `backend/lib/integrations/validators/googleSheets.js` | Pair/token + Drive read |
| `backend/lib/integrations/validators/recaptcha.js` | Presence + format checks |
| `backend/lib/integrations/index.js` | Validator registry and `validateIntegration` wrapper |
| `backend/tests/fixtures/integrationValidation.js` | Shared fake values, provider responses, and expected results |

#### Shared result contract

```js
// backend/lib/integrations/result.js

/**
 * @typedef {object} ValidationCheck
 * @property {"credentials"|"token"|"scope"|"read"} step
 * @property {boolean} ok
 * @property {string} code
 */

/**
 * @typedef {object} ValidationResult
 * @property {boolean} valid
 * @property {"valid"|"invalid"|"awaiting_connection"} state
 * @property {string} code
 * @property {string} message
 * @property {Date} checkedAt
 * @property {ValidationCheck[]} checks
 */

/** @returns {ValidationResult} */
function validResult({ checks = [], message, now = new Date() });

/** @returns {ValidationResult} */
function invalidResult({ code, message, checks = [], now = new Date() });

/** @returns {ValidationResult} valid=false, state="awaiting_connection" */
function awaitingConnectionResult({ checks = [], message, now = new Date() });
```

Rules:

- `valid` is true only when `state === "valid"`.
- `awaiting_connection` is save-eligible: Phase 3 accepts it only for Calendar/Sheets pair-only saves.
- `checks` contain only step names, booleans, and codes. No URLs with tokens, headers, provider bodies, account emails, or scopes are returned.
- Messages come from a fixed `MESSAGES` map in `result.js`; provider text is never echoed.
- `checkedAt` is a `Date`; the controller serializes it.

#### Validator contract

```js
// each validator module (CommonJS)
async function validate({ values, context = {} });
module.exports = { validate };
```

```js
/**
 * @typedef {object} ValidationContext
 * @property {string} [refreshToken]   Existing Google token, from googleConnection
 * @property {string[]} [scopes]       Granted scopes when already known
 * @property {string} [redirectUri]    Redirect URI used only for the dummy-code probe
 * @property {string} [dummyCode]      Deterministic code for tests; defaults to a random UUID
 * @property {typeof fetch} [fetchImpl] Injected fetch for fixture tests
 * @property {number} [timeoutMs]      Defaults to 8000
 * @property {() => Date} [now]        Clock for tests
 */
```

`values` contains only the card's catalog fields, already merged with stored/env values by Phase 1. For Calendar/Sheets, `values.clientId`, `values.clientSecret`, and (Calendar) `values.calendarId` are present.

#### Registry

```js
// backend/lib/integrations/index.js
const VALIDATORS = Object.freeze({
  "google-auth": validateGoogleAuth,
  brevo: validateBrevo,
  "google-calendar": validateGoogleCalendar,
  "google-sheets": validateGoogleSheets,
  recaptcha: validateRecaptcha,
});

/**
 * Never throws.
 * @returns {Promise<ValidationResult>}
 */
async function validateIntegration(card, { values, context = {} });
```

- Unknown card → `invalidResult({ code: "unknown_integration" })`.
- Any thrown error → `invalidResult({ code: "provider_error" })`; the cause is logged server-side without secrets.
- Registry performs no catalog or database access; the caller passes `values`.

#### HTTP helper

```js
// backend/lib/integrations/http.js
class ProviderTransportError extends Error {
  constructor(code, message, options); // code: timeout | network_error | provider_error
}

/**
 * @returns {Promise<{ status: number, body: unknown, headers: Headers }>}
 * @throws {ProviderTransportError}
 */
async function fetchProvider(url, {
  method = "GET",
  headers = {},
  body,
  timeoutMs = 8000,
  fetchImpl = fetch,
} = {});
```

- Uses `AbortSignal.timeout(timeoutMs)`; an abort maps to `timeout`.
- DNS/TLS/connection failures map to `network_error`.
- A 2xx response with invalid JSON maps to `provider_error`.
- The helper never logs request headers or bodies.

#### Google token helpers

```js
// backend/lib/integrations/googleToken.js

/**
 * Verify a client ID/secret pair without a real authorization code.
 * @returns {Promise<{ ok: true } | { ok: false, code: string }>}
 */
async function verifyClientPair({
  clientId,
  clientSecret,
  redirectUri,
  dummyCode,
  fetchImpl,
  timeoutMs,
});

/**
 * @returns {Promise<
 *   { ok: true, accessToken: string, scopes: string[] } |
 *   { ok: false, code: string }
 * >}
 */
async function refreshAccessToken({
  clientId,
  clientSecret,
  refreshToken,
  fetchImpl,
  timeoutMs,
});
```

Pair probe request fixture:

```http
POST https://oauth2.googleapis.com/token
Content-Type: application/x-www-form-urlencoded

grant_type=authorization_code
&code=edtsp-validation-<uuid>
&client_id=<candidate>
&client_secret=<candidate>
&redirect_uri=<context.redirectUri || http://localhost>
```

The Phase 3 controller supplies `redirectUri` from `GOOGLE_CALENDAR_REDIRECT_URI`, defaulting to `http://localhost`; validators never read env directly.

Pair probe mapping:

| Google response | Meaning | Code |
| --- | --- | --- |
| `200` | Unexpected but acceptable | `ok` |
| `401 {"error":"invalid_client"}` | Bad client ID/secret | `invalid_credentials` |
| `400 {"error":"unauthorized_client"}` | Client cannot use this grant | `invalid_credentials` |
| `400 {"error":"invalid_grant"}` | Client authenticated; dummy code rejected | pass |
| `400 {"error":"redirect_uri_mismatch"}` | Client authenticated; redirect not registered | pass |
| `400 {"error":"invalid_request"}` | Malformed client/probe configuration | `invalid_credentials` |
| `429` / `5xx` | Provider unavailable | `provider_error` |
| abort / network failure | No answer | `timeout` / `network_error` |

Refresh request fixture:

```http
POST https://oauth2.googleapis.com/token
Content-Type: application/x-www-form-urlencoded

grant_type=refresh_token
&client_id=<candidate>
&client_secret=<candidate>
&refresh_token=<context.refreshToken>
```

Refresh mapping:

| Google response | Code |
| --- | --- |
| `200` with `access_token` | success; parse `scope` if present |
| `401 invalid_client` | `invalid_credentials` |
| `400 invalid_grant` | `needs_reconnect` |
| `400 invalid_request` | `provider_error` |
| `429` / `5xx` | `provider_error` |
| abort / network failure | `timeout` / `network_error` |

Scope sets (`googleScopes.js`, unchanged from current behavior):

- Calendar: `https://www.googleapis.com/auth/calendar.events`.
- Sheets: any of `.../spreadsheets`, `.../drive.file`, `.../drive`.
- If the token response omits `scope`, skip the precheck and let the read call report `missing_scope`.

#### Provider probes and fixtures

Each fixture supplies `values`, a mocked response, and the expected `{ state, code }`. Tests inject `fetchImpl` and assert the request URL, method, headers, and body before returning the fixture.

Fixture module shape (values are fake and safe to commit):

```js
// backend/tests/fixtures/integrationValidation.js
module.exports = {
  brevo: {
    values: { apiKey: "xkeysib-test-only" },
    valid: {
      response: { status: 200, body: { email: "ops@example.com" } },
      expected: { state: "valid", code: "ok" },
    },
    unauthorized: {
      response: { status: 401, body: { code: "unauthorized", message: "Key not found" } },
      expected: { state: "invalid", code: "invalid_credentials" },
    },
  },
  googleToken: {
    refreshSuccess: {
      response: {
        status: 200,
        body: {
          access_token: "ya29.test-only",
          expires_in: 3599,
          scope: "https://www.googleapis.com/auth/calendar.events",
        },
      },
      expected: { state: "valid", code: "ok" },
    },
    refreshInvalidClient: {
      response: { status: 401, body: { error: "invalid_client" } },
      expected: { state: "invalid", code: "invalid_credentials" },
    },
    refreshInvalidGrant: {
      response: { status: 400, body: { error: "invalid_grant" } },
      expected: { state: "invalid", code: "needs_reconnect" },
    },
  },
  // googleAuth, googleCalendar, googleSheets, and recaptcha follow the same shape.
};
```

**Brevo**

```http
GET https://api.brevo.com/v3/account
api-key: <values.apiKey>
accept: application/json
```

| Fixture | Mock response | Expected |
| --- | --- | --- |
| `valid` | `200 { "email": "ops@example.com" }` | `valid`, `ok` |
| `unauthorized` | `401 { "code": "unauthorized", "message": "Key not found" }` | `invalid`, `invalid_credentials` |
| `forbidden` | `403 { "code": "permission_denied" }` | `invalid`, `invalid_credentials` |
| `outage` | `503 { "message": "unavailable" }` | `invalid`, `provider_error` |
| `timeout` | no response / abort | `invalid`, `timeout` |

**Google Authentication**

1. Reject a client ID that does not end in `.apps.googleusercontent.com` → `format_invalid` without a network call.
2. Run `verifyClientPair` with the candidate pair.

| Fixture | Mock response | Expected |
| --- | --- | --- |
| `validPair` | `400 { "error": "invalid_grant" }` | `valid`, `ok` |
| `validWithRedirectComplaint` | `400 { "error": "redirect_uri_mismatch" }` | `valid`, `ok` |
| `invalidPair` | `401 { "error": "invalid_client" }` | `invalid`, `invalid_credentials` |
| `badFormat` | no call | `invalid`, `format_invalid` |

**Google Calendar**

1. If `context.refreshToken` is missing: run `verifyClientPair`; on success return `awaiting_connection`, on failure return `invalid_credentials`.
2. Otherwise run `refreshAccessToken`, check the Calendar scope, then read:

```http
GET https://www.googleapis.com/calendar/v3/calendars/<encodeURIComponent(calendarId)>/events?maxResults=1&fields=items(id)
Authorization: Bearer <access_token>
```

| Fixture | Mock response | Expected |
| --- | --- | --- |
| `valid` | refresh `200` + events `200 { "items": [] }` | `valid`, `ok` |
| `pairOnly` | no token; probe `400 invalid_grant` | `awaiting_connection`, `awaiting_connection` |
| `badPair` | no token; probe `401 invalid_client` | `invalid`, `invalid_credentials` |
| `badToken` | refresh `400 invalid_grant` | `invalid`, `needs_reconnect` |
| `missingScope` | refresh `200` with scope lacking `calendar.events` | `invalid`, `missing_scope` |
| `missingScopeAtRead` | refresh `200` without scope; events `403 { "error": { "errors": [{ "reason": "insufficientPermissions" }] } }` | `invalid`, `missing_scope` |
| `apiDisabled` | events `403 { "error": { "status": "PERMISSION_DENIED", "message": "Google Calendar API has not been used in project ..." } }` | `invalid`, `api_disabled` |
| `badCalendar` | events `404 { "error": { "code": 404, "errors": [{ "reason": "notFound" }] } }` | `invalid`, `invalid_calendar_id` |
| `expiredAtRead` | events `401` | `invalid`, `needs_reconnect` |
| `outage` | events `500` | `invalid`, `provider_error` |

**Google Sheets**

1. Missing token → pair probe → `awaiting_connection` or `invalid_credentials` as above.
2. Otherwise refresh, check the Sheets scope, then read:

```http
GET https://www.googleapis.com/drive/v3/files?pageSize=1&fields=files(id)
Authorization: Bearer <access_token>
```

| Fixture | Mock response | Expected |
| --- | --- | --- |
| `valid` | refresh `200` + files `200 { "files": [] }` | `valid`, `ok` |
| `badToken` | refresh `400 invalid_grant` | `invalid`, `needs_reconnect` |
| `missingScope` | refresh scope lacking spreadsheets/drive | `invalid`, `missing_scope` |
| `apiDisabled` | files `403 { "error": { "errors": [{ "reason": "accessNotConfigured" }] } }` | `invalid`, `api_disabled` |
| `expiredAtRead` | files `401` | `invalid`, `needs_reconnect` |
| `outage` | files `503` | `invalid`, `provider_error` |

Limitation to document in the result message and README: no spreadsheet ID is configured, so Sheets validation proves the OAuth pair, token, Drive access, and granted spreadsheet scope — not that the Sheets API itself is enabled. The same limitation is stated in §7 and §18.

**reCAPTCHA**

No network call.

| Fixture | Values | Expected |
| --- | --- | --- |
| `valid` | secret `6L`/`6A` + 40 chars; site key `6L`/`6A` + 40 chars | `valid`, `ok` |
| `missingSiteKey` | secret only | `invalid`, `site_key_missing` |
| `badSecretShape` | secret too short/wrong prefix | `invalid`, `format_invalid` |
| `badSiteKeyShape` | site key too short/wrong prefix | `invalid`, `format_invalid` |

#### Fixed messages

| Code | Message |
| --- | --- |
| `ok` | Provider-specific success, e.g. "Brevo accepted this API key." |
| `format_invalid` | "This value does not match the provider's expected key format." |
| `site_key_missing` | "Enter both the reCAPTCHA site key and secret key." |
| `invalid_credentials` | Provider-specific rejection, e.g. "Google rejected this client ID or secret." |
| `needs_reconnect` | "The saved Google connection expired or was revoked. Reconnect Google, then validate again." |
| `missing_scope` | "The Google connection is missing the permission this integration needs. Reconnect Google and approve it." |
| `invalid_calendar_id` | "That calendar ID could not be read with the connected Google account." |
| `api_disabled` | "The required Google API is not enabled for this project." |
| `network_error` | "The provider could not be reached. Nothing was saved." |
| `timeout` | "The provider did not answer within 8 seconds. Nothing was saved." |
| `provider_error` | "The provider returned an unexpected response. Nothing was saved." |
| `awaiting_connection` | "OAuth credentials are valid. Connect Google to finish validation." |

#### Verification

- Fixture-driven tests for every row above, asserting the exact request shape and resulting `{ state, code }`.
- Timeout and network failures injected through `fetchImpl`; assert no save/status/audit calls occur.
- Registry tests: unknown card and thrown validator errors map to `unknown_integration` / `provider_error` without leaking `error.message`.
- Pair-only Calendar/Sheets receives no refresh token and returns `awaiting_connection` only when the pair probe passes.
- Scope parsing handles absent, empty, and space-separated `scope` values.
- Result invariants: no result contains a token, API key, client secret, request header, response body, or email address.
- Confirm the dummy-code mapping against a real OAuth client once; adjust §7/§18 if Google differs.

**Review checkpoint:** result contract and validator signatures frozen for Phase 3; every fixture maps to a §10 code; no validator can write data; timeout behavior demonstrated; Google Auth probe mapping confirmed against a real client.

### Phase 3 — API routes and settings metadata

**Goal:** expose test, save, clear, audit, and credential metadata through admin-only endpoints, with the public site key.

#### File map

| File | Responsibility |
| --- | --- |
| `backend/controllers/integrationCredentialController.js` | `buildIntegrationMetadata`, `testIntegration`, `saveIntegration`, `clearIntegration`, `listAudit` |
| `backend/routes/systemSettingsRoutes.js` | Three new write routes, one audit read route, public site key |
| `backend/controllers/systemSettingsController.js` | Include metadata in `GET /`; include site key in `GET /public` |
| `backend/middleware/rateLimiters.js` | `integrationValidationLimiter` (20/15m per admin, IP fallback) |
| `backend/controllers/googleCalendarController.js` | Post-connect validation hook |
| `backend/lib/mailer.js`, `backend/utils/recaptcha.js`, `backend/utils/googleAuth.js`, `backend/lib/googleConnection.js` | Resolver switch |

#### Controller signatures

```js
// backend/controllers/integrationCredentialController.js

/**
 * Build metadata for all five cards; used by GET /api/system-settings.
 * @returns {Promise<Record<string, IntegrationMetadata>>}
 */
async function buildIntegrationMetadata();

/**
 * POST /api/system-settings/integrations/:integration/test
 * Always 200 for a completed validation, including invalid results.
 */
async function testIntegration(req, res);

/**
 * PUT /api/system-settings/integrations/:integration
 * 200 only after the credential write commits; 422/409/503/500 otherwise.
 */
async function saveIntegration(req, res);

/**
 * DELETE /api/system-settings/integrations/:integration
 * Idempotent; removes database overrides and resets affected statuses.
 */
async function clearIntegration(req, res);

/**
 * GET /api/system-settings/integrations/audit?limit=&before=
 */
async function listAudit(req, res);
```

Shared helpers in the same file:

```js
function parseFieldsBody(body);          // { ok, fields } | { ok:false, code, message, field? }
function sendError(res, status, code, message, extra = {}); // { success:false, integration?, code, message }
function serializeValidation(result);    // { valid, state, code, message, checkedAt, checks }
```

Handlers catch all errors, log only `error.stack`/`error.code`, and never log `req.body` or resolved values.

#### Route and middleware order

```js
// backend/routes/systemSettingsRoutes.js
router.get("/public", getPublicSystemSettings);
router.get("/", protect, adminOnly, getSystemSettings);
router.get("/integrations/audit", protect, adminOnly, listAudit);
router.post(
  "/integrations/:integration/test",
  apiWriteLimiter,
  protect,
  adminOnly,
  integrationValidationLimiter,
  testIntegration,
);
router.put(
  "/integrations/:integration",
  apiWriteLimiter,
  protect,
  adminOnly,
  integrationValidationLimiter,
  saveIntegration,
);
router.delete(
  "/integrations/:integration",
  apiWriteLimiter,
  protect,
  adminOnly,
  integrationValidationLimiter,
  clearIntegration,
);
```

Order rules:

- `apiWriteLimiter` stays before auth to match the existing route convention; it keys by endpoint and IP.
- `integrationValidationLimiter` runs **after** `adminOnly` so it can key by `req.user.id`, falling back to IP only when the id is absent.
- The audit read route is registered before any future `GET /integrations/:integration` route; the current design has no such route.
- Existing `GET /` and `GET /public` middleware order is unchanged.
- `express.json()` is already global; no route-specific body parser is added.

Limiter configuration:

```js
const integrationValidationLimiter = createLimiter({
  windowMs: 15 * MINUTE,
  limit: 20,
  prefix: "integration-validation",
  message: "Too many integration validations. Please wait 15 minutes and try again.",
  keyGenerator: (req) => `admin:${req.user && req.user.id ? req.user.id : clientIp(req)}`,
});
```

#### Request parsing

`parseFieldsBody` rules:

- `req.body` must be a plain object; `fields` must be a plain object, not an array or null.
- A missing `fields` object is treated as `{}` (valid for Test when stored/env values are complete; Save then relies on resolved values).
- Only catalog field names are accepted; anything else returns `400 unknown_field` with the offending field name.
- Values must be strings; trim whitespace, omit empty strings, and reject non-empty values over 512 characters.
- `refreshToken`, `accessToken`, `scopes`, and any non-catalog keys are rejected as `unknown_field`.
- No coercion of numbers/booleans; `400 invalid_field`.

#### Test flow

1. `assertCardKey(req.params.integration)` → `400 unknown_integration` if absent.
2. `parseFieldsBody` → `400` on malformed input.
3. `resolveForValidation(card, fields)`:
   - Field errors → `400`.
   - Unreadable and all required values not supplied → `409 unreadable_credential`.
4. `validateIntegration(card, { values, context })` with `context = { refreshToken, scopes, redirectUri, now }`:
   - `refreshToken`/`scopes` come from `googleConnection.readConnection()` for Google cards.
   - `redirectUri` comes from `GOOGLE_CALENDAR_REDIRECT_URI`, defaulting to `http://localhost`.
5. Audit `action: "test"`, outcome from `result.valid`, code `result.code`; audit failure does not change the response.
6. Return `200` with `{ success: true, ...serializeValidation(result) }`.
7. Never write credentials or `IntegrationValidationStatus`.

#### Save flow and transaction boundaries

No MongoDB multi-document transaction is used: the project runs on standalone MongoDB in development and tests, where transactions are unavailable. The commit point is "all credential storage writes succeeded"; everything after it is best-effort.

1. **Auth/input:** card key, body parsing, catalog checks → `400`.
2. **Encryption precondition:** `encryptionConfigured()` must be true → else `503 encryption_not_configured` **before** any provider call.
3. **Resolve:** `resolveForValidation(card, fields)` merges candidates over stored/env values. If an unreadable record exists and any required value is missing → `409 unreadable_credential`; if all required values are supplied, the save may overwrite the unreadable record.
4. **Validate:** `validateIntegration` with the same context as Test.
   - `state: "invalid"` → `422` with the result code/message, audit `failure`, no writes.
   - `state: "awaiting_connection"` is accepted only for `google-calendar`/`google-sheets`; any other card treats it as `422`.
   - `valid: true` proceeds.
5. **Snapshot:** read the current `IntegrationCredential` documents and `SystemSettings.recaptchaSiteKey` for every storage key the save will touch.
6. **Write credentials:** `saveOverride({ card, fields: resolvedValues, adminId })` in this order:
   - `recaptcha`: encrypted secret, then `SystemSettings.recaptchaSiteKey`.
   - `google-calendar`: `google-oauth` shared pair, then `google-calendar.calendarId`.
   - `google-sheets`: `google-oauth` only.
   - Others: one record.
7. **Commit failure:** if any write fails, attempt a best-effort restore of the snapshotted documents in reverse order, audit `failure` with `credential_write_failed`, and return `500`. If the restore also fails, log it; the retry path is idempotent. Never return success.
8. **Status:** upsert the card status to `valid` or `awaiting_connection`, with `credentialUpdatedAt` from the newest committed storage record's `updatedAt` (Phase 1 metadata helper). A status failure is logged but does not turn the save into an error.
9. **Audit:** record `action: "save"`, `outcome: "success"`, `code: result.code`; audit failure is logged and ignored.
10. **Response:** `200 { success: true, integration: metadata }`, where `metadata` is the single-card shape from §8.

Concurrency and retries:

- `findOneAndUpdate({ integration }, ..., { upsert: true, returnDocument: "after" })` is the write primitive.
- A duplicate-key error from two simultaneous first saves is retried once; if it still fails, `credential_write_failed`.
- Last successful save wins; both attempts are audited. No optimistic-version check is added for credentials.
- Provider validation runs outside any database lock and never holds a transaction open.

#### Clear flow

1. Require `encryptionConfigured()` → `503` otherwise.
2. `clearOverride(card)` deletes the documented storage keys:
   - `google-calendar` → `google-oauth` + `google-calendar`.
   - `google-sheets` → `google-oauth`.
   - `recaptcha` → encrypted record + `recaptchaSiteKey = ""`.
   - Others → their record.
3. Reset statuses:
   - `google-oauth` clear resets both Google cards to `unverified`.
   - `recaptcha` clear sets `not_configured` if no env secret, else `unverified`.
   - Others use `not_configured`/`unverified` based on remaining env values.
4. Audit `action: "clear"`. A status/audit failure after deletion is logged; the clear still returns `200` because the credential removal committed.
5. Return `200 { success: true, clearedKeys, integrations: { ...affectedCardMetadata } }`.
6. Clearing when nothing is stored is a successful no-op with `clearedKeys: []`.

#### Audit listing

- Parse `limit` as an integer 1–100 (default 20) and `before` as an ISO date.
- Invalid values → `400 invalid_field`; do not silently clamp.
- Query `IntegrationAudit.find({ createdAt: { $lt: before } }).sort({ createdAt: -1 }).limit(limit + 1)`.
- Return `{ success: true, entries, nextBefore }`; `nextBefore` is the last entry's `createdAt` when `limit + 1` rows were found, otherwise `null`.
- Projection contains integration, action, outcome, code, adminId, adminEmail, ip, createdAt only.

#### Settings metadata and public site key

- `systemSettingsController.getSystemSettings` keeps the existing settings payload and adds `integrations: await buildIntegrationMetadata()`.
- `buildIntegrationMetadata` runs `getMetadata(card)` for all five cards with `Promise.all`; unreadable credentials are represented in metadata and do not throw.
- No metadata path returns a value, ciphertext, IV, tag, env value, refresh token, or provider response.
- `getPublicSystemSettings` adds `settings.recaptchaSiteKey`: database value, else `RECAPTCHA_SITE_KEY`, else `""`. It does not add integration metadata.

#### Runtime resolver switch

These changes are part of Phase 3 because database overrides only become writable now.

| File | Change |
| --- | --- |
| `backend/lib/mailer.js` | Replace `process.env.BREVO_API_KEY` with `resolveField("brevo", "apiKey")`; missing/unreadable returns `{ sent: false, error: code }` instead of throwing |
| `backend/utils/recaptcha.js` | Resolve `recaptcha.secretKey`; missing/unreadable returns `false` |
| `backend/utils/googleAuth.js` | Move `new OAuth2Client(...)` inside `verifyGoogleToken`; resolve `google-auth.clientId` per call; throw a typed error when unavailable |
| `backend/lib/googleConnection.js` | Make `getOAuthClient`, `isConfigured`, and `getCalendarId` async and resolver-backed; update every caller to await |
| `backend/lib/integrations/googleScopes.js` | Source of the required scope sets; `googleConnection` imports it instead of keeping a second copy |

`googleConnection` ripple to update explicitly: `getConnectionStatus`, `getAuthorizedClient`, `buildAuthUrl`, `exchangeCode`, `disconnect`, `googleCalendar.isConfigured`/`isEnabled` callers, and `googleCalendarController.getConnectUrl`. Keep the existing error codes and messages when a value is missing.

#### Post-connect validation

In `googleCalendarController.handleCallback`, after `exchangeCode(code)` succeeds:

1. Read `payload.adminId` from the verified OAuth state and resolve the admin email from `User` (select `email`).
2. Run `validateIntegration("google-calendar")` and `validateIntegration("google-sheets")` in parallel with `Promise.allSettled`, using resolved values and the newly stored refresh token; each is bounded by the validator's 8-second timeout.
3. Persist each fulfilled result with `upsertValidationStatus`; audit each as `action: "test"` using the admin as actor. If the admin email is unavailable, persist status but skip the audit row.
4. Catch/log everything; a failed validation must not block or change the redirect response. `finishAuthorization` runs after the settled results (or their timeouts).
5. Do not delete the token on `needs_reconnect`; only Calendar sync's existing behavior may do that.

#### HTTP error mapping

| Situation | Status | Code |
| --- | --- | --- |
| Bad card key | 400 | `unknown_integration` |
| Bad field name/value | 400 | `unknown_field` / `invalid_field` |
| Missing required value | 400 | `missing_field` |
| Unreadable record blocks resolution | 409 | `unreadable_credential` |
| Provider validation failed | 422 | result code |
| `awaiting_connection` on a non-Google card | 422 | `provider_error` |
| Encryption not configured | 503 | `encryption_not_configured` |
| Credential write/rollback failed | 500 | `credential_write_failed` |
| Unexpected controller error | 500 | `internal_error` |
| Validation rate limit | 429 | limiter message |

#### Verification

- Controller tests with fake `req`/`res`: success shapes, 400 parsing errors, 409 unreadable, 422 no writes, 503 with no provider call, 500 rollback, and status/audit failure still returning 200 after commit.
- Assert `saveOverride` receives resolved values, never raw `req.body`, and that `refreshToken` never appears in fields.
- Assert no audit/status writes occur on Test and no credential writes occur on failed validation.
- Metadata: all five cards present, no values, unreadable represented safely.
- Public settings: site key only; no secret or integration metadata.
- Audit pagination: limit bounds, `before` filtering, `nextBefore`, and ordering.
- Post-connect: both validators run in parallel, failures do not alter the redirect, statuses persist, audit actor is the admin.
- Middleware order verified by route inspection; manual `curl` matrix for 401, 403, 400, 409, 422, 429, 503, 500, and 200.
- Full backend suite passes.

**Review checkpoint:** endpoint contract matches §8 exactly; save commit point and rollback behavior approved; no secret appears in a response or log; runtime consumers still behave identically with env-only configuration.

### Phase 4 — Admin UI and public site key

**Goal:** the visible feature on the Settings page, plus dynamic reCAPTCHA site key delivery.

#### Files

| File | Change |
| --- | --- |
| `frontend/admin/settings.html` | Credential blocks, action/status regions, Google token state, audit panel |
| `frontend/js/admin-settings.js` | Metadata load, card state machine, Test/Save/Clear, audit paging, API error handling |
| `frontend/css/portal.css` | Integration card grid, fields, badges, status tones, audit table, mobile stacking |
| `frontend/js/auth.js` | Apply the public reCAPTCHA site key before loading the widget script |
| `frontend/login.html`, `frontend/signup.html` | Keep existing `data-sitekey` only as the empty-config fallback |

#### DOM structure

Each integration stays inside its existing `.panel`; the credential block is appended to the card's `.settings-option` and spans the full row. Brevo is the reference skeleton; the other cards repeat it with the field matrix below.

```html
<div
  class="settings-option settings-option--integration"
  id="integration-brevo"
  data-integration="brevo"
>
  <div class="settings-option__body">
    <strong>Brevo Email Notifications</strong>
    <p>Send welcome, application, and assessment emails to trainees.</p>
  </div>

  <div class="settings-option__side">
    <label class="settings-switch">
      <input type="checkbox" id="emailToggle" />
      <span class="settings-slider"></span>
    </label>
  </div>

  <div class="integration-credentials" data-credentials>
    <div class="integration-fields">
      <div class="field integration-field" data-field="apiKey">
        <label class="integration-field__label" for="integration-brevo-apiKey">
          API key
          <span class="source-badge" data-source="none">Not configured</span>
        </label>

        <div class="integration-field__control">
          <input
            class="integration-field__input"
            id="integration-brevo-apiKey"
            name="apiKey"
            type="password"
            autocomplete="new-password"
            spellcheck="false"
            autocapitalize="off"
            placeholder="Enter a new API key"
            aria-describedby="integration-brevo-apiKey-help"
            data-secret-input
          />
          <button
            class="btn btn--ghost btn--sm"
            type="button"
            data-toggle-visibility
            aria-pressed="false"
            aria-label="Show API key"
          >
            Show
          </button>
        </div>

        <p class="field-note integration-field__help" id="integration-brevo-apiKey-help">
          Sender identity is not validated.
        </p>
      </div>
    </div>

    <div class="integration-actions">
      <button class="btn btn--ghost btn--sm" type="button" data-action="test">Test</button>
      <button class="btn btn--primary btn--sm" type="button" data-action="save">Save</button>
      <button class="btn btn--ghost btn--sm" type="button" data-action="clear" hidden>
        Clear saved key
      </button>
    </div>

    <p class="integration-status" data-status role="status" aria-live="polite" data-state="unverified">
      Not validated yet.
    </p>
    <p class="integration-error" data-error role="alert" hidden></p>
  </div>
</div>
```

Field matrix:

| Card | Container ID | Fields (`data-field` / input ID suffix) | Extra |
| --- | --- | --- | --- |
| Google Authentication | `integration-google-auth` | `clientId`, `clientSecret` | — |
| Brevo | `integration-brevo` | `apiKey` | Sender helper |
| Google Calendar | `integration-google-calendar` | `clientId`, `clientSecret`, `calendarId` | Token state + Connect/Reconnect/Disconnect |
| Google Sheets | `integration-google-sheets` | `clientId`, `clientSecret` | Token state + Connect/Reconnect |
| reCAPTCHA | `integration-recaptcha` | `secretKey`, `siteKey` | Pairing helper |

Google token block, placed above `.integration-fields` on both Google cards:

```html
<div class="integration-token" data-token>
  <span class="integration-token__label">Google account</span>
  <strong data-token-account>Not connected</strong>
  <span class="integration-token__scopes" data-token-scopes></span>
</div>
```

IDs follow `integration-<card>-<field>`; help IDs follow `integration-<card>-<field>-help`. The Google cards keep their existing `googleCalendarConnectBtn`, `googleCalendarDisconnectBtn`, `googleSheetsConnectBtn`, toggles, and Connect/Disconnect handlers unchanged.

Clear-confirm dialog, following the logout modal pattern:

```html
<div
  class="admin-modal"
  id="integrationClearModal"
  data-portal-modal
  role="dialog"
  aria-modal="true"
  aria-labelledby="integrationClearTitle"
>
  <div class="admin-modal-content">
    <div class="modal-heading">
      <div>
        <h2 id="integrationClearTitle">Clear saved credentials?</h2>
        <p id="integrationClearCopy"></p>
      </div>
      <button class="modal-close" id="integrationClearClose" type="button" aria-label="Cancel">×</button>
    </div>
    <div class="modal-actions">
      <button class="btn btn--ghost" id="integrationClearCancel" type="button">Keep credentials</button>
      <button class="btn btn--primary" id="integrationClearConfirm" type="button">Clear credentials</button>
    </div>
  </div>
</div>
```

The title/copy are filled per card; the confirm button carries the card key in `data-integration` while the dialog is open.

Audit panel, appended after the closing `.grid--split` container so it spans the page width:

```html
<section class="panel" id="integrationAuditPanel">
  <header class="panel__head">
    <div>
      <h2>Integration activity</h2>
      <p>Credential tests, saves, clears, and failures from the last 12 months.</p>
    </div>
    <button
      class="btn btn--ghost btn--sm"
      type="button"
      id="integrationAuditToggle"
      aria-expanded="false"
      aria-controls="integrationAuditBody"
    >
      Show activity
    </button>
  </header>

  <div id="integrationAuditBody" hidden>
    <div class="table-wrap">
      <table class="data-table">
        <thead>
          <tr>
            <th scope="col">Time</th>
            <th scope="col">Integration</th>
            <th scope="col">Action</th>
            <th scope="col">Result</th>
            <th scope="col">Administrator</th>
            <th scope="col">IP</th>
          </tr>
        </thead>
        <tbody id="integrationAuditRows"></tbody>
      </table>
    </div>
    <p class="empty-state" id="integrationAuditEmpty" hidden>No integration activity yet.</p>
    <p class="integration-error" id="integrationAuditError" role="alert" hidden></p>
    <button class="btn btn--ghost btn--sm" type="button" id="integrationAuditMore" hidden>
      Load more
    </button>
  </div>
</section>
```

Layout/CSS additions:

- `.settings-option--integration` becomes a two-column grid; `.settings-option__body` and `.settings-option__side` place the existing title/toggle columns; `.integration-credentials` uses `grid-column: 1 / -1` and a top rule.
- `.integration-fields` is a one-column grid with 12px gaps; `.integration-field__control` is flex with the input growing. Existing `.field` / `.field-note` styles provide the control and help text; only layout additions are new.
- `.source-badge` variants: `Saved` (database), `Server env` (environment), `Not configured` (none).
- `.integration-status` tones via `data-state`: `unverified`, `valid`, `invalid`, `stale`, `awaiting`, `unreadable`, `busy`.
- `.integration-error` uses the existing error color and `role="alert"`.
- Below 720px, the card grid collapses to one column and actions wrap; no horizontal overflow.
- Reuse existing `.field`, `.field-note`, `.btn`, `.empty-state`, and `.data-table` styles; add only the integration-specific classes.

#### Card state model

```js
const cardState = {
  metadata: null,        // last GET metadata for this card
  dirty: false,          // any credential input edited since load/save
  busy: null,            // null | "test" | "save" | "clear"
  localResult: null,     // Test response, not persisted server-side
  error: null,           // { code, message, field? }
  rateLimitedUntil: 0,   // epoch ms from Retry-After
};
```

Per-card state machine:

| State | Event | Next state | UI effects |
| --- | --- | --- | --- |
| `loading` | metadata arrives | `ready` | Render fields, source badges, stored status |
| `loading` | metadata fails | `load-error` | Card error + retry link; inputs disabled |
| `ready` | input | `dirty` | Hide error, enable Test/Save, mark field dirty |
| `dirty` | Test | `testing` | Disable Test/Save/Clear; label "Testing…" |
| `testing` | `200 valid/invalid/awaiting` | `ready` | Set local status/result; keep inputs and dirty flag |
| `testing` | error | `ready` | Show card/field error; inputs kept |
| `dirty`/`ready` | Save | `saving` | Disable actions; label "Saving…" |
| `saving` | `200` | `ready` | Apply returned metadata, clear inputs, `dirty=false`, clear local result/error |
| `saving` | `400/409/422/429/500/503` | `dirty` | Show mapped error; keep inputs; metadata/status unchanged |
| `ready`/`dirty` | Clear | `clearing` | Confirm, then disable actions; label "Clearing…" |
| `clearing` | `200` | `ready` | Apply affected metadata, clear inputs, `dirty=false`, success message |
| `clearing` | error | prior state | Show mapped error |
| any | `429` | `rate-limited` | Disable actions until `Retry-After` elapses, then restore prior state |
| any | `401` | `auth-expired` | Clear stored token/user and redirect to `../login.html` after the message |

Rules:

- `busy` is a single slot per card; Test, Save, and Clear are mutually exclusive. Other cards stay usable.
- Inputs remain enabled while idle/dirty; the integration toggle is never disabled by credential activity.
- Test never changes the stored mask, source badge, or persisted status. Its result is shown locally until the next Test/Save or reload.
- Save start clears any local Test result, so a failed Save falls back to the persisted metadata status rather than a stale local check.
- Save success replaces metadata; the server is the source of truth for `source`, `configured`, `lastValidation`, and `stale`.
- A Save failure must not visually imply success: leave the previous status line intact and show the error region separately.
- `429` uses `Retry-After`; if absent, default to 60 seconds. The countdown is displayed on the disabled action row.
- `401` follows the existing page guard: remove `edtspToken`/`edtspUser` from local and session storage, then redirect.

#### Field rendering

- Inputs always start empty. Never assign a stored value or a masked value to `input.value`.
- Secret fields (`clientSecret`, `apiKey`, `secretKey`) use `type="password"` with a Show/Hide control. Non-secret fields (`clientId`, `calendarId`, `siteKey`) use `type="text"` and omit the visibility button.
- Placeholder by source:
  - `database`: "Saved — enter a new value to replace".
  - `environment`: "Using server env — enter a value to override".
  - `none`: "Enter a new <label>".
- `data-source` badge is per field and reflects the last server metadata, not the typed value.
- A typed field gets `.integration-field--dirty`; the badge still says where the stored value came from.
- Show/Hide toggles `type` between `password` and `text`, flips `aria-pressed`, and updates the button label. It only affects typed content; an empty field stays empty.
- `autocomplete="new-password"`, `spellcheck="false"`, and `autocapitalize="off"` are mandatory on secret inputs.
- Field help text:
  - Google Auth: "Used to verify the OAuth client. Sign-in still checks the client ID as the token audience."
  - Brevo: "Sender identity is not validated."
  - Calendar: "Calendar ID is validated against the connected Google account."
  - Sheets: "Uses the shared Google OAuth client; validation checks Drive access and spreadsheet scope."
  - reCAPTCHA: "Site key and secret key are checked for format only; pairing cannot be verified without a live challenge."

#### Status and stale rendering

`renderStatus(card)` priority:

1. `busy` → "Testing…" / "Saving…" / "Clearing…".
2. `error` → error region, status line remains the last known state.
3. `localResult` from Test → its state and message.
4. metadata `lastValidation`:
   - `valid` → "Validated <relative time>. <message>"
   - `invalid` → "Last check failed <relative time>. <message>"
   - `awaiting_connection` → "Awaiting Google connection. Connect Google to finish validation."
   - `unreadable_credential` → "Saved credential could not be read. Re-enter it or clear it."
   - `not_configured`/none → "Not validated yet."
5. `stale` overrides the timestamp text with "Credentials changed since this check — validate again."

Relative time uses `Intl.RelativeTimeFormat` with a fallback to a locale date string. Never include secret material in status text.

#### JavaScript structure

```js
// frontend/js/admin-settings.js
const INTEGRATIONS = {
  "google-auth": { fields: ["clientId", "clientSecret"], label: "Google Authentication" },
  brevo: { fields: ["apiKey"], label: "Brevo" },
  "google-calendar": { fields: ["clientId", "clientSecret", "calendarId"], label: "Google Calendar" },
  "google-sheets": { fields: ["clientId", "clientSecret"], label: "Google Sheets" },
  recaptcha: { fields: ["secretKey", "siteKey"], label: "reCAPTCHA" },
};

function applyIntegrationMetadata(metadataMap); // called from loadSettings with data.integrations
function applyMetadata(card, metadata);
function renderCard(card);
function renderStatus(card);
function setBusy(card, action);
function readFields(card);          // trimmed, non-empty only
function collectError(result);       // { status, code, message, field?, retryAfter }
function showCardError(card, error);
function clearCardError(card);
function handleAuthExpired();
async function testCard(card);
async function saveCard(card);
async function clearCard(card);
function toggleVisibility(input, button);
```

The existing `loadSettings()` response already includes `integrations`; it calls `applyIntegrationMetadata(data.integrations)` after applying the toggles, so no second GET is needed. Event wiring uses one delegated listener on each `[data-integration]` container for `input`, `click` on `[data-action]`, and `click` on `[data-toggle-visibility]`; no inline handlers.

#### API calls and error handling

```js
async function integrationFetch(path, { method = "GET", fields, signal } = {}) {
  // Authorization: Bearer token; JSON body { fields } when provided.
  // Returns { ok, status, data, retryAfter }.
  // Network failures throw; callers map them to a generic retry message.
}
```

Requests:

- `POST /api/system-settings/integrations/<card>/test` body `{ fields }`.
- `PUT /api/system-settings/integrations/<card>` body `{ fields }`.
- `DELETE /api/system-settings/integrations/<card>` no body.
- `GET /api/system-settings/integrations/audit?limit=20&before=<ISO>`.

`readFields` includes only non-empty trimmed values. Empty inputs are omitted so the server resolves stored/env values; this is what makes masked-field Save work.

Error mapping:

| Response | UI behavior |
| --- | --- |
| `401` | "Your session expired. Sign in again." → `handleAuthExpired()` |
| `403` | "Administrator access is required." |
| `400 unknown_field` / `invalid_field` | If `field` is present, put the message under that field and focus it; otherwise card error |
| `400 missing_field` | Card error listing the missing field labels |
| `400 unknown_integration` | Card error "This integration is not available." |
| `409 unreadable_credential` | Card error with "Enter all required values to replace it, or use Clear saved key." |
| `422` | Card error with the server `message`; status line keeps the previous stored result |
| `429` | "Too many validations. Try again in <n> seconds." Disable actions until the window elapses |
| `500 credential_write_failed` | "The credential could not be stored cleanly. Try again; if it keeps failing, re-enter the key." |
| `500 internal_error` | Generic retry message |
| `503 encryption_not_configured` | Card error "Credential saving is disabled because the server encryption key is not configured." |
| Network/abort | "The server could not be reached. Check your connection and try again." |
| Unparseable body | Fall back to a generic message; never render raw HTML |

Rendering rules:

- All server messages are inserted with `textContent`, never `innerHTML`.
- Error text is capped to a single line in the status area; long messages wrap in the error region.
- Field errors are cleared on the next input for that field.
- Save failure leaves the previous metadata/status visible and keeps the typed values.
- Test failure does not alter the persisted-status line; only the error region and any local invalid result appear.

#### Test, Save, Clear flows

Test:

1. `setBusy(card, "test")`; clear error.
2. `integrationFetch(testPath, { method: "POST", fields: readFields(card) })`.
3. On `200`: store `data` as `localResult`, render status, keep inputs/dirty, re-enable actions.
4. On error: map and show; keep inputs; re-enable.
5. If the audit panel has been loaded, refresh its first page.

Save:

1. `setBusy(card, "save")`; clear error.
2. `PUT` with `readFields(card)`.
3. On `200`: apply `data.integration` metadata, clear every input for the card, `dirty=false`, `localResult=null`, show "Saved and validated." in the status line, refresh audit if loaded.
4. On error: map and show; keep inputs and dirty; restore actions.
5. `awaiting_connection` success shows "Saved. Connect Google to finish validation."

Clear:

1. Show a `.admin-modal[data-portal-modal]` confirm dialog following the existing logout-modal pattern (not `window.confirm`), with copy that names the card and the env fallback; Google clears warn that the shared OAuth client affects both Google cards.
2. `DELETE`.
3. On `200`: apply each entry in `data.integrations`, clear inputs, `dirty=false`, show "Saved credentials cleared. Server environment values are used again." Refresh audit.
4. On error: close the dialog after confirmation, show the mapped error on the card, and return focus to the Clear button.

#### Audit panel behavior

```js
const auditState = { loaded: false, loading: false, entries: [], nextBefore: null, error: null };
```

- Toggle expands/collapses; first expansion triggers `loadAudit({ reset: true })`.
- `loadAudit` fetches `?limit=20` plus `before=nextBefore` for pagination; appends and dedupes by `_id`.
- Rows: local timestamp, integration label, action label (`Tested`/`Saved`/`Cleared`), outcome badge with code, admin email, IP.
- Empty state only after a successful empty load; error state includes a Retry button.
- "Load more" is hidden when `nextBefore` is null; disabled while loading.
- After a successful Test/Save/Clear, refetch the first page if the panel has already loaded, replacing entries and resetting `nextBefore`.
- No row ever contains a credential, masked value, ciphertext, or provider body.

#### Public reCAPTCHA site key

- `frontend/js/auth.js` already fetches `GET /api/system-settings/public`; after applying `recaptchaEnabled`, call `applyRecaptchaSiteKey(settings.recaptchaSiteKey)`.
- `applyRecaptchaSiteKey` finds every `.g-recaptcha` and, when the value is non-empty, sets `data-sitekey` before `loadRecaptchaScript()` runs.
- Empty value or fetch failure leaves the existing hardcoded `data-sitekey` in place; no page error is shown for a missing site key.
- `login.html`/`signup.html` keep their current attributes solely as that fallback; the script overwrites them when a database/env key exists.
- Changing the site key takes effect on the next page load; no live widget mutation is attempted.

#### Accessibility

- Every input has a visible `<label for>`; help and error text are referenced with `aria-describedby`.
- Status lines use `role="status"` + `aria-live="polite"`; errors use `role="alert"`.
- Busy buttons set `disabled` and `aria-busy="true"`; progress text is part of the button label.
- Focus moves to the first invalid field after a 400 field error; after a dialog closes, focus returns to the Clear button.
- Audit toggle maintains `aria-expanded`; the table has `scope="col"` headers.
- Color is never the only status signal; each state includes text.

#### Verification

- Manual, all five cards: source badges, placeholders, show/hide, Test invalid, Save rejection, corrected Save, Clear, env fallback, stale state.
- Provider-failure paths: wrong key (422), timeout/outage (422), missing encryption (503), unreadable record (409), rate limit (429), session expiry (401).
- Confirm inputs are empty after load and after Save; the DOM and network response never contain a stored value.
- Pair-only Google save shows "Awaiting Google connection"; after Connect Google, both cards update without a manual Test.
- Audit panel: first load, pagination, empty, error/retry, refresh after a write, no secrets in rows.
- Public site key: database value, env-only value, and empty fallback on login/signup.
- Keyboard-only pass and screen-reader labels; mobile layout at 360px and 720px.
- Existing toggles, settings save/rollback, and Google connect/disconnect regressions.

**Review checkpoint:** DOM and state machine approved; every API error maps to a safe message; no stored secret is displayable or inspectable in the client; mobile and keyboard behavior verified.

### Phase 5 — Hardening, tests, and documentation

**Goal:** close gaps found in review and make the feature maintainable.

**Work**

- Fill any missing tests from §13 (crypto, resolver, validators, routes, audit, site key).
- Run the full backend suite against a disposable MongoDB, as in the existing `TEST_MONGODB_URI` setup.
- Update `README.md` with the new env vars, key generation, precedence, endpoints, retention, and validation semantics.
- Document the operational recovery path: lost encryption key, undecryptable record, revoked Google token, missing site key.
- Confirm the Google Auth probe mapping with a real OAuth client and adjust §7/§18 if Google's response differs.
- Remove temporary scripts or probes used during verification.

**Review checkpoint:** acceptance criteria in §17 all checked; README matches the shipped API; known risks in §18 are either resolved or explicitly accepted.

### Sequencing and review boundaries

| Phase | Depends on | Can be reviewed independently | Visible change |
| --- | --- | --- | --- |
| 1 Storage/encryption | — | Yes | No |
| 2 Validators | Phase 1 resolver | Yes, via unit tests | No |
| 3 API routes | Phases 1–2 | Yes, via route tests/curl | API only |
| 4 UI | Phase 3 contract | Yes, against the documented contract | Yes |
| 5 Hardening/docs | Phases 1–4 | Final review | Docs only |

Keep each phase in its own commit series or pull request. Do not mix refactors of unrelated settings code into these phases; the only existing-flow edits are the resolver switch in Phase 3 and the reCAPTCHA site-key rendering in Phase 4.

---

## 16. Out of scope

- Rewriting `backend/.env` from the UI.
- Editing Google refresh tokens manually.
- Verifying Brevo sender identity.
- Enabling/disabling integrations based on validation.
- Bulk "validate all" and automatic validation on page load.
- Returning any part of a stored secret to the browser.
- Separate OAuth clients for Calendar and Sheets.
- Auditing ordinary reads of settings.
- Rotation tooling for the encryption key (the schema stores `keyVersion` for later).

---

## 17. Acceptance criteria

- [ ] All five cards show configured source, fixed mask, last validation, and stale state.
- [ ] Test validates without storing; Save validates first and stores only on success.
- [ ] Failed validation (invalid key, timeout, outage) leaves the previous credential and status unchanged.
- [ ] Saved values are AES-256-GCM encrypted and never returned in plaintext.
- [ ] Database values override env per field; Clear reverts to env.
- [ ] Undecryptable values fail closed without env fallback.
- [ ] Missing encryption secret blocks saves with 503 while env-only operation continues.
- [ ] Calendar/Sheets can save a validated pair before connection and are fully checked after Connect Google.
- [ ] Calendar and Sheets keep independent validation statuses on the shared pair; changing the pair marks the other card stale without erasing it.
- [ ] reCAPTCHA requires secret + site key, exposes the site key publicly, and states the pairing limitation.
- [ ] Every test/save/clear is audited with actor, IP, outcome, and code; no secrets are recorded; entries expire after 12 months.
- [ ] Authentication, existing settings behavior, toggles, and Google connect/disconnect are unchanged.
- [ ] Tests and README updates are included.

---

## 18. Assumptions and open risks

- The exact Google token-endpoint response for a valid client with a dummy code must be confirmed against a real OAuth client during implementation (Phase 2); the pass/fail mapping in §7 is based on standard `invalid_client` vs `invalid_grant` behavior.
- Google Sign-In does not need a client secret at runtime; the secret is collected only to validate the OAuth pair. If the project does not have a secret for that client, the card will require creating/using one.
- The stored Google token is shared by Calendar and Sheets, so independent card statuses can legitimately disagree (e.g. a Drive/scope failure for Sheets while Calendar still reads). Sheets validation cannot detect that the Sheets API itself is disabled because no spreadsheet ID is configured.
- Public delivery of the reCAPTCHA site key means changing it affects the login and signup pages immediately; the existing hardcoded values remain only as an empty-config fallback.
- Audit retention relies on a MongoDB TTL index, which deletes documents in the background and may lag slightly past 12 months.
