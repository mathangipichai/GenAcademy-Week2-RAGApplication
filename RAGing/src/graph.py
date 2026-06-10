import os
import json
from typing import List, Dict, Any, TypedDict, Annotated, Sequence
from langgraph.graph import StateGraph, START, END
from src.retriever import TexasRenterRetriever
from src.config import get_llm

# Define state structure
class AgentState(TypedDict):
    query: str
    city: str
    county: str
    topic: str
    retrieved_docs: List[Dict[str, Any]]
    response: str
    status: str  # "answered_local", "answered_fallback_state", "escalated_legal"
    citations: List[Dict[str, Any]]

# Initialize retriever
retriever = TexasRenterRetriever()

def analyze_and_retrieve_node(state: AgentState) -> Dict[str, Any]:
    """
    Node to extract query location/topic and retrieve documents.
    """
    query = state["query"]
    docs, analysis = retriever.retrieve(query)
    
    return {
        "city": analysis.get("city", ""),
        "county": analysis.get("county", ""),
        "topic": analysis.get("topic", ""),
        "retrieved_docs": docs
    }

def decide_routing(state: AgentState) -> str:
    """
    Conditional edge to decide whether to answer or escalate.
    We escalate if the topic is eviction/court proceedings, if the user asks how to sue,
    or if the retrieved documents are completely empty/irrelevant.
    """
    query = state["query"].lower()
    topic = state["topic"]
    docs = state["retrieved_docs"]
    
    # 1. Check for specific litigation keywords that demand professional legal counsel
    litigation_keywords = ["sue", "lawsuit", "court", "judge", "attorney", "lawyer", "eviction hearing"]
    if any(kw in query for kw in litigation_keywords) or topic == "eviction":
        return "escalate"
        
    # 2. Check if we have no retrieved documents
    if not docs or len(docs) == 0:
        return "escalate"
        
    # Otherwise, attempt to generate an answer
    return "generate_answer"

def generate_answer_node(state: AgentState) -> Dict[str, Any]:
    """
    Node to generate the answer with citations and handle the state-level fallback notice.
    """
    query = state["query"]
    city = state["city"]
    county = state["county"]
    docs = state["retrieved_docs"]
    llm = get_llm()
    
    # Check if we have city-specific documents in the retrieved set
    has_city_docs = any(d["metadata"]["scope"] == "city" for d in docs)
    
    # Build context string
    context_parts = []
    for idx, d in enumerate(docs):
        meta = d["metadata"]
        context_parts.append(
            f"Document [{idx+1}]:\n"
            f"Source: {meta.get('source')}\n"
            f"Scope: {meta.get('scope')}\n"
            f"Location: {meta.get('location_name')} ({meta.get('county')} County)\n"
            f"Header: {meta.get('Header 2', meta.get('Header 1', ''))}\n"
            f"Content: {d['content']}\n"
            f"---"
        )
    context = "\n".join(context_parts)
    
    # Create citations list
    citations = []
    for idx, d in enumerate(docs):
        meta = d["metadata"]
        citations.append({
            "index": idx + 1,
            "source": meta.get("source", "Unknown"),
            "scope": meta.get("scope", "state"),
            "location": meta.get("location_name", "Texas"),
            "section": meta.get("Header 2", meta.get("Header 1", "General")),
            "snippet": d["content"][:200] + "..."
        })
        
    status = "answered_local" if (city and has_city_docs) else "answered_fallback_state"
    
    # Mock LLM check
    if hasattr(llm, "_llm_type") and llm._llm_type == "mock-chat":
        # Formulate a mock answer
        if city:
            if has_city_docs:
                resp = f"According to {city} codes, landlords must maintain units properly (e.g. heating and cooling). Please refer to the local housing code citations for details."
            else:
                resp = f"I could not find city-specific ordinances for {city} in our database. However, under Texas State Law (Texas Property Code Chapter 92), landlords are required to maintain systems affecting physical health and safety."
        else:
            resp = "Under Texas State Law (Property Code Section 92), you have a right to demand repairs for issues that affect health or safety. You must give written notice."
            
        return {
            "response": resp,
            "citations": citations,
            "status": status
        }
        
    # Construct the instruction for the LLM
    fallback_instruction = ""
    if city and not has_city_docs:
        fallback_instruction = f"""
IMPORTANT: The user asked about the city '{city}'. However, there are no city-specific rules in the provided context for '{city}' (only Texas state rules are present).
You MUST start your answer with a fallback notice:
"Note: I could not find specific city-level codes for {city} regarding this issue. Here are the general Texas State laws that apply:"
"""
        
    system_prompt = f"""You are a helpful Texas Renter Assistant. You answer questions about renter rights, housing codes, and landlord duties based ONLY on the provided context.
If the context does not contain enough information to answer, state that you do not know.

Guidelines:
1. Ground your answer strictly in the provided documents.
2. Cite documents by number (e.g., [1], [2]) when referencing facts.
3. Be professional, clear, and reassuring, but add a standard legal disclaimer: "Disclaimer: I am an AI assistant, not an attorney. This is for informational purposes only."
{fallback_instruction}

Context:
{context}
"""

    try:
        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": query}
        ]
        response = llm.invoke(messages)
        answer = response.content.strip()
    except Exception as e:
        answer = f"Error generating answer: {e}. However, here are the retrieved documents: \n" + "\n\n".join([d["content"] for d in docs])
        
    return {
        "response": answer,
        "citations": citations,
        "status": status
    }

