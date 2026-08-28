# KatChat — Full Project Context

> Use this document to understand the entire project at a glance. Covers architecture, codebase structure, features, database, security, known issues, and debugging.

---

## What Is KatChat?

KatChat is a **full-stack real-time messaging platform** — a modern chat app with private messaging, a global (group) chat room, an AI assistant named **Sage**, announcements with comments, a friends system, custom roles & permissions, and an admin panel. It is built as a single-page application (SPA) with a mobile-first, dark/light themed UI.

**Live demo / owner contact:** `katchat369@gmail.com`

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Backend** | Node.js, Express, Socket.IO |
| **Database** | Supabase (PostgreSQL) |
| **AI** | Groq (free; `llama-3.3-70b-versatile`) |
| **Frontend** | Vanilla JS SPA, CSS3, Font Awesome 6 |
| **Auth** | JWT (jsonwebtoken + bcryptjs) |
| **Uploads** | Multer (images only: JPEG, PNG, GIF, WebP) |

---

## Codebase Structure

```
katchat/
├── README.md                    # Entry point & setup
├── CONTEXT.md                   # This file — full project reference
├── AI_BEHAVIOR.md               # Sage AI personality, provider, developer guide
│
├── backend/
│   ├── server.js                # Express entry: CORS, CSP, rate limiter, routes, static serve
│   ├── supabase.js              # Supabase client (service_role key)
│   ├── utils.js                 # Shared: imageFileFilter, sendError
│   ├── error-handler.js         # Central: ErrorLogger, rate limiter, validators
│   ├── schema.sql               # Full PostgreSQL schema (run in Supabase)
│   ├── help-content.json        # Editable help center content (via admin panel)
│   ├── .env                     # Env vars (not committed)
│   ├── middleware/
│   │   └── auth.js              # JWT auth, adminOnly, ownerOnly guards
│   ├── routes/
│   │   ├── auth.js              # POST /api/auth (login, signup, password reset)
│   │   ├── users.js             # GET/PUT /api/users (profile, search, avatar, friends, suggestions)
│   │   ├── messages.js          # GET /api/messages (history, image upload)
│   │   ├── announcements.js     # CRUD /api/announcements + comments
│   │   ├── roles.js             # CRUD /api/roles (custom roles, permissions)
│   │   ├── ai.js                # POST /api/ai/chat, history, multi-chat management
│   │   ├── help.js              # GET/PUT /api/help (editable help center, owner-only write)
│   │   └── owner-messages.js    # Owner contact messaging system
│   ├── services/
│   │   └── tools.js             # Sage live tools: weather (Open-Meteo), news (Google News RSS), announcements — keyless, TTL-cached
│   ├── socket/
│   │   └── index.js             # Socket.IO: messages, typing, bans, heartbeats, online count
│   ├── logs/                    # Daily error files: errors-YYYY-MM-DD.log
│   └── public/uploads/          # Uploaded images (avatars, message images, announcements)
│
├── frontend/
│   └── public/
│       ├── index.html           # SPA shell: views, modals, all scripts (defer ordered)
│       ├── css/
│       │   ├── style.css        # All styles: dark/light themes, components, responsive
│       │   ├── animations.css   # Intro screen, particle, glow, swipe animations
│       │   └── mobile.css       # Mobile-specific: bottom nav, swipe, compact layout
│       ├── js/
│       │   ├── fixes.js         # Safety foundation: fallback functions, safe DOM, polyfills
│       │   ├── error-handler.js # Frontend error logger, perf monitoring, 200-entry history
│       │   ├── bindings.js      # Startup validation: 70+ functions, 100+ DOM IDs
│       │   ├── validation.js    # esc() XSS sanitizer, 20+ validators
│       │   ├── api.js           # Fetch wrapper for all REST endpoints
│       │   ├── state.js         # Global app state object
│       │   ├── ui.js            # UI helpers: avatars, toasts, modals, image viewer
│       │   ├── notifications.js # Browser notification system (PM + announcements)
│       │   ├── socket-client.js # Socket.IO client: message handlers, ban events, typing
│       │   ├── auth.js          # Login, signup, forced password change flows
│       │   ├── chat.js          # Private chat: rendering, sending, replies, images
│       │   ├── global.js        # Global chat: @mentions, /commands, rendering
│       │   ├── friends.js       # Friend requests, search, accept/decline, suggestions
│       │   ├── announcements.js # Announcements list, comments, create/edit (admin)
│       │   ├── sage.js          # Sage AI chat UI, image upload, chat history panel
│       │   ├── settings.js      # Profile edit, password change, theme, notifications
│       │   ├── help.js          # Help center rendering (fetches from API)
│       │   ├── admin.js         # Admin panel: users, roles, bans, posts, help content
│       │   ├── owner-messages.js# Owner contact messages (admin view)
│       │   ├── app.js           # enterApp() init: auth check, view routing
│       │   └── swipe.js         # Mobile swipe-to-reply gesture handler
│       └── assets/
│           ├── logo.png         # White app logo (dark theme)
│           ├── logo_black.png   # Black app logo (light theme)
│           ├── sage-logo.png    # Sage AI rotating icon
│           └── favicons/        # PWA favicons (all sizes + manifest)
│
└── package.json                 # Root orchestrator (dev/start scripts)
```

