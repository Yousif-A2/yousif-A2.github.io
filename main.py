import os
import stat
import base64
import asyncio
import json
import sqlite3
import threading
import time
import wave
import io
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Depends, Header, HTTPException, Request
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from google import genai
from google.genai.types import (
    AudioTranscriptionConfig, Blob, Content,
    HttpOptions, LiveConnectConfig, Modality, Part,
)
from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent
RECORDINGS_DIR = BASE_DIR / "data" / "recordings"
RECORDINGS_DIR.mkdir(parents=True, exist_ok=True)
load_dotenv(BASE_DIR / ".env", override=True)

# --- Credentials ---
_creds_raw = os.environ.get("GOOGLE_CREDENTIALS_JSON")
if _creds_raw:
    # Support both raw JSON and base64-encoded JSON (base64 avoids copy/paste corruption)
    try:
        _creds_json = base64.b64decode(_creds_raw).decode("utf-8")
        json.loads(_creds_json)  # validate after decoding
        print("Credentials decoded from base64")
    except Exception:
        # Not base64 — try as raw JSON
        _creds_json = _creds_raw
        try:
            json.loads(_creds_json)
        except json.JSONDecodeError as e:
            raise RuntimeError(
                f"GOOGLE_CREDENTIALS_JSON is not valid JSON or base64: {e}\n"
                "Encode the file with: python3 -c \"import base64; print(base64.b64encode(open('service-account.json','rb').read()).decode())\""
            )
    _cred_path = "/tmp/service-account.json"
    with open(_cred_path, "w") as _f:
        _f.write(_creds_json)
    os.chmod(_cred_path, stat.S_IRUSR | stat.S_IWUSR)  # 0o600 — owner read/write only
    os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = _cred_path
    print("Credentials loaded from GOOGLE_CREDENTIALS_JSON env var")
else:
    _cred_path = str(BASE_DIR / "service-account.json")
    if os.path.exists(_cred_path):
        os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = _cred_path
        print(f"Credentials loaded from {_cred_path}")
    else:
        print("WARNING: No credentials found. Set GOOGLE_CREDENTIALS_JSON env var.")

PROJECT  = os.environ.get("GOOGLE_CLOUD_PROJECT", "mystic-curve-416821")
LOCATION = os.environ.get("GOOGLE_CLOUD_LOCATION", "us-central1")
MODEL_ID = "gemini-live-2.5-flash-native-audio"

# ─── Analytics DB ───────────────────────────────────────────────────────────
DB_PATH  = BASE_DIR / "data" / "analytics.db"
_db_lock = threading.Lock()

def _now() -> str:
    return datetime.now(timezone.utc).isoformat()

def _get_conn() -> sqlite3.Connection:
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    with _db_lock:
        conn = _get_conn()
        conn.executescript("""
            CREATE TABLE IF NOT EXISTS sessions (
                id             INTEGER PRIMARY KEY AUTOINCREMENT,
                session_type   TEXT    NOT NULL DEFAULT 'voice',
                started_at     TEXT    NOT NULL,
                ended_at       TEXT,
                message_count  INTEGER DEFAULT 0,
                ip_address     TEXT,
                user_agent     TEXT,
                recording_path TEXT
            );
            CREATE TABLE IF NOT EXISTS messages (
                id         INTEGER PRIMARY KEY AUTOINCREMENT,
                session_id INTEGER NOT NULL,
                role       TEXT    NOT NULL,
                content    TEXT    NOT NULL,
                timestamp  TEXT    NOT NULL,
                FOREIGN KEY (session_id) REFERENCES sessions(id)
            );
            CREATE TABLE IF NOT EXISTS page_views (
                id         INTEGER PRIMARY KEY AUTOINCREMENT,
                path       TEXT    NOT NULL,
                timestamp  TEXT    NOT NULL,
                ip_address TEXT,
                referrer   TEXT
            );
        """)
        # Migrate existing DBs that lack recording_path column
        try:
            conn.execute("ALTER TABLE sessions ADD COLUMN recording_path TEXT")
            conn.commit()
        except Exception:
            pass  # Column already exists
        conn.close()

# Per-session audio buffer: session_id -> bytearray of raw PCM (24kHz, 16-bit, mono)
_audio_buffers: dict[int, bytearray] = {}
_audio_lock = threading.Lock()

# Per-session transcript buffers: accumulate chunks before saving
_transcript_buffers: dict[int, dict] = {}  # {session_id: {"model": "", "user": ""}}

