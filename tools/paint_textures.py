"""Hand-painted-style textures for the stylised assets (BotW-like: soft value shapes,
few colours, brush-stroke variation). Output: assets/tex/*.png (sRGB)."""
import math, os
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

OUT = "assets/tex"
os.makedirs(OUT, exist_ok=True)
rng = np.random.default_rng(7)


def noise(shape, scale, octaves=4, seed=0):
    """tileable value-noise fbm in [0,1]"""
    r = np.random.default_rng(seed)
    h, w = shape
    acc = np.zeros(shape, np.float32)
    amp, tot = 1.0, 0.0
    for o in range(octaves):
        gh, gw = max(2, int(h / scale * 2 ** o)), max(2, int(w / scale * 2 ** o))
        g = r.random((gh, gw)).astype(np.float32)
        img = Image.fromarray((g * 255).astype(np.uint8)).resize((w, h), Image.BICUBIC)
        # wrap-friendly: blend with a rolled copy
        a = np.asarray(img, np.float32) / 255
        acc += amp * a
        tot += amp
        amp *= 0.5
    return acc / tot


def save(name, arr, mode="RGB"):
    a = np.clip(arr, 0, 1)
    Image.fromarray((a * 255).astype(np.uint8), mode).save(f"{OUT}/{name}.png", optimize=True)


def lerp(a, b, t):
    return a + (np.asarray(b, np.float32) - a) * t[..., None]


def hexc(h):
    return np.array([int(h[i:i + 2], 16) / 255 for i in (1, 3, 5)], np.float32)


# ---------------------------------------------------------------- wood (log side grain), tiles along U
def wood_log(n=512):
    h = w = n
    y = np.linspace(0, 1, h, dtype=np.float32)[:, None]
    x = np.linspace(0, 1, w, dtype=np.float32)[None, :]
    streak = noise((h, w), 60, 3, 1)
    grain = np.sin((y * 38 + noise((h, w), 128, 2, 2) * 6) * math.pi) * 0.5 + 0.5
    grain = grain ** 3
    base = lerp(np.broadcast_to(hexc("#7a5a3e"), (h, w, 3)).copy(), hexc("#b48d63"), streak ** 1.3)
    base = lerp(base, hexc("#5c4029"), grain * 0.35)
    # a few knots
    img = Image.fromarray((np.clip(base, 0, 1) * 255).astype(np.uint8))
    d = ImageDraw.Draw(img)
    for _ in range(4):
        cx, cy = rng.integers(0, w), rng.integers(40, h - 40)
        for r, c in [(14, (96, 70, 48)), (9, (74, 52, 34)), (4, (52, 36, 22))]:
            d.ellipse([cx - r * 1.6, cy - r, cx + r * 1.6, cy + r], fill=c)
    img = img.filter(ImageFilter.GaussianBlur(1.2))
    a = np.asarray(img, np.float32) / 255
    # soft vertical light band (rounded log highlight baked lightly)
    band = np.exp(-((y - 0.42) ** 2) / 0.05)
    a = a * (0.82 + 0.28 * band[..., None] if band.ndim == 2 else 0.82 + 0.28 * band)
    save("wood_log", a)


def wood_end(n=256):
    h = w = n
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32) / n - 0.5
    r = np.sqrt(xx ** 2 + yy ** 2)
    wob = noise((h, w), 40, 2, 3) * 0.05
    rings = (np.sin((r + wob) * 60) * 0.5 + 0.5) ** 2
    base = lerp(np.broadcast_to(hexc("#c79a62"), (h, w, 3)).copy(), hexc("#9c6b3c"), rings * 0.6)
    base = lerp(base, hexc("#6d4424"), np.clip((r - 0.40) / 0.1, 0, 1))  # bark rim
    save("wood_end", base)


