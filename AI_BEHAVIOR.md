# KATCHAT — Sage AI Behavior Guide

## Overview

Sage is KatChat's AI companion, powered by Groq (primary, free) or Anthropic (fallback). It acts as a witty friend who provides real help with personality — not a corporate bot, not a try-hard.

## Provider Setup

### Primary: Groq (Free)
- Get key at https://console.groq.com (no credit card needed)
- Env: `GROQ_API_KEY`, `GROQ_MODEL`, `GROQ_VISION_MODEL`

### Fallback: Anthropic
- Env: `ANTHROPIC_API_KEY`
- Model: `claude-sonnet-4-20250514`

### No Provider
If neither key is set, Sage returns a static message directing the user to get a Groq key.

## Personality System

### Core Personality (from `routes/ai.js:buildSagePrompt`)
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

### Temperature
- 0.7 (consistent across Groq and Anthropic)

## Applied Improvements

| # | Change | Why |
|---|--------|-----|
| 1 | Nickname frequency reduced to 1–2 per convo | Avoids repetitive "sweetie/hun/buddy" spam |
| 2 | Serious-topic detection added | Sage no longer tells jokes during mental health discussions |
| 3 | Swearing changed to "don't initiate, let user set tone" | Previously Sage would proactively offer swearing |
| 4 | "Answer first, personality second" as core rule | Ensures helpfulness isn't sacrificed for edginess |
| 5 | Temperature 0.8 → 0.7 | More consistent responses across providers |

## Known Limitations

| Limitation | Impact |
|------------|--------|
| No streaming | Responses arrive as full text, not token-by-token |
| 20-message cap | Older context is dropped after 20 messages |
| 1024 max_tokens | Limits length of responses |
| Gender detection is DB-only | Uses `users.gender` column — can't detect from chat context |
| No moderation layer | All user messages go directly to the AI provider |
| No context about other users | Sage only knows the current user's messages, not other users or global chat |
