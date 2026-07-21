## Katchat

KatChat is a real time chat application with built in AI assistance. It includes global and private messaging, announcements, user roles, and a responsive interface designed for desktop and mobile.
- For guidance: Chat GPT
- Intial coding/devloping: Claude Sonnet
- Further developing/add new features: IDE's like Antigaravity, Opencode(Deepseek V4 Flashh)


## Features

- Real-time global and private chat
- Sage AI assistant(Don't give current news/answer)
- User authentication
- Role-based permissions
- Announcements
- Mobile-friendly interface

## Requirements
- Node.js 16+
- npm
- Supabase project
- Groq API key

## Getting Started

```bash
# clone the repository
git clone <repository-url>
cd KatChat

# install dependencies
cd backend
npm install

# create your environment file
cp .env.example .env

# run backend/schema.sql in the Supabase SQL Editor

# start the server
npm run dev
```

Open http://localhost:5000 in your browser.

## Environment Variables

Required:

- SUPABASE_URL
- SUPABASE_SERVICE_KEY
- JWT_SECRET
- GROQ_API_KEY

Optional:

- PORT (default: 5000)
- GROQ_MODEL
- GROQ_VISION_MODEL
- ADMIN_LOG_TOKEN

## Owner Account

Register with:

``katchat369@gmail.com``

The account will automatically receive the Owner role.

## Project

- `CONTEXT.md` contains project details.
- `DEPLOYMENT_GUIDE.md` contains deployment instructions.
