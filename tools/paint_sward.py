"""Top-down texture of the lower sward (short leaves lying every which way), tileable, for the
ground under the modelled grass blades near the camera (terrain.js). One tile = 0.8 m.

Thousands of tapered leaf strokes in three layers (shaded bottom, mid, sunlit top), flowing in
patches, in the hues of the meadow grasses (fresh, blue-green fescue, yellow-green bluegrass),
a few straw-coloured old leaves and dark gaps between them. Painted on a 3x3 wrap so the tile
repeats seamlessly. Writes web/public/assets/sward_top.png (sRGB) and prints its mean linear
colour (terrain.js normalises the texture by it and tints it with the local meadow colour).
"""
import math
import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage

N = 1024
rng = np.random.default_rng(11)
S = 3 * N
img = Image.new("RGB", (S, S), (10, 20, 6))
d = ImageDraw.Draw(img)

# flow field: leaves in a patch tend to lie the same way
g = rng.random((8, 8))
flow = ndimage.zoom(np.tile(g, (3, 3)), S / 24, order=3) * 2 * math.pi

PAL = [(52, 92, 30), (70, 112, 36), (58, 96, 58), (86, 120, 40), (44, 80, 34), (96, 128, 52), (66, 104, 46)]
STRAW = [(128, 112, 62), (110, 94, 50)]


def stroke(x, y, ang, length, width, col):
    # tapered leaf: a polygon from a wide base to a pointed tip, slightly curved
    pts_l, pts_r = [], []
    bend = rng.normal(0, 0.25)
    for i in range(7):
        t = i / 6
        a = ang + bend * t
        px = x + math.cos(ang) * length * t + math.cos(a + math.pi / 2) * bend * length * 0.1 * t * t
        py = y + math.sin(ang) * length * t + math.sin(a + math.pi / 2) * bend * length * 0.1 * t * t
        w = width * (1 - t) ** 0.7 * 0.5
        nx, ny = math.cos(a + math.pi / 2), math.sin(a + math.pi / 2)
        pts_l.append((px + nx * w, py + ny * w))
        pts_r.append((px - nx * w, py - ny * w))
    d.polygon(pts_l + pts_r[::-1], fill=col)
    # a lighter midrib line on the upper half of the leaf
    hi = tuple(min(255, int(c * 1.25 + 8)) for c in col)
    d.line([pts_l[0][0] * 0.5 + pts_r[0][0] * 0.5, pts_l[0][1] * 0.5 + pts_r[0][1] * 0.5,
            (pts_l[4][0] + pts_r[4][0]) / 2, (pts_l[4][1] + pts_r[4][1]) / 2], fill=hi, width=1)


for layer, (count, shade) in enumerate([(9000, 0.55), (9000, 0.8), (7000, 1.05)]):
    for _ in range(count):
        x, y = rng.uniform(N, 2 * N), rng.uniform(N, 2 * N)
        ang = flow[int(y) % S, int(x) % S] + rng.normal(0, 0.6)
        length = rng.uniform(28, 95)
        width = rng.uniform(3, 9)
        if rng.random() < 0.05:
            col = STRAW[rng.integers(2)]
        else:
            col = PAL[rng.integers(len(PAL))]
        col = tuple(int(np.clip(c * shade * rng.uniform(0.85, 1.15), 0, 255)) for c in col)
        # paint in all 9 wrapped copies that could touch the centre tile
        for ox in (-N, 0, N):
            for oy in (-N, 0, N):
                stroke(x + ox, y + oy, ang, length, width, col)

tile = np.asarray(img, np.float32)[N:2 * N, N:2 * N] / 255
tile = ndimage.gaussian_filter(tile, (0.5, 0.5, 0))
Image.fromarray((tile * 255).astype(np.uint8)).save("web/public/assets/sward_top.png", optimize=True)
lin = np.where(tile <= 0.04045, tile / 12.92, ((tile + 0.055) / 1.055) ** 2.4)
print("mean linear colour", np.round(lin.reshape(-1, 3).mean(0), 4))
