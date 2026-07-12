# KatChat — Full Project Context

> *Use this document to understand the entire project at a glance and share it with others to get feedback, ideas, or contributions.*

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
| **AI** | Groq (primary, free) / Anthropic (fallback) |
| **Frontend** | Vanilla JS SPA, CSS3, Font Awesome 6 |
| **Auth** | JWT (jsonwebtoken + bcryptjs) |
| **Uploads** | Multer (images only: JPEG, PNG, GIF, WebP) |

---

## Codebase Structure

```
katchat/
├── README.md                   # Full setup guide & feature list
├── CONTEXT.md                  # This file
├── PROJECT_STRUCTURE.md        # Developer architecture reference
├── AI_BEHAVIOR.md              # Sage AI personality & provider config
├── SAGE_BEHAVIOR.md            # Developer reference for Sage internals
├── BUGS_AND_ISSUES.md          # Applied fixes, known issues, debug tools
├── package.json                # Root orchestrator (dev/start scripts)
│
├── backend/
│   ├── server.js               # Express entry: middleware, routes, socket, static serve
│   ├── supabase.js             # Supabase client (service_role key)
│   ├── utils.js                # Shared: imageFileFilter, sendError
│   ├── error-handler.js        # Central: ErrorLogger, AppError, rate limiter, validators
│   ├── schema.sql              # Full PostgreSQL schema (run in Supabase)
│   ├── .env                    # Env vars (not committed)
│   ├── middleware/
│   │   └── auth.js             # JWT auth, adminOnly, ownerOnly guards
│   ├── routes/
│   │   ├── auth.js             # POST /api/auth (login, signup, password reset)
│   │   ├── users.js            # GET/PUT /api/users (profile, search, avatar, friends)
│   │   ├── messages.js         # GET /api/messages (history, image upload)
│   │   ├── announcements.js    # CRUD /api/announcements + comments
│   │   ├── roles.js            # CRUD /api/roles (custom roles, permissions)
│   │   └── ai.js               # POST /api/ai/chat, history, multi-chat management
│   ├── socket/
│   │   └── index.js            # Socket.IO: messages, typing, bans, heartbeats, online count
│   ├── logs/                   # Daily error files: errors-YYYY-MM-DD.log
│   └── public/uploads/         # Uploaded images (avatars, message images, announcements)
│
├── frontend/
│   └── public/
│       ├── index.html          # SPA shell: views, modals, all scripts (defer ordered)
│       ├── css/
│       │   ├── style.css       # All styles: dark/light themes, components, responsive
│       │   ├── animations.css  # Intro screen, particle, glow, swipe animations
│       │   └── mobile.css      # Mobile-specific: bottom nav, swipe, compact layout
│       ├── js/
│       │   ├── fixes.js        # Safety foundation: fallback functions, safe DOM, polyfills
│       │   ├── error-handler.js# Frontend error logger, perf monitoring, 200-entry history
│       │   ├── bindings.js     # Startup validation: 70+ functions, 100+ DOM IDs
│       │   ├── validation.js   # esc() XSS sanitizer, 20+ validators
│       │   ├── api.js          # Fetch wrapper for all REST endpoints
│       │   ├── state.js        # Global app state object
│       │   ├── ui.js           # UI helpers: avatars, toasts, modals, image viewer
│       │   ├── socket-client.js# Socket.IO client: message handlers, ban events, typing
│       │   ├── auth.js         # Login, signup, forced password change flows
│       │   ├── chat.js         # Private chat: rendering, sending, replies, images
│       │   ├── global.js       # Global chat: @mentions, /commands, rendering
│       │   ├── friends.js      # Friend requests, search, accept/decline
│       │   ├── announcements.js# Announcements list, comments, create/edit (admin)
│       │   ├── sage.js         # Sage AI chat UI, image upload, chat history panel
│       │   ├── settings.js     # Profile edit, password change, theme toggle
│       │   ├── admin.js        # Admin panel: users, roles, bans, announcements
│       │   ├── app.js          # enterApp() init: auth check, view routing
│       │   └── swipe.js        # Mobile swipe-to-reply gesture handler
│       └── assets/
│           ├── logo.png        # Main app logo
│           ├── sage-logo.png   # Sage AI rotating icon
│           └── favicons/       # PWA favicons (all sizes + manifest)
│
└── .bug-hunter/                # Bug-hunter analysis artifacts (recon, findings, triage)
```

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
- Powered by **Groq** (free, primary), falls back to **Anthropic Claude**
- Adaptive personality: gender-aware tone, serious-topic detection, no unwanted swearing
- Image analysis via vision model
- Multi-chat history (up to 10 chats, 20 messages each)
- Context window: last 10 messages sent to provider
- Temperature: 0.7, max 1024 tokens
- Built-in personality defined in `backend/routes/ai.js:buildSagePrompt()`

### 4. Friends System
- Search users by name/username
- Send/accept/decline friend requests
- Mutual friends display
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
- **Owner** (red): + manage roles, manage users, glowing messages, full control
- Custom roles: configurable name, color, icon, and granular permissions via Admin Panel

