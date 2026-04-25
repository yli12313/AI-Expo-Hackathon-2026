# Duty Line — GenAI.mil Track

**SCSP Hackathon 2026 | Phase 1 | April 25–26, 2026**

An AI-powered TDY (Temporary Duty) travel planner that takes a natural language request, looks up Joint Travel Regulations, pulls live GSA per diem rates, and generates a compliant travel authorization with cost estimates — in seconds instead of hours.

---

## Team

| Name | Role |
|------|------|
| TBD | TBD |
| TBD | TBD |
| TBD | TBD |

## Track

**GenAI.mil** — The US military runs on paperwork. Build the AI assistant that makes the rank-and-file faster, smarter, and less buried in bureaucracy.

---

## What We Built

### The Problem

A junior NCO planning a TDY trip today must:
1. Look up the Joint Travel Regulations (1,000+ page PDF) for entitlement rules
2. Search GSA per diem rate tables for the destination city
3. Calculate lodging, meals, mileage, and incidentals by hand
4. Fill out DA Form 1610 (TDY travel request) manually
5. Route it through their chain of command for approval

This process takes **2–4 hours per trip** and is error-prone. Mistakes mean delayed reimbursement or out-of-pocket costs for soldiers.

### The Solution

A conversational AI assistant that handles the entire TDY planning workflow:

**1. Regulation Navigator (RAG)**
- Ingests the Joint Travel Regulations and Army Regulations into a vector store
- Answers questions like "Do I need a GTC for this trip?" with paragraph-level citations
- Handles cross-references between regulations

**2. TDY Cost Calculator**
- Pulls live GSA per diem rates via API (lodging + M&IE by city)
- Calculates mileage reimbursement for POV travel
- Applies JTR rules: first/last day at 75% M&IE, receipts required over $75, etc.
- Generates a complete cost estimate breakdown

**3. Form Auto-Filler**
- Takes the travel details and populates DA Form 1610 fields
- Outputs a filled PDF ready for signature and routing

### Example Interaction

> **User:** "I need to send SPC Rivera to Fort Moore, Georgia for a 5-day course starting July 10. She's driving her POV from Fort Liberty."
>
> **Agent:**
> - Pulls GSA per diem for Columbus, GA: $104 lodging / $64 M&IE
> - Calculates mileage: Fort Liberty → Fort Moore, ~370 miles × $0.67 = $247.90 each way
> - Total estimate: Lodging $520 + Meals $320 + Mileage $495.80 = **$1,335.80**
> - Flags: "GTC is mandatory per JTR Ch 1. Receipt required for lodging."
> - Generates travel authorization summary with all supporting citations

---

## Datasets & APIs Used

| Source | What It Provides | Access |
|--------|-----------------|--------|
| [Joint Travel Regulations](https://www.travel.dod.mil/Policy-Regulations/Joint-Travel-Regulations/) | DoD travel entitlement rules (per diem, lodging, mileage, transportation) | Public PDF |
| [GSA Per Diem API](https://api.gsa.gov/travel/perdiem/v2/) | Live per diem rates by city/zip (lodging + M&IE) | Free API key |
| [Army Publishing Directorate](https://armypubs.army.mil/) | Army Regulations, DA Forms (DA 31, DA 1610, DA 4187) | Public PDFs |
| [AR 600-8-10](https://armypubs.army.mil/) | Leaves and Passes regulation | Public PDF |

---

## Architecture

```
┌─────────────────────────────────────────────┐
│            STREAMLIT CHAT UI                 │
│     Natural language input + PDF preview     │
└──────────────────┬──────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────┐
│           ORCHESTRATOR AGENT                 │
│    Intent classification → route to tool     │
└──────┬──────────┬──────────┬────────────────┘
       │          │          │
       ▼          ▼          ▼
┌──────────┐ ┌──────────┐ ┌──────────┐
│REGULATION│ │  TRAVEL  │ │   FORM   │
│   RAG    │ │  COST    │ │  FILLER  │
│          │ │  CALC    │ │          │
└──────────┘ └──────────┘ └──────────┘
       │          │          │
       ▼          ▼          ▼
  ChromaDB     GSA API    PDF Templates
  (JTR, ARs)  Per Diem    (DA 1610,
               Rates       DA 31)
```

## Tech Stack

| Component | Technology |
|-----------|-----------|
| LLM | Claude (via Anthropic API) |
| RAG / Vector Store | ChromaDB + sentence-transformers |
| PDF Parsing | PyMuPDF + pdfplumber |
| PDF Form Fill | pdfrw |
| Per Diem Rates | GSA Open API (api.gsa.gov) |
| Frontend | Streamlit |
| Backend | Python |

---

## How to Run

### Prerequisites

- Python 3.10+

### Setup

```bash
# Clone the repo
git clone https://github.com/yli12313/AI-Expo-Hackathon-2026.git
cd AI-Expo-Hackathon-2026

# Create virtual environment
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Set environment variables
export GSA_API_KEY="your-key-here"

# Ingest regulations into vector store (first run only)
python ingest.py

# Launch the app
streamlit run app.py
```

### Project Structure

```
AI-Expo-Hackathon-2026/
├── README.md
├── requirements.txt
├── app.py                  # Streamlit frontend
├── ingest.py               # PDF → vector store pipeline
├── agents/
│   ├── orchestrator.py     # Intent classification + routing
│   ├── rag_agent.py        # Regulation lookup with citations
│   ├── travel_calc.py      # TDY cost calculator + GSA API
│   └── form_filler.py      # DA form auto-population
├── data/
│   ├── jtr/                # Joint Travel Regulations PDFs
│   ├── army_regs/          # AR 600-8-10, etc.
│   └── forms/              # Fillable DA form PDFs
├── vectorstore/            # ChromaDB persistence
└── templates/
    └── threat_brief.py     # Output formatting
```

---

## Demo Script (5 minutes)

1. **TDY Travel Request** (2 min) — Natural language → per diem lookup → cost breakdown → form output
2. **Regulation Q&A** (1.5 min) — "Can I use my POV instead of a rental car?" → JTR citation with answer
3. **Leave Request** (1.5 min) — "I need 10 days leave starting June 3" → AR 600-8-10 check → DA 31 auto-fill

---

## Why This Matters

- **3 million** service members deal with military bureaucracy daily
- **5–10 hours/week** spent by NCOs on administrative tasks
- **TDY travel errors** lead to delayed reimbursement and out-of-pocket costs
- **The JTR is 1,000+ pages** — no one reads it cover to cover
- This tool works **offline-capable** with local vector store and cached rates — deployable in SCIF or field environments
