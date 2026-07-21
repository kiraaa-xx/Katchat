# KatChat — Real-Time Chat with AI Assistant

Full-stack real-time messaging platform with Sage AI, global chat, private messaging, role management, announcements, and a mobile-first UI.

---

## Requirements

- **Node.js** v16+
- **npm**
- **Supabase** account (free at https://supabase.com)
- **Groq** API key (free at https://console.groq.com)

---

## Quick Start

```bash
# 1. Install backend dependencies
cd backend
npm install

# 2. Set up environment variables
# Copy .env.example to .env and fill in your credentials:
#   SUPABASE_URL, SUPABASE_SERVICE_KEY, JWT_SECRET, GROQ_API_KEY
cp .env.example .env

# 3. Initialize the database
# Go to your Supabase Dashboard → SQL Editor → run backend/schema.sql

# 4. Start the development server
npm run dev
```

Open **http://localhost:5000** in your browser.

---

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

## Owner Access

Sign up with email `katchat369@gmail.com` to receive the **Owner** role automatically.

---

For full project details, see **CONTEXT.md**. For deployment, see **DEPLOYMENT_GUIDE.md**.
