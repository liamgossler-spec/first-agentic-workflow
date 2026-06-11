"""Render a markdown report into a branded PDF.

Two rendering engines, auto-selected:
  - weasyprint (preferred): one pass, repeating logo header via @page running
    elements. Needs native libs (macOS: `brew install pango`).
  - chromium (fallback): pure-pip via Playwright, no system libs. Renders a
    full-bleed cover and the body separately (logo header + page-number footer
    from Chromium's page.pdf templates), then merges them with pypdf.

Both engines share templates/report.html.j2 and templates/report.css and produce
the same branded look. Override with --engine.

Run standalone:
    python tools/render_report_pdf.py --content data/snapshots/2026-06-11/report.md
    python tools/render_report_pdf.py --content report.md --out reports/out.pdf \
        --title "Competitor Analysis" --engine chromium
"""
from __future__ import annotations

import argparse
import base64
import json
import mimetypes
import sys
from datetime import date
from pathlib import Path

import markdown as md
import yaml
from jinja2 import Environment, FileSystemLoader, select_autoescape

from config import ROOT

TEMPLATES_DIR = ROOT / "templates"
DEFAULT_BRAND = ROOT / "brand" / "brand.yaml"
DEFAULT_FONTS_DIR = ROOT / "brand" / "fonts"

DEFAULT_PALETTE = {
    "primary": "#1f2937", "secondary": "#374151", "accent": "#2563eb",
    "text": "#1a1a1a", "muted": "#6b7280", "background": "#ffffff",
}
DEFAULT_FONTS = {"heading": "Inter", "body": "Inter"}


def _resolve(path: str | Path) -> Path:
    p = Path(path)
    return p if p.is_absolute() else ROOT / p


def _load_brand(brand_path: Path) -> dict:
    brand = yaml.safe_load(brand_path.read_text()) if brand_path.exists() else {}
    brand = brand or {}
    return {
        "company_name": brand.get("company_name") or "Your Company",
        "tagline": brand.get("tagline") or "",
        "palette": {**DEFAULT_PALETTE, **(brand.get("palette") or {})},
        "fonts": {**DEFAULT_FONTS, **(brand.get("fonts") or {})},
    }


def _logo_data_uri(logo_path: Path | None) -> str | None:
    """Embed the logo as a data URI so both engines render it without path issues."""
    if not logo_path or not logo_path.exists():
        return None
    mime = mimetypes.guess_type(str(logo_path))[0] or "image/png"
    data = base64.b64encode(logo_path.read_bytes()).decode("ascii")
    return f"data:{mime};base64,{data}"


def _discover_font_faces(fonts: dict) -> list[dict]:
    faces: list[dict] = []
    if not DEFAULT_FONTS_DIR.exists():
        return faces
    wanted = {fonts.get("heading", ""), fonts.get("body", "")}
    for font_file in sorted(DEFAULT_FONTS_DIR.glob("*")):
        if font_file.suffix.lower() not in (".ttf", ".otf", ".woff", ".woff2"):
            continue
        family = next((w for w in wanted if w and w.lower() in font_file.stem.lower()), None)
        if not family:
            continue
        weight = 700 if any(k in font_file.stem.lower() for k in ("bold", "semibold", "700")) else 400
        faces.append({"family": family, "path": font_file.as_uri(), "weight": weight})
    return faces


def _pick_engine(requested: str) -> str:
    if requested != "auto":
        return requested
    # WeasyPrint prints a libs banner to stdout when native deps are missing;
    # silence the probe so it never pollutes our JSON on stdout.
    import contextlib
    import io
    sink = io.StringIO()
    try:
        with contextlib.redirect_stdout(sink), contextlib.redirect_stderr(sink):
            import weasyprint  # noqa: F401
        return "weasyprint"
    except Exception:
        return "chromium"


def _render_weasyprint(env, ctx, css_ctx, out_path: Path) -> None:
    from weasyprint import CSS, HTML
    html_str = env.get_template("report.html.j2").render(
        **ctx, render_cover=True, render_body=True, inline_css=None
    )
    css_str = env.get_template("report.css").render(**css_ctx)
    HTML(string=html_str, base_url=str(ROOT)).write_pdf(str(out_path), stylesheets=[CSS(string=css_str)])


