"""Meadow flora over the whole 20 km core (16 m/px), so flower colour reads at any distance.

Same 12 species and channel order as tools/veg_map.py (which stays the 2 m map for the 2 km
square around the camps). Habitat comes from the real terrain: moisture (hollows, north
aspect), dryness (south aspect, convex ridges), altitude belts, forest edges, bare ground.
Flowers grow in drifts: a large-scale swath noise (150-400 m) decides where a species is
abundant, a smaller one (30-60 m) breaks the drifts into patches -- the painterly carpets
seen from above, kept to plausible habitats.

Output web/public/data/vegcore.bin.gz (raw uint8) + vegcore.json: one 3840x2560 RGBA atlas of six
1280x1280 layers (row 0 = north), layer k at tile (k % 3, k // 3), so a shader spends a single
texture unit on it (LAYERS below):
  0 cosmos/daisy/poppy/globeflower     1 forgetmenot/geranium/delphinium/campanula
  2 yarrow/dandelion/clover/mantle     3 grass types sedge/stipa/turf/fern
  4 buttercup/fireweed/dragonhead/gentian
  5 edelweiss/chive + shrub densities: deciduous thicket (wild rose, honeysuckle, spiraea), juniper
This is the single source of the flora: tools/veg_map.py derives the 2 m map of the 2 km square
from it (and writes the square back in), and every level of detail in the renderer -- modelled
plants, mid-range flowers, the colour of the distant meadow -- reads the same weights.
"""
import gzip, json, sys
import numpy as np
from scipy import ndimage
from PIL import Image

OUT = "web/public/data"
meta = json.load(open(f"{OUT}/scene.json"))
half, res0 = meta["core"]["size"] / 2, meta["core"]["res"]
R = 16.0
N = int(meta["core"]["size"] / R)
H10 = np.frombuffer(gzip.open(f"{OUT}/core_height.bin.gz").read(), "<u2").reshape(2048, 2048).astype(np.float32) / 10
h = ndimage.zoom(ndimage.gaussian_filter(H10, 0.8), N / 2048, order=1)
lc = np.asarray(Image.open(f"{OUT}/core_landcover.png").convert("RGB"), np.float32) / 255
lc = ndimage.zoom(lc, (N / 2048, N / 2048, 1), order=1)
forest, bare, snow = lc[..., 0], lc[..., 1], lc[..., 2]

gz, gx = np.gradient(ndimage.gaussian_filter(h, 1.0), R)
slope = np.hypot(gx, gz)
north = np.clip(gz / np.maximum(slope, 1e-3), -1, 1) * np.clip(slope * 4, 0, 1)   # rows grow southward
curv = ndimage.laplace(ndimage.gaussian_filter(h, 2.0)) / (R * R)
curv_big = ndimage.laplace(ndimage.gaussian_filter(h, 6.0)) / (R * R)


def fbm(scale_m, octaves, seed):
    r = np.random.default_rng(seed)
    out = np.zeros((N, N), np.float32); amp = 1.0; tot = 0.0
    for o in range(octaves):
        s = scale_m / R / 2 ** o
        g = r.random((int(N / s) + 3, int(N / s) + 3)).astype(np.float32)
        out += amp * ndimage.zoom(g, s, order=3)[:N, :N]; tot += amp; amp *= 0.5
    return out / tot


def band(x, lo0, lo1, hi0, hi1):
    return np.clip((x - lo0) / (lo1 - lo0), 0, 1) * np.clip((hi1 - x) / (hi1 - hi0), 0, 1)


def drift(seed, big=260, small=45, lo=0.56, hi=0.7):
    """region (km) x swath (big, scaled x2) x patch (small) noise, 0..1. A species owns whole
    hillsides in some regions and is scarce in others, so the view from above has large
    colour fields with texture inside rather than an even confetti."""
    region = np.clip((fbm(1900, 2, seed + 500) - 0.36) / 0.28, 0, 1)
    region = region * region * (3 - 2 * region)
    a = np.clip((fbm(big * 2, 3, seed) - lo + 0.1) / (hi - lo + 0.12), 0, 1) * (0.25 + 0.75 * region)
    a = a * a * (3 - 2 * a)
    b = np.clip((fbm(small * 1.5, 2, seed + 100) - 0.35) / 0.3, 0, 1)
    return a * (0.6 + 0.4 * b)


