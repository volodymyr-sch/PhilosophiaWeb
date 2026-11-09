# Makes website/assets/images/night-sky.svg: the still night behind the reading pages.
# The same idea as the home page (home.js): a faint star map with Greek star names,
# two dotted circles around a pole above the screen, marks every 5 degrees on the inner one.
# styles.css puts it behind the pages, with fine grain on top. Run from the repo root:
# python3 tools/make_night_sky.py
import math
import random
from pathlib import Path

W, H = 1600, 1000
POLE = (1150, -200)
RINGS = (560, 960)
NAMES = "αβγδεζηθικλμνξοπρστυφχψω"
rand = random.Random(7)  # the same sky every time

parts = []
ring_style = 'fill="none" stroke="#fff" stroke-opacity="0.13" stroke-dasharray="1 5"'
for ring in RINGS:
    parts.append(f'<circle cx="{POLE[0]}" cy="{POLE[1]}" r="{ring}" {ring_style}/>')

marks = []
for mark in range(72):
    angle = math.radians(mark * 5)
    inner = RINGS[0] - (11 if mark % 6 == 0 else 5)
    c, s = math.cos(angle), math.sin(angle)
    x1, y1 = POLE[0] + c * RINGS[0], POLE[1] + s * RINGS[0]
    x2, y2 = POLE[0] + c * inner, POLE[1] + s * inner
    if max(y1, y2) > 0:
        marks.append(f"M{x1:.1f} {y1:.1f}L{x2:.1f} {y2:.1f}")
parts.append(f'<path d="{"".join(marks)}" stroke="#fff" stroke-opacity="0.16"/>')

named = 0
for _ in range(260):
    x, y = rand.uniform(0, W), rand.uniform(0, H)
    size = 0.5 + rand.random() ** 3 * 1.3
    light = (0.25 + 0.6 * rand.random() ** 1.5) * (1 - 0.6 * y / H)  # fewer bright stars low down
    parts.append(f'<circle cx="{x:.1f}" cy="{y:.1f}" r="{size:.2f}" fill="#fff" fill-opacity="{light:.2f}"/>')
    if size > 1.25 and named < 14:
        parts.append(
            f'<text x="{x + 3:.1f}" y="{y - 4:.1f}" fill="#fff" fill-opacity="{light * 0.6:.2f}" '
            f'font-family="Georgia, serif" font-size="13">{NAMES[named % len(NAMES)]}</text>'
        )
        named += 1

svg = f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}">\n' + "\n".join(parts) + "\n</svg>\n"
out = Path(__file__).resolve().parent.parent / "website/assets/images/night-sky.svg"
out.write_text(svg, encoding="utf-8")
print(f"Wrote {out} ({len(svg.encode())} bytes, {named} named stars)")
