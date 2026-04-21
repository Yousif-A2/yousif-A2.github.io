# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

A personal AI-powered portfolio website for Yousif Al-Nasser. The main feature is a real-time voice/text AI agent backed by Google Gemini Live 2.5 Flash. Visitors can speak with an AI that knows Yousif's bio, skills, projects, and experience.

## Running the Project

The FastAPI backend serves all static files — never open HTML files directly via `file://`.

```bash
pip install -r requirements.txt
python main.py
# Serves at http://localhost:5000
```

- Portfolio: `http://localhost:5000/`
- Voice Agent: `http://localhost:5000/voice-agent.html`
- Analytics Dashboard: `http://localhost:5000/dashboard` (requires token from `.env`)

### Docker

```bash
docker build -t yousif-ai .
docker run -p 5000:5000 -e GOOGLE_CREDENTIALS_JSON='<json>' -e DASHBOARD_TOKEN=<token> yousif-ai
```

## Architecture

### Request Flow

```
Browser (voice-agent.html)
  ↕ WebSocket /ws
FastAPI (main.py)
  ↕ Gemini Live API (google-genai SDK, Vertex AI, us-central1)
```

`main.py` is a **WebSocket proxy**: it forwards PCM audio from the browser to Gemini Live, streams back audio chunks and transcripts, records sessions to SQLite, and saves WAV files.

### WebSocket Message Protocol

Messages are JSON in both directions.

**Browser → Server:**

| Field | Type | Meaning |
|-------|------|---------|
| `setup` | object | First message; includes `session_type` and `system_instruction` (content-derived prompt) |
| `audio` | string | Base64 PCM (16kHz, 16-bit mono) chunk |
| `text` | string | Text message (bypasses mic) |
| `ping` | bool | Heartbeat every 20 s |

**Server → Browser:**

| Field | Type | Meaning |
|-------|------|---------|
| `status: "ready"` | string | Gemini session open; frontend can start mic |
| `audio` | string | Base64 PCM (24kHz, 16-bit mono) chunk from Gemini |
| `transcript` | string | Partial transcription chunk; `type` is `"model"` or `"user"` |
| `turn_complete` | bool | AI turn finished; flush transcript bubble |
| `pong` | bool | Heartbeat reply |
| `error` | string | Proxy or Gemini error |

### System Prompt Pipeline

The AI system prompt is assembled from two sources:

1. **`data/system-prompt.json`** — base rules and persona, loaded by `main.py` at startup into `BASE_SYSTEM_PROMPT`.
2. **`data/content.json`** — portfolio content (skills, projects, work history, contact info), fetched by `js/voice-agent.js:buildSystemPrompt()` at connect-time and appended to the setup message over WebSocket.

`main.py` concatenates them: `f"{BASE_SYSTEM_PROMPT}\n\n{frontend_context}"`.

### Audio Pipeline

1. Browser captures mic via `getUserMedia` at 16kHz
2. `js/audio-processor.js` (AudioWorklet) buffers Float32 PCM in 4096-sample chunks and posts them to the main thread
3. `js/voice-agent.js` converts Float32 → Int16, base64-encodes, and sends over WebSocket
4. `main.py` decodes and forwards raw PCM to Gemini Live as `audio/pcm;rate=16000`
5. Gemini returns PCM chunks at 24kHz; backend base64-encodes and sends back
6. Frontend decodes, queues, and plays via Web Audio API at 24kHz
7. At session end, backend converts the accumulated PCM buffer to WAV → `data/recordings/session_{id}.wav`

**Two separate AudioContexts:** `inputCtx` runs at 16kHz (microphone capture), `audioCtx` runs at 24kHz (playback). They are created and destroyed independently per session.

### Content Pipeline

All portfolio content lives in `data/content.json` (English) and `data/content-ar.json` (Arabic). `js/content-loader.js` fetches the correct file on page load and renders every HTML section (nav, home, about, skills, qualification, services, projects, contact, footer) from JSON — the HTML files contain almost no hardcoded text. When editing content, update both JSON files.

### Analytics

SQLite database at `data/analytics.db`. Tables: `sessions`, `messages`, `page_views`. Page views are posted to `/api/track` (unauthenticated, fire-and-forget). Session and message details are under `/api/analytics` and `/api/sessions`, which require `X-Dashboard-Token` header.

## Key Files

| File | Role |
|------|------|
| `main.py` | FastAPI server, WebSocket proxy to Gemini Live, SQLite analytics |
| `voice-agent.html` + `js/voice-agent.js` | Voice/text chat UI, audio pipeline, WebSocket client |
| `js/audio-processor.js` | AudioWorklet (runs in audio thread): buffers PCM and posts to main thread |
| `js/content-loader.js` | Fetches content JSON and renders all portfolio sections |
| `js/main.js` | Portfolio interactions: scroll-reveal, theme toggle, skills accordion, tabs, modals |
| `data/content.json` | All portfolio content (English) |
| `data/system-prompt.json` | Base system prompt for the AI agent |
| `dashboard.html` + `js/dashboard.js` | Analytics dashboard (token-gated, uses Chart.js) |
| `js/emailjs.js` + `js/config.js` | Contact form via EmailJS; `config.js` is generated (see below) |

## Environment Variables (`.env`)

```
GOOGLE_CLOUD_PROJECT=mystic-curve-416821
GOOGLE_CLOUD_LOCATION=us-central1
GOOGLE_APPLICATION_CREDENTIALS=service-account.json  # local dev
GOOGLE_CREDENTIALS_JSON=<json string>                 # Docker/Coolify
DASHBOARD_TOKEN=admin
EMAILJS_PUBLIC_KEY=<key>                              # needed for contact form
```

`js/config.js` (gitignored) is generated from `.env` by:

```bash
node scripts/generate-config.js
```

This writes `window.__EMAILJS_PUBLIC_KEY__` to `js/config.js`. Run it after cloning or changing the key.

## Multilingual Support

Language toggle (`js/content-loader.js`) switches between `data/content.json` and `data/content-ar.json`, sets `dir="rtl"` on `<html>`, and re-renders all sections. Theme preference and language preference are both persisted in `localStorage`. When editing content, update both JSON files. The Cairo font covers Arabic glyphs.

## Deployment

Designed for **Coolify** (self-hosted Docker). The backend must be running for the voice agent to work — this cannot be deployed as a purely static site. GitHub Pages can host only the static portfolio (`index.html`) without the voice agent.
