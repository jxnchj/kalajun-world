"""Streams and rivers from the real terrain (the 10 m core DEM), for web/src/streams.js.

OSM has only the Kekesu river as points, and nothing of the brooks that run down the forested
gullies, so the network is derived: sinks filled (morphological reconstruction), D8 flow
directions, contributing area; a brook where more than ~0.25 km2 drains through a cell, a river
beyond ~5 km2. Channels are traced into polylines (head -> confluence -> outlet), smoothed and
resampled every 4 m.

Output (web/public/data):
  streams.json      {"lines": [[[x, z, width], ...], ...]} scene metres, flow order, only
                    within 7 km of the lodge camp for brooks (the valley rivers, > 5 km2, across the whole core)
  streammask.bin.gz R8, 4 m texels over the 14 km square round the camp (streammask.json has
                    origin/size/res): 255 in the channel, falling to 0 some metres out -- the
                    wet banks and the stream bed for the terrain, grass and flora
"""
import gzip, heapq, json, math
import numpy as np
from scipy import ndimage
from skimage.morphology import reconstruction

OUT = "web/public/data"
meta = json.load(open(f"{OUT}/scene.json"))
half, res = meta["core"]["size"] / 2, meta["core"]["res"]
n = meta["core"]["n"]
H = np.frombuffer(gzip.open(f"{OUT}/core_height.bin.gz").read(), "<u2").reshape(n, n).astype(np.float64) / 10
vps = meta["viewpoints"][:5]
lx = sum(v["x"] for v in vps) / 5
lz = sum(v["z"] for v in vps) / 5

# ---------------------------------------------------------------- fill sinks, D8
dem = ndimage.gaussian_filter(H, 0.7)
seed = dem.copy()
seed[1:-1, 1:-1] = dem.max()
filled = reconstruction(seed, dem, method="erosion")
# flats left by the filling drain the way the (smoothed) original surface tilts
z = filled + 1e-3 * ndimage.gaussian_filter(H, 6) + 1e-6 * ndimage.distance_transform_edt(np.pad(np.ones((n - 2, n - 2)), 1))
offs = [(-1, -1), (-1, 0), (-1, 1), (0, -1), (0, 1), (1, -1), (1, 0), (1, 1)]
best = np.full((n, n), -1, np.int64)
bestdrop = np.zeros((n, n))
rows, cols = np.mgrid[0:n, 0:n]
for dr, dc in offs:
    r2, c2 = rows + dr, cols + dc
    ok = (r2 >= 0) & (r2 < n) & (c2 >= 0) & (c2 < n)
    r2c, c2c = np.clip(r2, 0, n - 1), np.clip(c2, 0, n - 1)
    drop = np.where(ok, (z - z[r2c, c2c]) / math.hypot(dr, dc), -1)
    upd = drop > bestdrop
    best[upd] = (r2c * n + c2c)[upd]
    bestdrop[upd] = drop[upd]
flat = best.ravel()
order = np.argsort(-z.ravel(), kind="stable")
acc = np.ones(n * n)
for i in order:
    j = flat[i]
    if j >= 0:
        acc[j] += acc[i]
A = acc.reshape(n, n) * res * res          # m2
print("max area km2", A.max() / 1e6)

# ---------------------------------------------------------------- channels -> polylines
BROOK, RIVER = 0.25e6, 5e6
X = -half + (np.arange(n) + 0.5) * res     # column -> x
Z = -half + (np.arange(n) + 0.5) * res     # row -> z
near = (np.abs(X[None, :] - lx) < 7000) & (np.abs(Z[:, None] - lz) < 7000)
chan = (A > BROOK) & near | (A > RIVER)
cidx = np.flatnonzero(chan.ravel())
has_up = np.zeros(n * n, bool)
tgt = flat[cidx]
has_up[tgt[tgt >= 0]] = True
heads = [i for i in cidx if not has_up[i]]
visited = np.zeros(n * n, bool)
lines = []
for h in sorted(heads, key=lambda i: -z.ravel()[i]):
    pts = []
    i = h
    while i >= 0 and chan.ravel()[i]:
        r, c = divmod(i, n)
        pts.append((X[c], Z[r], A.ravel()[i]))
        if visited[i]:
            break                      # joined a line traced already (ends at the confluence)
        visited[i] = True
        i = flat[i]
    if len(pts) >= 3:
        lines.append(pts)
print("lines", len(lines), "cells", int(chan.sum()))


def width(a):
    """channel width (m) from the area draining through: brooks ~1 m, the valley rivers 5-14 m"""
    km2 = a / 1e6
    return float(min(14.0, 0.6 + 0.55 * math.sqrt(km2) + 0.22 * max(0.0, km2 - 3)))


out = []
for pts in lines:
    p = np.array([(x, zz) for x, zz, _ in pts])
    a = np.array([aa for _, _, aa in pts])
    # smooth the D8 staircase, keep the ends (confluences) where they are
    for _ in range(3):
        q = p.copy()
        q[1:-1] = 0.25 * p[:-2] + 0.5 * p[1:-1] + 0.25 * p[2:]
        p = q
    seg = np.hypot(*np.diff(p, axis=0).T)
    s = np.concatenate([[0], np.cumsum(seg)])
    if s[-1] < 12:
        continue
    m = max(2, int(s[-1] / 4) + 1)
    t = np.linspace(0, s[-1], m)
    xs, zs = np.interp(t, s, p[:, 0]), np.interp(t, s, p[:, 1])
    As = np.interp(t, s, a)
    out.append([[round(float(x), 2), round(float(zz), 2), round(width(aa), 2)] for x, zz, aa in zip(xs, zs, As)])
json.dump({"lines": out}, open(f"{OUT}/streams.json", "w"), separators=(",", ":"))
print("written", len(out), "lines,", round(sum(len(l) for l in out) * 4 / 1000, 1), "km")

# ---------------------------------------------------------------- wetness mask (4 m, 14 km square)
MR, MS = 4.0, 14000
mn = int(MS / MR)
mx0, mz0 = lx - MS / 2, lz - MS / 2
wet = np.zeros((mn, mn), np.float32)
halfw = np.zeros((mn, mn), np.float32)
for l in out:
    for x, zz, w in l:
        i, j = int((zz - mz0) / MR), int((x - mx0) / MR)
        if 0 <= i < mn and 0 <= j < mn:
            wet[i, j] = 1
            halfw[i, j] = max(halfw[i, j], w / 2)
d, (ii, jj) = ndimage.distance_transform_edt(wet == 0, return_indices=True)
d = d * MR
hw = halfw[ii, jj]
# 1 in the channel, the wet bank 0.5..0 over the next ~2 + width metres
m = np.where(d <= hw, 1.0, np.clip(1 - (d - hw) / (2.5 + 1.5 * hw), 0, 1) * 0.6)
mask = (np.clip(m, 0, 1) * 255).round().astype(np.uint8)
with gzip.open(f"{OUT}/streammask.bin.gz", "wb", compresslevel=9) as f:
    f.write(mask.tobytes())
json.dump({"origin": [mx0, mz0], "size": MS, "res": MR, "channels": 1}, open(f"{OUT}/streammask.json", "w"))   # tools/trails.py adds G
print("mask", mask.shape, "wet share", float((mask > 0).mean()))
