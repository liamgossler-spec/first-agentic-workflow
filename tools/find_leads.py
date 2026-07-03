"""Find local businesses ("leads") for a niche in a city using free OpenStreetMap APIs.

No API key needed. Geocodes the city with Nominatim, then queries the Overpass API
for businesses matching the niche inside the city's bounding box. Extracts name,
address, phone, website, and email (when tagged), dedupes, and writes a raw leads
JSON that enrich_leads.py consumes.

Run standalone:
    python tools/find_leads.py --niche dentist --city "Tel Aviv" --limit 100
    python tools/find_leads.py --niche restaurant --city "Miami" --out .tmp/leads/miami.json

Niches map to OSM tags (see NICHE_TAGS). Pass a raw OSM tag directly with
--osm-tag 'amenity=dentist' for anything not in the map.

Rate-limit etiquette: Nominatim allows 1 req/sec and requires a descriptive
User-Agent; Overpass is queried once per run. Both are respected here.
"""
from __future__ import annotations

import argparse
import json
import re
import sys
import time
from datetime import date
from pathlib import Path

import requests

from config import ROOT

USER_AGENT = "WAT-lead-finder/1.0 (small-business lead research)"
NOMINATIM_URL = "https://nominatim.openstreetmap.org/search"
# Multiple Overpass mirrors — the public main instance rate-limits under load.
OVERPASS_URLS = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
]
TIMEOUT = 60

# Friendly niche name -> OSM tag(s). Multiple tags are OR'ed in the query.
NICHE_TAGS: dict[str, list[str]] = {
    "dentist": ["amenity=dentist"],
    "doctor": ["amenity=doctors"],
    "clinic": ["amenity=clinic"],
    "veterinary": ["amenity=veterinary"],
    "pharmacy": ["amenity=pharmacy"],
    "restaurant": ["amenity=restaurant"],
    "cafe": ["amenity=cafe"],
    "bar": ["amenity=bar"],
    "bakery": ["shop=bakery"],
    "gym": ["leisure=fitness_centre"],
    "hairdresser": ["shop=hairdresser"],
    "beauty": ["shop=beauty"],
    "lawyer": ["office=lawyer"],
    "accountant": ["office=accountant"],
    "real_estate": ["office=estate_agent"],
    "insurance": ["office=insurance"],
    "architect": ["office=architect"],
    "plumber": ["craft=plumber"],
    "electrician": ["craft=electrician"],
    "carpenter": ["craft=carpenter"],
    "car_repair": ["shop=car_repair"],
    "car_dealer": ["shop=car"],
    "hotel": ["tourism=hotel"],
    "florist": ["shop=florist"],
    "optician": ["shop=optician"],
    "jewelry": ["shop=jewelry"],
    "pet": ["shop=pet"],
    "tattoo": ["shop=tattoo"],
    "travel_agency": ["shop=travel_agency"],
    "driving_school": ["amenity=driving_school"],
    "kindergarten": ["amenity=kindergarten"],
}

PHONE_KEYS = ("phone", "contact:phone", "contact:mobile")
WEBSITE_KEYS = ("website", "contact:website", "url")
EMAIL_KEYS = ("email", "contact:email")


def geocode_city(city: str) -> dict:
    """Return {'display_name', 'bbox': (south, west, north, east)} for a city."""
    resp = requests.get(
        NOMINATIM_URL,
        params={"q": city, "format": "json", "limit": 1},
        headers={"User-Agent": USER_AGENT},
        timeout=TIMEOUT,
    )
    resp.raise_for_status()
    results = resp.json()
    if not results:
        raise RuntimeError(f"Nominatim found no match for city: {city!r}")
    hit = results[0]
    south, north, west, east = (float(x) for x in hit["boundingbox"])
    return {"display_name": hit["display_name"], "bbox": (south, west, north, east)}


def build_query(tags: list[str], bbox: tuple[float, float, float, float]) -> str:
    s, w, n, e = bbox
    clauses = []
    for tag in tags:
        key, value = tag.split("=", 1)
        for kind in ("node", "way"):
            clauses.append(f'{kind}["{key}"="{value}"]({s},{w},{n},{e});')
    body = "".join(clauses)
    return f"[out:json][timeout:{TIMEOUT}];({body});out center tags;"


def run_overpass(query: str) -> list[dict]:
    last_err: Exception | None = None
    for url in OVERPASS_URLS:
        try:
            resp = requests.post(
                url, data={"data": query},
                headers={"User-Agent": USER_AGENT}, timeout=TIMEOUT,
            )
            if resp.status_code == 429:
                time.sleep(5)  # brief backoff, then try the next mirror
                raise RuntimeError("rate limited (429)")
            resp.raise_for_status()
            return resp.json().get("elements", [])
        except Exception as exc:  # try next mirror
            last_err = exc
    raise RuntimeError(f"All Overpass mirrors failed. Last error: {last_err}")


