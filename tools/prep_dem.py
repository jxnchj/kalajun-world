"""Merge Copernicus DEM tiles and reproject to UTM 44N (EPSG:32644), 30 m grid."""
import glob
import numpy as np
import rasterio
from rasterio.merge import merge
from rasterio.warp import calculate_default_transform, reproject, Resampling

BOUNDS = (81.6, 42.55, 82.8, 43.35)  # lon/lat wide region incl. horizon mountains
DST_CRS = "EPSG:32644"
RES = 30.0

srcs = [rasterio.open(f) for f in sorted(glob.glob("data/raw/Copernicus_*.tif"))]
z, tr = merge(srcs, bounds=BOUNDS)
z = z[0].astype(np.float32)
crs = srcs[0].crs
t, w, h = calculate_default_transform(crs, DST_CRS, z.shape[1], z.shape[0], *BOUNDS, resolution=RES)
out = np.zeros((h, w), np.float32)
reproject(z, out, src_transform=tr, src_crs=crs, dst_transform=t, dst_crs=DST_CRS, resampling=Resampling.cubic, dst_nodata=np.nan)
prof = dict(driver="GTiff", width=w, height=h, count=1, dtype="float32", crs=DST_CRS, transform=t, compress="deflate", nodata=np.nan)
with rasterio.open("data/dem_utm30.tif", "w", **prof) as dst:
    dst.write(out, 1)
print("wrote", w, h, t)
