import os
import json
import datetime
from typing import Dict, Any, List

LOGS_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data", "logs")
API_LOG_FILE = os.path.join(LOGS_DIR, "api_calls.jsonl")

def log_api_call(
    call_type: str,
    provider: str,
    endpoint: str,
    model_name: str,
    duration_sec: float,
    status: str,
    status_code: int = None,
    error_msg: str = None
):
    """
    Persists structured API log entry to api_calls.jsonl.
    Cleans and categorizes error messages for security and clarity.
    """
    os.makedirs(LOGS_DIR, exist_ok=True)
    
    # Clean error message if present
    clean_error = None
    error_category = None
    if error_msg:
        clean_error = error_msg.strip()
        # Categorize common API errors
        if "timeout" in clean_error.lower() or "timed out" in clean_error.lower():
            error_category = "Timeout"
            status_code = status_code or 408
        elif "unauthorized" in clean_error.lower() or "auth" in clean_error.lower() or "401" in clean_error or "403" in clean_error:
            error_category = "Authentication/Authorization Failure"
            status_code = status_code or 401
        elif "quota" in clean_error.lower() or "rate limit" in clean_error.lower() or "429" in clean_error:
            error_category = "Rate Limit Exceeded"
            status_code = status_code or 429
        else:
            error_category = "API Connection Error"
            status_code = status_code or 502
            
    log_entry = {
        "timestamp": datetime.datetime.now().isoformat(),
        "call_type": call_type,          # "test_connection", "llm_generation", "embeddings"
        "provider": provider,            # "nebius", "openai", "gemini", "local"
        "endpoint": endpoint,
        "model_name": model_name,
        "duration_sec": round(duration_sec, 3),
        "status": status,                # "success", "failed"
        "status_code": status_code,
        "error_category": error_category,
        "error_message": clean_error
    }
    
    try:
        with open(API_LOG_FILE, "a", encoding="utf-8") as f:
            f.write(json.dumps(log_entry) + "\n")
    except Exception as e:
        print(f"Failed to write API log: {e}")

def get_api_logs(limit: int = 50) -> List[Dict[str, Any]]:
    """
    Reads local api_calls.jsonl from bottom to top (most recent first).
    """
    if not os.path.exists(API_LOG_FILE):
        return []
        
    logs = []
    try:
        with open(API_LOG_FILE, "r", encoding="utf-8") as f:
            for line in f:
                if line.strip():
                    logs.append(json.loads(line.strip()))
    except Exception as e:
        print(f"Failed to read API logs: {e}")
        
    return list(reversed(logs))[:limit]

def clear_api_logs():
    """
    Clears the API call logs file.
    """
    if os.path.exists(API_LOG_FILE):
        try:
            os.remove(API_LOG_FILE)
        except Exception as e:
            print(f"Failed to clear API logs: {e}")
