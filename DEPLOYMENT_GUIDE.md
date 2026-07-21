# KatChat — Deployment Guide

## Table of Contents

1. [Local Development](#local-development)
2. [Vercel Deployment](#vercel-deployment)
3. [Alternative Deployments (Railway / Render)](#alternative-deployments-railway--render)

---

## Local Development

### Requirements

- **Node.js** v16 or later
- **npm** (comes with Node.js)
- A **Supabase** account (free tier at https://supabase.com)
- A **Groq** API key (free at https://console.groq.com)

### Step-by-Step Setup

**1. Clone the repository**

```bash
git clone <repo-url>
cd katchat
```

**2. Install backend dependencies**

```bash
cd backend
npm install
```

**3. Set up Supabase**

- Create a project at https://supabase.com
- Go to **SQL Editor**, open and run `backend/schema.sql` to create all tables
- Copy your **Project URL** and **`service_role` key** from **Project Settings → API**

**4. Configure environment variables**

Copy `backend/.env.example` to `backend/.env` and fill in:

```env
PORT=5000
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_KEY=eyJ...   # service_role key (NOT anon key)
JWT_SECRET=<random hex string>

GROQ_API_KEY=gsk_...          # Get at https://console.groq.com
GROQ_MODEL=llama-3.3-70b-versatile
GROQ_VISION_MODEL=meta-llama/llama-4-scout-17b-16e-instruct

NODE_ENV=development
```

**5. Start the development server**

```bash
npm run dev
```

**6. Open the app**

Visit **http://localhost:5000** in your browser.

**7. Get Owner access (optional)**

Sign up with the email `katchat369@gmail.com` to get the **Owner** role.

---

## Vercel Deployment

### Limitations

> **Important:** Vercel's Hobby tier does NOT support WebSocket connections.
> Since KatChat relies on **Socket.IO** for real-time messaging (private chat, global chat, typing indicators, online status), **real-time features will not work** on the Vercel Hobby plan.
>
> For full functionality, use a platform that supports WebSockets (see [Alternative Deployments](#alternative-deployments-railway--render)).
> Vercel Pro+ does support WebSocket connections — check current plan details.

### What Will Work on Vercel (Hobby)

| Feature | Works? |
|---------|--------|
| REST API (login, signup, profile, etc.) | Yes |
| Sage AI chat (REST-based) | Yes |
| Static frontend | Yes |
| Help center | Yes |
| Private chat (real-time) | No |
| Global chat (real-time) | No |
| Admin panel (non-real-time parts) | Yes |

### Deployment Steps (Backend + Frontend on Vercel)

**1. Install Vercel CLI**

```bash
npm install -g vercel
```

**2. Create `vercel.json` in the project root**

```json
{
  "version": 2,
  "builds": [
    {
      "src": "backend/server.js",
      "use": "@vercel/node"
    },
    {
      "src": "frontend/public/**",
      "use": "@vercel/static",
      "config": {
        "outputDir": "../frontend/public"
      }
    }
  ],
  "routes": [
    {
      "src": "/api/(.*)",
      "dest": "backend/server.js"
    },
    {
      "src": "/socket.io/(.*)",
      "dest": "backend/server.js"
    },
    {
      "src": "/uploads/(.*)",
      "dest": "backend/server.js"
    },
    {
      "src": "/(.*)",
      "dest": "frontend/public/$1"
    }
  ]
}
```

**3. Add a `vercel` entry to `backend/package.json`**

```json
{
  "scripts": {
    "vercel-build": "echo 'Build complete'"
  }
}
```

**4. Deploy to Vercel**

```bash
vercel
```

Follow the prompts:
- Link to an existing project or create a new one
- Set the **Root Directory** to `.` (project root)
- Override settings if prompted

**5. Set environment variables in Vercel Dashboard**

Go to your project on Vercel → **Settings** → **Environment Variables** and add:

| Variable | Value |
|----------|-------|
| `PORT` | `5000` |
| `SUPABASE_URL` | Your Supabase project URL |
| `SUPABASE_SERVICE_KEY` | Your `service_role` key |
| `JWT_SECRET` | Random hex string |
| `GROQ_API_KEY` | Your Groq API key |
| `GROQ_MODEL` | `llama-3.3-70b-versatile` |
| `GROQ_VISION_MODEL` | `meta-llama/llama-4-scout-17b-16e-instruct` |
| `NODE_ENV` | `production` |

**6. Redeploy**

```bash
vercel --prod
```

### Alternative: Deploy Only the Frontend Static Files

If you deploy the backend separately, you can serve just the static frontend on Vercel.

**1. Create a `vercel.json` in `frontend/public/`**

```json
{
  "version": 2,
  "builds": [
    {
      "src": "**/*",
      "use": "@vercel/static"
    }
  ],
  "routes": [
    {
      "src": "/(.*)",
      "dest": "/$1"
    }
  ]
}
```

**2. Deploy**

```bash
cd frontend/public
vercel --prod
```

**3. Update the backend URL**

In `frontend/public/js/api.js`, make sure the API base URL points to your backend host.

---

## Alternative Deployments (Railway / Render)

Since KatChat relies heavily on WebSockets, these platforms are better suited:

### Railway (Recommended)

Railway supports Socket.IO natively and has a generous free tier.

1. Push your repo to GitHub
2. Go to https://railway.app, create a new project → **Deploy from GitHub repo**
3. Set **Root Directory** to `backend`
4. Add all environment variables (same as above)
5. Set **Start Command** to `node server.js`
6. Deploy — real-time features will work out of the box

### Render

Render supports WebSockets on paid plans only.

1. Create a **Web Service** from your GitHub repo
2. Set **Root Directory** to `backend`
3. **Build Command:** `npm install`
4. **Start Command:** `node server.js`
5. Add environment variables
6. Choose a plan that supports WebSockets (Starter+)

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | Node.js, Express, Socket.IO |
| Database | Supabase (PostgreSQL) |
| AI | Groq (`llama-3.3-70b-versatile`) |
| Frontend | Vanilla JS SPA, CSS3, Font Awesome 6 |
| Auth | JWT (jsonwebtoken + bcryptjs) |
| Uploads | Multer (images only: JPEG, PNG, GIF, WebP) |

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
