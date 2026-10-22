"""Spruce atlas for tools/blender/spruce2.py: assets/tex/spruce_atlas.png (2048 x 1024 RGBA) +
assets/tex/spruce_atlas.json (UV rects in Blender convention, v up).

  left  S01 side branch, turned so its axis is vertical with the base (stem, longest twigs) at
        the bottom; the cones are taken out (red-brown blobs read as baubles on every branch --
        Schrenk spruce carries its cones at the top of the crown)
  right S02 tree top, base at the bottom
"""
import json
import numpy as np
from PIL import Image
from scipy import ndimage

SRC = "ref/plant_textures_v3"
OUT = "assets/tex"
S = 1024


def upright(im):
    """rotate so the silhouette's long axis is vertical"""
    a = np.asarray(im, np.float32)[..., 3]
    ys, xs = np.nonzero(a > 128)
    w, v = np.linalg.eigh(np.cov(np.stack([xs - xs.mean(), ys - ys.mean()])))
    ang = np.degrees(np.arctan2(v[0, 1], v[1, 1]))
    ang = (ang + 90) % 180 - 90
    return im.rotate(-ang, resample=Image.BICUBIC, expand=True)


def fit(im):
    im = im.crop(im.getbbox())
    k = S / max(im.width, im.height)
    im = im.resize((max(1, round(im.width * k)), max(1, round(im.height * k))), Image.LANCZOS)
    out = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    out.paste(im, ((S - im.width) // 2, (S - im.height) // 2))
    return np.asarray(out, np.float32) / 255, im.width / S, im.height / S


br = upright(Image.open(f"{SRC}/S01_spruce_branch.png").convert("RGBA"))
# base = the wide end (longest twigs, the cut stem); put it at the bottom
a = np.asarray(br)[..., 3] > 128
rows = np.nonzero(a.any(1))[0]
top, bot = rows.min(), rows.max()
q = (bot - top) // 4
wide_top = a[top:top + q].sum(1).mean() > a[bot - q:bot].sum(1).mean()
if wide_top:
    br = br.rotate(180)
b, bw, bh = fit(br)
# cones: red-brown blobs (the brown stems are thin and survive the opening)
r, g, bl, al = b[..., 0], b[..., 1], b[..., 2], b[..., 3]
red = (r > g * 1.2) & (r > bl * 1.35) & (al > 0.3)
cones = ndimage.binary_opening(red, structure=np.ones((9, 9)))
lab, n = ndimage.label(cones)
area = ndimage.sum(cones, lab, range(1, n + 1))
cones = np.isin(lab, 1 + np.nonzero(area > 1500)[0])          # the big blobs only, not the stem
cones = ndimage.binary_dilation(cones, iterations=5)
b[..., 3][cones] = 0
print("cone pixels removed", int(cones.sum()))
t, tw, th = fit(Image.open(f"{SRC}/S02_spruce_top.png").convert("RGBA"))
atlas = np.concatenate([b, t], 1)
# bleed colour into the transparent texels for clean mip-maps
solid = atlas[..., 3] > 0.5
idx = ndimage.distance_transform_edt(~solid, return_distances=False, return_indices=True)
atlas[..., :3] = atlas[..., :3][idx[0], idx[1]]
Image.fromarray((np.clip(atlas, 0, 1) * 255).round().astype(np.uint8), "RGBA").save(f"{OUT}/spruce_atlas.png", optimize=True)
rect = lambda i, w, h: [i * 0.5 + (1 - w) / 4, (1 - h) / 2, i * 0.5 + (1 + w) / 4, (1 + h) / 2]
meta = {"branch": rect(0, bw, bh), "branch_aspect": bw / bh, "top": rect(1, tw, th), "top_aspect": tw / th}
json.dump(meta, open(f"{OUT}/spruce_atlas.json", "w"), indent=1)
print(meta)
