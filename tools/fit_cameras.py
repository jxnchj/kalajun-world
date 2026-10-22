"""Fit yaw/pitch/roll of each photo by matching its skyline to the DEM horizon."""
import sys, json, math
import numpy as np
sys.path.insert(0, "tools")
from viewpoint import *
from skyline import skyline

W = 350


def project(az, el, yaw, pitch, roll, f, w, h):
    az, el = np.radians(az), np.radians(el)
    d = np.stack([np.sin(az) * np.cos(el), np.cos(az) * np.cos(el), np.sin(el)], -1)
    y, p, r = map(math.radians, (yaw, pitch, roll))
    F = np.array([math.sin(y) * math.cos(p), math.cos(y) * math.cos(p), math.sin(p)])
    R = np.array([math.cos(y), -math.sin(y), 0.0])
    U = np.cross(R, F)
    R, U = R * math.cos(r) + U * math.sin(r), U * math.cos(r) - R * math.sin(r)
    z = d @ F
    u = f * (d @ R) / z; v = f * (d @ U) / z
    return w / 2 + u, h / 2 - v, z > 0.1


def syn_rows(hor, az, yaw, pitch, roll, f, w, h, hfov):
    da = ((az - yaw + 180) % 360) - 180
    m = np.abs(da) < hfov * 0.75 + 5
    c, r, ok = project(az[m], hor[m], yaw, pitch, roll, f, w, h)
    o = np.argsort(c[ok])
    return np.interp(np.arange(w) + 0.5, c[ok][o], r[ok][o], left=np.nan, right=np.nan)


def score(prow, srow, keep=0.7):
    m = ~np.isnan(prow) & ~np.isnan(srow)
    if m.sum() < 0.15 * len(prow): return 1e9
    e = np.sort(np.abs(prow[m] - srow[m]))
    return e[: max(1, int(len(e) * keep))].mean()


def fit(name, yaw_range=None, mask_cols=None):
    la, lo, t, f35, w0, h0 = PHOTOS[name]
    h = round(W * h0 / w0)
    hf = hfov_deg(f35, w0, h0)
    f = (W / 2) / math.tan(math.radians(hf / 2))
    prow, _, _ = skyline(name + ".jpg", W)
    if mask_cols is not None:
        for a, b in mask_cols: prow[int(a * W):int(b * W)] = np.nan
    x, y = TO_UTM.transform(lo, la)
    _, hor, az, el, _ = panorama(Terrain(), x, y, az_res=0.05)
    yaws = np.arange(*(yaw_range or (0, 360)), 1.0)
    coarse = []
    for yw in yaws:
        for p in np.arange(-15, 16, 1.0):
            coarse.append((score(prow, syn_rows(hor, az, yw, p, 0, f, W, h, hf)), yw, p))
    coarse.sort()
    seeds = []
    for s_, yw, p in coarse:  # refine the best few distinct yaw candidates (avoid local minima)
        if all(abs(((yw - q + 180) % 360) - 180) > 3 for q, _ in seeds): seeds.append((yw, p))
        if len(seeds) == 6: break
    best = (1e9,)
    for yw0, p0 in seeds:
        for yw in np.arange(yw0 - 3, yw0 + 3, 0.1):
            for p in np.arange(p0 - 2, p0 + 2, 0.2):
                for r in np.arange(-4, 4.1, 0.5):
                    s = score(prow, syn_rows(hor, az, yw, p, r, f, W, h, hf))
                    if s < best[0]: best = (s, yw, p, r)
    return dict(yaw=round(float(best[1]) % 360, 2), pitch=round(float(best[2]), 2), roll=round(float(best[3]), 2), err_px=round(float(best[0]), 2), err_deg=round(float(best[0]) * hf / W, 3))


if __name__ == "__main__":
    # sun-derived yaw windows for sunset shots; building columns masked
    opts = {
        "private-photo-02": dict(yaw_range=(285, 315), mask_cols=[(0.52, 0.80)]),
        "private-photo-03": dict(yaw_range=(280, 305)),
        "private-photo-04": dict(mask_cols=[(0.28, 1.0)]),
        "private-photo-05": dict(mask_cols=[(0.0, 0.42)]),
        "private-photo-06": dict(mask_cols=[(0.0, 0.47)]),
    }
    names = sys.argv[1:] or [n for n in PHOTOS if n != "private-photo-07"]
    res = {}
    for n in names:
        res[n] = fit(n, **opts.get(n, {}))
        print(n, res[n], flush=True)
    old = json.load(open("tools/cameras.local.json")) if __import__("os").path.exists("tools/cameras.local.json") else {}
    old.update(res)
    json.dump(old, open("tools/cameras.local.json", "w"), indent=1)
