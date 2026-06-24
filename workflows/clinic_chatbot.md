# Workflow: Clinic AI Chatbot (Demo + Deploy)

## Objective
Stand up, demo, and deploy a Hebrew WhatsApp/Instagram AI assistant for an
aesthetic clinic — answers leads 24/7, qualifies them, and books appointments.
This is the core product the agency sells (setup + monthly retainer).

## Inputs
- `clinic_config` — JSON with the clinic's details (name, treatments+prices, hours,
  address, owner name, brand tone). Template: `tools/clinic_bot_config.example.json`.
- `ANTHROPIC_API_KEY` — in `.env` for live mode (offline demo needs no key).

## Tools used
- `tools/clinic_bot.py` — the runnable assistant.
  - `--show-prompt` → print the assembled system prompt for a config.
  - `--demo` / `--scenario lead_night|price_shopper|medical` → offline scripted
    demo (no key, no installs) for screen-recording a sales demo.
  - default → live mode via Claude API (`pip install anthropic` + key).
- `tools/clinic_bot_prompt.txt` — the Hebrew system-prompt template ({{placeholders}}).

## Steps
1. **Onboard** the clinic: fill a copy of `clinic_bot_config.example.json` with
   real treatments, prices, hours, address, tone (see onboarding form in
   `clinic-ai-business/04-delivery-ops.md`).
2. **Verify the prompt:** `python tools/clinic_bot.py --config <clinic>.json --show-prompt`.
3. **Record a sales demo:** `python tools/clinic_bot.py --config <clinic>.json --scenario lead_night`
   — screen-record it for outreach/Loom.
4. **Test live:** set `ANTHROPIC_API_KEY`, `pip install anthropic`, run interactive
   live mode and push 20+ test scenarios (price, qualify, booking, medical→escalate).
5. **Connect channels (production):** wire the live handler to WhatsApp (360dialog /
   WhatsApp Cloud API / GreenAPI) and Instagram DM (ManyChat), plus calendar/Sheets.
   See `clinic-ai-business/04-delivery-ops.md` for the stack.
6. **Go live** + monitor first 48h; collect metrics for the monthly report.

## Expected output
A working assistant the clinic can talk to: in demo mode for sales, in live mode
for production. Leads answered in seconds, qualified, and booked — in Hebrew.

## Edge cases & lessons learned
- Offline `--demo` is illustrative only (scripted, not AI) — use live mode for real tests.
- Never give medical advice — the prompt escalates medical questions to a human.
- Use the official WhatsApp API for paying clients (unofficial APIs risk bans).
- Keep model on `claude-haiku-4-5` for cost at volume; switch to Sonnet for complex tone.
- Append rate limits / channel quirks here as you learn them per client.
