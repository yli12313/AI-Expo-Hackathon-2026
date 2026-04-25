# PDF Download Checklist

Government sites block automated downloads. This checklist reflects the current `data/` folder in the `data` branch worktree and is cross-referenced against `DATA_SOURCES.md`.

## Currently Present in `data/`

- [x] **data/jtr/jtr.pdf** — Joint Travel Regulations
- [x] **data/forms/da_31.pdf** — Leave Request
- [x] **data/forms/da_4187.pdf** — Personnel Action
- [x] **data/forms/da_4856.pdf** — Counseling Form
- [x] **data/forms/da_2062.pdf** — Hand Receipt

## Still Missing or Blocked

- [ ] **data/forms/DD_1610.pdf** — [DD 1610 TDY Travel Request](https://www.esd.whs.mil/Portals/54/Documents/DD/forms/dd/dd1610.pdf)
  - Official URL returned `403 Forbidden` during automated fetch.
- [ ] **data/army_regs/AR_600-8-10.pdf** — [AR 600-8-10 Leaves and Passes](https://armypubs.army.mil/epubs/DR_pubs/DR_a/ARN32388-AR_600-8-10-001-WEB-1.pdf)
  - Official URL now serves a removed-page HTML response, not a PDF.
- [ ] **data/navy_regs/MILPERSMAN_1050.pdf** — [MILPERSMAN 1050 Navy Leave](https://www.mynavyhr.navy.mil/Portals/55/Reference/MILPERSMAN/1000/1050Leave.pdf)
  - Official URL returned `403 Forbidden` during automated fetch.
- [ ] **data/af_regs/AFI_36-3003.pdf** — [AFI 36-3003 Air Force Leave](https://static.e-publishing.af.mil/production/1/af_a1/publication/afi36-3003/afi36-3003.pdf)
  - Official URL returned `403 Forbidden` during automated fetch.
- [ ] **data/dod_regs/DoD_FMR_Vol7A.pdf** — [DoD FMR Vol 7A Pay During Leave](https://comptroller.defense.gov/Portals/45/documents/fmr/Volume_07a.pdf)
  - Official URL returned `403 Forbidden` during automated fetch.
- [ ] **data/army_regs/AR_623-3.pdf** — [AR 623-3 Army Eval Regs](https://armypubs.army.mil/epubs/DR_pubs/DR_a/ARN32388-AR_623-3-000-WEB-1.pdf)
  - Official URL now serves a removed-page HTML response, not a PDF.
- [ ] **data/army_regs/DA_PAM_623-3.pdf** — [DA PAM 623-3 Eval Guide](https://armypubs.army.mil/epubs/DR_pubs/DR_a/ARN32388-DA_PAM_623-3-000-WEB-1.pdf)
  - Official URL now serves a removed-page HTML response, not a PDF.
- [ ] **data/navy_regs/BUPERSINST_1610.10F.pdf** — [BUPERSINST 1610.10F Navy Evals](https://www.mynavyhr.navy.mil/Portals/55/Reference/instructions/BUPERS/BUPERSINST_1610.10F.pdf)
  - Official URL returned `403 Forbidden` during automated fetch.
- [ ] **data/af_regs/AFI_36-2406.pdf** — [AFI 36-2406 Air Force Evals](https://static.e-publishing.af.mil/production/1/af_a1/publication/afi36-2406/afi36-2406.pdf)
  - Official URL returned `403 Forbidden` during automated fetch.
- [ ] **data/marine_regs/MCO_1610.7.pdf** — [MCO 1610.7 Marine Corps Evals](https://www.marines.mil/portals/1/Publications/MCO%201610.7.pdf)
  - Official URL returned `403 Forbidden` during automated fetch.

## Priority 1 — TDY Planner (MVP)

- [x] **data/jtr/jtr.pdf** — [Joint Travel Regulations](https://media.defense.gov/2022/jan/04/2002917147/-1/-1/0/jtr.pdf)
  - Alt: https://www.travel.dod.mil/Policy-Regulations/Joint-Travel-Regulations/
- [ ] **data/forms/DD_1610.pdf** — [DD 1610 TDY Travel Request](https://www.esd.whs.mil/Portals/54/Documents/DD/forms/dd/dd1610.pdf)

## Priority 2 — Leave / HR

- [ ] **data/army_regs/AR_600-8-10.pdf** — [AR 600-8-10 Leaves and Passes](https://armypubs.army.mil/epubs/DR_pubs/DR_a/ARN32388-AR_600-8-10-001-WEB-1.pdf)
- [x] **data/forms/da_31.pdf** — Already downloaded (53K)
- [x] **data/forms/da_4187.pdf** — Already downloaded (148K)
- [x] **data/forms/da_4856.pdf** — Already downloaded (476K)
- [ ] **data/navy_regs/MILPERSMAN_1050.pdf** — [MILPERSMAN 1050 Navy Leave](https://www.mynavyhr.navy.mil/Portals/55/Reference/MILPERSMAN/1000/1050Leave.pdf)
- [ ] **data/af_regs/AFI_36-3003.pdf** — [AFI 36-3003 Air Force Leave](https://static.e-publishing.af.mil/production/1/af_a1/publication/afi36-3003/afi36-3003.pdf)
- [ ] **data/dod_regs/DoD_FMR_Vol7A.pdf** — [DoD FMR Vol 7A Pay During Leave](https://comptroller.defense.gov/Portals/45/documents/fmr/Volume_07a.pdf)

## Priority 3 — Evaluations

- [ ] **data/army_regs/AR_623-3.pdf** — [AR 623-3 Army Eval Regs](https://armypubs.army.mil/epubs/DR_pubs/DR_a/ARN32388-AR_623-3-000-WEB-1.pdf)
- [ ] **data/army_regs/DA_PAM_623-3.pdf** — [DA PAM 623-3 Eval Guide](https://armypubs.army.mil/epubs/DR_pubs/DR_a/ARN32388-DA_PAM_623-3-000-WEB-1.pdf)
- [ ] **data/navy_regs/BUPERSINST_1610.10F.pdf** — [BUPERSINST 1610.10F Navy Evals](https://www.mynavyhr.navy.mil/Portals/55/Reference/instructions/BUPERS/BUPERSINST_1610.10F.pdf)
- [ ] **data/af_regs/AFI_36-2406.pdf** — [AFI 36-2406 Air Force Evals](https://static.e-publishing.af.mil/production/1/af_a1/publication/afi36-2406/afi36-2406.pdf)
- [ ] **data/marine_regs/MCO_1610.7.pdf** — [MCO 1610.7 Marine Corps Evals](https://www.marines.mil/portals/1/Publications/MCO%201610.7.pdf)
