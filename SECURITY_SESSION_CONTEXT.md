# KatChat — Security Session Context

> This file records exactly what was done in the **August 14, 2026 security session**:
> which files were changed, why, the full flow of each feature, how to test, and
> the current state of the repo. Read this before continuing any work.

---

## 1. What the user asked for

The user wanted to add **security features** to KatChat — specifically **OTP**
(one-time passwords) and **Auth0**-style authentication — and pointed at the
GitHub repo `public-apis/public-apis` as a reference.

### Reality check (important context)

`public-apis/public-apis` is **not installable code** — it is a **catalog/list
of free third-party APIs** (name + URL + description). You cannot `npm install`
it or import from it. Its only use is to *discover free services*. We used it
conceptually to pick a free email provider.

The user was asked (via a multi-choice question) which features to build. Their
answer:

- ✅ **Email OTP verification** — requires a free email API key (Resend).
- ✅ **TOTP 2FA (authenticator app)** — fully self-contained, no external account.
- ❌ Auth0 — NOT chosen (it would require creating an Auth0 tenant + credentials
  and replacing the entire login flow).

### Offer the user made
They offered to create accounts/API keys and test the app in the browser.
**Note:** I do NOT have browser access in this environment. Testing that requires
the browser must be done by the user.

---

## 2. Features implemented

### Feature A — Email OTP verification
- After signup, a 6-digit one-time code is sent to the user's email (via Resend).
- The account is marked `email_verified = false` until the code is confirmed.
- A **login gate** (`REQUIRE_EMAIL_VERIFICATION=true` in `.env`) blocks sign-in
  for unverified accounts and forces the email-verification screen.
- Resend is **rate-limited**: 60s cooldown, max 5 verify attempts, 10-minute expiry.
- **Graceful degradation**: if `RESEND_API_KEY` is empty, accounts are
  auto-verified (feature is effectively off — nothing breaks).

### Feature B — TOTP 2FA (authenticator app)
- Fully self-contained: implemented in `backend/security.js` using Node's
  `crypto` (RFC 6238 TOTP + RFC 4226 HOTP, Base32 encode/decode).
- `POST /api/auth/totp/setup` → generates a secret + QR code (via `qrcode` npm).
- `POST /api/auth/totp/enable` → verifies one live code, activates 2FA,
  returns **8 recovery codes** (stored hashed, single-use).
- Login with 2FA enabled → server returns a short-lived (5 min) temp token;
  the user must complete the code step via `POST /api/auth/totp/verify-login`.
- Disable requires a valid authenticator code (or a recovery code).
- Regenerate recovery codes requires a valid live code.

---

## 3. Files changed (complete list)

### Backend
| File | Change |
|------|--------|
| `backend/security.js` | **NEW** — TOTP/HOTP (RFC 6238/4226), Base32, OTP gen/hash, recovery codes, Resend email send. |
| `backend/routes/auth.js` | Register sends verification email; login 2FA + email gate; new routes: `verify-email`, `resend-verification`, `totp/setup`, `totp/enable`, `totp/disable`, `totp/regenerate-recovery`, `totp/verify-login`. `safeUser` strips new sensitive fields. |
| `backend/middleware/auth.js` | Added `VERIFY_ALLOWED_PATHS` — unverified accounts may only hit `verify-email`, `resend-verification`, `me` when enforcement is on. |
| `backend/socket/index.js` | Socket middleware now rejects unverified accounts when enforcement is on. |
| `backend/schema.sql` | Added columns: `email_verified`, `email_otp_hash`, `email_otp_expires`, `email_otp_attempts`, `totp_secret`, `totp_enabled`, `totp_recovery_codes`. |
| `backend/package.json` | Added `qrcode` dependency (for QR data-URL generation). |
| `backend/.env` | Added `RESEND_API_KEY`, `RESEND_FROM`, `REQUIRE_EMAIL_VERIFICATION`. |

