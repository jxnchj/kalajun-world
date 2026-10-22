"""Trace the pre-tourism layout (2013 imagery, tools/wayback.py) around the camps.

Candidates are found automatically, then reviewed by eye on the overlay sheets:
  farmsteads  bare, trampled yards (low greenness, 150-6000 m2, not elongated) with some
              local roof contrast inside -- the Kazakh winter camps (house + sheep fold)
  tracks      thin light-bare lines: ridge filter at 1.5-3 m on "bareness", skeletonised,
              short spurs pruned, simplified to polylines
Writes data/layout/candidates.json and review sheets <out>_*.jpg with scene-metre grids.
Usage: trace_layout.py <out-prefix> [date]
"""
import json, os, sys
import numpy as np
from PIL import Image, ImageDraw, ImageFont
from scipy import ndimage
from skimage.filters import sato
from skimage.morphology import skeletonize, remove_small_objects
from skimage.measure import label, regionprops

X0, Z0, SIZE = -4021.0, 1372.0, 4096
out = sys.argv[1]
date = sys.argv[2] if len(sys.argv) > 2 else "2013-09-20"
os.makedirs("data/layout", exist_ok=True)
rgb = np.asarray(Image.open(f"data/raw/wayback/scene_{date}.jpg").convert("RGB"), np.float32) / 255
r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
lum = rgb @ np.array([0.3, 0.55, 0.15], np.float32)
exg = (2 * g - r - b) / np.maximum(r + g + b, 1e-3)          # excess green, normalised
forest = ndimage.uniform_filter((lum < 0.16).astype(np.float32), 25) > 0.45
bare = np.clip(0.12 - exg, 0, None) * 6 + np.clip(lum - ndimage.uniform_filter(lum, 41), 0, None) * 2

# ---- farmsteads -------------------------------------------------------------------------
bs = ndimage.gaussian_filter(bare, 3)
yard = (bs > np.percentile(bs[~forest], 96)) & ~forest
yard = ndimage.binary_opening(yard, iterations=2)
lab = label(yard)
contrast = ndimage.gaussian_filter(np.abs(lum - ndimage.gaussian_filter(lum, 2)), 3)
farms = []
for p in regionprops(lab):
    if not (150 <= p.area <= 6000):
        continue
    if p.major_axis_length > 4.5 * max(p.minor_axis_length, 1):   # tracks and gully banks
        continue
    cz, cx = p.centroid
    c = float(contrast[p.coords[:, 0], p.coords[:, 1]].mean())
    farms.append({"x": round(X0 + cx, 1), "z": round(Z0 + cz, 1), "area": int(p.area), "contrast": round(c, 4)})
cvals = np.array([f["contrast"] for f in farms])
thr = np.percentile(cvals, 35) if len(cvals) else 0
farms = [f for f in farms if f["contrast"] >= thr]

# ---- tracks -------------------------------------------------------------------------------
ridge = sato(ndimage.gaussian_filter(bare, 0.7), sigmas=[1.5, 2.5], black_ridges=False)
ridge[forest] = 0
tr = ridge > np.percentile(ridge, 93)
tr = remove_small_objects(tr, 120)
sk = skeletonize(tr)
sk = remove_small_objects(sk, 60, connectivity=2)
np.save("data/layout/track_skeleton.npy", np.packbits(sk))
json.dump({"date": date, "farms": farms}, open("data/layout/candidates.json", "w"), indent=0)
print(len(farms), "farm candidates;", int(sk.sum()), "m of track skeleton")

# ---- review sheets: 4x4 tiles of 1024 m, grid every 100 m -----------------------------------
font = ImageFont.truetype("/System/Library/Fonts/Supplemental/Arial.ttf", 14)
base = Image.open(f"data/raw/wayback/scene_{date}.jpg").convert("RGB")
ov = np.asarray(base).copy()
ov[sk] = (255, 40, 200)
base = Image.fromarray(ov)
for ty in range(4):
    for tx in range(4):
        x0, z0 = tx * 1024, ty * 1024
        t = base.crop((x0, z0, x0 + 1024, z0 + 1024))
        dr = ImageDraw.Draw(t)
        for v in range(0, 1025, 100):
            pass
        sx, sz = X0 + x0, Z0 + z0
        for gx in range(int(np.ceil(sx / 100) * 100), int(sx + 1024), 100):
            u = gx - sx
            dr.line((u, 0, u, 1024), fill=(255, 255, 255), width=1)
            dr.text((u + 2, 2), str(gx), fill=(255, 255, 0), font=font)
        for gz in range(int(np.ceil(sz / 100) * 100), int(sz + 1024), 100):
            w = gz - sz
            dr.line((0, w, 1024, w), fill=(255, 255, 255), width=1)
            dr.text((2, w + 2), str(gz), fill=(255, 255, 0), font=font)
        for i, f in enumerate(farms):
            u, w = f["x"] - sx, f["z"] - sz
            if 0 <= u < 1024 and 0 <= w < 1024:
                rr = max(8, np.sqrt(f["area"] / np.pi) + 4)
                dr.ellipse((u - rr, w - rr, u + rr, w + rr), outline=(0, 255, 255), width=2)
                dr.text((u + rr, w - rr), str(i), fill=(0, 255, 255), font=font)
        t.save(f"{out}_{ty}{tx}.jpg", quality=85)
