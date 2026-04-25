# Duty Line — Data Sources

## APIs (Live JSON endpoints)

### GSA Per Diem API
- **Base URL:** `https://api.gsa.gov/travel/perdiem/v2/`
- **Auth:** Free API key (register at https://open.gsa.gov/api/perdiem/)
- **Format:** JSON
- **Rate Limit:** 1,000 requests/hour
- **Key Endpoints:**
  - `/rates/city/{city}/state/{ST}/year/{year}` — rates by city/state
  - `/rates/zip/{zip}/year/{year}` — rates by ZIP
  - `/rates/conus/lodging/{year}` — all CONUS lodging rates
  - `/rates/conus/mie/{year}` — M&IE breakdowns
- **Pass key as:** `x-api-key` header or `api_key` query param
- **Coverage:** FY2024–FY2026

### eCFR API (Title 32 — National Defense, Title 48 — FAR)
- **Auth:** None
- **Format:** JSON (structure), HTML (full text)
- **Endpoints:**
  - Structure: `https://www.ecfr.gov/api/versioner/v1/structure/current/title-32.json`
  - Full text: `https://www.ecfr.gov/api/renderer/v1/content/enhanced/current/title-32`
  - Search: `https://www.ecfr.gov/api/search/v1/results?query=national+defense`

### Federal Register API
- **Base URL:** `https://www.federalregister.gov/api/v1/`
- **Auth:** None
- **Format:** JSON
- **DoD filter:** `?conditions[agencies][]=defense-department`
- **Other slugs:** `army-department`, `navy-department`, `air-force-department`

### USAspending.gov API
- **Base URL:** `https://api.usaspending.gov/api/v2/`
- **Auth:** None
- **Format:** JSON
- **DoD toptier code:** `097`
- **Note:** POST required for award searches

### SAM.gov Opportunities API
- **Base URL:** `https://api.sam.gov/opportunities/v2/search`
- **Auth:** Free API key (register at https://sam.gov → Profile → Public API Key)
- **Format:** JSON
- **Note:** No DEMO_KEY — must register for a real key

---

## Documents (PDF — download and ingest into RAG)

### Regulations

| Document | URL | Pages | Access |
|----------|-----|-------|--------|
| **Joint Travel Regulations (JTR)** | `https://www.travel.dod.mil/Portals/119/Documents/JTR/JTR.pdf` | ~800+ | Public |
| **AR 600-8-10** (Leaves and Passes) | `https://armypubs.army.mil/epubs/DR_pubs/DR_a/ARN30018-AR_600-8-10-000-WEB-1.pdf` | ~70 | Public |

### Fillable Forms

| Form | Description | URL | Pages | Access |
|------|-------------|-----|-------|--------|
| **DD 1610** | TDY Travel Request | `https://www.esd.whs.mil/Portals/54/Documents/DD/forms/dd/dd1610.pdf` | 2 | Public |
| **DA 31** | Leave Request | `https://armypubs.army.mil/pub/eforms/DR_a/ARN39556-DA_FORM_31-000-EFILE-1.pdf` | 2 | Public |
| **DA 4187** | Personnel Action | `https://armypubs.army.mil/pub/eforms/DR_a/ARN37028-DA_FORM_4187-000-EFILE-1.pdf` | 2 | Public |
| **DA 4856** | Counseling Form | `https://armypubs.army.mil/pub/eforms/DR_a/ARN39139-DA_FORM_4856-001-EFILE-2.pdf` | 2 | Public |
| **DA 2062** | Hand Receipt | `https://armypubs.army.mil/pub/eforms/DR_a/ARN39613-DA_FORM_2062-000-EFILE-1.pdf` | 1 | Public |

### Index Pages (for discovering more forms/regs)

| Resource | URL |
|----------|-----|
| All DA Forms | `https://armypubs.army.mil/ProductMaps/PubForm/DAForm.aspx` |
| All Army Regulations | `https://armypubs.army.mil/ProductMaps/PubForm/AR.aspx` |
| DA Forms 1–999 | `https://armypubs.army.mil/ProductMaps/PubForm/DAForm1_1000.aspx` |

---

## Priority for Hackathon Build

### Phase 1 — TDY Planner (MVP)
1. **GSA Per Diem API** — live per diem rates (the one real API call)
2. **JTR PDF** — download, parse, chunk into vector store (focus Ch 1–5)
3. **DD 1610** — fillable form template for output

### Phase 2 — Leave + Regulation Navigator
4. **AR 600-8-10** — parse into vector store
5. **DA 31** — fillable form template
6. **DA 4187** — fillable form template

### Phase 3 — Expand (if time allows)
7. **eCFR API** — Title 32 for broader regulation lookups
8. **Federal Register API** — recent DoD policy changes
9. **DA 4856** — counseling form auto-fill
10. **USAspending / SAM.gov** — contract intel tool

---

## Not Available (CAC-Required / Internal Only)

These systems have no public API and require military credentials:
- **DTS** (Defense Travel System) — where travel authorizations are actually submitted
- **IPPS-A** (Army personnel/pay system)
- **NSIPS** (Navy personnel system)
- **myPers** (Air Force personnel system)
- **DEERS / milConnect** — personnel database
- **DTMS** — training management
- **MEDPROS** — medical readiness
