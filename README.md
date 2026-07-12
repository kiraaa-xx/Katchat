# KATCHAT — Real-Time Chat with AI Assistant

A full-stack real-time messaging platform with Sage AI, global chat, private messaging, role management, announcements with comments, and a mobile-first UI.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | Node.js, Express, Socket.IO |
| Database | Supabase (PostgreSQL) |
| AI | Groq (primary, free) / Anthropic (fallback) |
| Frontend | Vanilla JS SPA, CSS3, Font Awesome 6 |

## Features

| Feature | Details |
|---------|---------|
| Private Chat | Real-time, replies, image upload (max 5), swipe-to-reply |
| Global Chat | @mentions, owner glow effect, /commands with autocomplete |
| Friends | Search, requests, mutual friends, online status |
| Announcements | Images, pinning, comments (banned users view-only) |
| Sage AI | Groq-powered, chat history (5 exchanges), image analysis |
| Roles | Custom name, color, icon, permissions |
| Admin Panel | Ban with reason, unban, role assign, post management, password reset |
| Owner | Glowing messages, crown badge, full control |
| Mobile | Swipe-to-reply, responsive, PWA manifest |
| Themes | Dark/Light per user, persisted to DB |
| Security | XSS escaping, input validation, rate limiting (100 req/min), CSP headers |

## Prerequisites

- **Node.js** v18+ (includes `npm`)
- **Supabase account** — free tier at https://supabase.com
- **Groq API key** — free at https://console.groq.com (no credit card needed)

## Local Setup

### 1. Install Dependencies

```bash
cd backend
npm install
```

### 2. Create Supabase Project

1. Go to https://supabase.com and sign up / log in
2. Click **New project**
3. Choose a name (e.g. `katchat`), set a database password, pick a region
4. Wait for the database to provision (~1 minute)

### 3. Run Database Schema

1. In the Supabase dashboard, go to **SQL Editor**
2. Click **New Query**
3. Open `backend/schema.sql` from the project and paste the entire contents
4. Click **Run** — all tables, indexes, and triggers are created

### 4. Get Supabase Credentials

In the Supabase dashboard, go to **Project Settings → API** and copy:

- **Project URL** — looks like `https://xxxxxxxxxxxx.supabase.co`
- **service_role** secret key — starts with `eyJ...` (use this, **not** the anon key)

### 5. Create .env File

Copy `backend/.env` (or create it) and fill in every value:

```env
PORT=5000
SUPABASE_URL=https://xxxxxxxxxxxx.supabase.co
SUPABASE_SERVICE_KEY=eyJhbGci...
JWT_SECRET=make_this_long_and_random_change_me

GROQ_API_KEY=gsk_xxxxxxxxxxxxxxxxxxxx
GROQ_MODEL=llama-3.3-70b-versatile
GROQ_VISION_MODEL=meta-llama/llama-4-scout-17b-16e-instruct

# Optional
ANTHROPIC_API_KEY=sk-ant-...
```

All variables are explained in the **Environment Variables** section below.

### 6. Start the Server

```bash
cd backend
npm run dev
```

Expected output:
```
Supabase connected
KatChat running on http://localhost:5000
```

If you see `Supabase connected` instead of an error, everything works.

### 7. Open in Browser

Go to **http://localhost:5000**. You should see the KatChat login/signup page.

### 8. Owner Account

Sign up with **`katchat369@gmail.com`** — this email is automatically assigned the **Owner** role. Use a different email for regular member accounts.

## Environment Variables

All values go in `backend/.env`.

### Server
| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `PORT` | No | `5000` | HTTP server port |
| `NODE_ENV` | No | `development` | Set to `production` for deployment |

### Database (Supabase)
| Variable | Required | Description |
|----------|----------|-------------|
| `SUPABASE_URL` | **Yes** | Project URL from Supabase dashboard (Project Settings → API) |
| `SUPABASE_SERVICE_KEY` | **Yes** | `service_role` secret key (NOT the anon/public key) |

