#!/usr/bin/env python3
"""Generate the responsive .webp set for the GOSS site (site/assets).

For each source PNG (trattoria, contractor, barbershop, studio) present in
site/assets/, emits <name>-480.webp, <name>-800.webp and <name>-1200.webp
(quality 82, sharp downscale). Originals are kept untouched. Safe to re-run;
skips variants that are already newer than their source.

Usage:  python3 tools/optimize_site_images.py
Needs:  pip install pillow
"""
from __future__ import annotations

import sys
from pathlib import Path

try:
    from PIL import Image
except ImportError:
    sys.exit("Pillow is required: pip install pillow")

ASSETS = Path(__file__).resolve().parent.parent / "site" / "assets"
SOURCES = ["trattoria", "contractor", "barbershop", "studio"]
WIDTHS = [480, 800, 1200]
QUALITY = 82


def main() -> int:
    made, missing = 0, []
    for name in SOURCES:
        src = ASSETS / f"{name}.png"
        if not src.exists():
            missing.append(src.name)
            continue
        with Image.open(src) as im:
            im = im.convert("RGB")
            for w in WIDTHS:
                out = ASSETS / f"{name}-{w}.webp"
                if out.exists() and out.stat().st_mtime >= src.stat().st_mtime:
                    continue
                ratio = w / im.width
                resized = im.resize((w, max(1, round(im.height * ratio))), Image.LANCZOS)
                resized.save(out, "WEBP", quality=QUALITY, method=6)
                print(f"wrote {out.relative_to(ASSETS.parent)} ({out.stat().st_size // 1024} KB)")
                made += 1
    if missing:
        print(f"skipped (source missing): {', '.join(missing)}")
        print("Drop the PNGs into site/assets/ and re-run.")
    print(f"done — {made} file(s) generated")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
