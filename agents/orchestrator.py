"""Orchestrator Agent — classifies intent, extracts entities, routes to sub-agents."""

import json
from openai import OpenAI
from config.settings import OPENROUTER_API_KEY, OPENROUTER_BASE_URL, MODEL
from agents.travel_agent import handle_travel_request
from agents.leave_agent import handle_leave_request
from agents.regulation_agent import lookup_regulation

client = OpenAI(
    base_url=OPENROUTER_BASE_URL,
    api_key=OPENROUTER_API_KEY,
)

SYSTEM_PROMPT = """You are Duty Line, an AI military administrative assistant. You help service members with TDY travel planning, leave requests, and regulation lookups.

You are professional, concise, and always cite regulations. You serve all branches (Army, Navy, Air Force, Marines) but default to Army forms and regulations unless the user specifies otherwise.

When a user makes a request, determine which tool to call:
- Use travel_agent for TDY travel planning, per diem lookups, mileage calculations
- Use leave_agent for leave/pass requests, personnel actions
- Use regulation_agent for regulation questions, policy lookups, "what does [reg] say about..."

Always call a tool when you can. Extract as much information as possible from the user's message. Use reasonable defaults for missing fields:
- If transport mode is not specified, default to POV
- If leave type is not specified, default to ordinary
- If leave balance is not specified, default to 22 days
- If rank is not specified, use the name as-is
- If purpose is not mentioned, leave it blank

Only ask the user for clarification if you truly cannot determine the destination, number of days, or start date. Prefer action over questions."""

TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "travel_agent",
            "description": "Plan TDY travel: calculate per diem, mileage, lodging costs, and generate a travel authorization. Use when the user mentions TDY, travel, per diem, sending someone somewhere, or trip planning.",
            "parameters": {
                "type": "object",
                "properties": {
                    "soldier": {
                        "type": "string",
                        "description": "Full name of the soldier traveling (e.g., 'SPC Rivera')"
                    },
                    "origin": {
                        "type": "string",
                        "description": "Origin base or location (e.g., 'Fort Liberty')"
                    },
                    "destination_city": {
                        "type": "string",
                        "description": "Destination city (e.g., 'Columbus' for Fort Moore)"
                    },
                    "destination_state": {
                        "type": "string",
                        "description": "Destination state abbreviation (e.g., 'GA')"
                    },
                    "num_days": {
                        "type": "integer",
                        "description": "Number of TDY days"
                    },
                    "start_date": {
                        "type": "string",
                        "description": "Start date of travel (e.g., 'July 10, 2026')"
                    },
                    "transport": {
                        "type": "string",
                        "enum": ["POV", "GOV", "Air", "Rental"],
                        "description": "Mode of transportation"
                    },
                    "purpose": {
                        "type": "string",
                        "description": "Purpose of travel (e.g., 'attend 5-day leadership course')"
                    }
                },
                "required": ["soldier", "origin", "destination_city", "destination_state", "num_days", "start_date", "transport"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "leave_agent",
            "description": "Process leave requests: check eligibility, calculate chargeable days, prepare DA Form 31. Use when the user mentions leave, pass, time off, DA 31, or taking days off.",
            "parameters": {
                "type": "object",
                "properties": {
                    "soldier": {
                        "type": "string",
                        "description": "Soldier's last name"
                    },
                    "rank": {
                        "type": "string",
                        "description": "Rank (e.g., 'SGT', 'SPC', 'SSG')"
                    },
                    "leave_type": {
                        "type": "string",
                        "enum": ["ordinary", "emergency", "convalescent", "permissive", "pass"],
                        "description": "Type of leave"
                    },
                    "num_days": {
                        "type": "integer",
                        "description": "Number of leave days requested"
                    },
                    "start_date": {
                        "type": "string",
                        "description": "Start date in YYYY-MM-DD format"
                    },
                    "destination": {
                        "type": "string",
                        "description": "Leave destination"
                    },
                    "reason": {
                        "type": "string",
                        "description": "Reason for leave"
                    },
                    "leave_balance": {
                        "type": "integer",
                        "description": "Current leave balance in days (default 22 if unknown)"
                    }
                },
                "required": ["soldier", "rank", "leave_type", "num_days", "start_date"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "regulation_agent",
            "description": "Look up military regulations and answer policy questions. Use when the user asks about rules, regulations, policies, what a regulation says, or 'am I allowed to...' questions. Covers JTR, Army Regulations, AFIs, and DoD instructions.",
            "parameters": {
                "type": "object",
                "properties": {
                    "question": {
                        "type": "string",
                        "description": "The regulation question in natural language"
                    },
                    "topic": {
                        "type": "string",
                        "description": "Topic area (e.g., 'travel', 'leave', 'evaluations')"
                    },
                    "regulation_hint": {
                        "type": "string",
                        "description": "Specific regulation referenced (e.g., 'JTR', 'AR 600-8-10')"
                    }
                },
                "required": ["question"]
            }
        }
    }
]

TOOL_HANDLERS = {
    "travel_agent": handle_travel_request,
    "leave_agent": handle_leave_request,
    "regulation_agent": lookup_regulation,
}


def run_orchestrator(user_message: str, conversation_history: list = None) -> str:
    """Process a user message through the orchestrator. Returns the final response."""
    if conversation_history is None:
        conversation_history = []

    messages = [{"role": "system", "content": SYSTEM_PROMPT}]
    messages.extend(conversation_history)
    messages.append({"role": "user", "content": user_message})

    response = client.chat.completions.create(
        model=MODEL,
        messages=messages,
        tools=TOOLS,
        tool_choice="auto",
    )

    message = response.choices[0].message

    if not message.tool_calls:
        return message.content or "I'm not sure how to help with that. Try asking about TDY travel, leave requests, or military regulations."

    results = []
    for tool_call in message.tool_calls:
        fn_name = tool_call.function.name
        args = json.loads(tool_call.function.arguments)

        handler = TOOL_HANDLERS.get(fn_name)
        if handler:
            result = handler(**args)
            results.append(result)

    if results:
        return "\n\n---\n\n".join(results)

    return message.content or "Something went wrong processing your request."