def wood_plank(n=512, name="wood_plank", light="#a8744a", dark="#6b4125", planks=4):
    h = w = n
    y = np.linspace(0, 1, h, dtype=np.float32)[:, None] * np.ones((1, w), np.float32)
    x = np.linspace(0, 1, w, dtype=np.float32)[None, :] * np.ones((h, 1), np.float32)
    idx = np.floor(y * planks)
    local = y * planks - idx
    tone = np.take(rng.random(planks + 1).astype(np.float32), idx.astype(int))
    grain = (np.sin((local * 9 + noise((h, w), 90, 3, 4) * 3 + x * 0.3) * math.pi * 2) * 0.5 + 0.5) ** 4
    base = lerp(np.broadcast_to(hexc(dark), (h, w, 3)).copy(), hexc(light), 0.45 + 0.4 * tone + 0.15 * noise((h, w), 50, 2, 5))
    base = lerp(base, base.mean(-1, keepdims=True).repeat(3, -1), np.full((h, w), 0.2, np.float32))
    base = lerp(base, hexc(dark) * 0.8, grain * 0.35)
    edge = np.minimum(local, 1 - local)
    base *= (0.55 + 0.45 * np.clip(edge / 0.06, 0, 1))[..., None]
    # nail dots near plank ends
    img = Image.fromarray((np.clip(base, 0, 1) * 255).astype(np.uint8))
    d = ImageDraw.Draw(img)
    for p in range(planks):
        for xx in (0.06, 0.94):
            cy = (p + 0.5) / planks * h
            d.ellipse([xx * w - 3, cy - 3, xx * w + 3, cy + 3], fill=(40, 30, 24))
    save(name, np.asarray(img.filter(ImageFilter.GaussianBlur(0.8)), np.float32) / 255)


# ---------------------------------------------------------------- felt / yurt
def felt(n=512):
    h = w = n
    f = noise((h, w), 30, 4, 11)
    fib = noise((h, w), 6, 2, 12)
    base = lerp(np.broadcast_to(hexc("#d9d0bd"), (h, w, 3)).copy(), hexc("#f1ebdc"), f)
    base *= (0.94 + 0.08 * fib)[..., None]
    img = Image.fromarray((np.clip(base, 0, 1) * 255).astype(np.uint8))
    d = ImageDraw.Draw(img)
    # stitched seams (horizontal) and quilting lines
    for yy in (int(h * 0.33), int(h * 0.66)):
        for xx in range(0, w, 10):
            d.line([xx, yy, xx + 5, yy], fill=(180, 168, 146), width=2)
    save("felt", np.asarray(img.filter(ImageFilter.GaussianBlur(0.6)), np.float32) / 255)


def yurt_band(w=1024, h=128):
    """Kazakh ornament band: red ground, 'koshkar muiz' (ram horn) motifs in gold/cream, blue borders."""
    img = Image.new("RGB", (w, h), (150, 28, 22))
    d = ImageDraw.Draw(img)
    d.rectangle([0, 0, w, 14], fill=(26, 52, 110))
    d.rectangle([0, h - 14, w, h], fill=(26, 52, 110))
    d.rectangle([0, 14, w, 18], fill=(222, 186, 96))
    d.rectangle([0, h - 18, w, h - 14], fill=(222, 186, 96))
    cyc = h / 2
    step = 128
    for i in range(0, w + step, step):
        # ram-horn motif: two mirrored spirals + central diamond
        for s in (-1, 1):
            pts = []
            for k in range(60):
                t = k / 59
                ang = t * math.pi * 1.6
                rr = 30 * (1 - t * 0.75)
                pts.append((i + s * (10 + rr * math.sin(ang)), cyc - 6 + rr * math.cos(ang) * 0.9))
            d.line(pts, fill=(240, 214, 140), width=6)
        d.polygon([(i, cyc - 16), (i + 10, cyc), (i, cyc + 16), (i - 10, cyc)], fill=(26, 52, 110))
        d.polygon([(i + step / 2, cyc - 10), (i + step / 2 + 7, cyc), (i + step / 2, cyc + 10), (i + step / 2 - 7, cyc)], fill=(240, 214, 140))
    save("yurt_band", np.asarray(img.filter(ImageFilter.GaussianBlur(0.7)), np.float32) / 255)


