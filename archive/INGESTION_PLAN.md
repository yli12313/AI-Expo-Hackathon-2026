# Ingestion Pipeline — Build Plan

This is the step-by-step plan for building `ingest.py`.
Follow in order. Each step has a verification check before moving to the next.

---

## What the Pipeline Does

```
PDFs (local files)
    │
    ▼
[Step 1] Download PDFs from DATA_SOURCES.md URLs → save to data/
    │
    ▼
[Step 2] Parse each PDF → extract raw text preserving structure
    │
    ▼
[Step 3] Semantic chunking → split at section/paragraph boundaries
          attach metadata: {source, domain, section, branch, doc_type}
    │
    ▼
[Step 4] Embed each chunk → open source embedding model (local)
    │
    ▼
[Step 5] Store in ChromaDB → vectorstore/ (persisted to disk)
    │
    ▼
[Step 6] Verify → run 5 test queries, confirm correct chunks returned
```

---

## Phase Priority (build in this order)

### Phase 1 — MVP (do first, everything else depends on this working)
| File | Source | Saved to |
|------|--------|----------|
| JTR PDF | https://media.defense.gov/2022/jan/04/2002917147/-1/-1/0/jtr.pdf | `data/jtr/jtr.pdf` |
| AR 600-8-10 | https://armypubs.army.mil/epubs/DR_pubs/DR_a/ARN32388-AR_600-8-10-001-WEB-1.pdf | `data/army_regs/ar_600_8_10.pdf` |
| DD 1610 form | https://www.esd.whs.mil/Portals/54/Documents/DD/forms/dd/dd1610.pdf | `data/forms/dd1610.pdf` |
| DA 31 form | https://armypubs.army.mil/pub/eforms/DR_a/ARN39556-DA_FORM_31-000-EFILE-1.pdf | `data/forms/da31.pdf` |

### Phase 2 — Add after Phase 1 is working
- MILPERSMAN 1050 (Navy leave)
- AFI 36-3003 (Air Force leave)
- DA 4187

### Phase 3 — Evaluations
- AR 623-3, DA PAM 623-3, DA 4856, branch eval regs

---

## Metadata Schema (attach to every chunk)

```python
{
    "source_file": "jtr.pdf",           # filename
    "source_url":  "https://...",       # origin URL
    "domain":      "travel",            # travel | leave | regs | eval | forms
    "branch":      "defense_wide",      # defense_wide | army | navy | airforce | marines
    "doc_type":    "regulation",        # regulation | form | guide | policy
    "section":     "Chapter 2, Para 020101",  # extracted from text
    "section_title": "General Travel Entitlements",
    "page_start":  12,                  # PDF page number
}
```

---

## Chunking Strategy for Military Docs

Military regulations have predictable structure. Split at these boundaries:

**JTR pattern:**  `020101.`, `020102.` — 6-digit section codes  
**Army Regs pattern:** `2-1.`, `2-2.` — chapter-paragraph format  
**AFIs pattern:** `2.1.`, `2.2.` — decimal section numbers  

Rules:
- Min chunk size: 150 tokens (avoid tiny fragments)
- Max chunk size: 600 tokens (avoid losing context boundary)
- If a section is > 600 tokens: split at sentence boundary, carry section header into next chunk
- Always include the section header text at the start of each chunk

---

## Step-by-Step Checklist

### Step 1 — Environment Setup
- [ ] `requirements.txt` created with pinned versions
- [ ] `pip install -r requirements.txt` runs clean
- [ ] Directories exist: `data/jtr/`, `data/army_regs/`, `data/forms/`, `vectorstore/`

### Step 2 — PDF Download
- [ ] `ingest.py` downloads JTR PDF to `data/jtr/jtr.pdf`
- [ ] Verify: file exists and is > 1MB (not a redirect/error page)
- [ ] Repeat for AR 600-8-10

### Step 3 — PDF Parsing
- [ ] Raw text extracted from JTR, section headers visible in output
- [ ] Spot check: search extracted text for "020101" — should appear
- [ ] Spot check: search AR 600-8-10 text for "leave accrual" — should appear

### Step 4 — Chunking
- [ ] JTR splits into individual section chunks (not one blob)
- [ ] Each chunk has metadata dict attached
- [ ] Print first 3 chunks to verify structure looks correct
- [ ] Chunk count for JTR should be in the range 300–1500 (sanity check)

### Step 5 — Embedding + Storage
- [ ] Embedding model loads without internet (sentence-transformers cached locally)
- [ ] ChromaDB collection created at `vectorstore/`
- [ ] All chunks inserted — no errors
- [ ] `collection.count()` returns expected number

### Step 6 — Verification
Run these 5 queries and confirm the returned chunk is correct:

| Query | Expected source | Expected section |
|-------|----------------|-----------------|
| "What is the per diem rate policy?" | JTR | Chapter 2 |
| "How many days of leave do soldiers accrue per month?" | AR 600-8-10 | Para 2-1 or 3-1 |
| "Is GTC mandatory for TDY travel?" | JTR | Chapter 1 |
| "What is the mileage reimbursement rate for POV?" | JTR | Chapter 2/3 |
| "What happens to leave when a soldier separates?" | AR 600-8-10 | Separation section |

---

## Files Created by This Plan

```
ingest.py           ← main pipeline script
requirements.txt    ← all dependencies pinned
data/
  jtr/jtr.pdf
  army_regs/ar_600_8_10.pdf
  forms/dd1610.pdf
  forms/da31.pdf
vectorstore/        ← ChromaDB persisted here after ingest runs
```

---

## Dependencies (go into requirements.txt)

```
pdfplumber==0.11.4       # PDF text extraction, handles tables
sentence-transformers==3.4.1   # local embedding model
chromadb==0.6.3          # local vector store
requests==2.32.3         # PDF download + GSA API
python-dotenv==1.0.1     # load .env for API keys
openai==1.75.0           # OpenRouter uses OpenAI-compatible API
pypdf==5.4.0             # fallback PDF parser for forms
streamlit==1.44.1        # UI (used in app.py)
```

---

## Known Risks

| Risk | Mitigation |
|------|-----------|
| JTR PDF URL changes | Keep backup URL, re-check manually if download fails |
| Army Pubs PDF has copy protection | Use `pdfplumber` first, fall back to `pypdf` |
| Embedding model first download needs internet | Run `ingest.py` once online, then works offline |
| ChromaDB version conflicts | Pin version in requirements.txt |
