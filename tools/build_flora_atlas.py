"""Flora atlas v2: the painted parts of the texture batches (docs/ai_texture_prompts_v2/v3.md)
packed next to the procedural veg atlas (tools/paint_vegetation.py), 4096 x 3072 RGBA:

  x 0-2048      16 flower heads C01-C16, 512 each, top view as delivered (flower centre at the
                slot centre, first petal toward the top of the slot)
  x 2048-4096   y 0-1024      the old veg atlas (2048 x 1024) unchanged
                y 1024-1536   leaves E01-E04 (top views, 512 each)
                y 1536-2048   E05 fern frond, B3 fescue panicle, B4 stipa awns, B5 timothy spike
                              (side views, base at the bottom of the slot)
  y 2048-2560   third batch, top views: H07 fading daisy, H08 fading cosmos, G01 fireweed flower,
                H02 buttercup leaf, H03 edelweiss rosette; side/front views: G04 larkspur flower,
                G05 bell, G03 dragonhead flower
  y 2560-3072   H01 fireweed leaf, H04 poppy bud, H05 globeflower bud, H06 cranesbill fruit,
                G02 fireweed spike tip, B7 brome, B8 bluegrass, B9 dry grass
Third-batch paintings not delivered yet are stand-ins: their slot name points at the rect of a
similar existing part (FALLBACK), so the renderer already uses the final names.

Transparent texels get the colour of the nearest opaque one, so mip-maps don't darken the
edges. Writes web/public/assets/flora_v2.png and flora_v2.json:
  {"rects": {name: [u0, v0, u1, v1]}, "heads": {name: {"r": outline radius in slot units}}}
Re-run after replacing any PNG in the batch folder; names stay the same.
"""
import glob, json, os, sys
import numpy as np
from PIL import Image
from scipy import ndimage

# source folders, newest first: a painting redone in a later batch (same code prefix, e.g.
# C01_*.png) replaces the earlier one (docs/ai_texture_prompts_v3.md)
SRCS = sys.argv[1:] or ["ref/plant_textures_v3", "ref/plant_textures_v2_54_procedural/ref/textures"]
OUT = "web/public/assets"
W, H = 4096, 3072
atlas = np.zeros((H, W, 4), np.float32)
rects, heads = {}, {}


def load(code):
    for src in SRCS:
        f = sorted(glob.glob(f"{src}/{code}_*.png") + glob.glob(f"{src}/{code}_*.jpg"))
        if f:
            im = Image.open(f[0])
            if im.mode != "RGBA" or np.asarray(im.convert("RGBA"))[..., 3].min() > 250:
                sys.path.insert(0, "tools")
                from process_ai_textures import key_out   # flat blue #0000FF background -> alpha
                im = Image.fromarray((np.clip(key_out(im), 0, 1) * 255).astype(np.uint8), "RGBA")
            # the colour grading corrects the pale procedural second batch only
            return grade(code, im.convert("RGBA")) if "v2_54_procedural" in src else im.convert("RGBA")
    raise SystemExit(f"missing {code} in {SRCS}")


def bleed(a):
    solid = a[..., 3] > 0.5
    if solid.any() and not solid.all():
        idx = ndimage.distance_transform_edt(~solid, return_distances=False, return_indices=True)
        a[..., :3] = a[..., :3][idx[0], idx[1]]
    return a


# The batch is pale pastel; leaves must sit in the saturated sward and some flowers are vivid in
# life. Each listed painting is graded (per-channel gain in linear light, keeping its internal
# variation) toward the mean colour of the matching part of the veg atlas, by `strength`.
GRADE = {"C01": ((0.8, 0.6, 0.06), 0.6), "C02": ((0.85, 0.4, 0.12), 0.5), "C06": ((0.85, 0.62, 0.02), 0.7),
         "E01": ("leaf_mantle", 1.0), "E02": ("leaf_clover", 1.0), "E03": ("leaf_geranium", 1.0), "E04": ("leaf_dandelion", 1.0),
         "E05": ("fern", 1.0), "C05": ("forgetmenot", 0.7), "C08": ("dandelion", 0.85), "C04": ("geranium", 0.5)}
