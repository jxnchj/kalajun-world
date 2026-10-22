"""Schrenk spruce (Picea schrenkiana), second version: built like the tree -- a trunk with whorls
of drooping side branches, each branch a card painted from the AI branch texture (S01, dense
blue-green needles, hanging twigs, a few cones), the spire from S02 -- in five forms, so a
stand is not one tree repeated:

  column   the common mature tree: tall, narrow, full almost to the ground
  pencil   slender, crowded stand tree: lower trunk bare with dead twigs
  young    a sapling / young tree: a full cone to the ground, longer internodes
  old      big old tree: ragged crown with gaps, uneven branches, dead lower branches, a lean
  edge     a tree at a clearing: branches longer on the open (+x) side

All are modelled 18 m tall (the web material's crown-volume normal assumes that; the renderer
scales per instance). Two levels of detail, one GLB each, holding every form as its own objects
named <form>_<part> and sharing one texture:
  web/public/assets/spruce2_hi.glb   (near, ~4k triangles per tree)
  web/public/assets/spruce2_mid.glb  (110-260 m, ~0.8k)
Materials: 'frond' (branch/spire cards, alpha), 'core' (dark inner crown), 'bark'.
Vertex colour R = crown occlusion (dark inside / low, bright at branch tips and at the top).
Run: tools/.bpy/bin/python tools/blender/spruce2.py
"""
import math, os, random, sys
sys.path.insert(0, os.path.dirname(__file__))
from lib import *
from mathutils import Vector
from PIL import Image

H = 18.0
SRC = os.path.join(ROOT, "ref", "plant_textures_v3")
ATLAS = "spruce_atlas.png"


# the atlas (S01 branch left, S02 top right) comes from tools/build_spruce_atlas.py
def load_atlas():
    import json
    return json.load(open(os.path.join(TEX, "spruce_atlas.json")))


# ---------------------------------------------------------------- tree forms
FORMS = {
    #          rmax  profile exp  crown base  whorl dz  per whorl  dead  gaps  lean  side
    "column": dict(rmax=2.3, pw=0.55, hb=0.9, dz=0.4, nb=(7, 8), dead=False, gaps=0.04, lean=0.0, side=0.0, seed=21),
    "pencil": dict(rmax=1.75, pw=0.5, hb=3.2, dz=0.4, nb=(6, 7), dead=True, gaps=0.06, lean=0.0, side=0.0, seed=22),
    "young": dict(rmax=3.1, pw=1.0, hb=0.25, dz=0.55, nb=(6, 7), dead=False, gaps=0.0, lean=0.0, side=0.0, seed=23),
    "old": dict(rmax=2.6, pw=0.6, hb=3.8, dz=0.42, nb=(6, 8), dead=True, gaps=0.16, lean=0.03, side=0.0, seed=24),
    "edge": dict(rmax=2.4, pw=0.6, hb=0.7, dz=0.4, nb=(7, 8), dead=False, gaps=0.05, lean=0.01, side=0.4, seed=25),
}


def radius(f, z):
    t = (z - f["hb"]) / (H - f["hb"])
    if t < 0 or t > 1:
        return 0.0
    return f["rmax"] * (1 - t) ** f["pw"] * (0.88 + 0.12 * math.sin(t * 7.3 + f["seed"])) + 0.12


def branch(mb, uv, base, azim, L, pitch, droop, width, segs, rnd, fold=0.3, side_card=True):
    """one side branch along a drooping centre line with an upturned tip, as a + section: a flat
    spray (Λ-folded a little, seen from above) and a hanging spray in the vertical plane (seen
    from the side). The texture's base (stem, longest twigs) is at the bottom of its slot (v0)."""
    d = Vector((math.cos(azim), math.sin(azim), 0))
    side = Vector((-d.y, d.x, 0))
    pts = []
    for k in range(segs + 1):
        t = k / segs
        dzv = math.tan(pitch) * t - droop * t * t + 0.12 * max(0.0, t - 0.65) ** 2 / 0.1225
        pts.append(Vector(base) + d * (0.1 + L * t) + Vector((0, 0, L * dzv)))
    u0, v0, u1, v1 = uv
    uc, hu = (u0 + u1) / 2, (u1 - u0) / 2
    flip = -1 if rnd.random() < 0.5 else 1
    tw = rnd.uniform(-0.2, 0.2)
    for s in (-1, 1):
        P = []
        for p in pts:
            a = fold + tw * s
            e = side * s * math.cos(a) * width * 0.5 - Vector((0, 0, math.sin(a) * width * 0.5))
            P.append([p, p + e])
        mb.quad_strip_grid("frond", P, lambda i, j, s=s: (uc + hu * j * s * flip, v0 + (v1 - v0) * i / segs))
    if side_card:
        vs = max(1, segs - 1)
        P = []
        for k in range(vs + 1):
            p = pts[round(k * segs / vs)]
            h = width * 0.42
            P.append([p + Vector((0, 0, h * 0.55)), p - Vector((0, 0, h * 1.0))])   # twigs mostly hang
        mb.quad_strip_grid("frond", P, lambda i, j: (uc + hu * (1 - 2 * j) * flip, v0 + (v1 - v0) * i / vs))
    return pts


