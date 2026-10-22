"""Compare a view rendered as on the ground (plants, grass, flower rings) with the same view in
far-view shading only (devtools __farPair): mean linear colour of the meadow in the lower part
of the frame, and the near/far ratio per channel. The far shading should reproduce the near.
Usage: farcal.py prefix site1 site2 ...
"""
import sys
import numpy as np
from PIL import Image


def lin(a):
    return np.where(a <= 0.04045, a / 12.92, ((a + 0.055) / 1.055) ** 2.4)


prefix, sites = sys.argv[1], sys.argv[2:]
rs = []
for s in sites:
    m = {}
    for k in ("near", "far"):
        a = np.asarray(Image.open(f"docs/snapshots/{prefix}_{s}_{k}.jpg").convert("RGB"), np.float32) / 255
        h, w = a.shape[:2]
        # the ground round the look-at point (screen centre), clear of the horizon
        win = lin(a[int(h * 0.42):int(h * 0.92), int(w * 0.15):int(w * 0.85)])
        m[k] = win.reshape(-1, 3).mean(0)
    r = m["near"] / m["far"]
    rs.append(r)
    print(f"{s:8s} near {np.round(m['near'], 3)}  far {np.round(m['far'], 3)}  near/far {np.round(r, 2)}")
print("mean ratio", np.round(np.mean(rs, 0), 3))
