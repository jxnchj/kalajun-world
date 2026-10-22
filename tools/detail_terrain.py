"""1 m terrain detail for the 2 km vertical-slice square around the lodge camp.

The real surface stays the 10 m DEM (bilinear, as the shader samples it). On top we add
detail that follows that surface:
  * drainage gullies carved along D8 flow lines of the real terrain,
  * hummocks (fbm, a few dm),
  * terracettes: livestock trails contouring pasture slopes (typical of Tianshan pastures),
  * dirt roads and two-rut tracks hand-traced from 2013 imagery (objects.json "tracks", see
    tools/place_objects.py) + footpaths between the photographed places, cut into the slope
    (uphill cut bank / downhill fill), which is where the earth banks come from,
  * at today's guesthouse sites, the ground as it is there (data/layout/guesthouses.json "terrain"):
    the roads beside 岚川 sunk in their cut with banks up to the site, the ground falling away in front
    of and beside its public building so that its porch stands over the cosmos bank.

Output web/public/data/detail.bin.gz: 2048x2048 RGBA8, row 0 = north edge, 1 m texels.
  R = height delta vs bilinear(10 m), int8 at 3 cm steps (value-128)*0.03 (detail.json "scale")
  G = trail dirt, B = exposed earth on cut banks / gully walls, A = terracette tread
Plus detail.json with the square's origin (scene frame) and size.
"""
import gzip, json, math, sys
import numpy as np
from scipy import ndimage
sys.path.insert(0, "tools")
from extent import cx, cy
from viewpoint import TO_UTM

N = 2048
OUT = "web/public/data"
meta = json.load(open(f"{OUT}/scene.json"))
vps = meta["viewpoints"][:5]
lx = sum(v["x"] for v in vps) / 5
lz = sum(v["z"] for v in vps) / 5
X0, Z0 = lx - N / 2, lz - N / 2
rng = np.random.default_rng(3)

# ------------------------------------------------------------------ base: bilinear 10 m
H10 = np.frombuffer(gzip.open(f"{OUT}/core_height.bin.gz").read(), "<u2").reshape(2048, 2048).astype(np.float32) / 10
half, res = meta["core"]["size"] / 2, meta["core"]["res"]
xs = X0 + np.arange(N) + 0.5
zs = Z0 + np.arange(N) + 0.5
U = (xs + half) / res - 0.5
V = (zs + half) / res - 0.5
VV, UU = np.meshgrid(V, U, indexing="ij")
base = ndimage.map_coordinates(H10, [VV, UU], order=1, mode="nearest").astype(np.float32)
h = base.copy()


def fbm(shape, scale_px, octaves, seed, gain=0.5):
    r = np.random.default_rng(seed)
    out = np.zeros(shape, np.float32)
    amp, tot = 1.0, 0.0
    for o in range(octaves):
        s = scale_px / 2 ** o
        g = r.standard_normal((int(shape[0] / s) + 3, int(shape[1] / s) + 3)).astype(np.float32)
        up = ndimage.zoom(g, s, order=3)[: shape[0], : shape[1]]
        out += amp * up
        tot += amp
        amp *= gain
    return out / tot


# ------------------------------------------------------------------ slope
gz, gx = np.gradient(ndimage.gaussian_filter(base, 2.0))
slope = np.hypot(gx, gz)  # rise per metre
slope_deg = np.degrees(np.arctan(slope))

# ------------------------------------------------------------------ hummocks
hum = fbm((N, N), 48, 4, 11) * 0.35 + fbm((N, N), 9, 2, 12) * 0.08
h += hum