def tree(mb, f, lod, uv, rnd):
    hi = lod == "hi"
    dzw = f["dz"] * (1 if hi else 2.0)
    segs = 3 if hi else 2
    lean = Vector((f["lean"], 0, 0))
    top_h = 1.9
    # trunk
    log(mb, "bark", (0, 0, -0.3), (H * f["lean"] * 0.95, 0, H * 0.93), 0.32 if f["rmax"] > 2 else 0.26,
        seg=8 if hi else 5, taper=0.85, wobble=0.03, uv_len=1.5, seed=f["seed"], caps=False)
    # whorls from just under the spire down to the crown base
    z = H - top_h + 0.35
    k = 0
    while z > f["hb"]:
        r = radius(f, z)
        n = rnd.randint(*f["nb"]) - (0 if hi else 2)
        a0 = rnd.random() * 6.283
        t = (z - f["hb"]) / (H - f["hb"])
        pitch = math.radians(18 - 34 * (1 - t) ** 1.1)     # up near the top, drooping low down
        droop = 0.12 + 0.3 * (1 - t)
        wscale = rnd.uniform(0.75, 1.25) if f["gaps"] > 0.1 else 1.0   # old trees: uneven tiers
        for i in range(n):
            if rnd.random() < f["gaps"]:
                continue
            az = a0 + 6.283 * i / n + rnd.uniform(-0.25, 0.25)
            L = r * rnd.uniform(0.82, 1.08) * wscale * (1 + f["side"] * math.cos(az))
            if f["gaps"] > 0.1 and rnd.random() < 0.12:
                L *= 0.45                                     # broken / stunted branch
            L = max(L, 0.35)
            base = Vector((0, 0, z)) + lean * z
            branch(mb, uv["branch"], base, az, L, pitch + rnd.uniform(-0.08, 0.08), droop, L * uv["branch_aspect"] * 1.15, segs, rnd,
                   side_card=hi)
        z -= dzw * rnd.uniform(0.85, 1.15)
        k += 1
    # dead twigs on the bare lower trunk
    if f["dead"]:
        zz = f["hb"] - 0.2
        while zz > 1.0:
            for i in range(rnd.randint(2, 4) if hi else 1):
                az = rnd.random() * 6.283
                L = rnd.uniform(0.4, 1.1)
                p0 = Vector((0, 0, zz)) + lean * zz
                p1 = p0 + Vector((math.cos(az) * L, math.sin(az) * L, -L * rnd.uniform(0.1, 0.5)))
                log(mb, "bark", p0, p1, 0.035, seg=4, rings=2, taper=0.8, wobble=0.0, caps=False, seed=rnd.randint(0, 999))
            zz -= rnd.uniform(0.5, 0.9) * (1 if hi else 2)
    # the spire: crossed cards of the tree top
    u0, v0, u1, v1 = uv["top"]
    w = top_h * uv["top_aspect"]
    ztop = H - top_h
    for i in range(3 if hi else 2):
        yaw = i * math.pi / (3 if hi else 2) + rnd.uniform(-0.1, 0.1)
        card(mb, "frond", Vector((0, 0, ztop)) + lean * H, w, top_h + 0.05, yaw, uv=(u0, v1, u1, v0))   # lib.card: bottom gets uv[3]
    # dark inner crown hides the gaps between tiers
    prof = []
    rings = 12 if hi else 6
    for j in range(rings + 1):
        zz = f["hb"] + 0.2 + (H - top_h - f["hb"]) * j / rings
        prof.append((radius(f, zz) * 0.22, zz))
    seg = 10 if hi else 6
    P = [[Vector((r * math.cos(a), r * math.sin(a), zz)) + lean * zz for a in [q / seg * 6.2832 for q in range(seg + 1)]] for r, zz in prof]
    mb.quad_strip_grid("core", P, lambda i, j: (j / seg, i / rings))


def build(lod, uv):
    reset()
    bark_src = os.path.join(PH, "pine_bark", "textures", "pine_bark_diff_1k.jpg")
    bark = os.path.join(TEX, "bark.png")
    if not os.path.exists(bark):
        Image.open(bark_src).resize((512, 512)).save(bark)
    M = {"frond": material("frond", ATLAS, alpha=True), "core": material("core", color=(0.03, 0.062, 0.042, 1)), "bark": material("bark", "bark.png")}
    objs = []
    for name, f in FORMS.items():
        mb = MeshBuilder()
        tree(mb, f, lod, uv, random.Random(f["seed"]))
        parts = mb.build(name, M)
        for ob in parts:
            me = ob.data
            attr = me.color_attributes.new("Color", "FLOAT_COLOR", "POINT")
            for i, v in enumerate(me.vertices):
                p = v.co
                rc = max(radius(f, p.z), 0.3)
                radial = min(1.0, math.hypot(p.x - f["lean"] * p.z, p.y) / rc)
                ao = 0.32 + 0.58 * radial ** 1.3 + 0.1 * (p.z / H)
                if ob.name.endswith("bark"):
                    ao = 0.45
                if ob.name.endswith("core"):
                    ao = 0.5   # shaded needles inside the crown, not a black hole
                attr.data[i].color = (ao, ao, ao, 1)
            print(f"  {ob.name}: {len(me.polygons)} faces")
        objs += parts
    export(f"spruce2_{lod}", objs)


if __name__ == "__main__":
    uv = load_atlas()
    print("atlas uv", uv)
    build("hi", uv)
    build("mid", uv)
