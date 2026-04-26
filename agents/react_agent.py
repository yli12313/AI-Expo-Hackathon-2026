"""
Duty Line — ReAct Agent

Single reasoning loop:
  Thought  → what do I need to answer this?
  Action   → call a tool (or answer directly)
  Observe  → receive tool result
  Repeat   → until sufficient, then stream final answer

One model (qwen2.5:7b via Ollama), all tools available every turn.
No separate classifier. No routing failures.

Usage:
    from agents.react_agent import ReActAgent
    agent = ReActAgent()
    for token in agent.chat("I need TDY to Fort Moore next month"):
        print(token, end="", flush=True)
"""

from __future__ import annotations

import json
import logging
import os
import warnings
from pathlib import Path
from typing import Generator

from dotenv import load_dotenv
from openai import OpenAI

from agents.tools import TOOL_SCHEMAS, execute_tool

load_dotenv()

os.environ.setdefault("ANONYMIZED_TELEMETRY", "false")
logging.getLogger("chromadb").setLevel(logging.ERROR)
warnings.filterwarnings("ignore", message=".*existing embedding ID.*")

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------
LLM_BASE_URL   = os.getenv("LLM_BASE_URL",  "http://localhost:11434/v1")
LLM_MODEL      = os.getenv("LLM_MODEL",     "qwen2.5:7b")
LLM_API_KEY    = os.getenv("LLM_API_KEY",   "ollama")
MAX_ITERATIONS = 6      # max tool calls per turn before forcing a final answer
HISTORY_WINDOW = 12     # max messages kept in context (sliding window)
PROFILE_FILE   = Path(__file__).parent.parent / "profile.json"

# ---------------------------------------------------------------------------
# System prompt — tells the model what it is, what docs exist, how to reason
# ---------------------------------------------------------------------------
SYSTEM_PROMPT = """You are Duty Line, an AI assistant for US military personnel.
Your mission: reduce bureaucratic burden for soldiers and veterans by helping them navigate regulations, plan travel, manage leave, and complete forms — all offline.

## Documents you can search (use search_regulations tool):
- JTR (Joint Travel Regulations): all TDY travel — per diem, lodging, mileage, GTC requirements, entitlements
- AR 600-8-10: Army leave policy — accrual rates, leave types, DA 31 process, leave during deployment
- AR 623-3: Officer and NCO evaluation reports
- DA forms: DA 31 (leave), DA 4856 (counseling), DA 4187 (personnel action)

## Tools available:
- search_regulations: look up exact regulation text with citations
- get_per_diem: offline GSA rate lookup for any TDY destination
- calculate_travel_cost: full JTR-compliant cost breakdown (lodging + meals + mileage)
- fill_form: populate DA/DD forms, outputs filled PDF or structured summary

## How to reason (ReAct):
1. Read the soldier's request carefully
2. Decide: do you need a tool to answer accurately? If yes, call it
3. Use tool results as ground truth — never guess regulation text or dollar amounts
4. For simple questions you can answer from context, answer directly
5. Always cite the source document and section for regulation answers
6. For TDY planning: get per diem THEN calculate cost THEN offer to fill DD 1610
7. Ask for missing info one question at a time — don't overwhelm the soldier

## Rules:
- Never invent regulation text, per diem rates, or form field requirements
- If you don't have enough info to complete a form, ask for what's missing
- Be direct and concise — soldiers need actionable answers, not essays
- Always state which regulation your answer comes from"""


