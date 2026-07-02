# Sage AI Behavior — Developer Reference

## ⚠️ WARNING: Sage is currently working correctly. Do NOT modify casually.

Changes to Sage's prompt, personality, providers, or memory logic can break the assistant for all users. Only modify if you have a specific, tested change to make.

## Where Sage's Behavior Is Defined

All Sage logic lives in a single file: **`backend/routes/ai.js`**

| What | Where | Lines |
|------|-------|-------|
| System prompt (personality) | `buildSagePrompt()` | 7–60 |
| Gender-adaptive tone | Inside `buildSagePrompt()` | 8–17 |
| Groq AI provider call | `callGroq()` | 70–104 |
| Anthropic fallback call | `callAnthropic()` | 107–128 |
| Chat endpoint | `POST /api/ai/chat` | 131–187 |
| History retrieval | `GET /api/ai/history` | 190–203 |
| Multi-chat management | Various `/api/ai/chats` endpoints | 206–294 |
| Provider detection | `getProvider()` | 63–67 |
| Message retention logic | Lines 162–164 in chat endpoint | 162–164 |

## How to Change Sage's Personality Safely

### 1. Edit the system prompt

Modify `buildSagePrompt()` in `backend/routes/ai.js` lines 7–60. The function returns a string that becomes the `system` message sent to the AI provider.

### 2. What you can change

- **Gender tone** (lines 9–17) — how Sage addresses users by gender
- **Core traits** (lines 21–26) — fundamental personality description
- **Serious topic rules** (lines 28–30) — how Sage handles mental health, trauma, etc.
- **Swearing rules** (lines 32–35) — when Sage can match user swearing
- **Nickname rules** (lines 37–40) — how often Sage uses nicknames
- **KatChat context** (lines 42–50) — what Sage knows about the app (features, owner email, etc.)
- **Response style** (lines 52–58) — conciseness, emoji use, answer priority

### 3. What NOT to change

- **Temperature** (line 99) — currently 0.7. Lower = more predictable, higher = more creative.
- **Provider switching logic** — `getProvider()` determines which AI to call.
- **Message history slicing** — `messages.slice(-10)` limits context to last 10 messages.
- **Message retention** — lines 162–164 enforce 20-message max, trimming oldest 5.

### 4. Test after any change

1. Restart the backend server
2. Open Sage chat
3. Send a message — verify Sage responds
4. Test with a serious topic (e.g. "I'm feeling depressed") — verify tone matches
5. Test with an image — verify vision analysis works

## Provider Configuration

### Groq (Primary — Free)

Configured in `.env`:

```env
GROQ_API_KEY=gsk_your_key_here
GROQ_MODEL=llama-3.3-70b-versatile
GROQ_VISION_MODEL=meta-llama/llama-4-scout-17b-16e-instruct
```

- Used when `GROQ_API_KEY` is set and valid (checked in `getProvider()` line 64)
- Vision model is separate: used only when `imageBase64` is present in the request
- Temperature: 0.7 (line 99)
- Max tokens: 1024
- No streaming — response is returned as a single block

### Anthropic (Fallback — Optional)

```env
ANTHROPIC_API_KEY=sk-ant_your_key_here
```

- Only used if Groq is unavailable AND Anthropic key is set
- Model: `claude-sonnet-4-20250514` (line 123)

### No Provider

If neither key is set, Sage returns a static message directing users to get a Groq key (line 148).

## Files That Control Sage Behavior

| File | What It Controls |
|------|-----------------|
| `backend/routes/ai.js` | **Everything** — prompt, providers, history, chat endpoints |
| `backend/.env` | API keys, model names |
| `frontend/public/js/sage.js` | **Frontend UI only** — chat rendering, image selection, input handling |
| `frontend/public/css/style.css` | Sage chat styling (bubbles, layout) |
| `frontend/public/index.html` | Sage HTML structure (chat view, side panel) |
| `frontend/public/js/api.js` | API client methods for Sage endpoints |
| `frontend/public/js/bindings.js` | Function validation for Sage UI functions |
| `frontend/public/js/fixes.js` | Fallbacks for Sage UI functions (safety layer) |

## Previous Behavior Improvements

For a history of Sage fixes and behavior changes, see `BUGS_AND_ISSUES.md` section **"Phase 2c — Sage AI Behavior Improvements"**.
