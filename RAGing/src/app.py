import os
import json
import datetime
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Dict, Any, Optional
from src.graph import app as graph_app

# Initialize FastAPI
app = FastAPI(
    title="Texas Rental Property RAG API",
    description="Backend API serving renter rights, city codes, and legal support escalation logic.",
    version="1.0.0"
)

# CORS configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allow all origins for dev simplicity
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class ChatRequest(BaseModel):
    message: str

class ChatResponse(BaseModel):
    response: str
    status: str
    citations: List[Dict[str, Any]]
    city: str
    county: str
    topic: str
    model_provider: str
    model_name: str

class Resource(BaseModel):
    name: str
    description: str
    phone: Optional[str] = None
    website: Optional[str] = None

@app.post("/api/chat", response_model=ChatResponse)
async def chat_endpoint(request: ChatRequest):
    """
    Stateful chat endpoint invoking the LangGraph renter rights workflow.
    """
    if not request.message.strip():
        raise HTTPException(status_code=400, detail="Message cannot be empty")
        
    try:
        # Invoke LangGraph
        result = graph_app.invoke({"query": request.message})
        
        # Log query history for continuous improvement (detect database gaps)
        log_entry = {
            "timestamp": datetime.datetime.now().isoformat(),
            "query": request.message,
            "status": result.get("status", "error"),
            "city": result.get("city", ""),
            "county": result.get("county", ""),
            "topic": result.get("topic", "general"),
            "citations_count": len(result.get("citations", []))
        }
        
        log_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data", "logs")
        os.makedirs(log_dir, exist_ok=True)
        log_file = os.path.join(log_dir, "query_history.jsonl")
        with open(log_file, "a", encoding="utf-8") as f:
            f.write(json.dumps(log_entry) + "\n")
            
        nebius_key = os.getenv("NEBIUS_API_KEY", "")
        openai_key = os.getenv("OPENAI_API_KEY", "")
        if nebius_key:
            provider = "Nebius"
            model = "Llama-3.3-70B"
        elif openai_key:
            provider = "OpenAI"
            model = "gpt-4o-mini"
        else:
            provider = "Local Mock"
            model = "Mock Renter Agent LLM"

        return ChatResponse(
            response=result.get("response", "No response generated."),
            status=result.get("status", "error"),
            citations=result.get("citations", []),
            city=result.get("city", ""),
            county=result.get("county", ""),
            topic=result.get("topic", "general"),
            model_provider=provider,
            model_name=model
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Graph execution failed: {str(e)}")

@app.get("/api/resources", response_model=Dict[str, List[Resource]])
async def resources_endpoint():
    """
    Returns lists of tenant advocacy resources categorized by city.
    """
    return {
        "Statewide": [
            Resource(
                name="Texas Tenant Advisor",
                description="Online portal with comprehensive tenant guides and form letters.",
                website="https://www.texastenantorg.org"
            ),
            Resource(
                name="Texas Bar Legal Referral Service",
                description="State bar hotline to connect with affordable tenant attorneys.",
                phone="1-800-252-9690",
                website="https://www.texasbar.com"
            ),
            Resource(
                name="Lone Star Legal Aid",
                description="Free legal support for low-income tenants across East Texas.",
                phone="1-800-733-8394",
                website="https://www.lonestarlegal.org"
            )
        ],
        "Austin": [
            Resource(
                name="Austin Tenants Council",
                description="Counseling, tenant rights workshops, and landlord mediation.",
                phone="512-474-1961",
                website="https://www.housing-rights.org"
            ),
            Resource(
                name="Texas RioGrande Legal Aid (TRLA)",
                description="Free legal representation for eviction defense in Austin.",
                phone="1-888-988-9996",
                website="https://www.trla.org"
            )
        ],
        "Dallas": [
            Resource(
                name="Legal Aid of Northwest Texas (LANWT)",
                description="Free civil legal services including eviction representation in Dallas.",
                phone="214-748-1234",
                website="https://www.lanwt.org"
            ),
            Resource(
                name="Dallas Housing Crisis Center",
                description="Offers legal advice, emergency assistance, and landlord dispute counseling.",
                phone="214-828-4244",
                website="https://www.hccdallas.org"
            )
        ],
        "Houston": [
            Resource(
                name="Lone Star Legal Aid Houston HQ",
                description="Headquarters serving Harris County with free eviction defense representation.",
                phone="713-652-0077",
                website="https://www.lonestarlegal.org"
            ),
            Resource(
                name="Houston Tenants Union",
                description="Grassroots tenant organizing community for support and protest assistance.",
                website="https://houstontenantsunion.org"
            )
        ],
        "San Antonio": [
            Resource(
                name="Texas RioGrande Legal Aid (TRLA) San Antonio Office",
                description="San Antonio office providing free eviction counsel and tenant advocacy.",
                phone="210-212-3700",
                website="https://www.trla.org"
            ),
            Resource(
                name="City of San Antonio Fair Housing Division",
                description="Investigates fair housing violations, code disputes, and rent program referrals.",
                phone="210-207-5910"
            )
        ],
        "Plano": [
            Resource(
                name="Legal Aid of Northwest Texas (LANWT) McKinney",
                description="Serves Collin County residents with free legal support.",
                phone="972-542-9405",
                website="https://www.lanwt.org"
            ),
            Resource(
                name="Plano Housing Authority",
                description="Provides housing choice vouchers and community resource referrals.",
                phone="972-420-3530"
            )
        ],
        "Frisco": [
            Resource(
                name="Legal Aid of Northwest Texas (LANWT) Denton/McKinney",
                description="Free legal assistance for Collin and Denton county renters.",
                phone="940-387-5357",
                website="https://www.lanwt.org"
            ),
            Resource(
                name="Frisco Development Services (Code Enforcement)",
                description="Report structural safety or minimum housing standard violations.",
                phone="972-292-5300"
            )
        ],
        "Aubrey": [
            Resource(
                name="Legal Aid of Northwest Texas (LANWT) Denton",
                description="Free civil legal services including eviction defense in Denton County.",
                phone="940-387-5357",
                website="https://www.lanwt.org"
            ),
            Resource(
                name="Aubrey Code Compliance",
                description="Reports of heating, electrical, or structural safety code violations.",
                phone="940-440-9343"
            )
        ]
    }

@app.get("/api/pipeline/dashboard")
async def pipeline_dashboard_endpoint():
    """
    Returns files stats, query telemetry summary, and evaluation run history.
    """
    import glob
    
    # 1. Gather files stats
    kb_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data", "knowledge_base")
    md_files = glob.glob(os.path.join(kb_dir, "*.md"))
    files_list = []
    for f in md_files:
        stats = os.stat(f)
        basename = os.path.basename(f)
        
        # Infer location
        loc = "Texas"
        if "austin" in basename: loc = "Austin"
        elif "dallas" in basename: loc = "Dallas"
        elif "houston" in basename: loc = "Houston"
        elif "san_antonio" in basename: loc = "San Antonio"
        elif "plano" in basename: loc = "Plano"
        elif "frisco" in basename: loc = "Frisco"
        elif "aubrey" in basename: loc = "Aubrey"
        
        files_list.append({
            "name": basename,
            "size": stats.st_size,
            "location": loc
        })
        
    # 2. Gather query telemetry
    logs_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data", "logs")
    query_log = os.path.join(logs_dir, "query_history.jsonl")
    
    queries = []
    status_counts = {"answered_local": 0, "answered_fallback_state": 0, "escalated_legal": 0}
    fallback_cities = {}
    
    if os.path.exists(query_log):
        with open(query_log, "r", encoding="utf-8") as f:
            for line in f:
                if not line.strip(): continue
                try:
                    entry = json.loads(line)
                    queries.append(entry)
                    status = entry.get("status")
                    if status in status_counts:
                        status_counts[status] += 1
                        
                    if status == "answered_fallback_state" and entry.get("city"):
                        city = entry.get("city")
                        fallback_cities[city] = fallback_cities.get(city, 0) + 1
                except:
                    pass
                    
    # 3. Gather evaluation runs history
    eval_log = os.path.join(logs_dir, "eval_history.jsonl")
    runs = []
    if os.path.exists(eval_log):
        with open(eval_log, "r", encoding="utf-8") as f:
            for line in f:
                if not line.strip(): continue
                try:
                    runs.append(json.loads(line))
                except:
                    pass
    from src.config import get_pipeline_settings
                    
    return {
        "files": files_list,
        "telemetry": {
            "total_queries": len(queries),
            "status_counts": status_counts,
            "fallback_gaps": [{"city": c, "count": count} for c, count in fallback_cities.items()],
            "recent_queries": queries[-10:] # last 10 queries
        },
        "runs_history": runs,
        "config": get_pipeline_settings()
    }

class RunRequest(BaseModel):
    chunk_size: int
    chunk_overlap: int
    dense_search_weight: float
    sparse_search_weight: float
    embeddings_model: str
    llm_model: str
    routing_threshold: str
    description: str
    sourcing_mode: Optional[str] = "local"
    sourcing_endpoint: Optional[str] = ""
    cache_enabled: Optional[bool] = True
    strip_markdown: Optional[bool] = True
    normalize_whitespace: Optional[bool] = True
    decode_html: Optional[bool] = True
    remove_legal_boilerplate: Optional[bool] = False

@app.post("/api/pipeline/run")
async def run_pipeline_endpoint(request: RunRequest):
    """
    Saves new configuration settings, runs indexing subprocess, runs evaluation subprocess,
    and returns logs + the resulting run stats.
    """
    try:
        # 1. Save pipeline settings
        from src.config import save_pipeline_settings
        settings_dict = {
            "chunk_size": request.chunk_size,
            "chunk_overlap": request.chunk_overlap,
            "dense_search_weight": request.dense_search_weight,
            "sparse_search_weight": request.sparse_search_weight,
            "embeddings_model": request.embeddings_model,
            "llm_model": request.llm_model,
            "routing_threshold": request.routing_threshold,
            "sourcing_mode": request.sourcing_mode,
            "sourcing_endpoint": request.sourcing_endpoint,
            "cache_enabled": request.cache_enabled,
            "strip_markdown": request.strip_markdown,
            "normalize_whitespace": request.normalize_whitespace,
            "decode_html": request.decode_html,
            "remove_legal_boilerplate": request.remove_legal_boilerplate
        }
        save_pipeline_settings(settings_dict)
        
        # 2. Trigger Indexing and Evaluation in subprocesses to ensure clean variable loads
        import subprocess
        
        env = os.environ.copy()
        env["PYTHONPATH"] = "."
        
        # Locate project root directory path
        root_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        
        # Determine executable path: verify if .venv/bin/python3 exists, else fallback to python3
        venv_python = os.path.join(root_dir, ".venv", "bin", "python3")
        python_exec = venv_python if os.path.exists(venv_python) else "python3"
        
        idx_proc = subprocess.run(
            [python_exec, "-m", "src.indexer"],
            capture_output=True,
            text=True,
            cwd=root_dir,
            env=env
        )
        
        if idx_proc.returncode != 0:
            return {
                "success": False,
                "error": f"Indexing failed: {idx_proc.stderr}",
                "logs": f"--- INDEXING STDOUT ---\n{idx_proc.stdout}\n\n--- INDEXING STDERR ---\n{idx_proc.stderr}"
            }
            
        # Run Evaluator (sharing env description)
        env["RUN_DESCRIPTION"] = request.description
        eval_proc = subprocess.run(
            [python_exec, "-m", "src.evaluate"],
            capture_output=True,
            text=True,
            cwd=root_dir,
            env=env
        )
        
        if eval_proc.returncode != 0:
            return {
                "success": False,
                "error": f"Evaluation failed: {eval_proc.stderr}",
                "logs": f"--- INDEXING LOGS ---\n{idx_proc.stdout}\n\n--- EVALUATION STDOUT ---\n{eval_proc.stdout}\n\n--- EVALUATION STDERR ---\n{eval_proc.stderr}"
            }
            
        # 3. Read the new evaluation score from eval_history.jsonl
        logs_dir = os.path.join(root_dir, "data", "logs")
        eval_log = os.path.join(logs_dir, "eval_history.jsonl")
        latest_run = {}
        if os.path.exists(eval_log):
            with open(eval_log, "r", encoding="utf-8") as f:
                lines = f.readlines()
                if lines:
                    latest_run = json.loads(lines[-1].strip())
                    
        return {
            "success": True,
            "logs": f"--- INDEXER LOGS ---\n{idx_proc.stdout}\n\n--- EVALUATION LOGS ---\n{eval_proc.stdout}",
            "latest_run": latest_run
        }
        
    except Exception as e:
        return {
            "success": False,
            "error": str(e),
            "logs": f"Pipeline execution crashed:\n{str(e)}"
        }

# Model Provider Connection Schemas
class ConnectionTestRequest(BaseModel):
    provider: str
    api_key: str

class ConnectionSaveRequest(BaseModel):
    provider: str
    api_key: str

def update_env_file(key_name: str, key_val: str):
    env_path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".env")
    lines = []
    updated = False
    
    if os.path.exists(env_path):
        with open(env_path, "r", encoding="utf-8") as f:
            lines = f.readlines()
            
        for i, line in enumerate(lines):
            if line.strip().startswith(f"{key_name}="):
                lines[i] = f"{key_name}={key_val}\n"
                updated = True
                break
                
    if not updated:
        lines.append(f"{key_name}={key_val}\n")
        
    with open(env_path, "w", encoding="utf-8") as f:
        f.writelines(lines)
        
    os.environ[key_name] = key_val