### Authentication
| Variable | Required | Description |
|----------|----------|-------------|
| `JWT_SECRET` | **Yes** | Random string used to sign auth tokens. Generate with: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |

### AI Provider — Groq (Primary)
| Variable | Required | Description |
|----------|----------|-------------|
| `GROQ_API_KEY` | **Yes** | Free API key from https://console.groq.com |
| `GROQ_MODEL` | No | `llama-3.3-70b-versatile` (best quality) — change to any Groq-supported model |
| `GROQ_VISION_MODEL` | No | `meta-llama/llama-4-scout-17b-16e-instruct` — used for image analysis |

### AI Provider — Anthropic (Fallback)
| Variable | Required | Description |
|----------|----------|-------------|
| `ANTHROPIC_API_KEY` | No | If set and Groq is unavailable, Sage falls back to Claude |

### Admin
| Variable | Required | Description |
|----------|----------|-------------|
| `ADMIN_LOG_TOKEN` | No | Secret token to access error logs at `GET /api/logs?token=...`. Only needed in production. |

## Sage AI Setup

Sage is the built-in AI assistant. It requires a Groq API key (free, no credit card).

### Get a Groq Key

1. Go to https://console.groq.com
2. Sign up (Google or GitHub)
3. Click **API Keys** in the left sidebar
4. Click **Create API Key**
5. Copy the key (starts with `gsk_...`)
6. Add it to `.env`:
   ```env
   GROQ_API_KEY=gsk_your_key_here
   ```

### Test AI Chat

1. Start the server and open http://localhost:5000
2. Sign up / log in
3. Click the Sage icon in the sidebar or bottom nav
4. Type a message and press Enter
5. Sage should respond within 1–3 seconds

If Sage returns a static message saying "someone forgot to plug me in", the `GROQ_API_KEY` is missing or incorrect.

## Testing Checklist

### Signup / Login
- [ ] Create a new account — fill in display name, username, email, password, gender
- [ ] Log out, log back in with the same credentials
- [ ] Verify you land on the welcome screen with sidebar
- [ ] Test that invalid inputs show validation errors (bad email, short password)

### Global Chat
- [ ] Send a message in global chat — it appears immediately
- [ ] Send a message with `@username` — mention is highlighted
- [ ] Type `/` to see command suggestions
- [ ] Post an image in global chat

### Private Chat
- [ ] Click a user in the online list or search for a user
- [ ] Send a private message — it appears in real-time
- [ ] Reply to a message (click reply icon)
- [ ] Upload images in a private message (max 5)
- [ ] Test swipe-to-reply on mobile view

### Image Upload
- [ ] Upload a JPEG, PNG, GIF, or WebP — succeeds
- [ ] Upload a non-image file (e.g. `.txt`) — rejected with error message
- [ ] Upload an image larger than 10MB — rejected

### Sage AI
- [ ] Open Sage chat and send a message — AI responds
- [ ] Ask a serious question (mental health, trauma) — Sage matches the tone
- [ ] Send an image for analysis (camera icon in chat input)
- [ ] Verify Sage remembers context from earlier in the conversation
- [ ] Start a new Sage chat (if multi-chat UI exists)

### Admin Features
- [ ] Log in as owner (`katchat369@gmail.com`)
- [ ] Open Admin Panel — user list loads
- [ ] Ban a user with a reason — they are locked out immediately
- [ ] Unban the user — they can log in again
- [ ] Create a custom role in Admin Panel → Roles
- [ ] Assign the role to a user
- [ ] Reset a user's password (owner only) — temporary password modal appears
- [ ] Log in as the affected user — forced password change screen shows

## Roles

| Role | Color | Permissions |
|------|-------|-------------|
| member | Gray | Chat, global, view announcements, comment |
| admin | Cyan | + Ban users, delete messages, create announcements, admin panel |
| owner | Red | + Manage roles, manage users, full control, glowing messages |
| Custom | Any | Configurable in Admin Panel → Roles |

## Admin Commands (Global Chat)

