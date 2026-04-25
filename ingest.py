"""
Ingestion pipeline: downloads PDFs, parses, chunks semantically,
embeds with a local model, and stores in ChromaDB.

Run once to build the vector store:
    python ingest.py

Run with --verify to test retrieval after ingestion:
    python ingest.py --verify
"""

import os
import re
import sys
import requests
import pdfplumber
import chromadb
from pathlib import Path
from sentence_transformers import SentenceTransformer

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

DATA_DIR      = Path("data")
VECTORSTORE   = Path("vectorstore")
EMBED_MODEL   = "BAAI/bge-small-en-v1.5"   # small, fast, offline after first run
COLLECTION    = "dutyline"

CHUNK_MIN_TOKENS = 150
CHUNK_MAX_TOKENS = 600

# Phase 1 sources — priority order
SOURCES = [
    {
        "url":         "https://media.defense.gov/2022/jan/04/2002917147/-1/-1/0/jtr.pdf",
        "local_path":  DATA_DIR / "jtr" / "jtr.pdf",
        "domain":      "travel",
        "branch":      "defense_wide",
        "doc_type":    "regulation",
        "source_file": "jtr.pdf",
    },
    {
        "url":         "https://armypubs.army.mil/epubs/DR_pubs/DR_a/ARN32388-AR_600-8-10-001-WEB-1.pdf",
        "local_path":  DATA_DIR / "army_regs" / "ar_600_8_10.pdf",
        "domain":      "leave",
        "branch":      "army",
        "doc_type":    "regulation",
        "source_file": "ar_600_8_10.pdf",
    },
]

# ---------------------------------------------------------------------------
# Step 1: Download PDFs
# ---------------------------------------------------------------------------

def download_pdf(url: str, dest: Path) -> bool:
    if dest.exists() and dest.stat().st_size > 10_000:
        print(f"  [ok] {dest.name} already present ({dest.stat().st_size // 1024} KB)")
        return True
    dest.parent.mkdir(parents=True, exist_ok=True)
    print(f"  [missing] {dest.name}")
    print(f"            Download manually from: {url}")
    print(f"            Save to: {dest}")
    return False

# ---------------------------------------------------------------------------
# Step 2: Parse PDF → raw text with page numbers
# ---------------------------------------------------------------------------

def parse_pdf(path: Path) -> list[dict]:
    """Returns list of {text, page} dicts, one per page."""
    pages = []
    try:
        with pdfplumber.open(path) as pdf:
            for i, page in enumerate(pdf.pages):
                text = page.extract_text()
                if text and text.strip():
                    pages.append({"text": text.strip(), "page": i + 1})
    except Exception as e:
        print(f"  [error] parsing {path.name}: {e}")
    return pages

# ---------------------------------------------------------------------------
# Step 3: Semantic chunking
# ---------------------------------------------------------------------------

# Patterns that mark the start of a new section in military docs
SECTION_PATTERNS = [
    r"^\d{6}\.",            # JTR: 020101.  020102.
    r"^\d+-\d+\.",          # Army Regs: 2-1.  3-12.
    r"^[A-Z]\d+\.",         # AFI: A2.1.
    r"^Chapter\s+\d+",      # Chapter headings
    r"^CHAPTER\s+\d+",
    r"^SECTION\s+[IVXLC]+", # SECTION IV
    r"^[A-Z]{2,}\s+\d+",    # AR 600
]

SECTION_RE = re.compile("|".join(SECTION_PATTERNS), re.MULTILINE)


def estimate_tokens(text: str) -> int:
    return len(text.split())


def split_into_sections(pages: list[dict]) -> list[dict]:
    """
    Joins all pages, then splits at section header boundaries.
    Returns list of {text, section_title, page_start}.
    """
    # Join pages into one string, tracking page boundaries
    full_text = ""
    page_offsets = []
    for p in pages:
        page_offsets.append((len(full_text), p["page"]))
        full_text += p["text"] + "\n\n"

    # Find all section boundaries
    boundaries = [m.start() for m in SECTION_RE.finditer(full_text)]
    boundaries.append(len(full_text))  # sentinel

    if not boundaries[:-1]:
        # No section headers found — fall back to page-level chunks
        return [{"text": p["text"], "section_title": "", "page_start": p["page"]} for p in pages]

    sections = []
    for i in range(len(boundaries) - 1):
        start = boundaries[i]
        end   = boundaries[i + 1]
        chunk_text = full_text[start:end].strip()
        if not chunk_text:
            continue

        # Extract section title (first line)
        first_line = chunk_text.split("\n")[0].strip()

        # Find which page this section starts on
        page_num = pages[0]["page"]
        for offset, pg in page_offsets:
            if offset <= start:
                page_num = pg

        sections.append({
            "text":          chunk_text,
            "section_title": first_line[:120],
            "page_start":    page_num,
        })

    return sections


