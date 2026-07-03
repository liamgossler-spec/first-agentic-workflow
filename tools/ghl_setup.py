"""Bootstrap the GHL agency: create the demo-clinic sub-account and configure it.

Implements the API-buildable half of business/ghl_demo_clinic_he.md: creates
the "מיטל — קליניק (דמו)" sub-account (location), then its custom fields, tags,
and booking calendar. Pipelines, funnels, workflows and the Conversation AI bot
are UI-only in the public v2 API and stay a guided manual step.

Each step runs independently and reports ok/error, so a partial failure never
blocks the rest — rerun is safe (existing fields/tags just error politely).
Created ids are saved to .tmp/ghl_state.json for later tools (contact import,
reporting).

Requires GHL_API_TOKEN in .env — an agency-level Private Integration token
(pit-...) with Locations/Contacts/Calendars/Opportunities/Custom Fields/Tags
scopes. GHL_COMPANY_ID is optional; when absent the script discovers it.

Run standalone:
    python tools/ghl_setup.py --dry-run              # print the plan, no API calls
    python tools/ghl_setup.py                        # create sub-account + configure it
    python tools/ghl_setup.py --location-id <id>     # configure an existing sub-account
"""
from __future__ import annotations

import argparse
import json
import sys

import requests

from config import get_env, tmp_path

BASE = "https://services.leadconnectorhq.com"
API_VERSION = "2021-07-28"  # required Version header for the v2 API
TIMEOUT = 25

LOCATION = {
    "name": "מיטל — קליניק (דמו)",
    "timezone": "Asia/Jerusalem",
    "country": "IL",
    "city": "רמת גן",
    "address": "ביאליק 12",
}

CUSTOM_FIELDS = [
    {"name": "מקור ליד", "dataType": "TEXT"},
    {
        "name": "סוג טיפול מבוקש",
        "dataType": "SINGLE_OPTIONS",
        "picklistOptions": ["טיפול פנים", "הסרת שיער בלייזר", "אנטי-אייג'ינג", "אחר"],
    },
    {"name": "תאריך ביקור אחרון", "dataType": "DATE"},
]

TAGS = ["ליד-חדש", "קבעה-תור", "לקוחה-חוזרת", "רדומה"]

CALENDAR = {
    "name": "טיפול פנים — 60 דק'",
    "description": "קביעת תור לטיפול פנים אצל מיטל",
    "calendarType": "event",
    "slotDuration": 60,
    "slotInterval": 15,
    # Sunday-Thursday (0-4 in GHL day numbering), 09:00-19:00.
    "openHours": [
        {
            "daysOfTheWeek": [0, 1, 2, 3, 4],
            "hours": [{"openHour": 9, "openMinute": 0, "closeHour": 19, "closeMinute": 0}],
        }
    ],
}


def _headers(token: str) -> dict:
    return {
        "Authorization": f"Bearer {token}",
        "Version": API_VERSION,
        "Content-Type": "application/json",
        "Accept": "application/json",
    }


def _call(token: str, method: str, path: str, payload: dict | None = None, params: dict | None = None):
    """One API call. Returns (ok, data) — data is parsed JSON or error text."""
    resp = requests.request(
        method,
        f"{BASE}{path}",
        headers=_headers(token),
        json=payload,
        params=params,
        timeout=TIMEOUT,
    )
    try:
        data = resp.json()
    except ValueError:
        data = resp.text[:500]
    return resp.ok, data


def discover_company_id(token: str) -> str:
    """Company (agency) id — from .env if set, else from the first location."""
    company_id = get_env("GHL_COMPANY_ID", required=False)
    if company_id:
        return company_id
    ok, data = _call(token, "GET", "/locations/search", params={"limit": 1})
    if ok:
        locations = data.get("locations") or []
        if locations and locations[0].get("companyId"):
            return locations[0]["companyId"]
    raise RuntimeError(
        "Could not discover the agency companyId automatically "
        f"(response: {json.dumps(data, ensure_ascii=False)[:300]}). "
        "Find it in GHL under Settings -> Company (or Business Profile) and add "
        "GHL_COMPANY_ID=... to .env, then rerun."
    )


def create_location(token: str, company_id: str) -> tuple[bool, str | dict]:
    ok, data = _call(token, "POST", "/locations/", {**LOCATION, "companyId": company_id})
    if ok:
        loc_id = data.get("id") or data.get("location", {}).get("id")
        if loc_id:
            return True, loc_id
    return False, data


def setup_location(token: str, location_id: str) -> dict:
    """Create fields, tags and calendar inside a location. Independent steps."""
    results: dict = {}

    for field in CUSTOM_FIELDS:
        ok, data = _call(
            token, "POST", f"/locations/{location_id}/customFields", {**field, "model": "contact"}
        )
        results[f"field:{field['name']}"] = "ok" if ok else f"error: {json.dumps(data, ensure_ascii=False)[:200]}"

    for tag in TAGS:
        ok, data = _call(token, "POST", f"/locations/{location_id}/tags", {"name": tag})
        results[f"tag:{tag}"] = "ok" if ok else f"error: {json.dumps(data, ensure_ascii=False)[:200]}"

    ok, data = _call(token, "POST", "/calendars/", {**CALENDAR, "locationId": location_id})
    results["calendar"] = "ok" if ok else f"error: {json.dumps(data, ensure_ascii=False)[:300]}"

    return results


def main(dry_run: bool, location_id: str | None) -> dict:
    if dry_run:
        return {
            "status": "dry-run",
            "plan": {
                "location": LOCATION,
                "custom_fields": CUSTOM_FIELDS,
                "tags": TAGS,
                "calendar": CALENDAR,
                "manual_ui_steps": "pipeline, funnel, workflows W1-W5, Conversation AI bot, WhatsApp",
            },
        }

    token = get_env("GHL_API_TOKEN")
    summary: dict = {"status": "ok"}

    if not location_id:
        company_id = discover_company_id(token)
        created, result = create_location(token, company_id)
        if not created:
            raise RuntimeError(f"Location creation failed: {json.dumps(result, ensure_ascii=False)[:400]}")
        location_id = result
        summary["location_created"] = True

    summary["location_id"] = location_id
    summary["steps"] = setup_location(token, location_id)

    state_file = tmp_path("ghl_state.json")
    state_file.write_text(json.dumps(summary, indent=2, ensure_ascii=False))
    summary["state_file"] = str(state_file)
    return summary


if __name__ == "__main__":
    p = argparse.ArgumentParser(description="Create + configure the GHL demo-clinic sub-account.")
    p.add_argument("--dry-run", action="store_true", help="Print the build plan without API calls.")
    p.add_argument("--location-id", default=None, help="Configure an existing sub-account instead of creating one.")
    args = p.parse_args()
    try:
        print(json.dumps(main(args.dry_run, args.location_id), indent=2, ensure_ascii=False))
    except Exception as exc:
        print(json.dumps({"status": "error", "error": str(exc)}, ensure_ascii=False), file=sys.stderr)
        sys.exit(1)