def _first(tags: dict, keys: tuple[str, ...]) -> str:
    for k in keys:
        if tags.get(k):
            return tags[k].strip()
    return ""


def _address(tags: dict) -> str:
    parts = [
        " ".join(x for x in (tags.get("addr:street", ""), tags.get("addr:housenumber", "")) if x),
        tags.get("addr:city", ""),
        tags.get("addr:postcode", ""),
    ]
    return ", ".join(p for p in parts if p)


def normalize(elements: list[dict], niche: str, city: str) -> list[dict]:
    leads, seen = [], set()
    for el in elements:
        tags = el.get("tags", {})
        name = tags.get("name", "").strip()
        if not name:
            continue
        street = tags.get("addr:street", "").lower()
        key = (re.sub(r"\W+", "", name.lower()), street)
        if key in seen:
            continue
        seen.add(key)
        center = el.get("center") or {"lat": el.get("lat"), "lon": el.get("lon")}
        leads.append({
            "name": name,
            "niche": niche,
            "city": city,
            "address": _address(tags),
            "phone": _first(tags, PHONE_KEYS),
            "website": _first(tags, WEBSITE_KEYS),
            "email": _first(tags, EMAIL_KEYS),
            "opening_hours": tags.get("opening_hours", ""),
            "lat": center.get("lat"),
            "lon": center.get("lon"),
            "osm_id": f"{el.get('type', '?')}/{el.get('id', '?')}",
        })
    # Contactable leads first: website+phone, then phone, then the rest.
    leads.sort(key=lambda x: (bool(x["website"]), bool(x["phone"]), bool(x["email"])), reverse=True)
    return leads


def default_out(niche: str, city: str) -> Path:
    slug = re.sub(r"\W+", "_", f"{niche}_{city}".lower()).strip("_")
    folder = ROOT / ".tmp" / "leads" / f"{date.today().isoformat()}_{slug}"
    folder.mkdir(parents=True, exist_ok=True)
    return folder / "leads_raw.json"


def main(niche: str, city: str, osm_tag: str | None, limit: int, out: str | None) -> dict:
    tags = [osm_tag] if osm_tag else NICHE_TAGS.get(niche.lower().replace(" ", "_"))
    if not tags:
        known = ", ".join(sorted(NICHE_TAGS))
        raise RuntimeError(f"Unknown niche {niche!r}. Known: {known}. Or pass --osm-tag key=value.")

    geo = geocode_city(city)
    time.sleep(1)  # Nominatim etiquette: max 1 req/sec before hitting Overpass
    elements = run_overpass(build_query(tags, geo["bbox"]))
    leads = normalize(elements, niche, city)[:limit]

    path = Path(out) if out else default_out(niche, city)
    if not path.is_absolute():
        path = ROOT / path
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps({
        "niche": niche, "city": city, "resolved_area": geo["display_name"],
        "fetched_at": date.today().isoformat(), "count": len(leads), "leads": leads,
    }, indent=2, ensure_ascii=False))

    return {
        "status": "ok", "count": len(leads),
        "with_website": sum(1 for l in leads if l["website"]),
        "with_phone": sum(1 for l in leads if l["phone"]),
        "with_email": sum(1 for l in leads if l["email"]),
        "out": str(path.relative_to(ROOT) if path.is_relative_to(ROOT) else path),
    }


if __name__ == "__main__":
    p = argparse.ArgumentParser(description="Find local business leads via OpenStreetMap.")
    p.add_argument("--niche", required=True, help="Business type, e.g. dentist, restaurant, lawyer.")
    p.add_argument("--city", required=True, help='City or area, e.g. "Tel Aviv", "Austin, TX".')
    p.add_argument("--osm-tag", default=None, help="Raw OSM tag key=value overriding the niche map.")
    p.add_argument("--limit", type=int, default=200, help="Max leads to keep (default 200).")
    p.add_argument("--out", default=None, help="Output JSON path (default .tmp/leads/<date>_<slug>/leads_raw.json).")
    args = p.parse_args()
    try:
        print(json.dumps(main(args.niche, args.city, args.osm_tag, args.limit, args.out), indent=2))
    except Exception as exc:
        print(json.dumps({"status": "error", "error": str(exc)}), file=sys.stderr)
        sys.exit(1)
