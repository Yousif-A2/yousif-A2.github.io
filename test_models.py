import asyncio
from google import genai
from google.genai.types import HttpOptions, LiveConnectConfig, Modality
import os
from pathlib import Path
from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent
load_dotenv(BASE_DIR / ".env", override=True)
os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = str(BASE_DIR / "service-account.json")

async def main():
    client = genai.Client(http_options=HttpOptions(api_version="v1beta1"), vertexai=True, location="us-central1", project="mystic-curve-416821")
    config = LiveConnectConfig(response_modalities=[Modality.AUDIO])
    
    models_to_test = ["gemini-live-2.5-flash-native-audio", "gemini-2.5-flash", "projects/mystic-curve-416821/locations/us-central1/publishers/google/models/gemini-live-2.5-flash-native-audio"]
    
    for model_id in models_to_test:
        print(f"\n--- Testing {model_id} ---")
        try:
            async with client.aio.live.connect(model=model_id, config=config) as session:
                print(f"SUCCESS connecting to {model_id}!")
                await session.send(input="Hello", end_of_turn=True)
                async for response in session.receive():
                    print("Received response!")
                    break
        except Exception as e:
            print(f"FAILED: {e}")

asyncio.run(main())
