"""Walk-in consistency sheet: the same flower patch shot from 400, 150, 60, 25, 8 m and from
inside it (devtools __walkin), one row per patch. Each frame's centre window (the patch) is
measured: mean colour, and the share of pixels that are clearly not green sward (hue outside
the grass band or very pale) -- which should stay about the same at every distance.
Usage: walkin.py out.jpg prefix site1 site2 ...
"""
import colorsys, sys
import numpy as np
from PIL import Image, ImageDraw, ImageFont

out, prefix, sites = sys.argv[1], sys.argv[2], sys.argv[3:]
D = [400, 150, 60, 25, 8, 0]
W = 360
font = ImageFont.truetype("/System/Library/Fonts/Supplemental/Arial.ttf", 15)
rows = []
for s in sites:
    ims, stats = [], []
    for d in D:
        im = Image.open(f"docs/snapshots/{prefix}_{s}_{d:03d}.jpg").convert("RGB")
        a = np.asarray(im, np.float32) / 255
        h, w = a.shape[:2]
        # the patch: a window round the screen centre (lower half when standing in it)
        win = a[int(h * 0.62):int(h * 0.9), int(w * 0.3):int(w * 0.7)] if d == 0 else a[int(h * 0.45):int(h * 0.55), int(w * 0.44):int(w * 0.56)]
        px = win.reshape(-1, 3)
        hsv = np.array([colorsys.rgb_to_hsv(*p) for p in px[:: max(1, len(px) // 4000)]])
        hue, sat, val = hsv[:, 0] * 360, hsv[:, 1], hsv[:, 2]
        # petals: yellow/orange (hue < 52), pink-violet-blue (hue > 175) and saturated, or near-white;
        # golden-lit grass (hue 55-90) is sward, not flowers
        flower = (((hue < 52) | (hue > 175)) & (sat > 0.35) & (val > 0.3)) | ((sat < 0.12) & (val > 0.72))
        stats.append((px.mean(0), flower.mean()))
        t = im.resize((W, round(W * h / w)))
        dr = ImageDraw.Draw(t)
        if d == 0:
            dr.rectangle((W * 0.3, t.height * 0.62, W * 0.7, t.height * 0.9), outline=(255, 255, 255))
        else:
            dr.rectangle((W * 0.44, t.height * 0.45, W * 0.56, t.height * 0.55), outline=(255, 255, 255))
        m = stats[-1][0]
        dr.rectangle((0, 0, W, 22), fill=(0, 0, 0))
        dr.rectangle((W - 40, 3, W - 4, 19), fill=tuple(int(c * 255) for c in m))
        dr.text((4, 3), f"{s}  {d} m  flowers {stats[-1][1] * 100:.0f}%", fill=(255, 255, 255), font=font)
        ims.append(t)
    row = Image.new("RGB", (len(ims) * (W + 4), ims[0].height), "white")
    for i, t in enumerate(ims):
        row.paste(t, (i * (W + 4), 0))
    rows.append(row)
    print(s, "  ".join(f"{d}m:{f * 100:4.0f}%" for d, (_, f) in zip(D, stats)))
sheet = Image.new("RGB", (rows[0].width, sum(r.height + 4 for r in rows)), "white")
y = 0
for r in rows:
    sheet.paste(r, (0, y)); y += r.height + 4
sheet.save(out, quality=85)
