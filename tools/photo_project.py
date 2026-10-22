"""Project photo pixels onto the terrain with the calibrated cameras (tools/cameras.json).

pixel (u, v) in the full-resolution photo -> world hit point in the web scene frame
(x east, z south, metres from the core centre) using the exported 10 m core heights.
"""
import json, gzip, math, sys
import numpy as np
from scipy.ndimage import map_coordinates
sys.path.insert(0, "tools")
from viewpoint import hfov_deg

META = json.load(open("web/public/data/scene.json"))
CAMS = {v["file"]: v for v in META["viewpoints"]}
_H = np.frombuffer(gzip.open("web/public/data/core_height.bin.gz").read(), dtype="<u2").reshape(2048, 2048) / 10.0
HALF, RES = META["core"]["size"] / 2, META["core"]["res"]


def height(x, z):
    u = np.atleast_1d((np.asarray(x, float) + HALF) / RES - 0.5)
    v = np.atleast_1d((np.asarray(z, float) + HALF) / RES - 0.5)
    r = map_coordinates(_H, [v, u], order=1, mode="nearest")
    return r if np.ndim(x) else float(r[0])


def ray(file, u, v, w, h):
    c = CAMS[file]
    hf = c["hfov"]
    f = (w / 2) / math.tan(math.radians(hf / 2))
    x_c, y_c = u - w / 2, h / 2 - v
    y, p, r = map(math.radians, (c["yaw"], c["pitch"], c["roll"]))
    # camera basis in (east, north, up)
    F = np.array([math.sin(y) * math.cos(p), math.cos(y) * math.cos(p), math.sin(p)])
    R = np.array([math.cos(y), -math.sin(y), 0.0])
    U = np.cross(R, F)
    R, U = R * math.cos(r) + U * math.sin(r), U * math.cos(r) - R * math.sin(r)
    d = F * f + R * x_c + U * y_c
    d /= np.linalg.norm(d)
    return np.array([d[0], -d[1], d[2]])  # -> (x east, z south, up)


def project(file, u, v, w, h, max_d=6000):
    c = CAMS[file]
    d = ray(file, u, v, w, h)
    o = np.array([c["x"], c["z"], c["ground"] + c["eye"]])
    t = np.geomspace(1.0, max_d, 4000)
    pts = o[None, :] + t[:, None] * d[None, :]
    below = pts[:, 2] < height(pts[:, 0], pts[:, 1])
    if not below.any():
        return None
    i = int(np.argmax(below))
    lo, hi = t[max(i - 1, 0)], t[i]
    for _ in range(30):  # refine
        m = (lo + hi) / 2
        q = o + m * d
        if q[2] < height(q[0], q[1]): hi = m
        else: lo = m
    q = o + hi * d
    return float(q[0]), float(q[1]), float(hi)