def _write_wav(pcm_bytes: bytes, sample_rate: int = 24000) -> bytes:
    buf = io.BytesIO()
    with wave.open(buf, "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)   # 16-bit
        wf.setframerate(sample_rate)
        wf.writeframes(pcm_bytes)
    return buf.getvalue()

def db_save_recording(session_id: int, wav_bytes: bytes):
    path = RECORDINGS_DIR / f"session_{session_id}.wav"
    path.write_bytes(wav_bytes)
    with _db_lock:
        conn = _get_conn()
        conn.execute(
            "UPDATE sessions SET recording_path = ? WHERE id = ?",
            (str(path.relative_to(BASE_DIR)), session_id),
        )
        conn.commit()
        conn.close()
    return path

def db_create_session(session_type="voice", ip_address=None, user_agent=None) -> int:
    with _db_lock:
        conn = _get_conn()
        cur = conn.execute(
            "INSERT INTO sessions (session_type, started_at, ip_address, user_agent) VALUES (?,?,?,?)",
            (session_type, _now(), ip_address, user_agent),
        )
        conn.commit()
        sid = cur.lastrowid
        conn.close()
        return sid

def db_save_message(session_id: int, role: str, content: str):
    with _db_lock:
        conn = _get_conn()
        conn.execute(
            "INSERT INTO messages (session_id, role, content, timestamp) VALUES (?,?,?,?)",
            (session_id, role, content, _now()),
        )
        conn.execute(
            "UPDATE sessions SET message_count = message_count + 1 WHERE id = ?",
            (session_id,),
        )
        conn.commit()
        conn.close()

def db_end_session(session_id: int):
    with _db_lock:
        conn = _get_conn()
        conn.execute(
            "UPDATE sessions SET ended_at = ? WHERE id = ?",
            (_now(), session_id),
        )
        conn.commit()
        conn.close()

# ─── System Prompt ───────────────────────────────────────────────────────────
def load_system_prompt() -> str:
    try:
        prompt_path = BASE_DIR / "data" / "system-prompt.json"
        with open(prompt_path, "r", encoding="utf-8") as f:
            data = json.load(f)
        rules = "\n".join(f"{i+1}. {r}" for i, r in enumerate(data.get("rules", [])))
        return f"{data.get('base', '')}\n\nRULES:\n{rules}"
    except Exception as e:
        print(f"Warning: Could not load system-prompt.json: {e}")
        return "You are Yousif Al-Nasser's personal AI assistant. Be helpful, professional, and bilingual (English/Arabic)."

BASE_SYSTEM_PROMPT = load_system_prompt()

# ─── Auth ─────────────────────────────────────────────────────────────────────
_WEAK_TOKENS = {"admin", "password", "token", "secret", "test", "1234", "dashboard"}

def check_auth(x_dashboard_token: str = Header(None)):
    token = os.environ.get("DASHBOARD_TOKEN", "")
    if not token:
        raise HTTPException(status_code=401, detail="DASHBOARD_TOKEN not configured on server")
    if x_dashboard_token != token:
        raise HTTPException(status_code=401, detail="Unauthorized")

# ─── Rate Limiting ────────────────────────────────────────────────────────────
_TRACK_RATE_LIMIT  = 30   # max requests per IP
_TRACK_RATE_WINDOW = 60   # rolling window in seconds
_track_requests: dict[str, list[float]] = defaultdict(list)
_track_rl_lock = threading.Lock()

def _check_track_rate(ip: str) -> bool:
    """Returns False (blocked) if IP has exceeded the tracking rate limit."""
    if not ip:
        return True
    now = time.monotonic()
    with _track_rl_lock:
        window_start = now - _TRACK_RATE_WINDOW
        _track_requests[ip] = [t for t in _track_requests[ip] if t > window_start]
        if len(_track_requests[ip]) >= _TRACK_RATE_LIMIT:
            return False
        _track_requests[ip].append(now)
    return True

# ─── WebSocket Connection Tracking ───────────────────────────────────────────
_MAX_WS_PER_IP = 3
_ws_connections: dict[str, int] = defaultdict(int)
_ws_conn_lock = threading.Lock()

# ─── App ──────────────────────────────────────────────────────────────────────
app = FastAPI(title="Yousif Portfolio & Voice Agent")

init_db()

_dashboard_token = os.environ.get("DASHBOARD_TOKEN", "")
if not _dashboard_token or len(_dashboard_token) < 16 or _dashboard_token.lower() in _WEAK_TOKENS:
    print("WARNING: DASHBOARD_TOKEN is weak or not set — use a strong random value in production.")

app.mount("/css",    StaticFiles(directory="css"),    name="css")
app.mount("/js",     StaticFiles(directory="js"),     name="js")
app.mount("/Assets", StaticFiles(directory="Assets"), name="Assets")

# Serve only JSON files from /data (excludes analytics.db)
@app.get("/data/{filename:path}")
async def serve_data_file(filename: str):
    import re
    if not re.match(r'^[\w\-]+\.json$', filename):
        raise HTTPException(status_code=404, detail="Not found")
    file_path = BASE_DIR / "data" / filename
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="Not found")
    return FileResponse(str(file_path))