_old = np.asarray(Image.open(f"{OUT}/veg_atlas.png").convert("RGBA"), np.float32) / 255
_old_r = json.load(open(f"{OUT}/veg_atlas.json"))
lin = lambda c: np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)
srgb = lambda c: np.where(c <= 0.0031308, c * 12.92, 1.055 * np.power(np.clip(c, 0, None), 1 / 2.4) - 0.055)


def slot_mean(name):
    u0, v0, u1, v1 = _old_r[name]
    h, w = _old.shape[:2]
    t = _old[int(v0 * h):int(v1 * h), int(u0 * w):int(u1 * w)]
    m = t[..., 3] > 0.5
    return lin(t[..., :3][m]).mean(0)


def grade(code, im, spec=None):
    """target: a veg-atlas part name or a linear RGB mean colour"""
    spec = spec or GRADE.get(code)
    if spec is None:
        return im
    target, k = spec
    a = np.asarray(im, np.float32) / 255
    m = a[..., 3] > 0.5
    c = lin(a[..., :3])
    tgt = slot_mean(target) if isinstance(target, str) else np.array(target, np.float32)
    gain = (tgt / np.maximum(c[m].mean(0), 1e-4)) ** k
    a[..., :3] = np.clip(srgb(c * gain), 0, 1)
    return Image.fromarray((a * 255).round().astype(np.uint8), "RGBA")


def put(name, im, x, y, w, h):
    a = bleed(np.asarray(im.resize((w, h), Image.LANCZOS), np.float32) / 255)
    atlas[y:y + h, x:x + w] = a
    rects[name] = [x / W, y / H, (x + w) / W, (y + h) / H]


