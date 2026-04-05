import json
from google.genai.types import BidiGenerateContentSetup

try:
    schema = BidiGenerateContentSetup.model_json_schema()
    print(json.dumps(schema, indent=2))
except Exception as e:
    print(f"Error: {e}")
