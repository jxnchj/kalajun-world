"""Butterfly atlas for web/src/butterflies.js: web/public/assets/butterflies.png, 1536 x 512 RGBA,
one 512 slot per species (K01 Apollo, K02 common blue, K03 small tortoiseshell), top-down with
the head up and the body on the slot's vertical centre line (the renderer hinges each wing
there). Each butterfly is cropped to its wings, centred on its body and padded to a square.
"""
import numpy as np
from PIL import Image
from scipy import ndimage

SRC = "ref/plant_textures_v3"
NAMES = ["K01_butterfly_apollo", "K02_butterfly_blue", "K03_butterfly_tortoiseshell"]
S = 512
atlas = np.zeros((S, 3 * S, 4), np.float32)
for i, n in enumerate(NAMES):
    im = Image.open(f"{SRC}/{n}.png").convert("RGBA")
    a = np.asarray(im, np.float32) / 255
    al = a[..., 3] > 0.5
    # drop the antennae from the crop box (thin lines above the wings): rows with few pixels
    rows = al.sum(1)
    wing_rows = np.nonzero(rows > 0.15 * rows.max())[0]
    cols = np.nonzero(al.any(0))[0]
    y0, y1 = wing_rows.min(), wing_rows.max()
    x0, x1 = cols.min(), cols.max()
    cx = (x0 + x1) / 2                   # symmetric wings: the body is the middle
    half = max(cx - x0, x1 - cx, (y1 - y0) / 2) * 1.04
    cy = (y0 + y1) / 2
    box = (round(cx - half), round(cy - half), round(cx + half), round(cy + half))
    crop = im.crop(box).resize((S, S), Image.LANCZOS)
    atlas[:, i * S:(i + 1) * S] = np.asarray(crop, np.float32) / 255
    print(n, "box", box, "span", round(2 * half))
solid = atlas[..., 3] > 0.5
idx = ndimage.distance_transform_edt(~solid, return_distances=False, return_indices=True)
atlas[..., :3] = atlas[..., :3][idx[0], idx[1]]
Image.fromarray((np.clip(atlas, 0, 1) * 255).round().astype(np.uint8), "RGBA").save("web/public/assets/butterflies.png", optimize=True)