@app.get("/api/connections")
async def get_connections_status():
    """
    Returns configured statuses for model providers.
    """
    return {
        "openai": "configured" if os.getenv("OPENAI_API_KEY") else "not_configured",
        "nebius": "configured" if os.getenv("NEBIUS_API_KEY") else "not_configured",
        "gemini": "configured" if os.getenv("GEMINI_API_KEY") else "not_configured"
    }

@app.post("/api/connections/test")
async def test_connection_endpoint(request: ConnectionTestRequest):
    """
    Validates api key connection with provider using a quick http post request.
    """
    import requests
    provider = request.provider.lower()
    key = request.api_key.strip()
    
    if not key:
        return {"success": False, "error": "API Key cannot be empty."}
        
    try:
        if provider == "openai":
            headers = {"Authorization": f"Bearer {key}", "Content-Type": "application/json"}
            data = {"model": "gpt-4o-mini", "messages": [{"role": "user", "content": "ping"}], "max_tokens": 5}
            res = requests.post("https://api.openai.com/v1/chat/completions", headers=headers, json=data, timeout=8)
            if res.status_code == 200:
                return {"success": True, "message": "Successfully connected to OpenAI API!"}
            else:
                return {"success": False, "error": f"OpenAI error (code {res.status_code}): {res.text}"}
                
        elif provider == "nebius":
            headers = {"Authorization": f"Bearer {key}", "Content-Type": "application/json"}
            data = {"model": "meta-llama/Llama-3.3-70B-Instruct", "messages": [{"role": "user", "content": "ping"}], "max_tokens": 5}
            res = requests.post("https://api.tokenfactory.nebius.com/v1/chat/completions", headers=headers, json=data, timeout=8)
            if res.status_code == 200:
                return {"success": True, "message": "Successfully connected to Nebius Token Factory API!"}
            else:
                return {"success": False, "error": f"Nebius error (code {res.status_code}): {res.text}"}
                
        elif provider == "gemini":
            url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key={key}"
            data = {"contents": [{"parts": [{"text": "ping"}]}]}
            res = requests.post(url, json=data, timeout=8)
            if res.status_code == 200:
                return {"success": True, "message": "Successfully connected to Google Gemini API!"}
            else:
                return {"success": False, "error": f"Gemini error (code {res.status_code}): {res.text}"}
        else:
            return {"success": False, "error": f"Unsupported provider: {provider}"}
    except Exception as e:
        return {"success": False, "error": f"Connection failed: {str(e)}"}

