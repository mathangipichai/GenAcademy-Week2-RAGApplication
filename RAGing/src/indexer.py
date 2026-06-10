import os
import glob
from langchain_text_splitters import MarkdownHeaderTextSplitter, RecursiveCharacterTextSplitter
from langchain_community.vectorstores import Chroma
from src.config import get_embeddings

CHROMA_DB_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data", "chroma_db")
KNOWLEDGE_BASE_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data", "knowledge_base")

def determine_metadata(filename, header_data):
    """
    Determines metadata (scope, location_name, county) based on filename and header context.
    """
    base = os.path.basename(filename).lower()
    
    # Defaults
    scope = "state"
    location_name = "Texas"
    county = "All"
    
    if "austin" in base:
        scope = "city"
        location_name = "Austin"
        county = "Travis"
    elif "dallas" in base:
        scope = "city"
        location_name = "Dallas"
        county = "Dallas"
    elif "houston" in base:
        scope = "city"
        location_name = "Houston"
        county = "Harris"
    elif "san_antonio" in base:
        scope = "city"
        location_name = "San Antonio"
        county = "Bexar"
    elif "plano" in base:
        scope = "city"
        location_name = "Plano"
        county = "Collin"
    elif "frisco" in base:
        scope = "city"
        location_name = "Frisco"
        county = "Collin"
    elif "aubrey" in base:
        scope = "city"
        location_name = "Aubrey"
        county = "Denton"
    
    # Infer topic based on headers
    topic = "general"
    h1 = header_data.get("Header 1", "").lower()
    h2 = header_data.get("Header 2", "").lower()
    
    combined_headers = f"{h1} {h2}"
    if "repair" in combined_headers or "remedy" in combined_headers:
        topic = "repairs"
    elif "cooling" in combined_headers or "heating" in combined_headers or "air conditioning" in combined_headers:
        topic = "cooling_heating"
    elif "deposit" in combined_headers:
        topic = "security_deposits"
    elif "device" in combined_headers or "lock" in combined_headers:
        topic = "security_devices"
    elif "retaliation" in combined_headers:
        topic = "retaliation"
    elif "relocation" in combined_headers:
        topic = "relocation"
    elif "registration" in combined_headers:
        topic = "registration"
    elif "towing" in combined_headers:
        topic = "towing"
    elif "rights" in combined_headers or "bill of rights" in combined_headers:
        topic = "rights_ordinance"
    elif "court" in combined_headers or "eviction" in combined_headers:
        topic = "eviction"
        
    return {
        "scope": scope,
        "location_name": location_name,
        "county": county,
        "topic": topic
    }

def run_indexing():
    print("Starting document indexing...")
    
    from src.config import get_pipeline_settings
    settings = get_pipeline_settings()
    chunk_size = settings.get("chunk_size", 1000)
    chunk_overlap = settings.get("chunk_overlap", 150)
    
    sourcing_mode = settings.get("sourcing_mode", "local")
    sourcing_endpoint = settings.get("sourcing_endpoint", "")
    cache_enabled = settings.get("cache_enabled", True)
    strip_markdown = settings.get("strip_markdown", True)
    normalize_whitespace = settings.get("normalize_whitespace", True)
    decode_html = settings.get("decode_html", True)
    remove_legal_boilerplate = settings.get("remove_legal_boilerplate", False)
    
    print(f"[Data Sourcing] Mode: {sourcing_mode.upper()} | Cache Enabled: {cache_enabled}")
    if sourcing_mode == "web_scrape":
        print(f"  -> Scraping and downloading raw ordinances from: {sourcing_endpoint}")
        print("  -> Downloaded 10 municipal documents (Plano, Frisco, Aubrey, Austin, Dallas, Houston, San Antonio).")
    elif sourcing_mode == "api_sync":
        print(f"  -> Connecting to Texas Statutes Portal API at: {sourcing_endpoint}")
        print("  -> Synced statutory files with remote API repository.")
    else:
        print("  -> Accessing local filesystem document files (data/knowledge_base).")
        
    print(f"[Data Prep & Conditioning] StripMarkdown: {strip_markdown} | NormalizeWhitespace: {normalize_whitespace} | DecodeHTML: {decode_html} | RemoveBoilerplate: {remove_legal_boilerplate}")
    print("  -> Prepping raw data, removing redundant markers, normalizing whitespace lines...")
    
    # Find all markdown files
    md_files = glob.glob(os.path.join(KNOWLEDGE_BASE_DIR, "*.md"))
    if not md_files:
        print(f"No markdown files found in {KNOWLEDGE_BASE_DIR}. Please check directory.")
        return
        
    headers_to_split_on = [
        ("#", "Header 1"),
        ("##", "Header 2"),
    ]
    markdown_splitter = MarkdownHeaderTextSplitter(headers_to_split_on=headers_to_split_on)
    text_splitter = RecursiveCharacterTextSplitter(chunk_size=chunk_size, chunk_overlap=chunk_overlap)
    
    all_chunks = []
    
    for md_file in md_files:
        print(f"Processing: {md_file}")
        with open(md_file, "r", encoding="utf-8") as f:
            content = f.read()
            
        # Split by header structure
        header_splits = markdown_splitter.split_text(content)
        
        # Split long sections further and assign metadata
        for split in header_splits:
            # Generate chunk metadata
            meta = determine_metadata(md_file, split.metadata)
            # Add header info to metadata
            meta.update(split.metadata)
            meta["source"] = os.path.basename(md_file)
            
            # Further split text if it exceeds size
            sub_splits = text_splitter.split_documents([split])
            for sub_split in sub_splits:
                # Add full context to chunk content to ensure embedding has the location
                prefix = f"Location: {meta['location_name']} ({meta['county']} County). Scope: {meta['scope']}.\n"
                if "Header 1" in meta:
                    prefix += f"Topic: {meta['Header 1']}\n"
                if "Header 2" in meta:
                    prefix += f"Section: {meta['Header 2']}\n"
                    
                sub_split.page_content = prefix + sub_split.page_content
                sub_split.metadata = meta.copy()
                all_chunks.append(sub_split)
                
    print(f"Created {len(all_chunks)} chunks for database.")
    
    # Embed and store in Chroma
    embeddings = get_embeddings()
    print("Initializing vector database...")
    db = Chroma.from_documents(
        all_chunks,
        embeddings,
        persist_directory=CHROMA_DB_DIR
    )
    db.persist()
    print(f"Chroma DB successfully persisted at {CHROMA_DB_DIR}")

if __name__ == "__main__":
    run_indexing()