def yurt_door(w=256, h=512):
    img = Image.new("RGB", (w, h), (182, 64, 24))
    d = ImageDraw.Draw(img)
    # two panels with carved borders and ornaments
    for y0, y1 in ((24, 240), (272, 488)):
        d.rectangle([22, y0, w - 22, y1], outline=(236, 180, 70), width=8)
        d.rectangle([40, y0 + 18, w - 40, y1 - 18], outline=(120, 30, 12), width=5)
        cx, cy = w / 2, (y0 + y1) / 2
        for s in (-1, 1):
            pts = [(cx + s * (12 + 34 * math.sin(t / 30 * math.pi * 1.5) * (1 - t / 45)), cy - 30 + 60 * t / 30) for t in range(31)]
            d.line(pts, fill=(236, 180, 70), width=6)
        d.ellipse([cx - 10, cy - 10, cx + 10, cy + 10], fill=(26, 52, 110))
    save("yurt_door", np.asarray(img.filter(ImageFilter.GaussianBlur(0.8)), np.float32) / 255)


# ---------------------------------------------------------------- sod roof, stone
def sod(n=512):
    h = w = n
    a = noise((h, w), 70, 4, 21)
    b = noise((h, w), 12, 3, 22)
    base = lerp(np.broadcast_to(hexc("#3d5a1c"), (h, w, 3)).copy(), hexc("#7d9a33"), a ** 1.2)
    base = lerp(base, hexc("#34491a"), np.clip((0.4 - b) * 4, 0, 1) * 0.35)
    base = lerp(base, hexc("#9b8a4a"), np.clip((a - 0.78) * 4, 0, 1) * 0.6)  # dry patches
    save("sod", base)


def stone(n=512):
    h = w = n
    a = noise((h, w), 50, 5, 31)
    base = lerp(np.broadcast_to(hexc("#6f6a60"), (h, w, 3)).copy(), hexc("#a8a196"), a)
    base = lerp(base, hexc("#58693a"), np.clip((noise((h, w), 80, 3, 32) - 0.6) * 3, 0, 1) * 0.6)  # lichen/moss
    save("stone", base)


# ---------------------------------------------------------------- foliage cards (RGBA)
def spruce_frond(w=256, h=512):
    """one drooping spruce branch seen from above: central twig + needle sprays; alpha cutout.
    V=0 at the trunk, V=1 at the tip."""
    img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    cx = w / 2
    # side twigs, getting shorter toward the tip, covered with needle strokes
    for k in range(34):
        t = k / 33
        y = 20 + t * (h - 40)
        span = (1 - t * 0.8) * w * 0.46
        for s in (-1, 1):
            x1 = cx + s * span
            y1 = y + span * 0.35
            for j in range(18):
                u = j / 17
                px, py = cx + (x1 - cx) * u, y + (y1 - y) * u
                L = 10 + 12 * (1 - u)
                g = int(60 + 70 * rng.random() + 60 * (1 - t))
                col = (int(g * 0.35), g, int(g * 0.55), 255)
                for ang in (-0.9, 0.9):
                    a = math.atan2(y1 - y, x1 - cx) + ang
                    d.line([px, py, px + math.cos(a) * L, py + math.sin(a) * L], fill=col, width=3)
    d.line([cx, 0, cx, h], fill=(70, 48, 30, 255), width=5)
    arr = np.asarray(img, np.float32) / 255
    # lighter tips toward the end (new growth), darker near the trunk
    v = np.linspace(0, 1, h, dtype=np.float32)[:, None]
    arr[..., :3] *= (0.7 + 0.5 * v)[..., None] if v.ndim == 2 else 1
    save("spruce_frond", arr, "RGBA")


