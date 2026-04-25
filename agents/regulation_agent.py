"""Regulation Navigator Agent — RAG over JTR, ARs, AFIs with citations.

This is a stub. The real implementation will use a ChromaDB vector store
with chunked regulation text. For now, it returns hardcoded answers for
common questions to test the orchestrator routing.
"""

STUB_ANSWERS = {
    "pov": {
        "answer": "Yes, you may use your POV (Privately Owned Vehicle) for TDY travel. Per JTR Chapter 2, Section 020206, a traveler may be authorized to use a POV when it is advantageous to the government or at the traveler's request. When POV is used, mileage is reimbursed at the current rate ($0.67/mile). However, reimbursement is limited to the cost of the travel mode that would have been most advantageous to the government.",
        "citations": ["JTR Chapter 2, Section 020206", "JTR Appendix A (Mileage Rates)"]
    },
    "leave_accrual": {
        "answer": "Active duty service members accrue 2.5 days of leave per month, for a total of 30 days per year. Members may accumulate up to 60 days of leave. Any leave in excess of 60 days at the end of the fiscal year (September 30) is forfeited unless a special leave accrual exception applies.",
        "citations": ["AR 600-8-10, para 3-1", "10 USC 701"]
    },
    "gtc": {
        "answer": "The Government Travel Card (GTC) is mandatory for all official TDY travel expenses unless a specific exemption applies. Failure to use the GTC for authorized expenses may result in disciplinary action. Exemptions include: TDY of 3 days or fewer with no lodging, or when the merchant does not accept the card.",
        "citations": ["JTR Chapter 1, Section 010303", "DoD 7000.14-R, Vol 9, Ch 3"]
    },
    "profile_leave": {
        "answer": "A temporary medical profile does not restrict ordinary leave. However, the soldier must have medical clearance if the leave destination is OCONUS or if the profile restricts travel. The unit commander retains final approval authority for all leave requests.",
        "citations": ["AR 600-8-10, para 4-3", "AR 40-502, para 7-3"]
    },
    "per_diem": {
        "answer": "Per diem is the daily allowance for lodging, meals, and incidental expenses while on TDY. CONUS rates are set by GSA and vary by location. The standard CONUS rate is $107/night lodging and $64/day M&IE. On travel days (first and last day of TDY), M&IE is reimbursed at 75% of the locality rate.",
        "citations": ["JTR Chapter 2, Section 020302", "GSA Per Diem Rate Tables"]
    },
    "voucher": {
        "answer": "A travel voucher must be filed within 5 business days of returning from TDY. The voucher is submitted through the Defense Travel System (DTS). Receipts are required for all lodging expenses and for any other expense over $75. Failure to file a timely voucher may result in collection action on the Government Travel Card.",
        "citations": ["JTR Chapter 2, Section 020801", "DoD FMR Vol 9, Ch 8"]
    },
}


def lookup_regulation(question: str, topic: str = "", regulation_hint: str = "") -> str:
    """Stub: look up regulation. Will be replaced with RAG."""
    q_lower = question.lower()

    matched_key = None
    for key in STUB_ANSWERS:
        if key in q_lower:
            matched_key = key
            break

    if not matched_key:
        keyword_map = {
            "pov": ["pov", "privately owned", "drive", "driving", "vehicle", "mileage"],
            "leave_accrual": ["accru", "accumulate", "earn leave", "how much leave"],
            "gtc": ["gtc", "government travel card", "travel card"],
            "profile_leave": ["profile", "medical", "temporary profile"],
            "per_diem": ["per diem", "lodging rate", "meals", "m&ie", "mie"],
            "voucher": ["voucher", "receipt", "file", "reimburse", "5 days"],
        }
        for key, keywords in keyword_map.items():
            if any(kw in q_lower for kw in keywords):
                matched_key = key
                break

    if matched_key:
        entry = STUB_ANSWERS[matched_key]
        citations = "\n".join(f"- {c}" for c in entry["citations"])
        return f"{entry['answer']}\n\n**Citations:**\n{citations}"

    return (
        f"I found relevant regulations related to your question, but I need the full RAG "
        f"pipeline to give you a precise answer. The relevant sources to check would be:\n\n"
        f"- Joint Travel Regulations (JTR)\n"
        f"- AR 600-8-10 (Leaves and Passes)\n"
        f"- {'AFI / DAFI' if 'air force' in q_lower else 'Army Regulations'}\n\n"
        f"*Note: This is a stub response. Full regulation search will be available once the "
        f"vector store is populated with parsed regulation PDFs.*"
    )
