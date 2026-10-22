"""Overlay the DEM skyline (red) and sun position (orange) on each photo for checking calibration."""
import sys, json, math
import numpy as np
from PIL import Image, ImageDraw
sys.path.insert(0, "tools")
from viewpoint import *
from fit_cameras import syn_rows, project

CAM = json.load(open("tools/cameras.local.json"))
OUT = sys.argv[1]
names = sys.argv[2:] or list(CAM)
terr = Terrain()
tiles = []
for name in names:
    la, lo, t, f35, w0, h0 = PHOTOS[name]
    c = CAM[name]
    W = 700; H = round(W * h0 / w0)
    hf = hfov_deg(f35, w0, h0); f = (W / 2) / math.tan(math.radians(hf / 2))
    x, y = TO_UTM.transform(lo, la)
    pano, hor, az, el, _ = panorama(terr, x, y)
    rows = syn_rows(hor, az, c["yaw"], c["pitch"], c.get("roll", 0), f, W, H, hf)
    im = Image.open(f"{name}.jpg").convert("RGB").resize((W, H), Image.LANCZOS)
    d = ImageDraw.Draw(im)
    pts = [(i, r) for i, r in enumerate(rows) if np.isfinite(r)]
    d.line(pts, fill=(255, 30, 30), width=2)
    saz, sel = sun_position(la, lo, t)
    sc, sr, ok = project(np.array([saz]), np.array([sel]), c["yaw"], c["pitch"], c.get("roll", 0), f, W, H)
    if ok[0] and -50 < sc[0] < W + 50:
        d.ellipse([sc[0] - 9, sr[0] - 9, sc[0] + 9, sr[0] + 9], outline=(255, 150, 0), width=3)
    d.text((8, 8), f"{name[-6:]} yaw {c['yaw']} pitch {c['pitch']} roll {c.get('roll',0)}", fill=(255, 255, 0))
    im.save(f"{OUT}/{name}_calib.jpg", quality=85)
    print(name, "saved")
