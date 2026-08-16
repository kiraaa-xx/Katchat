# KatChat — Session Context (2026-08-13)

Full record of what was done in this session, for future reference.

---

## 1. Bug-Hunter Run: 39 Findings — All Fixed & Verified

Pipeline: recon → hunter ×2 → skeptic → referee → fix → verify.
Canonical artifacts: `.bug-hunter/findings.json` (BUG-1..BUG-39), `.bug-hunter/report.md`.

### Backend rewrites (full file rewrites)
- **`backend/utils.js`** — `MIME_EXT` map; extension derived only from validated mimetype; `validateUploadedImage` (magic bytes post-upload, deletes file on mismatch); `makeUploadFilename` (crypto.randomBytes); `removeUploadedFile`; `sendError` (generic for 5xx, logs stack).
- **`backend/middleware/auth.js`** — `must_change_password` enforced via allowlist (`/api/auth/change-password`, `/me`, `/mark-intro-seen`) → 403 `PASSWORD_RESET_REQUIRED`; `getUserPermissions` helper.
- **`backend/routes/auth.js`** — signup always assigns `member` (owner emails are display strings only); EMAIL_RE; password ≥8; username `^[a-z0-9_]{3,20}$`; structured `.eq().maybeSingle()` dup checks (kills `.or()` injection); `crypto.randomInt` temp passwords; 23505 → friendly message.
- **`backend/socket/index.js`** — isUuid everywhere; per-socket throttle (msg 15/10s, typing 1/2s); permissions via `getPerms` (DB perms merged over system-role fallback); friendship check on private send; participant check on join_conversation/message_read; server-side `notify_friend_request` lookup; `admin_ban_user`/`admin_unban_user` authorized (`canBanUsers`), admins/owners protected unless actor is owner; auto-unban gated on persisted `temp_ban_until`; `/ban` clears `temp_ban_until`; exact-match command targets (whitelist `[A-Za-z0-9_.-]`, hours capped 720); `module.exports.onlineUsers` preserved.
- **`backend/routes/users.js`** — `GET /users/directory` (any authed user, 500 limit, safe fields) for global-chat mentions; avatar magic-byte + cleanup; friend-request 23505 race → accept reverse pending; `/ban`/`/unban` permission-based, non-owner can't ban admin/owner, permanent ban clears `temp_ban_until`, sanitized reason.
- **`backend/routes/messages.js`** — friendship + `canChat` on POST /private; magic bytes per file; orphan cleanup on all rejection paths (incl. 429); global pagination `.range((page-1)*100, page*100-1)`; DELETE validates UUID + role fallback.
- **`backend/routes/announcements.js`** — comment POST requires `canCommentAnnouncements`; upload/cleanup fixes.
- **`backend/routes/roles.js`** — NAME_RE/COLOR_RE/ICON_RE; `cleanPermissions` whitelist; 23505 → 'Role already exists'.

### Backend patches
- **`ai.js`** — `sageThrottle` (12/min per user); /chat caps (≤20 msgs, ≤5000 chars, roles user/assistant, base64 ≤8M chars, SAGE_ALLOWED_MIMES).
- **`owner-messages.js`** — TOCTOU guard: post-insert count check, delete newer row + 429 (`postCount`).
- **`help.js`** — `sanitizeHelpHtml` strips script/iframe/object/embed, `on\w*=` attrs, javascript:/vbscript: URLs, slices 50000.
- **`error-handler.js`** — flattened error responses `{ success:false, error:<string>, code, statusCode, timestamp }`.
- **`server.js`** — nosniff + Content-Disposition on `/uploads`; timing-safe `/api/logs` (sha256 + `crypto.timingSafeEqual`); SPA catch-all excludes `/api/` and `/uploads/` (handler `(req,res,next)`).
- **`schema.sql`** — `CREATE UNIQUE INDEX IF NOT EXISTS idx_friends_pair ON friends (LEAST(user_id,friend_id), GREATEST(user_id,friend_id));` — **must still be applied in Supabase**.

