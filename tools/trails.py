"""Horse and foot trails from the camps into the forests and along the brooks (web/src/trails.js).

Herders' trails are not mapped, so they are routed over the real terrain: least-cost paths on
the 10 m core grid (skimage MCP) where steep ground is expensive (a trail climbs at most ~25 %),
crossing a brook costs something, bare scree and snow a lot, and the ground a little way off a
brook is cheap -- trails follow the valleys. From the lodge camp they lead to spots on the brooks
inside the forest 1.5-5.5 km out, one per direction, and on between neighbouring spots, so they
form a small network. Paths are smoothed, given a gentle meander and resampled every 2 m.

Run after tools/streams.py. Output (web/public/data):
  trails.json       {"lines": [[[x, z], ...], ...]} scene metres
  streammask.bin.gz becomes two channels (streammask.json "channels": 2):
                    R wetness of the brooks (as written by streams.py),
                    G trail presence, a soft band ~2 m wide (for the grass, the flowers, the
                    GPU forest and the far view of the ground)
"""
import gzip, json, math
import numpy as np
from scipy import ndimage
from scipy.spatial import cKDTree
from skimage.graph import MCP_Geometric
from PIL import Image

OUT = "web/public/data"
meta = json.load(open(f"{OUT}/scene.json"))
half, res = meta["core"]["size"] / 2, meta["core"]["res"]
n = meta["core"]["n"]
H = np.frombuffer(gzip.open(f"{OUT}/core_height.bin.gz").read(), "<u2").reshape(n, n).astype(np.float32) / 10
lc = np.asarray(Image.open(f"{OUT}/core_landcover.png").convert("RGB"), np.float32) / 255
lc = ndimage.zoom(lc, (n / lc.shape[0], n / lc.shape[1], 1), order=1)
forest, bare, snow = lc[..., 0], lc[..., 1], lc[..., 2]
vps = meta["viewpoints"][:5]
lx = sum(v["x"] for v in vps) / 5
lz = sum(v["z"] for v in vps) / 5
objs = json.load(open(f"{OUT}/objects.json"))
lodge = next(c for c in objs["cabins"] if c.get("kind") == "lodge" and c["w"] >= 30)

# ---------------------------------------------------------------- the 14 km window, 10 m cells
W = 1400
i0 = min(max(int((lz - 7000 + half) / res), 0), n - W)   # (kept inside the core grid)
j0 = min(max(int((lx - 7000 + half) / res), 0), n - W)
sl = (slice(i0, i0 + W), slice(j0, j0 + W))
h = ndimage.gaussian_filter(H[sl], 1.0)
gz, gx = np.gradient(h, res)
slope = np.hypot(gx, gz)
cell_x = lambda j: -half + (j0 + j + 0.5) * res
cell_z = lambda i: -half + (i0 + i + 0.5) * res

sm = json.load(open(f"{OUT}/streammask.json"))
smn = int(sm["size"] / sm["res"])
wet4 = np.frombuffer(gzip.open(f"{OUT}/streammask.bin.gz").read(), np.uint8).reshape(smn, smn, -1)[..., 0].astype(np.float32) / 255
ZZ, XX = np.meshgrid(cell_z(np.arange(W)), cell_x(np.arange(W)), indexing="ij")
wet = ndimage.map_coordinates(wet4, [(ZZ - sm["origin"][1]) / sm["res"] - 0.5, (XX - sm["origin"][0]) / sm["res"] - 0.5], order=1)
channel = wet > 0.7
dch = ndimage.distance_transform_edt(~channel) * res           # m to the nearest brook

cost = 1.0 + (slope / 0.22) ** 4                               # ~25 % grade doubles the cost, 40 % x 12
cost += 30.0 * channel                                        # a brook to ford
cost *= 1.0 - 0.3 * np.clip(1 - np.abs(dch - 25) / 20, 0, 1)   # the bench above a brook
cost += 8.0 * np.clip((bare[sl] - 0.3) * 2, 0, 1) + 50.0 * (snow[sl] > 0.3)
cost += 0.3 * forest[sl]                                      # (trails go into the forest anyway)

# ---------------------------------------------------------------- where the trails lead
start = (int((lodge["z"] + half) / res) - i0, int((lodge["x"] + half) / res) - j0)
cand = []
for L in json.load(open(f"{OUT}/streams.json"))["lines"]:
    for x, z, w in L[::5]:
        i, j = int((z + half) / res) - i0, int((x + half) / res) - j0
        if not (0 <= i < W and 0 <= j < W):
            continue
        d = math.hypot(x - lodge["x"], z - lodge["z"])
        if 1500 < d < 5500 and forest[sl][i, j] > 0.6 and w < 4:
            cand.append((x, z, i, j, d))
