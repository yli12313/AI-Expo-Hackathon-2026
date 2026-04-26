# Duty Line — Frontend ↔ Backend API Spec

**For the frontend team.**
Backend runs FastAPI on `http://localhost:8000`.
Frontend dev server proxies `/api/*` → `http://localhost:8000`.

---

## Endpoints

### POST `/api/chat`
Main chat endpoint. Sends a message, gets back a response with tool trace.

**Request:**
```json
{
  "message": "I need TDY to Fort Moore for 5 days starting July 10",
  "tab": "travel",
  "profile": { ... }
}
```
`tab` values: `"travel"` | `"leave"` | `"regulation"` | `"eval"`
`profile` is accepted and ignored — backend uses its own `profile.json`.

**Response:**
```json
{
  "response": "Based on JTR Section 020309, here is the cost breakdown...",
  "tool_calls": [
    { "tool": "search_regulations",    "label": "Searching regulations [travel]: \"per diem\"", "result_summary": "Found: jtr.pdf | Section 020309 (score 0.87)" },
    { "tool": "get_per_diem",          "label": "Getting per diem rates for Columbus, GA",      "result_summary": "Columbus, GA: Lodging $104/night | M&IE $64/day" },
    { "tool": "calculate_travel_cost", "label": "Calculating travel cost: Columbus (5 days, POV)", "result_summary": "Total: $2,155.80" }
  ],
  "form_output": null,
  "error": null
}
```

`form_output` is non-null when a form was filled:
```json
{
  "form_name": "DD_1610",
  "filled_fields": { "from": "Rivera, Maria J.", "rank": "SPC", "destination": "Fort Moore" },
  "missing_fields": ["travel_purpose"],
  "pdf_path": "/api/forms/DD_1610_20260425_195632.pdf",
  "summary": "FORM: DD_1610\nFROM: Rivera, Maria J.\n..."
}
```
`pdf_path` is `null` when only a text summary was produced (no PDF template available).

---

### GET `/api/health`
Check backend + model status.

**Response:**
```json
{
  "status": "ok",
  "ollama": true,
  "vector_store_chunks": 727,
  "gsa_cache_loaded": true,
  "model": "qwen2.5:7b"
}
```

Use this for the status indicators in the sidebar (Ollama Connected, Vector Store Loaded, etc.)

---

### GET `/api/forms/{filename}`
Download a generated form PDF.

**Example:** `GET /api/forms/DD_1610_20260425_195632.pdf`
**Response:** PDF binary (Content-Type: application/pdf)

---

### POST `/api/profile`
Save soldier profile (persisted to local `profile.json`).

**Request:**
```json
{
  "name_last_first": "Rivera, Maria J.",
  "rank": "SPC",
  "grade": "E-4",
  "ssn_last4": "1234",
  "unit": "1-503 INF, 82nd ABN",
  "installation": "Fort Liberty"
}
```
**Response:** `{"status": "saved"}`

---

### GET `/api/profile`
Load current soldier profile.

**Response:** Same shape as POST body, or `{}` if not set.

---

## Streaming (Phase 2 — add after basic flow works)

`POST /api/chat/stream` — same request body, response is `text/event-stream`:
```
data: {"type": "reasoning", "text": "⚙ Searching regulations [travel]..."}
data: {"type": "reasoning", "text": "  → Found: jtr.pdf | Section 010204"}
data: {"type": "token",     "text": "Based on JTR "}
data: {"type": "token",     "text": "Section 020309, "}
data: {"type": "done",      "tools_used": ["search_regulations"], "form_output": null}
```

Frontend: use `EventSource` or `fetch` with `ReadableStream` to render tokens as they arrive.

---

## Integration Status (as of 2026-04-25)

### Backend — DONE ✅
- [x] `POST /api/chat` — ReAct agent, returns structured `tool_calls`
- [x] `GET /api/health` — real Ollama + ChromaDB + GSA status
- [x] `GET /api/forms/{filename}` — serves generated PDFs safely
- [x] `POST /api/profile` / `GET /api/profile` — persists soldier profile
- [x] `DELETE /api/chat/history` — clears conversation
- [x] Response shape matches frontend `ToolTrace` / `FormOutput` types exactly
- [x] Accepts optional `profile` in request (no more 422 errors)
- [x] 2063 regulation chunks in ChromaDB (JTR, AR 600-8-10, AFI 36-3003, MILPERSMAN 1050, AR 623-3, AFI 36-2406, BUPERSINST 1610, DoD FMR Vol 7A, MCO 1610.7)

### Frontend — DONE ✅
- [x] Chat UI sends `POST /api/chat`
- [x] `tool_calls` traces rendered above response
- [x] Status states: thinking / tool_call / done / error
- [x] Example queries
- [x] Sidebar health dots wired to `GET /api/health` on load

### Frontend — STILL NEEDED ❌
- [ ] Profile "Save" button should `POST /api/profile` (currently only updates local state)
- [ ] Profile load: `GET /api/profile` on mount to hydrate from backend
- [ ] PDF download button: use `form_output.pdf_path` (not `form_output.pdf_path && ...` — check for null)
- [ ] "Clear conversation" button → `DELETE /api/chat/history`
- [ ] Handle `error` field in response (show error state when `data.error !== null`)

### Backend — STILL NEEDED ❌
- [ ] Form PDF templates — `data/forms/dd1610.pdf`, `data/forms/da31.pdf` must exist for PDF generation (currently falls back to text if missing)
- [ ] AR 623-3 PDF in `data/army_regs/` — eval domain has no chunks if this file is missing
- [ ] Streaming endpoint (Phase 2 — nice-to-have for demo wow factor)

---

## Error Handling

All errors return:
```json
{"response": null, "error": "description of what went wrong", "tools_used": []}
```

Frontend should show error state when `error !== null`.

---

## CORS

Backend sets `Access-Control-Allow-Origin: http://localhost:5173` (Vite default port).
No auth required — local only.
