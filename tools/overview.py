"""Merge DEM tiles and render an overview hillshade with photo locations."""
import glob, sys
import numpy as np
import rasterio
from rasterio.merge import merge
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.colors import LightSource

from pathlib import Path
import json
_photo_config = Path(__file__).with_name("photos.local.json")
_private_photos = json.loads(_photo_config.read_text()) if _photo_config.exists() else {}
PHOTOS = {name: tuple(values[:2]) for name, values in _private_photos.items()}

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
