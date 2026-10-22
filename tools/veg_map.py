"""Vegetation map for the 2 km slice square (same square as detail.bin): where each meadow
species grows, from the real terrain + the 1 m detail + land cover + camps.

Habitat drivers
  moist   hollows / gullies (negative detail relief), north-facing slopes, forest edges
  dry     south-facing slopes, bumps, ridges
  camp    trampled ground around yurts/cabins and along trails (grazed, disturbed)
  edge    forest margin (land cover forest fraction 0.1..0.6, dilated)
  cosmos  sown thick along the boardwalk and round the lodge and cabins (photos 2, 4, 5), a few
          drifts nearby (photos 1, 3), single stems between
The wild flowers come from the core-wide map (tools/veg_core.py, 16 m): its drifts are sampled
here and broken into clumps with a mean-preserving texture, then thinned on trampled camps and
cleared from trails and banks. A shared "richness" field makes flowery patches (5-30 m) in
flowery stretches and grassy gaps between them where hardly anything flowers, and in a patch
one or two kinds dominate (a real meadow is never an even confetti of every species). Only the
cosmos and the camp weeds (daisies, dandelions, clover on trampled ground) are local. The
finished square is written back into the core map (16 m block means), so the far view shows
exactly what grows here -- so run tools/veg_core.py first, then this (a second run of this
alone would read its own write-back).

Output web/public/data/vegmap.bin.gz: raw RGBA atlas 3072x2048 of six 1024x1024 layers (2 m/px,
row 0 = north), layer k at tile (k % 3, k // 3) -- the same layers as the core map:
  0: cosmos, daisy, poppy, globeflower
  1: forget-me-not, geranium, delphinium, campanula
  2: yarrow, dandelion, clover, lady's mantle (ground-cover rosettes)
  3: grass types: sedge (moist), stipa (dry), turf (grazed), fern/weeds (forest edge)
  4: buttercup, fireweed, dragonhead, gentian
  5: edelweiss, wild chive, deciduous shrubs (rose, honeysuckle, spiraea), juniper
"""
import gzip, json, math, sys
import numpy as np
from scipy import ndimage
from PIL import Image

OUT = "web/public/data"
meta = json.load(open(f"{OUT}/scene.json"))
det_meta = json.load(open(f"{OUT}/detail.json"))
X0, Z0 = det_meta["origin"]
N1 = det_meta["size"]          # 2048 @ 1 m
R = 2                          # output resolution (m)
N = N1 // R

# ---- inputs on the 2 m grid
H10 = np.frombuffer(gzip.open(f"{OUT}/core_height.bin.gz").read(), "<u2").reshape(2048, 2048).astype(np.float32) / 10
half, res = meta["core"]["size"] / 2, meta["core"]["res"]
xs = X0 + (np.arange(N) + 0.5) * R
zs = Z0 + (np.arange(N) + 0.5) * R
ZZ, XX = np.meshgrid(zs, xs, indexing="ij")
base = ndimage.map_coordinates(H10, [(ZZ + half) / res - 0.5, (XX + half) / res - 0.5], order=1, mode="nearest")
det = np.frombuffer(gzip.open(f"{OUT}/detail.bin.gz").read(), np.uint8).reshape(N1, N1, 4).astype(np.float32)
det = det.reshape(N, R, N, R, 4).mean(axis=(1, 3))
delta = (det[..., 0] - 128) * det_meta["scale"]
trail = det[..., 1] / 255
bank = det[..., 2] / 255
h = base + delta
lc = np.asarray(Image.open(f"{OUT}/core_landcover.png").convert("RGB"), np.float32) / 255
forest = ndimage.map_coordinates(lc[..., 0], [(ZZ + half) / res - 0.5, (XX + half) / res - 0.5], order=1)

gz, gx = np.gradient(ndimage.gaussian_filter(h, 1.5), R)
slope = np.hypot(gx, gz)
north = np.clip(gz / np.maximum(slope, 1e-3), -1, 1) * np.clip(slope * 4, 0, 1)   # +z is south: uphill toward +z => faces north
south = -north
curv = ndimage.laplace(ndimage.gaussian_filter(h, 3)) / (R * R)                   # >0 in hollows

rng = np.random.default_rng(5)