def grass_card(w=512, h=256):
    img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    for _ in range(140):
        x = rng.random() * w
        H = h * (0.4 + 0.6 * rng.random())
        bend = (rng.random() - 0.5) * 60
        g = int(90 + 90 * rng.random())
        col = (int(g * 0.55), g, int(g * 0.3), 255)
        pts = [(x + bend * (t / 10) ** 2, h - H * t / 10) for t in range(11)]
        for k in range(10):
            wd = max(1, int(6 * (1 - k / 10)))
            d.line([pts[k], pts[k + 1]], fill=col, width=wd)
    save("grass_card", np.asarray(img, np.float32) / 255, "RGBA")


def petal(w=128, h=256):
    """cosmos ray floret: broad, three shallow notches at the tip; greyscale (tinted in shader);
    alpha cutout; darker base + fine veins. V=0 at base, V=1 at tip."""
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    v = yy / h
    u = (xx / w - 0.5) * 2
    width = np.clip(np.sin(np.clip(v, 0, 1) * math.pi * 0.62 + 0.25) * 1.05, 0, 1) * (0.35 + 0.65 * np.clip(v * 1.6, 0, 1))
    tip = 0.93 - 0.05 * np.abs(np.sin(u * math.pi * 1.5))  # three lobes at the tip
    inside = (np.abs(u) < width) & (v < tip)
    veins = (np.sin(u * 22) * 0.5 + 0.5) ** 6 * 0.18
    val = 0.62 + 0.38 * np.clip(v * 1.4, 0, 1) - veins
    rgba = np.zeros((h, w, 4), np.float32)
    rgba[..., 0] = rgba[..., 1] = rgba[..., 2] = val
    rgba[..., 3] = inside.astype(np.float32)
    img = Image.fromarray((rgba * 255).astype(np.uint8), "RGBA").filter(ImageFilter.GaussianBlur(0.7))
    save("petal", np.asarray(img, np.float32) / 255, "RGBA")


def cosmos_leaf(w=128, h=256):
    img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    cx = w / 2
    d.line([cx, h, cx, 10], fill=(52, 110, 36, 255), width=4)
    for k in range(9):
        y = h - 20 - k * 24
        L = 50 * (1 - k / 10)
        for s in (-1, 1):
            d.line([cx, y, cx + s * L, y - L * 0.6], fill=(60, 124, 40, 255), width=3)
    save("cosmos_leaf", np.asarray(img, np.float32) / 255, "RGBA")


# ---------------------------------------------------------------- straw (haystacks, thatch), stalks along V
def straw(n=512):
    h = w = n
    y = np.linspace(0, 1, h, dtype=np.float32)[:, None]
    base = lerp(np.broadcast_to(hexc("#9c8452"), (h, w, 3)).copy(), hexc("#d8bf7c"), noise((h, w), 90, 3, 31) ** 1.2)
    # sun-bleached outer straw with greyer weathered patches
    base = lerp(base, hexc("#a39b82"), np.clip(noise((h, w), 160, 2, 32) - 0.55, 0, 1) * 1.6)
    img = Image.fromarray((np.clip(base, 0, 1) * 255).astype(np.uint8))
    d = ImageDraw.Draw(img)
    r = np.random.default_rng(33)
    for _ in range(2600):   # individual stalks, mostly running down the stack
        x0, y0 = r.uniform(0, w), r.uniform(-40, h)
        L = r.uniform(25, 90)
        a = math.radians(90 + r.normal(0, 14))
        x1, y1 = x0 + math.cos(a) * L, y0 + math.sin(a) * L
        c = tuple(int(v) for v in (hexc(["#e6d08e", "#c2a25e", "#8a7143", "#f0e0a8"][r.integers(4)]) * 255))
        for dx in (-w, 0, w):
            d.line([(x0 + dx, y0), (x1 + dx, y1)], fill=c, width=int(r.integers(1, 3)))
    a = np.asarray(img.filter(ImageFilter.GaussianBlur(0.6)), np.float32) / 255
    save("straw", a)


