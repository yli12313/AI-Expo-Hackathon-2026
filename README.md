# Duty Line

**SCSP AI Expo Hackathon 2026 — GenAI.mil Track**
*April 25–26, 2026*

An AI-powered military admin assistant that takes natural language requests, navigates Joint Travel Regulations and service branch regulations, calculates TDY costs to the penny, and generates compliant travel authorizations and leave forms — in seconds instead of hours.

---

## The Problem

A junior NCO planning a TDY trip today must:
1. Navigate the Joint Travel Regulations (1,000+ page PDF) for entitlement rules
2. Look up GSA per diem rates for the destination
3. Calculate lodging, meals, and mileage by hand using JTR rules
4. Fill DA Form 1610 or DD Form 1610 manually
5. Route it through the chain of command for signatures

**This takes 2–4 hours per trip and is error-prone.** Mistakes mean delayed reimbursement or out-of-pocket costs for soldiers. With 2.1M active duty and 800K reserve service members, S1 shops are perpetually buried.

---

## The Solution

A chat assistant that handles the full workflow end-to-end:

> **"I need to send SPC Rivera to Fort Moore, Georgia for 5 days starting July 10. She's driving her POV from Fort Liberty."**
>
> Duty Line calls three tools in sequence:
> - Looks up GSA per diem: Columbus GA — $104 lodging / $64 M&IE
> - Calculates: $416 lodging + $288 meals (75% first/last day) + $518 mileage (370 mi × $0.70 × 2) = **$1,222 total**
> - Generates and downloads a filled DD Form 1610 PDF, ready for signature

**60 seconds. Zero manual math. Zero PDF hunting.**

---

## Architecture

```
User (chat)
     │
     ▼
React Frontend (Vite, port 5173)
     │  POST /api/chat
     ▼
FastAPI Backend (port 8000)
     │
     ▼
ReAct Agent (agents/react_agent.py)
  ├── Thought → Action → Observation loop (max 5 iterations)
  ├── Tool 1: search_regulations  ← ChromaDB semantic search over 2,063 reg chunks
  ├── Tool 2: get_per_diem        ← GSA FY2026 rates, 37 installations cached
  ├── Tool 3: calculate_travel_cost ← JTR-compliant math (mileage, M&IE, lodging)
  └── Tool 4: fill_form           ← reportlab PDF generation; AcroForm for DD 1610
```

**Why ReAct, not simple RAG:** Soldiers come to complete tasks (fill a form, plan a trip), not just ask questions. ReAct lets the agent chain tool calls to produce an artifact — a cost breakdown, a signed form — not just an answer.

**Zero external API calls at runtime.** Regulation lookups hit local ChromaDB. Per diem rates are pre-cached from GSA FY2026 data. PDF generation runs locally via reportlab. The only external dependency is the LLM — which can itself run locally via Ollama, making the entire system air-gap capable.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18 + Vite + TypeScript + Tailwind CSS |
| Backend | FastAPI + Uvicorn (Python 3.10+) |
| Agent | ReAct loop — single model, 4 tools |
| LLM | Model-agnostic via OpenAI-compatible interface (see below) |
| Vector store | ChromaDB (local, persistent, 2,063 chunks) |
| Embeddings | `BAAI/bge-small-en-v1.5` (sentence-transformers, runs locally) |
| Chunking | Semantic — splits at JTR section boundaries (`020101.` format) |
| PDF output | reportlab (all forms) + PyPDF AcroForm fill (DD 1610) |
| Per diem data | GSA FY2026 rates, pre-cached in `data/gsa_cache.json` |

### Model Flexibility — One `.env` Change

The LLM layer is model-agnostic. The same codebase runs against any OpenAI-compatible endpoint with no code changes — critical for real military deployment scenarios:

| Mode | Use Case | Config |
|------|----------|--------|
| `qwen2.5:7b` via Ollama | Air-gapped / SCIF environments, fully offline | Default |
| Claude (Anthropic) | Cloud-connected environments, higher answer quality | `LLM_BASE_URL=https://api.anthropic.com/v1` |
| GPT-4o (OpenAI) | Cloud-connected, alternative provider | `LLM_BASE_URL=https://api.openai.com/v1` |
| Any OpenRouter model | Flexible cloud routing | `LLM_BASE_URL=https://openrouter.ai/api/v1` |

This matters operationally: a unit in a SCIF runs it entirely local; the same system in a garrison S1 shop can run against a more capable cloud model.

---

## Regulation Coverage

| Document | Branch | Domain |
|----------|--------|--------|
| Joint Travel Regulations (JTR) | DoD (all branches) | Travel/TDY |
| AR 600-8-10 | Army | Leave |
| AR 623-3 | Army | Evaluations |
| AFI 36-3003 | Air Force | Leave |
| AFI 36-2406 | Air Force | Evaluations |
| MILPERSMAN 1050 | Navy | Leave |
| BUPERSINST 1610.10F | Navy | Evaluations |
| MCO 1610.7 | Marine Corps | Evaluations |
| DoD FMR Vol 7A | DoD (all branches) | Pay |

