"""Things of a herder household (web/public/assets/household.glb), each its own object so the
renderer can place it (and later give it a collider):

  woodpile    split spruce firewood stacked against a wall, ~2.4 x 0.55 x 1.1 m (front = -Y)
  block       a chopping block with an axe stuck in it and a few split pieces round it
  can_a/can_b aluminium milk flasks (40 l, 25 l)
  bucket      a wooden pail with iron hoops and a rope handle
  hearth      a ring of fire-blackened stones, a tripod of poles with a black kettle
  cart        a two-wheeled horse cart (arba): spoked wheels, plank bed, shafts resting on the ground
  rug         a felt rug (syrmak, the AI texture T09) hanging over a pole, the pole at z = 1.1
  tether      the foal line (zhely): two stakes and a rope 14 m along the ground (along +X)

Conventions as in cabin.py: Z up, metres, standing on z = 0. Materials by name (the web side
weathers 'log'/'logend'/'plank', 'tin' is dull aluminium).
Run: tools/.bpy/bin/python tools/blender/household.py
"""
import math, os, random, sys
sys.path.insert(0, os.path.dirname(__file__))
from lib import *
from mathutils import Vector, Matrix
from PIL import Image
import numpy as np

RUG = os.path.join(TEX, "rug_t09.png")


def prep_rug():
    """T09 cropped to the rug (it comes on a transparent square)"""
    im = Image.open(os.path.join(ROOT, "ref", "plant_textures_v3", "T09_felt_rug.png")).convert("RGBA")
    a = np.asarray(im)[..., 3] > 128
    r, c = np.nonzero(a.any(1))[0], np.nonzero(a.any(0))[0]
    im.crop((c.min(), r.min(), c.max() + 1, r.max() + 1)).convert("RGB").resize((1024, 432), Image.LANCZOS).save(RUG)


def mats():
    return {
        "log": material("log", "wood_log.png"),
        "logend": material("logend", "wood_end.png"),
        "plank": material("plank", "wood_plank.png"),
        "iron": material("iron", color=(0.05, 0.045, 0.04, 1)),
        "tin": material("tin", color=(0.52, 0.53, 0.53, 1)),
        "rope": material("rope", color=(0.5, 0.42, 0.3, 1)),
        "stone": material("stone", "stone.png"),
        "soot": material("soot", color=(0.06, 0.055, 0.05, 1)),
        "rug": material("rug", RUG),
    }


