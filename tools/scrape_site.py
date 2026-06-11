"""Fetch a single web page and extract clean, readable text for competitor research.

Uses requests + BeautifulSoup to pull the title, meta description, headings, the
main visible text (nav/script/style/footer stripped), and any pricing-looking
lines. Saves a JSON snapshot under data/snapshots/<date>/<domain>.json and prints
the path so the agent can chain steps.

If FIRECRAWL_API_KEY is set in .env, JS-heavy pages can be fetched via Firecrawl;
otherwise it falls back to a plain requests GET. Either way the output shape is
identical.

Run standalone:
    python tools/scrape_site.py --url https://example.com/pricing
    python tools/scrape_site.py --url https://example.com --out .tmp/example.json
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from datetime import date
from pathlib import Path
from urllib.parse import urlparse

import requests
from bs4 import BeautifulSoup

from config import ROOT, get_env

USER_AGENT = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/124.0 Safari/537.36"
)
TIMEOUT = 25
PRICE_RE = re.compile(r"(\$\s?\d[\d,]*(\.\d+)?|\b\d+\s?(?:/mo|per month|/month|/year|/user)\b)", re.I)


def _domain(url: str) -> str:
    netloc = urlparse(url).netloc or "page"
    return netloc.replace("www.", "").replace(":", "_")


def _snapshot_path(url: str, out: str | None) -> Path:
    if out:
        p = Path(out)
        return p if p.is_absolute() else ROOT / p
    day = date.today().isoformat()
    folder = ROOT / "data" / "snapshots" / day
    folder.mkdir(parents=True, exist_ok=True)
    return folder / f"{_domain(url)}.json"


def _fetch_firecrawl(url: str, api_key: str) -> str | None:
    """Return rendered HTML/markdown via Firecrawl, or None on failure (caller falls back)."""
    try:
        resp = requests.post(
            "https://api.firecrawl.dev/v1/scrape",
            headers={"Authorization": f"Bearer {api_key}"},
            json={"url": url, "formats": ["html"]},
            timeout=TIMEOUT,
        )
        resp.raise_for_status()
        return resp.json().get("data", {}).get("html")
    except Exception:
        return None


def _fetch_requests(url: str) -> str:
    resp = requests.get(url, headers={"User-Agent": USER_AGENT}, timeout=TIMEOUT)
    resp.raise_for_status()
    return resp.text


def parse_html(html: str) -> dict:
    soup = BeautifulSoup(html, "html.parser")

    for tag in soup(["script", "style", "noscript", "svg", "iframe"]):
        tag.decompose()

    title = soup.title.get_text(strip=True) if soup.title else ""
    desc_tag = soup.find("meta", attrs={"name": "description"}) or soup.find(
        "meta", attrs={"property": "og:description"}
    )
    description = desc_tag["content"].strip() if desc_tag and desc_tag.get("content") else ""

    headings = [
        h.get_text(" ", strip=True)
        for h in soup.find_all(["h1", "h2", "h3"])
        if h.get_text(strip=True)
    ]

    text = soup.get_text("\n", strip=True)
    lines = [ln.strip() for ln in text.splitlines() if ln.strip()]
    # Collapse to a reasonable size for the agent to read.
    clean_text = "\n".join(lines)[:20000]

    price_lines = sorted({ln for ln in lines if PRICE_RE.search(ln)})[:40]

    return {
        "title": title,
        "description": description,
        "headings": headings[:50],
        "pricing_signals": price_lines,
        "text": clean_text,
    }


def main(url: str, out: str | None) -> dict:
    if not url.startswith(("http://", "https://")):
        url = "https://" + url

    firecrawl_key = get_env("FIRECRAWL_API_KEY", required=False)
    html = None
    source = "requests"
    if firecrawl_key:
        html = _fetch_firecrawl(url, firecrawl_key)
        if html:
            source = "firecrawl"
    if html is None:
        html = _fetch_requests(url)

    parsed = parse_html(html)
    record = {
        "status": "ok",
        "url": url,
        "domain": _domain(url),
        "fetched_at": date.today().isoformat(),
        "source": source,
        **parsed,
    }

    path = _snapshot_path(url, out)
    path.write_text(json.dumps(record, indent=2, ensure_ascii=False))
    record["snapshot_path"] = str(path.relative_to(ROOT))
    return record


if __name__ == "__main__":
    p = argparse.ArgumentParser(description="Scrape a single page into a JSON snapshot.")
    p.add_argument("--url", required=True, help="Page URL to fetch.")
    p.add_argument("--out", default=None, help="Optional output JSON path.")
    args = p.parse_args()
    try:
        result = main(args.url, args.out)
        # Print a compact summary (not the full text blob) for the agent.
        summary = {k: v for k, v in result.items() if k != "text"}
        summary["text_chars"] = len(result.get("text", ""))
        print(json.dumps(summary, indent=2, ensure_ascii=False))
    except Exception as exc:
        print(json.dumps({"status": "error", "url": args.url, "error": str(exc)}), file=sys.stderr)
        sys.exit(1)
