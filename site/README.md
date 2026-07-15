# GOSS® — gossagency.com

Production one-page site for **Goss Agency** (GOSS®) — dark-editorial design system:
ink `#0b0b0d` · cream `#f4f1ea` · champagne gold `#d3b16d` · Fraunces + Inter
(self-hosted variable fonts, no third-party requests).

Static site, no build step. Lighthouse (mobile emulation, local):
**Performance 96 · Accessibility 100 · Best Practices 100 · SEO 100.**

```
site/
├── index.html          # the site
├── 404.html            # custom 404 (Vercel serves it automatically)
├── vercel.json         # cache + security headers, clean URLs
├── robots.txt / sitemap.xml
└── assets/
    ├── site.css / site.js
    ├── fonts/          # Fraunces + Inter variable woff2
    ├── favicon.svg, icon-32.png, icon-180.png   # G monogram
    ├── og.jpg          # 1200×630 social share image
    └── (imagery — see below)
```

## ⚠️ One manual step: localize the case-study imagery

The four photos were on **temporary CDN links** that this build environment's
network policy blocked (`d8j0ntlcm91z4.cloudfront.net`). The site currently uses a
graceful chain per image: local `.webp` → local `.png` → the CDN link → an elegant
typographic placeholder. Visitors see the CDN photos today, but those links will rot.

To localize (pick one):

1. **From your machine** (~1 minute): download the four links from the original
   brief into `site/assets/` as `trattoria.png`, `contractor.png`, `barbershop.png`,
   `studio.png`, then run `python3 tools/optimize_site_images.py` (needs
   `pip install pillow`) and commit. The script emits the `-480/-800/-1200.webp`
   responsive set the HTML already references.
2. **Drag & drop**: add the four PNGs to `site/assets/` in the GitHub web UI —
   the PNG fallback kicks in immediately; run the script later for the webp set.
3. **Ask Claude** in a session whose network policy allows the CDN host (or once
   the files are anywhere reachable), and it will finish the webp conversion.

## Deploy on Vercel (Git integration — recommended)

1. vercel.com → **Add New → Project** → import `liamgossler-spec/first-agentic-workflow`.
2. **Root Directory:** `site` · Framework preset: **Other** · no build command, no output dir.
3. Production branch: `main` (or point it at the working branch to preview).
4. Deploy → you get `<project>.vercel.app`. Every push redeploys automatically.

### Custom domain — gossagency.com

Vercel project → **Settings → Domains** → add `gossagency.com` + `www.gossagency.com`
→ at your registrar set the DNS records Vercel shows (A `76.76.21.21` /
CNAME `cname.vercel-dns.com`) → set `gossagency.com` as primary (www redirects).
SSL is automatic.

## Wire the contact form (Formspree)

Create a free form at formspree.io → copy the form ID → in `index.html`, replace
`YOUR_FORM_ID` in the form `action` (one place, marked with a big comment).
Until then the form shows a polite "email us instead" notice on submit.

## Replace-me checklist

- [ ] `YOUR_FORM_ID` → your Formspree form ID (`index.html`, contact form)
- [ ] `+1 (000) 000-0000` → your US phone (contact section + footer, marked `TODO(Liam)`)
- [ ] `Your City, USA` → your city (contact section + footer)
- [ ] Social links in the footer (`instagram.com` / `linkedin.com` / `x.com` placeholders)
- [ ] Case-study imagery localized (see above)
- [ ] Optional: your portrait in the Studio section (swap `studio.png` source set)
- [ ] `hello@gossagency.com` — create the mailbox or change the address (3 places in
      `index.html`, one in `404.html`)