def split_piece(mb, c, axis_yaw, L, r, kind, rnd):
    """a split log piece lying along its yaw: 'half' or 'quarter' of a round, bark outside"""
    a0, a1 = (0.0, math.pi) if kind == "half" else (0.0, math.pi / 2)
    rot = Matrix.Rotation(axis_yaw, 3, "Z") @ Matrix.Rotation(rnd.uniform(0, 2 * math.pi), 3, "X")
    seg = 5 if kind == "half" else 3
    ring = lambda x: [Vector((x, r * math.cos(a0 + (a1 - a0) * k / seg), r * math.sin(a0 + (a1 - a0) * k / seg))) for k in range(seg + 1)] + [Vector((x, 0, 0))]
    R0, R1 = ring(-L / 2), ring(L / 2)
    V = [c + rot @ v for v in R0 + R1]
    n = seg + 2
    faces, uvs = [], []
    for k in range(seg):   # bark
        faces.append((k, k + 1, n + k + 1, n + k)); uvs.append([(0, k / seg), (0, (k + 1) / seg), (L, (k + 1) / seg), (L, k / seg)])
    # split faces (pale wood, the end-grain texture's light part)
    faces.append((seg, n - 1, 2 * n - 1, n + seg)); uvs.append([(0.4, 0.4), (0.5, 0.5), (0.5, 0.6), (0.4, 0.5)])
    faces.append((n - 1, 0, n, 2 * n - 1)); uvs.append([(0.5, 0.5), (0.6, 0.4), (0.6, 0.5), (0.5, 0.6)])
    mb.add("log", V, faces[:seg], uvs[:seg])
    mb.add("logend", V, faces[seg:], uvs[seg:])
    # end grain on both ends
    for R, off in ((list(range(n)), 0), (list(range(n)), n)):
        idx = [off + i for i in R]
        mb.add("logend", V, [tuple(idx[:-1][::-1] if off == 0 else idx[:-1])],
               [[(0.5 + 0.5 * (v.y / r) * 0.9, 0.5 + 0.5 * (v.z / r) * 0.9) for v in ([R0, R1][off // n][:-1][::-1] if off == 0 else R1[:-1])]])


def woodpile(mb, rnd):
    L, D = 2.4, 0.55
    z = 0.0
    # two sleeper logs keep it off the ground
    for y in (-0.15, 0.15):
        log(mb, "log", (-L / 2, y, 0.07), (L / 2, y, 0.07), 0.07, seg=7, caps=True, end_mat="logend", seed=rnd.random())
    z = 0.14
    row = 0
    while z < 1.05:
        x = -L / 2 + 0.08 + rnd.uniform(0, 0.06)
        while x < L / 2 - 0.08:
            r = rnd.uniform(0.07, 0.1)
            kind = "half" if rnd.random() < 0.6 else "quarter"
            split_piece(mb, Vector((x, rnd.uniform(-0.03, 0.03), z + r * 0.5)), math.pi / 2 + rnd.uniform(-0.06, 0.06), D * rnd.uniform(0.9, 1.05), r, kind, rnd)
            x += r * rnd.uniform(1.6, 1.9)
        z += 0.13
        row += 1
    # a lean-to board roof on two posts (keeps the wood dry)
    for sx in (-1, 1):
        log(mb, "log", (sx * L / 2, -0.35, 0), (sx * L / 2, -0.35, 1.25), 0.045, seg=6, seed=rnd.random())
    for k in range(9):
        x = -L / 2 - 0.1 + (L + 0.2) * (k + 0.5) / 9
        plank(mb, "plank", (x, -0.05, 1.33), 0.95, (L + 0.2) / 9 - 0.01, 0.025,
              rot=Matrix.Rotation(math.pi / 2, 3, "Z") @ Matrix.Rotation(-0.25, 3, "Y"), seed=rnd.random())


def block(mb, rnd):
    log(mb, "log", (0, 0, 0), (0, 0, 0.5), 0.26, seg=12, wobble=0.06, caps=True, end_mat="logend", seed=3)
    # axe: handle leaning out of the top, iron head buried in it
    h0, h1 = Vector((0.03, 0, 0.47)), Vector((0.42, 0.08, 1.05))
    log(mb, "plank", h0, h1, 0.018, seg=6, wobble=0, caps=True)
    d = (h1 - h0).normalized()
    box(mb, "iron", h0 + d * 0.04 - Vector((0, 0, 0.02)), (0.16, 0.035, 0.1),
        rot=Matrix.Rotation(math.atan2(d.y, d.x), 3, "Z") @ Matrix.Rotation(-math.asin(d.z) * 0.3, 3, "Y"))
    for k in range(5):   # split pieces lying round it
        a = rnd.uniform(0, 2 * math.pi)
        split_piece(mb, Vector((math.cos(a) * rnd.uniform(0.45, 0.9), math.sin(a) * rnd.uniform(0.45, 0.9), 0.05)), rnd.uniform(0, math.pi),
                    rnd.uniform(0.4, 0.5), rnd.uniform(0.06, 0.09), "quarter" if k % 2 else "half", rnd)


def lathe(mb, mat, prof, seg=16, off=Vector((0, 0, 0)), uv_u=1.0):
    P = [[off + Vector((r * math.cos(j / seg * 2 * math.pi), r * math.sin(j / seg * 2 * math.pi), z)) for j in range(seg + 1)] for r, z in prof]
    mb.quad_strip_grid(mat, P, lambda i, j: (j / seg * uv_u, i / (len(prof) - 1)))


def can(mb, H):
    k = H / 0.62
    prof = [(0.0, 0.0), (0.17 * k, 0.0), (0.18 * k, 0.02 * k), (0.18 * k, 0.4 * k), (0.16 * k, 0.45 * k), (0.085 * k, 0.5 * k),
            (0.08 * k, 0.56 * k), (0.105 * k, 0.57 * k), (0.105 * k, 0.61 * k), (0.0, 0.62 * k)]
    lathe(mb, "tin", prof, seg=20)
    for s in (-1, 1):   # handles
        log(mb, "tin", (s * 0.15 * k, 0, 0.44 * k), (s * 0.2 * k, 0, 0.47 * k), 0.012, seg=5, wobble=0, caps=False)


def bucket(mb):
    prof = [(0.0, 0.02), (0.12, 0.02), (0.125, 0.0), (0.155, 0.3), (0.145, 0.3), (0.115, 0.03)]
    lathe(mb, "plank", prof, seg=14, uv_u=3)
    for z, r in ((0.06, 0.131), (0.24, 0.151)):
        lathe(mb, "iron", [(r, z - 0.015), (r, z + 0.015)], seg=14)
    pts = [Vector((0.15 * math.cos(a), 0, 0.3 + 0.18 * math.sin(a))) for a in [k / 8 * math.pi for k in range(9)]]
    for p0, p1 in zip(pts[:-1], pts[1:]):
        log(mb, "rope", p0, p1, 0.008, seg=4, wobble=0, caps=False)


def hearth(mb, rnd):
    for k in range(11):   # fire ring
        a = k / 11 * 2 * math.pi
        rock(mb, "stone", (0.42 * math.cos(a), 0.42 * math.sin(a), 0.02), rnd.uniform(0.1, 0.15), seed=rnd.random(), squash=0.6, subdiv=1)
    # ash and embers bed
    lathe(mb, "soot", [(0.0, 0.03), (0.34, 0.02), (0.36, 0.0)], seg=14)
    for k in range(4):   # half-burnt sticks
        a = rnd.uniform(0, 2 * math.pi)
        log(mb, "soot", (0.3 * math.cos(a), 0.3 * math.sin(a), 0.05), (-0.05 * math.cos(a), -0.05 * math.sin(a), 0.1), 0.03, seg=5, wobble=0, caps=True)
    top = Vector((0, 0, 1.45))
    for k in range(3):   # tripod
        a = k / 3 * 2 * math.pi + 0.3
        log(mb, "log", (0.75 * math.cos(a), 0.75 * math.sin(a), 0), top + Vector((0.04 * math.cos(a), 0.04 * math.sin(a), 0.1)), 0.03, seg=6, wobble=0.02, seed=k)
    log(mb, "iron", top, top - Vector((0, 0, 0.72)), 0.006, seg=4, wobble=0, caps=False)   # chain
    kz = 0.42
    lathe(mb, "soot", [(0.0, kz), (0.16, kz + 0.01), (0.2, kz + 0.1), (0.19, kz + 0.2), (0.12, kz + 0.27), (0.13, kz + 0.29), (0.0, kz + 0.3)], seg=16)
    pts = [Vector((0.19 * math.cos(a), 0, kz + 0.26 + 0.2 * math.sin(a))) for a in [k / 8 * math.pi for k in range(9)]]
    for p0, p1 in zip(pts[:-1], pts[1:]):
        log(mb, "iron", p0, p1, 0.006, seg=4, wobble=0, caps=False)


def wheel(mb, c, R, rnd):
    """cart wheel in the XZ plane (axle along Y) at c"""
    n = 12
    for k in range(n):   # felloes
        a0, a1 = k / n * 2 * math.pi, (k + 1) / n * 2 * math.pi
        log(mb, "log", c + Vector((R * math.cos(a0), 0, R * math.sin(a0))), c + Vector((R * math.cos(a1), 0, R * math.sin(a1))), 0.045, seg=6, wobble=0, caps=False)
    lathe(mb, "iron", [(0, 0), (0, 0)], seg=4)   # (nothing: placeholder keeps material order stable)
    for k in range(10):   # spokes
        a = k / 10 * 2 * math.pi
        log(mb, "plank", c, c + Vector((R * 0.97 * math.cos(a), 0, R * 0.97 * math.sin(a))), 0.02, seg=5, wobble=0, caps=False)
    log(mb, "log", c - Vector((0, 0.12, 0)), c + Vector((0, 0.12, 0)), 0.09, seg=10, wobble=0, caps=True, end_mat="logend")   # hub


def cart(mb, rnd):
    R = 0.65
    for s in (-1, 1):
        wheel(mb, Vector((0, s * 0.8, R)), R, rnd)
    log(mb, "log", (0, -0.95, R), (0, 0.95, R), 0.04, seg=6, wobble=0, caps=True)   # axle
    # bed: planks across two beams, tilted forward (shafts resting on the ground)
    tilt = math.atan2(R + 0.05, 2.6)
    rot = Matrix.Rotation(tilt, 3, "Y")
    base = Vector((0, 0, R + 0.08))
    for s in (-1, 1):   # shafts / beams, running forward (-X) down to the ground
        p0 = base + rot @ Vector((1.2, s * 0.55, 0))
        p1 = base + rot @ Vector((-2.7, s * 0.45, 0))
        log(mb, "log", p0, p1, 0.05, seg=7, wobble=0.02, caps=True, end_mat="logend", seed=s)
    for k in range(11):
        x = 1.15 - k * 0.2
        plank(mb, "plank", base + rot @ Vector((x, 0, 0.06)), 1.25, 0.18, 0.04, rot=rot @ Matrix.Rotation(math.pi / 2, 3, "Z"), seed=rnd.random())
    for s in (-1, 1):   # low side rails
        log(mb, "log", base + rot @ Vector((1.15, s * 0.62, 0.3)), base + rot @ Vector((-0.9, s * 0.62, 0.3)), 0.03, seg=6, wobble=0, caps=True)
        for x in (1.1, 0.1, -0.85):
            log(mb, "log", base + rot @ Vector((x, s * 0.62, 0.05)), base + rot @ Vector((x, s * 0.62, 0.32)), 0.025, seg=5, wobble=0, caps=False)


def rug(mb):
    """a felt rug folded over a pole at z = 1.1 (the renderer puts the pole on a fence rail)"""
    W, L = 1.5, 2.2                     # across the pole, along it the rug is L long
    zt = 1.1
    P = []
    ny = 14
    for i in range(ny + 1):
        t = i / ny                        # 0 .. 1 over the whole rug; the pole at t = 0.45
        s = (t - 0.45) * W * 2.0
        if s < 0:   # front side hanging down
            y, z = -0.05 - 0.02 * math.sin(-s * 3), zt + s
        else:
            y, z = 0.05 + 0.02 * math.sin(s * 3), zt - s
        if abs(s) < 0.06:
            y, z = s * 0.8, zt + 0.03 * math.cos(s / 0.06 * math.pi / 2)
        row = []
        for j in range(9):
            x = -L / 2 + L * j / 8
            wav = 0.025 * math.sin(x * 4 + t * 5) * min(1, abs(s) * 2)
            row.append(Vector((x, y + wav, max(z, 0.12))))
        P.append(row)
    mb.quad_strip_grid("rug", P, lambda i, j: (j / 8, i / ny))
    # the back side (so both faces show the rug; it is felt, the same both sides)
    Pb = [[v + Vector((0, 0.004 if (i / ny) >= 0.45 else -0.004, 0)) for v in row[::-1]] for i, row in enumerate(P)]
    mb.quad_strip_grid("rug", Pb, lambda i, j: (1 - j / 8, i / ny))


def tether(mb, rnd):
    L = 14.0
    for x in (0.0, L):
        log(mb, "log", (x, 0, -0.2), (x, 0, 0.55), 0.05, seg=6, wobble=0.03, caps=True, end_mat="logend", seed=x)
    pts = []
    for k in range(29):
        t = k / 28
        pts.append(Vector((L * t, 0.03 * math.sin(t * 17), 0.5 - 0.42 * math.sin(math.pi * t) ** 0.3)))
    for p0, p1 in zip(pts[:-1], pts[1:]):
        log(mb, "rope", p0, p1, 0.015, seg=4, wobble=0, caps=False)


def build():
    reset()
    prep_rug()
    M = mats()
    rnd = random.Random(7)
    objs = []
    for name, fn in (("woodpile", lambda mb: woodpile(mb, rnd)), ("block", lambda mb: block(mb, rnd)),
                     ("can_a", lambda mb: can(mb, 0.62)), ("can_b", lambda mb: can(mb, 0.48)), ("bucket", bucket),
                     ("hearth", lambda mb: hearth(mb, rnd)), ("cart", lambda mb: cart(mb, rnd)), ("rug", rug),
                     ("tether", lambda mb: tether(mb, rnd))):
        mb = MeshBuilder()
        fn(mb)
        parts = mb.build(name, M)
        print(f"  {name}: {sum(len(o.data.polygons) for o in parts)} faces")
        objs += parts
    bake_vertex_ao(objs, samples=24, dist=1.2)
    export("household", objs)


if __name__ == "__main__":
    build()