if __name__ == "__main__":
    wood_log(); wood_end(); wood_plank()
    wood_plank(name="wood_plank_grey", light="#9a8b76", dark="#5e5245", planks=5)
    felt(); yurt_band(); yurt_door(); sod(); stone()
    spruce_frond(); grass_card(); petal(); cosmos_leaf()
    print(sorted(os.listdir(OUT)))


def spruce_skirt(w=512, h=256):
    """one tooth of a drooping spruce tier, repeated around the ring (u), radial in v
    (v=0 inner, v=1 outer tip). Needle strokes point outward and down; tips are cut out."""
    img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    # dark body: tooth-shaped silhouette (wide at the inner edge, pointed tip)
    poly = [(0, 0), (w, 0), (w * 0.62, h * 0.97), (w * 0.5, h), (w * 0.38, h * 0.97)]
    d.polygon(poly, fill=(14, 40, 30, 255))
    # needle sprays: many short strokes, lighter toward the tip
    for _ in range(2600):
        v = rng.random() ** 0.8
        half = 0.5 * (1 - v * 0.9)
        u = 0.5 + (rng.random() * 2 - 1) * half
        x, y = u * w, v * h
        L = 6 + 10 * rng.random()
        a = math.pi / 2 + (u - 0.5) * 1.2 + (rng.random() - 0.5) * 0.9
        g = int(40 + 90 * v + 40 * rng.random())
        col = (int(g * 0.32), g, int(g * 0.62), 255)
        d.line([x, y, x + math.cos(a) * L, y + math.sin(a) * L], fill=col, width=2)
    save("spruce_skirt", np.asarray(img.filter(ImageFilter.GaussianBlur(0.5)), np.float32) / 255, "RGBA")


# ---------------------------------------------------------------- straw (haystacks, thatch), stalks along V
def straw(n=512):
    h = w = n
    y = np.linspace(0, 1, h, dtype=np.float32)[:, None]
    base = lerp(np.broadcast_to(hexc("#9c8452"), (h, w, 3)).copy(), hexc("#d8bf7c"), noise((h, w), 90, 3, 31) ** 1.2)
    # sun-bleached outer straw with greyer weathered patches
    base = lerp(base, hexc("#a39b82"), np.clip(noise((h, w), 160, 2, 32) - 0.55, 0, 1) * 1.6)
    img = Image.fromarray((np.clip(base, 0, 1) * 255).astype(np.uint8))
    d = ImageDraw.Draw(img)
    r = np.random.default_rng(33)
    for _ in range(2600):   # individual stalks, mostly running down the stack
        x0, y0 = r.uniform(0, w), r.uniform(-40, h)
        L = r.uniform(25, 90)
        a = math.radians(90 + r.normal(0, 14))
        x1, y1 = x0 + math.cos(a) * L, y0 + math.sin(a) * L
        c = tuple(int(v) for v in (hexc(["#e6d08e", "#c2a25e", "#8a7143", "#f0e0a8"][r.integers(4)]) * 255))
        for dx in (-w, 0, w):
            d.line([(x0 + dx, y0), (x1 + dx, y1)], fill=c, width=int(r.integers(1, 3)))
    a = np.asarray(img.filter(ImageFilter.GaussianBlur(0.6)), np.float32) / 255
    save("straw", a)


if __name__ == "__main__":
    spruce_skirt()


