import os
from pathlib import Path
from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
import google.auth
import google.auth.transport.requests
from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent
# Force load env vars to avoid Uvicorn caching them incorrectly during reloads
load_dotenv(BASE_DIR / ".env", override=True)

# GUARANTEE the service-account.json path is explicitly set in the OS environment
cred_path = str(BASE_DIR / "service-account.json")
if os.path.exists(cred_path):
    os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = cred_path
    print(f"Force-set Credentials Path: {cred_path}")

app = FastAPI(title="Yousif Portfolio & Voice Agent API")

# Mount static directories
app.mount("/css", StaticFiles(directory="css"), name="css")
app.mount("/js", StaticFiles(directory="js"), name="js")
app.mount("/data", StaticFiles(directory="data"), name="data")
app.mount("/Assets", StaticFiles(directory="Assets"), name="Assets")

@app.get("/")
async def read_index():
    return FileResponse("index.html")

@app.get("/voice-agent.html")
async def read_voice_agent():
    return FileResponse("voice-agent.html")

@app.get("/api/token")
async def get_token():
    """
    Generates a short-lived OAuth 2.0 access token using Google Application Credentials.
    This token is sent to the frontend so it can securely open a WebSocket directly to Vertex AI.
    """
    try:
        # Ensure GOOGLE_APPLICATION_CREDENTIALS is an absolute path if it is set as a relative path
        env_cred_path = os.environ.get("GOOGLE_APPLICATION_CREDENTIALS")
        if env_cred_path and not os.path.isabs(env_cred_path):
            abs_path = str(BASE_DIR / env_cred_path)
            os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = abs_path
            print(f"DEBUG: Rewrote creds path to {abs_path}")

        # Load credentials from the environment (e.g. GOOGLE_APPLICATION_CREDENTIALS)
        credentials, project_id = google.auth.default(
            scopes=["https://www.googleapis.com/auth/cloud-platform"]
        )
        
        # Refresh the credentials to ensure the token is valid and populated
        request = google.auth.transport.requests.Request()
        credentials.refresh(request)
        
        # Determine Project ID and Location from auth or environment variables
        final_project_id = os.environ.get("GOOGLE_CLOUD_PROJECT", project_id)
        location = os.environ.get("GOOGLE_CLOUD_LOCATION", "us-central1")
        
        if not final_project_id:
            raise ValueError("Google Cloud Project ID is missing. Set GOOGLE_CLOUD_PROJECT env var.")
            
        if not credentials.token:
            raise ValueError("Failed to generate a valid access token.")

        return {
            "token": credentials.token,
            "projectId": final_project_id,
            "location": location
        }
    except Exception as e:
        print(f"Error generating token: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    # For local testing, runs on port 3000
    uvicorn.run("main:app", host="0.0.0.0", port=3000, reload=True)