### Frontend
| File | Change |
|------|--------|
| `frontend/public/index.html` | New `#totp-card` (2FA verify step), `#verify-card` (email verify step); settings Security section gets 2FA + email-verify panels; new `#m-recovery` modal. |
| `frontend/public/js/api.js` | `req()` now attaches `err.code`/`err.status`; new methods: `verifyTotpLogin`, `verifyEmail`, `resendVerification`, `totpSetup`, `totpEnable`, `totpDisable`, `totpRegenerateRecovery`; `req()` accepts an explicit `useToken` override. |
| `frontend/public/js/auth.js` | Login handles `twoFactorRequired` + `EMAIL_NOT_VERIFIED`; signup routes to verify card when `email_verified === false`; new funcs: `showTotpLogin`, `submitTotpLogin`, `backToLoginFromTotp`, `showEmailVerifyCard`, `submitEmailVerify`, `resendVerificationCode`, `backToLoginFromVerify`. |
| `frontend/public/js/settings.js` | 2FA setup/manage/disable/regenerate panels + email verify panel; status renderers; recovery-code display. |
| `frontend/public/js/bindings.js` | Registered all new functions + DOM IDs (keeps `runValidation()` green). |
| `frontend/public/js/validation.js` | Added `validateOtpCode` (6-digit check). |
| `frontend/public/js/state.js` | Added `totpTempToken`, `pendingUser` state fields. |

---

## 4. The exact flows (how it works end to end)

### Email verification flow
1. `POST /api/auth/register` → creates user → `sendVerificationEmail()`.
   - If `RESEND_API_KEY` set: stores OTP hash + expiry, `email_verified=false`, emails code.
   - If not set: sets `email_verified=true` (feature off).
2. Response `{ token, user }` — frontend checks `user.email_verified`.
   - If `false` → shows `#verify-card`, auto-calls `resendVerificationCode()`.
   - `submitEmailVerify()` → `POST /api/auth/verify-email { code }`.
3. On success, if the user came from a **blocked login** (`_verifyEmailPass` set),
   it re-runs login automatically. Otherwise `enterApp()`.

### Blocked-login variant
1. `POST /api/auth/login` → password OK but `email_verified=false` and
   `REQUIRE_EMAIL_VERIFICATION=true` → `403 { code:'EMAIL_NOT_VERIFIED', tempToken }`.
