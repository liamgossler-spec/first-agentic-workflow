# Goals & Roadmap

This is the **fuel for the daily planning routine**. Every morning the agent reads
this file to decide what matters today. Keep it current — when a goal is done,
move it to "Done", and when priorities shift, reorder them.

> How to read this: **North Star** is the long-term destination. **Active focus**
> is what we're pushing on right now (the next few weeks). **This week** is the
> concrete short list. **Backlog** is everything else, roughly prioritized.

---

## North Star
Build a startup powered by AI agents and automations. Use connected services
(MCPs) so the agent can create websites, edit/produce videos, run marketing, and
operate the business semi-autonomously. Current product: **Get Leads with AI** —
AI-powered lead scraping, lead-list building, and personalized outreach at scale.

## Active focus (next few weeks)
1. **Stand up the daily operating system** — a morning routine that plans the day,
   tracks goals, and queues concrete build tasks. (This is what we're setting up now.)
2. **Connect the core MCPs** — wire up the external services the business needs
   (video, marketing, web, design). See `integrations/mcp_registry.md`.
3. **Ship the first automation/agent** for the lead-gen product.

## This week
- [ ] Approve the daily-planning system and run `/morning-plan` once end-to-end.
- [ ] Decide which 2–3 MCPs to connect first (HeyGen / Meta / others).
- [ ] Fill in the blanks in `business/profile.md` (pricing, ICP, differentiators).

## Backlog (rough priority order)
- [ ] Build a website for the product (needs a web/deploy MCP or tool).
- [ ] Video pipeline: script → generate → edit → publish (HeyGen + editing MCP).
- [ ] Marketing automation: Meta ads + content scheduling.
- [ ] Outreach automation tied to the lead-scraping tools.
- [ ] CRM / pipeline tracking (ClickUp or Notion as the system of record).

## Done
- [x] 2026-06-21 — Set up WAT framework with daily-planning routine.

---

## Operating preferences
- **Working hours / timezone:** _(fill in — used to time the morning run)_
- **How aggressive to be without asking:** _(e.g. "build freely, ask before anything
  that spends money or publishes publicly")_
- **Daily plan delivery:** written to `reports/daily/<date>.md` _(add a cloud
  destination — Notion/Sheets/email — if you want it pushed somewhere)_
