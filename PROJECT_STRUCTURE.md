# KATCHAT Project Structure

## Directory Tree

```
katchat/
├── README.md                    # Project overview & setup
├── PROJECT_STRUCTURE.md         # This file
├── BUGS_AND_ISSUES.md           # Bugs, fixes, debugging
├── AI_BEHAVIOR.md               # Sage AI behavior rules
│
├── backend/
│   ├── server.js                # Express server entry point
│   ├── supabase.js              # Supabase client (service_role)
│   ├── utils.js                 # Shared utilities (imageFileFilter, sendError)
│   ├── error-handler.js         # Backend error middleware + rate limiter
│   ├── schema.sql              # Full database schema (run in Supabase)
│   ├── .env                    # Environment variables (not committed)
│   ├── middleware/
│   │   └── auth.js              # JWT auth, adminOnly, ownerOnly middleware
│   ├── routes/
│   │   ├── auth.js              # /api/auth — login, signup, password reset
│   │   ├── users.js             # /api/users — profile, search, avatar
│   │   ├── messages.js          # /api/messages — global, private, images
│   │   ├── announcements.js    # /api/announcements — posts + comments
│   │   ├── roles.js             # /api/roles — CRUD custom roles
│   │   └── ai.js                # /api/ai — Sage AI chat endpoint
│   ├── socket/
│   │   └── index.js             # Socket.IO — real-time events, bans, heartbeats
│   ├── public/uploads/          # Uploaded avatars, messages, announcements
│   ├── logs/                    # Daily error logs (errors-YYYY-MM-DD.log)
│   └── package.json
│
├── frontend/
│   └── public/
│       ├── index.html           # SPA entry with all script tags
│       ├── css/
│       │   └── style.css        # All styles (dark/light themes, animations)
│       └── js/
│           ├── fixes.js         # Safety layer — fallback functions, safe DOM
│           ├── error-handler.js # Frontend error tracking, perf monitoring
│           ├── bindings.js      # Function + DOM validation, safeCall wrappers
│           ├── validation.js    # Input validation, XSS escaping (esc)
│           ├── api.js           # HTTP client (fetch wrapper)
│           ├── state.js         # Global app state
│           ├── ui.js            # UI utilities: avatars, modals, toasts, esc
│           ├── socket-client.js # Socket.IO client event handlers
│           ├── auth.js          # Login, signup, password change flows
│           ├── chat.js          # Private chat rendering + sending
│           ├── global.js        # Global chat, @mentions, /commands
│           ├── friends.js       # Friend system (requests, search)
│           ├── announcements.js # Announcements + comments UI
│           ├── sage.js          # Sage AI chat interface
│           ├── settings.js      # User settings, theme toggle
│           ├── admin.js         # Admin panel (users, roles, bans)
│           ├── app.js           # App initialization (enterApp)
│           └── swipe.js         # Mobile swipe gestures
```

## Architecture Overview

```
┌──────────────┐     HTTP/WS      ┌──────────────┐     SQL      ┌──────────┐
│  Frontend    │ ───────────────> │  Express      │ ──────────> │Supabase  │
│  (Vanilla JS │ <─────────────── │  + Socket.IO  │ <────────── │PostgreSQL│
│   SPA)       │                  │               │             └──────────┘
└──────────────┘                  └──────────────┘
       │                                 │
       │                                 ├── Groq API (Sage AI)
       │                                 └── Anthropic (fallback)
       │
       └── Browser console tools:
           runValidation(), getErrorLog(), trackPerf()
```

### Frontend — Script Load Order

Scripts are loaded with `defer` to preserve order:

1. `socket.io` CDN — Socket.IO library
2. `fixes.js` — Foundation: fallback functions, safe DOM, global state init
3. `error-handler.js` — Error tracking, async wrapping, perf monitoring
4. `bindings.js` — Validates 70+ functions and 100+ DOM IDs exist at startup
5. `validation.js` — Input validation, XSS escaping (`esc()`)
6. `api.js` — HTTP client for REST endpoints
7. `state.js` — Global app state object
8. `ui.js` — UI components (avatars, toasts, modals)
9. `socket-client.js` — Socket.IO client event wiring
10. `auth.js` — Auth flows (login, signup, password reset)
11. `chat.js` — Private chat
12. `global.js` — Global chat
13. `friends.js` — Friends system
14. `announcements.js` — Announcements + comments
15. `sage.js` — Sage AI interface
16. `settings.js` — User settings
17. `admin.js` — Admin panel
18. `swipe.js` — Mobile gestures
19. `app.js` — `enterApp()` initialization

### Backend — Request Flow

```
Request → server.js (CORS, CSP, rate limiter) → middleware/auth.js (JWT) 
→ route handler → supabase query → response
                                    ↓
                             error-handler.js (logs, sanitizes)
```

Socket.IO handles real-time events: messages, typing indicators, online status, ban/unban.

## Key Modules

### Security Layer
| File | Role |
|------|------|
| `validation.js` (frontend) | `esc()` for XSS, 20+ validators (email, password, username, etc.) |
| `backend/utils.js` | `imageFileFilter` — restricts uploads to JPEG/PNG/GIF/WebP |
| `backend/middleware/auth.js` | JWT verification, admin/owner role guards |
| `backend/error-handler.js` | Rate limiting (100 req/min/IP) |
| `backend/server.js` | CSP headers, CORS restriction |

### Error Handling
| File | Role |
|------|------|
| `fixes.js` | Global fallback functions, safe DOM access |
| `error-handler.js` (frontend) | Centralized logger, 200-entry history, export as JSON |
| `error-handler.js` (backend) | Daily disk logs, admin endpoint, async wrapper |
| `bindings.js` | Startup validation of all functions and DOM IDs |

### Database Schema (`backend/schema.sql`)
- `users` — id, email, password, display_name, username, profile_*, role, is_banned, temp_ban_until, ban_reason, must_change_password, theme, intro_seen
- `messages` — id, sender_id, content, image, reply_to, created_at
- `announcements` — id, author_id, title, content, image, pinned, created_at
- `announcement_comments` — id, announcement_id, user_id, content, created_at
- `roles` — name, color, icon, permissions (JSONB)
- Indexes: email (unique), messages(sender_id), users(is_banned_from_global)