---

## Architecture Overview

```
┌──────────────┐     HTTP/WS      ┌──────────────┐     SQL      ┌──────────┐
│  Frontend    │ ───────────────> │  Express      │ ──────────> │Supabase  │
│  (Vanilla JS │ <─────────────── │  + Socket.IO  │ <────────── │PostgreSQL│
│   SPA)       │                  │               │             └──────────┘
└──────────────┘                  └──────────────┘
       │                                  │
       │                                  └── Groq API (Sage AI)
       │
       └── Browser console tools:
           runValidation(), getErrorLog(), trackPerf()
```

---

## Frontend — Script Load Order

Scripts are loaded with `defer` in this exact order:

1. `.js/socket.io` CDN — Socket.IO library
2. `fixes.js` — Foundation, fallbacks, safe DOM
3. `error-handler.js` — Error tracking, async wrapping, perf
4. `bindings.js` — Validates all functions & DOM IDs exist
5. `validation.js` — XSS escaping, validators
6. `api.js` — Fetch client
7. `state.js` — App state
8. `ui.js` — UI components
9. `notifications.js` — Browser notification system
10. `socket-client.js` — Socket.IO client events
11. `auth.js` — Login/signup flows
12. `chat.js` — Private chat
13. `global.js` — Global chat
14. `friends.js` — Friends system
15. `announcements.js` — Announcements
16. `sage.js` — Sage AI
17. `settings.js` — Settings
18. `help.js` — Help center
19. `admin.js` — Admin panel
20. `owner-messages.js` — Owner contact messages
21. `swipe.js` — Mobile gestures
22. `app.js` — `enterApp()` initialization

---

## Backend — Request Flow

```
Request → server.js (CORS, CSP, rate limiter)
       → middleware/auth.js (JWT verification)
       → route handler (Supabase query, validation)
       → JSON response
       ↓ on error:
       error-handler.js (logs to disk, sanitized response)
```

Socket.IO handles real-time events: messages, typing indicators, online status, ban/unban.

---

## Features in Detail

### 1. Private Chat
- Real-time 1-on-1 messaging via Socket.IO
- Reply to specific messages (inline preview)
- Image upload (up to 5 at once, auto-compressed to max 800px)
- Typing indicators, read receipts
- Mobile swipe-to-reply
- Conversation auto-cleanup: oldest 5 messages deleted when conversation hits 20

### 2. Global Chat
- Real-time public room — everyone sees every message
- `@username` mentions (highlighted in gold)
- `/commands` with autocomplete dropdown (`/ban`, `/unban`, `/tban`, `/tunban`)
- Owner messages have a red glow effect
- Image upload support
- Global chat auto-cleanup: oldest 30 deleted when total exceeds 200

### 3. Sage AI Assistant
- Powered by **Groq** (`llama-3.3-70b-versatile`)
- Adaptive personality: gender-aware tone, serious-topic detection, no unwanted swearing
- Image analysis via vision model (`meta-llama/llama-4-scout-17b-16e-instruct`)
- Multi-chat history (up to 10 chats, 20 messages each; chats older than 60 days auto-dropped)
- Daily request limit (`SAGE_DAILY_LIMIT`, default 5): failed/busy/invalid requests are refunded and don't count toward the quota
- Base64 image data URLs are stripped before `sage_history` is saved (JSONB stays small; images render in-session only)
- Context window: last 10 messages sent to provider
- Temperature: 0.7, max 1024 tokens
- **Live tools** (`backend/services/tools.js`): Sage fetches weather (Open-Meteo), news (Google News RSS + Hacker News fallback), and KatChat announcements **only when asked** — compact structured context, never raw JSON. All calls are keyless & server-side.
- See **AI_BEHAVIOR.md** for full personality and provider details

