"""Travel Agent — handles TDY planning, per diem lookups, mileage, DD 1610."""

import requests
from config.settings import GSA_API_KEY

BASE_DISTANCES = {
    ("fort liberty", "fort moore"): 370,
    ("fort moore", "fort liberty"): 370,
    ("fort liberty", "fort bragg"): 0,
    ("fort bragg", "fort moore"): 370,
    ("fort moore", "fort bragg"): 370,
    ("fort liberty", "fort hood"): 1250,
    ("fort hood", "fort liberty"): 1250,
    ("fort liberty", "fort campbell"): 530,
    ("fort campbell", "fort liberty"): 530,
}

MILEAGE_RATE = 0.67


def get_per_diem(city: str, state: str, year: int = 2026) -> dict:
    """Fetch GSA per diem rates for a city/state."""
    if not GSA_API_KEY:
        return {
            "lodging": 107,
            "mie": 64,
            "city": city,
            "state": state,
            "note": "Using default CONUS rates (no GSA API key configured)"
        }

    url = f"https://api.gsa.gov/travel/perdiem/v2/rates/city/{city}/state/{state}/year/{year}"
    headers = {"x-api-key": GSA_API_KEY}
    resp = requests.get(url, headers=headers, timeout=10)

    if resp.status_code == 200:
        data = resp.json()
        if data.get("rates"):
            rate = data["rates"][0]
            months = rate.get("rate", [{}])
            lodging = max(int(m.get("value", 0)) for m in months) if months else 107
            mie = int(rate.get("meals", 64))
            return {"lodging": lodging, "mie": mie, "city": city, "state": state}

    return {
        "lodging": 107,
        "mie": 64,
        "city": city,
        "state": state,
        "note": "Fallback to default CONUS rates"
    }


def get_distance(origin: str, destination: str) -> int:
    """Lookup base-to-base distance in miles."""
    key = (origin.lower().strip(), destination.lower().strip())
    return BASE_DISTANCES.get(key, 300)


def calculate_tdy_cost(
    origin: str,
    destination_city: str,
    destination_state: str,
    num_days: int,
    transport: str = "POV"
) -> dict:
    """Calculate full TDY cost estimate."""
    per_diem = get_per_diem(destination_city, destination_state)
    lodging = per_diem["lodging"]
    mie = per_diem["mie"]

    travel_days = 2
    full_days = max(num_days - travel_days, 0)
    travel_day_mie = round(mie * 0.75, 2)

    lodging_total = lodging * num_days
    mie_full = mie * full_days
    mie_travel = travel_day_mie * travel_days
    mie_total = mie_full + mie_travel

    mileage_total = 0.0
    distance = 0
    if transport.upper() == "POV":
        distance = get_distance(origin, destination_city)
        mileage_total = round(distance * MILEAGE_RATE * 2, 2)

    total = lodging_total + mie_total + mileage_total

    return {
        "per_diem": per_diem,
        "lodging_per_night": lodging,
        "lodging_nights": num_days,
        "lodging_total": lodging_total,
        "mie_full_day_rate": mie,
        "mie_full_days": full_days,
        "mie_travel_day_rate": travel_day_mie,
        "mie_travel_days": travel_days,
        "mie_total": mie_total,
        "transport": transport,
        "distance_miles": distance,
        "mileage_rate": MILEAGE_RATE,
        "mileage_total": mileage_total,
        "total_estimate": round(total, 2),
        "warnings": _get_warnings(transport, lodging_total)
    }


def _get_warnings(transport: str, lodging_total: float) -> list[str]:
    warnings = ["Government Travel Card (GTC) is mandatory per JTR Chapter 1"]
    if lodging_total > 0:
        warnings.append("Lodging receipt required (all amounts)")
    if transport.upper() == "POV":
        warnings.append("POV mileage reimbursed at $0.67/mile per JTR Appendix A")
    warnings.append("Travel voucher must be filed within 5 business days of return")
    return warnings


def handle_travel_request(
    soldier: str,
    origin: str,
    destination_city: str,
    destination_state: str,
    num_days: int,
    start_date: str,
    transport: str = "POV",
    purpose: str = ""
) -> str:
    """Main entry point for travel agent. Returns formatted response."""
    cost = calculate_tdy_cost(origin, destination_city, destination_state, num_days, transport)

    lines = [
        f"## TDY Travel Authorization — {soldier}",
        "",
        f"**Purpose:** {purpose}" if purpose else "",
        f"**Origin:** {origin}",
        f"**Destination:** {destination_city}, {destination_state}",
        f"**Dates:** {start_date} ({num_days} days)",
        f"**Transport:** {transport}",
        "",
        "### Cost Breakdown",
        "",
        f"| Item | Rate | Days/Miles | Total |",
        f"|------|------|-----------|-------|",
        f"| Lodging | ${cost['lodging_per_night']}/night | {cost['lodging_nights']} nights | ${cost['lodging_total']:.2f} |",
        f"| M&IE (full days) | ${cost['mie_full_day_rate']}/day | {cost['mie_full_days']} days | ${cost['mie_full_day_rate'] * cost['mie_full_days']:.2f} |",
        f"| M&IE (travel days) | ${cost['mie_travel_day_rate']}/day | {cost['mie_travel_days']} days | ${cost['mie_travel_day_rate'] * cost['mie_travel_days']:.2f} |",
    ]

    if transport.upper() == "POV":
        lines.append(
            f"| Mileage (POV) | ${cost['mileage_rate']}/mile | {cost['distance_miles']} mi x 2 | ${cost['mileage_total']:.2f} |"
        )

    lines.extend([
        f"| **Total Estimate** | | | **${cost['total_estimate']:.2f}** |",
        "",
        "### Warnings & Requirements",
        "",
    ])

    for w in cost["warnings"]:
        lines.append(f"- {w}")

    return "\n".join(lines)
