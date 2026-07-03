# Workflow: Find Prospects (Israel local businesses)

## Objective
Build a clean, deduped list of Israeli local businesses in a target niche
(name, phone, WhatsApp link, website, rating, address) to use as outreach
prospects for the GHL done-for-you offer.

## Inputs
- `niche` — a ready-made query pack in `tools/find_prospects.py` (`beauty`,
  `dental`, `fitness`), or explicit `--queries` in Hebrew.
- `cities` — comma-separated city names in Hebrew. Default: Gush Dan starter
  list (תל אביב, רמת גן, גבעתיים, הרצליה, ראשון לציון).
- `GOOGLE_PLACES_API_KEY` in `.env` — Google Cloud project with
  **Places API (New)** enabled.

## Tools used
- `tools/find_prospects.py` — runs Hebrew text searches on the Places API,
  paginates, dedupes by place id, filters to OPERATIONAL businesses, writes
  CSV + JSON to `.tmp/`. Args: `--niche | --queries`, `--cities`, `--max-pages`.

## Steps
1. Confirm the niche and cities with Liam (or take them from the task).
2. Run e.g. `python tools/find_prospects.py --niche beauty`.
3. Sanity-check the summary: expect roughly 50-60 results per query/city pair
   at `--max-pages 3`; near-zero for a query usually means a bad query string,
   not an empty market.
4. Deliverable: upload the CSV to Google Sheets (Drive connector or manual)
   so outreach status columns can be tracked there. `.tmp/` copies are
   disposable intermediates.
5. Pair the list with the outreach scripts in `business/outreach_beauty_he.md`.

## Expected output
A Google Sheet with 150-400 unique prospects, sorted by review count
(most-established first), with a `whatsapp` column of ready `wa.me` links for
mobile numbers.

## Edge cases & lessons learned
- **API must be enabled before the key works** (learned 2026-07-03): a fresh
  key returns 403 PERMISSION_DENIED until "Places API (New)" is enabled on the
  project; the error body includes a direct enable link — send it to Liam.
- **Review-count sort surfaces noise at the top** (2026-07-03): malls and
  retail chains (עזריאלי, דיל קוסמטיקס) have the most reviews. The
  owner-operated sweet spot for outreach: has a wa.me link and ~15-600
  reviews. First real run: 720 unique → 326 priority rows after this filter.
- Broad queries like "מכון יופי" also pull hair salons — same lead-pain, fine
  to keep as secondary targets, or tighten queries if conversion says otherwise.
- **Cost**: phone/website fields bill under the Enterprise SKU — 1,000 free
  requests/month (≈20,000 businesses). A default run is ~75 requests. Stay on
  the free tier; no billing surprises expected at this scale.
- **wa.me links** are generated only for `05X` mobile numbers; landlines
  (`03/04/08/09`) get phone-call outreach instead.
- Use the official API, not Maps scraping — scraping violates Google ToS and
  breaks randomly.
- **Cold WhatsApp must be sent manually** (WhatsApp Business app, ~20-30/day,
  personalized). Automated blasts to cold numbers get the number banned fast.
  Automation is only for leads who wrote to us first / opted in via GHL.
- 429/5xx responses are retried with backoff (2s/4s/8s) inside the tool.