# ------------------------------------------------------------------ gullies from D8 flow on a 2 m grid
# flow is routed over the smoothed real surface plus meandering noise, so channels wander
# instead of following the 10 m grid facets
S = 2
surf = ndimage.gaussian_filter(base, 5) + fbm((N, N), 60, 3, 13) * 0.9 + fbm((N, N), 14, 2, 14) * 0.25
b4 = ndimage.zoom(surf, 1 / S, order=1)
n4 = b4.shape[0]
order = np.argsort(-b4.ravel())
acc = np.ones(n4 * n4, np.float32)
flat = b4.ravel()
offs = [(-1, -1), (-1, 0), (-1, 1), (0, -1), (0, 1), (1, -1), (1, 0), (1, 1)]
rows, cols = np.divmod(np.arange(n4 * n4), n4)
best = np.full(n4 * n4, -1, np.int64)
bestdrop = np.zeros(n4 * n4, np.float32)
for dr, dc in offs:
    r2, c2 = rows + dr, cols + dc
    ok = (r2 >= 0) & (r2 < n4) & (c2 >= 0) & (c2 < n4)
    j = np.where(ok, r2 * n4 + c2, 0)
    drop = np.where(ok, (flat - flat[j]) / math.hypot(dr, dc), -1)
    upd = drop > bestdrop
    best[upd] = j[upd]
    bestdrop[upd] = drop[upd]
for i in order:  # high to low: pass accumulated area downstream
    j = best[i]
    if j >= 0:
        acc[j] += acc[i]
A = acc.reshape(n4, n4) * S * S  # contributing area, m^2
chan = np.clip(np.sqrt(A / 3000.0) - 0.35, 0, None)
depth4 = np.minimum(1.3, 0.5 * chan)
depth4 = ndimage.gaussian_filter(depth4, 1.2)
depth = ndimage.zoom(depth4, S, order=3)[:N, :N]
depth = ndimage.gaussian_filter(np.clip(depth, 0, None), 1.5).astype(np.float32)
h -= depth
gully_wall = np.clip(depth * 1.2 - 0.25, 0, 1) * np.clip(slope * 3, 0, 1)

# ------------------------------------------------------------------ terracettes (mask only; the
# contour stripes are drawn per pixel in the terrain shader, 1 m texels would alias them)
mask_t = (np.clip((slope_deg - 11) / 6, 0, 1) * np.clip((34 - slope_deg) / 6, 0, 1)
          * np.clip((fbm((N, N), 160, 3, 21) + 0.1) * 3, 0, 1))
tread = mask_t

# ------------------------------------------------------------------ tracks and footpaths
objs = json.load(open(f"{OUT}/objects.json"))
lines = []
for t in objs.get("tracks", []):
    lines.append(([(x - X0, z - Z0) for x, z in t["pts"]], t["width"], t["cls"] == "track"))
V5 = {v["id"]: (v["x"] - X0, v["z"] - Z0) for v in meta["viewpoints"]}
lod = next(g for g in objs["guesthouses"] if g.get("home"))   # (岚川's public building: the camp the photos were taken from)
lodge_p = (lod["x"] - X0, lod["z"] - Z0)
sw = objs["swings"][0]
swing_p = (sw["x"] - X0, sw["z"] - Z0)
# footpaths: lodge -> photo-6/7 ridge -> swing, lodge -> yurt camp (photo 8)
def wander(a, b, n=14, amp=6.0, seed=0):
    r = np.random.default_rng(seed)
    out = []
    for k in range(n + 1):
        t = k / n
        x = a[0] + (b[0] - a[0]) * t
        z = a[1] + (b[1] - a[1]) * t
        nx, nz = -(b[1] - a[1]), b[0] - a[0]
        L = math.hypot(nx, nz) or 1
        o = math.sin(t * math.pi) * r.normal() * amp
        out.append((x + nx / L * o, z + nz / L * o))
    return out
lines.append((wander(lodge_p, V5[6], seed=1), 1.2, False))
lines.append((wander(V5[6], V5[7], seed=2), 1.1, False))
lines.append((wander(V5[7], swing_p, n=8, seed=3), 1.0, False))
lines.append((wander(lodge_p, V5[8], seed=4), 1.2, False))

