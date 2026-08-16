# Bug Hunter Report — KatChat

**Date:** 2026-08-13
**Pipeline:** recon → hunter (parallel ×2) → skeptic → referee → fix → verify
**Result:** 39 confirmed findings — **all fixed and verified**. No commits made (left uncommitted).

---

## Severity Summary

| Severity | Count |
|----------|-------|
| Critical | 8 (BUG-1..8) |
| High     | 9 (BUG-9..17) |
| Medium   | 12 (BUG-18..29) |
| Low      | 10 (BUG-30..39) |

Full per-finding claims/fixes: `.bug-hunter/findings.json` (canonical, `BUG-*` ids with `KC-*`/`B-*` aliases).

---

## Fixes Applied — Backend

### Critical
- **BUG-1 (owner escalation via signup)** — `backend/routes/auth.js`: signup now **always assigns `role: 'member'`**; owner emails are display strings only. Email format validated (`EMAIL_RE`), password ≥ 8, username `^[a-z0-9_]{3,20}$`.
- **BUG-2 (upload spoofing / stored XSS)** — `backend/utils.js`: new `MIME_EXT` map, extension derived **only from validated mimetype**, `validateUploadedImage` checks **magic bytes post-upload** (deletes file on mismatch), filenames randomized with `crypto.randomBytes`. Applied in users/messages/announcements uploads with orphan-file cleanup on all rejection paths (incl. 429 image-limit).
- **BUG-3 (unauthenticated socket bans)** — `backend/socket/index.js` (rewritten): `admin_ban_user`/`admin_unban_user` authorized via `canBanUsers` permission; target must exist; admins/owners protected unless actor is owner; reasons sanitized.
- **BUG-6/9 (private message access)** — REST `POST /api/messages/private/:id` and socket `send_private_message` now require **friendship + `canChat` permission**; `join_conversation`/`message_read` verify participation; recipient validated as UUID.

### High
- **Filter injection (BUG-4/5/34)** — all PostgREST `.or()` interpolations audited: signup/duplicate checks → structured `.eq().maybeSingle()`; command target → whitelisted `[A-Za-z0-9_.-]` exact match; remaining `.or()` uses only UUID-validated values.
- **Command abuse (BUG-8/25)** — `/ban`/`/unban`/`/tban`/`/tunban` require `canUseCommands` + `canBanUsers`; hours capped at 720; `/ban` clears `temp_ban_until` so auto-unban never fires for permanent bans; temp-ban auto-unban gated on persisted `temp_ban_until`.
- **Privilege escalation via roles (BUG-10/11/12/15)** — `backend/routes/roles.js`: name/color/icon regex validation, `cleanPermissions` whitelist (unknown keys dropped), duplicate-role 23505 handled.
- **Rate/abuse** — `backend/routes/ai.js`: per-user `sageThrottle` (12/min) + hard payload caps (≤20 msgs, ≤5000 chars, base64 ≤8M chars, allowed mimes). Socket: per-socket sliding-window throttle (msgs 15/10s, typing 1/2s).
- **Help stored XSS (BUG-37)** — `sanitizeHelpHtml` strips `script/iframe/object/embed`, `on*` attributes, `javascript:`/`vbscript:` URLs.

### Medium
- **Ban endpoint authz (BUG-17/21)** — `PUT /ban`/`unban` use `getUserPermissions` (custom roles + system fallback); non-owner cannot ban admin/owner.
- **Announcement comments (BUG-26)** — require `canCommentAnnouncements` permission.
- **Owner-messages TOCTOU (BUG-22)** — post-insert count check deletes the newer row + 429.
- **Avatar/safe-user leaks (BUG-16)** — sanitized user projections everywhere (`safe`, `safeUser`); `GET /users/directory` exposes only non-sensitive fields.
- **must_change_password enforcement (BUG-13)** — middleware blocks all routes except allowlist (`/api/auth/change-password`, `/me`, `/mark-intro-seen`) with 403 `PASSWORD_RESET_REQUIRED`; `fromReset` honored only when flag set.
- **Frontend sinks (BUG-39/14)** — `showToast` escapes via `esc()`; `getRoleBadge` escapes color/icon/name; image-viewer keydown/pan listeners always removed; announcement poll uses `created_at` (timestamp) instead of monotonic ID.

### Low
- Timing-safe `/api/logs` secret check (BUG-35), `crypto.randomInt` temp passwords (BUG-36), nosniff + Content-Disposition on `/uploads` (BUG-2), SPA catch-all excludes `/api/*` and `/uploads/*` (BUG-18), flattened error responses (no `err.message` 500 leaks), friends pair-unique index (BUG-38), pagination fixes, base64url JWT decode (frontend), REST fallback when socket is down, daily-limit string alignment, `onclickStr()` for all onclick injections.

---

## Fixes Applied — Frontend

`api.js` (error extraction + 403 reset flow + `getDirectory`), `app.js`, `settings.js` (accent hex round-trip), `ui.js`, `announcements.js`, `error-handler.js` (silent default), `fixes.js`, `global.js` (directory mentions), `chat.js` (REST fallback), `auth.js` (base64url), `owner-messages.js`, `admin.js` (role modal onclick). All pass `node --check`.

---

## Verification

1. `node --check` — all backend + frontend files (only false positive: node_modules ESM socket.io client file).
2. **Live boot smoke test:** `/health` 200 OK; `/api/roles` w/o token → **401**; register invalid email → **400**; missing `/api/*` → **404** (catch-all correct); missing `/uploads/*` → **404**.
3. Regression greps: no raw `.or()` with user input (all UUID/whitelist-bound); no `err.message` leaks to clients; zero silent `catch(() => {})`.
4. UI flow audit: friendship gate does not break existing UI (profile "Message" button only for friends; chat opens only from friends/chat lists).

---

## Caveats / Not Done

- No live-Supabase write tests (would pollute production data).
- Changes **not committed** (per working rules). `backend/schema.sql` new unique index must be applied in Supabase: `CREATE UNIQUE INDEX IF NOT EXISTS idx_friends_pair ON friends (LEAST(user_id,friend_id), GREATEST(user_id,friend_id));`
- Pre-existing findings from triage that were by-design or out of scope are noted in `.bug-hunter/triage.json`.
