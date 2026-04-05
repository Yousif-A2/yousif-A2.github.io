import os
import base64
import asyncio
import json
from pathlib import Path

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from google import genai
from google.genai.types import (
    AudioTranscriptionConfig, Blob, Content,
    HttpOptions, LiveConnectConfig, Modality, Part,
)
from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent
load_dotenv(BASE_DIR / ".env", override=True)

# --- Credentials ---
# Prefer GOOGLE_CREDENTIALS_JSON env var (Coolify secret / Docker env)
# Fall back to service-account.json file for local dev
_creds_json = os.environ.get("GOOGLE_CREDENTIALS_JSON")
if _creds_json:
    _cred_path = "/tmp/service-account.json"
    with open(_cred_path, "w") as _f:
        _f.write(_creds_json)
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

def load_system_prompt() -> str:
    """Load base system prompt rules from data/system-prompt.json."""
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

app = FastAPI(title="Yousif Portfolio & Voice Agent")

app.mount("/css",    StaticFiles(directory="css"),    name="css")
app.mount("/js",     StaticFiles(directory="js"),     name="js")
app.mount("/data",   StaticFiles(directory="data"),   name="data")
app.mount("/Assets", StaticFiles(directory="Assets"), name="Assets")

@app.get("/")
async def read_index():
    return FileResponse("index.html")

@app.get("/voice-agent.html")
async def read_voice_agent():
    return FileResponse("voice-agent.html")


# --- Gemini Live WebSocket Proxy ---
@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    try:
        # 1. Receive setup message from frontend
        initial_msg = await websocket.receive_json()
        # Merge base prompt (from file) with portfolio data (from frontend)
        frontend_context = initial_msg.get("setup", {}).get("system_instruction", "")
        system_instruction = f"{BASE_SYSTEM_PROMPT}\n\n{frontend_context}" if frontend_context else BASE_SYSTEM_PROMPT

        # 2. Build Gemini client + config
        client = genai.Client(
            http_options=HttpOptions(api_version="v1beta1"),
            vertexai=True,
            project=PROJECT,
            location=LOCATION,
        )
        config = LiveConnectConfig(
            response_modalities=[Modality.AUDIO],
            output_audio_transcription=AudioTranscriptionConfig(),
            input_audio_transcription=AudioTranscriptionConfig(),
            system_instruction=Content(parts=[Part(text=system_instruction)]),
        )

        # 3. Open Gemini Live session
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

                            # Audio chunks
                            model_turn = getattr(sc, "model_turn", None)
                            if model_turn:
                                for part in getattr(model_turn, "parts", []):
                                    inline_data = getattr(part, "inline_data", None)
                                    if inline_data and getattr(inline_data, "data", None):
                                        await websocket.send_json({
                                            "audio": base64.b64encode(inline_data.data).decode()
                                        })

                            # Model transcript
                            out_t = getattr(sc, "output_transcription", None)
                            if out_t:
                                text = getattr(out_t, "text", None)
                                if text:
                                    await websocket.send_json({"transcript": text, "type": "model"})

                            # User transcript
                            in_t = getattr(sc, "input_transcription", None)
                            if in_t:
                                text = getattr(in_t, "text", None)
                                if text:
                                    await websocket.send_json({"transcript": text, "type": "user"})

                        if not got_any:
                            print("Gemini session closed.")
                            break

                except asyncio.CancelledError:
                    pass
                except Exception as e:
                    print(f"Gemini error: {e}")
                    try:
                        await websocket.send_json({"error": str(e)})
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
            await websocket.send_json({"error": str(e)})
        except Exception:
            pass
        try:
            await websocket.close()
        except Exception:
            pass


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8000,
        ws_ping_interval=None,
        ws_ping_timeout=None,
    )