# ─── Pages ───────────────────────────────────────────────────────────────────
@app.get("/")
async def read_index():
    return FileResponse("index.html")

@app.get("/voice-agent.html")
async def read_voice_agent():
    return FileResponse("voice-agent.html")


@app.get("/dashboard")
async def read_dashboard():
    return FileResponse("dashboard.html")

# ─── Analytics API ────────────────────────────────────────────────────────────

def get_real_ip(req) -> str | None:
    x_forwarded_for = req.headers.get("x-forwarded-for")
    if x_forwarded_for:
        return x_forwarded_for.split(",")[0].strip()
    x_real_ip = req.headers.get("x-real-ip")
    if x_real_ip:
        return x_real_ip.strip()
    return req.client.host if req.client else None

@app.post("/api/track")
async def track_page_view(request: Request):
    ip = get_real_ip(request)
    if not _check_track_rate(ip):
        return {"ok": True}  # silent drop — don't reveal rate limiting
    try:
        body = await request.json()
    except Exception:
        body = {}
    path     = str(body.get("path", "/"))[:256]
    referrer = str(body.get("referrer", ""))[:512]
    with _db_lock:
        conn = _get_conn()
        conn.execute(
            "INSERT INTO page_views (path, timestamp, ip_address, referrer) VALUES (?,?,?,?)",
            (path, _now(), ip, referrer),
        )
        conn.commit()
        conn.close()
    return {"ok": True}

@app.get("/api/analytics")
async def get_analytics(_=Depends(check_auth)):
    conn = _get_conn()

    total_sessions  = conn.execute("SELECT COUNT(*) FROM sessions").fetchone()[0]
    total_messages  = conn.execute("SELECT COUNT(*) FROM messages").fetchone()[0]
    total_pageviews = conn.execute("SELECT COUNT(*) FROM page_views").fetchone()[0]

    today = datetime.now(timezone.utc).date().isoformat()
    sessions_today  = conn.execute(
        "SELECT COUNT(*) FROM sessions WHERE started_at LIKE ?", (f"{today}%",)
    ).fetchone()[0]
    pageviews_today = conn.execute(
        "SELECT COUNT(*) FROM page_views WHERE timestamp LIKE ?", (f"{today}%",)
    ).fetchone()[0]

    by_type = conn.execute(
        "SELECT session_type, COUNT(*) as cnt FROM sessions GROUP BY session_type"
    ).fetchall()
    type_counts = {r["session_type"]: r["cnt"] for r in by_type}

    # Sessions per day – last 30 days
    sessions_per_day = conn.execute("""
        SELECT substr(started_at, 1, 10) as day, COUNT(*) as cnt
        FROM sessions
        WHERE started_at >= datetime('now', '-30 days')
        GROUP BY day ORDER BY day
    """).fetchall()

    # Page views per day – last 30 days
    views_per_day = conn.execute("""
        SELECT substr(timestamp, 1, 10) as day, COUNT(*) as cnt
        FROM page_views
        WHERE timestamp >= datetime('now', '-30 days')
        GROUP BY day ORDER BY day
    """).fetchall()

    # Messages by hour of day
    msgs_by_hour = conn.execute("""
        SELECT CAST(substr(timestamp, 12, 2) AS INTEGER) as hr, COUNT(*) as cnt
        FROM messages GROUP BY hr ORDER BY hr
    """).fetchall()

    # Avg session duration (seconds)
    avg_dur = conn.execute("""
        SELECT AVG((julianday(ended_at) - julianday(started_at)) * 86400)
        FROM sessions WHERE ended_at IS NOT NULL
    """).fetchone()[0]

    conn.close()
    return {
        "total_sessions":  total_sessions,
        "total_messages":  total_messages,
        "total_pageviews": total_pageviews,
        "sessions_today":  sessions_today,
        "pageviews_today": pageviews_today,
        "type_counts":     type_counts,
        "sessions_per_day": [{"day": r["day"], "count": r["cnt"]} for r in sessions_per_day],
        "views_per_day":    [{"day": r["day"], "count": r["cnt"]} for r in views_per_day],
        "msgs_by_hour":     [{"hour": r["hr"],  "count": r["cnt"]} for r in msgs_by_hour],
        "avg_duration_sec": round(avg_dur) if avg_dur else 0,
    }

