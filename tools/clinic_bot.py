"""Clinic AI assistant — runnable demo bot for aesthetic clinics (Hebrew).

This is the *product* the agency sells: a WhatsApp/Instagram assistant that
answers leads 24/7, qualifies them, and books appointments — in Hebrew.

Two ways to run it:

  1) OFFLINE DEMO (zero installs, no API key) — great for screen-recording a
     sales demo. Uses a small scripted responder, clearly labeled as a demo.

       python tools/clinic_bot.py --demo                 # interactive, type messages
       python tools/clinic_bot.py --demo --scenario lead_night   # auto-plays a lead

  2) LIVE (real AI) — uses the Claude API. Needs `pip install anthropic` and
     ANTHROPIC_API_KEY in .env (see .env.example).

       python tools/clinic_bot.py                        # interactive, real AI
       python tools/clinic_bot.py --config my_clinic.json

Inspect the assembled system prompt for any clinic config:

       python tools/clinic_bot.py --show-prompt

Per-clinic setup = swap the JSON config (see clinic_bot_config.example.json).
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
DEFAULT_CONFIG = HERE / "clinic_bot_config.example.json"
PROMPT_TEMPLATE = HERE / "clinic_bot_prompt.txt"

# Cheap + fast model for high-volume chat; bump to a Sonnet for tricky clients.
MODEL = "claude-haiku-4-5"


# --------------------------------------------------------------------------- #
# Prompt assembly
# --------------------------------------------------------------------------- #
def load_config(path: Path) -> dict:
    if not path.exists():
        sys.exit(f"Config not found: {path}\nCopy clinic_bot_config.example.json and edit it.")
    return json.loads(path.read_text(encoding="utf-8"))


def build_system_prompt(cfg: dict) -> str:
    template = PROMPT_TEMPLATE.read_text(encoding="utf-8")
    treatments = "\n".join(
        f"- {t['name']}: {t['price']}" for t in cfg.get("treatments", [])
    )
    filled = template
    for key in ("assistant_name", "clinic_name", "city", "owner_name",
                "about", "address", "parking", "hours"):
        filled = filled.replace("{{" + key + "}}", str(cfg.get(key, "")))
    filled = filled.replace("{{treatments_block}}", treatments)
    return filled


# --------------------------------------------------------------------------- #
# Offline scripted responder (demo mode — no AI, no network)
# --------------------------------------------------------------------------- #
class DemoResponder:
    """Tiny stateful Hebrew responder so the conversation flow can be shown
    without an API key. NOT the real AI — for layout/flow demos only."""

    def __init__(self, cfg: dict):
        self.cfg = cfg
        self.stage = "greet"

    def reply(self, msg: str) -> str:
        m = msg.strip()
        name = self.cfg.get("assistant_name", "נועה")
        clinic = self.cfg.get("clinic_name", "הקליניקה")
        owner = self.cfg.get("owner_name", "הבעלים")

        medical = any(w in m for w in ["אקנה", "דלקת", "תרופה", "הריון", "אלרגי", "מחלה", "כואב"])
        price_q = any(w in m for w in ["כמה", "מחיר", "עולה", "עלות", "₪"])
        yes = any(w in m for w in ["כן", "בא לי", "מעוניינת", "רוצה", "בטח", "סבבה"])
        time_pick = any(w in m for w in ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "יום", "מחר", "11", "17", "ה'", "ג'"])

        if medical:
            self.stage = "lead"
            return (f"שאלה מצוינת וחשובה — מגיע לך מענה מדויק ולא כללי 💛 אני מעבירה אותך "
                    f"ל{owner} שתיתן לך המלצה אישית. בינתיים תשאירי לי שם וטלפון ואשמור לך תור ייעוץ?")
        if price_q:
            t = self.cfg.get("treatments", [{}])[0]
            self.stage = "offer"
            return (f"היי! ✨ {t.get('name','הטיפול')} אצלנו {t.get('price','—')}. "
                    f"רוב הבנות לוקחות חבילה כי התוצאה מצטברת. רוצה שאשריין לך ייעוץ קצר וחינמי?")
        if yes and self.stage in ("offer", "greet"):
            self.stage = "schedule"
            return "מהמם 💆‍♀️ יש לי השבוע יום ג' ב-17:00 או יום ה' ב-11:00 — מה נוח לך?"
        if time_pick or self.stage == "schedule":
            self.stage = "collect"
            addr = self.cfg.get("address", "")
            return f"סגור! 🎉 קבעתי לך. אפשר שם מלא וטלפון לאישור? נתראה ב{addr} 🚗"
        if self.stage == "collect":
            self.stage = "done"
            return f"רשמתי, תודה! שלחתי לך אישור בוואטסאפ ✅ נשמח לראות אותך. — {name} מ{clinic}"
        # default greeting / fallback
        self.stage = "offer"
        return (f"היי וברוכה הבאה ל{clinic} 😊 אני {name}, כאן לעזור. "
                f"איזה טיפול מעניין אותך — פנים, לייזר, פילינג או משהו אחר?")


def run_offline(cfg: dict, scenario: str | None) -> None:
    print("\n\033[93m[מצב דמו לא-מקוון — תשובות לדוגמה להמחשת הזרימה, ללא AI אמיתי]\033[0m")
    print(f"\033[90m({cfg.get('clinic_name')} · העוזרת {cfg.get('assistant_name')})\033[0m\n")
    bot = DemoResponder(cfg)

    if scenario:
        scripts = {
            "lead_night": [
                "היי כמה עולה הסרת שיער בלייזר?",
                "כן בא לי",
                "יום ה",
                "דנה כהן 052-1234567",
            ],
            "price_shopper": ["מחירים?", "טיפול פנים", "כן", "יום ג", "רוני לוי 054-7654321"],
            "medical": ["יש לי אקנה דלקתי מה מתאים?", "דניאלה 050-1112233"],
        }
        msgs = scripts.get(scenario)
        if not msgs:
            sys.exit(f"Unknown scenario '{scenario}'. Options: {', '.join(scripts)}")
        for um in msgs:
            print(f"\033[96mלקוחה:\033[0m {um}")
            print(f"\033[92mבוט:\033[0m {bot.reply(um)}\n")
        return

    print("הקלידי הודעה (או 'יציאה' לסיום):\n")
    while True:
        try:
            um = input("\033[96mלקוחה:\033[0m ").strip()
        except (EOFError, KeyboardInterrupt):
            print()
            return
        if um in ("יציאה", "exit", "quit", ""):
            return
        print(f"\033[92mבוט:\033[0m {bot.reply(um)}\n")


# --------------------------------------------------------------------------- #
# Live mode (real Claude API)
# --------------------------------------------------------------------------- #
def _load_env_key() -> str | None:
    key = os.getenv("ANTHROPIC_API_KEY")
    if key:
        return key
    # minimal .env reader so we don't hard-depend on python-dotenv
    env = HERE.parent / ".env"
    if env.exists():
        for line in env.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if line.startswith("ANTHROPIC_API_KEY=") and not line.startswith("#"):
                return line.split("=", 1)[1].strip()
    return None


def run_live(cfg: dict) -> None:
    try:
        import anthropic  # noqa
    except ImportError:
        sys.exit("Live mode needs the SDK:  pip install anthropic\n"
                 "Or run the offline demo:  python tools/clinic_bot.py --demo")
    key = _load_env_key()
    if not key:
        sys.exit("Missing ANTHROPIC_API_KEY (add it to .env — see .env.example).\n"
                 "Or run the offline demo:  python tools/clinic_bot.py --demo")

    client = anthropic.Anthropic(api_key=key)
    system = build_system_prompt(cfg)
    history: list[dict] = []
    print(f"\n\033[90m[מצב חי · {MODEL} · {cfg.get('clinic_name')}]\033[0m")
    print("הקלידי הודעה (או 'יציאה' לסיום):\n")
    while True:
        try:
            um = input("\033[96mלקוחה:\033[0m ").strip()
        except (EOFError, KeyboardInterrupt):
            print()
            return
        if um in ("יציאה", "exit", "quit", ""):
            return
        history.append({"role": "user", "content": um})
        resp = client.messages.create(
            model=MODEL, max_tokens=400, system=system, messages=history,
        )
        text = "".join(b.text for b in resp.content if b.type == "text")
        history.append({"role": "assistant", "content": text})
        print(f"\033[92mבוט:\033[0m {text}\n")


# --------------------------------------------------------------------------- #
def main() -> None:
    p = argparse.ArgumentParser(description="Clinic AI assistant demo bot (Hebrew).")
    p.add_argument("--config", default=str(DEFAULT_CONFIG), help="Path to clinic config JSON.")
    p.add_argument("--demo", action="store_true", help="Offline scripted mode (no AI, no key).")
    p.add_argument("--scenario", help="Auto-play a demo lead: lead_night | price_shopper | medical")
    p.add_argument("--show-prompt", action="store_true", help="Print the assembled system prompt and exit.")
    args = p.parse_args()

    cfg = load_config(Path(args.config))

    if args.show_prompt:
        print(build_system_prompt(cfg))
        return
    if args.demo or args.scenario:
        run_offline(cfg, args.scenario)
        return
    run_live(cfg)


if __name__ == "__main__":
    main()