moist = np.clip(np.clip(curv * 900, 0, 1) * 0.5 + np.clip(curv_big * 2500, 0, 1) * 0.3 + np.clip(north, 0, 1) * 0.45, 0, 1)
dry = np.clip(np.clip(-north, 0, 1) * 1.1 + np.clip(-curv * 700, 0, 1) * 0.4, 0, 1)
edge = ndimage.gaussian_filter(((forest > 0.08) & (forest < 0.6)).astype(np.float32), 3) * (forest < 0.6)
edge = np.clip(edge * 2.5, 0, 1)
meadow = (1 - np.clip((forest - 0.3) / 0.4, 0, 1)) * (1 - np.clip((snow - 0.1) * 3, 0, 1)) * (1 - np.clip((slope - 0.7) * 3, 0, 1))
low = band(h, 1500, 1750, 2500, 2800)        # montane hay meadows
sub = band(h, 2300, 2550, 2950, 3200)        # subalpine meadows
alp = band(h, 2800, 3000, 3400, 3600)        # alpine / scree

sp = {}
sp["cosmos"] = np.zeros_like(h)                                     # only planted at the camps
sp["daisy"] = low * (0.3 + 0.4 * dry) * drift(2, 220) * meadow * 0.6
sp["poppy"] = (alp * np.clip(bare + dry, 0, 1) * 0.9 + sub * dry * 0.4) * drift(3, 300) * meadow
sp["globeflower"] = (low + sub) * moist * drift(5, 240, 50, 0.5, 0.66) * meadow * 0.8
sp["forgetmenot"] = (sub * 0.7 + alp * 0.5 + low * moist * 0.5) * np.clip(moist + edge * 0.5, 0, 1) * drift(6, 200) * meadow
sp["geranium"] = (low * 0.9 + sub * 0.6) * (0.4 + 0.6 * np.clip(edge + moist * 0.5, 0, 1)) * drift(7, 320, 50, 0.46, 0.63) * meadow
sp["delphinium"] = (low + sub * 0.6) * edge * drift(8, 180) * meadow
sp["campanula"] = (low * 0.8 + sub) * np.clip(edge * 0.7 + moist * 0.4, 0, 1) * drift(10, 200) * meadow
sp["yarrow"] = low * (0.3 + 0.7 * dry) * drift(11, 260, 40, 0.46, 0.64) * meadow
sp["dandelion"] = low * (0.3 + 0.3 * moist) * drift(12, 200, 35, 0.52, 0.68) * meadow * 0.7
sp["clover"] = low * (0.3 + 0.3 * moist) * drift(13, 200, 35, 0.52, 0.68) * meadow
sp["mantle"] = (low + sub) * (0.2 + 0.8 * moist) * drift(14, 180) * meadow
# second texture batch: species of their own
sp["buttercup"] = (low * 0.9 + sub * 0.6) * (0.4 + 0.6 * moist) * drift(20, 300, 45, 0.48, 0.65) * meadow   # moist hay meadows
sp["fireweed"] = (low + sub * 0.7) * np.clip(edge * 1.2 + np.clip(slope - 0.35, 0, 1), 0, 1) * drift(21, 220) * meadow   # clearings, forest edges
sp["dragonhead"] = (low * 0.8 + sub * 0.6) * dry * drift(22, 220, 40, 0.5, 0.66) * meadow * 0.8   # dry sunny slopes
sp["gentian"] = (sub * 0.7 + alp) * (0.5 + 0.5 * moist) * drift(23, 180, 35, 0.5, 0.66) * meadow * 0.7   # subalpine / alpine turf
sp["edelweiss"] = alp * np.clip(bare + dry, 0, 1) * drift(24, 160, 30, 0.5, 0.66) * meadow * 0.8   # dry rocky alpine
sp["chive"] = (low + sub) * np.clip(moist * 1.3 - 0.3, 0, 1) * drift(25, 150, 30, 0.5, 0.66) * meadow * 0.8   # wet hollows, stream banks
# forest floor (as in tools/veg_map.py, here as a mean: the 16 m map cannot hold the gaps)
fl = np.clip((forest - 0.3) / 0.4, 0, 1) * (1 - np.clip((snow - 0.1) * 3, 0, 1)) * (low + sub * 0.7)
gapc = 0.3 + 0.7 * np.clip((fbm(90, 2, 900) - 0.4) / 0.3, 0, 1)
sp["geranium"] += 0.2 * fl * gapc
sp["campanula"] += 0.09 * fl * gapc
sp["delphinium"] += 0.04 * fl * gapc
sp["forgetmenot"] += 0.15 * fl * moist * gapc
sp["globeflower"] += 0.2 * fl * moist
sp["fireweed"] += 0.06 * fl * gapc
sp["mantle"] += 0.35 * fl
# shrubs (weight 1 = one shrub per 4 m cell): deciduous thickets of wild rose, honeysuckle and
# spiraea along forest margins and in moist gullies of the montane belt; creeping juniper
# (Juniperus sabina) as dark mats on steep sunny rocky slopes up into the subalpine belt
not_forest = 1 - np.clip((forest - 0.5) * 3, 0, 1)
steep = np.clip((slope - 0.3) * 3, 0, 1)
shrub = {"shrub": (low + sub * 0.4) * np.clip(edge * 1.1 + np.clip(curv_big * 3000, 0, 1) * 0.5 + steep * 0.25, 0, 1)
                  * drift(26, 200, 40, 0.48, 0.64) * 0.9 * not_forest,
         "juniper": (low * 0.8 + sub) * np.clip(dry * 1.2 - 0.2, 0, 1) * np.clip(steep + bare * 0.8, 0, 1)
                  * drift(27, 260, 50, 0.46, 0.62) * not_forest * (1 - np.clip((snow - 0.1) * 3, 0, 1))}