def shingles(w=512, h=512, rows=8, name="shingles"):
    """weathered wood shingles, rows run along U; each row's lower edge is ragged and darker"""
    base = np.zeros((h, w, 3), np.float32)
    rh = h / rows
    for r in range(rows):
        y0 = int(r * rh)
        x = 0
        off = rng.integers(0, 40)
        while x < w:
            sw = int(rng.integers(26, 52))
            tone = rng.random()
            c = lerp(np.array([hexc("#6e5a47")], np.float32), hexc("#9a8570"), np.array([tone], np.float32))[0]
            c = c * (0.9 + 0.2 * rng.random())
            x0, x1 = (x + off) % w, (x + off + sw) % w
            ys = slice(y0, int(y0 + rh))
            if x0 < x1:
                base[ys, x0:x1] = c
            else:
                base[ys, x0:] = c; base[ys, :x1] = c
            # dark gap between shingles
            base[ys, x0:x0 + 2] *= 0.45
            x += sw
        # darker, ragged bottom edge of the row (shadow of the overlap)
        yy = np.arange(int(rh))[:, None]
        edge = np.clip((yy - rh * 0.72 - 3 * np.sin(np.arange(w)[None, :] * 0.4 + r)) / (rh * 0.28), 0, 1)
        base[y0:y0 + int(rh)] *= (1 - 0.45 * edge)[..., None]
    grain = noise((h, w), 20, 3, 41)
    streak = noise((h, w), 6, 2, 42)
    base *= (0.85 + 0.2 * grain * (0.7 + 0.3 * streak))[..., None]
    lich = np.clip((noise((h, w), 60, 3, 43) - 0.72) * 5, 0, 1) * 0.25  # faint grey lichen
    base = lerp(base, hexc("#8f8c7e"), lich)
    save(name, base)


# ---------------------------------------------------------------- straw (haystacks, thatch), stalks along V
def straw(n=512):
    h = w = n
    y = np.linspace(0, 1, h, dtype=np.float32)[:, None]
    base = lerp(np.broadcast_to(hexc("#9c8452"), (h, w, 3)).copy(), hexc("#d8bf7c"), noise((h, w), 90, 3, 31) ** 1.2)
    # sun-bleached outer straw with greyer weathered patches
    base = lerp(base, hexc("#a39b82"), np.clip(noise((h, w), 160, 2, 32) - 0.55, 0, 1) * 1.6)
    img = Image.fromarray((np.clip(base, 0, 1) * 255).astype(np.uint8))
    d = ImageDraw.Draw(img)
    r = np.random.default_rng(33)
    for _ in range(2600):   # individual stalks, mostly running down the stack
        x0, y0 = r.uniform(0, w), r.uniform(-40, h)
        L = r.uniform(25, 90)
        a = math.radians(90 + r.normal(0, 14))
        x1, y1 = x0 + math.cos(a) * L, y0 + math.sin(a) * L
        c = tuple(int(v) for v in (hexc(["#e6d08e", "#c2a25e", "#8a7143", "#f0e0a8"][r.integers(4)]) * 255))
        for dx in (-w, 0, w):
            d.line([(x0 + dx, y0), (x1 + dx, y1)], fill=c, width=int(r.integers(1, 3)))
    a = np.asarray(img.filter(ImageFilter.GaussianBlur(0.6)), np.float32) / 255
    save("straw", a)


if __name__ == "__main__":
    shingles()