trail = np.zeros((N, N), np.float32)
cut = np.zeros((N, N), np.float32)
hs = ndimage.gaussian_filter(h, 4.0)
for pts, width, ruts in lines:
    # dense polyline samples -> distance field
    img = np.zeros((N, N), bool)
    for (x0, z0), (x1, z1) in zip(pts[:-1], pts[1:]):
        L = max(1, int(math.hypot(x1 - x0, z1 - z0) * 2))
        for k in range(L + 1):
            x = x0 + (x1 - x0) * k / L
            z = z0 + (z1 - z0) * k / L
            i, j = int(z), int(x)
            if 0 <= i < N and 0 <= j < N:
                img[i, j] = True
    if not img.any():
        continue
    dist = ndimage.distance_transform_edt(~img)
    w = np.clip((width / 2 + 1.2 - dist) / 1.2, 0, 1)
    w = w * w * (3 - 2 * w)
    target = hs - 0.12
    new = h + (target - h) * w
    cut = np.maximum(cut, np.abs(new - h) * (dist > width / 2 - 0.3))
    h = new
    t = np.clip((width / 2 + 0.3 - dist) / 0.6, 0, 1)
    if ruts:  # two wheel ruts with a grassy median
        t = t * (0.3 + 0.7 * np.clip((dist - 0.2) / 0.45, 0, 1))
    trail = np.maximum(trail, t)
bank = np.clip(cut * 4 - 0.1, 0, 1)

