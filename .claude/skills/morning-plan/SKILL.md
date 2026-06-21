---
name: morning-plan
description: Run the daily morning planning routine — review goals, check connected systems (ClickUp, Notion, GitHub) for open and due work, then write a prioritized daily plan and start the safe, unblocked tasks. Use when the user says "good morning", "plan my day", "what's on today", or every morning on a schedule.
---

# Morning Plan

Run the daily-planning routine defined in `workflows/daily_planning.md`. Follow that
workflow as the source of truth; this skill is the quick entry point.

## Do this, in order

1. **Stamp the day.** Run `python tools/daily_brief.py`. It creates
   `reports/daily/<today>.md` from the template (idempotent) and tells you where
   yesterday's plan is. If today's plan already exists, update it in place.

2. **Load context.** Read `business/goals.md` (active focus, this-week, backlog) and
   `business/profile.md`. Read yesterday's plan and note unfinished items.

3. **Check the connected systems** (use the MCP tools, in parallel):
   - **ClickUp** — open tasks, anything due today or overdue.
   - **Notion** — tasks/notes, upcoming deadlines.
   - **GitHub** — open PRs needing review, failing CI on active branches.
   - **Web search** — only if a current goal needs fresh market/news input.
   - For services not yet connected, see `integrations/mcp_registry.md` and list
     them under "Blocked / needs you" rather than faking the action.

4. **Write the plan** into `reports/daily/<today>.md`:
   - **Top 3 priorities** — the needle-movers tied to the active focus.
   - **Queue** — concrete next tasks, each tagged with the tool/MCP it needs.
   - **Blocked / needs you** — decisions, credentials, or MCP connections you're
     waiting on. Be specific.
   - **Watching** — deadlines and follow-ups.

5. **Act on the plan**, respecting the user's "how aggressive" preference in
   `business/goals.md`:
   - Safe + unblocked → **start it now**, report progress.
   - Spends money / publishes publicly / ambiguous → **propose and ask** with
     AskUserQuestion.
   - Running unattended (scheduled, user away) → do the safe work, leave everything
     else clearly under "Blocked / needs you".

6. **Keep goals honest.** Tick off anything completed in `business/goals.md` and
   reorder if priorities shifted. Never delete a goal — only check it off or move it.

7. **Report back** in chat: the top 3, what you started, and what needs the user.

## Notes
- Be concise in chat; the full detail lives in the plan file.
- This is meant to be re-run daily. Don't duplicate yesterday's plan — carry items
  forward and close the loop on what got done.
