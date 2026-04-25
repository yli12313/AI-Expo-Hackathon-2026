# Duty Line — GenAI.mil Track

**SCSP Hackathon 2026 | Phase 1 | April 25–26, 2026**

An AI-powered military admin assistant that takes natural language requests, navigates Joint Travel Regulations and Army Regulations, pulls live GSA per diem rates, and generates compliant travel authorizations and forms — in seconds instead of hours.

---

## Track

**GenAI.mil** — The US military runs on paperwork. Build the AI assistant that makes the rank-and-file faster, smarter, and less buried in bureaucracy.

---

## The Problem

A junior NCO planning a TDY trip today must:
1. Navigate the Joint Travel Regulations (1,000+ page PDF) for entitlement rules
2. Search GSA per diem rate tables for the destination city
3. Calculate lodging, meals, mileage, and incidentals by hand
4. Fill out DA Form 1610 (TDY travel request) manually
5. Route it through their chain of command for approval

This process takes **2–4 hours per trip** and is error-prone. Mistakes mean delayed reimbursement or out-of-pocket costs for soldiers.

**3 million service members** deal with this bureaucracy daily.

---

## The Solution

A conversational AI assistant — works offline — that handles the full TDY + regulation workflow:

**1. Regulation Navigator (RAG)**
- Ingests Joint Travel Regulations and Army Regulations into a local vector store
- Answers questions like "Do I need a GTC for this trip?" with paragraph-level citations
- Handles cross-references between regulations

**2. TDY Cost Calculator**
- Pulls GSA per diem rates (lodging + M&IE by city, cacheable offline)
- Calculates mileage reimbursement for POV travel
- Applies JTR rules: first/last day at 75% M&IE, receipts required over $75, etc.

**3. Form Auto-Filler**
- Takes travel details and populates DA Form 1610 and DA 31 fields
- Outputs a filled PDF ready for signature and routing

### Example Interaction

> **User:** "I need to send SPC Rivera to Fort Moore, Georgia for a 5-day course starting July 10. She's driving her POV from Fort Liberty."
>
> **Duty Line:**
> - GSA per diem for Columbus, GA: $104 lodging / $64 M&IE
> - Mileage: Fort Liberty → Fort Moore, ~370 miles × $0.67 = $247.90 each way
> - Total estimate: Lodging $520 + Meals $320 + Mileage $495.80 = **$1,335.80**
> - Flags: "GTC is mandatory per JTR Ch 1. Receipt required for lodging."
> - Generates travel authorization summary with all supporting citations

---

## Architecture

```
┌──────────────────────────────────────────────────────────┐
│                   UI (Chat Interface)                    │
│             Web app or desktop, works offline            │
└──────────────────────┬───────────────────────────────────┘
                       │ user query
                       ▼
┌──────────────────────────────────────────────────────────┐
│                 ORCHESTRATOR AGENT                       │
│   - Classifies intent                                    │
│   - Routes to correct specialist agent                   │
│   - Manages multi-agent handoffs                         │
│   - Tracks conversation state                            │
└────┬────────────┬────────────┬───────────────┬───────────┘
     │            │            │               │
     ▼            ▼            ▼               ▼
┌─────────┐ ┌─────────┐ ┌──────────┐ ┌───────────────┐
│ Travel  │ │  Leave  │ │   Regs   │ │     Form      │
│  /TDY   │ │   /HR   │ │Navigator │ │    Filler     │
│  Agent  │ │  Agent  │ │  Agent   │ │    Agent      │
└────┬────┘ └────┬────┘ └────┬─────┘ └───────┬───────┘
     │            │            │               │
     └────────────┴────────────┴───────────────┘
                       │ metadata-filtered query
                       ▼
┌──────────────────────────────────────────────────────────┐
│             SHARED VECTOR STORE (semantic chunks)        │
│                                                          │
│  ┌──────────────────┐  ┌──────────────────┐             │
│  │ travel│defense   │  │ leave │army/navy  │             │
│  │ JTR PDFs         │  │ AR 600-8-10      │             │
│  │ GSA rates        │  │ DA forms         │             │
│  └──────────────────┘  └──────────────────┘             │
│  ┌──────────────────┐  ┌──────────────────┐             │
│  │ regs │army/navy  │  │ forms │all branch │             │
│  │ AR/FM/AFI PDFs   │  │ DD/DA templates  │             │
│  └──────────────────┘  └──────────────────┘             │
│                                                          │
│  Each chunk tagged: {source, branch, domain, section}    │
└──────────────────────┬───────────────────────────────────┘
                       │
                       ▼
┌──────────────────────────────────────────────────────────┐
│           OPEN SOURCE LLM (local, offline)               │
│       instruction-tuned, 7B–13B parameter range          │
└──────────────────────┬───────────────────────────────────┘
                       │
          ┌────────────┼──────────────┐
          ▼            ▼              ▼
    ┌──────────┐ ┌──────────┐ ┌─────────────┐
    │ GSA API  │ │ SAM.gov  │ │    Form     │
    │ per diem │ │contracts │ │  Generator  │
    │ (cached) │ │   API    │ │ PDF output  │
    └──────────┘ └──────────┘ └─────────────┘
```