2. Frontend shows verify card, passes `err.tempToken` as `useToken` for the
   verify/resend calls (the user isn't logged in yet, so localStorage has no token).

### TOTP 2FA setup (settings → Security)
1. `renderTotpStatus()` shows enabled/disabled.
2. `toggleTotpPanel()` → if disabled → `startTotpSetup()` → `POST /totp/setup`
   → shows QR + secret → user scans with authenticator app.
3. `enableTotp()` → `POST /totp/enable { code }` → activates + returns 8 recovery
   codes → `showRecoveryCodes()` opens `#m-recovery` modal.
4. Manage panel: regenerate recovery codes (`confirmRegenerateRecovery`) or
   disable (`confirmDisableTotp`).

### Login with 2FA
1. `POST /api/auth/login` → if `totp_enabled` → `{ twoFactorRequired:true, tempToken }`.
2. Frontend `showTotpLogin()` → user enters 6-digit code.
3. `submitTotpLogin()` → `POST /api/auth/totp/verify-login { tempToken, code }`
   → returns real `{ token, user }` → `enterApp()`.
4. Wrong code → error; expired temp token → "2FA session expired, sign in again".

---

## 5. Security design notes

- **OTP stored hashed** (SHA-256) — never plaintext in DB.
- **Recovery codes stored hashed** (SHA-256), single-use.
- **TOTP verified with ±1 time-step window** to tolerate clock drift.
- **Rate limiting**: resend cooldown 60s (in-memory), max 5 verify attempts,
  10-min OTP expiry, plus existing global rate limiter (300 req/min).
- **`safeUser` strips**: `password`, `email`, `banned_by`, `ban_reason`,
  `temp_ban_until`, `sage_history`, `email_otp_hash`, `email_otp_expires`,
  `totp_secret`, `totp_recovery_codes`.
- **Graceful degradation**: no `RESEND_API_KEY` → email verification is skipped;
  the app works exactly as before.
- **Email verification NOT enforced** for pre-existing accounts:
  `email_verified` defaults to `true` in the schema so nobody gets locked out.

---

## 6. How to test (user must do browser testing)

### Setup
1. Get a free key at **https://resend.com** (Resend free tier).
2. Paste it into `backend/.env` → `RESEND_API_KEY=re_xxxxxxxx`.
3. (Optional) Run the schema migration in Supabase SQL editor:
   `ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified BOOLEAN DEFAULT true;`
   `ALTER TABLE users ADD COLUMN IF NOT EXISTS email_otp_hash TEXT;`
   `ALTER TABLE users ADD COLUMN IF NOT EXISTS email_otp_expires TIMESTAMPTZ;`
   `ALTER TABLE users ADD COLUMN IF NOT EXISTS email_otp_attempts INTEGER DEFAULT 0;`
   `ALTER TABLE users ADD COLUMN IF NOT EXISTS totp_secret TEXT;`
   `ALTER TABLE users ADD COLUMN IF NOT EXISTS totp_enabled BOOLEAN DEFAULT false;`
   `ALTER TABLE users ADD COLUMN IF NOT EXISTS totp_recovery_codes JSONB DEFAULT '[]';`
   (or run the whole `backend/schema.sql` again — it is idempotent).

### Email OTP
- Register a new account with the email you registered on Resend
  (free-tier `onboarding@resend.dev` can only send to the account owner's email
  until you verify your own domain — for real users you must add a domain).
- You should see the "Verify Your Email" card. Enter the emailed code.

### TOTP 2FA
- Settings → Security → Two-Factor Authentication → Setup.
- Scan QR with Google Authenticator / Authy / 1Password.
- Enter the 6-digit code → enable → save the 8 recovery codes.
- Log out, log back in → you must enter the authenticator code.

---

## 7. Verification performed so far

- ✅ `node --check` passes on: `security.js`, `routes/auth.js`, `middleware/auth.js`,
  `socket/index.js`, `api.js`, `auth.js`, `settings.js`, `bindings.js`, `validation.js`.
- ✅ Server boots cleanly and `/health` returns `{"status":"ok"}`.
- ✅ All new routes respond correctly to unauthenticated requests
  (401 where auth required; 400 body validation on the public verify-login route).
- ✅ TOTP math verified against an independent RFC 6238 reference implementation
  (secret → code → `verifyTOTP` returns true; wrong code returns false).
- ✅ `security.js` unit smoke test: Base32 secret length 32, provisioning URI shape,
  QR data-URL generation, OTP 6-digit, stable hashing, recovery code hashing,
  `sendEmail` returns `false` gracefully when no API key.
- ⚠️ **Not tested**: full end-to-end HTTP flow against live Supabase (an ECONNREFUSED
  occurred because the server had to be started on the same port first; the 
  standalone route tests above did pass). The user should do the browser test.

---

## 8. Current repo state / gotchas for the next session

- Working tree already had uncommitted modifications **before** this session
  (nearly every file listed as `M` in `git status`), plus untracked
  `.bug-hunter/` and `frontend/public/sw.js`. None of those are mine.
- My changes are **uncommitted** (no commits were made — none were requested).
- `backend/.env` contains real secrets (`SUPABASE_SERVICE_KEY`, `JWT_SECRET`,
  `GROQ_API_KEY`). **Never echo or commit these.** The file is untracked.
- CSP `script-src` is strict (self + cdnjs) — the QR is rendered from a
  `data:` URL generated server-side, which is CSP-compliant (`img-src 'self' data: blob:`).
- Rate limiter in `error-handler.js` is 300 req/min/IP for all `/api/` — the OTP
  endpoints rely on this global limiter plus their own cooldowns.

---

## 9. Verification session addendum (Aug 14 2026, same day)

### What was verified
- ✅ `node --check` passes on all changed files.
- ✅ **TOTP math verified against the official RFC 6238 test vectors** (all 6
  pass: T=59→287082, T=1111111109→081804, T=1111111111→050471,
  T=1234567890→005924, T=2000000000→279037, T=20000000000→353130). Base32,
  HOTP, QR data-URL, OTP gen, recovery codes, `sendEmail` graceful-false all
  pass a standalone smoke test.
- ✅ Server boots, `/health` OK, Supabase connects. Unauthenticated calls to the
  new routes return 401; `verify-login` with empty body returns 400.
- ✅ Live register works; `safeUser` does not leak `password`/`totp_secret`.

### ❌ CRITICAL FINDING — DB migration was NEVER applied
- The live Supabase database **does not have the security columns**
  (`email_verified`, `email_otp_*`, `totp_secret`, `totp_enabled`,
  `totp_recovery_codes`). Confirmed by direct `SELECT *` on a fresh test user.
- Consequence: **email OTP and TOTP 2FA cannot work in the browser until the
  migration is run** (Supabase SQL editor, see Section 6). Attempts fail
  silently / with misleading errors.
- Why it "worked" in the previous session: PostgREST errors are returned as
  `{ data, error }` and the Supabase JS client **never throws** — the old code
  ignored `error`, so every security write failed invisibly. E.g.
  `totp/enable` previously returned the misleading `"2FA is already enabled"`
  because `select('totp_secret,totp_enabled')` errored → `data` was null.

### Fix applied this session
- **`backend/routes/auth.js` hardened**: every security-related Supabase call
  now destructures `error` and throws it, so DB failures surface as 500s
  instead of failing silently. Re-tested live: `totp/enable` now returns
  HTTP 500 (real DB error) instead of the fake `"2FA is already enabled"`.
- No schema changes were made — the migration still must be run by the user
  (I cannot run DDL through the service-role API client).

### Current `.env` state
- `RESEND_API_KEY` is **empty** → email verification currently auto-verifies
  (feature off). `RESEND_FROM` is set. `REQUIRE_EMAIL_VERIFICATION=true` is
  harmless until the columns exist (undefined ≠ false).
- ⚠️ The `email_verified` column defaults to `true`, so existing accounts won't
  be locked out after the migration. New signups get `email_verified=false`
  only when a Resend key is present.

### Next session — do this first
1. Run the migration SQL in Supabase (Section 6) — this unblocks EVERYTHING.
2. Paste a real `RESEND_API_KEY` into `backend/.env`, restart the server.
3. Browser-test email OTP (register → verify card → emailed code) and TOTP 2FA
   (Settings → Security → Setup → QR → enable → log back in).

---

## 10. Post-migration live test results (same day, after user applied migration)

User applied the 7 `ALTER TABLE` statements in Supabase → confirmed success.
Full end-to-end HTTP tests then ran against the live server + Supabase. **All pass:**

| Flow | Result |
|------|--------|
| Register → `email_verified` returned (`true` since no Resend key → graceful off) | ✅ |
| `totp/setup` → 32-char secret + QR data-URL | ✅ |
| `totp/enable` with live RFC-6238 code → 8 recovery codes, `totp_enabled=true` | ✅ |
| Login with 2FA → `{ twoFactorRequired:true, tempToken }` | ✅ |
| `totp/verify-login` with live code → real token | ✅ |
| `totp/verify-login` with **recovery code** → real token (NEW FIX, see below) | ✅ |
| Recovery code is **single-use** (2nd attempt → 400) | ✅ |
| Wrong TOTP code → 400 | ✅ |
| Email OTP `verify-email`: wrong code → 400, correct code → `verified=true` | ✅ |
| Login gate for unverified account → `403 { code:'EMAIL_NOT_VERIFIED', tempToken }` | ✅ |

### Bug fixed this session: recovery codes could NOT be used to log in
- Before: `totp/verify-login` only accepted live TOTP codes. Recovery codes were
  only usable in `totp/disable`, which **requires an authenticated session**. A
  user who lost their authenticator app while logged out was **permanently
  locked out** of their account.
- After: `verify-login` now accepts an unused recovery code as a fallback and
  **consumes it** (removes it from `totp_recovery_codes`). Tested single-use.

### Notes / gotchas for future sessions
- **`sendError` for 5xx only logs to the console, not the daily log file** — the
  file logger (`errorLogger`) is only used by the final error-handler middleware,
  not by route `catch` blocks. Pre-existing behavior; not changed.
- **PostgREST `.single()` throws PGRST116 when 0 rows match.** With the new
  `throw` hardening this surfaces as HTTP 500. That is correct/informative
  behavior (e.g. invalid email on login), but note the client sees a generic
  `Server error` — the detail is only in the server console.
- **Reminder**: socket middleware + `middleware/auth.js` reject unverified
  accounts only when `REQUIRE_EMAIL_VERIFICATION=true` (set) — verified in code,
  socket gate not live-tested this session (needs a browser socket connection).
- No schema changes were made by this session. Working tree still has the same
  uncommitted state described in Section 8.