@app.get("/api/sessions")
async def get_sessions(
    limit:  int = 50,
    offset: int = 0,
    type:   str = None,
    _=Depends(check_auth),
):
    conn   = _get_conn()
    where  = "WHERE session_type = ?" if type else ""
    params = (type, limit, offset) if type else (limit, offset)
    rows   = conn.execute(
        f"""SELECT id, session_type, started_at, ended_at, message_count, ip_address
            FROM sessions {where} ORDER BY started_at DESC LIMIT ? OFFSET ?""",
        params,
    ).fetchall()
    total = conn.execute(
        f"SELECT COUNT(*) FROM sessions {where}",
        (type,) if type else (),
    ).fetchone()[0]
    conn.close()
    return {
        "total": total,
        "sessions": [dict(r) for r in rows],
    }

@app.get("/api/sessions/{session_id}")
async def get_session(session_id: int, _=Depends(check_auth)):
    conn = _get_conn()
    session = conn.execute(
        "SELECT * FROM sessions WHERE id = ?", (session_id,)
    ).fetchone()
    if not session:
        conn.close()
        raise HTTPException(404, "Session not found")
    msgs = conn.execute(
        "SELECT role, content, timestamp FROM messages WHERE session_id = ? ORDER BY timestamp",
        (session_id,),
    ).fetchall()
    conn.close()
    return {
        "session":  dict(session),
        "messages": [dict(m) for m in msgs],
    }

@app.get("/api/sessions/{session_id}/audio")
async def get_session_audio(session_id: int, _=Depends(check_auth)):
    conn = _get_conn()
    row = conn.execute(
        "SELECT recording_path FROM sessions WHERE id = ?", (session_id,)
    ).fetchone()
    conn.close()
    if not row or not row["recording_path"]:
        raise HTTPException(404, "No recording for this session")
    path = BASE_DIR / row["recording_path"]
    if not path.exists():
        raise HTTPException(404, "Recording file not found")
    return FileResponse(
        str(path),
        media_type="audio/wav",
        filename=f"session_{session_id}.wav",
        headers={"Content-Disposition": f'attachment; filename="session_{session_id}.wav"'},
    )

