import os
import json
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Default config settings
PORT = int(os.getenv("PORT", 8000))
HOST = os.getenv("HOST", "0.0.0.0")

def get_embeddings():
    """
    Returns the appropriate embeddings model based on environment variables.
    Falls back to a local in-memory model if no keys are found.
    """
    nebius_key = os.getenv("NEBIUS_API_KEY", "")
    openai_key = os.getenv("OPENAI_API_KEY", "")
    
    if nebius_key:
        # Use Nebius API for embeddings if they support BAAI/bge-en-icl
        from langchain_openai import OpenAIEmbeddings
        return OpenAIEmbeddings(
            model="BAAI/bge-en-icl",
            openai_api_key=nebius_key,
            openai_api_base="https://api.tokenfactory.nebius.com/v1/"
        )
    elif openai_key:
        from langchain_openai import OpenAIEmbeddings
        return OpenAIEmbeddings(model="text-embedding-3-small", openai_api_key=openai_key)
    else:
        # Zero-key fallback: use HuggingFace local embeddings
        # Since we want to make it easy and not fail on missing keys,
        # we load HuggingFaceEmbeddings using community langchain
        try:
            from langchain_community.embeddings import HuggingFaceEmbeddings
            return HugFaceFallbackEmbeddings()
        except Exception:
            # If HuggingFace is not installed or errors, return a basic fake embedding for testing
            from langchain_core.embeddings import Embeddings
            class FakeEmbeddings(Embeddings):
                def embed_documents(self, texts):
                    return [[0.1] * 384 for _ in texts]
                def embed_query(self, text):
                    return [0.1] * 384
            return FakeEmbeddings()

class HugFaceFallbackEmbeddings:
    """
    Lazy loader class to avoid loading sentence-transformers if we have API keys.
    """
    def __init__(self):
        self._embeddings = None

    def _get_emb(self):
        if self._embeddings is None:
            from langchain_community.embeddings import HuggingFaceEmbeddings
            self._embeddings = HuggingFaceEmbeddings(model_name="sentence-transformers/all-MiniLM-L6-v2")
        return self._embeddings

    def embed_documents(self, texts):
        return self._get_emb().embed_documents(texts)

    def embed_query(self, text):
        return self._get_emb().embed_query(text)

def get_llm():
    """
    Returns the appropriate ChatLLM client based on environment variables.
    Defaults to Nebius if key is present, otherwise checks OpenAI or Gemini,
    and falls back to a MockLLM for dry runs if no keys are present.
    """
    nebius_key = os.getenv("NEBIUS_API_KEY", "")
    openai_key = os.getenv("OPENAI_API_KEY", "")
    
    if nebius_key:
        from langchain_openai import ChatOpenAI
        return ChatOpenAI(
            model="meta-llama/Llama-3.3-70B-Instruct",
            openai_api_key=nebius_key,
            openai_api_base="https://api.tokenfactory.nebius.com/v1/",
            temperature=0.0
        )
    elif openai_key:
        from langchain_openai import ChatOpenAI
        return ChatOpenAI(model="gpt-4o-mini", openai_api_key=openai_key, temperature=0.0)
    else:
        # Mock LLM for local dry-runs
        from langchain_core.language_models.chat_models import SimpleChatModel
        from langchain_core.messages import BaseMessage, AIMessage
        from typing import List, Optional
        from langchain_core.callbacks import CallbackManagerForLLMRun

        class MockChatLLM(SimpleChatModel):
            def _call(
                self,
                messages: List[BaseMessage],
                stop: Optional[List[str]] = None,
                run_manager: Optional[CallbackManagerForLLMRun] = None,
                **kwargs
            ) -> str:
                # Basic mock logic for testing without keys
                last_msg = messages[-1].content.lower()
                if "austin" in last_msg:
                    return '{"city": "Austin", "county": "Travis", "topic": "heating_cooling", "explanation": "Detected Austin cooling laws."}'
                elif "dallas" in last_msg:
                    return '{"city": "Dallas", "county": "Dallas", "topic": "heating_cooling", "explanation": "Detected Dallas cooling laws."}'
                else:
                    return '{"city": "", "county": "", "topic": "unknown", "explanation": "Generic query."}'
            
            @property
            def _llm_type(self) -> str:
                return "mock-chat"

        return MockChatLLM()

SETTINGS_PATH = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data", "logs", "pipeline_settings.json")

def save_pipeline_settings(settings: dict):
    """
    Saves RAG pipeline configuration parameters to JSON file.
    """
    os.makedirs(os.path.dirname(SETTINGS_PATH), exist_ok=True)
    with open(SETTINGS_PATH, "w", encoding="utf-8") as f:
        json.dump(settings, f, indent=2)

def get_pipeline_settings():
    """
    Returns high-level pipeline settings and configuration flags, loading dynamic overrides if present.
    """
    import json
    nebius_key = os.getenv("NEBIUS_API_KEY", "")
    openai_key = os.getenv("OPENAI_API_KEY", "")
    emb_model = "BAAI/bge-en-icl (Nebius API)" if nebius_key else ("text-embedding-3-small (OpenAI API)" if openai_key else "sentence-transformers/all-MiniLM-L6-v2 (Local)")
    llm_model = "meta-llama/Llama-3.3-70B-Instruct (Nebius API)" if nebius_key else ("gpt-4o-mini (OpenAI API)" if openai_key else "Mock Renter Agent LLM (Dry Run)")
    
    defaults = {
        "chunk_size": 1000,
        "chunk_overlap": 150,
        "embeddings_model": emb_model,
        "llm_model": llm_model,
        "dense_search_weight": 0.6,
        "sparse_search_weight": 0.4,
        "routing_threshold": "litigation/sue/court keywords",
        "sourcing_mode": "local",
        "sourcing_endpoint": "https://statutes.capitol.texas.gov/api/v1/prop/92",
        "cache_enabled": True,
        "strip_markdown": True,
        "normalize_whitespace": True,
        "decode_html": True,
        "remove_legal_boilerplate": False,
        "frameworks": {
            "indexing": "LangChain (MarkdownHeaderTextSplitter + RecursiveCharacterTextSplitter)",
            "retrieval": "Chroma DB (Dense Vector) + Rank-BM25 (Sparse Keyword) Hybrid",
            "orchestration": "LangGraph (Stateful Routing Machine & Fallback Router)",
            "api_server": "FastAPI (Uvicorn)"
        }
    }
    
    if os.path.exists(SETTINGS_PATH):
        try:
            with open(SETTINGS_PATH, "r", encoding="utf-8") as f:
                loaded = json.load(f)
                # Overwrite defaults with loaded settings
                for k, v in loaded.items():
                    if k in defaults:
                        defaults[k] = v
        except Exception:
            pass
            
    return defaults


