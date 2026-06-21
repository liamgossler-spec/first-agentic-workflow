# Workflow: Daily Planning (Morning Routine)

## Objective
Every morning, produce a clear, prioritized plan for the day and tee up concrete
work. The agent reviews goals, checks the connected systems for what's open and
what's due, scans for anything time-sensitive, then writes a dated daily plan and
proposes (or starts) the highest-value tasks.

## Inputs
- `business/goals.md` — North Star, active focus, this-week list, backlog. The
  primary driver of priorities.
- `business/profile.md` — who the business is and what it sells.
- `reports/daily/<yesterday>.md` — yesterday's plan, to carry over unfinished items.
- `integrations/mcp_registry.md` — which external services are connected and usable.
- Connected MCPs (read at runtime): **ClickUp**, **Notion**, **GitHub** (already
  connected). Others as they come online.

## Tools used
- `tools/daily_brief.py` — assembles the morning brief skeleton: today's date,
  links to goals, and a pointer to yesterday's plan. Run:
  `python tools/daily_brief.py` → prints JSON and writes `reports/daily/<date>.md`
  with a filled template the agent then completes.
- MCP tools as data sources (not Python): ClickUp/Notion for tasks & deadlines,
  GitHub for open PRs/issues, Web search for time-sensitive news.

## Steps
1. Run `python tools/daily_brief.py` to stamp the date and create today's plan file
   from the template (skips if it already exists for today).
2. Read `business/goals.md` (focus + this-week + backlog) and `business/profile.md`.
3. Carry over unfinished items from yesterday's `reports/daily/<yesterday>.md`.
4. Pull current state from connected systems:
   - **ClickUp / Notion** — open tasks, due dates, anything overdue or due today.
   - **GitHub** — open PRs needing review, failing CI, stale branches.
   - **Web** (only if a goal needs it) — relevant news/market changes.
5. Synthesize a **prioritized daily plan** into `reports/daily/<date>.md`:
   - **Top 3 priorities** for today (the needle-movers, tied to active focus).
   - **Queue** — concrete next tasks with the tool/MCP each needs.
   - **Blocked / needs you** — anything waiting on a decision, credential, or MCP
     connection. Be explicit about what you need from the user.
   - **Watching** — deadlines, follow-ups, things to revisit.
6. Decide per the user's "how aggressive" preference in `business/goals.md`:
   - Tasks that are safe and unblocked → **start them** and report progress.
   - Tasks that spend money, publish publicly, or are ambiguous → **propose and ask**
     (use AskUserQuestion).
7. Keep `business/goals.md` honest: tick off anything completed, reorder if needed
   (this is the one file the agent may update without asking, since it's the user's
   own goal tracker — but never delete goals, only check them off or reprioritize).

## Expected output
- `reports/daily/<YYYY-MM-DD>.md` — the day's plan (top 3, queue, blocked, watching).
- A short chat summary: the top 3, what you started, and what needs the user.

## Edge cases & lessons learned
- **Idempotent:** if today's plan already exists, update it in place instead of
  overwriting — the user may have edited it.
- **MCP not connected:** if a needed service isn't wired up, list it under
  "Blocked / needs you" with a pointer to `integrations/mcp_registry.md` rather than
  trying to fake the action.
- **No goals yet:** if `business/goals.md` is empty/stale, the first task of the day
  is to interview the user and fill it in — a plan is only as good as its goals.
- **Running unattended (scheduled):** when there's no user to answer, do the safe
  unblocked work, write everything else clearly under "Blocked / needs you", and
  leave it for the user to review. Never spend money or publish without approval.
