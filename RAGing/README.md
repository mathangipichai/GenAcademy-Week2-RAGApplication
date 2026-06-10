# Texas Rental Property RAG - Delivery Mapping

This document provides the project requirements and implementation delivered. It also details the "Above and Beyond" items that exceed the project requirements.

---

## 📋 Core Project Requirements Mapping

### 1. Selected Project Track & Domain
*   **PDF Requirement**: Choose one of the suggested use cases and a build track.
*   **Delivery**:
    *   **Domain**: I implemented **Project 4: Customer Support KB with Hybrid Search**, adapted specifically to the **Texas Renter's Rights & Local Housing Codes Q&A** domain.
    *   **Build Track**: Code-heavy track using **FastAPI** (Python backend), **LangGraph** (stateful workflows), **Chroma DB** (dense vector search), and **Vite React** (frontend).
    *   **Core Backend Entry**: [src/app.py](./src/app.py)

---

### 2. Hybrid Search (Keyword + Semantic Retrieval)
*   **PDF Requirement**: Combine keyword search (sparse) and semantic search (dense) over the document corpus.
*   **Delivery**:
    *   Implemented in [src/retriever.py](./src/retriever.py) within the `TexasRenterRetriever` class.
    *   **Dense Search**: Uses Chroma vector DB similarity search with cosine relevance scores through [Chroma DB](./src/retriever.py#L126).
    *   **Sparse Search**: Uses BM25 keyword matching via the `rank_bm25` Okapi implementation [here](./src/retriever.py#L156).
    *   **Score Fusion**: Dynamically blends dense similarity scores and normalized sparse BM25 scores using weight parameters (`dense_search_weight` and `sparse_search_weight`) loaded from settings [here](./src/retriever.py#L237).

---

### 3. Confidence-Based Fallback and Human Escalation
*   **PDF Requirement**: Implement a fallback mechanism: when the system is not sure of the answer, escalate to a human/advocate rather than hallucinating.
*   **Delivery**:
    *   Orchestrated via a LangGraph state machine in [src/graph.py](./src/graph.py).
    *   **State Machine Routing**: A conditional routing edge `decide_routing` (defined [here](./src/graph.py#L36)) inspects the query and routing topic.
    *   **Safe Escalate Path**: If litigation keywords ("sue", "lawsuit", "court", "attorney", etc.) are detected, if the topic is "eviction", or if retrieved documents list is empty (low confidence), it routes to [escalate_node](./src/graph.py#L156).
    *   **Human Helpline Escalation**: The escalation node refuses to answer to prevent hallucination, and returns a tailored list of local tenant legal aid hotlines (e.g. Austin Tenants Council, Legal Aid of Northwest Texas, Houston Tenants Union, TRLA) corresponding to the detected location.
    *   **State-Level Fallback Disclaimer**: In [generate_answer_node](./src/graph.py#L58), if the user queries a city that doesn't have ordinances loaded in the DB (e.g., Lubbock), it answers using Texas state laws but prefaces the response with a fallback warning notice: *"Note: I could not find specific city-level codes for Lubbock regarding this issue..."*

---

### 4. Evaluation Suite with 20 Benchmark Queries
*   **PDF Requirement**: Test with 20 real-world style queries and measure resolution metrics.
*   **Delivery**:
    *   Benchmark cases are configured in [data/eval_cases.json](./data/eval_cases.json).
    *   Evaluation script is implemented in [src/evaluate.py](./src/evaluate.py).
    *   Runs the benchmark suite through the LangGraph engine, records progress in [data/logs/eval_history.jsonl](./data/logs/eval_history.jsonl), and generates a comprehensive report at [evaluation_report.md](./evaluation_report.md) showing routing status, pass/fail status, and citations count (achieving 100% routing accuracy).

---

### 5. Chatbot User Interface (Optional Add-on)
*   **PDF Requirement**: Vibe-code a chatbot front-end interface and connect it as the front-end for the RAG system.
*   **Delivery**:
    *   Implemented a premium, custom CSS-styled React chatbot frontend in [frontend/src/App.jsx](./frontend/src/App.jsx) and [frontend/src/index.css](./frontend/src/index.css).
    *   Provides an interactive Chat mode with location-tag selectors (e.g. Austin, Plano, Aubrey, Frisco, etc.), legal reference citations cards, expandable sources, and side panels displaying relevant legal advocate groups.
    *   Fully optimized layout to prevent content cutoff and ensure seamless scrolling.

---

## 🚀 Above and Beyond Features

I have built several advanced, interactive capabilities that go significantly beyond the required specification of the RAG project handout:

### 1. Interactive RAG Studio (Visual Pipeline Control)
Instead of static settings files, I created **RAG Studio** directly in the UI dashboard (available in [frontend/src/App.jsx](./frontend/src/App.jsx)):
*   **Interactive One-Liner Builder**: Build the RAG primer framework sentence dynamically ("My RAG app helps...").
*   **Data Sourcing & Preparation Controls**: Explicit selection fields for Sourcing Mode (Local Cache, Municipal Web Scrape, or Portal API Sync), caching triggers, and customized Data Prep/Conditioning rules (markdown stripping, whitespace normalization, HTML decoding, and legal boilerplate removal).
*   **Live Hyperparameter Sliders**: Adjust chunk size, chunk overlap, dense similarity search weight, and sparse search weight on the fly. Settings are serialized dynamically to `pipeline_settings.json` and consumed by [src/config.py](./src/config.py).
*   **Visual Execution Graph**: Interactive canvas visualizing the 8 nodes of the RAG pipeline (`Sourcing` -> `Data Prep` -> `Ingestion` -> `Chunker` -> `Vector Store` -> `Retriever` -> `LangGraph` -> `Auditor`). When a build is triggered, the active node pulses with a glowing CSS animation to reflect the live backend run.
*   **Live stdout/stderr Terminal Console**: Built a streaming console panel that displays indexer and evaluator logs in real time as subprocesses execute on the FastAPI backend.

### 2. Telemetry and Knowledge Base Gaps Dashboard
To facilitate continuous, repeatable RAG improvements:
*   **Telemetry History**: Tracks user search queries, citations count, detected topic, and routing outcome in `query_history.jsonl`.
*   **Database Gaps Notifier**: Scans the query log automatically to identify searches that resulted in legal escalation or returned zero context citations. Prompts the admin with warnings detailing missing information (e.g. *"Missing ordinances for El Paso regarding security deposits"*).
*   **Knowledge Base File Registry**: Interactive overview of indexed source files (e.g., [austin.md](./data/knowledge_base/austin.md), [plano.md](./data/knowledge_base/plano.md), [aubrey.md](./data/knowledge_base/aubrey.md)) showing file size and document records.
*   **RAG Run History Graph**: Plots previous evaluation accuracy levels over successive pipeline runs to record validation improvement over time.

### 3. Interactive Model Provider Connections Dashboard
I added a new configuration interface in the UI dashboard (available in [frontend/src/App.jsx](./frontend/src/App.jsx#L1258)) to setup, test, and make a connection to at least one model provider:
*   **Provider support**: Setup credentials for **Nebius Token Factory**, **OpenAI**, and **Google Gemini** APIs.
*   **Testing Suite**: Includes a dedicated "Test Connection" (`🧪 Test`) button for each provider. The frontend calls the backend endpoint `/api/connections/test` which queries a minimal prompt completion check using direct HTTP calls to the respective provider endpoint with the entered key, confirming credentials validation in real time.
*   **Dynamic Persistence**: Clicking "Save Connection" (`💾 Save`) saves the credentials to the backend `.env` configuration file, immediately updating active environmental variables dynamically.