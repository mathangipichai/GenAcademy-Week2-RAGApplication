# Texas Rental Property RAG - Delivery Mapping

This document provides a comprehensive mapping between the project requirements specified in the [Week 2 Project Handout_ RAG.pdf](./Week%202%20Project%20Handout_%20RAG.pdf) and the actual implementation delivered in this workspace. It also details the "Above and Beyond" items that exceed the project requirements.


---

## 📐 RAG Stack Architecture Framework

| RAG Layer | Specification (1-2 sentences max) |
| :--- | :--- |
| **Use case** | Renters ask about local habitability standards, cooling/heating limits, and security deposit rights, accessed via a custom React chatbot widget and FastAPI REST API endpoints. |
| **Corpus** | Consists of municipal tenant rights code files and state statutes (around 8 files, Markdown format, English language), where the source of truth is owned by city compliance departments and the Texas Legislature. |
| **Ingestion + cleaning** | Files are processed via a directory reader or web scraper, then cleaned by stripping markdown indicators, decoding HTML entities, normalizing whitespaces, and removing generic disclaimer boilerplate. |
| **Ingestion + freshness** | Ingested on-demand via RAG Studio or CLI commands with a weekly scheduled update frequency to match municipal council code update releases. |
| **Chunking + embedding** | Uses fixed-size recursive character chunking (1,000 characters, 150 overlap) and embeds them using the offline `sentence-transformers/all-MiniLM-L6-v2` model to avoid external API dependencies. |
| **Retrieve** | Leverages a local Chroma DB instance for hybrid search (fusing dense cosine similarity scores with sparse rank-BM25 keyword scores) and returns the top-4 context chunks. |

---

## 📋 Core Project Requirements Mapping

### 1. Selected Project Track & Domain
*   **PDF Requirement**: Choose one of the suggested use cases and a build track.
*   **Delivery**:
    *   **Domain**: We implemented **Project 4: Customer Support KB with Hybrid Search**, adapted specifically to the **Texas Renter's Rights & Local Housing Codes Q&A** domain.
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

We have built several advanced, interactive capabilities that go significantly beyond the required specification of the RAG project handout:

### 1. Interactive RAG Studio (Visual Pipeline Control)
Instead of static settings files, we created **RAG Studio** directly in the UI dashboard (available in [frontend/src/App.jsx](./frontend/src/App.jsx)):
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

### 3. Expanded Local Scope Cities
*   Added specific city ordinances, geolocation matching, and human escalation helpline contacts for **Plano**, **Frisco**, and **Aubrey** in addition to the original major cities (Austin, Dallas, Houston, San Antonio).

### 4. Command Line Interface (CLI) Tool
We created a full-featured CLI utility in [cli.py](./cli.py) that exposes the identical pipeline controls, configurations, querying, and evaluations as the UI dashboard:
*   **RAG Query Command**: Query the LangGraph workflow directly via standard input (e.g. `python cli.py query "..."` or `python cli.py chat "..."`) with styled color-coded terminal responses, extracted metadata, and references.
*   **Direct Chroma DB Query Command**: Run raw vector search queries directly on the DB bypassed of LLM processing with metadata filters (e.g. `python cli.py query-db "Aubrey temperature rules" --city Aubrey --k 2` or use the alias `python cli.py chroma "..."`).
*   **Pipeline Run/Build Command**: Execute complete data sourcing, preparation, vector store indexing, and benchmark evaluation runs directly from the terminal (e.g. `python cli.py pipeline run --chunk-size 1000 --dense-weight 0.7 --sourcing-mode local`), with granular flags mapping to the UI sliders.
*   **Config & Evaluation Commands**: Print the active serialization parameters (`python cli.py config show`) and execute the 20 benchmark validation suite cases (`python cli.py evaluate`) to output live routing accuracy scores.

### 5. Automated Setup & Run Shell Scripts
We delivered two lightweight utility scripts in the project root to automate environment provisioning and execution:
*   [setup.sh](./setup.sh): Autodetects or provisions a Python virtual environment (`.venv`), upgrades pip, installs backend packages (including `pypdf`), installs Vite React dependencies in `frontend`, and executes the initial document ingestion and vector database indexing.
*   [run.sh](./run.sh): Starts the FastAPI backend (outputting stderr/stdout to `backend.log` to prevent terminal clutter) and launches the Vite client server (`npm run dev`) concurrently. Traps `SIGINT`/`SIGTERM` interrupts to ensure clean subprocess termination upon hitting `Ctrl+C`.

### 6. Interactive Model Provider Connections Dashboard & API Hardening
We added a new configuration interface in the UI dashboard (available in [frontend/src/App.jsx](./frontend/src/App.jsx#L1258)) to setup, test, and persist model connections, fully hardened against API failures:
*   **Provider support**: Setup credentials for **Nebius Token Factory**, **OpenAI**, and **Google Gemini** APIs.
*   **Testing Suite**: Includes a dedicated "Test Connection" (`🧪 Test`) button for each provider. The frontend calls the backend endpoint `/api/connections/test` which queries a minimal prompt completion check using direct HTTP calls to the respective provider endpoint with the entered key, confirming credentials validation in real time.
*   **API Hardening & Graceful Recovery**: In [graph.py](./src/graph.py#L140), LLM invocations are wrapped in robust exception handlers with automated categorizations for auth errors, rate limits, and network timeouts. If a model provider goes offline or the key is rejected, the chatbot fails gracefully: instead of crashing, it presents a clean warning and prints the raw retrieved city/state ordinances directly, maintaining utility.
*   **API Call Logs & History Panel**: Created a new sub-tab **📡 API Call History** on the RAG dashboard. It queries a locally persisted `data/logs/api_calls.jsonl` database to visualize response times (in seconds), target model names, request endpoints, success statuses, HTTP codes, and detailed error payloads for failed calls.

### 7. Direct Chroma DB Query Wrapper CLI (`query_chroma.py`)
To bypass LLM processing and inspect raw retrieved records directly, we created a specialized query utility in [query_chroma.py](./query_chroma.py):
*   **Direct Vector DB Querying**: Queries the local Chroma DB database at `data/chroma_db` using local embeddings without passing the text to an LLM or triggering state machine routing.
*   **Preloaded Sample Queries**: Comes with built-in default query options for quick testing, such as Aubrey heating standards, Austin cooling rules, Dallas registration, and Texas deposit return penalties.
*   **Custom Parameter Filtering**: Allows users to specify results quantity limit `--k` and metadata constraints like `--city` or `--topic`.
*   **Aesthetic Console Formatting**: Outputs structured cards with relevance scores, source documents, scopes, and clean side-border indented content snippet blocks for ultimate readability.
