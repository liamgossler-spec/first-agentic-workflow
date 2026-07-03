"""Find local-business prospects in Israel via the Google Places API (New).

Runs Hebrew text searches (e.g. "קוסמטיקאית בתל אביב") across a list of queries
and cities, dedupes by place id, and writes a prospect list with phone, WhatsApp
link, website, rating and address. Output goes to .tmp/ as CSV (utf-8-sig so
Excel/Sheets render Hebrew correctly) plus a JSON snapshot for chaining.

Requires GOOGLE_PLACES_API_KEY in .env ("Places API (New)" must be enabled on
the Google Cloud project). Phone/website fields bill under the Enterprise SKU —
1,000 free requests/month, each returning up to 20 businesses, so a full run
(~25-75 requests) is free at this scale.

Run standalone:
    python tools/find_prospects.py --niche beauty
    python tools/find_prospects.py --niche beauty --cities "חיפה,קריות" --max-pages 2
    python tools/find_prospects.py --queries "מרפאת שיניים,אורתודנט" --cities "תל אביב"
"""
from __future__ import annotations

import argparse
import csv
import json
import re
import sys
import time
from datetime import date

import requests

from config import get_env, tmp_path

SEARCH_URL = "https://places.googleapis.com/v1/places:searchText"
TIMEOUT = 25
PAGE_SIZE = 20  # API maximum per request.

FIELD_MASK = ",".join(
    [
        "places.id",
        "places.displayName",
        "places.nationalPhoneNumber",
        "places.internationalPhoneNumber",
        "places.websiteUri",
        "places.formattedAddress",
        "places.rating",
        "places.userRatingCount",
        "places.googleMapsUri",
        "places.businessStatus",
        "nextPageToken",
    ]
)

# Ready-made query packs per niche. Extend as new niches are targeted.
NICHES = {
    "beauty": [
        "קוסמטיקאית",
        "קליניקת אסתטיקה",
        "מכון יופי",
        "טיפולי פנים",
        "הסרת שיער בלייזר",
    ],
    "dental": ["מרפאת שיניים", "אורתודנט"],
    "fitness": ["סטודיו כושר", "מאמן כושר אישי", "סטודיו פילאטיס"],
}

DEFAULT_CITIES = ["תל אביב", "רמת גן", "גבעתיים", "הרצליה", "ראשון לציון"]


def _whatsapp_link(national_phone: str) -> str:
    """Return a wa.me link for Israeli mobile numbers (05X...), else ""."""
    digits = re.sub(r"\D", "", national_phone or "")
    if digits.startswith("05") and len(digits) == 10:
        return f"https://wa.me/972{digits[1:]}"
    return ""


def _search_page(api_key: str, query: str, page_token: str | None) -> dict:
    body: dict = {"textQuery": query, "languageCode": "he", "regionCode": "IL", "pageSize": PAGE_SIZE}
    if page_token:
        body["pageToken"] = page_token

    for attempt, delay in enumerate((0, 2, 4, 8)):
        if delay:
            time.sleep(delay)
        resp = requests.post(
            SEARCH_URL,
            headers={
                "Content-Type": "application/json",
                "X-Goog-Api-Key": api_key,
                "X-Goog-FieldMask": FIELD_MASK,
            },
            json=body,
            timeout=TIMEOUT,
        )
        if resp.status_code in (429, 500, 502, 503) and attempt < 3:
            continue
        if not resp.ok:
            raise RuntimeError(f"Places API {resp.status_code} for '{query}': {resp.text[:300]}")
        return resp.json()
    raise RuntimeError(f"Places API kept failing for '{query}' after retries.")


def search_query(api_key: str, query: str, max_pages: int) -> list[dict]:
    """All places for one text query, following pagination up to max_pages."""
    places, token = [], None
    for _ in range(max_pages):
        data = _search_page(api_key, query, token)
        places.extend(data.get("places", []))
        token = data.get("nextPageToken")
        if not token:
            break
    return places


def main(queries: list[str], cities: list[str], max_pages: int) -> dict:
    api_key = get_env("GOOGLE_PLACES_API_KEY")

    prospects: dict[str, dict] = {}  # place id -> row, first query wins
    per_search: dict[str, int] = {}
    for city in cities:
        for query in queries:
            text = f"{query} ב{city}"
            found = search_query(api_key, text, max_pages)
            per_search[text] = len(found)
            for p in found:
                pid = p.get("id")
                if not pid or pid in prospects:
                    continue
                if p.get("businessStatus") not in (None, "OPERATIONAL"):
                    continue
                phone = p.get("nationalPhoneNumber", "")
                prospects[pid] = {
                    "name": p.get("displayName", {}).get("text", ""),
                    "query": query,
                    "city": city,
                    "phone": phone or p.get("internationalPhoneNumber", ""),
                    "whatsapp": _whatsapp_link(phone),
                    "website": p.get("websiteUri", ""),
                    "rating": p.get("rating", ""),
                    "reviews": p.get("userRatingCount", 0),
                    "address": p.get("formattedAddress", ""),
                    "maps_url": p.get("googleMapsUri", ""),
                }

    rows = sorted(prospects.values(), key=lambda r: r["reviews"] or 0, reverse=True)

    day = date.today().isoformat()
    csv_file = tmp_path(f"prospects_{day}.csv")
    with csv_file.open("w", newline="", encoding="utf-8-sig") as f:
        writer = csv.DictWriter(f, fieldnames=list(rows[0].keys()) if rows else ["name"])
        writer.writeheader()
        writer.writerows(rows)

    json_file = tmp_path(f"prospects_{day}.json")
    json_file.write_text(json.dumps(rows, indent=2, ensure_ascii=False))

    return {
        "status": "ok",
        "total_unique": len(rows),
        "with_phone": sum(1 for r in rows if r["phone"]),
        "with_whatsapp": sum(1 for r in rows if r["whatsapp"]),
        "with_website": sum(1 for r in rows if r["website"]),
        "per_search": per_search,
        "csv": str(csv_file),
        "json": str(json_file),
    }


if __name__ == "__main__":
    p = argparse.ArgumentParser(description="Build a prospect list from Google Places (Israel).")
    p.add_argument("--niche", choices=sorted(NICHES), default=None, help="Ready-made query pack.")
    p.add_argument("--queries", default=None, help="Comma-separated Hebrew queries (overrides --niche).")
    p.add_argument("--cities", default=",".join(DEFAULT_CITIES), help="Comma-separated cities.")
    p.add_argument("--max-pages", type=int, default=3, help="Pages per search (20 results each).")
    args = p.parse_args()

    if not args.queries and not args.niche:
        p.error("Pass --niche or --queries.")
    query_list = (
        [q.strip() for q in args.queries.split(",") if q.strip()]
        if args.queries
        else NICHES[args.niche]
    )
    city_list = [c.strip() for c in args.cities.split(",") if c.strip()]

    try:
        print(json.dumps(main(query_list, city_list, args.max_pages), indent=2, ensure_ascii=False))
    except Exception as exc:
        print(json.dumps({"status": "error", "error": str(exc)}, ensure_ascii=False), file=sys.stderr)
        sys.exit(1)
