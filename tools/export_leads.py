"""Export a leads JSON (raw / enriched / outreach) to a client-ready CSV.

Flattens the nested lead records into one row per lead with stable columns, so
the same command works at any pipeline stage. The CSV is the deliverable you
hand to a client (or import into a mail tool / Google Sheets — File > Import).

Writes UTF-8 with BOM so Hebrew text opens correctly in Excel.

Run standalone:
    python tools/export_leads.py --in .tmp/leads/<run>/leads_outreach.json
    python tools/export_leads.py --in leads_enriched.json --out reports/dentists_tlv.csv
"""
from __future__ import annotations

import argparse
import csv
import json
import sys
from datetime import date
from pathlib import Path

from config import ROOT

COLUMNS = [
    "name", "niche", "city", "address", "phone", "email", "website",
    "facebook", "instagram", "linkedin", "whatsapp",
    "score", "hooks", "outreach_subject", "outreach_message", "opening_hours",
]


def flatten(lead: dict) -> dict:
    socials = lead.get("socials", {}) or {}
    outreach = lead.get("outreach", {}) or {}
    return {
        "name": lead.get("name", ""),
        "niche": lead.get("niche", ""),
        "city": lead.get("city", ""),
        "address": lead.get("address", ""),
        "phone": lead.get("phone", ""),
        "email": lead.get("email", "") or ";".join(lead.get("emails", [])),
        "website": lead.get("website", ""),
        "facebook": socials.get("facebook", ""),
        "instagram": socials.get("instagram", ""),
        "linkedin": socials.get("linkedin", ""),
        "whatsapp": socials.get("whatsapp", ""),
        "score": lead.get("score", ""),
        "hooks": ";".join(lead.get("hooks", [])),
        "outreach_subject": outreach.get("subject", ""),
        "outreach_message": outreach.get("message", ""),
        "opening_hours": lead.get("opening_hours", ""),
    }


def main(in_path: str, out: str | None) -> dict:
    path = Path(in_path)
    if not path.is_absolute():
        path = ROOT / path
    data = json.loads(path.read_text())
    leads = data.get("leads", [])

    if out:
        out_path = Path(out)
        if not out_path.is_absolute():
            out_path = ROOT / out_path
    else:
        slug = f"{data.get('niche', 'leads')}_{data.get('city', '')}".lower().replace(" ", "_")
        out_path = ROOT / "reports" / f"leads_{slug}_{date.today().isoformat()}.csv"
    out_path.parent.mkdir(parents=True, exist_ok=True)

    with out_path.open("w", newline="", encoding="utf-8-sig") as fh:
        writer = csv.DictWriter(fh, fieldnames=COLUMNS)
        writer.writeheader()
        for lead in leads:
            writer.writerow(flatten(lead))

    return {
        "status": "ok", "rows": len(leads),
        "with_email": sum(1 for l in leads if l.get("email") or l.get("emails")),
        "with_phone": sum(1 for l in leads if l.get("phone")),
        "out": str(out_path.relative_to(ROOT) if out_path.is_relative_to(ROOT) else out_path),
    }


if __name__ == "__main__":
    p = argparse.ArgumentParser(description="Export leads JSON to a client-ready CSV.")
    p.add_argument("--in", dest="in_path", required=True, help="Path to any leads_*.json from the pipeline.")
    p.add_argument("--out", default=None, help="Output CSV path (default reports/leads_<slug>_<date>.csv).")
    args = p.parse_args()
    try:
        print(json.dumps(main(args.in_path, args.out), indent=2))
    except Exception as exc:
        print(json.dumps({"status": "error", "error": str(exc)}), file=sys.stderr)
        sys.exit(1)
