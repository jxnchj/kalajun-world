"""Schrenk spruce (Picea schrenkiana): tall, narrow, columnar crown of short drooping branches.

Exports spruce_hi.glb (near LOD) and spruce_mid.glb (medium LOD), 18 m tall, base at z=0.
Materials: 'frond' (alpha card with needle sprays), 'core' (dark inner crown), 'bark'.
Vertex colour R = baked crown occlusion (dark inside / low, bright at branch tips and top).
"""
import math, random, sys, os
sys.path.insert(0, os.path.dirname(__file__))
from lib import *
from mathutils import Vector
from PIL import Image

H = 18.0


def crown_radius(z, z0=1.6, rmax=2.4):
    t = (z - z0) / (H - z0)
    if t < 0 or t > 1:
        return 0.0
    return rmax * ((1 - t) ** 0.85) * (0.9 + 0.1 * math.sin(t * 9)) + 0.15 * (1 - t)


def frond(mb, base, azim, length, droop, width, rnd, segs=4):
    """drooping branch ribbon with a shallow V-fold; UV v along the branch (0 at trunk)"""
    d = Vector((math.cos(azim), math.sin(azim), 0))
    side = Vector((-d.y, d.x, 0))
    pts = []
    for k in range(segs + 1):
        t = k / segs
        # droop along the branch, then a slight upturn at the tip
        dz = -droop * length * (t * t) + 0.12 * length * max(0, t - 0.75) * 4 * 0.3
        pts.append(Vector(base) + d * (0.08 + length * t) + Vector((0, 0, dz)))
    for fold in (-1, 1):
        P = []
        for k, p in enumerate(pts):
            t = k / segs
            w = width * (1 - 0.55 * t) * 0.5
            P.append([p, p + side * fold * w + Vector((0, 0, 0.18 * w))])
        # u across (0 centre -> 0.5 edge, mirrored), v along
        mb.quad_strip_grid("frond", P, lambda i, j: (0.5 + fold * 0.5 * j, i / segs) if fold > 0 else (0.5 - 0.5 * j, i / segs))


def skirt(mb, z, rc, teeth, rings, rnd, droop=0.55):
    """drooping tier: ring of pointed teeth from the trunk out to rc, edges hang down"""
    a0 = rnd.random() * 6.283
    tilt = Vector((rnd.uniform(-0.06, 0.06), rnd.uniform(-0.06, 0.06), 0))
    seg = teeth * 2
    P = []
    for i in range(rings + 1):
        t = i / rings
        row = []
        for j in range(seg + 1):
            a = a0 + j / seg * 6.2832
            jag = 1.0 if j % 2 == 1 else 0.82   # tooth tips vs notches
            r = 0.12 + (rc - 0.12) * t * (jag if t > 0.5 else 1.0) * (0.92 + 0.16 * math.sin(a * 3 + a0))
            dz = -droop * rc * (t ** 1.6) + 0.08 * rc * t * (1 - t)
            p = Vector((r * math.cos(a), r * math.sin(a), z + dz)) + tilt * r
            row.append(p)
        P.append(row)
    mb.quad_strip_grid("frond", P, lambda i, j: (j / 2.0, i / rings))


def build(name, dz, teeth, rings, core=True, seed=1):
    reset()
    bark_src = os.path.join(PH, "pine_bark", "textures", "pine_bark_diff_1k.jpg")
    bark = os.path.join(TEX, "bark.png")
    if not os.path.exists(bark):
        Image.open(bark_src).resize((512, 512)).save(bark)
    M = {
        "frond": material("frond", "spruce_skirt.png", alpha=True),
        "core": material("core", color=(0.03, 0.07, 0.05, 1)),
        "bark": material("bark", "bark.png"),
    }
    mb = MeshBuilder()
    rnd = random.Random(seed)
    log(mb, "bark", (0, 0, -0.3), (0, 0, H * 0.97), 0.3, seg=8, taper=0.85, wobble=0.03, uv_len=1.5, seed=seed, caps=False)
    z = H - 0.15
    while z > 1.7:
        rc = crown_radius(z) * 1.08 + 0.25
        skirt(mb, z, rc, teeth, rings, rnd, droop=rnd.uniform(0.5, 0.7))
        z -= dz * rnd.uniform(0.85, 1.15) * (1.0 if z < H - 3 else 0.7)
    if core:  # dark inner crown hides gaps between tiers
        prof = []
        for j in range(13):
            zz = 1.9 + (H - 2.4) * j / 12
            prof.append((crown_radius(zz) * 0.45, zz))
        P = []
        for r, zz in prof:
            P.append([Vector((r * math.cos(a), r * math.sin(a), zz)) for a in [q / 10 * 6.2832 for q in range(11)]])
        mb.quad_strip_grid("core", P, lambda i, j: (j / 10, i / 12))
    objs = mb.build(name, M)
    # crown occlusion: brighter toward the branch tips (radially) and the top
    for ob in objs:
        me = ob.data
        attr = me.color_attributes.new("Color", "FLOAT_COLOR", "POINT")
        for i, v in enumerate(me.vertices):
            p = v.co
            rc = max(crown_radius(p.z), 0.2)
            radial = min(1.0, math.hypot(p.x, p.y) / rc)
            ao = 0.35 + 0.55 * radial ** 1.3 + 0.1 * (p.z / H)
            if ob.name.endswith("bark"):
                ao = 0.45
            if ob.name.endswith("core"):
                ao = 0.3
            attr.data[i].color = (ao, ao, ao, 1)
    export(name, objs)


if __name__ == "__main__":
    build("spruce_hi", dz=0.5, teeth=11, rings=3, seed=11)
    build("spruce_mid", dz=0.85, teeth=8, rings=2, seed=11)
