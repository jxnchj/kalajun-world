"""Painted vegetation atlas for the meadow flora of Kalajun (July).

2048 x 1024 RGBA, 256 px cells. Everything is painted at 2x and downsampled for clean
anti-aliased cut-outs. Petal slots are greyscale-ish (tinted per instance in the shader);
sprites (geranium, forget-me-not, yarrow, clover, ...) carry their own colours.
Output: web/public/assets/veg_atlas.png + veg_atlas.json (slot rects in 0..1, origin top-left).
"""
import json, math, os
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

CELL = 256
W, H = 2048, 1024
SS = 2  # supersampling
rng = np.random.default_rng(17)
atlas = Image.new("RGBA", (W, H), (0, 0, 0, 0))
rects = {}


def slot(name, col, row, cw=1, ch=1):
    rects[name] = [col * CELL / W, row * CELL / H, (col + cw) * CELL / W, (row + ch) * CELL / H]
    img = Image.new("RGBA", (cw * CELL * SS, ch * CELL * SS), (0, 0, 0, 0))
    return img, ImageDraw.Draw(img), (col, row)


def put(img, cr):
    small = img.resize((img.width // SS, img.height // SS), Image.LANCZOS)
    atlas.alpha_composite(small, (cr[0] * CELL, cr[1] * CELL))


def lerpc(a, b, t):
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(len(a)))


def petal_poly(cx, base_y, length, width, shape, n=40, teeth=0, tooth_depth=0.0):
    """closed outline of a petal pointing up (-y). shape(t)->half-width factor 0..1"""
    left, right = [], []
    for k in range(n + 1):
        t = k / n
        w = width * shape(t)
        y = base_y - length * t
        left.append((cx - w, y))
        right.append((cx + w, y))
    tip = []
    if teeth:
        for k in range(teeth * 2 + 1):
            s = -1 + 2 * k / (teeth * 2)
            d = tooth_depth * (0 if k % 2 == 0 else 1)
            tip.append((cx + s * width * shape(1.0) * 0.98, base_y - length * (1 - d)))
    return left + tip + right[::-1]


def veins(d, cx, base_y, length, width, col, n=7, curve=0.2, w=2):
    for k in range(n):
        s = (k / (n - 1) - 0.5) * 2
        pts = []
        for j in range(16):
            t = j / 15 * 0.92
            pts.append((cx + s * width * 0.8 * math.sin(min(1, t * 1.6) * math.pi / 2) * (1 - curve * t), base_y - length * t))
        d.line(pts, fill=col, width=w)


def gradient_fill(img, bbox, c0, c1, vertical=True):
    """multiply existing alpha area by a vertical colour gradient"""
    a = np.asarray(img).astype(np.float32)
    x0, y0, x1, y1 = [int(v) for v in bbox]
    mask = a[..., 3] > 0
    ys = np.clip((np.arange(a.shape[0])[:, None] - y0) / max(1, y1 - y0), 0, 1)
    g0, g1 = np.array(c0, np.float32), np.array(c1, np.float32)
    col = g0[None, None, :] * (1 - ys[..., None]) + g1[None, None, :] * ys[..., None]
    a[..., :3] = np.where(mask[..., None], col[..., :3] if col.shape[-1] >= 3 else col, a[..., :3])
    return Image.fromarray(a.astype(np.uint8), "RGBA")


S = CELL * SS  # slot size in painting pixels

# ------------------------------------------------------------------ row 0: petals & flowers
# cosmos ray petal: obovate, three teeth; greyscale with a darker "eye" zone near the base
img, d, cr = slot("cosmos_petal", 0, 0)
poly = petal_poly(S / 2, S * 0.98, S * 0.95, S * 0.36, lambda t: (0.22 + 0.78 * math.sin(min(1, t * 1.15) * math.pi * 0.55)) * (1 - 0.05 * t), teeth=3, tooth_depth=0.025)
d.polygon(poly, fill=(235, 235, 235, 255))
veins(d, S / 2, S * 0.98, S * 0.95, S * 0.3, (205, 205, 205, 255), n=9)
img = gradient_fill(img, (0, S * 0.7, S, S), (255, 255, 255, 255), (170, 170, 170, 255))
put(img, cr)

img, d, cr = slot("daisy_petal", 1, 0)
d.polygon(petal_poly(S / 2, S * 0.98, S * 0.95, S * 0.13, lambda t: 0.5 + 0.5 * math.sqrt(max(0, math.sin(min(1, t * 1.05) * math.pi))) , teeth=2, tooth_depth=0.03), fill=(250, 250, 246, 255))
veins(d, S / 2, S * 0.98, S * 0.95, S * 0.1, (225, 226, 222, 255), n=3)
put(img, cr)

# poppy petal: very broad, crinkled edge, satin sheen lines
img, d, cr = slot("poppy_petal", 2, 0)
pts = []
for k in range(121):
    a = math.pi * (0.02 + 0.96 * k / 120)
    r = S * 0.46 * (1 + 0.012 * math.sin(a * 23) + 0.008 * math.sin(a * 41))
    pts.append((S / 2 + math.cos(a) * r * 1.05, S * 0.98 - math.sin(a) * r * 1.9))
d.polygon([(S / 2 - S * 0.06, S * 0.99)] + pts + [(S / 2 + S * 0.06, S * 0.99)], fill=(245, 245, 245, 255))
for k in range(18):
    s = (k / 17 - 0.5) * 1.6
    d.line([(S / 2, S * 0.98), (S / 2 + s * S * 0.42, S * 0.12 + abs(s) * S * 0.25)], fill=(222, 222, 222, 255), width=3)
img = gradient_fill(img, (0, S * 0.75, S, S), (255, 255, 255, 255), (200, 200, 200, 255))
put(img, cr)

# globeflower petal: concave oval, deep yellow-orange, painted colour
img, d, cr = slot("globe_petal", 3, 0)
d.polygon(petal_poly(S / 2, S * 0.97, S * 0.9, S * 0.38, lambda t: math.sin(min(1, 0.15 + t) * math.pi * 0.95) ** 0.7), fill=(255, 200, 40, 255))
img = gradient_fill(img, (0, 0, S, S), (255, 215, 60, 255), (240, 150, 20, 255))
d = ImageDraw.Draw(img)
veins(d, S / 2, S * 0.97, S * 0.9, S * 0.3, (235, 160, 25, 255), n=7)
put(img, cr)


def five_petal_flower(d, cx, cy, R, col, vein, centre, eye=None, notch=True, petals=5, rot=0.0):
    for k in range(petals):
        a = rot + k / petals * 2 * math.pi
        pts = []
        for j in range(33):
            t = j / 32 * math.pi
            rr = R * (0.55 + 0.45 * math.sin(t)) * (1 - (0.12 * math.exp(-((t - math.pi / 2) ** 2) * 40) if notch else 0))
            ang = a + (t - math.pi / 2) * 0.62
            pts.append((cx + math.cos(ang) * rr, cy + math.sin(ang) * rr))
        d.polygon([(cx, cy)] + pts, fill=col)
        for v in (-0.25, 0, 0.25):
            d.line([(cx, cy), (cx + math.cos(a + v) * R * 0.85, cy + math.sin(a + v) * R * 0.85)], fill=vein, width=max(1, int(R * 0.03)))
    if eye:
        d.ellipse([cx - R * 0.3, cy - R * 0.3, cx + R * 0.3, cy + R * 0.3], fill=eye)
    d.ellipse([cx - R * 0.12, cy - R * 0.12, cx + R * 0.12, cy + R * 0.12], fill=centre)


# wild geranium (老鹳草): violet with darker veins and a pale centre
img, d, cr = slot("geranium", 4, 0)
five_petal_flower(d, S / 2, S / 2, S * 0.46, (150, 100, 210, 255), (100, 55, 160, 255), (235, 230, 240, 255), eye=(205, 180, 235, 255))
put(img, cr)

# forget-me-not spray: several tiny sky-blue flowers with yellow eyes on a curled sprig
img, d, cr = slot("forgetmenot", 5, 0)
d.line([(S * 0.5, S), (S * 0.48, S * 0.6), (S * 0.55, S * 0.3), (S * 0.45, S * 0.12)], fill=(70, 120, 50, 255), width=8)
for k in range(11):
    t = k / 10
    cx = S * (0.5 + 0.28 * math.sin(t * 5.5)) + rng.normal() * S * 0.05
    cy = S * (0.85 - 0.72 * t) + rng.normal() * S * 0.03
    R = S * (0.1 - 0.035 * t)
    col = (95, 160, 235, 255) if rng.random() > 0.15 else (230, 150, 200, 255)
    five_petal_flower(d, cx, cy, R, col, (80, 135, 210, 255), (250, 215, 60, 255), eye=(255, 240, 150, 255), notch=False, rot=rng.random() * 6)
put(img, cr)

# delphinium floret: 5 sepals + spur, deep blue-violet, white bee in the middle
img, d, cr = slot("delphinium", 6, 0)
d.polygon([(S * 0.55, S * 0.5), (S * 0.95, S * 0.18), (S * 0.9, S * 0.32)], fill=(70, 60, 190, 255))  # spur
five_petal_flower(d, S * 0.45, S * 0.55, S * 0.4, (75, 70, 205, 255), (50, 40, 150, 255), (40, 30, 60, 255), eye=(235, 235, 245, 255), notch=False, rot=0.3)
put(img, cr)

# campanula bell (side view): nodding purple bell with flared, 5-pointed rim
img, d, cr = slot("bell", 7, 0)
pts = [(S * 0.5, S * 0.1)]
for k in range(21):
    t = k / 20
    pts.append((S * 0.5 + S * (0.1 + 0.28 * t ** 1.3), S * (0.12 + 0.7 * t)))
rim = []
for k in range(11):
    s = 1 - 2 * k / 10
    rim.append((S * 0.5 + s * S * 0.42, S * 0.86 - (0.08 * S if k % 2 == 0 else 0)))
pts += rim
for k in range(20, -1, -1):
    t = k / 20
    pts.append((S * 0.5 - S * (0.1 + 0.28 * t ** 1.3), S * (0.12 + 0.7 * t)))
d.polygon(pts, fill=(140, 95, 215, 255))
img = gradient_fill(img, (0, S * 0.1, S, S * 0.9), (95, 60, 170, 255), (175, 135, 240, 255))
d = ImageDraw.Draw(img)
for s in (-0.6, -0.2, 0.2, 0.6):
    d.line([(S * 0.5 + s * S * 0.08, S * 0.15), (S * 0.5 + s * S * 0.38, S * 0.82)], fill=(110, 70, 185, 255), width=4)
d.line([(S * 0.5, S * 0.0), (S * 0.5, S * 0.12)], fill=(70, 110, 45, 255), width=10)
put(img, cr)

# ------------------------------------------------------------------ row 1: heads & sprites
# yarrow umbel (top view): dense flat cluster of tiny white/cream florets
img, d, cr = slot("yarrow", 0, 1)
for k in range(260):
    r = S * 0.44 * math.sqrt(rng.random())
    a = rng.random() * 6.283
    cx, cy = S / 2 + math.cos(a) * r, S / 2 + math.sin(a) * r
    R = S * rng.uniform(0.025, 0.04)
    c = (250, 248, 238, 255) if rng.random() > 0.2 else (245, 225, 215, 255)
    five_petal_flower(d, cx, cy, R, c, (225, 222, 210, 255), (220, 200, 140, 255), notch=False, rot=rng.random() * 6)
put(img, cr)

# clover head (side view): ball of tubular florets, pink tipped white
img, d, cr = slot("clover", 1, 1)
for k in range(140):
    a = rng.random() * 6.283
    r = S * 0.36 * math.sqrt(rng.random())
    cx, cy = S / 2 + math.cos(a) * r * 1.0, S * 0.52 + math.sin(a) * r * 1.1
    t = (cy - S * 0.15) / (S * 0.8)
    col = lerpc((235, 120, 170, 255), (250, 230, 240, 255), min(1, max(0, t)))
    d.ellipse([cx - S * 0.05, cy - S * 0.02, cx + S * 0.05, cy + S * 0.035], fill=col)
put(img, cr)

# dandelion flower (top view): many strap florets, yellow, deeper in the centre
img, d, cr = slot("dandelion", 2, 1)
for ring, (R, n) in enumerate([(0.47, 44), (0.38, 36), (0.28, 28), (0.18, 18)]):
    for k in range(n):
        a = k / n * 6.283 + ring * 0.3
        col = lerpc((255, 215, 40, 255), (240, 160, 10, 255), ring / 3)
        x1, y1 = S / 2 + math.cos(a) * S * R, S / 2 + math.sin(a) * S * R
        d.line([(S / 2, S / 2), (x1, y1)], fill=col, width=int(S * 0.03))
        d.ellipse([x1 - S * 0.018, y1 - S * 0.018, x1 + S * 0.018, y1 + S * 0.018], fill=col)
put(img, cr)

# dandelion seed puff: translucent white sphere of pappus rays
img, d, cr = slot("puff", 3, 1)
for k in range(180):
    a = rng.random() * 6.283
    L = S * rng.uniform(0.3, 0.46)
    x1, y1 = S / 2 + math.cos(a) * L, S / 2 + math.sin(a) * L
    d.line([(S / 2, S / 2), (x1, y1)], fill=(255, 255, 255, 110), width=2)
    for j in range(5):
        b = a + (j - 2) * 0.25
        d.line([(x1, y1), (x1 + math.cos(b) * S * 0.05, y1 + math.sin(b) * S * 0.05)], fill=(255, 255, 255, 170), width=2)
d.ellipse([S / 2 - S * 0.06, S / 2 - S * 0.06, S / 2 + S * 0.06, S / 2 + S * 0.06], fill=(200, 185, 150, 255))
put(img, cr)

# edelweiss: woolly white star of bracts around yellowish florets
img, d, cr = slot("edelweiss", 4, 1)
for k in range(8):
    a = k / 8 * 6.283 + rng.normal() * 0.1
    pts = petal_poly(0, 0, S * 0.44, S * 0.1, lambda t: math.sin(min(1, 0.1 + t) * math.pi) ** 0.6)
    rot = [(S / 2 + x * math.cos(a) - y * math.sin(a) * 1.0, S / 2 + x * math.sin(a) + y * math.cos(a)) for x, y in pts]
    rot = [(S / 2 + (px - S / 2), S / 2 + (py - S / 2)) for px, py in rot]
    d.polygon([(S / 2 + (x * math.cos(a + math.pi / 2) - y * math.sin(a + math.pi / 2)), S / 2 + (x * math.sin(a + math.pi / 2) + y * math.cos(a + math.pi / 2))) for x, y in pts], fill=(236, 238, 228, 255))
for k in range(9):
    a = rng.random() * 6.283; r = S * 0.08 * rng.random()
    d.ellipse([S / 2 + math.cos(a) * r - S * 0.04, S / 2 + math.sin(a) * r - S * 0.04, S / 2 + math.cos(a) * r + S * 0.04, S / 2 + math.sin(a) * r + S * 0.04], fill=(215, 205, 150, 255))
put(img, cr)

# bud: closed teardrop with green sepals
img, d, cr = slot("bud", 5, 1)
d.polygon(petal_poly(S / 2, S * 0.95, S * 0.8, S * 0.25, lambda t: math.sin(min(1, 0.2 + t) * math.pi) ** 0.8), fill=(235, 235, 235, 255))
for s in (-1, 1):
    d.polygon([(S / 2, S * 0.95), (S / 2 + s * S * 0.28, S * 0.55), (S / 2 + s * S * 0.08, S * 0.7)], fill=(70, 120, 50, 255))
put(img, cr)

# composite disc centre (top view): golden with a ring of florets
img, d, cr = slot("disc", 6, 1)
d.ellipse([S * 0.04, S * 0.04, S * 0.96, S * 0.96], fill=(240, 175, 30, 255))
for k in range(220):
    a = rng.random() * 6.283; r = S * 0.44 * math.sqrt(rng.random())
    x, y = S / 2 + math.cos(a) * r, S / 2 + math.sin(a) * r
    c = lerpc((255, 215, 70, 255), (190, 110, 10, 255), r / (S * 0.44))
    d.ellipse([x - S * 0.018, y - S * 0.018, x + S * 0.018, y + S * 0.018], fill=c)
put(img, cr)

# foxtail head: nodding fuzzy cylinder (vertical, base at the bottom)
img, d, cr = slot("foxtail", 7, 1)
for k in range(700):
    t = rng.random()
    y = S * (0.95 - 0.88 * t)
    w = S * 0.1 * math.sin(min(1, t * 1.2 + 0.1) * math.pi) ** 0.5
    x = S / 2 + rng.normal() * w * 0.5
    a = -math.pi / 2 + rng.normal() * 0.9
    L = S * rng.uniform(0.05, 0.1)
    c = lerpc((170, 175, 90, 255), (215, 205, 140, 255), rng.random())
    d.line([(x, y), (x + math.cos(a) * L, y + math.sin(a) * L)], fill=c, width=3)
put(img, cr)

# ------------------------------------------------------------------ rows 2-3: tall slots
# feather grass (Stipa) plume: long silky awns, silver
img, d, cr = slot("stipa", 0, 2, 1, 2)
Hs = 2 * S
for k in range(38):
    x0 = S / 2 + rng.normal() * S * 0.02
    pts = [(x0, Hs)]
    bend = rng.normal() * S * 0.14
    for j in range(1, 21):
        t = j / 20
        pts.append((x0 + bend * t * t + math.sin(t * 7 + k) * S * 0.015, Hs * (1 - 0.95 * t)))
    for p0, p1 in zip(pts[:-1], pts[1:]):
        d.line([p0, p1], fill=(236, 232, 214, 150), width=3)
    for j in range(8, 20):  # feathery hairs on the upper awn
        px, py = pts[j]
        for s in (-1, 1):
            d.line([(px, py), (px + s * S * 0.035, py + S * 0.02)], fill=(245, 242, 230, 90), width=2)
put(img, cr)

# fescue panicle: open branched seed head
img, d, cr = slot("panicle", 1, 2, 1, 2)
d.line([(S / 2, Hs), (S * 0.52, Hs * 0.05)], fill=(150, 150, 80, 255), width=6)
for j in range(12):
    t = 0.35 + 0.63 * j / 11
    y = Hs * (1 - t)
    for s in (-1, 1):
        L = S * (0.36 * (1 - t) + 0.08)
        x1, y1 = S / 2 + s * L, y + S * 0.18
        d.line([(S / 2, y), (x1, y1)], fill=(160, 155, 90, 255), width=3)
        for q in range(4):
            u = 0.4 + 0.6 * q / 3
            sx, sy = S / 2 + s * L * u, y + S * 0.18 * u
            d.ellipse([sx - 8, sy - 14, sx + 8, sy + 14], fill=lerpc((190, 180, 110, 255), (140, 150, 80, 255), rng.random()))
put(img, cr)

# cosmos feathery leaf (bipinnate)
img, d, cr = slot("leaf_cosmos", 2, 2, 1, 2)
for k in range(3):
    ang = (-0.5, 0.0, 0.5)[k]
    L = Hs * (0.85 if k == 1 else 0.65)
    x0, y0 = S / 2, Hs - 4
    x1, y1 = x0 + math.sin(ang) * L, y0 - math.cos(ang) * L
    d.line([x0, y0, x1, y1], fill=(60, 115, 38, 255), width=6)
    for j in range(16):
        t = 0.1 + 0.88 * j / 15
        px, py = x0 + (x1 - x0) * t, y0 + (y1 - y0) * t
        pl = S * 0.3 * (1 - t * 0.7)
        for sgn in (-1, 1):
            a = -math.pi / 2 + ang + sgn * 1.0
            d.line([px, py, px + math.cos(a) * pl, py + math.sin(a) * pl], fill=(72 + int(25 * t), 138 + int(25 * t), 46, 255), width=5)
put(img, cr)


def leaf_shape(d, cx, base_y, L, Wd, shape, col, vein, teeth=0, tooth=0.0, n=60):
    left, right = [], []
    for k in range(n + 1):
        t = k / n
        w = Wd * shape(t) * (1 - (tooth * (0.5 + 0.5 * math.sin(t * teeth * math.pi * 2))) if teeth else 1)
        y = base_y - L * t
        left.append((cx - w, y)); right.append((cx + w, y))
    d.polygon(left + right[::-1], fill=col)
    d.line([(cx, base_y), (cx, base_y - L * 0.97)], fill=vein, width=5)
    for k in range(1, 9):
        t = k / 9
        y = base_y - L * t
        w = Wd * shape(t) * 0.85
        for s in (-1, 1):
            d.line([(cx, y), (cx + s * w, y - L * 0.08)], fill=vein, width=3)


# geranium palmate leaf (top view)
img, d, cr = slot("leaf_geranium", 3, 2)
for k in range(5):
    a = -math.pi / 2 + (k - 2) * 0.62
    pts = petal_poly(0, 0, S * 0.46, S * 0.12, lambda t: math.sin(min(1, 0.15 + t) * math.pi) ** 0.8, teeth=3, tooth_depth=0.12)
    d.polygon([(S / 2 + x * math.cos(a + math.pi / 2) - y * math.sin(a + math.pi / 2), S * 0.85 + x * math.sin(a + math.pi / 2) + y * math.cos(a + math.pi / 2)) for x, y in pts], fill=(70, 130, 50, 255))
for k in range(5):
    a = -math.pi / 2 + (k - 2) * 0.62
    d.line([(S / 2, S * 0.85), (S / 2 + math.cos(a) * S * 0.4, S * 0.85 + math.sin(a) * S * 0.4)], fill=(95, 160, 70, 255), width=4)
put(img, cr)

# trifoliate clover leaf (top view) with pale chevrons
img, d, cr = slot("leaf_clover", 3, 3)
for k in range(3):
    a = -math.pi / 2 + (k - 1) * 2.1
    cx, cy = S / 2 + math.cos(a) * S * 0.22, S / 2 + math.sin(a) * S * 0.22
    d.ellipse([cx - S * 0.2, cy - S * 0.2, cx + S * 0.2, cy + S * 0.2], fill=(55, 120, 45, 255))
    d.arc([cx - S * 0.12, cy - S * 0.12, cx + S * 0.12, cy + S * 0.12], 0, 360, fill=(140, 185, 120, 255), width=6)
put(img, cr)

# lanceolate leaf (grass-like broad blade for forbs/sedges)
img, d, cr = slot("leaf_lance", 4, 2)
leaf_shape(d, S / 2, S * 0.99, S * 0.95, S * 0.2, lambda t: math.sin(min(1, 0.08 + t) * math.pi) ** 0.7, (70, 125, 50, 255), (110, 165, 80, 255))
put(img, cr)

# lady's mantle leaf (top view): round, scalloped, pleated
img, d, cr = slot("leaf_mantle", 4, 3)
pts = []
for k in range(97):
    a = k / 96 * 6.283
    r = S * 0.44 * (1 + 0.06 * abs(math.sin(a * 5)))
    pts.append((S / 2 + math.cos(a) * r, S / 2 + math.sin(a) * r))
d.polygon(pts, fill=(95, 145, 60, 255))
for k in range(9):
    a = k / 9 * 6.283
    d.line([(S / 2, S / 2), (S / 2 + math.cos(a) * S * 0.42, S / 2 + math.sin(a) * S * 0.42)], fill=(75, 120, 45, 255), width=5)
put(img, cr)

# dandelion leaf: deeply toothed (runcinate)
img, d, cr = slot("leaf_dandelion", 5, 2)
leaf_shape(d, S / 2, S * 0.99, S * 0.95, S * 0.18, lambda t: math.sin(min(1, 0.05 + t) * math.pi) ** 0.6, (65, 125, 45, 255), (120, 175, 90, 255), teeth=5, tooth=0.55)
put(img, cr)

# delphinium / globeflower leaf: deeply lobed palmate
img, d, cr = slot("leaf_lobed", 5, 3)
for k in range(7):
    a = -math.pi / 2 + (k - 3) * 0.45
    pts = petal_poly(0, 0, S * 0.45, S * 0.06, lambda t: math.sin(min(1, 0.1 + t) * math.pi) ** 0.9, teeth=2, tooth_depth=0.1)
    d.polygon([(S / 2 + x * math.cos(a + math.pi / 2) - y * math.sin(a + math.pi / 2), S * 0.9 + x * math.sin(a + math.pi / 2) + y * math.cos(a + math.pi / 2)) for x, y in pts], fill=(55, 110, 45, 255))
put(img, cr)

# grass blade (greyscale): midrib + lighter edges, v along the blade
img, d, cr = slot("blade", 6, 2, 1, 2)
d.polygon([(S * 0.1, Hs), (S * 0.9, Hs), (S * 0.5, 0)], fill=(215, 215, 215, 255))
d.line([(S / 2, Hs), (S / 2, Hs * 0.05)], fill=(185, 185, 185, 255), width=10)
for s in (-1, 1):
    d.line([(S / 2 + s * S * 0.3, Hs), (S / 2 + s * S * 0.02, Hs * 0.1)], fill=(235, 235, 235, 255), width=6)
put(img, cr)

# small leafy weed sprite (fills gaps at ground level)
img, d, cr = slot("weed", 7, 2)
for k in range(9):
    a = -math.pi / 2 + rng.normal() * 0.9
    L = S * rng.uniform(0.3, 0.46)
    x1, y1 = S / 2 + math.cos(a) * L, S * 0.98 + math.sin(a) * L
    d.line([(S / 2, S * 0.98), (x1, y1)], fill=(70, 120, 45, 255), width=5)
    d.ellipse([x1 - S * 0.07, y1 - S * 0.04, x1 + S * 0.07, y1 + S * 0.04], fill=lerpc((70, 130, 50, 255), (110, 160, 70, 255), rng.random()))
put(img, cr)

# fern-like frond (moist forest edges)
img, d, cr = slot("fern", 7, 3)
d.line([(S / 2, S * 0.99), (S * 0.55, S * 0.05)], fill=(60, 110, 40, 255), width=6)
for j in range(22):
    t = j / 21
    y = S * (0.95 - 0.88 * t)
    L = S * 0.36 * math.sin(min(1, 0.2 + t) * math.pi) ** 0.8
    for s in (-1, 1):
        d.polygon([(S / 2 + S * 0.05 * t, y), (S / 2 + s * L, y - S * 0.03), (S / 2 + s * L * 0.9, y + S * 0.015)], fill=(80, 140, 55, 255))
put(img, cr)

# tiny solid swatches for stems / centres (sampled at a single texel)
os.makedirs("web/public/assets", exist_ok=True)
atlas.save("web/public/assets/veg_atlas.png", optimize=True)
json.dump(rects, open("web/public/assets/veg_atlas.json", "w"), indent=1)
print(len(rects), "slots", os.path.getsize("web/public/assets/veg_atlas.png") // 1024, "KB")