---

## Datasets & APIs

| Source | What It Provides | Access |
|--------|-----------------|--------|
| [Joint Travel Regulations](https://www.travel.dod.mil/Policy-Regulations/Joint-Travel-Regulations/) | DoD travel entitlement rules (per diem, lodging, mileage, transportation) | Public PDF |
| [GSA Per Diem API](https://api.gsa.gov/travel/perdiem/v2/) | Per diem rates by city/zip (lodging + M&IE) | Free, cacheable |
| [Army Publishing Directorate](https://armypubs.army.mil/) | Army Regulations + DA Forms (DA 31, DA 1610, DA 4187) | Public PDFs |
| [AR 600-8-10](https://armypubs.army.mil/) | Leaves and Passes regulation | Public PDF |
| [DTIC Public STINET](https://discover.dtic.mil/) | DoD technical reports and TTPs | Public |
| [eCFR Bulk Data](https://www.ecfr.gov/current/title-32) | CFR Title 32 National Defense as XML/JSON | Public |

---

## Tech Stack

- **LLM:** Open source instruction-tuned model via OpenRouter (dev) → local inference (demo/offline)
- **Vector Store:** ChromaDB — local, no server needed, offline-capable
- **Embeddings:** Open source embedding model (runs locally)
- **Chunking:** Semantic — split at regulation section/paragraph boundaries
- **UI:** Streamlit
- **Form output:** fillpdf / pypdf for DA form population
- **Language:** Python 3.10+

---

## Project Structure

```
AI-Expo-Hackathon-2026/
├── README.md
├── requirements.txt
├── app.py                    # Streamlit frontend + chat loop
├── ingest.py                 # PDF → chunks → embeddings → vector store
├── agents/
│   ├── __init__.py
│   ├── orchestrator.py       # Intent classification + routing
│   ├── rag_agent.py          # Regulation lookup with citations
│   ├── travel_calc.py        # TDY cost calculator + GSA API
│   └── form_filler.py        # DA form field auto-population
├── data/
│   ├── jtr/                  # Joint Travel Regulations PDFs
│   ├── army_regs/            # AR 600-8-10 and other ARs
│   └── forms/                # Fillable DA form PDFs/templates
├── vectorstore/              # ChromaDB local persistence
└── tests/
    └── eval_questions.md     # 15 ground-truth Q&A for retrieval testing
```

---

## Branch Strategy

| Branch | Purpose |
|--------|---------|
| `main` | UI, app entry point, final integration |
| `backend` | RAG pipeline, agent orchestration, LLM integration, GSA API |
| `data` | PDF collection, parsing, vector store build, form templates |

**Workflow:** Each branch develops independently → PRs into `main` for integration.

---

## Development Workflow — Task Levels

Pick up any task from the level that's unblocked. Complete Level 0 and Level 1 before moving to Level 2.

### Level 0 — Data Collection (no coding, start immediately)
- [ ] Download JTR PDF from `travel.dod.mil` → place in `data/jtr/`
- [ ] Download AR 600-8-10 PDF from `armypubs.army.mil` → place in `data/army_regs/`
- [ ] Download fillable DA 1610 and DA 31 PDFs → place in `data/forms/`
- [ ] Write `tests/eval_questions.md` — 15 real questions with correct answers pulled from the actual regulation text (used to validate retrieval accuracy)
- [ ] Map key JTR sections: which chapter covers per diem? mileage? first/last day rules? (add to `tests/eval_questions.md`)

### Level 1 — Foundation (blocks everything else)
- [ ] `ingest.py`: load PDFs from `data/`, parse text preserving section headers, split at semantic section boundaries (not fixed token count), attach metadata `{source, domain, section, branch}`, embed and store in ChromaDB under `vectorstore/`
- [ ] Verify: run a test query against the vector store, confirm the correct JTR paragraph is returned
- [ ] `requirements.txt`: pin all dependencies

### Level 2 — Agent Logic (parallel, after Level 1)
- [ ] `agents/rag_agent.py`: takes a user query + optional domain filter → queries vector store → returns answer + exact regulation citation (chapter + paragraph)
- [ ] `agents/travel_calc.py`: calls GSA per diem API for a given city/state/date → returns structured dict `{lodging, mie, total_daily}` → calculates full trip cost applying JTR rules (75% first/last day, mileage at current rate)
- [ ] `agents/form_filler.py`: takes structured travel dict → maps fields to DA 1610 → outputs filled PDF
- [ ] `agents/orchestrator.py`: classifies user query intent (regulation question / cost calc / form fill) → routes to correct agent → assembles final response

### Level 3 — Integration
- [ ] `app.py`: Streamlit chat interface — user types query → orchestrator called → response + citations shown → PDF download button if form was generated
- [ ] Wire all agents through orchestrator end-to-end
- [ ] Run the SPC Rivera example from end to end, verify numbers match manual calculation
- [ ] Cache GSA API response locally so it works offline

### Level 4 — Demo Polish
- [ ] Time each demo segment (target: TDY flow ≤ 2 min, Reg Q&A ≤ 1.5 min, Leave ≤ 1.5 min)
- [ ] Add source citation display in UI (show which JTR paragraph answered the question)
- [ ] Error handling: what happens if GSA API is unavailable → use cached rates
- [ ] Clean up any raw LLM output that looks unformatted

---

## Demo Script (5 minutes)

**Segment 1 — TDY Travel Request (2 min)**
> "I need to send SPC Rivera to Fort Moore, Georgia for a 5-day course starting July 10. She's driving her POV from Fort Liberty."
- Shows: per diem lookup → mileage calc → cost breakdown → DA 1610 auto-filled → PDF download

**Segment 2 — Regulation Q&A (1.5 min)**
> "Can I use my POV instead of a rental car, and what receipts do I need?"
- Shows: JTR retrieved → plain-English answer → exact paragraph cited

**Segment 3 — Leave Request (1.5 min)**
> "I need 10 days leave starting June 3, am I eligible and can you fill my DA 31?"
- Shows: AR 600-8-10 check → eligibility confirmed → DA 31 populated

---

## Why This Wins

- **Scope is specific:** One user (junior NCO), one workflow (TDY), one before/after (2-4 hours → seconds)
- **All data is public:** JTR, ARs, GSA API — no auth issues, no scraping
- **Offline-capable:** ChromaDB local + cached GSA rates — works in SCIF or field environment
- **All three branches of service:** JTR and form logic apply to Army, Navy, Air Force equally
- **3 million users:** Every service member who travels TDY hits this exact pain

---

## How to Run

```bash
git clone https://github.com/yli12313/AI-Expo-Hackathon-2026.git
cd AI-Expo-Hackathon-2026

python -m venv venv
source venv/bin/activate

pip install -r requirements.txt

# Set API keys
export GSA_API_KEY="your-key-here"
export OPENROUTER_API_KEY="your-key-here"

# Ingest regulations (first run only)
python ingest.py

# Launch
streamlit run app.py
```
