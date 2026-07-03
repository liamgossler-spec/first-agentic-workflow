# Workflow: Lead Generation & Personalized Outreach

## Objective
Produce a **sellable, client-ready lead list** for any niche + city: real local
businesses with contact details, a website audit ("hooks"), a priority score, and
a personalized outreach draft per lead. This is the core product of
**Get Leads with AI** (see `business/profile.md`). Sold per-list or as a monthly
service — see the Monetization Playbook at the bottom.

## Inputs
- `--niche` — business type (dentist, lawyer, restaurant… see `NICHE_TAGS` in
  `tools/find_leads.py`; anything else via `--osm-tag key=value`).
- `--city` — city or area ("Tel Aviv", "Austin, TX").
- Sender identity for outreach: `SENDER_NAME`, `SENDER_COMPANY`, `SENDER_OFFER`
  in `.env`, or CLI flags.
- No API keys required — discovery uses free OpenStreetMap APIs (Nominatim +
  Overpass).

## Tools used (in order)
1. `tools/find_leads.py --niche dentist --city "Tel Aviv" --limit 200`
   → `.tmp/leads/<date>_<slug>/leads_raw.json` (names, addresses, phones, websites).
2. `tools/enrich_leads.py --in <run>/leads_raw.json`
   → `leads_enriched.json`. Visits each website: extracts emails (incl. a hop to
   the contact page), socials (FB/IG/LinkedIn/WhatsApp), and audit hooks
   (`no_website`, `site_unreachable`, `not_mobile_friendly`, `http_only`,
   `stale_copyright`, `no_meta_description`), then scores each lead 0–100.
3. `tools/generate_outreach.py --in <run>/leads_enriched.json --lang en|he`
   → `leads_outreach.json`. Personalized draft per lead, opener chosen by the
   lead's strongest hook. For Hebrew pass `--niche-label` / `--city-label`
   (e.g. `--niche-label "רופאי שיניים" --city-label "תל אביב"`) so the message
   doesn't mix English into the sentence.
4. `tools/export_leads.py --in <run>/leads_outreach.json`
   → `reports/leads_<slug>_<date>.csv` — the deliverable (UTF-8 BOM, opens
   clean in Excel/Sheets; import to Google Sheets to share with a client).

## Steps
1. Confirm niche + city with the user (or take them from the client order).
2. Run the four tools in order. Sanity-check counts after each step — a healthy
   city-niche run yields dozens–hundreds of leads; near-zero usually means the
   niche isn't in `NICHE_TAGS` (use `--osm-tag`) or the city didn't geocode.
3. Review the top ~10 leads by score and hand-polish their outreach messages —
   the templates guarantee a sane draft, but the highest-value leads deserve a
   human-quality touch (mention something specific from their site).
4. Deliver the CSV (or import into a Google Sheet and share the link).
5. Save nothing sensitive; everything under `.tmp/leads/` is regenerable.

## Expected output
- `reports/leads_<niche>_<city>_<date>.csv` — one row per lead: contacts,
  socials, hooks, score, personalized subject + message.

## Edge cases & lessons learned
- **Run this locally / with open network.** The remote container's network
  policy blocks OpenStreetMap APIs (403 at the proxy); the pipeline was verified
  end-to-end against a local fixture server instead. On a normal connection no
  code changes are needed.
- **Nominatim etiquette:** max 1 request/second and a descriptive User-Agent —
  both already baked into `find_leads.py`. Don't hammer it in a loop.
- **Overpass rate limits:** the main instance 429s under load; the tool fails
  over to the Kumi mirror automatically.
- **OSM data quality varies by city.** Big cities are rich; small towns may
  have few tagged businesses. Leads without websites are *good* leads (strongest
  hook), but verify the business still exists (phone/Google) before outreach.
- **Email extraction is best-effort.** Many small businesses only expose a
  form or WhatsApp — that's why socials and phone are first-class columns.
  A lead with phone + hooks is still sellable.
- **`example.com` addresses are filtered as junk** by design in
  `enrich_leads.py` — don't use them in test fixtures.
- **Anti-spam:** these are *drafts* for manual, low-volume, personalized
  outreach. Don't mass-blast; it burns the sender domain and can violate spam
  laws (and Israel's Amendment 40 rules for marketing messages). Quality > volume.

## Monetization Playbook (the $300/day plan)
The pipeline's output is sold three ways, cheapest-to-start first:

1. **Lead lists (start here, week 1).** "150 verified <niche> leads in <city>
   with emails, audit + personalized first lines" — $99–$299 per list on
   Upwork/Fiverr or direct to marketing agencies (agencies buy repeatedly).
   2–3 lists/day at ~$150 = $300+/day. Cost of goods: ~zero.
2. **Done-for-you outreach (weeks 2–4).** Run the list *and* send the outreach
   for the client, book meetings into their calendar. $500–$1,500/month per
   client. 6–8 clients ≈ $300/day, recurring.
3. **Bundle with the competitor report.** `workflows/competitor_analysis.md`
   already produces a branded PDF — sell it as the premium upsell ($300–$500)
   to clients who came in through a lead list.

**Who to sell to first:** the leads the pipeline itself flags with
`no_website` / `site_unreachable` / `not_mobile_friendly` are ALSO perfect
customers for web/marketing agencies — sell those agencies the exact list of
businesses that need them. The machine finds its own buyers.
