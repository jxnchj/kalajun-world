"""Method 1: pack the AI-painted sprites (ref/textures) into one atlas for the vegetation.

2048 x 2048 RGBA, origin top-left:
  row 0 (512 px):  A1a pink, A1b magenta, A1c white, A1d lilac  (front heads, centred;
                   same size so the shader can swap colours by shifting u by 0.25)
  row 1 (512 px):  A2 side head, A4 bud, A3 petal, A5 foliage sprig (bottom-anchored)
  rows 2-3 (1024): A6 whole plant, B1a grass clump (bottom-anchored)
Transparent texels get the nearest opaque colour (no dark fringes in mip-maps).
Output web/public/assets/ai_atlas.png + ai_atlas.json.
"""
import json, os
import numpy as np
from PIL import Image
from scipy import ndimage

SRC = "ref/textures"
W = H = 2048
atlas = np.zeros((H, W, 4), np.float32)
rects = {}
SLOTS = [
    ("A1a_cosmos_front_pink", "head_pink", 0, 0, 512, 512, "centre"),
    ("A1b_cosmos_front_magenta", "head_magenta", 512, 0, 512, 512, "centre"),
    ("A1c_cosmos_front_white", "head_white", 1024, 0, 512, 512, "centre"),
    ("A1d_cosmos_front_lilac", "head_lilac", 1536, 0, 512, 512, "centre"),
    ("A2_cosmos_side_pink", "head_side", 0, 512, 512, 512, "bottom"),
    ("A4_cosmos_bud", "bud", 512, 512, 512, 512, "bottom"),
    ("A3_cosmos_single_petal_white", "petal", 1024, 512, 512, 512, "bottom"),
    ("A5_cosmos_foliage_sprig", "sprig", 1536, 512, 512, 512, "bottom"),
    ("A6_cosmos_whole_plant", "plant", 0, 1024, 1024, 1024, "bottom"),
    ("B1a_grass_clump_side", "grass", 1024, 1024, 1024, 1024, "bottom"),
]
for fname, key, x0, y0, sw, sh, anchor in SLOTS:
    im = np.asarray(Image.open(f"{SRC}/{fname}.png").convert("RGBA"), np.float32) / 255
    a = im[..., 3]
    ys, xs = np.nonzero(a > 0.02)
    if anchor == "centre":  # keep the flower centre (alpha-weighted centroid) in the middle
        cy, cx = ndimage.center_of_mass(a)
        r = max(cx - xs.min(), xs.max() - cx, cy - ys.min(), ys.max() - cy) + 4
        crop = im[int(max(0, cy - r)):int(cy + r), int(max(0, cx - r)):int(cx + r)]
    else:
        crop = im[ys.min():ys.max() + 1, xs.min():xs.max() + 1]
    ch, cw = crop.shape[:2]
    s = min((sw - 8) / cw, (sh - 4) / ch)
    img = Image.fromarray((crop * 255).astype(np.uint8), "RGBA").resize((max(1, round(cw * s)), max(1, round(ch * s))), Image.LANCZOS)
    arr = np.asarray(img, np.float32) / 255
    ox = x0 + (sw - arr.shape[1]) // 2
    oy = y0 + ((sh - arr.shape[0]) // 2 if anchor == "centre" else sh - arr.shape[0])
    atlas[oy:oy + arr.shape[0], ox:ox + arr.shape[1]] = arr
    rects[key] = [x0 / W, y0 / H, (x0 + sw) / W, (y0 + sh) / H]
# bleed colour into transparent texels
solid = atlas[..., 3] > 0.5
idx = ndimage.distance_transform_edt(~solid, return_distances=False, return_indices=True)
atlas[..., :3] = atlas[..., :3][idx[0], idx[1]]
Image.fromarray((np.clip(atlas, 0, 1) * 255).astype(np.uint8), "RGBA").save("web/public/assets/ai_atlas.png", optimize=True)
json.dump(rects, open("web/public/assets/ai_atlas.json", "w"), indent=1)
print(os.path.getsize("web/public/assets/ai_atlas.png") // 1024, "KB", list(rects))
