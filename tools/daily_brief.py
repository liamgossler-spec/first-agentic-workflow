"""Assemble the morning brief skeleton for the daily-planning routine.

Stamps today's date, creates today's plan file from a template (idempotent —
won't clobber an existing one), and points at yesterday's plan so the agent can
carry over unfinished items. Prints JSON so the agent can chain the next steps.

    python tools/daily_brief.py
    python tools/daily_brief.py --date 2026-06-21   # override "today"
"""
from __future__ import annotations

import argparse
import json
from datetime import date, datetime, timedelta
from pathlib import Path

from config import ROOT

DAILY_DIR = ROOT / "reports" / "daily"

TEMPLATE = """# Daily Plan — {day}

_Generated {generated}. Source goals: `business/goals.md`._

## Top 3 priorities
1.
2.
3.

## Queue (concrete next tasks)
- [ ] <task> — tool/MCP: <which>

## Blocked / needs you
- <decision, credential, or MCP connection the agent is waiting on>

## Watching (deadlines, follow-ups)
- <thing to revisit>

## Carried over from yesterday
{carryover}

## End-of-day notes
-
"""


def find_yesterday_plan(today: date) -> Path | None:
    """Most recent existing daily plan strictly before `today`, if any."""
    if not DAILY_DIR.exists():
        return None
    prior = sorted(
        p for p in DAILY_DIR.glob("*.md")
        if p.stem < today.isoformat()
    )
    return prior[-1] if prior else None


def main(today: date) -> dict:
    DAILY_DIR.mkdir(parents=True, exist_ok=True)
    plan_path = DAILY_DIR / f"{today.isoformat()}.md"
    yesterday = find_yesterday_plan(today)

    created = False
    if not plan_path.exists():
        carryover = (
            f"_See `{yesterday.relative_to(ROOT)}` for unfinished items._"
            if yesterday else "_No previous plan found._"
        )
        plan_path.write_text(
            TEMPLATE.format(
                day=today.strftime("%A, %B %d, %Y"),
                generated=datetime.now().strftime("%Y-%m-%d %H:%M"),
                carryover=carryover,
            )
        )
        created = True

    return {
        "status": "ok",
        "date": today.isoformat(),
        "plan_file": str(plan_path.relative_to(ROOT)),
        "created": created,
        "yesterday_plan": str(yesterday.relative_to(ROOT)) if yesterday else None,
        "goals_file": "business/goals.md",
        "next": "Read goals + yesterday's plan, pull tasks from ClickUp/Notion/GitHub, "
                "then fill in the plan file.",
    }


if __name__ == "__main__":
    p = argparse.ArgumentParser(description="Create today's daily-plan skeleton.")
    p.add_argument("--date", help="ISO date YYYY-MM-DD (default: today).")
    args = p.parse_args()
    day = date.fromisoformat(args.date) if args.date else date.today()
    print(json.dumps(main(day), indent=2))