# ─── Gemini Live WebSocket Proxy ──────────────────────────────────────────────
@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    session_id = None
    
    # Handle Reverse Proxies
    ip = get_real_ip(websocket)

    # Enforce per-IP connection limit before doing any work
    with _ws_conn_lock:
        if ip and _ws_connections[ip] >= _MAX_WS_PER_IP:
            await websocket.close(code=1008, reason="Too many connections")
            return
        _ws_connections[ip] += 1

    try:
        # 1. Receive setup message from frontend
        initial_msg    = await websocket.receive_json()
        setup          = initial_msg.get("setup", {})
        session_type   = setup.get("session_type", "voice")
        # Truncate to prevent excessively large prompt injection
        frontend_context = str(setup.get("system_instruction", ""))[:8000]
        system_instruction = (
            f"{BASE_SYSTEM_PROMPT}\n\n{frontend_context}" if frontend_context else BASE_SYSTEM_PROMPT
        )

        # 2. Create DB session + audio/transcript buffers
        ua = websocket.headers.get("user-agent")
        session_id = db_create_session(session_type, ip, ua)
        with _audio_lock:
            _audio_buffers[session_id] = bytearray()
        _transcript_buffers[session_id] = {"model": "", "user": ""}

        # 3. Build Gemini client + config
        client = genai.Client(
            http_options=HttpOptions(api_version="v1beta1"),
            vertexai=True,
            project=PROJECT,
            location=LOCATION,
        )
        # Native audio model only supports AUDIO output — use transcription for text display
        config = LiveConnectConfig(
            response_modalities=[Modality.AUDIO],
            output_audio_transcription=AudioTranscriptionConfig(),
            input_audio_transcription=AudioTranscriptionConfig(),
            system_instruction=Content(parts=[Part(text=system_instruction)]),
        )

        # 4. Open Gemini Live session
        async with client.aio.live.connect(model=MODEL_ID, config=config) as session:

            async def receive_from_gemini():
                try:
                    while True:
                        got_any = False
                        async for message in session.receive():
                            got_any = True
                            sc = getattr(message, "server_content", None)
                            if sc is None:
                                continue

                            model_turn = getattr(sc, "model_turn", None)
                            if model_turn:
                                for part in getattr(model_turn, "parts", []):
                                    # Audio chunk (voice sessions)
                                    inline_data = getattr(part, "inline_data", None)
                                    if inline_data and getattr(inline_data, "data", None):
                                        await websocket.send_json({
                                            "audio": base64.b64encode(inline_data.data).decode()
                                        })
                                        if session_id:
                                            with _audio_lock:
                                                _audio_buffers.get(session_id, bytearray()).extend(inline_data.data)

                            # Model transcript via audio transcription
                            out_t = getattr(sc, "output_transcription", None)
                            if out_t:
                                text = getattr(out_t, "text", None)
                                if text:
                                    await websocket.send_json({"transcript": text, "type": "model"})
                                    if session_id:
                                        _transcript_buffers[session_id]["model"] += text

                            # User transcript — buffer chunks
                            in_t = getattr(sc, "input_transcription", None)
                            if in_t:
                                text = getattr(in_t, "text", None)
                                if text:
                                    await websocket.send_json({"transcript": text, "type": "user"})
                                    if session_id:
                                        _transcript_buffers[session_id]["user"] += text

                            # Turn complete — notify frontend + flush buffers to DB
                            if getattr(sc, "turn_complete", False):
                                await websocket.send_json({"turn_complete": True})
                            if getattr(sc, "turn_complete", False) and session_id:
                                bufs = _transcript_buffers[session_id]
                                if bufs["user"].strip():
                                    db_save_message(session_id, "user", bufs["user"].strip())
                                    bufs["user"] = ""
                                if bufs["model"].strip():
                                    db_save_message(session_id, "model", bufs["model"].strip())
                                    bufs["model"] = ""

                        if not got_any:
                            print("Gemini session closed.")
                            break

                except asyncio.CancelledError:
                    pass
                except Exception as e:
                    print(f"Gemini error: {e}")
                    try:
                        await websocket.send_json({"error": "An error occurred. Please try again."})
                    except Exception:
                        pass
                finally:
                    try:
                        await websocket.close()
                    except Exception:
                        pass

            receive_task = asyncio.create_task(receive_from_gemini())
            await websocket.send_json({"status": "ready"})

            try:
                while True:
                    data = await websocket.receive_json()

                    if "ping" in data:
                        await websocket.send_json({"pong": True})
                        continue

                    if "audio" in data:
                        raw = base64.b64decode(data["audio"])
                        await session.send(
                            input=Blob(data=raw, mime_type="audio/pcm;rate=16000"),
                            end_of_turn=False,
                        )

                    if "text" in data:
                        if session_id:
                            db_save_message(session_id, "user", data["text"])
                        await session.send(input=data["text"], end_of_turn=True)

            except WebSocketDisconnect:
                print("Client disconnected.")
            finally:
                receive_task.cancel()
                try:
                    await receive_task
                except (asyncio.CancelledError, Exception):
                    pass

    except Exception as e:
        print(f"WebSocket error: {e}")
        try:
            await websocket.send_json({"error": "An error occurred. Please try again."})
        except Exception:
            pass
        try:
            await websocket.close()
        except Exception:
            pass
    finally:
        with _ws_conn_lock:
            if ip:
                _ws_connections[ip] = max(0, _ws_connections[ip] - 1)
        if session_id:
            # Flush any remaining transcript buffers
            bufs = _transcript_buffers.pop(session_id, {})
            if bufs.get("user", "").strip():
                db_save_message(session_id, "user", bufs["user"].strip())
            if bufs.get("model", "").strip():
                db_save_message(session_id, "model", bufs["model"].strip())

            db_end_session(session_id)

            # Save WAV recording if audio was captured
            with _audio_lock:
                pcm = bytes(_audio_buffers.pop(session_id, bytearray()))
            if pcm:
                try:
                    db_save_recording(session_id, _write_wav(pcm))
                except Exception as e:
                    print(f"Failed to save recording for session {session_id}: {e}")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=5000,
        ws_ping_interval=None,
        ws_ping_timeout=None,
    )
