"""Find & prioritize aesthetic-clinic leads in Israel for outreach.

Builds a ranked lead list (name, phone, website, city, rating, reviews, maps URL)
so the agency can start outreach fast. Two modes:

  LIVE (Google Places) — needs GOOGLE_PLACES_API_KEY in .env (+ `pip install requests`):
      python tools/find_clinics.py --cities "תל אביב,רמת גן,הרצליה" --limit 60

  DEMO (zero installs, no key) — emits a realistic sample list to show the format:
      python tools/find_clinics.py --demo

Output: a CSV + JSON under .tmp/ (or --out), and a printed summary. Leads are scored
0-100 by buying-readiness (review volume, rating, has website, has phone).

Lead scoring rationale: clinics with many reviews + a website are established and
already spend on marketing — the warmest prospects for a paid retainer.
"""
from __future__ import annotations

import argparse
import csv
import json
import os
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
TMP = HERE.parent / ".tmp"

# Hebrew search terms that surface aesthetic clinics / cosmeticians.
DEFAULT_QUERIES = [
    "קליניקת אסתטיקה",
    "קוסמטיקאית",
    "הסרת שיער בלייזר",
    "מכון יופי",
]


def _env(key: str) -> str | None:
    if os.getenv(key):
        return os.getenv(key)
    env = HERE.parent / ".env"
    if env.exists():
        for line in env.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if line.startswith(f"{key}=") and not line.startswith("#"):
                return line.split("=", 1)[1].strip()
    return None


def score_lead(lead: dict) -> int:
    """0-100 buying-readiness score. More reviews + website = warmer prospect."""
    reviews = lead.get("reviews") or 0
    rating = lead.get("rating") or 0
    s = 0
    s += min(reviews, 300) / 300 * 50          # review volume → established + spends on marketing
    s += (rating / 5) * 25 if rating else 0      # quality
    s += 15 if lead.get("website") else 0        # has site → markets actively
    s += 10 if lead.get("phone") else 0          # reachable
    return round(s)


def fetch_google_places(queries: list[str], cities: list[str], api_key: str, limit: int) -> list[dict]:
    import requests  # lazy — only needed in live mode
    url = "https://maps.googleapis.com/maps/api/place/textsearch/json"
    details_url = "https://maps.googleapis.com/maps/api/place/details/json"
    seen: dict[str, dict] = {}
    for city in cities:
        for q in queries:
            try:
                r = requests.get(url, params={"query": f"{q} {city}", "language": "he", "key": api_key}, timeout=20)
                results = r.json().get("results", [])
            except Exception as e:  # network/quota — keep going
                print(f"  ! query failed ({q} {city}): {e}", file=sys.stderr)
                continue
            for p in results:
                pid = p.get("place_id")
                if not pid or pid in seen:
                    continue
                phone = website = None
                try:  # one details call per place for phone + website
                    d = requests.get(details_url, params={
                        "place_id": pid, "language": "he",
                        "fields": "formatted_phone_number,website", "key": api_key,
                    }, timeout=20).json().get("result", {})
                    phone = d.get("formatted_phone_number")
                    website = d.get("website")
                except Exception:
                    pass
                seen[pid] = {
                    "name": p.get("name"),
                    "city": city,
                    "address": p.get("formatted_address"),
                    "rating": p.get("rating"),
                    "reviews": p.get("user_ratings_total"),
                    "phone": phone,
                    "website": website,
                    "maps_url": f"https://www.google.com/maps/place/?q=place_id:{pid}",
                }
                if len(seen) >= limit:
                    break
    return list(seen.values())


def demo_leads() -> list[dict]:
    base = [
        ("סטודיו לוקס אסתטיקה", "תל אביב", 4.9, 214, "03-1112233", "https://luxe.example"),
        ("ביוטי קליניק", "רמת גן", 4.7, 156, "03-2223344", "https://beauty.example"),
        ("דרמה סקין", "הרצליה", 4.8, 98, "09-3334455", None),
        ("גלאם בר", "תל אביב", 4.5, 61, "052-4445566", "https://glam.example"),
        ("פרפקט פייס", "פתח תקווה", 4.6, 33, "03-5556677", None),
        ("רויאל אסתטיקס", "ראשון לציון", 5.0, 12, "050-6667788", "https://royal.example"),
    ]
    return [{"name": n, "city": c, "address": f"{c}", "rating": r, "reviews": rv,
             "phone": ph, "website": w, "maps_url": "https://maps.google.com/?q=" + n}
            for n, c, r, rv, ph, w in base]


def main() -> None:
    p = argparse.ArgumentParser(description="Find & rank Israeli aesthetic-clinic leads.")
    p.add_argument("--cities", default="תל אביב,רמת גן,הרצליה", help="Comma-separated cities (Hebrew).")
    p.add_argument("--queries", default=None, help="Comma-separated search terms (defaults to aesthetic set).")
    p.add_argument("--limit", type=int, default=60, help="Max leads to collect.")
    p.add_argument("--demo", action="store_true", help="Emit a sample list (no key, no installs).")
    p.add_argument("--out", default=None, help="Output path prefix (default .tmp/clinic_leads).")
    args = p.parse_args()

    if args.demo:
        leads = demo_leads()
    else:
        key = _env("GOOGLE_PLACES_API_KEY")
        if not key:
            sys.exit("Missing GOOGLE_PLACES_API_KEY (add to .env). "
                     "Or run a sample:  python tools/find_clinics.py --demo")
        cities = [c.strip() for c in args.cities.split(",") if c.strip()]
        queries = ([q.strip() for q in args.queries.split(",")] if args.queries else DEFAULT_QUERIES)
        print(f"Searching {len(queries)} queries × {len(cities)} cities (limit {args.limit})…")
        leads = fetch_google_places(queries, cities, key, args.limit)

    for ld in leads:
        ld["score"] = score_lead(ld)
    leads.sort(key=lambda x: x["score"], reverse=True)

    TMP.mkdir(exist_ok=True)
    prefix = Path(args.out) if args.out else TMP / "clinic_leads"
    json_path = prefix.with_suffix(".json")
    csv_path = prefix.with_suffix(".csv")
    json_path.write_text(json.dumps(leads, ensure_ascii=False, indent=2), encoding="utf-8")
    cols = ["score", "name", "city", "phone", "website", "rating", "reviews", "maps_url"]
    with csv_path.open("w", newline="", encoding="utf-8-sig") as f:
        w = csv.DictWriter(f, fieldnames=cols, extrasaction="ignore")
        w.writeheader()
        w.writerows(leads)

    hot = sum(1 for ld in leads if ld["score"] >= 60)
    print(f"\n✓ {len(leads)} leads | {hot} hot (score ≥ 60)")
    print(f"  CSV:  {csv_path}")
    print(f"  JSON: {json_path}\nTop 5:")
    for ld in leads[:5]:
        print(f"  [{ld['score']:>3}] {ld['name']} · {ld['city']} · {ld.get('phone') or '—'}")


if __name__ == "__main__":
    main()