---

## Project Structure

```
AI-Expo-Hackathon-2026/
├── app.py                      # FastAPI backend — all routes
├── ingest.py                   # One-time PDF → ChromaDB ingestion pipeline
├── requirements.txt
├── agents/
│   ├── react_agent.py          # ReAct agent — chat loop, tool orchestration
│   └── tools.py                # 4 tools: search_regulations, get_per_diem,
│                               #          calculate_travel_cost, fill_form
├── data/
│   ├── gsa_cache.json          # GSA FY2026 per diem rates, 37 installations
│   ├── forms/                  # Form PDF templates (DD 1610, DA 31, DA 4856, DA 4187, DA 2062)
│   ├── jtr/                    # Joint Travel Regulations PDF
│   ├── army_regs/              # AR 600-8-10, AR 623-3
│   ├── navy_regs/              # MILPERSMAN 1050, BUPERSINST 1610.10F
│   ├── af_regs/                # AFI 36-3003, AFI 36-2406
│   ├── marine_regs/            # MCO 1610.7
│   └── dod_regs/               # DoD FMR Vol 7A
├── frontend/
│   ├── src/App.tsx             # Full React UI — chat, profile, form download
│   ├── src/index.css           # Custom military color scheme
│   └── vite.config.ts          # Proxies /api/* → localhost:8000
├── vectorstore/                # ChromaDB persistent store (~50MB, gitignored)
├── output/                     # Generated PDFs (gitignored)
├── scripts/
│   └── fetch_gsa_cache.py      # Utility: refresh GSA per diem cache
├── archive/                    # Pre-refactor prototypes (reference only)
├── ARCHITECTURE.md             # Design decisions and trade-off notes
└── FRONTEND_API_SPEC.md        # Full API contract — request/response shapes
```

---

## Demo Scenarios

**TDY cost calculation**
```
"I need to send SPC Rivera to Fort Moore, Georgia for 5 days starting July 10.
She's driving her POV from Fort Liberty."
```
→ `calculate_travel_cost` → $1,222 breakdown (lodging $416 + meals $288 + mileage $518)

**Leave form auto-fill**
```
"I need 10 days annual leave starting June 3 to visit family in Texas."
```
→ `fill_form DA_31` → 8 fields auto-filled from soldier profile → PDF download

**Regulation lookup**
```
"Is the GTC mandatory for TDY travel?"
```
→ `search_regulations [travel]` → cited answer from JTR 010204

**Travel authorization form**
```
"Fill a DD 1610 for the Fort Moore trip."
```
→ `fill_form DD_1610` → AcroForm PDF with all 14 fields populated

---

## How to Run

### Prerequisites
- Python 3.10+
- [Ollama](https://ollama.com) installed and running with `qwen2.5:7b` pulled
- Node.js 18+

```bash
# 1. Clone and set up Python environment
git clone https://github.com/yli12313/AI-Expo-Hackathon-2026.git
cd AI-Expo-Hackathon-2026
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt

# 2. Pull the LLM (first time only)
ollama pull qwen2.5:7b

# 3. Obtain regulation PDFs and place them in the correct directories
#    PDFs are sourced from official public sources:
#      JTR       → data/jtr/           (media.defense.gov)
#      Army regs → data/army_regs/     (armypubs.army.mil)
#      Navy regs → data/navy_regs/     (mynavyhr.navy.mil)
#      AF regs   → data/af_regs/       (e-publishing.af.mil)
#      Marine    → data/marine_regs/   (marines.mil)
#      DoD FMR   → data/dod_regs/      (comptroller.defense.gov)

# 4. Build the vector store (first time only, ~5–10 min)
#    Chunks PDFs semantically, embeds with a local model, stores in ChromaDB.
python3 ingest.py

# 5. Start the backend (Terminal 1)
python3 -m uvicorn app:app --reload --port 8000

# 6. Start the frontend (Terminal 2)
cd frontend
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173).

### Verify backend is running
```bash
curl http://localhost:8000/api/health
```

---

## Switching to Claude API

Zero code changes — one `.env` update:

```env
# Claude direct
LLM_BASE_URL=https://api.anthropic.com/v1
LLM_MODEL=claude-sonnet-4-6
LLM_API_KEY=sk-ant-...

# Or via OpenRouter
LLM_BASE_URL=https://openrouter.ai/api/v1
LLM_MODEL=anthropic/claude-sonnet-4-6
LLM_API_KEY=sk-or-...
```

The agent uses the OpenAI-compatible client interface — identical across Ollama, Claude, and OpenRouter.

---

## Key JTR Constants (FY2026)

| Rule | Value |
|------|-------|
| POV mileage rate | $0.70/mile |
| First/last day M&IE | 75% of daily rate |
| Lodging nights | travel days − 1 |
| Standard CONUS lodging fallback | $110/night |
| Standard CONUS M&IE fallback | $68/day |

---

## Team

Built at SCSP AI Expo Hackathon 2026, GenAI.mil track, April 25–26, 2026.