def _render_chromium(env, ctx, css_ctx, out_path: Path) -> None:
    from playwright.sync_api import sync_playwright
    from pypdf import PdfReader, PdfWriter

    css_str = env.get_template("report.css").render(**css_ctx)
    cover_html = env.get_template("report.html.j2").render(
        **ctx, render_cover=True, render_body=False, inline_css=css_str
    )
    body_html = env.get_template("report.html.j2").render(
        **ctx, render_cover=False, render_body=True, inline_css=css_str
    )

    palette, company = ctx["palette"], ctx["company_name"]
    logo_img = (
        f'<img src="{ctx["logo_src"]}" style="height:11px;margin-right:6px;vertical-align:middle;">'
        if ctx["logo_src"] else ""
    )
    header_tpl = (
        f'<div style="font-size:7px;color:{palette["muted"]};width:100%;'
        f'padding:0 1.6cm;display:flex;align-items:center;-webkit-print-color-adjust:exact;">'
        f'{logo_img}<span style="text-transform:uppercase;letter-spacing:0.5px;">{company}</span></div>'
    )
    footer_tpl = (
        f'<div style="font-size:7px;color:{palette["muted"]};width:100%;'
        f'padding:0 1.6cm;display:flex;justify-content:space-between;-webkit-print-color-adjust:exact;">'
        f'<span>{company} &middot; Competitor Intelligence &middot; Confidential</span>'
        f'<span>Page <span class="pageNumber"></span> of <span class="totalPages"></span></span></div>'
    )

    tmp = ROOT / ".tmp"
    tmp.mkdir(exist_ok=True)
    cover_pdf, body_pdf = tmp / "_cover.pdf", tmp / "_body.pdf"

    with sync_playwright() as pw:
        browser = pw.chromium.launch()
        page = browser.new_page()

        page.set_content(cover_html, wait_until="networkidle")
        page.pdf(path=str(cover_pdf), format="A4", print_background=True,
                 margin={"top": "0", "bottom": "0", "left": "0", "right": "0"})

        page.set_content(body_html, wait_until="networkidle")
        page.pdf(path=str(body_pdf), format="A4", print_background=True,
                 display_header_footer=True, header_template=header_tpl, footer_template=footer_tpl,
                 margin={"top": "1.5cm", "bottom": "1.4cm", "left": "1.6cm", "right": "1.6cm"})
        browser.close()

    writer = PdfWriter()
    for pdf in (cover_pdf, body_pdf):
        for pg in PdfReader(str(pdf)).pages:
            writer.add_page(pg)
    with open(out_path, "wb") as fh:
        writer.write(fh)
    cover_pdf.unlink(missing_ok=True)
    body_pdf.unlink(missing_ok=True)


def main(content: str, out: str | None, title: str, brand: str, logo: str | None, engine: str) -> dict:
    content_path = _resolve(content)
    if not content_path.exists():
        raise FileNotFoundError(f"Report markdown not found: {content_path}")

    brand_ctx = _load_brand(_resolve(brand))
    logo_path = _resolve(logo or "brand/logo.png")
    logo_src = _logo_data_uri(logo_path)

    body_html = md.markdown(
        content_path.read_text(),
        extensions=["tables", "fenced_code", "sane_lists"],
    )

    chosen = _pick_engine(engine)
    env = Environment(
        loader=FileSystemLoader(str(TEMPLATES_DIR)),
        autoescape=select_autoescape(["html", "xml"]),
    )
    font_faces = _discover_font_faces(brand_ctx["fonts"])
    ctx = {
        "title": title,
        "company_name": brand_ctx["company_name"],
        "tagline": brand_ctx["tagline"],
        "report_date": date.today().strftime("%B %d, %Y"),
        "palette": brand_ctx["palette"],
        "fonts": brand_ctx["fonts"],
        "logo_src": logo_src,
        "body_html": body_html,
        "engine": chosen,
    }
    css_ctx = {
        "palette": brand_ctx["palette"], "fonts": brand_ctx["fonts"],
        "font_faces": font_faces, "engine": chosen,
    }

    out_path = _resolve(out) if out else ROOT / "reports" / f"competitor_analysis_{date.today().isoformat()}.pdf"
    out_path.parent.mkdir(parents=True, exist_ok=True)

    if chosen == "weasyprint":
        _render_weasyprint(env, ctx, css_ctx, out_path)
    else:
        _render_chromium(env, ctx, css_ctx, out_path)

    return {
        "status": "ok",
        "engine": chosen,
        "pdf": str(out_path.relative_to(ROOT)),
        "title": title,
        "company_name": brand_ctx["company_name"],
        "logo_embedded": logo_src is not None,
        "custom_fonts": len(font_faces),
    }


if __name__ == "__main__":
    p = argparse.ArgumentParser(description="Render a markdown report into a branded PDF.")
    p.add_argument("--content", required=True, help="Path to the report markdown file.")
    p.add_argument("--out", default=None, help="Output PDF path (default reports/competitor_analysis_<date>.pdf).")
    p.add_argument("--title", default="Competitor Analysis", help="Cover title.")
    p.add_argument("--brand", default=str(DEFAULT_BRAND), help="brand.yaml path.")
    p.add_argument("--logo", default=None, help="Logo image path (default brand/logo.png).")
    p.add_argument("--engine", default="auto", choices=["auto", "weasyprint", "chromium"], help="Render engine.")
    args = p.parse_args()
    try:
        print(json.dumps(main(args.content, args.out, args.title, args.brand, args.logo, args.engine), indent=2))
    except Exception as exc:
        print(json.dumps({"status": "error", "error": str(exc)}), file=sys.stderr)
        sys.exit(1)