targets = []
for k in range(6):   # one per 60 degree sector, the nearest good spot
    a0 = k * math.pi / 3
    sec = [c for c in cand if (math.atan2(c[1] - lodge["z"], c[0] - lodge["x"]) - a0) % (2 * math.pi) < math.pi / 3]
    if sec:
        targets.append(min(sec, key=lambda c: abs(c[4] - 2800)))
print("targets", [(round(t[0]), round(t[1]), round(t[4])) for t in targets])

mcp = MCP_Geometric(cost)
mcp.find_costs([start])
paths = [mcp.traceback((t[2], t[3])) for t in targets]
for a, b in zip(targets, targets[1:] + targets[:1]):   # links between neighbouring spots
    if math.hypot(a[0] - b[0], a[1] - b[1]) < 3500:
        m2 = MCP_Geometric(cost)
        m2.find_costs([(a[2], a[3])])
        paths.append(m2.traceback((b[2], b[3])))

# ---------------------------------------------------------------- polylines
rng = np.random.default_rng(9)
lines, used = [], np.zeros((W, W), bool)
for path in paths:
    # drop the stretches that run on a trail traced already (the network shares its trunks)
    seg = []
    for (i, j) in path:
        if used[i, j]:
            if len(seg) > 1:
                lines.append(seg + [(i, j)])
            seg = [(i, j)]
            continue
        seg.append((i, j))
    if len(seg) > 1:
        lines.append(seg)
    for (i, j) in path:
        used[max(i - 1, 0):i + 2, max(j - 1, 0):j + 2] = True
out = []
for seg in lines:
    p = np.array([(cell_x(j), cell_z(i)) for i, j in seg], np.float64)
    if len(p) < 3:
        continue
    for _ in range(6):
        q = p.copy()
        q[1:-1] = 0.25 * p[:-2] + 0.5 * p[1:-1] + 0.25 * p[2:]
        p = q
    s = np.concatenate([[0], np.cumsum(np.hypot(*np.diff(p, axis=0).T))])
    if s[-1] < 30:
        continue
    t = np.arange(0, s[-1], 2.0)
    xs, zs = np.interp(t, s, p[:, 0]), np.interp(t, s, p[:, 1])
    # a gentle meander, a few metres over tens of metres
    tx, tz = np.gradient(xs), np.gradient(zs)
    tl = np.hypot(tx, tz) + 1e-9
    ph = rng.uniform(0, 6.28, 2)
    m = 1.6 * np.sin(t / 37 + ph[0]) + 0.8 * np.sin(t / 13 + ph[1])
    m *= np.clip(t / 20, 0, 1) * np.clip((t[-1] - t) / 20, 0, 1)   # the ends stay put (junctions)
    xs, zs = xs - tz / tl * m, zs + tx / tl * m
    out.append([[round(float(x), 2), round(float(z), 2)] for x, z in zip(xs, zs)])
json.dump({"lines": out}, open(f"{OUT}/trails.json", "w"), separators=(",", ":"))
print("trails", len(out), round(sum(len(l) for l in out) * 2 / 1000, 1), "km")

# ---------------------------------------------------------------- G channel: trail presence
pts = []
for l in out:
    a = np.array(l)
    for k in range(len(a) - 1):
        for u in np.linspace(0, 1, 5, endpoint=False):
            pts.append(a[k] * (1 - u) + a[k + 1] * u)
tree = cKDTree(np.array(pts))
X4 = sm["origin"][0] + (np.arange(smn) + 0.5) * sm["res"]
Z4 = sm["origin"][1] + (np.arange(smn) + 0.5) * sm["res"]
Z4g, X4g = np.meshgrid(Z4, X4, indexing="ij")
d, _ = tree.query(np.stack([X4g.ravel(), Z4g.ravel()], -1), distance_upper_bound=10.0)
d = d.reshape(smn, smn)
pres = np.where(np.isfinite(d), np.exp(-(d / 2.2) ** 2), 0.0)
mask = np.stack([(wet4 * 255).round().astype(np.uint8), (np.clip(pres, 0, 1) * 255).round().astype(np.uint8)], -1)
with gzip.open(f"{OUT}/streammask.bin.gz", "wb", compresslevel=9) as f:
    f.write(mask.tobytes())
sm["channels"] = 2
json.dump(sm, open(f"{OUT}/streammask.json", "w"))
print("mask RG written")
