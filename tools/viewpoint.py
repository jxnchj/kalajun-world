"""Terrain panoramas from the photo GPS positions + sun position, for camera calibration.

Renders a 'voxel space' style panorama (azimuth x elevation angle) from the DEM:
each pixel is shaded by the distance of the first terrain hit, with earth curvature.
"""
import math, datetime as dt
import numpy as np
import rasterio
from pyproj import Transformer
from scipy.ndimage import map_coordinates

TO_UTM = Transformer.from_crs("EPSG:4326", "EPSG:32644", always_xy=True)

# name -> (lat, lon, local time UTC+8, 35mm-equivalent focal, width, height)
# Private camera locations are intentionally absent from version control.
# Optional local JSON uses the original name -> [lat, lon, time, focal, w, h] schema.
import json as _json
from pathlib import Path as _Path
_photo_config = _Path(__file__).with_name("photos.local.json")
PHOTOS = _json.loads(_photo_config.read_text()) if _photo_config.exists() else {}


def hfov_deg(f35, w, h):
    """Horizontal FOV from 35mm-equivalent focal (diagonal-based equivalence)."""
    diag = math.hypot(36, 24)
    sensor_w = diag * w / math.hypot(w, h)
    return math.degrees(2 * math.atan(sensor_w / 2 / f35))


def sun_position(lat, lon, local, tz=8):
    """NOAA solar position; returns (azimuth deg from north clockwise, elevation deg)."""
    t = dt.datetime.fromisoformat(local) - dt.timedelta(hours=tz)
    jd = (t - dt.datetime(2000, 1, 1, 12)).total_seconds() / 86400 + 2451545.0
    jc = (jd - 2451545) / 36525
    L0 = (280.46646 + jc * (36000.76983 + jc * 0.0003032)) % 360
    M = 357.52911 + jc * (35999.05029 - 0.0001537 * jc)
    e = 0.016708634 - jc * (0.000042037 + 0.0000001267 * jc)
    Mr = math.radians(M)
    C = math.sin(Mr) * (1.914602 - jc * (0.004817 + 0.000014 * jc)) + math.sin(2 * Mr) * (0.019993 - 0.000101 * jc) + math.sin(3 * Mr) * 0.000289
    lam = L0 + C - 0.00569 - 0.00478 * math.sin(math.radians(125.04 - 1934.136 * jc))
    eps0 = 23 + (26 + (21.448 - jc * (46.815 + jc * (0.00059 - jc * 0.001813))) / 60) / 60
    eps = eps0 + 0.00256 * math.cos(math.radians(125.04 - 1934.136 * jc))
    decl = math.asin(math.sin(math.radians(eps)) * math.sin(math.radians(lam)))
    y = math.tan(math.radians(eps / 2)) ** 2
    L0r = math.radians(L0)
    eot = 4 * math.degrees(y * math.sin(2 * L0r) - 2 * e * math.sin(Mr) + 4 * e * y * math.sin(Mr) * math.cos(2 * L0r)
                           - 0.5 * y * y * math.sin(4 * L0r) - 1.25 * e * e * math.sin(2 * Mr))
    minutes = t.hour * 60 + t.minute + t.second / 60
    tst = (minutes + eot + 4 * lon) % 1440
    ha = math.radians(tst / 4 - 180)
    latr = math.radians(lat)
    cz = math.sin(latr) * math.sin(decl) + math.cos(latr) * math.cos(decl) * math.cos(ha)
    zen = math.acos(max(-1, min(1, cz)))
    az = math.degrees(math.atan2(math.sin(ha), math.cos(ha) * math.sin(latr) - math.tan(decl) * math.cos(latr))) + 180
    return az % 360, 90 - math.degrees(zen)


class Terrain:
    def __init__(self, path="data/dem_utm30.tif"):
        with rasterio.open(path) as src:
            self.z = np.nan_to_num(src.read(1), nan=0.0)
            self.t = src.transform

    def sample(self, x, y):
        col = (x - self.t.c) / self.t.a - 0.5
        row = (y - self.t.f) / self.t.e - 0.5
        return map_coordinates(self.z, [row, col], order=1, mode="nearest")


def panorama(terr, x0, y0, eye=1.6, az_res=0.05, el_min=-25, el_max=25, el_res=0.05, max_d=80000):
    """Return (dist image [rows x cols], horizon elevation per column, azimuths, elevations, eye height)."""
    h0 = terr.sample(np.array([x0]), np.array([y0]))[0] + eye
    az = np.arange(0, 360, az_res)
    el = np.arange(el_max, el_min, -el_res)
    d = np.geomspace(5, max_d, 2500)
    sa, ca = np.sin(np.radians(az)), np.cos(np.radians(az))
    R = 6371000 / 0.87  # effective earth radius incl. refraction (k=0.13)
    X = x0 + d[:, None] * sa[None, :]
    Y = y0 + d[:, None] * ca[None, :]
    H = terr.sample(X.ravel(), Y.ravel()).reshape(X.shape) - (d * d / (2 * R))[:, None]
    A = np.degrees(np.arctan2(H - h0, d[:, None]))
    cm = np.maximum.accumulate(A, axis=0)  # running max elevation angle along each ray
    img = np.full((len(el), len(az)), np.inf, np.float32)
    for c in range(len(az)):
        idx = np.searchsorted(cm[:, c], el, side="left")  # first distance whose angle reaches el
        ok = idx < len(d)
        img[ok, c] = d[idx[ok]]
    return img, cm[-1], az, el, h0


