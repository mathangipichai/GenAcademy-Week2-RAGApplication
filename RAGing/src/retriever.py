import os
import json
import re
from typing import List, Dict, Any, Tuple
from langchain_community.vectorstores import Chroma
from rank_bm25 import BM25Okapi
from src.config import get_embeddings, get_llm

CHROMA_DB_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data", "chroma_db")

# Simple regex-based fallback for location extraction when API keys are not present
def extract_location_fallback(query: str) -> Dict[str, str]:
    query_lower = query.lower()
    city = ""
    county = ""
    topic = "general"
    
    if "austin" in query_lower:
        city = "Austin"
        county = "Travis"
    elif "dallas" in query_lower:
        city = "Dallas"
        county = "Dallas"
    elif "houston" in query_lower:
        city = "Houston"
        county = "Harris"
    elif "san antonio" in query_lower or "sanantonio" in query_lower:
        city = "San Antonio"
        county = "Bexar"
    elif "plano" in query_lower:
        city = "Plano"
        county = "Collin"
    elif "frisco" in query_lower:
        city = "Frisco"
        county = "Collin"
    elif "aubrey" in query_lower:
        city = "Aubrey"
        county = "Denton"
    elif "el paso" in query_lower or "elpaso" in query_lower:
        city = "El Paso"
        county = "El Paso"
    elif "lubbock" in query_lower:
        city = "Lubbock"
        county = "Lubbock"
        
    if "travis" in query_lower:
        county = "Travis"
        if not city: city = "Austin"
    elif "harris" in query_lower:
        county = "Harris"
        if not city: city = "Houston"
    elif "bexar" in query_lower:
        county = "Bexar"
        if not city: city = "San Antonio"
    elif "collin" in query_lower:
        county = "Collin"
        if not city: city = "Plano"
    elif "denton" in query_lower:
        county = "Denton"
        if not city: city = "Aubrey"
        
    # Simple topic extraction
    if "deposit" in query_lower:
        topic = "security_deposits"
    elif "repair" in query_lower or "fix" in query_lower or "leak" in query_lower or "mold" in query_lower:
        topic = "repairs"
    elif "ac" in query_lower or "air condition" in query_lower or "cooling" in query_lower or "heat" in query_lower:
        topic = "cooling_heating"
    elif "retaliat" in query_lower:
        topic = "retaliation"
    elif "tow" in query_lower:
        topic = "towing"
    elif "evict" in query_lower or "sue" in query_lower or "court" in query_lower:
        topic = "eviction"
        
    return {"city": city, "county": county, "topic": topic}

def analyze_query(query: str) -> Dict[str, Any]:
    """
    Calls the LLM to extract target location (city, county) and topic from the query.
    Falls back to regex if LLM fails or is a mock.
    """
    llm = get_llm()
    fallback = extract_location_fallback(query)
    
    # Check if we are using the Mock LLM
    if hasattr(llm, "_llm_type") and llm._llm_type == "mock-chat":
        return fallback

    prompt = f"""You are a legal router for a Texas Renter RAG application.
Your job is to analyze the user's search query and extract:
1. "city": The specific Texas city mentioned (e.g. Austin, Houston, Dallas, San Antonio), or empty string if none.
2. "county": The specific Texas county mentioned (e.g. Travis, Harris, Dallas, Bexar), or empty string if none.
3. "topic": The core legal topic. Must be one of: "repairs", "cooling_heating", "security_deposits", "security_devices", "retaliation", "relocation", "registration", "towing", "rights_ordinance", "eviction", or "general".

Query: "{query}"

Return ONLY a JSON object in this format:
{{
  "city": "extracted_city_or_empty",
  "county": "extracted_county_or_empty",
  "topic": "extracted_topic"
}}
Do not include any other text or markdown blocks (like ```json). Just the raw JSON.
"""
    try:
        response = llm.invoke(prompt)
        text = response.content.strip()
        # Strip code fences if present
        text = re.sub(r"^```json\s*", "", text, flags=re.IGNORECASE)
        text = re.sub(r"\s*```$", "", text, flags=re.IGNORECASE)
        data = json.loads(text)
        
        # Verify fields, use fallback if empty but fallback has it
        for field in ["city", "county", "topic"]:
            if not data.get(field) and fallback.get(field):
                data[field] = fallback[field]
        return data
    except Exception as e:
        print(f"LLM query analysis failed ({e}). Using regex fallback.")
        return fallback