### Frontend patches
- **`api.js`** — `req()` extracts string error (`typeof data.error === 'string'` fallback `data.error?.message`); 403 `PASSWORD_RESET_REQUIRED` → `showChangePasswordView()`; added `getDirectory()`.
- **`app.js`** — `checkNewAnnouncements` uses `created_at` timestamps (`kc_last_announcement_ts`).
- **`settings.js`** — `hslToHex`, `resolveAccentKey`, `accentThemeKey`; accent color persisted as hex, resolved back to theme key on load.
- **`ui.js`** — `showToast` escapes via `esc()`; `getRoleBadge` escapes color/icon/name; image-viewer listeners cleaned up properly.
- **`announcements.js`** — announcement poll timestamp; image-viewer cleanup.
- **`error-handler.js`** — `logError(context, err, showUser = false)` default silent.
- **`fixes.js`** — command dropdown uses `onclickStr()` for cmdPart/username.
- **`global.js`** — mentions via `api.getDirectory()`; `onclickStr()` escapes in dropdowns.
- **`chat.js`** — REST fallback (`POST /messages/private/:id`) when socket not connected.
- **`auth.js`** — base64url-safe JWT payload decode.
- **`owner-messages.js`** — daily-limit string aligned with backend.
- **`admin.js`** — role modal onclick uses `onclickStr()`; role color escaped.

### Verification
- `node --check` all backend + frontend files (only false positive: node_modules ESM socket.io file).
- Live boot smoke test: `/health` 200; no-token `/api/roles` → 401; invalid email register → 400; missing `/api/*` → 404; missing `/uploads/*` → 404.
- Regression greps: no raw `.or()` with user input; no `err.message` 500 leaks; no silent `catch(() => {})`.

---

## 2. Settings Sub-Options Broken — Fixed

**Symptom:** clicking Profile/Security/Appearance/Notifications in Settings did nothing.

**Cause:** `toggleSettingsSection` was missing from the working tree (removed in earlier uncommitted edits; HTML still called it) → `ReferenceError` on click.

**Fix:** restored in `frontend/public/js/settings.js` (accordion: closes other sections, toggles `aria-expanded`) + `window` export.

## 3. Help Center Redesign (visually distinct from Settings)

- `help.js` renders section heads with an icon chip: `<span class="help-sec-icon">`.
- `style.css` — new `.help-sec-icon` chip (accent-tinted, rotates/scales when open), accent left border + tinted background on expanded heads, body content in an inset panel (`--bg2` + border + inner shadow); FAQ questions get accent border/tint when open.

---

## 4. Stale Service Worker — THE "nothing works" Root Cause

**Symptom:** settings still broken + help looked wrong even after fixes; console showed `sw.js` FetchEvent errors and bindings reported `toggleSettingsSection`/`loadSageChats` missing although the server served files containing them.

**Cause:** a **zombie service worker** from an earlier deployment remained registered in the browser and served **old cached JS/CSS**, masking all fixes. `sw.js` did not exist anywhere in the project or git history.

**Fix:**
- **`frontend/public/sw.js`** (new) — self-destructing service worker: no fetch handler, `skipWaiting()`, on activate wipes all caches, unregisters itself, reloads open pages. First hard-reload installs it; second reload gets fresh files.
- **`bindings.js`** — removed stale `pending-list` DOM ID from REQUIRED_IDS.
- **`server.js` CSP** — added `https://fonts.googleapis.com` to style-src and `https://fonts.gstatic.com` to font-src (Google Fonts were blocked → wrong look).

---

## 5. Sage AI Fixes (images + intermittent failures)

**Symptom:** image questions always returned the "Sage is under maintenance" message; text sometimes failed too.

**Causes (verified live against the Groq API):**
1. `GROQ_VISION_MODEL=meta-llama/llama-4-scout-17b-16e-instruct` — **model doesn't exist on Groq** → 404 on every image request.
2. Groq free tier frequently returns **503 "over capacity"**; the code made ONE attempt and gave up → maintenance message on any hiccup.
3. The new API key had been pasted into the **root `.env`** while the server only reads **`backend/.env`** (which held the old invalid key → 401). Keys synced; verified 200.

**Fixes:**
- **`backend/routes/ai.js`**:
  - Default vision model → `qwen/qwen3.6-27b` (valid vision-capable model on this key's plan).
  - New `callWithRetry()` — transient errors (429/5xx/network) retried up to 2× with exponential backoff (800ms → 1600ms) inside `runWithFailover`.
- **`backend/.env` + root `.env`** — `GROQ_VISION_MODEL=qwen/qwen3.6-27b` (synced both).
- Verified end-to-end: vision call hit two 503s, retried, answered correctly ("Red"); text model answered fine.

**User action required:** restart server after any backend change (`Ctrl+C` → `npm start`).

---

## Environment Notes
- Node v22.23.2, Windows PowerShell 5.1. Server: `backend/server.js`, port 5000.
- Two `.env` files exist: root (informational / user-edited) and `backend/.env` (the one the server loads via dotenv).
- No git commits made in this session (repo dirty tree with pre-existing + our changes).
- Still pending: apply `idx_friends_pair` unique index in Supabase; frontend/backend smoke test by user.