def view(pano, az, el, yaw, pitch, hfov, w, h):
    """Resample a panorama to a pinhole view (yaw/pitch in degrees, roll 0)."""
    f = (w / 2) / math.tan(math.radians(hfov / 2))
    u, v = np.meshgrid(np.arange(w) - w / 2 + 0.5, h / 2 - np.arange(h) - 0.5)
    # camera ray -> world, camera looks along +y (north) rotated by yaw, tilted by pitch
    p = math.radians(pitch)
    cx, cy, cz = u, f * math.cos(p) - v * math.sin(p), f * math.sin(p) + v * math.cos(p)
    a = (np.degrees(np.arctan2(cx, cy)) + yaw) % 360
    e = np.degrees(np.arctan2(cz, np.hypot(cx, cy)))
    ci = np.clip(np.round(a / (az[1] - az[0])).astype(int), 0, len(az) - 1)
    ri = np.clip(np.round((el[0] - e) / (el[0] - el[1])).astype(int), 0, len(el) - 1)
    out = pano[ri, ci]
    out[(e > el[0])] = np.inf
    return out


def shade(dist):
    """Aerial-perspective shading: near = dark green, far = pale blue; sky = white."""
    near = np.array([60, 90, 50], np.float32); far = np.array([175, 195, 225], np.float32)
    t = np.clip(np.log10(np.maximum(dist, 10)) / np.log10(60000), 0, 1)[..., None] ** 2.2
    rgb = near * (1 - t) + far * t
    rgb[np.isinf(dist)] = (250, 250, 255)
    return rgb.astype(np.uint8)


LC_COLORS = {10: (38, 74, 44), 20: (90, 110, 60), 30: (150, 188, 92), 40: (196, 190, 110), 50: (200, 60, 60),
             60: (168, 150, 122), 70: (245, 248, 255), 80: (70, 110, 170), 90: (80, 140, 120), 100: (140, 152, 112)}


class LandCover:
    def __init__(self, path="data/landcover_utm10.tif"):
        with rasterio.open(path) as src:
            self.a = src.read(1); self.t = src.transform
        lut = np.zeros((256, 3), np.float32)
        for k, v in LC_COLORS.items(): lut[k] = v
        self.lut = lut

    def color(self, x, y):
        col = ((x - self.t.c) / self.t.a).astype(int).clip(0, self.a.shape[1] - 1)
        row = ((y - self.t.f) / self.t.e).astype(int).clip(0, self.a.shape[0] - 1)
        return self.lut[self.a[row, col]]


def render(terr, lc, x0, y0, yaw, pitch, hfov, w, h, eye=1.6, sun=(135, 45), max_d=80000):
    """Pinhole render (roll 0) with land-cover colours, sun shading and aerial perspective."""
    h0 = terr.sample(np.array([x0]), np.array([y0]))[0] + eye
    f = (w / 2) / math.tan(math.radians(hfov / 2))
    u = np.arange(w) - w / 2 + 0.5
    az = yaw + np.degrees(np.arctan2(u, f))                    # per column azimuth
    cosu = f / np.hypot(u, f)
    v = h / 2 - np.arange(h) - 0.5
    d = np.geomspace(3, max_d, 4000)
    sa, ca = np.sin(np.radians(az)), np.cos(np.radians(az))
    R = 6371000 / 0.87
    X = x0 + d[:, None] * sa; Y = y0 + d[:, None] * ca
    H = terr.sample(X.ravel(), Y.ravel()).reshape(X.shape) - (d * d / (2 * R))[:, None]
    A = np.arctan2(H - h0, d[:, None])                         # radians
    cm = np.maximum.accumulate(A, 0)
    # elevation angle of each pixel ray (pitch rotation, exact for roll 0)
    p = math.radians(pitch)
    fy = f * cosu[None, :] ** 0  # use plain f for vertical; small-angle exact enough off-axis
    el = np.arctan2(f * math.sin(p) + v[:, None] * math.cos(p), np.hypot(u[None, :], f * math.cos(p) - v[:, None] * math.sin(p)))
    img = np.zeros((h, w, 3), np.float32); sky = np.ones((h, w), bool)
    # sun direction for lambert shading
    saz, sel = map(math.radians, sun)
    L = np.array([math.sin(saz) * math.cos(sel), math.cos(saz) * math.cos(sel), math.sin(sel)])
    for c in range(w):
        idx = np.searchsorted(cm[:, c], el[:, c], side="left")
        ok = idx < len(d)
        if not ok.any(): continue
        dd = d[idx[ok]]
        hx, hy = x0 + sa[c] * dd, y0 + ca[c] * dd
        base = lc.color(hx, hy)
        e = 15.0
        dzdx = (terr.sample(hx + e, hy) - terr.sample(hx - e, hy)) / (2 * e)
        dzdy = (terr.sample(hx, hy + e) - terr.sample(hx, hy - e)) / (2 * e)
        n = np.stack([-dzdx, -dzdy, np.ones_like(dzdx)], -1); n /= np.linalg.norm(n, axis=-1, keepdims=True)
        lam = np.clip(n @ L, 0, 1)[:, None]
        col = base * (0.45 + 0.75 * lam)
        t = (1 - np.exp(-dd / 25000))[:, None]
        col = col * (1 - t) + np.array([185, 205, 230]) * t
        img[ok, c] = col; sky[ok, c] = False
    img[sky] = (225, 235, 250)
    return np.clip(img, 0, 255).astype(np.uint8)
