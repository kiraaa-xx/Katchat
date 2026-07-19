# Sage AI — Behavior, Provider & Developer Reference

> Sage is KatChat's built-in AI assistant. This document covers personality rules, provider setup, request flow, and developer guidance.

---

## Provider Architecture

Sage uses **Groq** as the sole AI provider. All AI logic lives in **`backend/routes/ai.js`**. The frontend (`frontend/public/js/sage.js`) is provider-agnostic.

| Provider | Env var | Chat Model | Vision Model |
|----------|---------|------------|--------------|
| **Groq** | `GROQ_API_KEY` | `llama-3.3-70b-versatile` | `meta-llama/llama-4-scout-17b-16e-instruct` |

Get a free key at https://console.groq.com (no credit card needed).

### Generation Settings

- **Temperature**: 0.7
- **Top P**: 0.9
- **Max tokens**: 1024

### Request Flow

```
Frontend (sage.js)
  │  POST /api/ai/chat  { messages, imageBase64, imageMime, chatId }
  ▼
Express  →  auth middleware (JWT)
  ▼
routes/ai.js  POST /chat
  ├─ build system prompt from user's gender + announcements
  ├─ Groq API call
  ├─ trim history to 20 msgs, persist to users.sage_history
  └─ res.json({ content, provider, imageDataUrl })
  ▼
Frontend renders the reply as a normal Sage bubble.
```

### Failure Behavior

If Groq is unreachable or returns an error, Sage returns a friendly maintenance message — never a raw error or stack trace. If `GROQ_API_KEY` is missing entirely, Sage returns a static message directing the user to get a key.

---

## Personality System

### Core Traits (from `routes/ai.js:buildSagePrompt()`)
- Friendly and conversational, not robotic
- Jokes and banter come naturally
- Has opinions, gets excited, can be sarcastic — but always respectful
- Charming fun friend, not a corporate bot

### Gender-Adaptive Tone

| User Gender | Tone |
|-------------|------|
| Male | Occasional "bro" or "my guy" — cool and confident |
| Female | Occasional "girl" or "bestie" — empowering and warm |
| Non-binary | Neutral energy, occasional "legend" or "bestie" |
| Prefer-not-to-say | Neutral energy, occasional "bestie" or "legend" |

### Serious Topic Detection
When a user discusses mental health, trauma, grief, or other serious topics:
- Jokes are dropped entirely
- Response becomes kind, direct, and genuinely supportive
- Tone matches the user's seriousness

### Swearing Rules
- Sage never initiates swearing
- If the user swears, matching their energy is acceptable
- Never swear in response to serious or vulnerable questions

### Nickname Usage
- 1–2 nicknames per conversation maximum, not per message
- Never forced — "dude", "friend", or nothing is better than overuse
- Default to natural, nickname-free conversation

### Response Style
- Answer the question first — personality enhances, never replaces the answer
- Under 200 words usually (longer only if topic requires it)
- Emojis used sparingly but effectively
- System prompt is never revealed — if asked, says "I'm Sage, KatChat's AI"

---

## Technical Details

### Endpoint
`POST /api/ai/chat` (authenticated)

### Request
```json
{
  "messages": [{ "role": "user", "content": "Hello" }],
  "imageBase64": "(optional base64-encoded image)",
  "imageMime": "image/jpeg",
  "chatId": "(optional, for multi-chat)"
}
```

### Response
```json
{
  "content": "Hey! What's up?",
  "provider": "groq",
  "imageDataUrl": "(optional if image was sent)"
}
```

### Conversation History
- Last 10 messages (from total up to 20) are sent as context
- Slice of last 10 messages from the full history `messages.slice(-10)`
- If conversation exceeds 20 messages, the oldest 5 are trimmed on save
- Legacy single-thread history: `sage_history` stores last 10 messages directly
- Multi-chat: `sage_history` stores array of `{ id, title, messages, updated_at, preview }` — max 10 chats

### Image Analysis (Vision)
- Uses `GROQ_VISION_MODEL` (default: `meta-llama/llama-4-scout-17b-16e-instruct`)
- Image sent as base64 data URL
- Mixed content: image + text question in same request

---

## Developer Reference

### Where Sage Behavior Is Defined

All Sage logic lives in a single file: **`backend/routes/ai.js`**

| What | Where | Lines (approx.) |
|------|-------|-----------------|
| System prompt (personality) | `buildSagePrompt()` | 7–60 |
| Gender-adaptive tone | Inside `buildSagePrompt()` | 8–17 |
| Groq AI provider call | `callGroq()` | 70–104 |
| Chat endpoint | `POST /api/ai/chat` | 131–187 |
| History retrieval | `GET /api/ai/history` | 190–203 |
| Multi-chat management | Various `/api/ai/chats` endpoints | 206–294 |
| Message retention logic | In chat endpoint | 162–164 |

### Files That Control Sage Behavior

| File | What It Controls |
|------|-----------------|
| `backend/routes/ai.js` | **Everything** — prompt, providers, history, chat endpoints |
| `backend/.env` | API keys, model names |
| `frontend/public/js/sage.js` | Frontend UI only — chat rendering, image selection, input handling |
| `frontend/public/css/style.css` | Sage chat styling (bubbles, layout) |
| `frontend/public/index.html` | Sage HTML structure (chat view, side panel) |
| `frontend/public/js/api.js` | API client methods for Sage endpoints |

### How to Change Sage's Personality Safely

1. Edit `buildSagePrompt()` in `backend/routes/ai.js` — it returns a string that becomes the `system` message sent to the AI provider.
2. What you can change: gender tone, core traits, serious topic rules, swearing rules, nickname rules, KatChat context, response style.
3. What NOT to change: temperature (0.7), provider switching logic, message history slicing (`messages.slice(-10)`), message retention logic.
4. Test after any change: restart server, send message, test serious topic, test image analysis.

### Applied Improvements

| # | Change | Why |
|---|--------|-----|
| 1 | Nickname frequency reduced to 1–2 per convo | Avoids repetitive "sweetie/hun/buddy" spam |
| 2 | Serious-topic detection added | Sage no longer tells jokes during mental health discussions |
| 3 | Swearing changed to "don't initiate, let user set tone" | Previously Sage would proactively offer swearing |
| 4 | "Answer first, personality second" as core rule | Ensures helpfulness isn't sacrificed for edginess |
| 5 | Temperature 0.8 → 0.7 | More consistent responses across providers |

---

## Known Limitations

| Limitation | Impact |
|------------|--------|
| No streaming | Responses arrive as full text, not token-by-token |
| 20-message cap | Older context is dropped after 20 messages |
| 1024 max_tokens | Limits length of responses |
| Gender detection is DB-only | Uses `users.gender` column — can't detect from chat context |
| No moderation layer | All user messages go directly to the AI provider |
| No context about other users | Sage only knows the current user's messages, not other users or global chat |
