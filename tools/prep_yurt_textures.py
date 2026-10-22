"""Yurt textures for tools/blender/yurt.py (assets/tex):

  yurt_band_ai.png  the AI ram's-horn band (ref/plant_textures_v3/T06), cropped to the band,
                    1024 x 128, the left and right ends cross-faded so it tiles round the yurt
  chiy.png          the chiy: the reed screen round the foot of the wall, seen in summer when
                    the lower felt is rolled up -- close vertical reeds, each wrapped in wool so
                    that together they draw a stepped diamond pattern (muted red, ochre, black)
"""
import numpy as np
from PIL import Image
from scipy import ndimage

SRC = "ref/plant_textures_v3"
OUT = "assets/tex"

# ---------------------------------------------------------------- band
im = Image.open(f"{SRC}/T06_yurt_band.png").convert("RGBA")
a = np.asarray(im)[..., 3] > 128
rows, cols = np.nonzero(a.any(1))[0], np.nonzero(a.any(0))[0]
band = im.crop((cols.min() + 4, rows.min() + 2, cols.max() - 4, rows.max() - 2)).convert("RGB")
# tile by the pattern's own period: autocorrelation along the band, then a whole number of
# periods cropped and scaled to the texture width (the ends then meet without a seam)
g = np.asarray(band.convert("L"), np.float32)
g = g - g.mean(0, keepdims=True).mean()
wb = g.shape[1]
best, per = -1e9, None
for p in range(wb // 6, wb // 2):
    c = float((g[:, :-p] * g[:, p:]).mean())
    if c > best:
        best, per = c, p
k = wb // per
x0 = (wb - k * per) // 2
band = band.crop((x0, 0, x0 + k * per, band.height))
print("band period", per, "px, periods", k)
W, H = 1024, 128
Image.fromarray(np.asarray(band.resize((W, H), Image.LANCZOS))).save(f"{OUT}/yurt_band_ai.png")

# ---------------------------------------------------------------- chiy (reed screen)
W, H = 512, 128
rng = np.random.default_rng(2)
x = np.arange(W)[None, :]
y = np.arange(H)[:, None]
reed_w = 4
reed = (x // reed_w)
edge = np.abs((x % reed_w) - (reed_w - 1) / 2) / (reed_w / 2)
shade = 1 - 0.45 * edge ** 2                                  # round reeds
straw = np.array([0.72, 0.6, 0.38]) * (0.85 + 0.3 * rng.random(W // reed_w + 1))[reed][..., None]
# stepped diamonds: the wool wrapping changes colour where |dx| + |dy| crosses bands
cx = (reed % 16) - 7.5
cy = (y / H - 0.5) * 16
dd = np.abs(cx) + np.abs(cy)
pal = np.array([[0.55, 0.12, 0.08], [0.1, 0.07, 0.06], [0.75, 0.5, 0.15], [0.55, 0.12, 0.08]])
idx = (dd // 2.2).astype(int)
wool = pal[np.clip(idx, 0, 3)]
wrapped = (dd < 8.8)[..., None]
col = np.where(wrapped, wool * 0.8 + straw * 0.2, straw) * shade[..., None]   # (wool a little faded)
col *= (0.9 + 0.1 * np.sin(y * 0.9))[..., None]              # the wool's winding
Image.fromarray((col.clip(0, 1) * 255).astype(np.uint8)).save(f"{OUT}/chiy.png")
print("written yurt_band_ai.png, chiy.png")