### 4. Friends System
- Search users by name/username
- Send/accept/decline friend requests
- Mutual friends display, suggested friends
- Online status indicators
- Friends list appears in sidebar for quick chat access

### 5. Announcements
- Admin-created posts with title, content, optional image
- Pin announcements (gold glow)
- Comments on announcements (banned users view-only)
- Admin Panel management (create, edit, pin)

### 6. Roles & Permissions
- **Member** (gray): chat, global chat, view & comment on announcements
- **Admin** (cyan): + ban users, delete messages, create announcements, admin panel
- **Owner** (red): + manage roles, manage users, full control, glowing messages
- Custom roles: configurable name, color, icon, and granular permissions via Admin Panel

### 7. Admin Panel
- **Users tab**: search, view, ban/unban, reset password, assign roles
- **Roles tab**: create/edit custom roles with permission toggles
- **Bans tab**: view active bans, lift bans
- **Posts tab**: create, pin, or delete announcements
- **Help Center tab** (owner only): edit HTML content of each help section
- **Contact Messages tab**: view and reply to owner contact messages

### 8. Help Center
- 6 collapsible sections: Getting Started, Key Features, Commands, Roles & Permissions, FAQ, Contact Owner
- Content is fetched from `GET /api/help` (seeded from `backend/help-content.json`)
- Owner can edit section content in Admin Panel → Help Center tab
- Automatically falls back to static HTML if API is unavailable

### 9. Settings
- Edit display name, bio (max 20 words), gender
- Upload avatar
- Change password (requires current password)
- Dark/Light theme toggle (persisted to DB)
- Fast mode (disables animations for low-end devices)
- Notification toggles (private messages, announcements)
- Forced password change after admin reset

### 10. Notifications (Browser)
- Private message notifications via `notificationSystem.notifyPrivateMessage()`
- Announcement notifications via 60-second polling (`checkNewAnnouncements`)
- Per-type toggles in Settings, stored in localStorage
- Click notification opens the relevant chat/view
- Graceful fallback if Notification API unavailable or permission denied

---

## Database Schema (PostgreSQL via Supabase)

7 tables:

- **users** — id, display_name, username, email, password (bcrypt), gender, profile_picture, profile_color, role, is_banned, temp_ban_until, must_change_password, theme, accented_color, intro_seen, sage_history (JSONB), is_online, last_seen, pronouns, bio, accent_color
- **roles** — name, color, icon, permissions (JSONB), is_system
- **messages** — id, sender_id, content, images (TEXT[]), type (private|global), conversation_id, reply_to, mentions, deleted, is_owner_message, read_by (UUID[])
- **friends** — user_id, friend_id, status (pending|accepted)
- **announcements** — id, title, content, image, author_id, pinned, created_at
- **announcement_comments** — id, announcement_id, author_id, content, deleted
- **image_uploads** — user_id, upload_date, count (daily limit enforcement)

Triggers: auto-cleanup of old private (keep 20) and global (keep 200) messages.

---

## Socket.IO Events

| Event | Direction | Purpose |
|-------|-----------|---------|
| `send_private_message` | Client→Server | Send private msg |
| `send_global_message` | Client→Server | Send global msg + command handling |
| `delete_message` | Client→Server | Delete own or any (admin) msg |
| `typing_start/stop` | Client↔Server | Typing indicators |
| `message_read` | Client→Server | Mark conversation read |
| `join_conversation` | Client→Server | Join socket room |
| `admin_ban/unban_user` | Client→Server | Real-time ban enforcement |
| `get_online_count` | Client→Server | Request current online count |
| `user_status` | Server→Client | Online/offline updates |
| `online_count` | Server→Client | Broadcast online user count |
| `banned_from_global` | Server→Client | Real-time ban notification |
| `unbanned_from_global` | Server→Client | Real-time unban notification |

---

## Security Layer

