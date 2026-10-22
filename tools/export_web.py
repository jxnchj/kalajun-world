"""Export terrain, land cover, viewpoints and photos for the web scene (web/public).

Local scene frame: x = east, z = south (north = -z), y = up, metres; origin = core centre.
Height grids are row-major with row 0 at the north edge; texel (i, j) centre is at
x = -S/2 + (i + .5) * res, z = -S/2 + (j + .5) * res. Heights: uint16, decimetres.
"""
import json, gzip, math, os, sys
import numpy as np
import rasterio
from rasterio.warp import reproject, Resampling
from rasterio.transform import from_origin
from scipy import ndimage
from PIL import Image
sys.path.insert(0, "tools")
from extent import CORE, FAR, CORE_SIZE, FAR_SIZE, cx, cy
from viewpoint import PHOTOS, TO_UTM, hfov_deg, Terrain

OUT = "web/public/data"; os.makedirs(OUT, exist_ok=True)
PH = "web/public/photos"; os.makedirs(PH, exist_ok=True)
UTM = "EPSG:32644"


def dem_grid(bounds, res, smooth_px=0.0):
    with rasterio.open("data/dem_utm30.tif") as src:
        z = src.read(1); t = src.transform
    bad = ~np.isfinite(z)  # reprojection edges: fill with nearest valid so splines stay finite
    if bad.any():
        idx = ndimage.distance_transform_edt(bad, return_distances=False, return_indices=True)
        z = z[tuple(idx)]
    n = int(round((bounds[2] - bounds[0]) / res))
    if smooth_px: z = ndimage.gaussian_filter(z, smooth_px)
    xs = bounds[0] + (np.arange(n) + 0.5) * res
    ys = bounds[3] - (np.arange(n) + 0.5) * res
    X, Y = np.meshgrid(xs, ys)
    col = (X - t.c) / t.a - 0.5; row = (Y - t.f) / t.e - 0.5
    g = ndimage.map_coordinates(z, [row, col], order=3 if res < 30 else 1, mode="nearest")
    assert np.isfinite(g).all() and g.min() > 500, (g.min(), g.max())
    return g.astype(np.float32)


def save_height(name, g):
    q = np.round(g * 10).astype("<u2")
    with gzip.open(f"{OUT}/{name}.bin.gz", "wb", compresslevel=9) as f:
        f.write(q.tobytes())
    print(name, g.shape, "range %.0f-%.0f m" % (g.min(), g.max()), os.path.getsize(f"{OUT}/{name}.bin.gz") // 1024, "KB")


def landcover_grid(bounds, res, src_path, src_crs=None):
    n = int(round((bounds[2] - bounds[0]) / res))
    dst = np.zeros((n, n), np.uint8)
    with rasterio.open(src_path) as src:
        reproject(rasterio.band(src, 1), dst, dst_transform=from_origin(bounds[0], bounds[3], res, res),
                  dst_crs=UTM, resampling=Resampling.nearest)
    return dst


def save_landcover(name, lc, sigma):
    """RGB: R = tree cover, G = bare rock / alpine sparse, B = snow & ice."""
    ch = [(lc == 10), np.isin(lc, (60, 100)), (lc == 70)]
    rgb = np.stack([ndimage.gaussian_filter(c.astype(np.float32), sigma) for c in ch], -1)
    Image.fromarray(np.round(rgb * 255).astype(np.uint8), "RGB").save(f"{OUT}/{name}.png", optimize=True)
    print(name, lc.shape, {k: round(float((lc == k).mean() * 100), 1) for k in (10, 30, 60, 70, 100)})


if __name__ == "__main__":
    save_height("core_height", dem_grid(CORE, 10.0))
    save_height("far_height", dem_grid(FAR, 80.0, smooth_px=1.2))

    save_landcover("core_landcover", landcover_grid(CORE, 10.0, "data/landcover_utm10.tif"), 0.7)
    # far land cover: coarse read of the WorldCover COG (uses overviews)
    far_lc_path = "data/raw/worldcover_far_80m.tif"
    if not os.path.exists(far_lc_path):
        url = "/vsicurl/https://esa-worldcover.s3.eu-central-1.amazonaws.com/v200/2021/map/ESA_WorldCover_10m_2021_v200_N42E081_Map.tif"
        from rasterio.windows import from_bounds
        with rasterio.open(url) as src:
            win = from_bounds(81.60, 42.50, 82.80, 43.40, src.transform)
            shape = (int(win.height // 8), int(win.width // 8))
            a = src.read(1, window=win, out_shape=shape, resampling=Resampling.mode)
            t = src.window_transform(win) * rasterio.Affine.scale(win.width / shape[1], win.height / shape[0])
            prof = dict(driver="GTiff", width=shape[1], height=shape[0], count=1, dtype="uint8", crs=src.crs, transform=t, compress="deflate")
        with rasterio.open(far_lc_path, "w", **prof) as d: d.write(a, 1)
    save_landcover("far_landcover", landcover_grid(FAR, 80.0, far_lc_path), 0.6)

    # viewpoints
    cams = json.load(open("tools/cameras.local.json")) if PHOTOS else {}
    terr = Terrain()
    vps = []
    for i, (name, (la, lo, t, f35, w, h)) in enumerate(PHOTOS.items(), 1):
        x, y = TO_UTM.transform(lo, la)
        ground = float(terr.sample(np.array([x]), np.array([y]))[0])
        c = cams[name]
        im = Image.open(f"{name}.jpg").convert("RGB")
        im.thumbnail((1600, 1600), Image.LANCZOS); im.save(f"{PH}/{i}.jpg", quality=86, optimize=True)
        th = im.copy(); th.thumbnail((240, 240), Image.LANCZOS); th.save(f"{PH}/{i}_thumb.jpg", quality=80)
        vps.append(dict(id=i, file=name, time=t, lat=la, lon=lo, x=round(x - cx, 2), z=round(cy - y, 2),
                        ground=round(ground, 2), eye=1.6, yaw=c["yaw"], pitch=c["pitch"], roll=c.get("roll", 0.0),
                        hfov=round(hfov_deg(f35, w, h), 3), aspect=round(w / h, 4), f35=f35))
    meta = dict(core=dict(size=CORE_SIZE, res=10.0, n=2048), far=dict(size=FAR_SIZE, res=80.0, n=1024),
                origin_utm=[cx, cy], crs=UTM, height_scale=0.1, lat=42.95, lon=82.19, viewpoints=vps,
                credits=["Copernicus DEM GLO-30 © DLR e.V. 2010-2014 and © Airbus Defence and Space GmbH 2014-2018, provided under COPERNICUS by the European Union and ESA",
                         "ESA WorldCover 2021 (CC BY 4.0)", "OpenStreetMap contributors (ODbL)"])
    json.dump(meta, open(f"{OUT}/scene.json", "w"), ensure_ascii=False, indent=1)
    print("viewpoints", len(vps))