def fbm(scale_m, octaves, seed):
    r = np.random.default_rng(seed)
    out = np.zeros((N, N), np.float32); amp = 1; tot = 0
    for o in range(octaves):
        s = scale_m / R / 2 ** o
        g = r.random((int(N / s) + 3, int(N / s) + 3)).astype(np.float32)
        out += amp * ndimage.zoom(g, s, order=3)[:N, :N]; tot += amp; amp *= 0.5
    return out / tot


def patch(seed, scale_m, lo=0.5, hi=0.68):
    return np.clip((fbm(scale_m, 3, seed) - lo) / (hi - lo), 0, 1)


moist = np.clip(-delta * 1.4 + curv * 40, 0, 1) * 0.7 + np.clip(north, 0, 1) * 0.35
moist = np.clip(ndimage.gaussian_filter(moist, 2), 0, 1)
dry = np.clip(np.clip(south, 0, 1) * 1.2 + np.clip(delta * 1.5, 0, 1) * 0.4 + np.clip(-curv * 30, 0, 1) * 0.3, 0, 1)
edge = ndimage.gaussian_filter(((forest > 0.08) & (forest < 0.6)).astype(np.float32), 6) * (forest < 0.6)
edge = np.clip(edge * 2.2, 0, 1)

# camps: distance to yurts / cabins / trails
objs = json.load(open(f"{OUT}/objects.json"))
occ = np.zeros((N, N), bool)
for o in objs["yurts"] + objs["cabins"] + objs.get("barns", []) + objs.get("guesthouses", []):
    i, j = int((o["z"] - Z0) / R), int((o["x"] - X0) / R)
    if 0 <= i < N and 0 <= j < N:
        occ[i, j] = True
dcamp = ndimage.distance_transform_edt(~occ) * R
camp = np.clip(1 - (dcamp - 8) / 45, 0, 1) + np.clip(trail * 3, 0, 1) * 0.6
camp = np.clip(ndimage.gaussian_filter(camp, 3) + np.clip(ndimage.gaussian_filter(trail, 4) * 4, 0, 0.8), 0, 1)

vps = meta["viewpoints"][:5]
lx = sum(v["x"] for v in vps) / 5; lz = sum(v["z"] for v in vps) / 5
dl = np.hypot(XX - lx, ZZ - lz)

meadow = (1 - np.clip((forest - 0.3) / 0.4, 0, 1)) * (1 - np.clip(bank * 2, 0, 1)) * (1 - np.clip(trail * 3, 0, 1))
open_m = meadow * (1 - camp * 0.6)

# regional drifts from the core map, bilinear like the GPU (texel centres at +0.5)
cmeta = json.load(open(f"{OUT}/vegcore.json"))
NC = int(cmeta["size"] / cmeta["res"])
TX, TY = cmeta["tiles"]
LAYERS = cmeta["layers"]
core = np.frombuffer(gzip.open(f"{OUT}/vegcore.bin.gz").read(), np.uint8).reshape(TY * NC, TX * NC, 4).astype(np.float32) / 255
cu = (XX - cmeta["origin"][0]) / cmeta["res"] - 0.5
cv = (ZZ - cmeta["origin"][1]) / cmeta["res"] - 0.5


def core_view(layer, ch):
    ty, tx = divmod(layer, TX)
    return core[ty * NC:(ty + 1) * NC, tx * NC:(tx + 1) * NC, ch]


def core_at(layer, ch):
    return ndimage.map_coordinates(core_view(layer, ch), [cv, cu], order=1, mode="nearest")


def norm(t):
    return (t - t.mean()) / (t.std() + 1e-6)


def smooth(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0, 1)
    return t * t * (3 - 2 * t)


def clumps(seed, scale_m, sigma=0.8):
    """mean-1 clumping texture: plants of one kind gather in patches of a few to 20 m and are
    scarce between them (log-normal: most ground has a little, a few patches have a lot)"""
    t = np.exp(sigma * norm(fbm(scale_m, 3, seed)))
    return t / t.mean()


