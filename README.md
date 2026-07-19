# KATCHAT — Real-Time Chat with AI Assistant

A full-stack real-time messaging platform with Sage AI, global chat, private messaging, role management, announcements with comments, and a mobile-first UI.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | Node.js, Express, Socket.IO |
| Database | Supabase (PostgreSQL) |
| AI | Groq (`llama-3.3-70b-versatile`) |
| Frontend | Vanilla JS SPA, CSS3, Font Awesome 6 |
| Auth | JWT (jsonwebtoken + bcryptjs) |
| Uploads | Multer (images only: JPEG, PNG, GIF, WebP) |

## Quick Start

```
cd backend
npm install
```

Create a Supabase project, run `backend/schema.sql` in the SQL Editor, then create `backend/.env`:

```env
PORT=5000
SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_SERVICE_KEY=eyJ...
JWT_SECRET=<random hex>
GROQ_API_KEY=gsk_...
```

```
npm run dev
```

Open **http://localhost:5000**. Sign up with `katchat369@gmail.com` for Owner role.

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `PORT` | No | `5000` | HTTP server port |
| `SUPABASE_URL` | **Yes** | — | Project URL from Supabase dashboard |
| `SUPABASE_SERVICE_KEY` | **Yes** | — | `service_role` secret key (not anon) |
| `JWT_SECRET` | **Yes** | — | Random hex string for token signing |
| `GROQ_API_KEY` | **Yes** | — | Free key from https://console.groq.com |
| `GROQ_MODEL` | No | `llama-3.3-70b-versatile` | Groq chat model |
| `GROQ_VISION_MODEL` | No | `meta-llama/llama-4-scout-17b-16e-instruct` | Groq vision model |
| `ADMIN_LOG_TOKEN` | No | — | Secret token for `GET /api/logs` |

## Features

| Feature | Details |
|---------|---------|
| Private Chat | Real-time 1-on-1, replies, image upload (max 5), swipe-to-reply |
| Global Chat | @mentions, owner glow, /commands with autocomplete |
| Friends | Search, requests, mutual friends, online indicators |
| Sage AI | Groq-powered, multi-chat history, image analysis, gender-adaptive tone |
| Announcements | Images, pinning, comments, admin management |
| Roles | Custom name/color/icon/permissions, 3 default roles (Member/Admin/Owner) |
| Admin Panel | Users, roles, bans, posts, help content, contact messages |
| Settings | Display name, bio, gender, avatar, theme, password, notification toggles |
| Security | XSS escaping (`esc()`), input validation, rate limiting (300 req/min), CSP headers |

## Roles

| Role | Color | Key Permissions |
|------|-------|----------------|
| Member | Gray | Chat, global, view announcements, comment |
| Admin | Cyan | + Ban users, delete messages, create announcements, admin panel |
| Owner | Red | + Manage roles/users, full control, glowing messages |

## Testing

Sign up two accounts (owner + member), then run `runValidation()` in browser console after login.

For full project documentation, see **CONTEXT.md**. For Sage AI behavior, see **AI_BEHAVIOR.md**.