# ------------------------------------------------------------------ today's guesthouse sites
GHL = json.load(open("data/layout/guesthouses.json"))
XX = X0 + np.arange(N, dtype=np.float32)[None, :] + 0.5
ZZ = Z0 + np.arange(N, dtype=np.float32)[:, None] + 0.5
ntrack = len(objs.get("tracks", []))
smooth = lambda t: t * t * (3 - 2 * t)
for site in GHL["sites"]:
    T = site.get("terrain")
    if not T:
        continue
    low = np.zeros((N, N), np.float32)
    for S in T.get("sink_roads", []):
        # the roads along the site run in a cut: sunk by `depth` (full within r_full of `centre`, none
        # beyond r_zero), with a bank `bank` m wide up to the ground beside them, bare earth
        cx, cz = S["centre"]
        reach = smooth(np.clip((S["r_zero"] - np.hypot(XX - cx, ZZ - cz)) / (S["r_zero"] - S["r_full"]), 0, 1))
        prof = np.zeros((N, N), np.float32)
        for pts, width, _ in lines[:ntrack]:
            # (only the roads passing within `via` m of the centre: the one this cut is for)
            dmin = 1e9
            for (ax, az), (bx, bz) in zip(pts[:-1], pts[1:]):
                ax, az, bx, bz = ax + X0, az + Z0, bx + X0, bz + Z0
                vx, vz = bx - ax, bz - az
                t = max(0.0, min(1.0, ((cx - ax) * vx + (cz - az) * vz) / (vx * vx + vz * vz + 1e-9)))
                dmin = min(dmin, math.hypot(cx - ax - t * vx, cz - az - t * vz))
            if dmin > S.get("via", 6.0):
                continue
            img = np.zeros((N, N), bool)
            for (x0, z0), (x1, z1) in zip(pts[:-1], pts[1:]):
                L = max(1, int(math.hypot(x1 - x0, z1 - z0) * 2))
                for k in range(L + 1):
                    i, j = int(z0 + (z1 - z0) * k / L), int(x0 + (x1 - x0) * k / L)
                    if 0 <= i < N and 0 <= j < N:
                        img[i, j] = True
            dist = ndimage.distance_transform_edt(~img)
            prof = np.maximum(prof, smooth(np.clip((width / 2 + 0.6 + S["bank"] - dist) / S["bank"], 0, 1)))
        sink = S["depth"] * reach * prof
        gzs, gxs = np.gradient(sink)
        if S.get("earth", True):   # (bare: a cut bank; else grown over, as the cosmos bank below 岚川's porch)
            bank = np.maximum(bank, np.clip((np.hypot(gxs, gzs) - 0.5) * 2.0, 0, 0.75) * reach)   # (bare only where steepest)
        low = np.maximum(low, sink)
    F = T.get("fall")
    if F:
        # the ground falls away `depth` m over `width` m from the building's front wall and its
        # east end (the porch and the steps stand over it), back to the lie of the land further out
        for g in objs["guesthouses"]:
            if g["model"] != F["model"]:
                continue
            pcx, pcz, hx, hz = g["pad"]
            xw, zb = hx - 0.6, pcz - hz + 0.6
            zf, W = -zb, F["width"]
            c, s_ = math.cos(g["rot"]), math.sin(g["rot"])
            dx, dz = XX - g["x"], ZZ - g["z"]
            lx, lz = dx * c - dz * s_, dx * s_ + dz * c
            u = np.zeros((N, N), np.float32)
            if "front" in F["sides"] and not F.get("ramp"):
                u = np.maximum(u, np.clip((lz - zf) / W, 0, 1) * np.clip((lx + xw + W) / W, 0, 1) * np.clip((xw + W + 2 - lx) / W, 0, 1)
                               * np.clip((zf + W + F.get("reach", 10) - lz) / 4, 0, 1))
            if "right" in F["sides"]:
                u = np.maximum(u, np.clip((lx - xw) / W, 0, 1) * np.clip((lz - zb + W) / W, 0, 1) * np.clip((xw + W + 10 - lx) / 4, 0, 1)
                               * np.clip((zf + W + 10 - lz) / 4, 0, 1))
            low = np.maximum(low, F["depth"] * smooth(u))
    h -= low
    R_ = F.get("ramp") if F else None
    if R_:
        # in front: the ground set as a ramp, from just under the front wall (level with the ground at
        # the back wall less a little) to `under` below that at the decks' front edge, then straight on
        # down to the road in front (its surface as sunk above) -- one climb from the road up to the house
        g = next(g for g in objs["guesthouses"] if g["model"] == F["model"])
        pcx, pcz, hx, hz = g["pad"]
        xw, zb = hx - 0.6, pcz - hz + 0.6
        zf = -zb
        c, s_ = math.cos(g["rot"]), math.sin(g["rot"])
        loc = lambda x, z: ((x - g["x"]) * c - (z - g["z"]) * s_, (x - g["x"]) * s_ + (z - g["z"]) * c)
        wld = lambda lx_, lz_: (g["x"] + lx_ * c + lz_ * s_, g["z"] - lx_ * s_ + lz_ * c)
        hat = lambda x, z: h[np.clip(int(z - Z0), 0, N - 1), np.clip(int(x - X0), 0, N - 1)]
        Lb = float(np.mean([hat(*wld(t, zb)) for t in np.linspace(-xw, xw, 21)]))
        # the road in front (the traced line passing nearest the ramp's `road` point), as lz(lx)
        def seg_d(px, pz, pts):
            d = 1e9
            for (ax, az), (bx, bz) in zip(pts[:-1], pts[1:]):
                vx, vz = bx - ax, bz - az
                t = max(0.0, min(1.0, ((px - ax) * vx + (pz - az) * vz) / (vx * vx + vz * vz + 1e-9)))
                d = min(d, math.hypot(px - ax - t * vx, pz - az - t * vz))
            return d
        rt = min(objs["tracks"], key=lambda t_: seg_d(*R_["road"], t_["pts"]))
        rl, rw = sorted(loc(x, z) for x, z in rt["pts"]), rt["width"]
        rx, rz = np.array([a for a, _ in rl]), np.array([b for _, b in rl])
        dx, dz = XX - g["x"], ZZ - g["z"]
        lx, lz = dx * c - dz * s_, dx * s_ + dz * c
        lzr = np.interp(lx, rx, rz)                                   # the road's centre in front
        edge = lzr - rw / 2 - 0.4
        hr = np.interp(lx, np.linspace(-xw - 25, xw + 25, 101),
                       [hat(*wld(t, float(np.interp(t, rx, rz)))) for t in np.linspace(-xw - 25, xw + 25, 101)])
        zd = np.full((N, N), zf + R_.get("deck", 0.0), np.float32)
        for mcx, mcz, mhx, mhz in g.get("masks", []):                 # (decks reaching further out)
            zd = np.where((lx > mcx - mhx) & (lx < mcx + mhx), np.maximum(zd, mcz + mhz - 0.3), zd)
        top = Lb - 0.3
        side = smooth(np.clip((xw + R_["side"] - np.abs(lx)) / R_["side"], 0, 1))
        if "bank" in R_:
            # a steep bank from the front wall down to a level yard at the road's height (the satellite: a
            # bare patch between the building and the road), the yard on to the road
            Y = hr + R_.get("yard", 0.05)
            T_ = top + (Y - top) * smooth(np.clip((lz - zf) / R_["bank"], 0, 1))
            yard = np.clip((lz - zf - R_["bank"]) / 1.0, 0, 1) * (lz < edge) * side
            if R_.get("dirt", False):   # (a bare yard; else grown over -- 岚川's: cosmos, the user)
                trail = np.maximum(trail, 0.55 * yard)
        else:
            under = Lb - R_["under"]
            T_ = np.where(lz < zd, top + (under - top) * np.clip((lz - zf) / (zd - zf), 0, 1),
                          under + (np.minimum(hr, under) - under) * np.clip((lz - zd) / np.maximum(edge - zd, 0.5), 0, 1))
        wz = np.clip((lz - zf + 0.3) / 0.6, 0, 1) * (lz < edge + 0.5) * side
        h = h * (1 - wz) + T_ * wz
        print(site["name"], "front: back %.2f, road %.2f..%.2f" % (Lb, float(np.min(hr)), float(np.max(hr))))
    print(site["name"], "ground lowered up to %.2f m" % low.max())