def escalate_node(state: AgentState) -> Dict[str, Any]:
    """
    Node that handles escalation, providing specific tenant resources based on the location.
    """
    city = state["city"]
    
    resources = [
        "- **Texas Tenant Advisor**: Online self-help resources (www.texastenantorg.org)",
        "- **Lone Star Legal Aid**: Free legal aid for low-income tenants (1-800-733-8394)",
        "- **Texas Bar Legal Referral Service**: To find a tenant attorney (1-800-252-9690)"
    ]
    
    local_resources = []
    if city == "Austin":
        local_resources = [
            "- **Austin Tenants Council**: Rental counseling and mediation (512-474-1961)",
            "- **Texas RioGrande Legal Aid (TRLA)**: Free eviction defense (1-888-988-9996)"
        ]
    elif city == "Dallas":
        local_resources = [
            "- **Legal Aid of Northwest Texas (LANWT)**: Free legal support (214-748-1234)",
            "- **Dallas Housing Crisis Center**: Eviction advice hotline (214-828-4244)"
        ]
    elif city == "Houston":
        local_resources = [
            "- **Lone Star Legal Aid Houston Office**: (713-652-0077)",
            "- **Houston Tenants Union**: Local tenant community support"
        ]
    elif city == "San Antonio":
        local_resources = [
            "- **Texas RioGrande Legal Aid (TRLA) San Antonio**: (210-212-3700)",
            "- **City of San Antonio Fair Housing Division**: (210-207-5910)"
        ]
    elif city in ["Plano", "Frisco"]:
        local_resources = [
            "- **Legal Aid of Northwest Texas (LANWT) McKinney**: (972-542-9405)",
            "- **Plano Housing Authority**: (972-420-3530)"
        ]
    elif city == "Aubrey":
        local_resources = [
            "- **Legal Aid of Northwest Texas (LANWT) Denton**: (940-387-5357)",
            "- **Aubrey Code Compliance**: (940-440-9343)"
        ]
        
    all_resources = local_resources + resources
    resource_text = "\n".join(all_resources)
    
    resp = f"""### ⚠️ Human / Legal Aid Escalation Notice

I cannot resolve this query directly, as it requires legal advice, court procedure filing, or there is no matching information in my database.

**Here is a list of free tenant advocacy groups and legal aid resources near you:**

{resource_text}

*Disclaimer: I am an AI assistant. Please contact these organizations or a licensed attorney for formal legal advice.*
"""
    return {
        "response": resp,
        "citations": [],
        "status": "escalated_legal"
    }

# Build LangGraph
workflow = StateGraph(AgentState)

# Add Nodes
workflow.add_node("analyze_and_retrieve", analyze_and_retrieve_node)
workflow.add_node("generate_answer", generate_answer_node)
workflow.add_node("escalate", escalate_node)

# Add Edges
workflow.set_entry_point("analyze_and_retrieve")
workflow.add_conditional_edges(
    "analyze_and_retrieve",
    decide_routing,
    {
        "generate_answer": "generate_answer",
        "escalate": "escalate"
    }
)
workflow.add_edge("generate_answer", END)
workflow.add_edge("escalate", END)

# Compile graph
app = workflow.compile()

if __name__ == "__main__":
    # Test query
    print("Testing LangGraph Workflow...")
    res = app.invoke({"query": "What are the rules for AC repairs in Austin?"})
    print("\n--- Austin RAG Answer ---")
    print("Status:", res["status"])
    print("Response:", res["response"])
    
    print("\n--- Fallback Query Test ---")
    res_fallback = app.invoke({"query": "what are the rules for AC repairs in Lubbock?"})
    print("Status:", res_fallback["status"])
    print("Response:", res_fallback["response"])
    
    print("\n--- Escalation Test ---")
    res_esc = app.invoke({"query": "how do I file a lawsuit to sue my landlord in court?"})
    print("Status:", res_esc["status"])
    print("Response:", res_esc["response"])
