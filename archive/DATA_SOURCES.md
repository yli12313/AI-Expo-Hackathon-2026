# Duty Line — Data Sources

Organized by agent. Each agent has its own set of APIs and PDFs to ingest.

---

## 1. Travel Agent

### APIs

| Source | Type | URL | Auth |
|--------|------|-----|------|
| GSA Per Diem API | API | https://open.gsa.gov/api/perdiem/ | Free key |
| SAM.gov Opportunities API | API | https://open.gsa.gov/api/get-opportunities-public-api/ | Free key |

**GSA Per Diem API Details:**
- **Base URL:** `https://api.gsa.gov/travel/perdiem/v2/`
- **Rate Limit:** 1,000 requests/hour
- **Key Endpoints:**
  - `/rates/city/{city}/state/{ST}/year/{year}` — rates by city/state
  - `/rates/zip/{zip}/year/{year}` — rates by ZIP
  - `/rates/conus/lodging/{year}` — all CONUS lodging rates
  - `/rates/conus/mie/{year}` — M&IE breakdowns
- **Pass key as:** `x-api-key` header or `api_key` query param
- **Coverage:** FY2024–FY2026

### PDFs

| Document | URL |
|----------|-----|
| Joint Travel Regulations (JTR) | https://media.defense.gov/2022/jan/04/2002917147/-1/-1/0/jtr.pdf |
| DTS Policy Docs | https://www.travel.dod.mil/Policy-Regulations/Joint-Travel-Regulations/ |

### Forms

| Form | Description | URL |
|------|-------------|-----|
| DD 1610 | TDY Travel Request | https://www.esd.whs.mil/Portals/54/Documents/DD/forms/dd/dd1610.pdf |

---

## 2. Leave / HR Agent

### PDFs

| Document | Branch | URL |
|----------|--------|-----|
| AR 600-8-10 (Army leave policy) | Army | https://armypubs.army.mil/epubs/DR_pubs/DR_a/ARN32388-AR_600-8-10-001-WEB-1.pdf |
| MILPERSMAN 1050 (Navy leave) | Navy | https://www.mynavyhr.navy.mil/Portals/55/Reference/MILPERSMAN/1000/1050Leave.pdf |
| AFI 36-3003 (Air Force leave) | Air Force | https://static.e-publishing.af.mil/production/1/af_a1/publication/afi36-3003/afi36-3003.pdf |
| JTR Chapter 2 (leave + travel overlap) | DoD-wide | https://media.defense.gov/2022/jan/04/2002917147/-1/-1/0/jtr.pdf |
| DoD FMR Vol 7A (pay during leave) | DoD-wide | https://comptroller.defense.gov/Portals/45/documents/fmr/Volume_07a.pdf |
| OPM Leave Guide (civilians) | Civilian | https://www.opm.gov/policy-data-oversight/pay-leave/leave-administration/fact-sheets/ |

### Forms

| Form | Branch | URL |
|------|--------|-----|
| DA 31 (Leave Request) | Army | https://armypubs.army.mil/pub/eforms/DR_a/ARN39556-DA_FORM_31-000-EFILE-1.pdf |
| DA 4187 (Personnel Action) | Army | https://armypubs.army.mil/pub/eforms/DR_a/ARN37028-DA_FORM_4187-000-EFILE-1.pdf |

---

## 3. Regulations Navigator Agent

### APIs

| Source | URL | Auth |
|--------|-----|------|
| eCFR API (Title 32 + 48) | https://www.ecfr.gov/developers/documentation/api/v1 | None |
| Federal Register API | https://www.federalregister.gov/developers/documentation/api/v1 | None |
| USAspending.gov API | https://api.usaspending.gov/api/v2/ | None |

**eCFR API Details:**
- Structure: `https://www.ecfr.gov/api/versioner/v1/structure/current/title-32.json`
- Full text: `https://www.ecfr.gov/api/renderer/v1/content/enhanced/current/title-32`
- Search: `https://www.ecfr.gov/api/search/v1/results?query=national+defense`

**Federal Register API Details:**
- DoD filter: `?conditions[agencies][]=defense-department`
- Other slugs: `army-department`, `navy-department`, `air-force-department`

### PDFs — By Branch

| Document | Branch | URL |
|----------|--------|-----|
| Army Regulations (index) | Army | https://armypubs.army.mil/ProductMaps/PubForm/AR.aspx |
| AFIs / AFMANs | Air Force | https://www.e-publishing.af.mil |
| OPNAVINSTs | Navy | https://www.secnav.navy.mil/doni/opnav.aspx |
| Marine Corps Orders (MCPEL) | Marines | https://www.marines.mil/News/Publications/MCPEL/ |
| DoDI / DoDD series | DoD-wide | https://www.esd.whs.mil/DD/DoD-Issuances/ |
| DFARS | DoD-wide | https://www.acquisition.gov/dfars |

---

## 4. Evaluation Assistant Agent

### PDFs — By Branch

| Document | Branch | URL |
|----------|--------|-----|
| AR 623-3 (Army eval regs) | Army | https://armypubs.army.mil/epubs/DR_pubs/DR_a/ARN32388-AR_623-3-000-WEB-1.pdf |
| DA PAM 623-3 (Army eval guide) | Army | https://armypubs.army.mil/epubs/DR_pubs/DR_a/ARN32388-DA_PAM_623-3-000-WEB-1.pdf |
| BUPERSINST 1610.10 (Navy evals) | Navy | https://www.mynavyhr.navy.mil/Portals/55/Reference/instructions/BUPERS/BUPERSINST_1610.10F.pdf |
| AFI 36-2406 (Air Force evals) | Air Force | https://static.e-publishing.af.mil/production/1/af_a1/publication/afi36-2406/afi36-2406.pdf |
| MCO 1610.7 (Marine Corps evals) | Marines | https://www.marines.mil/portals/1/Publications/MCO%201610.7.pdf |

### Forms

| Form | Branch | URL |
|------|--------|-----|
| DA 4856 (Counseling Form) | Army | https://armypubs.army.mil/pub/eforms/DR_a/ARN39139-DA_FORM_4856-001-EFILE-2.pdf |
| DA 2062 (Hand Receipt) | Army | https://armypubs.army.mil/pub/eforms/DR_a/ARN39613-DA_FORM_2062-000-EFILE-1.pdf |

---

## Index Pages (for discovering more forms/regs)

| Resource | URL |
|----------|-----|
| All DA Forms | https://armypubs.army.mil/ProductMaps/PubForm/DAForm.aspx |
| All Army Regulations | https://armypubs.army.mil/ProductMaps/PubForm/AR.aspx |
| DA Forms 1–999 | https://armypubs.army.mil/ProductMaps/PubForm/DAForm1_1000.aspx |

---

## Priority for Hackathon Build

### Phase 1 — TDY Planner (MVP)
1. **GSA Per Diem API** — live per diem rates
2. **JTR PDF** — download, parse, chunk into vector store (focus Ch 1–5)
3. **DD 1610** — fillable form template for output

### Phase 2 — Leave + Regulation Navigator
4. **AR 600-8-10** — parse into vector store
5. **DA 31** — fillable form template
6. **DA 4187** — fillable form template
7. **Branch-specific leave regs** (MILPERSMAN 1050, AFI 36-3003)

### Phase 3 — Evaluations + Expand
8. **AR 623-3 + DA PAM 623-3** — eval regs
9. **DA 4856** — counseling form auto-fill
10. **eCFR / Federal Register** — broader regulation lookups
11. **Cross-branch eval regs** (BUPERSINST 1610.10, AFI 36-2406, MCO 1610.7)

