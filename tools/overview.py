"""Merge DEM tiles and render an overview hillshade with photo locations."""
import glob, sys
import numpy as np
import rasterio
from rasterio.merge import merge
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.colors import LightSource

PHOTOS = {  # file stem suffix -> (lat, lon)
    "011": (42.92234, 82.1652985), "015": (42.9222033, 82.165123), "022": (42.9222033, 82.165123),
    "025": (42.921505, 82.165123), "031": (42.9216883, 82.1648712), "035": (42.927735, 82.1641158),
    "215": (42.92825, 82.168235), "219": (42.919785, 82.168015),
}

def load(bounds):
    srcs = [rasterio.open(f) for f in sorted(glob.glob("data/raw/Copernicus_*.tif"))]
    arr, tr = merge(srcs, bounds=bounds)
    return arr[0], tr

if __name__ == "__main__":
    w, s, e, n = map(float, sys.argv[1:5])
    out = sys.argv[5]
    z, tr = load((w, s, e, n))
    ls = LightSource(azdeg=315, altdeg=40)
    # approximate metres per degree for correct hillshade aspect
    dx = tr.a * 111320 * np.cos(np.radians((s + n) / 2)); dy = -tr.e * 110540
    rgb = ls.shade(z, cmap=plt.cm.terrain, vert_exag=1.5, blend_mode="soft", dx=dx, dy=dy, vmin=800, vmax=4200)
    fig, ax = plt.subplots(figsize=(14, 14 * (n - s) / ((e - w) * np.cos(np.radians(43)))))
    ax.imshow(rgb, extent=(w, e, s, n), aspect=1 / np.cos(np.radians(43)))
    cs = ax.contour(np.linspace(w, e, z.shape[1]), np.linspace(n, s, z.shape[0]), z, levels=range(1000, 4500, 500), colors="k", linewidths=0.3)
    ax.clabel(cs, fontsize=6)
    for k, (la, lo) in PHOTOS.items():
        ax.plot(lo, la, "r.", ms=6)
    ax.set_title(f"elev {z.min():.0f}-{z.max():.0f} m")
    plt.savefig(out, dpi=110, bbox_inches="tight")
