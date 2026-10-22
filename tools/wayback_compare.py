"""Side-by-side of the historical imagery over the camps, with the photo anchors marked.

Reads data/raw/wayback/scene_<date>.jpg (tools/wayback.py) and web/public/data/objects.json.
Writes <out>.jpg: one panel per acquisition date, cropped to the camps, current photo-based
buildings outlined (red: photo anchors to keep, yellow: current OSM buildings).
Usage: wayback_compare.py out.jpg [x0 z0 size]   (scene metres; default the camp area)
"""
import glob, json, os, sys
from PIL import Image, ImageDraw, ImageFont

D = "data/raw/wayback"
X0, Z0 = -4021.0, 1372.0  # must match tools/wayback.py
out = sys.argv[1]
cx0, cz0, cs = (float(v) for v in sys.argv[2:5]) if len(sys.argv) >= 5 else (-2900.0, 2350.0, 1900.0)
objs = json.load(open("web/public/data/objects.json"))
P = 900
try:
    font = ImageFont.truetype("/System/Library/Fonts/Supplemental/Arial Bold.ttf", 30)
except OSError:
    font = ImageFont.load_default()

panels = []
for f in sorted(glob.glob(f"{D}/scene_*.jpg")):
    date = os.path.basename(f)[6:-4]
    im = Image.open(f)
    box = (int(cx0 - X0), int(cz0 - Z0), int(cx0 - X0 + cs), int(cz0 - Z0 + cs))
    crop = im.crop(box).resize((P, P), Image.LANCZOS)
    dr = ImageDraw.Draw(crop)
    k = P / cs
    for c in objs["cabins"] + objs["yurts"]:
        u, v = (c["x"] - cx0) * k, (c["z"] - cz0) * k
        r = max(4, (c.get("w", 2 * c.get("r", 3)) / 2) * k)
        col = (255, 60, 60) if c["src"].startswith("photo") else (255, 220, 0)
        dr.ellipse((u - r, v - r, u + r, v + r), outline=col, width=2)
    dr.rectangle((0, 0, 230, 44), fill=(0, 0, 0))
    dr.text((10, 6), date, fill=(255, 255, 255), font=font)
    panels.append(crop)

cols = 3 if len(panels) > 4 else 2
rows = (len(panels) + cols - 1) // cols
sheet = Image.new("RGB", (cols * P + (cols - 1) * 8, rows * P + (rows - 1) * 8), "white")
for i, p in enumerate(panels):
    sheet.paste(p, ((i % cols) * (P + 8), (i // cols) * (P + 8)))
sheet.save(out, quality=85)
print(out, len(panels), "panels")
