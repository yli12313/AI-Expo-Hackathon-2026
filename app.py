"""
Duty Line — FastAPI Backend

Serves the ReAct agent over HTTP so the frontend can call it.
Runs on http://localhost:8000

Start:
    python3 -m uvicorn app:app --reload --port 8000
"""

from __future__ import annotations

import json
import logging
import os
import re
import time
from pathlib import Path
from typing import Any

import requests
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel, field_validator

load_dotenv()

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("dutyline")

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------
ROOT         = Path(__file__).parent
OUTPUT_DIR   = ROOT / "output"
PROFILE_FILE = ROOT / "profile.json"
GSA_CACHE    = ROOT / "data" / "gsa_cache.json"
VECTORSTORE  = ROOT / "vectorstore"
OUTPUT_DIR.mkdir(exist_ok=True)

LLM_BASE_URL = os.getenv("LLM_BASE_URL", "http://localhost:11434/v1")
LLM_MODEL    = os.getenv("LLM_MODEL",    "qwen2.5:7b")

# ---------------------------------------------------------------------------
# App + CORS
# ---------------------------------------------------------------------------
app = FastAPI(title="Duty Line API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",   # Vite dev server
        "http://localhost:3000",   # fallback
        "http://127.0.0.1:5173",
        "http://127.0.0.1:3000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# ReAct agent — lazy singleton, one instance reused across requests
# ---------------------------------------------------------------------------
_agent = None

def get_agent():
    global _agent
    if _agent is None:
        from agents.react_agent import ReActAgent
        _agent = ReActAgent()
        log.info("ReAct agent initialised")
    return _agent

# ---------------------------------------------------------------------------
# Request / Response models
# ---------------------------------------------------------------------------

class ChatRequest(BaseModel):
    message: str
    tab: str = "travel"

    @field_validator("message")
    @classmethod
    def message_not_empty(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("message cannot be empty")
        if len(v) > 2000:
            raise ValueError("message too long (max 2000 chars)")
        return v

    @field_validator("tab")
    @classmethod
    def valid_tab(cls, v: str) -> str:
        allowed = {"travel", "leave", "regulation", "eval"}
        return v if v in allowed else "travel"


class ChatResponse(BaseModel):
    response:        str
    tools_used:      list[str]
    reasoning_steps: list[str]
    form_output:     dict | None
    error:           str | None


class ProfileModel(BaseModel):
    name_last_first: str = ""
    rank:            str = ""
    grade:           str = ""
    ssn_last4:       str = ""
    dod_id:          str = ""
    unit:            str = ""
    installation:    str = ""
    uic:             str = ""
    supervisor_name: str = ""
    supervisor_title: str = ""

    @field_validator("ssn_last4")
    @classmethod
    def ssn_digits_only(cls, v: str) -> str:
        if v and not re.match(r"^\d{4}$", v):
            raise ValueError("ssn_last4 must be exactly 4 digits")
        return v

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _parse_agent_output(raw: str) -> tuple[str, list[str], list[str], dict | None]:
    """
    Split raw agent output into:
      - reasoning_steps: lines starting with ⚙ or →
      - final answer: everything else
      - tools_used: tool names extracted from reasoning
      - form_output: form metadata if fill_form was called
    """
    lines          = raw.split("\n")
    reasoning      = []
    answer_lines   = []
    tools_used     = set()
    form_output    = None

    TOOL_MARKERS = {
        "Searching regulations":    "search_regulations",
        "Getting per diem":         "get_per_diem",
        "Calculating travel cost":  "calculate_travel_cost",
        "Filling":                  "fill_form",
    }

    for line in lines:
        stripped = line.strip()
        if stripped.startswith("⚙") or stripped.startswith("→"):
            reasoning.append(stripped)
            for marker, tool_name in TOOL_MARKERS.items():
                if marker in stripped:
                    tools_used.add(tool_name)
        elif stripped.startswith("[Error"):
            # Surface errors cleanly
            answer_lines.append(stripped)
        elif stripped.startswith("⚠"):
            reasoning.append(stripped)
        else:
            answer_lines.append(line)

    # Detect form output in reasoning trace
    for step in reasoning:
        if "fill_form" in tools_used or "Filling" in step:
            # Look for PDF path in output dir
            pdfs = sorted(OUTPUT_DIR.glob("*.pdf"), key=lambda p: p.stat().st_mtime, reverse=True)
            txts = sorted(OUTPUT_DIR.glob("*.txt"), key=lambda p: p.stat().st_mtime, reverse=True)
            if pdfs and (time.time() - pdfs[0].stat().st_mtime) < 30:
                form_output = {
                    "form_name":     pdfs[0].stem.split("_")[0] + "_" + pdfs[0].stem.split("_")[1],
                    "pdf_available": True,
                    "pdf_url":       f"/api/forms/{pdfs[0].name}",
                    "txt_summary":   txts[0].read_text() if txts else "",
                }
            elif txts and (time.time() - txts[0].stat().st_mtime) < 30:
                form_output = {
                    "form_name":     txts[0].stem,
                    "pdf_available": False,
                    "pdf_url":       None,
                    "txt_summary":   txts[0].read_text(),
                }
            break

    answer = "\n".join(answer_lines).strip()
    if not answer:
        answer = "I was unable to generate a response. Please try rephrasing."

    return answer, list(tools_used), reasoning, form_output


def _check_ollama() -> bool:
    try:
        r = requests.get(f"{LLM_BASE_URL.rstrip('/v1')}/api/tags", timeout=3)
        return r.status_code == 200
    except Exception:
        return False


def _count_vector_chunks() -> int:
    try:
        import chromadb
        from chromadb.config import Settings
        client = chromadb.PersistentClient(
            path=str(VECTORSTORE),
            settings=Settings(anonymized_telemetry=False),
        )
        col = client.get_or_create_collection("dutyline")
        return col.count()
    except Exception:
        return 0

# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@app.get("/api/health")
async def health():
    """Check backend, Ollama, vector store, and GSA cache status."""
    ollama_ok     = _check_ollama()
    chunk_count   = _count_vector_chunks()
    gsa_ok        = GSA_CACHE.exists() and GSA_CACHE.stat().st_size > 1000

    return {
        "status":               "ok" if ollama_ok else "degraded",
        "ollama":               ollama_ok,
        "model":                LLM_MODEL,
        "vector_store_chunks":  chunk_count,
        "vector_store_ready":   chunk_count > 0,
        "gsa_cache_loaded":     gsa_ok,
        "offline_ready":        ollama_ok and chunk_count > 0 and gsa_ok,
    }


@app.post("/api/chat", response_model=ChatResponse)
async def chat(req: ChatRequest):
    """
    Main chat endpoint. Runs the ReAct agent and returns structured response.
    """
    log.info(f"chat | tab={req.tab} | msg={req.message[:80]!r}")

    try:
        agent = get_agent()
    except Exception as e:
        log.error(f"Agent init failed: {e}")
        return ChatResponse(
            response="The AI assistant failed to initialise. Make sure Ollama is running and the vector store exists (run ingest.py).",
            tools_used=[],
            reasoning_steps=[],
            form_output=None,
            error=str(e),
        )

    try:
        raw_parts: list[str] = []
        for token in agent.chat(req.message):
            raw_parts.append(token)

        raw = "".join(raw_parts)
        answer, tools_used, reasoning_steps, form_output = _parse_agent_output(raw)

        log.info(f"chat done | tools={tools_used} | answer_len={len(answer)}")

        return ChatResponse(
            response=answer,
            tools_used=tools_used,
            reasoning_steps=reasoning_steps,
            form_output=form_output,
            error=None,
        )

    except Exception as e:
        log.error(f"Agent chat error: {e}", exc_info=True)
        return ChatResponse(
            response="An error occurred while processing your request. Please try again.",
            tools_used=[],
            reasoning_steps=[],
            form_output=None,
            error=str(e),
        )


@app.get("/api/forms/{filename}")
async def get_form(filename: str):
    """
    Download a generated form PDF or TXT.
    Validates path to prevent directory traversal.
    """
    # Security: reject any path traversal attempts
    if ".." in filename or "/" in filename or "\\" in filename:
        raise HTTPException(status_code=400, detail="Invalid filename")

    # Only allow known extensions
    if not (filename.endswith(".pdf") or filename.endswith(".txt")):
        raise HTTPException(status_code=400, detail="Only PDF and TXT files are served")

    file_path = OUTPUT_DIR / filename
    if not file_path.exists():
        raise HTTPException(status_code=404, detail=f"Form '{filename}' not found")

    media_type = "application/pdf" if filename.endswith(".pdf") else "text/plain"
    return FileResponse(
        path=str(file_path),
        media_type=media_type,
        filename=filename,
    )


@app.get("/api/profile")
async def get_profile():
    """Load the saved soldier profile."""
    if not PROFILE_FILE.exists():
        return {}
    try:
        return json.loads(PROFILE_FILE.read_text())
    except Exception as e:
        log.error(f"Profile read error: {e}")
        raise HTTPException(status_code=500, detail="Failed to read profile")


@app.post("/api/profile")
async def save_profile(profile: ProfileModel):
    """Save soldier profile to local file. Reloads the agent's profile."""
    try:
        data = profile.model_dump()
        PROFILE_FILE.write_text(json.dumps(data, indent=2))

        # Reload profile in running agent without reinitialising
        if _agent is not None:
            _agent._profile = data

        log.info(f"Profile saved: {data.get('name_last_first')} {data.get('rank')}")
        return {"status": "saved"}
    except Exception as e:
        log.error(f"Profile save error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.delete("/api/chat/history")
async def clear_history():
    """Clear the agent's conversation history."""
    if _agent is not None:
        _agent.reset()
    return {"status": "cleared"}


@app.get("/")
async def root():
    return {"service": "Duty Line API", "version": "1.0.0", "docs": "/docs"}
