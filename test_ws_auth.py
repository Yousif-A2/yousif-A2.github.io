import sys
import asyncio
import websockets
import os
from pathlib import Path
import google.auth
import google.auth.transport.requests
from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent
load_dotenv(BASE_DIR / ".env", override=True)

cred_path = str(BASE_DIR / "service-account.json")
os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = cred_path

async def test_ws():
    credentials, project_id = google.auth.default(scopes=["https://www.googleapis.com/auth/cloud-platform"])
    auth_req = google.auth.transport.requests.Request()
    credentials.refresh(auth_req)
    token = credentials.token
    
    url_with_query = f"wss://us-central1-aiplatform.googleapis.com/ws/google.cloud.aiplatform.v1beta1.LlmBidiService/BidiGenerateContent?access_token={token}"
    url_without_query = f"wss://us-central1-aiplatform.googleapis.com/ws/google.cloud.aiplatform.v1beta1.LlmBidiService/BidiGenerateContent"
    
    print("Testing with Query Param...")
    try:
        # NO headers, just query param (simulating browser)
        async with websockets.connect(url_with_query) as ws:
            print("Query Param: SUCCESS!")
            await ws.close()
    except Exception as e:
        print(f"Query Param: FAILED! {type(e)} - {e}")
        
    print("\nTesting with Header...")
    try:
        headers = {"Authorization": f"Bearer {token}"}
        async with websockets.connect(url_without_query, extra_headers=headers) as ws:
            print("Header: SUCCESS!")
            await ws.close()
    except Exception as e:
        print(f"Header: FAILED! {type(e)} - {e}")

asyncio.run(test_ws())
