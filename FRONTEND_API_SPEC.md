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
  "tab": "travel"
}
```
`tab` values: `"travel"` | `"leave"` | `"regulation"` | `"eval"`

**Response:**
```json
{
  "response": "Based on JTR Section 020309, here is the cost breakdown...",
  "tools_used": ["search_regulations", "get_per_diem", "calculate_travel_cost"],
  "reasoning_steps": [
    "⚙ Searching regulations [travel]: \"GTC mandatory TDY\"",
    "  → Found: jtr.pdf | Section 010204 (score 0.78)",
    "⚙ Getting per diem rates for Columbus, GA",
    "  → Lodging $104/night | M&IE $64/day"
  ],
  "form_output": null,
  "error": null
}
```

`form_output` is non-null when a form was filled:
```json
{
  "form_name": "DD_1610",
  "pdf_available": true,
  "pdf_url": "/api/forms/DD_1610_20260425_195632.pdf",
  "txt_summary": "FORM: DD_1610\nFROM: Rivera, Maria J.\n..."
}
```

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

## What the Frontend Already Has (from App.tsx review)

**Already built and correct:**
- `POST /api/chat` call with `{message, tab}` ✓
- `tools_used` badge rendering ✓
- Status states: thinking / searching / calculating / done / error ✓
- Example queries per tab ✓
- Sidebar status indicators (hardcoded green — wire to `/api/health`) ✓

**Needs to be added:**
- [ ] Wire sidebar status dots to `GET /api/health` on load
- [ ] Show `reasoning_steps` above the response (collapsible or inline)
- [ ] PDF download button when `form_output.pdf_available === true`
- [ ] Profile setup screen (first launch, or settings panel)
- [ ] Handle streaming when `/api/chat/stream` is ready

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