def flower_atlas(W=512, H=256):
    """atlas for the near-range flower plants.
    [0, .25) cosmos ray petal  [.25, .5) daisy petal  [.5, 1) feathery cosmos leaf.
    Petals: R = brightness, G = base-ring mask (darker eye zone), A = alpha; v=0 base, v=1 tip."""
    out = np.zeros((H, W, 4), np.float32)
    # cosmos petal: obovate with three shallow teeth at the tip
    w = W // 4
    yy, xx = np.mgrid[0:H, 0:w].astype(np.float32)
    v = yy / H
    u = (xx / w - 0.5) * 2
    width = np.clip(0.28 + 0.72 * np.sin(np.clip(v * 1.15, 0, 1) * math.pi * 0.62), 0, 1) * np.clip(v * 3.5, 0.18, 1)
    tip = 0.96 - 0.06 * np.abs(np.sin((u + 1) * math.pi * 1.5))
    inside = (np.abs(u) < width) & (v < tip)
    veins = (np.sin(u * 26 + v * 2) * 0.5 + 0.5) ** 8 * 0.12
    out[:, :w, 0] = np.clip(0.72 + 0.28 * np.clip(v * 1.6, 0, 1) - veins, 0, 1)
    out[:, :w, 1] = np.clip(1 - v / 0.28, 0, 1)
    out[:, :w, 3] = inside
    # daisy petal: long narrow strap with a rounded tip
    width2 = 0.32 * np.clip(v * 5, 0.3, 1) * np.sqrt(np.clip((1 - v) / 0.1, 0, 1))
    inside2 = (np.abs(u) < width2) & (v < 0.99)
    out[:, w:2 * w, 0] = np.clip(0.85 + 0.15 * v - (np.sin(u * 30) * 0.5 + 0.5) ** 10 * 0.1, 0, 1)
    out[:, w:2 * w, 1] = np.clip(1 - v / 0.15, 0, 1) * 0.5
    out[:, w:2 * w, 3] = inside2
    # feathery leaf: midrib with many thin pinnae, alpha cutout, green
    img = Image.new("RGBA", (W // 2, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    cxl = W // 4
    for k in range(3):  # three leaflets fanning up from the node
        ang = (-0.55, 0.0, 0.55)[k]
        L = H * (0.8 if k == 1 else 0.62)
        x0, y0 = cxl, H - 2
        x1, y1 = x0 + math.sin(ang) * L, y0 - math.cos(ang) * L
        d.line([x0, y0, x1, y1], fill=(60, 120, 38, 255), width=4)
        for j in range(14):
            t = 0.12 + 0.85 * j / 13
            px, py = x0 + (x1 - x0) * t, y0 + (y1 - y0) * t
            pl = 34 * (1 - t * 0.7)
            for sgn in (-1, 1):
                a = -math.pi / 2 + ang + sgn * 1.0
                d.line([px, py, px + math.cos(a) * pl, py + math.sin(a) * pl], fill=(70 + int(20 * t), 135 + int(25 * t), 44, 255), width=3)
    leaf = np.asarray(img, np.float32) / 255
    out[:, W // 2:, :] = leaf
    Image.fromarray((np.clip(out, 0, 1) * 255).astype(np.uint8), "RGBA").save(f"{OUT}/flower_atlas.png", optimize=True)


# ---------------------------------------------------------------- straw (haystacks, thatch), stalks along V
def straw(n=512):
    h = w = n
    y = np.linspace(0, 1, h, dtype=np.float32)[:, None]
    base = lerp(np.broadcast_to(hexc("#9c8452"), (h, w, 3)).copy(), hexc("#d8bf7c"), noise((h, w), 90, 3, 31) ** 1.2)
    # sun-bleached outer straw with greyer weathered patches
    base = lerp(base, hexc("#a39b82"), np.clip(noise((h, w), 160, 2, 32) - 0.55, 0, 1) * 1.6)
    img = Image.fromarray((np.clip(base, 0, 1) * 255).astype(np.uint8))
    d = ImageDraw.Draw(img)
    r = np.random.default_rng(33)
    for _ in range(2600):   # individual stalks, mostly running down the stack
        x0, y0 = r.uniform(0, w), r.uniform(-40, h)
        L = r.uniform(25, 90)
        a = math.radians(90 + r.normal(0, 14))
        x1, y1 = x0 + math.cos(a) * L, y0 + math.sin(a) * L
        c = tuple(int(v) for v in (hexc(["#e6d08e", "#c2a25e", "#8a7143", "#f0e0a8"][r.integers(4)]) * 255))
        for dx in (-w, 0, w):
            d.line([(x0 + dx, y0), (x1 + dx, y1)], fill=c, width=int(r.integers(1, 3)))
    a = np.asarray(img.filter(ImageFilter.GaussianBlur(0.6)), np.float32) / 255
    save("straw", a)


if __name__ == "__main__":
    flower_atlas()
