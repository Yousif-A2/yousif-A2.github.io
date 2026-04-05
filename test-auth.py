import os
from dotenv import load_dotenv
import google.auth

# Load the env file explicitly
load_dotenv()

print("ENV VAR VALUE: ", os.environ.get("GOOGLE_APPLICATION_CREDENTIALS"))

try:
    credentials, project = google.auth.default(scopes=["https://www.googleapis.com/auth/cloud-platform"])
    print("SUCCESS!")
    print("Project from auth:", project)
except Exception as e:
    print("ERROR:")
    print(str(e))
