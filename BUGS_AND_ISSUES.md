# KATCHAT — Bugs, Fixes & Issues

## Applied Fixes

### Phase 1 — Debug & Stabilize

| # | Area | Issue | Fix | Files |
|---|------|-------|-----|-------|
| 1 | Error Handling | No centralized error tracking across frontend | Created `error-handler.js` with logger, history (200 entries), export as JSON | `js/error-handler.js`, `js/fixes.js` |
| 2 | Function Safety | Undefined function calls causing crashes | Global fallback implementations + `safeAsync()` wrapper | `js/fixes.js` |
| 3 | Function Binding | onclick handlers could reference missing functions | Startup validation of 70+ functions, `safeCall()` wrappers | `js/bindings.js` |
| 4 | Input Validation | No frontend validation on email, password, username | 20+ validators added | `js/validation.js` |
| 5 | XSS | User content not always escaped | `esc()` HTML-escaping function, sanitizeUrl() | `js/validation.js`, `js/ui.js` |
| 6 | Rate Limiting | No abuse protection | Rate limiter — 100 req/min per IP | `backend/error-handler.js` |
| 7 | Auth Security | Auth forms lacked validation | Integrated validation into login/signup/password change | `js/auth.js` |
| 8 | Script Order | Scripts loaded in wrong order, causing race conditions | Ordered with `defer`, safety layer first | `index.html` |
| 9 | Backend Error Middleware | No centralized error handling | ErrorLogger class, asyncHandler wrapper, disk persistence | `backend/error-handler.js`, `server.js` |
| 10 | Health Monitoring | No server health check | `/health` endpoint added | `server.js` |

### Phase 2a — Backend & Database Security Fixes

| # | Area | Issue | Fix | Files |
|---|------|-------|-----|-------|
| 11 | XSS (Backend) | Display names accepted HTML special chars | Reject `<>&"'` in display name on register and profile update | `routes/auth.js`, `routes/users.js` |
| 12 | CSP | No Content-Security-Policy header | Added strict CSP to all responses | `server.js` |
| 13 | Temp Ban (In-Memory) | Temp bans lost on server restart, used setTimeout | Stored `temp_ban_until` in DB column, auto-unban check on send_global_message | `schema.sql`, `socket/index.js` |
| 14 | Upload Filter (Missing) | No image validation on message/announcement uploads | Added shared `imageFileFilter` (JPEG/PNG/GIF/WebP only) | `utils.js`, `routes/messages.js`, `routes/users.js`, `routes/announcements.js` |
| 15 | Max Length Validation (Missing) | No server-side length limits on content | Added `validateMaxLength` helper, applied to all text fields | `error-handler.js`, all route files |
| 16 | CORS (Permissive) | CORS allowed all origins | Restricted to `CORS_ORIGIN` env var or `*` fallback | `server.js` |
| 17 | DB Indexes (Missing) | No indexes on frequently queried columns | Case-insensitive unique email index, indexes on messages(sender_id), users(is_banned_from_global) | `schema.sql` |
| 18 | MulterError (Unhandled) | File size limit errors returned HTML, not JSON | Added MulterError handler returning 400 JSON | `error-handler.js` |

### Phase 2b — Frontend XSS & UI Fixes

| # | Area | Issue | Fix | Files |
|---|------|-------|-----|-------|
| 19 | XSS (Single Quote) | `esc()` didn't escape `'`, breaking onclick attributes | `esc()` now escapes `'` to `&#x27;` | `js/ui.js` |
| 20 | XSS (JSON in onclick) | `JSON.stringify()` output injected raw into onclick= | Created `safeJsonForOnclick()` helper, applied in global, friends, sage | `js/ui.js`, `js/global.js`, `js/friends.js`, `js/sage.js` |
| 21 | XSS (Image onerror) | Avatar onerror in sage.js used raw display name | Use `initials(u)` (single non-quote char) instead | `js/sage.js` |
| 22 | XSS (Image onclick) | Chat/sage image onclick used raw src in `openImgViewer()` | Wrapped src with `esc()` | `js/chat.js`, `js/sage.js` |
| 23 | Null-safety | `state.user.role` accessed without optional chaining | `state.user?.role` | `js/chat.js` |
| 24 | Accessibility | Toast and modal lacked ARIA roles | Toast: `role="status"` + `aria-hidden` on icon. Modal: `role="dialog"`, `aria-modal="true"`, auto-focus | `js/ui.js` |
| 25 | Accessibility | Clear-search button had no accessible label | Dynamic `aria-label` | `js/ui.js` |
| 26 | Toast Null-check | `showToast` could fail if DOM element missing | Added null guard | `js/ui.js` |
| 27 | Missing CSS | `ann-img-viewer` overlay and `count-pulse` animation missing | Added to `style.css` | `css/style.css` |
| 28 | Dead Code | `_origAppendPriv` incomplete stub in swipe.js | Removed | `js/swipe.js` |

### Phase 2c — Sage AI Behavior Improvements

