"""Shrub atlas (third texture batch, sheets E and F): web/public/assets/shrubs.png, 2048 x 1024 RGBA
  row 0: whole shrubs F01 rose, F02 spiraea, F03 honeysuckle, F04 juniper (side views, base at the
         bottom centre of the slot, as tools/split_sheet.py placed them)
  row 1: sprigs F01s-F04s (same order)
and shrubs.json: per species the rect of each part, the crown's width/height and height/slot
ratios (so the renderer sizes the cards without distorting the painting) and the mean linear
colour of the foliage (the far-view tint of shrubby ground).
"""
import glob, json
import numpy as np
from PIL import Image
from scipy import ndimage

SRC = "ref/plant_textures_v3"
OUT = "web/public/assets"
NAMES = ["rose", "spiraea", "honeysuckle", "juniper"]
W, H, S = 2048, 1024, 512
atlas = np.zeros((H, W, 4), np.float32)
lin = lambda c: np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)
meta = {}
for i, n in enumerate(NAMES):
    info = {}
    for row, suffix in ((0, ""), (1, "s")):
        f = glob.glob(f"{SRC}/F0{i + 1}{suffix}_*.png")[0]
        im = Image.open(f).convert("RGBA").resize((S, S), Image.LANCZOS)
        a = np.asarray(im, np.float32) / 255
        al = a[..., 3]
        ys, xs = np.nonzero(al > 0.5)
        # bleed colour into transparent texels (clean mip-maps)
        solid = al > 0.5
        idx = ndimage.distance_transform_edt(~solid, return_distances=False, return_indices=True)
        a[..., :3] = a[..., :3][idx[0], idx[1]]
        atlas[row * S:(row + 1) * S, i * S:(i + 1) * S] = a
        key = "whole" if row == 0 else "sprig"
        info[key] = [i * S / W, row * S / H, (i + 1) * S / W, (row + 1) * S / H]
        if row == 0:
            h = (ys.max() - ys.min() + 1) / S
            w = (xs.max() - xs.min() + 1) / S
            info["aspect"] = round(float(w / h), 3)          # crown width / height
            info["hFrac"] = round(float(h), 3)                # shrub height / slot size
            px = a[..., :3][solid]
            info["col"] = [round(float(c), 3) for c in lin(px).mean(0)]
            info["fill"] = round(float(solid.sum() / ((ys.max() - ys.min() + 1) * (xs.max() - xs.min() + 1))), 3)
    meta[n] = info
Image.fromarray((np.clip(atlas, 0, 1) * 255).round().astype(np.uint8), "RGBA").save(f"{OUT}/shrubs.png", optimize=True)
json.dump(meta, open(f"{OUT}/shrubs.json", "w"), indent=1)
for n, v in meta.items():
    print(n, "aspect", v["aspect"], "hFrac", v["hFrac"], "fill", v["fill"], "col", v["col"])
