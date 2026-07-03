"""Generate a personalized outreach message for every enriched lead.

Deterministic templating: each lead's strongest hook (no website, not mobile
friendly, unreachable site...) picks the opener line, and the lead's name/city
fill the rest. English and Hebrew templates included. The agent can hand-polish
the top-scored messages afterwards — this tool guarantees every lead has a
sane, personalized draft in seconds.

Sender identity comes from flags or .env (SENDER_NAME, SENDER_COMPANY,
SENDER_OFFER) so the pipeline runs unattended.

Run standalone:
    python tools/generate_outreach.py --in .tmp/leads/<run>/leads_enriched.json --lang en
    python tools/generate_outreach.py --in leads_enriched.json --lang he \
        --sender-name "Liam" --sender-company "Get Leads with AI" \
        --offer "AI-powered lead generation and outreach"
"""
from __future__ import annotations

import argparse
import json
import sys
from datetime import date
from pathlib import Path

from config import ROOT, get_env

# Openers keyed by hook, ordered by pitch strength. {name}/{city} are filled per lead.
OPENERS = {
    "en": {
        "no_website": "I was looking for {niche} services in {city} and noticed {name} doesn't have a website yet — you're likely losing customers who search online first.",
        "site_unreachable": "I tried visiting {name}'s website today and it wouldn't load — that's lost business every day it stays down.",
        "not_mobile_friendly": "I checked out {name}'s website on my phone and it doesn't adapt to mobile — most local customers search from their phones.",
        "http_only": "I noticed {name}'s website still runs on http (no security padlock) — browsers flag that as 'Not Secure', which scares customers off.",
        "stale_copyright": "I visited {name}'s website and noticed it hasn't been refreshed in a while — an outdated site quietly costs you trust and customers.",
        "no_meta_description": "I noticed {name} doesn't show a proper description in Google results — that's an easy fix that gets more people clicking.",
        "_default": "I came across {name} while researching the best {niche} businesses in {city}.",
    },
    "he": {
        "no_website": "חיפשתי שירותי {niche} ב{city} ושמתי לב של{name} אין עדיין אתר — כנראה הולכים לכם לאיבוד לקוחות שמחפשים קודם בגוגל.",
        "site_unreachable": "ניסיתי להיכנס היום לאתר של {name} והוא לא נטען — כל יום שהוא למטה זה לקוחות שהולכים למתחרים.",
        "not_mobile_friendly": "נכנסתי לאתר של {name} מהטלפון והוא לא מותאם למובייל — רוב הלקוחות המקומיים מחפשים מהנייד.",
        "http_only": "שמתי לב שהאתר של {name} עדיין רץ על http בלי מנעול אבטחה — הדפדפן מסמן אותו כ'לא מאובטח' וזה מבריח לקוחות.",
        "stale_copyright": "ביקרתי באתר של {name} ושמתי לב שהוא לא רוענן כבר תקופה — אתר מיושן עולה לכם באמון ובלקוחות.",
        "no_meta_description": "שמתי לב ש{name} לא מציג תיאור מסודר בתוצאות גוגל — תיקון קל שמביא יותר קליקים.",
        "_default": "נתקלתי ב{name} כשחקרתי את עסקי ה{niche} המובילים ב{city}.",
    },
}

BODY = {
    "en": (
        "{opener}\n\n"
        "I'm {sender_name} from {sender_company}. We help local businesses with {offer} — "
        "done for you, no learning curve.\n\n"
        "Would you be open to a quick 10-minute call this week? "
        "If I can't show you clear value in those 10 minutes, I won't follow up again.\n\n"
        "Best,\n{sender_name}\n{sender_company}"
    ),
    "he": (
        "{opener}\n\n"
        "אני {sender_name} מ{sender_company}. אנחנו עוזרים לעסקים מקומיים עם {offer} — "
        "הכל נעשה בשבילכם, בלי כאב ראש.\n\n"
        "יש לכם 10 דקות לשיחה קצרה השבוע? "
        "אם לא אראה לכם ערך ברור ב־10 הדקות האלה, לא אחזור לפנות שוב.\n\n"
        "בהצלחה,\n{sender_name}\n{sender_company}"
    ),
}

