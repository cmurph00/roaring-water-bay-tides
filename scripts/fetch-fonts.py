#!/usr/bin/env python3
"""One-time helper: download the app's self-hosted webfonts (OFL, redistributable)
from Google Fonts' gstatic CDN into ./fonts/, so the app renders correctly OFFLINE
(no runtime CDN @import). Re-runnable/idempotent. The downloaded .woff2 files are the
committed, shipped artifacts; this script just reproduces them.

Fonts (all SIL Open Font License 1.1):
  - Bitter        (display/headings)      weights 500, 700
  - Space Grotesk (UI / body / labels)    variable 300..700 (single file)
  - Space Mono    (tide-time numerals)    weights 400, 700

Only the `latin` subset is taken — it covers basic Latin + Latin-1 supplement,
which includes the Irish fada (áéíóú / ÁÉÍÓÚ, U+00C1..U+00FA). Verified per-file below.
"""
import re
import sys
import urllib.request
from pathlib import Path

UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36"
FONTS_DIR = Path(__file__).resolve().parent.parent / "fonts"

# (css2 query, output basename per weight). Variable fonts use a single "var" file.
SPECS = [
    ("Bitter:wght@500;700", "bitter"),
    ("Space+Grotesk:wght@300..700", "space-grotesk"),
    ("Space+Mono:wght@400;700", "space-mono"),
]

# Fada code points that MUST survive in the latin subset (Irish long vowels).
FADA = [0x00E1, 0x00E9, 0x00ED, 0x00F3, 0x00FA, 0x00C1, 0x00C9, 0x00CD, 0x00D3, 0x00DA]


def fetch(url: str) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=30) as r:
        return r.read()


def parse_latin_faces(css: str):
    """Yield (font_family, weight, url) for the `latin` subset blocks only."""
    # Split on subset comments; keep the comment label with the block that follows.
    parts = re.split(r"/\*\s*([\w-]+)\s*\*/", css)
    # parts = [pre, label1, block1, label2, block2, ...]
    for i in range(1, len(parts) - 1, 2):
        label, block = parts[i], parts[i + 1]
        if label != "latin":
            continue
        fam = re.search(r"font-family:\s*'([^']+)'", block)
        wght = re.search(r"font-weight:\s*([\d ]+);", block)
        url = re.search(r"url\((https://[^)]+\.woff2)\)", block)
        if fam and wght and url:
            yield fam.group(1), wght.group(1).strip().replace(" ", "-"), url.group(1)


def main():
    FONTS_DIR.mkdir(exist_ok=True)
    written = []
    for query, base in SPECS:
        css = fetch(f"https://fonts.googleapis.com/css2?family={query}&display=swap").decode()
        faces = list(parse_latin_faces(css))
        if not faces:
            sys.exit(f"ERROR: no latin @font-face found for {query}")
        variable = ".." in query
        for fam, wght, url in faces:
            name = f"{base}-var.woff2" if variable else f"{base}-{wght}.woff2"
            out = FONTS_DIR / name
            out.write_bytes(fetch(url))
            written.append((name, out.stat().st_size))
            print(f"  {name:26} {out.stat().st_size // 1024:>4} KB  ({fam} {wght})")

    total = sum(sz for _, sz in written)
    print(f"Wrote {len(written)} files, {total // 1024} KB total, to {FONTS_DIR}")

    # Fada sanity check: assert each downloaded font has the Irish long-vowel glyphs.
    from fontTools.ttLib import TTFont  # type: ignore
    for name, _ in written:
        f = TTFont(FONTS_DIR / name)
        cmap = f.getBestCmap()
        missing = [hex(cp) for cp in FADA if cp not in cmap]
        if missing:
            sys.exit(f"ERROR: {name} missing fada code points {missing}")
    print(f"Fada check passed on all {len(written)} files (áéíóú / ÁÉÍÓÚ present).")


if __name__ == "__main__":
    main()