# ------------------------------------------------------------------ fade out at the square's edges
e = np.minimum.reduce([np.arange(N)[None, :].repeat(N, 0), np.arange(N)[::-1][None, :].repeat(N, 0),
                       np.arange(N)[:, None].repeat(N, 1), np.arange(N)[::-1][:, None].repeat(N, 1)]).astype(np.float32)
fade = np.clip(e / 120.0, 0, 1)
fade = fade * fade * (3 - 2 * fade)
delta = (h - base) * fade
SCALE = 0.03
q = np.clip(np.round(delta / SCALE) + 128, 0, 255).astype(np.uint8)
rgba = np.stack([q, (trail * fade * 255).astype(np.uint8), (np.clip(bank + gully_wall, 0, 1) * fade * 255).astype(np.uint8),
                 (tread * fade * 255).astype(np.uint8)], -1)
with gzip.open(f"{OUT}/detail.bin.gz", "wb", compresslevel=9) as f:
    f.write(rgba.tobytes())
json.dump({"origin": [X0, Z0], "size": N, "res": 1.0, "scale": SCALE}, open(f"{OUT}/detail.json", "w"))
import os
print("delta range %.2f..%.2f m" % (delta.min(), delta.max()), "gully max %.2f" % depth.max(),
      "trail px", int((trail > 0.5).sum()), "size", os.path.getsize(f"{OUT}/detail.bin.gz") // 1024, "KB")

# preview (hillshade of the detailed surface)
from PIL import Image
hh = base + delta
gz2, gx2 = np.gradient(hh)
shade = np.clip(0.55 + (-gx2 * 0.6 - gz2 * 0.6) * 1.5, 0, 1)
pv = np.stack([shade] * 3, -1)
pv[..., 0] = np.maximum(pv[..., 0], trail * 0.9)
pv[..., 2] = np.maximum(pv[..., 2], np.clip(bank + gully_wall, 0, 1) * 0.8)
Image.fromarray((pv[::2, ::2] * 255).astype(np.uint8)).save(sys.argv[1] if len(sys.argv) > 1 else "detail_preview.png")
