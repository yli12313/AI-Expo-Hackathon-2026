"""Test script to verify orchestrator routing works correctly."""

from agents.orchestrator import run_orchestrator


def test_routing():
    test_cases = [
        {
            "name": "TDY Travel Request",
            "input": "I need to send SPC Rivera to Fort Moore, Georgia for a 5-day course starting July 10. She's driving her POV from Fort Liberty.",
            "expected_agent": "travel"
        },
        {
            "name": "Leave Request",
            "input": "I need to take 10 days leave starting June 3rd to visit my family in Texas. I'm SGT Johnson.",
            "expected_agent": "leave"
        },
        {
            "name": "Regulation Lookup",
            "input": "Can I use my POV instead of a rental car for TDY travel?",
            "expected_agent": "regulation"
        },
    ]

    for tc in test_cases:
        print(f"\n{'='*60}")
        print(f"TEST: {tc['name']}")
        print(f"INPUT: {tc['input']}")
        print(f"EXPECTED: {tc['expected_agent']} agent")
        print(f"{'='*60}\n")

        try:
            result = run_orchestrator(tc["input"])
            print(result)
        except Exception as e:
            print(f"ERROR: {e}")

        print()


if __name__ == "__main__":
    test_routing()