class ReActAgent:
    """
    Stateful ReAct agent. One instance per user session.
    Call .chat(message) → returns a streaming generator of tokens.
    Call .reset() to start a new conversation.
    """

    def __init__(self):
        self._client  = OpenAI(base_url=LLM_BASE_URL, api_key=LLM_API_KEY)
        self._history: list[dict] = []   # conversation turns
        self._profile: dict       = self._load_profile()

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def chat(self, user_message: str) -> Generator[str, None, None]:
        """
        Process a user message. Yields response tokens as they stream.
        Yields tool observation lines (prefixed with ⚙) during reasoning.
        """
        self._add_message("user", user_message)

        try:
            yield from self._react_loop()
        except Exception as e:
            error_msg = f"\n[Error in reasoning loop: {e}]"
            self._add_message("assistant", error_msg)
            yield error_msg

    def reset(self):
        """Clear conversation history, keep profile."""
        self._history = []

    def get_history(self) -> list[dict]:
        return list(self._history)

    # ------------------------------------------------------------------
    # ReAct loop
    # ------------------------------------------------------------------

    def _react_loop(self) -> Generator[str, None, None]:
        messages = self._build_messages()
        iterations = 0

        while iterations < MAX_ITERATIONS:
            iterations += 1

            # Call LLM — non-streaming for tool decision phase
            response = self._client.chat.completions.create(
                model=LLM_MODEL,
                messages=messages,
                tools=TOOL_SCHEMAS,
                tool_choice="auto",
                temperature=0.1,
                max_tokens=1024,
            )

            choice      = response.choices[0]
            finish      = choice.finish_reason
            msg         = choice.message

            # --- Case 1: LLM wants to call tools ---
            if finish == "tool_calls" and msg.tool_calls:
                # Add assistant's tool-call intent to message history
                messages.append({
                    "role":       "assistant",
                    "content":    msg.content or "",
                    "tool_calls": [
                        {
                            "id":       tc.id,
                            "type":     "function",
                            "function": {
                                "name":      tc.function.name,
                                "arguments": tc.function.arguments,
                            },
                        }
                        for tc in msg.tool_calls
                    ],
                })

                # Execute each tool call, yield observation to UI
                for tc in msg.tool_calls:
                    tool_name = tc.function.name
                    try:
                        tool_args = json.loads(tc.function.arguments)
                    except json.JSONDecodeError:
                        tool_args = {}

                    # Yield a reasoning step visible in the UI
                    observation_header = f"\n⚙ {self._tool_label(tool_name, tool_args)}\n"
                    yield observation_header

                    # Execute tool
                    result_str = execute_tool(tool_name, tool_args)

                    # Yield a short summary of the result
                    yield self._summarize_tool_result(tool_name, result_str) + "\n"

                    # Add tool result as observation for LLM
                    messages.append({
                        "role":         "tool",
                        "tool_call_id": tc.id,
                        "content":      result_str,
                    })

                # Continue loop — LLM will now reason with the observations
                continue

            # --- Case 2: LLM is ready to give a final answer ---
            final_text = msg.content or ""
            if not final_text.strip():
                final_text = "I was unable to generate a response. Please try rephrasing your question."

            # Save to history (trimmed to avoid context bloat)
            self._add_message("assistant", final_text)
            self._trim_history()

            # Stream the final answer token by token
            yield "\n"
            yield from self._stream_text(final_text)
            return

        # Safety: exceeded max iterations — force a final answer
        yield "\n⚠ Reached reasoning limit. Generating best available answer...\n\n"
        messages.append({
            "role":    "user",
            "content": "Based on everything gathered so far, provide your best answer now.",
        })
        fallback = self._client.chat.completions.create(
            model=LLM_MODEL,
            messages=messages,
            temperature=0.1,
            max_tokens=512,
            stream=True,
        )
        full = ""
        for chunk in fallback:
            token = chunk.choices[0].delta.content or ""
            full += token
            yield token
        self._add_message("assistant", full)

    # ------------------------------------------------------------------
    # Message building
    # ------------------------------------------------------------------

    def _build_messages(self) -> list[dict]:
        """Build the full message list: system + profile context + history."""
        system_content = SYSTEM_PROMPT
        if self._profile:
            system_content += f"\n\n## Soldier profile (pre-loaded):\n{json.dumps(self._profile, indent=2)}"

        messages = [{"role": "system", "content": system_content}]
        # Apply sliding window to history
        window = self._history[-HISTORY_WINDOW:] if len(self._history) > HISTORY_WINDOW else self._history
        messages.extend(window)
        return messages

    def _add_message(self, role: str, content: str):
        self._history.append({"role": role, "content": content})

    def _trim_history(self):
        """Keep history within window to avoid context overflow."""
        if len(self._history) > HISTORY_WINDOW:
            # Always keep the first message for context, trim the middle
            self._history = self._history[-HISTORY_WINDOW:]

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    def _load_profile(self) -> dict:
        if PROFILE_FILE.exists():
            try:
                return json.loads(PROFILE_FILE.read_text())
            except Exception:
                pass
        return {}

    def _stream_text(self, text: str) -> Generator[str, None, None]:
        """Simulate streaming by yielding the full text at once.
        Replace with actual streaming call if latency becomes a concern."""
        yield text

    def _tool_label(self, name: str, args: dict) -> str:
        """Human-readable label for a tool call shown in the UI."""
        if name == "search_regulations":
            domain = f" [{args.get('domain', 'all')}]" if args.get("domain") else ""
            return f"Searching regulations{domain}: \"{args.get('query', '')[:60]}\""
        if name == "get_per_diem":
            return f"Getting per diem rates for {args.get('city', '')}, {args.get('state', '')}"
        if name == "calculate_travel_cost":
            return (
                f"Calculating travel cost: {args.get('destination_city', '')} "
                f"({args.get('travel_days', '?')} days, {args.get('travel_mode', 'POV')})"
            )
        if name == "fill_form":
            return f"Filling {args.get('form_name', 'form')}..."
        return f"Calling {name}"

    def _summarize_tool_result(self, name: str, result_str: str) -> str:
        """One-line summary of tool result for the UI reasoning trace."""
        try:
            r = json.loads(result_str)
        except Exception:
            return "  → result received"

        if not r.get("success"):
            return f"  → Error: {r.get('error', 'unknown')}"

        if name == "search_regulations":
            results = r.get("results", [])
            if results:
                top = results[0]
                return f"  → Found: {top['source']} | {top['section'][:50]} (score {top['score']})"
            return "  → No results found"

        if name == "get_per_diem":
            return (
                f"  → {r.get('city', '')}, {r.get('state', '')}: "
                f"Lodging ${r.get('lodging', '?')}/night | M&IE ${r.get('mie', '?')}/day"
            )

        if name == "calculate_travel_cost":
            return f"  → {r.get('summary', 'calculated')}"

        if name == "fill_form":
            n_filled  = len(r.get("filled_fields", {}))
            n_missing = len(r.get("missing_fields", []))
            pdf_note  = "PDF ready" if r.get("pdf_generated") else "text summary saved"
            return f"  → {r.get('form_name', '')}: {n_filled} fields filled, {n_missing} missing — {pdf_note}"

        return "  → done"


# ---------------------------------------------------------------------------
# Standalone test — python3 agents/react_agent.py
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    import sys

    agent = ReActAgent()

    tests = [
        (
            "GTC question",
            "Is the government travel charge card mandatory for my TDY trip?",
        ),
        (
            "TDY cost — SPC Rivera scenario",
            "I need to send SPC Rivera to Fort Moore, Georgia for 5 days starting July 10. She's driving her POV from Fort Liberty.",
        ),
        (
            "Leave accrual",
            "How many days of leave do I accrue per month on active duty?",
        ),
    ]

    for label, query in tests:
        print(f"\n{'='*60}")
        print(f"TEST: {label}")
        print(f"Q: {query}")
        print(f"{'='*60}")
        print("A: ", end="")
        for token in agent.chat(query):
            print(token, end="", flush=True)
        print()
        agent.reset()   # fresh conversation for each test