HEADS = ["C01", "C02", "C03", "C04", "C05", "C06", "C07", "C08", "C09", "C10", "C11", "C12", "C13", "C14", "C15", "C16"]
for i, code in enumerate(HEADS):
    im = load(code)
    al = np.asarray(im)[..., 3] > 128
    ys, xs = np.nonzero(al)
    # outline radius around the image centre (the flower centre), as a share of the slot
    c = (im.width - 1) / 2
    r = float(np.sqrt(((xs - c) ** 2 + (ys - c) ** 2)).max() / im.width)
    heads[f"head_{code}"] = {"r": round(r, 4)}
    put(f"head_{code}", im, (i % 4) * 512, (i // 4) * 512, 512, 512)

old = Image.open(f"{OUT}/veg_atlas.png").convert("RGBA")
atlas[0:1024, 2048:4096] = bleed(np.asarray(old, np.float32) / 255)
for k, (u0, v0, u1, v1) in json.load(open(f"{OUT}/veg_atlas.json")).items():
    rects[k] = [0.5 + u0 * 0.5, v0 * 1024 / H, 0.5 + u1 * 0.5, v1 * 1024 / H]   # old atlas: x 2048-4096, y 0-1024

for i, code in enumerate(["E01", "E02", "E03", "E04"]):
    put(f"leaf_{code}", load(code), 2048 + i * 512, 1024, 512, 512)


def side(code):
    """side-view part: crop to the drawing, keep its base at the bottom centre"""
    im = load(code)
    x0, y0, x1, y1 = im.getbbox()
    cx = im.width // 2
    side_ = max(2 * max(cx - x0, x1 - cx), im.height - y0)    # square, so the slot keeps the aspect
    out = Image.new("RGBA", (side_, side_))
    out.alpha_composite(im.crop((cx - side_ // 2, y0, cx + side_ // 2, im.height)) if cx - side_ // 2 >= 0 else
                        im.crop((0, y0, im.width, im.height)), ((side_ - (min(side_, im.width) if cx - side_ // 2 < 0 else side_)) // 2, side_ - (im.height - y0)))
    return out


def closed(im, r):
    """fill the gaps between fine leaflets (morphological closing of alpha): alpha-tested at a
    distance, a frond of separate pinnae breaks up into stripes"""
    a = np.asarray(im, np.float32) / 255
    al = a[..., 3] > 0.5
    c = ndimage.binary_closing(al, structure=np.ones((2 * r + 1, 2 * r + 1)), iterations=1)
    a[..., 3] = np.maximum(a[..., 3], ndimage.gaussian_filter(c.astype(np.float32), 1.0) * 0.95)
    a[..., :3] *= np.where(al, 1.0, 0.7)[..., None]          # filled gaps read as shade between leaflets
    return Image.fromarray((np.clip(a, 0, 1) * 255).astype(np.uint8), "RGBA")


for i, code in enumerate(["E05", "B3", "B4", "B5"]):
    if code == "E05":
        put("frond", closed(side(code), 6), 2048 + i * 512, 1536, 512, 512)
        continue
    put({"E05": "frond", "B3": "panicle_v2", "B4": "stipa_v2", "B5": "timothy"}[code], side(code), 2048 + i * 512, 1536, 512, 512)

# third batch (optional): (code, slot name, kind, fallback slot)
# a stand-in may be a recoloured copy of a delivered painting: (code, target colour, strength)
RECOLOUR = {"G01": ("C12", (0.62, 0.08, 0.36), 0.9)}   # fireweed flower: magenta wild-rose petals
THIRD = [("H07", "head_H07", "head", "head_C07"), ("H08", "head_H08", "head", "head_C16"), ("G01", "head_G01", "head", "head_C12"),
         ("H02", "leaf_H02", "top", "leaf_E03"), ("H03", "leaf_H03", "top", "leaf_E04"), ("G04", "floret_G04", "top", "delphinium"),
         ("G05", "floret_G05", "side", "bell"), ("G03", "floret_G03", "side", "delphinium"),
         ("H01", "leaf_H01", "side", "leaf_lance"), ("H04", "bud_H04", "side", "bud"), ("H05", "bud_H05", "side", "bud"),
         ("H06", "fruit_H06", "side", "bud"), ("G02", "spike_G02", "side", "bud"), ("B7", "brome", "side", "panicle_v2"),
         ("B8", "poa", "side", "panicle_v2"), ("B9", "drygrass", "side", "stipa_v2")]
GRADE.update({"H01": ("leaf_lance", 0.6), "H02": ("leaf_geranium", 0.6)})
missing = []
for i, (code, name, kind, fb) in enumerate(THIRD):
    x, y = (i % 8) * 512, 2048 + (i // 8) * 512
    try:
        im = load(code)
    except SystemExit:
        if code in RECOLOUR:
            src, tgt, k = RECOLOUR[code]
            im = grade(src, load(src), (tgt, k))
            heads[name] = heads[f"head_{src}"]
            put(name, im, x, y, 512, 512)
            missing.append(code + "*")
            continue
        rects[name] = rects[fb]
        if fb in heads:
            heads[name] = heads[fb]
        missing.append(code)
        continue
    if kind == "head":
        al = np.asarray(im)[..., 3] > 128
        ys, xs = np.nonzero(al)
        c = (im.width - 1) / 2
        heads[name] = {"r": round(float(np.sqrt(((xs - c) ** 2 + (ys - c) ** 2)).max() / im.width), 4)}
    put(name, side(code) if kind == "side" else im, x, y, 512, 512)
if missing:
    print("stand-ins for", " ".join(missing))

Image.fromarray((np.clip(atlas, 0, 1) * 255).round().astype(np.uint8), "RGBA").save(f"{OUT}/flora_v2.png", optimize=True)
json.dump({"rects": rects, "heads": heads}, open(f"{OUT}/flora_v2.json", "w"), indent=1)
print("flora_v2.png", os.path.getsize(f"{OUT}/flora_v2.png") // 1024, "KB;", len(rects), "slots;", {k: v["r"] for k, v in heads.items()})