SUBJECT = {
    "en": {
        "no_website": "Quick question about {name}'s online presence",
        "site_unreachable": "{name}'s website seems to be down",
        "_default": "Quick idea for {name}",
    },
    "he": {
        "no_website": "שאלה קצרה על הנוכחות של {name} באינטרנט",
        "site_unreachable": "נראה שהאתר של {name} לא עובד",
        "_default": "רעיון קצר בשביל {name}",
    },
}

# Hook priority for choosing the opener (strongest pitch first).
HOOK_ORDER = ["no_website", "site_unreachable", "not_mobile_friendly", "http_only",
              "stale_copyright", "no_meta_description"]


def best_hook(hooks: list[str]) -> str:
    for h in HOOK_ORDER:
        if h in hooks:
            return h
    return "_default"


def render(lead: dict, lang: str, sender: dict, labels: dict | None = None) -> dict:
    labels = labels or {}
    hook = best_hook(lead.get("hooks", []))
    fields = {
        "name": lead["name"],
        "city": labels.get("city") or lead.get("city", ""),
        "niche": labels.get("niche") or lead.get("niche", "business"),
        **sender,
    }
    opener = OPENERS[lang].get(hook, OPENERS[lang]["_default"]).format(**fields)
    subject_tpl = SUBJECT[lang].get(hook, SUBJECT[lang]["_default"])
    return {
        "hook": hook,
        "subject": subject_tpl.format(**fields),
        "message": BODY[lang].format(opener=opener, **fields),
    }


def main(in_path: str, lang: str, sender: dict, labels: dict | None = None) -> dict:
    path = Path(in_path)
    if not path.is_absolute():
        path = ROOT / path
    data = json.loads(path.read_text())

    for lead in data["leads"]:
        lead["outreach"] = render(lead, lang, sender, labels)
    data["outreach_generated_at"] = date.today().isoformat()
    data["outreach_lang"] = lang

    out = path.with_name("leads_outreach.json")
    out.write_text(json.dumps(data, indent=2, ensure_ascii=False))
    return {
        "status": "ok", "count": len(data["leads"]), "lang": lang,
        "out": str(out.relative_to(ROOT) if out.is_relative_to(ROOT) else out),
    }


if __name__ == "__main__":
    p = argparse.ArgumentParser(description="Generate personalized outreach drafts for enriched leads.")
    p.add_argument("--in", dest="in_path", required=True, help="Path to leads_enriched.json.")
    p.add_argument("--lang", choices=("en", "he"), default="en", help="Message language (default en).")
    p.add_argument("--sender-name", default=None, help="Your name (or SENDER_NAME in .env).")
    p.add_argument("--sender-company", default=None, help="Your company (or SENDER_COMPANY in .env).")
    p.add_argument("--offer", default=None, help="One-line offer (or SENDER_OFFER in .env).")
    p.add_argument("--niche-label", default=None,
                   help='Display name for the niche in messages, e.g. "רופאי שיניים" when --lang he.')
    p.add_argument("--city-label", default=None,
                   help='Display name for the city in messages, e.g. "תל אביב" when --lang he.')
    args = p.parse_args()
    try:
        sender = {
            "sender_name": args.sender_name or get_env("SENDER_NAME", required=False) or "Liam",
            "sender_company": args.sender_company or get_env("SENDER_COMPANY", required=False) or "Get Leads with AI",
            "offer": args.offer or get_env("SENDER_OFFER", required=False)
            or "AI-powered lead generation and customer outreach",
        }
        labels = {"niche": args.niche_label, "city": args.city_label}
        print(json.dumps(main(args.in_path, args.lang, sender, labels), indent=2, ensure_ascii=False))
    except Exception as exc:
        print(json.dumps({"status": "error", "error": str(exc)}), file=sys.stderr)
        sys.exit(1)
