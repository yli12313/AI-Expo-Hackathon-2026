import os
from dotenv import load_dotenv

load_dotenv()

OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY")
OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1"
MODEL = "meta-llama/llama-3.1-70b-instruct"
GSA_API_KEY = os.getenv("GSA_API_KEY", "")
