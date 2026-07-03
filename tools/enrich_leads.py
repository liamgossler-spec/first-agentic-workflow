"""Enrich raw leads: visit each lead's website, extract contacts, and score them.

Reads the leads JSON produced by find_leads.py. For every lead with a website it
fetches the homepage (and /contact if linked) and extracts:
  - emails (mailto: links + text regex)
  - social profiles (facebook / instagram / linkedin / whatsapp)
  - site quality signals ("hooks") used to personalize outreach:
      no_website, http_only, not_mobile_friendly, no_meta_description,
      stale_copyright, site_unreachable

Each lead gets a priority score (0-100): contactability + hook strength.
Writes leads_enriched.json next to the input file.

Run standalone:
    python tools/enrich_leads.py --in .tmp/leads/<run>/leads_raw.json
    python tools/enrich_leads.py --in leads_raw.json --delay 1.0 --max 50
"""
from __future__ import annotations

import argparse
import json
import re
import sys
import time
from datetime import date
from pathlib import Path
from urllib.parse import urljoin, urlparse

import requests
from bs4 import BeautifulSoup

from config import ROOT

USER_AGENT = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/124.0 Safari/537.36"
)
TIMEOUT = 20
EMAIL_RE = re.compile(r"[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}")
# Image filenames etc. often match the email regex — filter the obvious junk.
EMAIL_JUNK = (".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", "example.com", "sentry", "wixpress")
SOCIAL_HOSTS = {
    "facebook.com": "facebook", "instagram.com": "instagram",
    "linkedin.com": "linkedin", "wa.me": "whatsapp", "api.whatsapp.com": "whatsapp",
}
COPYRIGHT_RE = re.compile(r"(?:©|&copy;|\(c\)|copyright)\s*(\d{4})", re.I)


def fetch(url: str) -> tuple[str, str]:
    """Return (final_url, html). Raises on failure."""
    if not url.startswith(("http://", "https://")):
        url = "https://" + url
    resp = requests.get(url, headers={"User-Agent": USER_AGENT}, timeout=TIMEOUT, allow_redirects=True)
    resp.raise_for_status()
    return resp.url, resp.text


def extract_emails(html: str, soup: BeautifulSoup) -> list[str]:
    found: set[str] = set()
    for a in soup.select('a[href^="mailto:"]'):
        addr = a["href"][7:].split("?")[0].strip()
        if addr:
            found.add(addr.lower())
    for m in EMAIL_RE.findall(html):
        found.add(m.lower())
    return sorted(e for e in found if not any(j in e for j in EMAIL_JUNK))[:5]


def extract_socials(soup: BeautifulSoup) -> dict[str, str]:
    socials: dict[str, str] = {}
    for a in soup.find_all("a", href=True):
        host = urlparse(a["href"]).netloc.lower().replace("www.", "")
        for known, label in SOCIAL_HOSTS.items():
            if host == known or host.endswith("." + known):
                socials.setdefault(label, a["href"])
    return socials


def contact_page_url(base_url: str, soup: BeautifulSoup) -> str | None:
    for a in soup.find_all("a", href=True):
        href = a["href"].lower()
        text = a.get_text(" ", strip=True).lower()
        if any(w in href or w in text for w in ("contact", "צור קשר", "יצירת קשר")):
            full = urljoin(base_url, a["href"])
            if urlparse(full).netloc == urlparse(base_url).netloc:
                return full
    return None


def site_signals(final_url: str, html: str, soup: BeautifulSoup) -> list[str]:
    hooks = []
    if final_url.startswith("http://"):
        hooks.append("http_only")
    if not soup.find("meta", attrs={"name": "viewport"}):
        hooks.append("not_mobile_friendly")
    desc = soup.find("meta", attrs={"name": "description"})
    if not (desc and desc.get("content", "").strip()):
        hooks.append("no_meta_description")
    years = [int(y) for y in COPYRIGHT_RE.findall(html) if 1990 < int(y) <= date.today().year]
    if years and max(years) <= date.today().year - 2:
        hooks.append("stale_copyright")
    return hooks