# How much flowers at all, shared by every wild species: flowery patches of 5-30 m inside
# flowery stretches of 50-150 m, and between them grassy ground where hardly anything flowers
# -- a real meadow is never an even confetti. Mean 1, so the flowers are moved, not removed.
rich = norm(norm(fbm(16, 3, 60)) * 0.75 + norm(fbm(80, 2, 61)) * 0.55)
rich = 0.03 + 2.4 * smooth(-0.45, 0.75, rich)
rich /= rich.mean()


# every channel but the grass types (layer 3) comes from the core map, broken into clumps
SLOTS = [(l, c) for l in (0, 1, 2, 4, 5) for c in range(4)]
names = [LAYERS[l][c] for l, c in SLOTS]
sp = {}
for k, (l, c) in enumerate(SLOTS):
    n = names[k]
    shrub = n in ("shrub", "juniper")
    if shrub:
        sp[n] = core_at(l, c) * clumps(40 + k, 30, 0.45) * (1 - np.clip((forest - 0.5) * 3, 0, 1)) * (1 - 0.6 * camp)
    else:
        sp[n] = core_at(l, c) * clumps(40 + k, 10 + (k % 3) * 6) * rich * meadow * (1 - 0.6 * camp)

# cosmos, sown by the lodge people: thick along the boardwalk and round the cabins and the lodge
# (photos 2, 4, 5), a few self-sown drifts in the grass nearby (photos 1, 3), single stems between
def raster(mask, x, z):
    i, j = int((z - Z0) / R), int((x - X0) / R)
    if 0 <= i < N and 0 <= j < N:
        mask[i, j] = True


lodge_zone = np.clip(1 - (dl - 110) / 150, 0, 1)
walk = np.zeros((N, N), bool)
for b in objs["boardwalks"]:
    for (x0, z0), (x1, z1) in zip(b["pts"][:-1], b["pts"][1:]):
        for t in np.linspace(0, 1, int(np.hypot(x1 - x0, z1 - z0) / (R * 0.4)) + 2):
            raster(walk, x0 + (x1 - x0) * t, z0 + (z1 - z0) * t)
house = np.zeros((N, N), bool)
for o in objs["cabins"]:
    if np.hypot(o["x"] - lx, o["z"] - lz) > 260:
        continue
    ca, sa = np.cos(o["rot"]), np.sin(o["rot"])
    for u in np.arange(-o["w"] / 2, o["w"] / 2 + 0.1, R * 0.5):
        for v in np.arange(-o["d"] / 2 - o.get("porch", 0), o["d"] / 2 + 0.1, R * 0.5):
            raster(house, o["x"] + u * ca - v * sa, o["z"] + u * sa + v * ca)
# 岚川's guest block (photos 2-5: the cosmos all along its porch): its walls and decks, the level pad
# of its model and any deck beyond it (the scene's convention: local +z its front)
for g in objs.get("guesthouses", []):
    if not g.get("cosmos"):
        continue
    ca, sa = np.cos(g["rot"]), np.sin(g["rot"])
    for pcx, pcz, hx, hz in [g["pad"]] + g.get("masks", []):
        for u in np.arange(pcx - hx, pcx + hx + 0.1, R * 0.5):
            for v in np.arange(pcz - hz, pcz + hz + 0.1, R * 0.5):
                raster(house, g["x"] + u * ca + v * sa, g["z"] - u * sa + v * ca)
wob = norm(fbm(10, 3, 71))
dwalk = ndimage.distance_transform_edt(~walk) * R
dhouse = ndimage.distance_transform_edt(~house) * R
band = np.maximum(smooth(0.9, 1.6, dwalk) * (1 - smooth(4.5, 9.0, dwalk + wob * 2.5)),
                  smooth(0.5, 1.5, dhouse) * (1 - smooth(3.5, 8.0, dhouse + wob * 2.5)))
drifts = smooth(0.55, 1.5, norm(fbm(14, 3, 70)) + 0.5 * norm(fbm(60, 2, 72)))   # about a tenth of the ground
drifts *= 0.55 + 0.45 * smooth(-1, 1, norm(fbm(5, 2, 73)))                     # thick and thin inside
sp["cosmos"] = meadow * (lodge_zone * (0.95 * band + 0.6 * drifts * (1 - band)) + 0.03 * np.clip(lodge_zone * 2, 0, 1)
                         + patch(1, 60, 0.62, 0.75) * 0.05 * camp * (1 - lodge_zone))
