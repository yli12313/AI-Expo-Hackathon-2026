"""
Pre-fetches GSA per diem rates for top US military installations.
Saves to data/gsa_cache.json for fully offline use.

Run once with internet:
    python3 scripts/fetch_gsa_cache.py

After this, get_per_diem() works with zero internet dependency.
"""

import json
import os
import time
import requests
from pathlib import Path
from dotenv import load_dotenv

load_dotenv()

GSA_API_KEY = os.getenv("GSA_API_KEY", "")
YEAR        = "2026"
OUT_FILE    = Path("data/gsa_cache.json")

# Top military installation cities — covers ~90% of TDY destinations
INSTALLATIONS = [
    # Army
    {"city": "Fayetteville",    "state": "NC", "installation": "Fort Liberty"},
    {"city": "Columbus",        "state": "GA", "installation": "Fort Moore"},
    {"city": "Clarksville",     "state": "TN", "installation": "Fort Campbell"},
    {"city": "Killeen",         "state": "TX", "installation": "Fort Cavazos"},
    {"city": "El Paso",         "state": "TX", "installation": "Fort Bliss"},
    {"city": "Watertown",       "state": "NY", "installation": "Fort Drum"},
    {"city": "Hinesville",      "state": "GA", "installation": "Fort Stewart"},
    {"city": "Tacoma",          "state": "WA", "installation": "JBLM"},
    {"city": "Anchorage",       "state": "AK", "installation": "JBER"},
    {"city": "Fairbanks",       "state": "AK", "installation": "Fort Wainwright"},
    {"city": "Junction City",   "state": "KS", "installation": "Fort Riley"},
    {"city": "Augusta",         "state": "GA", "installation": "Fort Eisenhower"},
    {"city": "Sierra Vista",    "state": "AZ", "installation": "Fort Huachuca"},
    {"city": "Anniston",        "state": "AL", "installation": "Fort McClellan"},
    {"city": "Huntsville",      "state": "AL", "installation": "Redstone Arsenal"},
    # Navy / Marines
    {"city": "Norfolk",         "state": "VA", "installation": "NAS Norfolk"},
    {"city": "San Diego",       "state": "CA", "installation": "NAS North Island"},
    {"city": "Jacksonville",    "state": "FL", "installation": "NAS Jacksonville"},
    {"city": "Bremerton",       "state": "WA", "installation": "Naval Base Kitsap"},
    {"city": "Jacksonville",    "state": "NC", "installation": "Camp Lejeune"},
    {"city": "Oceanside",       "state": "CA", "installation": "Camp Pendleton"},
    {"city": "Quantico",        "state": "VA", "installation": "MCB Quantico"},
    {"city": "Twentynine Palms","state": "CA", "installation": "MCAGCC"},
    # Air Force
    {"city": "Hampton",         "state": "VA", "installation": "Langley AFB"},
    {"city": "Dayton",          "state": "OH", "installation": "Wright-Patterson AFB"},
    {"city": "Colorado Springs","state": "CO", "installation": "Peterson SFB"},
    {"city": "Fairfield",       "state": "CA", "installation": "Travis AFB"},
    {"city": "Biloxi",          "state": "MS", "installation": "Keesler AFB"},
    {"city": "San Antonio",     "state": "TX", "installation": "JBSA"},
    {"city": "Eglin Village",   "state": "FL", "installation": "Eglin AFB"},
    {"city": "Pensacola",       "state": "FL", "installation": "NAS Pensacola"},
    # DC / Pentagon area
    {"city": "Washington",      "state": "DC", "installation": "Pentagon / NDW"},
    {"city": "Arlington",       "state": "VA", "installation": "Pentagon"},
    {"city": "Bethesda",        "state": "MD", "installation": "Walter Reed"},
    {"city": "Fort Belvoir",    "state": "VA", "installation": "Fort Belvoir"},
    {"city": "Aberdeen",        "state": "MD", "installation": "APG"},
    # Hawaii
    {"city": "Honolulu",        "state": "HI", "installation": "Schofield / JBPHH"},
]

# DoD standard CONUS rate — fallback when city not in GSA database
STANDARD_RATE = {
    "lodging": 110,
    "mie":     68,
    "mie_first_last": 51,   # 75% of M&IE
    "source": "standard_conus",
}


def fetch_rate(city: str, state: str) -> dict | None:
    if not GSA_API_KEY:
        return None
    url = f"https://api.gsa.gov/travel/perdiem/v2/rates/city/{city}/state/{state}/year/{YEAR}"
    try:
        r = requests.get(url, headers={"x-api-key": GSA_API_KEY}, timeout=10)
        if r.status_code == 200:
            data = r.json()
            rates = data.get("rates", [])
            if rates:
                r0 = rates[0]
                lodging = int(r0.get("rate", [{}])[0].get("months", {}).get("Jan", 110))
                mie_val = int(r0.get("meals", 68))
                return {
                    "lodging":        lodging,
                    "mie":            mie_val,
                    "mie_first_last": round(mie_val * 0.75),
                    "source":         "gsa_api",
                    "fiscal_year":    YEAR,
                }
    except Exception as e:
        print(f"  [warn] {city}, {state}: {e}")
    return None


def build_cache():
    OUT_FILE.parent.mkdir(exist_ok=True)

    cache = {
        "_meta": {
            "fiscal_year":   YEAR,
            "standard_rate": STANDARD_RATE,
            "note": "Rates in USD per day. mie_first_last = 75% of M&IE (JTR rule for first/last travel day).",
        },
        "rates": {}
    }

    if not GSA_API_KEY:
        print("[!] GSA_API_KEY not set — building cache with standard rates only.")
        print("    Set GSA_API_KEY in .env and re-run for city-specific rates.")
        for inst in INSTALLATIONS:
            key = f"{inst['city'].lower().replace(' ', '_')}_{inst['state'].lower()}"
            cache["rates"][key] = {
                **STANDARD_RATE,
                "city":         inst["city"],
                "state":        inst["state"],
                "installation": inst["installation"],
            }
        OUT_FILE.write_text(json.dumps(cache, indent=2))
        print(f"[ok] Saved standard-rate cache → {OUT_FILE} ({len(cache['rates'])} entries)")
        return

    print(f"Fetching GSA per diem rates for {len(INSTALLATIONS)} installations (FY{YEAR})...")
    fetched = 0
    for inst in INSTALLATIONS:
        city, state = inst["city"], inst["state"]
        key = f"{city.lower().replace(' ', '_')}_{state.lower()}"
        print(f"  {city}, {state} ({inst['installation']}) ...", end=" ")

        rate = fetch_rate(city, state)
        if rate:
            cache["rates"][key] = {
                **rate,
                "city":         city,
                "state":        state,
                "installation": inst["installation"],
            }
            print(f"lodging ${rate['lodging']}, M&IE ${rate['mie']}")
            fetched += 1
        else:
            cache["rates"][key] = {
                **STANDARD_RATE,
                "city":         city,
                "state":        state,
                "installation": inst["installation"],
            }
            print("standard rate (not in GSA database)")

        time.sleep(0.2)   # be polite to the API

    OUT_FILE.write_text(json.dumps(cache, indent=2))
    print(f"\n[ok] Cache saved → {OUT_FILE}")
    print(f"     {fetched}/{len(INSTALLATIONS)} city-specific | {len(INSTALLATIONS)-fetched} standard rate")


if __name__ == "__main__":
    build_cache()
