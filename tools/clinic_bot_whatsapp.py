"""Production WhatsApp connector for the clinic AI assistant (GreenAPI).

Turns the demo bot (clinic_bot.py) into a live WhatsApp agent: receives incoming
messages via a GreenAPI webhook, runs them through Claude with the clinic's system
prompt, and replies on WhatsApp — keeping short per-chat memory.

Why GreenAPI: fastest path to a working WhatsApp number in Israel. For paying
clients prefer the official WhatsApp Cloud API / 360dialog to avoid ban risk —
the handler logic below is identical; only send_message() changes.

Setup (live):
    pip install flask requests anthropic
    # in .env:
    ANTHROPIC_API_KEY=...
    GREENAPI_ID_INSTANCE=...
    GREENAPI_API_TOKEN=...
    python tools/clinic_bot_whatsapp.py --config tools/clinic_bot_config.example.json
    # then point your GreenAPI instance webhook at http://<host>:8080/webhook

Validate without network (assembles prompt + simulates a webhook turn offline):
    python tools/clinic_bot_whatsapp.py --selftest
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
from clinic_bot import build_system_prompt, load_config, DemoResponder, MODEL  # reuse the core

# Short in-memory history per WhatsApp chat id. Swap for Redis/DB in production.
SESSIONS: dict[str, list[dict]] = {}
MAX_TURNS = 12


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


def generate_reply(system: str, chat_id: str, text: str) -> str:
    """Run one turn through Claude, keeping per-chat memory."""
    import anthropic
    history = SESSIONS.setdefault(chat_id, [])
    history.append({"role": "user", "content": text})
    history[:] = history[-MAX_TURNS:]
    client = anthropic.Anthropic(api_key=_env("ANTHROPIC_API_KEY"))
    resp = client.messages.create(model=MODEL, max_tokens=400, system=system, messages=history)
    out = "".join(b.text for b in resp.content if b.type == "text")
    history.append({"role": "assistant", "content": out})
    return out


def send_whatsapp(chat_id: str, text: str) -> None:
    """Send a WhatsApp message via GreenAPI."""
    import requests
    inst, token = _env("GREENAPI_ID_INSTANCE"), _env("GREENAPI_API_TOKEN")
    url = f"https://api.green-api.com/waInstance{inst}/sendMessage/{token}"
    requests.post(url, json={"chatId": chat_id, "message": text}, timeout=20)


def parse_incoming(payload: dict) -> tuple[str, str] | None:
    """Extract (chat_id, text) from a GreenAPI incoming-message webhook."""
    if payload.get("typeWebhook") != "incomingMessageReceived":
        return None
    data = payload.get("messageData", {})
    text = (data.get("textMessageData", {}).get("textMessage")
            or data.get("extendedTextMessageData", {}).get("text"))
    chat_id = payload.get("senderData", {}).get("chatId")
    if not text or not chat_id:
        return None
    return chat_id, text


def make_app(system: str):
    from flask import Flask, request
    app = Flask(__name__)

    @app.post("/webhook")
    def webhook():
        parsed = parse_incoming(request.get_json(force=True, silent=True) or {})
        if not parsed:
            return {"ok": True, "skipped": True}
        chat_id, text = parsed
        reply = generate_reply(system, chat_id, text)
        send_whatsapp(chat_id, reply)
        return {"ok": True}

    @app.get("/health")
    def health():
        return {"ok": True}

    return app


def selftest(cfg: dict) -> None:
    """Offline validation: assemble prompt + simulate a webhook turn with the demo responder."""
    system = build_system_prompt(cfg)
    assert "{{" not in system, "Unfilled placeholder in system prompt!"
    print(f"✓ system prompt assembled ({len(system)} chars), no unfilled placeholders")

    sample = {
        "typeWebhook": "incomingMessageReceived",
        "senderData": {"chatId": "972501234567@c.us"},
        "messageData": {"typeMessage": "textMessage",
                        "textMessageData": {"textMessage": "היי כמה עולה הסרת שיער בלייזר?"}},
    }
    parsed = parse_incoming(sample)
    assert parsed, "Failed to parse a valid GreenAPI payload!"
    chat_id, text = parsed
    print(f"✓ webhook parsed → chat={chat_id} text={text!r}")
    # Use the offline responder so selftest needs no API key/network.
    reply = DemoResponder(cfg).reply(text)
    print(f"✓ would reply (offline sim): {reply}")
    print("\nSelftest passed. For live: set keys in .env and run without --selftest.")


def main() -> None:
    p = argparse.ArgumentParser(description="WhatsApp connector for the clinic AI assistant.")
    p.add_argument("--config", default=str(HERE / "clinic_bot_config.example.json"))
    p.add_argument("--port", type=int, default=8080)
    p.add_argument("--selftest", action="store_true", help="Offline validation, no network.")
    args = p.parse_args()

    cfg = load_config(Path(args.config))
    if args.selftest:
        selftest(cfg)
        return

    for k in ("ANTHROPIC_API_KEY", "GREENAPI_ID_INSTANCE", "GREENAPI_API_TOKEN"):
        if not _env(k):
            sys.exit(f"Missing {k} in .env. Run --selftest to validate offline first.")
    system = build_system_prompt(cfg)
    app = make_app(system)
    print(f"WhatsApp connector live on :{args.port}/webhook  ({cfg.get('clinic_name')})")
    app.run(host="0.0.0.0", port=args.port)


if __name__ == "__main__":
    main()