# sown beds (a guesthouse's `cosmos_beds`, local rects): thick all over, thicker and thinner in drifts --
# 岚川's public building, the slope before its door down to the road (the user: full of cosmos)
bed = np.zeros((N, N), bool)
for g in objs.get("guesthouses", []):
    ca, sa = np.cos(g["rot"]), np.sin(g["rot"])
    for pcx, pcz, hx, hz in g.get("cosmos_beds", []):
        for u in np.arange(pcx - hx, pcx + hx + 0.1, R * 0.5):
            for v in np.arange(pcz - hz, pcz + hz + 0.1, R * 0.5):
                raster(bed, g["x"] + u * ca + v * sa, g["z"] - u * sa + v * ca)
bedf = ndimage.gaussian_filter(bed.astype(np.float32), 1.0) * (0.72 + 0.28 * smooth(-1, 1, norm(fbm(6, 2, 74))))
sp["cosmos"] = np.maximum(sp["cosmos"], meadow * bedf)
# weeds of trampled ground round the camps, in patches
sp["daisy"] += 0.3 * camp * patch(2, 40) * meadow
sp["dandelion"] += 0.5 * camp * patch(12, 20, 0.35, 0.6) * meadow
sp["clover"] += 0.6 * camp * patch(13, 18, 0.35, 0.58) * meadow

# forest floor: Schrenk spruce stands are open -- wood cranesbill, bellflowers, larkspur (for the
# monkshood), forget-me-nots and globeflowers where it is damp, fireweed in the clearings, lady's
# mantle everywhere, ferns in the shade (below); more of everything in the gaps
fl = np.clip((forest - 0.3) / 0.4, 0, 1) * (1 - np.clip(bank * 2, 0, 1)) * (1 - np.clip(trail * 3, 0, 1))
gap = smooth(0.48, 0.66, fbm(22, 3, 900))
glade = smooth(0.6, 0.72, fbm(60, 2, 901))
floor_ = fl * (0.2 + 0.8 * gap)
sp["geranium"] += 0.24 * floor_ * clumps(910, 12)
sp["campanula"] += 0.12 * floor_ * clumps(911, 10)
sp["delphinium"] += 0.07 * fl * gap * clumps(912, 14)
sp["forgetmenot"] += 0.22 * floor_ * moist * clumps(913, 8)
sp["globeflower"] += 0.25 * fl * moist * clumps(914, 12)
sp["fireweed"] += 0.4 * fl * glade * clumps(915, 16)
sp["mantle"] += 0.35 * fl * clumps(916, 10)

# brooks (tools/streams.py): nothing grows in the channel; the wet banks carry globeflowers,
# forget-me-nots, wild chives and sedge
smeta = json.load(open(f"{OUT}/streammask.json"))
smn = int(smeta["size"] / smeta["res"])
smask = np.frombuffer(gzip.open(f"{OUT}/streammask.bin.gz").read(), np.uint8).reshape(smn, smn, -1)[..., 0].astype(np.float32) / 255
wetm = ndimage.map_coordinates(smask, [(ZZ - smeta["origin"][1]) / smeta["res"] - 0.5, (XX - smeta["origin"][0]) / smeta["res"] - 0.5], order=1, mode="constant")
channel = smooth(0.7, 0.95, wetm)
bank = np.clip(wetm / 0.6, 0, 1) * (1 - channel)
for n in names:
    sp[n] = sp[n] * (1 - channel)
sp["globeflower"] += 0.35 * bank
sp["forgetmenot"] += 0.3 * bank
sp["chive"] += 0.15 * bank

# In a patch one or two kinds dominate and crowd the rest out: each species is weakened by
# how far it trails the strongest one there (cosmos, sown, keeps its sparse stems anyway).
FL = [n for n in names if n not in ("shrub", "juniper", "mantle")]
top = np.max(np.stack([sp[n] for n in FL]), 0) + 1e-6
for n in FL:
    if n != "cosmos":
        sp[n] = sp[n] * np.clip(sp[n] / top, 0, 1) ** 0.8