```
/ban @username "reason"       — Permanently ban
/unban @username              — Remove ban
/tban @username 2.5 "reason"  — Temp ban for 2.5 hours
/tunban @username             — Remove temp ban early
```

Type `/` in global chat to see command suggestions. Type `@` after a command to search users.

## Password Reset Tutorial

### User: Change Your Own Password (Settings)

1. Click **Settings** in the sidebar/bottom nav
2. Scroll to the **Security** card
3. Enter your **current password**
4. Enter a **new password** (minimum 8 characters)
5. Click **Change Password**
6. A success toast confirms the change — log out and test the new password

> If you see an error "Current password is incorrect", re-enter your current password carefully (Caps Lock may be on).

### Admin: Reset Another User's Password

1. Open **Admin Panel → Users**
2. Find the user and click the **key icon** (Reset Password)
3. Copy the temporary password shown in the modal — share it securely with the user
4. The user logs in with the temporary password
5. They are forced to set a new password before entering the app
6. Once set, they can use the app normally

> Temporary passwords are shown only once. If the admin closes the modal, they must generate a new reset.

### Troubleshooting

| Problem | Fix |
|---------|-----|
| "Current password is incorrect" | Your current password doesn't match the stored one. Use "Forgot password" or ask an admin to reset it. |
| "Password must be at least 8 characters" | The new password must be 8 or more characters long. |
| Admin reset doesn't work | Only the **Owner** role can reset passwords. Check your role permissions. |

## Deployment Notes

### Deploy on Render

1. Push the project to GitHub
2. Go to https://render.com → **New Web Service**
3. Connect your GitHub repository
4. Configure:
   - **Root Directory:** `backend`
   - **Build Command:** `npm install`
   - **Start Command:** `node server.js`
5. Add all environment variables from the **Environment Variables** section above
6. Click **Create Web Service**
7. Update the canonical URL in `frontend/public/index.html`:
   ```html
   <link rel="canonical" href="https://your-app.onrender.com/">
   ```

### Required Environment Variables for Deployment

All of these must be set in your hosting dashboard:

| Variable | Why It's Required |
|----------|-------------------|
| `SUPABASE_URL` | Database connection |
| `SUPABASE_SERVICE_KEY` | Database authentication (service_role, not anon) |
| `JWT_SECRET` | Token signing — use a long random value per deployment |
| `GROQ_API_KEY` | Sage AI assistant |
| `NODE_ENV=production` | Enables production mode (hides stack traces, etc.) |

### Post-Deployment Checks

- [ ] Visit `https://your-app.onrender.com` — loads without errors
- [ ] Sign up and log in
- [ ] Check `https://your-app.onrender.com/health` — returns `{"status":"ok"}`
- [ ] Test Sage AI responds

## Adding Logos

| File | Purpose |
|------|---------|
| `frontend/public/assets/logo.png` | Main logo (256×256 PNG) |
| `frontend/public/assets/sage-logo.png` | Sage AI icon (256×256 PNG, auto-rotates) |
| `frontend/public/assets/favicons/favicon.ico` | Browser tab icon |
| `frontend/public/assets/favicons/favicon-32x32.png` | 32px favicon |
| `frontend/public/assets/favicons/apple-touch-icon.png` | iOS home screen icon |

## Troubleshooting

| Problem | Fix |
|---------|-----|
| `Supabase error` | Wrong URL or key in `.env` — use `service_role`, not anon |
| `Request failed` (signup/login) | Re-run `schema.sql` in Supabase SQL Editor |
| Sage not responding | Check `GROQ_API_KEY` in `.env` — get free key at console.groq.com |
| Images too large | Already compressed client-side (max 800px before sending) |
| Online status not working | 30s heartbeat syncs it; works correctly after deploy |
| Owner glow not showing | Only shows on OTHER users' messages when they have Owner role |
| Ban not immediate | Ban updates instantly via socket — no page refresh needed |
| `Module not found` | Run `npm install` in the `backend/` directory |
