# KatChat: The "I swear it works" Chat App

Welcome to KatChat! It's a real time chat app with a built-in AI assistant, because apparently, we can't just talk to each other without a robot chiming in. It handles global chat, private DMs, announcements, and has user **roles** you know, the usual stuff so you can feel like a admin. It’s also responsive, so you can ignore people from your phone too.

### Who built this Mess?
*   **Guidance:** ChatGPT, Claude
*   **Initial heavy lifting:** Claude Sonnet (The architect)
*   **Ongoing maintenance/feature creep:** Various IDEs(Mainly Opencode TUI), Deepseek V4 Flashh, and me, trying to remember why I wrote this function this way.

---

### What it actually does
*   **Real time chat:** Global and private channels.
*   **Sage AI:** Our resident AI assistant. *Note: It’s not great at current events, so don't ask it who won the game last night.* It uses Groq's API key.
*   **Auth & Roles:** We’ve got user authentication and roles, so you can make yourself the admin.
*   **Announcements:** For when you need to yell at everyone at once.
*   **Mobile-friendly:** Works on your phone, so you have no excuse for not replying.

---

### Prerequisites (The "Don't skip this" section)
*   Node.js 16+ (If you're on an older version, just update it, seriously).
*   npm (or yarn, if you're feeling fancy).
*   A Supabase project (Go make one, because it’s free). (I'm broke😭)
*   A Groq API key (You need this for the AI to talk back).

---

### Getting Started
Clone it, install it, pray it runs.

```bash
# Clone the repo
git clone <repository-url>
cd KatChat

# Get the backend dependencies
cd backend
npm install

# Setup your env file
# Seriously, don't forget this part.
cp .env.example .env

# Go to Supabase, open the SQL Editor, and paste the schema.sql file.
# If you don't do this, nothing will work.

# Fire it up
npm run dev
```

Open `http://localhost:5000` and you are good to go.

---

### Environment Variables
You *need* these. If you miss one, the app will complain.

**Required:**
*   `SUPABASE_URL`
*   `SUPABASE_SERVICE_KEY` (Keep this secret, please🙏)
*   `JWT_SECRET`
*   `GROQ_API_KEY`

**Optional (but nice to have):**
*   `PORT` (Defaults to 5000, change it if you want to be difficult)
*   `GROQ_MODEL`
*   `GROQ_VISION_MODEL`
*   `ADMIN_LOG_TOKEN`

---

### The "God Mode" Account
If you register with `katchat369@gmail.com` the system automatically makes you the Owner. Don't abuse the power. Or do. I'm not your boss (idc)

---

### Other Files
*   `CONTEXT.md`: All the nitty-gritty details I didn't want to clutter this file with.
*   `DEPLOYMENT_GUIDE.md`: How to actually put this on the internet so other people can use it. Good luck.