grass = {
    "sedge": np.clip(moist * 1.3 - 0.25, 0, 1) * meadow,
    "stipa": np.clip(dry * 1.3 - 0.3, 0, 1) * patch(15, 60, 0.4, 0.6) * open_m,
    "turf": np.clip(camp * 1.2, 0, 1),
    "fern": np.clip(edge * 1.4 - 0.2, 0, 1) * patch(16, 25, 0.4, 0.6),
}
grass["fern"] = np.maximum(grass["fern"], np.clip(fl * (0.3 + 0.5 * moist) * (1 - 0.5 * gap) * clumps(917, 14), 0, 1))   # ferns in the shade
grass["sedge"] = np.maximum(grass["sedge"] * (1 - channel), bank * 0.8)   # sedge on the wet banks

# raw RGBA bytes in the same 3x2 layer layout as the core map, not PNG: a browser canvas
# premultiplies alpha and would wipe the RGB species wherever the species kept in A is absent
val_of = {**sp, **grass}
atlas = np.zeros((TY * N, TX * N, 4), np.float32)
for l, chans in enumerate(LAYERS):
    ty, tx = divmod(l, TX)
    atlas[ty * N:(ty + 1) * N, tx * N:(tx + 1) * N] = np.stack([np.clip(val_of[n], 0, 1) for n in chans], -1)
with gzip.open(f"{OUT}/vegmap.bin.gz", "wb", compresslevel=9) as f:
    f.write((atlas * 255).round().astype(np.uint8).tobytes())
# write the square back into the core map: 16 m block means, feathered over the last 64 m
ci = (np.arange(NC) + 0.5) * cmeta["res"] + cmeta["origin"][0]
cj = (np.arange(NC) + 0.5) * cmeta["res"] + cmeta["origin"][1]
CZ, CX = np.meshgrid(cj, ci, indexing="ij")
inside = (CX > X0) & (CX < X0 + N * R) & (CZ > Z0) & (CZ < Z0 + N * R)
ed = np.minimum.reduce([CX - X0, X0 + N * R - CX, CZ - Z0, Z0 + N * R - CZ])
feather = np.clip((ed - 16) / 64, 0, 1) * inside
qi, qj = (CZ - Z0) / R - 0.5, (CX - X0) / R - 0.5
for l, chans in enumerate(LAYERS):
    for ch, n in enumerate(chans):
        blk = ndimage.uniform_filter(np.clip(val_of[n], 0, 1), size=int(cmeta["res"] / R))
        val = ndimage.map_coordinates(blk, [qi, qj], order=1, mode="nearest")
        view = core_view(l, ch)
        view[:] = view * (1 - feather) + val * feather
with gzip.open(f"{OUT}/vegcore.bin.gz", "wb", compresslevel=9) as f:
    f.write((np.clip(core, 0, 1) * 255).round().astype(np.uint8).tobytes())

json.dump({"origin": [X0, Z0], "size": N * R, "res": R, "tiles": [TX, TY], "layers": LAYERS}, open(f"{OUT}/vegmap.json", "w"))
for n, a in list(sp.items()) + list(grass.items()):
    print(f"{n:12s} mean {a.mean():.3f}  >0.3: {(a > 0.3).mean() * 100:5.1f}%")

# preview: dominant species colour
cols = {"cosmos": (230, 90, 170), "daisy": (250, 250, 240), "poppy": (250, 200, 30), "globeflower": (250, 140, 20),
        "forgetmenot": (100, 170, 240), "geranium": (150, 100, 210), "delphinium": (60, 60, 200), "campanula": (170, 130, 240),
        "yarrow": (235, 230, 210), "dandelion": (255, 230, 60), "clover": (240, 150, 190), "mantle": (120, 170, 80),
        "buttercup": (255, 215, 0), "fireweed": (220, 60, 160), "dragonhead": (110, 90, 220), "gentian": (40, 70, 200),
        "edelweiss": (225, 225, 215), "chive": (200, 140, 210)}
stack = np.stack([sp[n] for n in cols], -1)
idx = stack.argmax(-1); mx = stack.max(-1)
pal = np.array(list(cols.values()), np.float32)
pv = pal[idx] * np.clip(mx * 2, 0, 1)[..., None] + np.array([60, 100, 40]) * (1 - np.clip(mx * 2, 0, 1))[..., None]
Image.fromarray(pv.astype(np.uint8)).save(sys.argv[1] if len(sys.argv) > 1 else "vegmap_preview.png")
