"""Scene extent definition (UTM 44N) shared by preprocessing scripts."""
from pyproj import Transformer
_to = Transformer.from_crs("EPSG:4326", "EPSG:32644", always_xy=True)
# core high-detail area: photo site, Qiongkushitai valley, Kurdai canyon, front-range peaks
CORE_LONLAT = (82.075, 42.860, 82.305, 43.045)
xs, ys = _to.transform([CORE_LONLAT[0], CORE_LONLAT[2]], [CORE_LONLAT[1], CORE_LONLAT[3]])
cx, cy = round((xs[0] + xs[1]) / 2, -1), round((ys[0] + ys[1]) / 2, -1)
CORE_SIZE = 20480.0            # square, metres (2048 px @ 10 m)
CORE = (cx - CORE_SIZE / 2, cy - CORE_SIZE / 2, cx + CORE_SIZE / 2, cy + CORE_SIZE / 2)
FAR_SIZE = 81920.0             # horizon ring (1024 px @ 80 m)
FAR = (cx - FAR_SIZE / 2, cy - FAR_SIZE / 2, cx + FAR_SIZE / 2, cy + FAR_SIZE / 2)
