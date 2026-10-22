"""Historical satellite imagery (Esri World Imagery Wayback) over the camps, for tracing the
older layout of tracks, farmsteads and paddocks. Reference only: the imagery is not published
with the model.

For each distinct acquisition (data/raw/wayback/versions.json + metadata.json) download the z17
tiles over a 4096 m square centred on the 2 km detail slice and resample them onto the scene
grid (1 m/px, x east, z south, same frame as web/public/data/detail.json):
  data/raw/wayback/scene_<acq-date>.jpg   4096x4096, pixel (i, j) = scene (X0 + i, Z0 + j)
Usage: wayback.py [release-id ...]   (default: one release per acquisition date)
"""
import io, json, math, os, sys, urllib.request
from concurrent.futures import ThreadPoolExecutor
import numpy as np
from PIL import Image
from pyproj import Transformer
from scipy import ndimage

D = "data/raw/wayback"
UTM0 = (597060.0, 4756230.0)          # scene origin (EPSG:32644)
X0, Z0, SIZE = -4021.0, 1372.0, 4096  # scene square (m), centred on the detail slice
Z = 17
URL = "https://wayback.maptiles.arcgis.com/arcgis/rest/services/World_Imagery/WMTS/1.0.0/default028mm/MapServer/tile/{rid}/{z}/{y}/{x}"

to_ll = Transformer.from_crs(32644, 4326, always_xy=True)


def tile_xy(lon, lat, z):
    n = 2 ** z
    x = (lon + 180) / 360 * n
    y = (1 - np.log(np.tan(np.radians(lat)) + 1 / np.cos(np.radians(lat))) / np.pi) / 2 * n
    return x, y


def fetch(rid, x, y):
    path = f"{D}/tiles/{rid}/{Z}_{x}_{y}.jpg"
    if os.path.exists(path):
        return path
    os.makedirs(os.path.dirname(path), exist_ok=True)
    req = urllib.request.Request(URL.format(rid=rid, z=Z, x=x, y=y), headers={"User-Agent": "Mozilla/5.0"})
    for _ in range(3):
        try:
            data = urllib.request.urlopen(req, timeout=30).read()
            open(path, "wb").write(data)
            return path
        except Exception:
            pass
    return None


def build(rid, name):
    # scene grid -> lon/lat -> fractional tile coordinates
    s = np.arange(SIZE, dtype=np.float64) + 0.5
    gx, gz = np.meshgrid(X0 + s, Z0 + s)
    lon, lat = to_ll.transform(UTM0[0] + gx, UTM0[1] - gz)
    tx, ty = tile_xy(lon, lat, Z)
    x0, x1, y0, y1 = int(tx.min()), int(tx.max()), int(ty.min()), int(ty.max())
    jobs = [(x, y) for y in range(y0, y1 + 1) for x in range(x0, x1 + 1)]
    with ThreadPoolExecutor(12) as ex:
        paths = list(ex.map(lambda xy: fetch(rid, *xy), jobs))
    W, H = (x1 - x0 + 1) * 256, (y1 - y0 + 1) * 256
    mosaic = np.zeros((H, W, 3), np.uint8)
    for (x, y), p in zip(jobs, paths):
        if p:
            try:
                mosaic[(y - y0) * 256:(y - y0 + 1) * 256, (x - x0) * 256:(x - x0 + 1) * 256] = np.asarray(Image.open(p).convert("RGB"))
            except Exception:
                pass
    px, py = (tx - x0) * 256 - 0.5, (ty - y0) * 256 - 0.5
    out = np.dstack([ndimage.map_coordinates(mosaic[..., c], [py, px], order=1) for c in range(3)])
    Image.fromarray(out).save(f"{D}/scene_{name}.jpg", quality=88)
    print(name, rid, f"{len(jobs)} tiles, {sum(p is None for p in paths)} missing")


if __name__ == "__main__":
    vers = json.load(open(f"{D}/versions.json"))
    meta = json.load(open(f"{D}/metadata.json"))
    todo = {}
    for rid, rel in vers:  # earliest release that carries each acquisition
        acq = str(meta[rid][1]["SRC_DATE"]) if meta.get(rid) else rel
        todo.setdefault(f"{acq[:4]}-{acq[4:6]}-{acq[6:]}", rid)
    if len(sys.argv) > 1:
        todo = {k: v for k, v in todo.items() if v in sys.argv[1:]}
    for name, rid in todo.items():
        build(rid, name)