def chunk_sections(sections: list[dict]) -> list[dict]:
    """
    Enforces CHUNK_MIN and CHUNK_MAX token limits.
    Merges tiny sections into the next. Splits huge sections by sentence.
    """
    chunks = []
    buffer = None

    for sec in sections:
        tokens = estimate_tokens(sec["text"])

        # Too small — merge into buffer
        if tokens < CHUNK_MIN_TOKENS:
            if buffer is None:
                buffer = sec.copy()
            else:
                buffer["text"] += "\n\n" + sec["text"]
            continue

        # Flush buffer first
        if buffer is not None:
            buffer["text"] += "\n\n" + sec["text"]
            sec = buffer
            buffer = None
            tokens = estimate_tokens(sec["text"])

        # Too large — split at sentence boundaries
        if tokens > CHUNK_MAX_TOKENS:
            sentences = re.split(r"(?<=[.!?])\s+", sec["text"])
            current = ""
            for sent in sentences:
                if estimate_tokens(current + sent) > CHUNK_MAX_TOKENS and current:
                    chunks.append({**sec, "text": current.strip()})
                    current = sec["section_title"] + "\n" + sent  # carry header
                else:
                    current += " " + sent
            if current.strip():
                chunks.append({**sec, "text": current.strip()})
        else:
            chunks.append(sec)

    if buffer:
        chunks.append(buffer)

    return chunks

# ---------------------------------------------------------------------------
# Step 4 + 5: Embed and store in ChromaDB
# ---------------------------------------------------------------------------

def build_vectorstore(all_chunks: list[dict], model: SentenceTransformer, collection):
    texts = [c["text"] for c in all_chunks]
    print(f"  [embed] encoding {len(texts)} chunks ...")
    embeddings = model.encode(texts, batch_size=32, show_progress_bar=True, normalize_embeddings=True)

    ids       = [f"chunk_{i}" for i in range(len(all_chunks))]
    metadatas = [{k: v for k, v in c.items() if k != "text"} for c in all_chunks]

    collection.add(
        ids=ids,
        embeddings=embeddings.tolist(),
        documents=texts,
        metadatas=metadatas,
    )
    print(f"  [ok] {len(texts)} chunks stored in ChromaDB")

# ---------------------------------------------------------------------------
# Step 6: Verification
# ---------------------------------------------------------------------------

VERIFY_QUERIES = [
    ("What is the per diem rate policy for TDY travel?",       "travel"),
    ("How many days of leave do soldiers accrue per month?",    "leave"),
    ("Is the GTC mandatory for TDY travel?",                   "travel"),
    ("What is the mileage reimbursement rate for POV travel?",  "travel"),
    ("What happens to leave when a soldier separates?",         "leave"),
]


def verify(collection, model: SentenceTransformer):
    print("\n--- Verification ---")
    for query, expected_domain in VERIFY_QUERIES:
        embedding = model.encode([query], normalize_embeddings=True).tolist()
        results = collection.query(
            query_embeddings=embedding,
            n_results=1,
            where={"domain": expected_domain},
        )
        if results["documents"] and results["documents"][0]:
            doc      = results["documents"][0][0]
            meta     = results["metadatas"][0][0]
            distance = results["distances"][0][0]
            print(f"\nQ: {query}")
            print(f"   source:  {meta.get('source_file')} | section: {meta.get('section_title', '')[:60]}")
            print(f"   score:   {1 - distance:.3f}")
            print(f"   snippet: {doc[:120].replace(chr(10), ' ')} ...")
        else:
            print(f"\nQ: {query}")
            print("   [no result returned]")

# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    run_verify = "--verify" in sys.argv

    VECTORSTORE.mkdir(exist_ok=True)

    print("\n=== Step 1: Downloading PDFs ===")
    downloaded = []
    for src in SOURCES:
        ok = download_pdf(src["url"], src["local_path"])
        if ok:
            downloaded.append(src)

    if not downloaded:
        print("\n[!] No PDFs found locally. Download them manually:")
        for src in SOURCES:
            print(f"    {src['source_url']}")
            print(f"    → save to: {src['local_path']}\n")
        print("Then re-run: python3 ingest.py")
        sys.exit(1)

    print("\n=== Step 2-3: Parsing and Chunking ===")
    all_chunks = []
    for src in downloaded:
        print(f"\n  Processing {src['source_file']} ...")
        pages    = parse_pdf(src["local_path"])
        sections = split_into_sections(pages)
        chunks   = chunk_sections(sections)

        for chunk in chunks:
            chunk["source_file"] = src["source_file"]
            chunk["source_url"]  = src["url"]
            chunk["domain"]      = src["domain"]
            chunk["branch"]      = src["branch"]
            chunk["doc_type"]    = src["doc_type"]

        print(f"  [ok] {len(pages)} pages → {len(sections)} sections → {len(chunks)} chunks")
        all_chunks.extend(chunks)

    print(f"\nTotal chunks across all documents: {len(all_chunks)}")

    print("\n=== Step 4: Loading Embedding Model ===")
    print(f"  model: {EMBED_MODEL} (downloads once, then cached locally)")
    model = SentenceTransformer(EMBED_MODEL)

    print("\n=== Step 5: Building ChromaDB Vector Store ===")
    client     = chromadb.PersistentClient(path=str(VECTORSTORE))
    collection = client.get_or_create_collection(
        name=COLLECTION,
        metadata={"hnsw:space": "cosine"},
    )
    build_vectorstore(all_chunks, model, collection)
    print(f"\n  Total chunks in store: {collection.count()}")

    if run_verify:
        verify(collection, model)

    print("\n=== Done ===")
    print(f"Vector store saved to: {VECTORSTORE}/")
    print("Run 'python ingest.py --verify' to test retrieval.")


if __name__ == "__main__":
    main()