@app.post("/api/connections/save")
async def save_connection_endpoint(request: ConnectionSaveRequest):
    """
    Persists API key into .env file and updates runtime environment variables.
    """
    provider = request.provider.lower()
    key = request.api_key.strip()
    
    key_map = {
        "openai": "OPENAI_API_KEY",
        "nebius": "NEBIUS_API_KEY",
        "gemini": "GEMINI_API_KEY"
    }
    
    if provider not in key_map:
        raise HTTPException(status_code=400, detail="Invalid provider")
        
    try:
        update_env_file(key_map[provider], key)
        return {"success": True, "message": f"Successfully updated and loaded {key_map[provider]}."}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to save to .env: {str(e)}")

# Production Readiness: Serve static frontend files directly via FastAPI
dist_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "frontend", "dist")
if os.path.exists(dist_dir):
    from fastapi.staticfiles import StaticFiles
    from fastapi.responses import FileResponse
    
    # Mount static assets directory
    app.mount("/assets", StaticFiles(directory=os.path.join(dist_dir, "assets")), name="assets")
    
    # Route for SPA serving index.html
    @app.get("/{catchall:path}")
    async def serve_frontend(catchall: str):
        if catchall.startswith("api/") or catchall.startswith("docs") or catchall.startswith("redoc") or catchall.startswith("openapi.json"):
            raise HTTPException(status_code=404, detail="Not Found")
        return FileResponse(os.path.join(dist_dir, "index.html"))

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("src.app:app", host="0.0.0.0", port=8000, reload=True)