class TexasRenterRetriever:
    def __init__(self):
        self.embeddings = get_embeddings()
        self.db = Chroma(persist_directory=CHROMA_DB_DIR, embedding_function=self.embeddings)
        self._init_bm25()

    def _init_bm25(self):
        """
        Retrieves all documents from the vector DB to initialize the BM25 index.
        """
        # Load all documents from Chroma
        self.all_docs = self.db.get()
        self.chunks = []
        tokenized_corpus = []
        
        if self.all_docs and "documents" in self.all_docs:
            for i in range(len(self.all_docs["documents"])):
                content = self.all_docs["documents"][i]
                metadata = self.all_docs["metadatas"][i]
                doc_id = self.all_docs["ids"][i]
                
                chunk_obj = {
                    "content": content,
                    "metadata": metadata,
                    "id": doc_id
                }
                self.chunks.append(chunk_obj)
                
                # Tokenize for BM25 (simple whitespace & lowercase tokenizer)
                tokens = re.findall(r"\w+", content.lower())
                tokenized_corpus.append(tokens)
                
        if tokenized_corpus:
            self.bm25 = BM25Okapi(tokenized_corpus)
        else:
            self.bm25 = None

    def retrieve(self, query: str, top_k: int = 4) -> Tuple[List[Dict[str, Any]], Dict[str, Any]]:
        """
        Performs hybrid search. Filters metadata by scope and extracted location,
        merges vector search and BM25 search scores.
        """
        analysis = analyze_query(query)
        city = analysis.get("city", "")
        county = analysis.get("county", "")
        
        # Build Chroma metadata filter
        # We want: (scope == "state") OR (scope == "city" AND location_name == city)
        # In Chroma, $or syntax is: {"$or": [filter1, filter2]}
        chroma_filter = None
        if city:
            chroma_filter = {
                "$or": [
                    {"scope": "state"},
                    {"location_name": city}
                ]
            }
        elif county:
            # If they search by county, filter state laws or county matching rules
            chroma_filter = {
                "$or": [
                    {"scope": "state"},
                    {"county": county}
                ]
            }
            
        # 1. Vector Search
        vector_results = []
        if chroma_filter:
            vector_docs = self.db.similarity_search_with_relevance_scores(
                query, k=top_k * 2, filter=chroma_filter
            )
        else:
            vector_docs = self.db.similarity_search_with_relevance_scores(
                query, k=top_k * 2
            )
            
        for doc, score in vector_docs:
            vector_results.append({
                "content": doc.page_content,
                "metadata": doc.metadata,
                "vector_score": float(score)
            })
            
        # 2. BM25 Search
        bm25_results = []
        if self.bm25 and self.chunks:
            query_tokens = re.findall(r"\w+", query.lower())
            bm25_scores = self.bm25.get_scores(query_tokens)
            
            # Normalize BM25 scores to [0, 1] range
            max_score = max(bm25_scores) if len(bm25_scores) > 0 else 0
            
            for idx, score in enumerate(bm25_scores):
                chunk = self.chunks[idx]
                
                # Check metadata filter manually for BM25
                meta = chunk["metadata"]
                if city:
                    if meta["scope"] != "state" and meta["location_name"] != city:
                        continue
                elif county:
                    if meta["scope"] != "state" and meta["county"] != county:
                        continue
                        
                norm_score = score / max_score if max_score > 0 else 0.0
                bm25_results.append({
                    "content": chunk["content"],
                    "metadata": chunk["metadata"],
                    "bm25_score": norm_score
                })
                
        # 3. Reciprocal Rank Fusion / Score Merger
        # We merge scores using weights from pipeline settings
        from src.config import get_pipeline_settings
        settings = get_pipeline_settings()
        dense_w = settings.get("dense_search_weight", 0.6)
        sparse_w = settings.get("sparse_search_weight", 0.4)
        
        merged_docs = {}
        
        # Add vector search hits
        for idx, doc in enumerate(vector_results):
            content = doc["content"]
            merged_docs[content] = {
                "content": content,
                "metadata": doc["metadata"],
                "vector_score": doc["vector_score"],
                "bm25_score": 0.0,
                "vector_rank": idx + 1,
                "bm25_rank": 999
            }
            
        # Add/update BM25 hits
        for idx, doc in enumerate(sorted(bm25_results, key=lambda x: x["bm25_score"], reverse=True)):
            content = doc["content"]
            if content in merged_docs:
                merged_docs[content]["bm25_score"] = doc["bm25_score"]
                merged_docs[content]["bm25_rank"] = idx + 1
            else:
                merged_docs[content] = {
                    "content": content,
                    "metadata": doc["metadata"],
                    "vector_score": 0.0,
                    "bm25_score": doc["bm25_score"],
                    "vector_rank": 999,
                    "bm25_rank": idx + 1
                }
                
        # Calculate hybrid score and sort
        hybrid_results = []
        for doc in merged_docs.values():
            # Blend score using dynamic weights
            hybrid_score = dense_w * doc["vector_score"] + sparse_w * doc["bm25_score"]
            doc["hybrid_score"] = hybrid_score
            hybrid_results.append(doc)
            
        # Sort by hybrid score
        hybrid_results = sorted(hybrid_results, key=lambda x: x["hybrid_score"], reverse=True)
        return hybrid_results[:top_k], analysis

if __name__ == "__main__":
    # Quick test
    retriever = TexasRenterRetriever()
    q = "what are the cooling requirements in Austin?"
    docs, analysis = retriever.retrieve(q)
    print("Analysis:", analysis)
    print(f"\nRetrieved {len(docs)} docs:")
    for d in docs:
        print(f"- Scope: {d['metadata']['scope']}, Location: {d['metadata']['location_name']}, Score: {d['hybrid_score']:.3f}")
        print(f"  Content: {d['content'][:150]}...")
