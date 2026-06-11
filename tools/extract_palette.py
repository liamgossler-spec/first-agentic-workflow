"""Extract a brand color palette from a logo image and write it to brand.yaml.

Pillow reads the logo, composites it onto white (so transparent PNGs don't bias
toward black), quantizes to a handful of dominant colors, drops near-white and
near-black, and ranks the rest by how much area they cover. The top colors become
primary / secondary / accent. Results are merged into brand.yaml (existing keys
like company_name and fonts are preserved).

Run standalone:
    python tools/extract_palette.py --logo brand/logo.png
    python tools/extract_palette.py --logo brand/logo.png --out brand/brand.yaml
"""
from __future__ import annotations

import argparse
import json
import sys
from collections import Counter
from pathlib import Path

import yaml
from PIL import Image

from config import ROOT

DEFAULT_LOGO = ROOT / "brand" / "logo.png"
DEFAULT_OUT = ROOT / "brand" / "brand.yaml"


def _hex(rgb: tuple[int, int, int]) -> str:
    return "#{:02x}{:02x}{:02x}".format(*rgb)


def _is_neutral(rgb: tuple[int, int, int]) -> bool:
    """True for near-white, near-black, or near-grey colors we don't want as brand hues."""
    r, g, b = rgb
    if min(r, g, b) > 235:          # near white
        return True
    if max(r, g, b) < 25:           # near black
        return True
    if max(r, g, b) - min(r, g, b) < 12:  # low saturation (grey)
        return True
    return False


def extract_palette(logo_path: Path, n_colors: int = 8) -> list[str]:
    """Return brand hex colors ranked by coverage (most dominant first)."""
    img = Image.open(logo_path).convert("RGBA")
    # Composite onto a white background so transparency reads as white, not black.
    background = Image.new("RGBA", img.size, (255, 255, 255, 255))
    img = Image.alpha_composite(background, img).convert("RGB")

    # Quantize to a small palette, then count pixels assigned to each palette entry.
    quantized = img.quantize(colors=max(n_colors * 2, 16), method=Image.Quantize.FASTOCTREE)
    palette = quantized.getpalette()
    counts = Counter(quantized.getdata())

    ranked: list[tuple[int, tuple[int, int, int]]] = []
    for idx, count in counts.most_common():
        rgb = (palette[idx * 3], palette[idx * 3 + 1], palette[idx * 3 + 2])
        if _is_neutral(rgb):
            continue
        ranked.append((count, rgb))

    hexes = [_hex(rgb) for _, rgb in ranked[:n_colors]]
    return hexes


def main(logo: str, out: str) -> dict:
    logo_path = Path(logo)
    if not logo_path.is_absolute():
        logo_path = ROOT / logo_path
    if not logo_path.exists():
        raise FileNotFoundError(
            f"Logo not found at {logo_path}. Drop your logo into brand/ first."
        )

    out_path = Path(out)
    if not out_path.is_absolute():
        out_path = ROOT / out_path

    hexes = extract_palette(logo_path)
    if not hexes:
        raise RuntimeError(
            "Could not extract any non-neutral colors from the logo. "
            "If the logo is black/white only, set palette colors manually in brand.yaml."
        )

    # Map ranked colors to roles, with sensible fallbacks if fewer than 3 were found.
    primary = hexes[0]
    secondary = hexes[1] if len(hexes) > 1 else primary
    accent = hexes[2] if len(hexes) > 2 else secondary

    # Merge into existing brand.yaml so we don't clobber company_name / fonts / tagline.
    brand: dict = {}
    if out_path.exists():
        brand = yaml.safe_load(out_path.read_text()) or {}

    brand.setdefault("company_name", "")
    brand.setdefault("tagline", "")
    brand["palette"] = {
        "primary": primary,
        "secondary": secondary,
        "accent": accent,
        "text": "#1a1a1a",
        "muted": "#6b7280",
        "background": "#ffffff",
        "all_detected": hexes,
    }
    brand.setdefault("fonts", {"heading": "Inter", "body": "Inter"})
    brand.setdefault("logo", "brand/logo.png")

    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(yaml.safe_dump(brand, sort_keys=False, allow_unicode=True))

    return {
        "status": "ok",
        "logo": str(logo_path.relative_to(ROOT)),
        "brand_file": str(out_path.relative_to(ROOT)),
        "primary": primary,
        "secondary": secondary,
        "accent": accent,
        "all_detected": hexes,
    }


if __name__ == "__main__":
    p = argparse.ArgumentParser(description="Extract a brand palette from a logo.")
    p.add_argument("--logo", default=str(DEFAULT_LOGO), help="Path to the logo image.")
    p.add_argument("--out", default=str(DEFAULT_OUT), help="brand.yaml to write/merge.")
    args = p.parse_args()
    try:
        print(json.dumps(main(args.logo, args.out), indent=2))
    except Exception as exc:  # fail loud, non-zero exit for the agent to catch
        print(json.dumps({"status": "error", "error": str(exc)}), file=sys.stderr)
        sys.exit(1)
