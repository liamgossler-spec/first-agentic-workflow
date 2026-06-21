# zynx — Marketing Site

Bilingual (Hebrew RTL / English LTR) landing page for **zynx** — AI agents,
automations, and marketing campaigns for businesses. Blue/purple tech aesthetic.

## Files
- `index.html` — page structure; all copy is bilingual via `data-en` / `data-he`
  attributes (and `data-ph-en` / `data-ph-he` for input placeholders).
- `styles.css` — dark theme, blue→purple gradients, RTL-aware (uses logical
  properties like `inset-inline-start`, so it flips automatically).
- `script.js` — language toggle. Defaults to Hebrew; remembers the choice in
  `localStorage`. Sets `<html lang>` and `dir` so RTL/LTR switch correctly.

## Run locally
Just open `index.html` in a browser, or serve the folder:

    cd site && python -m http.server 8000   # then visit http://localhost:8000

## Editing copy
Each text element holds both languages. To change a headline, edit its `data-en`
and `data-he` attributes in `index.html` — no JS changes needed.

## Deploy (next step)
Static site — drops straight onto Netlify, Vercel, GitHub Pages, or Cloudflare
Pages. Pick a host and I'll wire up deployment. To use the real domain, point
`zynx.ai` (or chosen domain) at the host. Contact email in the page is a
placeholder (`hello@zynx.ai`) — swap it for the real one.

## TODO / ideas
- Real logo (currently a wordmark). Drop an SVG/PNG and I'll integrate it.
- Hook the contact form to a backend or form service (Formspree, etc.).
- Add AI-generated marketing video once HeyGen is connected.