| Measure | Implementation |
|---------|---------------|
| XSS Prevention | `esc()` HTML-escaping, `safeJsonForOnclick()`, CSP headers |
| Input Validation | 20+ frontend validators, server-side length/format checks |
| Rate Limiting | 300 req/min per IP (in-memory) |
| Auth | JWT with bcrypt password hashing |
| Image Filter | Only JPEG/PNG/GIF/WebP allowed |
| CSP | Strict Content-Security-Policy header |
| CORS | Restricted to configured origins |

---

## Known Issues & Limitations

| Issue | Impact |
|-------|--------|
| RLS not enabled | service_role key bypasses RLS — refactor needed for anon-key migration |
| `sage_history` stored as JSONB | Not normalized — migration risks data loss |
| No email verification | Users can sign up with any email |
| No email notification on password reset | Admin resets password, but user isn't emailed |
| Socket.IO not rate-limited | Socket events have no rate limiting |
| Error logs not rotated | Daily log files grow unbounded |
| No streaming for Sage AI | Responses are full-text, not token-by-token |

---

## Applied Fixes History

### Phase 1 — Debug & Stabilize
Centralized error tracking (`error-handler.js`), function safety layer (`fixes.js`), startup validation (`bindings.js`), 20+ validators (`validation.js`), rate limiter (100 req/min), script load ordering with `defer`, health endpoint.

### Phase 2a — Backend & Database Security
Server-side XSS rejection, CSP headers, temp ban persisted to DB, shared `imageFileFilter`, `validateMaxLength` on all text fields, restricted CORS, DB indexes, MulterError handler.

### Phase 2b — Frontend XSS & UI Fixes
`esc()` now escapes single quotes, `safeJsonForOnclick()` for onclick handlers, image src escaping, null-safety with optional chaining, ARIA roles for toasts and modals.

### Phase 2c — Sage AI Behavior Improvements
Reduced nickname frequency (1–2 per convo), serious-topic detection, swearing changed to "don't initiate", "answer first" priority rule, temperature 0.8→0.7.

### Phase 2d — Architecture & Code Quality
Deduplicated multer filter into `utils.js`, removed duplicate avatar builder, removed dead code, replaced silent `catch(() => {})` with `console.warn`.

### Phase 3 — Storage, Limits & Stability QA
Sage daily-limit slots now reserve-then-refund (failed/busy/invalid requests don't consume quota; stale date keys pruned from memory). Base64 image data URLs stripped from `sage_history` on save (existing stale blobs cleaned from DB). Global chat container no longer centers on large screens — messages align flush left. Verified bounded chat retention, storage sizes, auth guards, rate limiters, and secrets handling with browser/MCP QA.

---

## Debugging Tools

Available in browser console:

```js
getErrorLog()              // View all logged errors (200 max)
exportErrorLog()           // Download errors as JSON
runValidation()            // Full system validation report
validateCriticalFunctions()// Check 70+ functions exist
validateDomIds()           // Check 100+ DOM elements exist
trackPerf(label, fn)       // Measure sync operation time
trackPerfAsync(l, fn)      // Measure async operation time
```

Backend health: `GET /health` → `{"status":"ok"}`

### Error Codes

**Frontend:** `AUTH_FAILED`, `VALIDATION_ERROR`, `NETWORK_ERROR`, `TIMEOUT`, `NOT_FOUND`, `RATE_LIMITED`

**Backend:** `INVALID_EMAIL`, `WEAK_PASSWORD`, `INVALID_USERNAME`, `TOKEN_EXPIRED`, `INVALID_TOKEN`, `DB_ERROR`, `UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`

---

## Future Ideas

### Potential Features
- Voice/video calling (WebRTC), message reactions, message editing, file sharing, group chats, push notifications, OAuth login (Google/GitHub/Discord), message search, threads, user blocking, read receipts UI, custom emoji/stickers, E2E encryption

### Technical Improvements
- Database normalization, Redis caching, WebSocket rate limiting, automated test suite, CI/CD, Docker setup, log rotation, TypeScript migration, OpenAPI docs, i18n, PWA offline support

### UX/UI Ideas
- Customizable profiles, chat themes, markdown formatting, GIF support, voice messages, scheduled messages, message pinning, AMOLED dark theme

### Sage AI Enhancements
- Streaming responses, custom knowledge base, role-aware context, image generation, multi-modal input