| # | Area | Issue | Fix | Files |
|---|------|-------|-----|-------|
| 29 | Nickname Spam | Nickname repeated in every system message | Reduced to 1–2 mentions per conversation | `routes/ai.js` |
| 30 | Joke Inappropriateness | Sage told jokes during serious topics | Added serious-topic detection (mental health, trauma, etc.) to drop jokes | `routes/ai.js` |
| 31 | Over-swearing | Sage initiated swearing freely | Changed to "don't initiate, let user set tone" | `routes/ai.js` |
| 32 | Priority Inversion | Personality sometimes prioritized over answering | "Answer first, personality second" as core rule | `routes/ai.js` |
| 33 | Temperature Variance | Groq temperature 0.8 felt inconsistent | Lowered to 0.7 across providers | `routes/ai.js` |

### Phase 2d — Architecture & Code Quality

| # | Area | Issue | Fix | Files |
|---|------|-------|-----|-------|
| 34 | Duplicate multer filter | 3 identical fileFilter copies in route files | Extracted to shared `imageFileFilter` in `utils.js` | `utils.js`, `routes/messages.js`, `routes/users.js`, `routes/announcements.js` |
| 35 | Duplicate avatar builder | `makeAdminAvEl` 95% identical to `makeAvEl` | Removed `makeAdminAvEl`, admin.js now uses `makeAvEl` | `js/admin.js`, `js/ui.js` |
| 36 | Dead code | `__adminTab_defined__` guard in ui.js always overwritten by admin.js | Removed fallback block | `js/ui.js` |
| 37 | Dead code | `sendPrivateMsgHttp` in api.js never called | Removed | `js/api.js` |
| 38 | Silent error swallow | `catch(() => {})` in app.js and settings.js | Replaced with `console.warn` | `js/app.js`, `js/settings.js` |

## Known Unresolved Issues

| Issue | Impact | Notes |
|-------|--------|-------|
| RLS not enabled | service_role key bypasses RLS | Migration requires anon-key refactor — out of scope |
| `sage_history` not normalized | History stored as JSON blob | Migration risks data loss — deferred |
| Password reset email notification | No email sent to user on admin reset | Future enhancement |
| No rate limiting on Socket.IO | Socket events not rate-limited | Socket.IO rate limiting not yet implemented |
| No email verification | Users can sign up with any email | Email verification not implemented |
| Error log files not rotated | Daily logs grow unbounded | Manual cleanup needed or add log rotation |

## Debugging Tools

### Frontend Console Commands

```javascript
getErrorLog()                        // View all logged errors (200 max)
exportErrorLog()                     // Download errors as JSON
runValidation()                      // Full system validation report
validateCriticalFunctions()          // Check 70+ functions exist
validateDomIds()                     // Check 100+ DOM elements exist
isFunctionAccessible('functionName') // Check single function
trackPerf(label, fn)                 // Measure sync operation time
trackPerfAsync(label, asyncFn)       // Measure async operation time
validateEmail('user@example.com')    // Test email validator
console.log(state)                   // View app state
console.log(socket.connected)        // Check socket connection
```

### Backend

```bash
curl http://localhost:5000/health                    # Server health check
curl "http://localhost:5000/api/logs?token=YOUR_TOKEN"  # Error logs
cat backend/logs/errors-$(date +%Y-%m-%d).log | jq .    # Pretty-print today's errors
```

## Error Codes

### Frontend
| Code | Meaning |
|------|---------|
| AUTH_FAILED | Authentication failure |
| VALIDATION_ERROR | Input validation failed |
| NETWORK_ERROR | Fetch/network issue |
| TIMEOUT | Request timed out |
| NOT_FOUND | Resource not found |
| RATE_LIMITED | Rate limit exceeded |

### Backend
| Code | Meaning |
|------|---------|
| INVALID_EMAIL | Email format invalid |
| WEAK_PASSWORD | Password too weak |
| INVALID_USERNAME | Username format invalid |
| TOKEN_EXPIRED | JWT token expired |
| INVALID_TOKEN | JWT token malformed/invalid |
| DB_ERROR | Database operation failed |
| UNAUTHORIZED | User not authenticated |
| FORBIDDEN | User lacks permissions |
| NOT_FOUND | Resource not found |

## Password Reset System

### Overview
Complete secure password reset with forced password change:
- Admin (owner only) triggers reset from admin panel
- Generates random 12-character temporary password
- User must change password on next login
- Temporary password never stored in plaintext

### Endpoints
- `POST /auth/admin/reset-password` — Owner-only, returns temporary password
- `PUT /auth/change-password` — Authenticated user changes password

### Database
- `users.must_change_password BOOLEAN DEFAULT false` — forces password change on login

### Test Flow
1. Login as owner → Admin Panel → Find user → "Reset Password"
2. Copy temporary password from modal
3. Logout, login with temporary password
4. You should see forced password change view (not main app)
5. Enter new password (8+ chars), confirm, submit
6. You should be logged into main app
7. Logout, login with NEW password → direct app access (no force)

## Deployment Checklist

- [ ] Set `NODE_ENV=production` in `.env`
- [ ] Set `ADMIN_LOG_TOKEN` in `.env`
- [ ] Re-run `schema.sql` in Supabase (all migrations at bottom)
- [ ] Replace placeholder logos in `frontend/public/assets/`
- [ ] Update canonical URL in `index.html`
- [ ] Enable HTTPS/TLS in production
- [ ] Configure CORS_ORIGIN environment variable
- [ ] Verify `/health` endpoint responds