def score(lead: dict) -> int:
    s = 0
    if lead.get("email") or lead.get("emails"):
        s += 35
    if lead.get("phone"):
        s += 20
    if lead.get("socials", {}).get("whatsapp"):
        s += 10
    hooks = lead.get("hooks", [])
    if "no_website" in hooks or "site_unreachable" in hooks:
        s += 25  # strongest pitch: they need an online presence
    else:
        s += min(len(hooks) * 8, 24)  # each fixable weakness is a conversation opener
    return min(s, 100)


def enrich_one(lead: dict, delay: float) -> dict:
    lead = dict(lead)
    lead["emails"] = [lead["email"]] if lead.get("email") else []
    lead["socials"] = {}
    lead["hooks"] = []

    if not lead.get("website"):
        lead["hooks"].append("no_website")
    else:
        try:
            final_url, html = fetch(lead["website"])
            soup = BeautifulSoup(html, "html.parser")
            lead["site_title"] = soup.title.get_text(strip=True) if soup.title else ""
            lead["emails"] = sorted(set(lead["emails"]) | set(extract_emails(html, soup)))
            lead["socials"] = extract_socials(soup)
            lead["hooks"] = site_signals(final_url, html, soup)

            if not lead["emails"]:
                contact = contact_page_url(final_url, soup)
                if contact:
                    time.sleep(delay)
                    try:
                        _, c_html = fetch(contact)
                        c_soup = BeautifulSoup(c_html, "html.parser")
                        lead["emails"] = extract_emails(c_html, c_soup)
                        lead["socials"] = {**extract_socials(c_soup), **lead["socials"]}
                    except Exception:
                        pass
        except Exception as exc:
            lead["hooks"] = ["site_unreachable"]
            lead["fetch_error"] = str(exc)[:200]

    lead["email"] = lead["emails"][0] if lead["emails"] else lead.get("email", "")
    lead["score"] = score(lead)
    return lead


def main(in_path: str, delay: float, max_leads: int | None) -> dict:
    path = Path(in_path)
    if not path.is_absolute():
        path = ROOT / path
    data = json.loads(path.read_text())
    leads = data["leads"][:max_leads] if max_leads else data["leads"]

    enriched = []
    for i, lead in enumerate(leads):
        enriched.append(enrich_one(lead, delay))
        if lead.get("website") and i < len(leads) - 1:
            time.sleep(delay)  # be polite to small-business servers

    enriched.sort(key=lambda x: x["score"], reverse=True)
    data["leads"] = enriched
    data["enriched_at"] = date.today().isoformat()

    out = path.with_name("leads_enriched.json")
    out.write_text(json.dumps(data, indent=2, ensure_ascii=False))

    return {
        "status": "ok", "count": len(enriched),
        "with_email": sum(1 for l in enriched if l["emails"]),
        "with_hooks": sum(1 for l in enriched if l["hooks"]),
        "avg_score": round(sum(l["score"] for l in enriched) / len(enriched), 1) if enriched else 0,
        "out": str(out.relative_to(ROOT) if out.is_relative_to(ROOT) else out),
    }


if __name__ == "__main__":
    p = argparse.ArgumentParser(description="Enrich and score raw leads by auditing their websites.")
    p.add_argument("--in", dest="in_path", required=True, help="Path to leads_raw.json from find_leads.py.")
    p.add_argument("--delay", type=float, default=1.0, help="Seconds between site fetches (default 1.0).")
    p.add_argument("--max", type=int, default=None, help="Only enrich the first N leads.")
    args = p.parse_args()
    try:
        print(json.dumps(main(args.in_path, args.delay, args.max), indent=2))
    except Exception as exc:
        print(json.dumps({"status": "error", "error": str(exc)}), file=sys.stderr)
        sys.exit(1)
