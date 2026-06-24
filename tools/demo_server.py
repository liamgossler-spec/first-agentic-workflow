"""Optional backend for the ZYNX interactive landing page.

The landing page (clinic-ai-business/site/index.html) works fully on its own with
an in-browser demo. Run THIS server and set `ZYNX_API` in the page to upgrade the
demo to **real Claude AI**, and to capture leads server-side.

Endpoints:
  GET  /              → serves the landing page
  POST /chat  {message[, history]} → {reply}   (Claude, using the clinic system prompt)
  POST /lead  {name,clinic,city,phone}         → appends to .tmp/zynx_leads.csv
  GET  /health        → {ok:true}

Run (live):
  pip install flask anthropic
  # .env: ANTHROPIC_API_KEY=...
  python tools/demo_server.py --config tools/clinic_bot_config.example.json
  # then in site/index.html set:  const ZYNX_API = "http://localhost:8090";

Validate offline (no flask/network needed):
  python tools/demo_server.py --selftest

Deploy: any host that runs Python (Render/Railway/Fly free tier). Point ZYNX_API at it.
"""
from __future__ import annotations

import argparse
import csv
import json
import os
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
from clinic_bot import build_system_prompt, load_config, DemoResponder, MODEL  # reuse core

SITE = HERE.parent / "clinic-ai-business" / "site" / "index.html"
LEADS = HERE.parent / ".tmp" / "zynx_leads.csv"


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


def claude_reply(system: str, message: str, history: list[dict] | None) -> str:
    import anthropic
    msgs = list(history or [])
    msgs.append({"role": "user", "content": message})
    client = anthropic.Anthropic(api_key=_env("ANTHROPIC_API_KEY"))
    resp = client.messages.create(model=MODEL, max_tokens=400, system=system, messages=msgs)
    return "".join(b.text for b in resp.content if b.type == "text")


def save_lead(d: dict) -> None:
    LEADS.parent.mkdir(exist_ok=True)
    new = not LEADS.exists()
    with LEADS.open("a", newline="", encoding="utf-8-sig") as f:
        w = csv.DictWriter(f, fieldnames=["name", "clinic", "city", "phone"], extrasaction="ignore")
        if new:
            w.writeheader()
        w.writerow(d)


def make_app(cfg: dict):
    from flask import Flask, request, Response
    system = build_system_prompt(cfg)
    app = Flask(__name__)

    @app.after_request
    def cors(r):  # allow the static page (any origin) to call this API
        r.headers["Access-Control-Allow-Origin"] = "*"
        r.headers["Access-Control-Allow-Headers"] = "Content-Type"
        r.headers["Access-Control-Allow-Methods"] = "POST, GET, OPTIONS"
        return r

    @app.get("/")
    def home():
        return Response(SITE.read_text(encoding="utf-8"), mimetype="text/html")

    @app.get("/health")
    def health():
        return {"ok": True}

    @app.post("/chat")
    def chat():
        data = request.get_json(force=True, silent=True) or {}
        msg = (data.get("message") or "").strip()
        if not msg:
            return {"reply": ""}
        try:
            reply = claude_reply(system, msg, data.get("history"))
        except Exception as e:  # fail soft so the demo never breaks
            print(f"chat error: {e}", file=sys.stderr)
            reply = DemoResponder(cfg).reply(msg)
        return {"reply": reply}

    @app.post("/lead")
    def lead():
        d = request.get_json(force=True, silent=True) or {}
        if d.get("name") and d.get("phone"):
            save_lead(d)
            print(f"LEAD: {d.get('name')} · {d.get('clinic')} · {d.get('phone')}")
        return {"ok": True}

    return app


def selftest(cfg: dict) -> None:
    system = build_system_prompt(cfg)
    assert "{{" not in system, "Unfilled placeholder!"
    print(f"✓ system prompt assembled ({len(system)} chars)")
    assert SITE.exists(), f"Site not found at {SITE}"
    html = SITE.read_text(encoding="utf-8")
    assert "leadForm" in html and "chatBody" in html, "Site missing demo/form hooks"
    assert "__LOGO__" not in html, "Logo placeholder not injected!"
    print(f"✓ landing page present & wired ({len(html)//1024} KB, logo embedded)")
    save_lead({"name": "בדיקה", "clinic": "טסט", "city": "ת\"א", "phone": "050-0000000"})
    rows = list(csv.DictReader(LEADS.open(encoding="utf-8-sig")))
    assert rows and rows[-1]["name"] == "בדיקה", "Lead not saved"
    print(f"✓ lead capture works → {LEADS} ({len(rows)} rows)")
    print(f"✓ offline reply sample: {DemoResponder(cfg).reply('כמה עולה לייזר?')}")
    print("\nSelftest passed. For live AI: set ANTHROPIC_API_KEY, `pip install flask anthropic`, run without --selftest.")


def main() -> None:
    p = argparse.ArgumentParser(description="ZYNX interactive demo backend.")
    p.add_argument("--config", default=str(HERE / "clinic_bot_config.example.json"))
    p.add_argument("--port", type=int, default=8090)
    p.add_argument("--selftest", action="store_true")
    args = p.parse_args()
    cfg = load_config(Path(args.config))
    if args.selftest:
        selftest(cfg)
        return
    if not _env("ANTHROPIC_API_KEY"):
        sys.exit("Missing ANTHROPIC_API_KEY (.env). Run --selftest to validate offline.")
    app = make_app(cfg)
    print(f"ZYNX demo server live on :{args.port}  (set ZYNX_API to this URL in the page)")
    app.run(host="0.0.0.0", port=args.port)


if __name__ == "__main__":
    main()