LAYERS = [["cosmos", "daisy", "poppy", "globeflower"], ["forgetmenot", "geranium", "delphinium", "campanula"],
          ["yarrow", "dandelion", "clover", "mantle"], ["sedge", "stipa", "turf", "fern"],
          ["buttercup", "fireweed", "dragonhead", "gentian"], ["edelweiss", "chive", "shrub", "juniper"]]
atlas = np.zeros((2 * N, 3 * N, 4), np.float32)


def put_layer(k, arrs):
    ty, tx = divmod(k, 3)
    atlas[ty * N:(ty + 1) * N, tx * N:(tx + 1) * N] = np.stack([np.clip(a, 0, 1) for a in arrs], -1)


for k in (0, 1, 2, 4):
    put_layer(k, [sp[n] for n in LAYERS[k]])
put_layer(5, [sp["edelweiss"], sp["chive"], shrub["shrub"], shrub["juniper"]])
for n, a in shrub.items():
    print(f"{n:12s} mean {a.mean():.3f}  >0.3 {(a > 0.3).mean() * 100:5.1f}%")
json.dump({"origin": [-half, -half], "size": N * R, "res": R, "tiles": [3, 2], "layers": LAYERS}, open(f"{OUT}/vegcore.json", "w"))
# grass types at 16 m (same channels as vegmap_3), for the sward outside the 2 km square
grass = [np.clip(moist * 1.3 - 0.25, 0, 1) * meadow,                 # sedge (moist hollows)
         np.clip(dry * 1.3 - 0.3, 0, 1) * drift(15, 120) * meadow,  # stipa (dry slopes)
         np.zeros_like(h),                                             # turf (grazed camps: none out here)
         np.maximum(np.clip(edge * 1.4 - 0.2, 0, 1), fl * (0.3 + 0.5 * moist) * 0.8)]   # ferns: forest edges and the shaded floor
put_layer(3, grass)
# raw bytes, not PNG: a browser canvas premultiplies alpha and would wipe the RGB species
# wherever the species kept in A is absent
with gzip.open(f"{OUT}/vegcore.bin.gz", "wb", compresslevel=9) as f:
    f.write((atlas * 255).round().clip(0, 255).astype(np.uint8).tobytes())
for n, a in sp.items():
    print(f"{n:12s} mean {a.mean():.3f}  >0.3 {(a > 0.3).mean() * 100:5.1f}%")

# preview: blended flower colour over the terrain
cols = {"daisy": (250, 250, 240), "poppy": (250, 205, 40), "globeflower": (250, 150, 20), "forgetmenot": (110, 170, 245),
        "geranium": (150, 100, 215), "delphinium": (70, 70, 210), "campanula": (170, 130, 240), "yarrow": (240, 236, 220),
        "dandelion": (255, 225, 50), "clover": (240, 160, 195), "mantle": (160, 190, 90), "buttercup": (255, 215, 0),
        "fireweed": (220, 60, 160), "dragonhead": (110, 90, 220), "gentian": (40, 70, 200), "edelweiss": (225, 225, 215), "chive": (200, 140, 210)}
# drifts are dominated by one species: show the strongest one, coverage from its strength
names = list(cols)
stack = np.stack([sp[n] for n in names], -1)
idx = stack.argmax(-1); mx = stack.max(-1)
col = np.array([cols[n] for n in names], np.float32)[idx]
cov = np.clip((mx - 0.08) * 1.6, 0, 0.9)[..., None]
print("coverage >0.3:", float((cov > 0.3).mean()) * 100, "%  >0.6:", float((cov > 0.6).mean()) * 100, "%")
shade = np.clip(0.55 + (-gx - gz) * 1.5, 0.2, 1)[..., None]
base = np.where(forest[..., None] > 0.4, np.array([25, 60, 35], np.float32), np.array([80, 130, 55], np.float32)) * shade
pv = base * (1 - cov) + col * cov * shade
Image.fromarray(np.clip(pv, 0, 255).astype(np.uint8)).save(sys.argv[1] if len(sys.argv) > 1 else "vegcore_preview.png")
