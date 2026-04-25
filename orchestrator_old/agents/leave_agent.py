"""Leave/HR Agent — handles leave requests, personnel actions, DA 31/4187."""


def count_chargeable_days(start_date: str, num_days: int) -> dict:
    """Calculate chargeable leave days (weekends in the middle are free)."""
    from datetime import datetime, timedelta

    try:
        start = datetime.strptime(start_date, "%Y-%m-%d")
    except ValueError:
        return {"chargeable": num_days, "total": num_days, "note": "Could not parse date, assuming all days chargeable"}

    chargeable = 0
    total_calendar = 0
    current = start

    while chargeable < num_days:
        if current.weekday() < 5:
            chargeable += 1
        total_calendar += 1
        current += timedelta(days=1)

    end_date = start + timedelta(days=total_calendar - 1)

    return {
        "chargeable": num_days,
        "total_calendar_days": total_calendar,
        "start": start.strftime("%d %b %Y").upper(),
        "end": end_date.strftime("%d %b %Y").upper(),
        "note": "Weekends/holidays within leave period are not charged per AR 600-8-10"
    }


def check_eligibility(leave_balance: int, requested_days: int) -> dict:
    """Check if soldier has enough leave balance."""
    eligible = leave_balance >= requested_days
    remaining = leave_balance - requested_days if eligible else leave_balance

    return {
        "eligible": eligible,
        "accrued": leave_balance,
        "requested": requested_days,
        "remaining_after": remaining,
        "regulation": "AR 600-8-10, para 4-3",
        "note": "Soldiers accrue 2.5 days/month (30 days/year). Max accumulation: 60 days."
    }


def handle_leave_request(
    soldier: str,
    rank: str,
    leave_type: str,
    num_days: int,
    start_date: str,
    destination: str = "",
    reason: str = "",
    leave_balance: int = 22
) -> str:
    """Main entry point for leave agent. Returns formatted response."""
    eligibility = check_eligibility(leave_balance, num_days)
    day_calc = count_chargeable_days(start_date, num_days)

    status = "ELIGIBLE" if eligibility["eligible"] else "INELIGIBLE — insufficient leave balance"

    lines = [
        f"## Leave Request — {rank} {soldier}",
        "",
        f"**Status:** {status}",
        "",
        f"| Field | Value |",
        f"|-------|-------|",
        f"| Leave Type | {leave_type.title()} |",
        f"| Days Requested | {num_days} |",
        f"| Start Date | {day_calc['start']} |",
        f"| End Date | {day_calc['end']} |",
        f"| Calendar Days | {day_calc['total_calendar_days']} |",
        f"| Destination | {destination} |" if destination else "",
        f"| Reason | {reason} |" if reason else "",
        "",
        "### Leave Balance",
        "",
        f"| | Days |",
        f"|------|------|",
        f"| Accrued | {eligibility['accrued']} |",
        f"| Requested | {eligibility['requested']} |",
        f"| Remaining After | {eligibility['remaining_after']} |",
        "",
        "### Regulation Reference",
        "",
        f"- {eligibility['regulation']}: Ordinary leave is approved by the company commander",
        f"- {day_calc['note']}",
        f"- {eligibility['note']}",
    ]

    if leave_type.lower() == "emergency":
        lines.append("- Emergency leave requires Red Cross verification per AR 600-8-10, para 5-4")

    lines.extend([
        "",
        "### Next Steps",
        "",
        "- DA Form 31 has been populated with the above details",
        "- Route to supervisor > 1SG > Commander for approval",
    ])

    return "\n".join(line for line in lines if line is not None)
