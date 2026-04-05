import os
from pathlib import Path
import google.auth
import google.auth.transport.requests

BASE_DIR = Path(__file__).resolve().parent
cred_path = str(BASE_DIR / "service-account.json")

print("Cred path exists?", os.path.exists(cred_path))
os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = cred_path

print("Env var set to:", os.environ.get("GOOGLE_APPLICATION_CREDENTIALS"))

try:
    credentials, project_id = google.auth.default(
        scopes=["https://www.googleapis.com/auth/cloud-platform"]
    )
    print("Default auth project:", project_id)
except Exception as e:
    print("Exception from default auth:", type(e))
    print(str(e))