### 7. Admin Panel
- **Users tab**: search, view, ban/unban, reset password, assign roles
- **Roles tab**: create/edit custom roles with permission toggles
- **Bans tab**: view active bans, lift bans
- **Posts tab**: create, pin, or delete announcements

### 8. Settings
- Edit display name, bio (max 20 words), gender
- Upload avatar
- Change password (requires current password)
- Dark/Light theme toggle (persisted to DB)
- Fast mode (disables animations for low-end devices)
- Forced password change after admin reset

### 9. Security Layer
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

## Database Schema (PostgreSQL via Supabase)

7 tables:
- **users** — id, display_name, username, email, password (bcrypt), gender, profile_picture, role, is_banned, temp_ban_until, must_change_password, theme, sage_history (JSONB), etc.
- **roles** — name, color, icon, permissions (JSONB), is_system
- **messages** — id, sender_id, content, images (TEXT[]), type (private|global), conversation_id, reply_to, mentions, deleted, is_owner_message, read_by (UUID[])
- **friends** — user_id, friend_id, status (pending|accepted)
- **announcements** — id, title, content, image, author_id, pinned
- **announcement_comments** — id, announcement_id, author_id, content, deleted
- **image_uploads** — user_id, upload_date, count (daily limit enforcement)

Triggers: auto-cleanup of old private (keep 20) and global (keep 200) messages.

---

## Script Load Order (Frontend)

Scripts are loaded with `defer` in this exact order:

1. **Socket.IO CDN** — library
2. **fixes.js** — foundation, fallbacks, safe DOM
3. **error-handler.js** — error tracking, async wrapping, perf
4. **bindings.js** — validates all functions & DOM IDs exist
5. **validation.js** — XSS escaping, validators
6. **api.js** — fetch client
7. **state.js** — app state
8. **ui.js** — UI components
9. **socket-client.js** — Socket.IO client events
10. **auth.js** — login/signup flows
11. **chat.js** — private chat
12. **global.js** — global chat
13. **friends.js** — friends system
14. **announcements.js** — announcements
15. **sage.js** — Sage AI
16. **settings.js** — settings
17. **admin.js** — admin panel
18. **swipe.js** — mobile gestures
19. **app.js** — `enterApp()` initialization

---

## Request Flow (Backend)

```
Request → server.js (CORS, CSP, rate limiter)
       → middleware/auth.js (JWT verification)
       → route handler (Supabase query, validation)
       → JSON response
       ↓ on error:
       error-handler.js (logs to disk, sanitized response)
```

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

## Known Issues & Limitations

| Issue | Impact |
|-------|--------|
| RLS not enabled on Supabase | service_role key bypasses RLS — refactor needed for anon-key migration |
| `sage_history` stored as JSONB | Not normalized — migration risks data loss |
| No email verification | Users can sign up with any email |
| No email notification on password reset | Admin resets password, but user isn't emailed |
| Socket.IO not rate-limited | Socket events have no rate limiting |
| Error logs not rotated | Daily log files grow unbounded |
| No streaming for Sage AI | Responses are full-text, not token-by-token |

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

---

## Asking for Ideas — Context for Contributors

When sharing this project to get ideas, here are areas where KatChat could grow:

### 🚀 Potential Features
- **Voice/video calling** (WebRTC integration)
- **Message reactions** (emoji reactions on messages)
- **Message editing** (edit sent messages)
- **File sharing** (PDFs, documents, etc.)
- **Group chats** (multi-user private rooms)
- **Push notifications** (web push API)
- **Email verification flow**
- **OAuth login** (Google, GitHub, Discord)
- **Message search** (full-text search across conversations)
- **Message threads** (nested replies)
- **User blocking** (block specific users)
- **Read receipts UI** (show who read each message)
- **Custom emoji/ sticker system**
- **End-to-end encryption** for private chats

### 🔧 Technical Improvements
- **Database normalization** (separate sage_history table)
- **Redis caching** for online users and rate limiting
- **WebSocket rate limiting**
- **Automated test suite** (unit + integration tests — currently none)
- **CI/CD pipeline**
- **Docker setup** for easy deployment
- **Log rotation** (winston or pino)
- **TypeScript migration**
- **API documentation** (OpenAPI/Swagger)
- **i18n / localization**
- **PWA offline support** (service worker + cache)

### 🎨 UX/UI Ideas
- **Customizable profiles** (profile banners, status messages)
- **Chat themes** (custom background colors/images per chat)
- **Message formatting** (bold, italic, code blocks, markdown)
- **GIF support** (Giphy or Tenor integration)
- **Voice messages** (record and send audio clips)
- **Scheduled messages**
- **Message pinning** (pin important messages in chat)
- **Dark mode improvements** (AMOLED theme)

### 🧠 Sage AI Enhancements
- **Streaming responses** (token-by-token)
- **Custom knowledge base** (upload docs for Sage to reference)
- **Role-aware context** (Sage knows about other users/conversations)
- **Image generation** (DALL-E or Stable Diffusion integration)
- **Multi-modal** (voice input, file analysis)

