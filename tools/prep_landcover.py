"""Reproject ESA WorldCover (10 m) to the UTM 44N grid used by the scene."""
import numpy as np
import rasterio
from rasterio.warp import reproject, Resampling
from rasterio.transform import from_origin
from pyproj import Transformer

with rasterio.open("data/raw/worldcover_2021.tif") as src:
    a = src.read(1); tr = src.transform; crs = src.crs
    b = src.bounds
to = Transformer.from_crs("EPSG:4326", "EPSG:32644", always_xy=True)
xs, ys = to.transform([b.left, b.right, b.left, b.right], [b.bottom, b.bottom, b.top, b.top])
x0, x1, y0, y1 = max(min(xs[0], xs[2]), 0), min(xs[1], xs[3]), max(ys[0], ys[1]), min(ys[2], ys[3])
res = 10.0
w, h = int((x1 - x0) / res), int((y1 - y0) / res)
t = from_origin(x0, y1, res, res)
out = np.zeros((h, w), np.uint8)
reproject(a, out, src_transform=tr, src_crs=crs, dst_transform=t, dst_crs="EPSG:32644", resampling=Resampling.nearest)
prof = dict(driver="GTiff", width=w, height=h, count=1, dtype="uint8", crs="EPSG:32644", transform=t, compress="deflate")
with rasterio.open("data/landcover_utm10.tif", "w", **prof) as dst:
    dst.write(out, 1)
print("wrote", w, h, t)
