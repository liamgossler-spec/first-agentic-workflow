# MCP & Integration Registry

The external services the agent can act through. **MCPs are the new execution layer**
alongside `tools/` — when an MCP exists for a job (e.g. video, ads), prefer it over
hand-rolling a script.

> **How to connect an MCP:** in Claude Code on the web, open the session/environment
> settings and add the MCP server (URL or command + any API key/OAuth). Docs:
> https://code.claude.com/docs/en/claude-code-on-the-web — once connected its tools
> appear as `mcp__<server>__*` and the agent can use them automatically.

## Connected ✅
| Service  | What it's for                                  | Notes |
|----------|------------------------------------------------|-------|
| ClickUp  | Tasks, projects, the daily task system         | Used by `/morning-plan` |
| Notion   | Docs, notes, knowledge base, deadlines         | Used by `/morning-plan` |
| GitHub   | Code, PRs, CI for the agent/automation repos   | Used by `/morning-plan` |

## Wishlist — to connect 🔌
Prioritized by the goals in `business/goals.md`. Pick 2–3 to wire up first.

| Service        | Unlocks                                        | Priority | Status |
|----------------|------------------------------------------------|----------|--------|
| **HeyGen**     | AI avatar/video generation                     | High     | Needs API key + MCP |
| **Meta**       | Facebook/Instagram ads & content publishing    | High     | Needs OAuth + MCP |
| Web/deploy     | Build & deploy product websites (e.g. Vercel/Netlify) | High | Pick a provider |
| Video editing  | Programmatic editing (e.g. Shotstack/Creatomate) | Medium | Evaluate options |
| Design         | Graphics/thumbnails (e.g. Canva)               | Medium   | Evaluate options |
| Email/outreach | Cold outreach for the lead-gen product         | Medium   | Tie to existing tools |
| Google         | Sheets/Slides/Drive deliverables               | Low      | OAuth via credentials.json (see CLAUDE.md) |

## What I need from you to connect each
For every service you want online, provide:
1. **Which provider** (if there are options above, pick one).
2. **Credentials** — API key or OAuth login. Put API keys in `.env` (never commit),
   or add the MCP server with its key in the web session settings.
3. **Scope** — what you want the agent allowed to do (e.g. "draft videos, don't
   publish without approval").

Tell me which 2–3 to start with and I'll walk you through connecting each one.
