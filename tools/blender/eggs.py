"""The (few, quiet) Zelda easter eggs of the scene (web/public/assets/eggs.glb):

  korok    a Korok, ~0.35 m: a round little wooden body, a leaf for a mask with two eye holes and
           a mouth hole, a twig with a sprout on its head, stick arms and legs. Facing -Y.
  monolith an old Sheikah-style standing stone, ~1.9 m: a tapered slate slab with a rounded top,
           an eye with a tear and three lashes carved on its face ('glyph', which glows faintly
           teal, more at night), moss on the top (web material). Face toward -Y.

Run: tools/.bpy/bin/python tools/blender/eggs.py
"""
import math, os, random, sys
sys.path.insert(0, os.path.dirname(__file__))
from lib import *
from mathutils import Vector, Matrix
import bpy, bmesh


def sphere(mb, mat, c, r, seg=12, rings=8):
    for i in range(rings):
        t0, t1 = math.pi * i / rings, math.pi * (i + 1) / rings
        for j in range(seg):
            a0, a1 = 2 * math.pi * j / seg, 2 * math.pi * (j + 1) / seg
            p = lambda t, a: Vector(c) + Vector((math.sin(t) * math.cos(a) * r[0], math.sin(t) * math.sin(a) * r[1], math.cos(t) * r[2]))
            mb.add(mat, [p(t0, a0), p(t1, a0), p(t1, a1), p(t0, a1)], [(0, 1, 2, 3)], [[(j / seg, i / rings), (j / seg, (i + 1) / rings), ((j + 1) / seg, (i + 1) / rings), ((j + 1) / seg, i / rings)]])


def disc(mb, mat, c, rx, rz, y, seg=14):
    """flat ellipse facing -Y at depth y (eye and mouth holes on the mask)"""
    V = [Vector((c[0], y, c[1]))] + [Vector((c[0] + rx * math.cos(a), y, c[1] + rz * math.sin(a))) for a in [k / seg * 2 * math.pi for k in range(seg)]]
    mb.add(mat, V, [(0, 1 + (k + 1) % seg, 1 + k) for k in range(seg)], [[(0.5, 0.5), (0, 0), (1, 0)] for k in range(seg)])


def korok(mb):
    sphere(mb, "korokbody", (0, 0, 0.17), (0.095, 0.09, 0.1))
    # the leaf mask: a broad rounded leaf with a pointed tip, slightly cupped, in front of the face
    P = []
    for i in range(9):
        t = i / 8
        row = []
        for j in range(9):
            s = j / 8 * 2 - 1
            w = 0.1 * math.sin(math.pi * min(1, t * 1.15)) ** 0.8          # leaf outline
            z = 0.07 + 0.22 * t
            x = s * w
            row.append(Vector((x, -0.1 - 0.02 * (1 - s * s) - 0.015 * t, z)))
        P.append(row)
    mb.quad_strip_grid("korokleaf", P, lambda i, j: (j / 8, i / 8))
    for s in (-1, 1):
        disc(mb, "korokeye", (s * 0.035, 0.2), 0.02, 0.024, -0.132)
        disc(mb, "korokpupil", (s * 0.035 + 0.004, 0.205), 0.005, 0.005, -0.1335, seg=6)
    disc(mb, "korokeye", (0, 0.13), 0.014, 0.01, -0.13)
    # twig with a sprout on the head
    log(mb, "koroktwig", (0.0, 0.0, 0.25), (0.02, 0.01, 0.4), 0.007, seg=5, wobble=0.1, caps=True)
    for s in (-1, 1):
        a = s * 0.7
        c = Vector((0.02, 0.01, 0.4))
        V = [c, c + Vector((math.sin(a) * 0.03, -0.01, 0.02)), c + Vector((math.sin(a) * 0.06, 0, 0.012)), c + Vector((math.sin(a) * 0.03, 0.01, 0.0))]
        mb.add("korokleaf", V, [(0, 1, 2, 3)], [[(0, 0), (0.5, 0.2), (1, 0.5), (0.5, 0.8)]])
    for s in (-1, 1):   # stick arms and legs
        log(mb, "koroktwig", (s * 0.08, -0.02, 0.17), (s * 0.15, -0.06, 0.1), 0.008, seg=5, wobble=0.05, caps=True)
        log(mb, "koroktwig", (s * 0.04, 0.0, 0.09), (s * 0.05, -0.02, 0.0), 0.009, seg=5, wobble=0.05, caps=True)


def monolith(mb, rnd):
    # tapered slab, rounded top, chamfered edges, slight lean and irregularity
    W, D, H = 0.95, 0.42, 1.9
    rows = []
    n = 14
    for i in range(n + 1):
        t = i / n
        z = t * H
        taper = 1 - 0.18 * t
        top = 1.0 if t < 0.82 else max(0.0, math.cos(min(1.0, (t - 0.82) / 0.18) * math.pi / 2)) ** 0.6   # rounded top
        w, d = W / 2 * taper * max(top, 0.05), D / 2 * taper * (0.85 + 0.15 * max(top, 0.3))
        ring = []
        for k in range(24):
            a = k / 24 * 2 * math.pi
            # superellipse: flat faces, rounded edges
            cx, cy = math.cos(a), math.sin(a)
            ex = math.copysign(abs(cx) ** 0.35, cx)
            ey = math.copysign(abs(cy) ** 0.35, cy)
            wob = 1 + 0.03 * math.sin(a * 3 + t * 5 + 1.3) + rnd.uniform(-0.01, 0.01)
            ring.append(Vector((ex * w * wob + 0.03 * t, ey * d * wob, z)))
        rows.append(ring + [ring[0]])
    mb.quad_strip_grid("slate", rows, lambda i, j: (j / 24 * 2, i / n * 2))
    # sunk into the ground a little
    # the glyph: an eye (almond outline), iris, tear, three lashes -- thin strips on the -Y face
    y = -D / 2 * (1 - 0.18 * 0.55) - 0.012
    cz = 1.05
    def strip(pts, wdt):
        P = []
        for i, (x, z) in enumerate(pts):
            a = pts[min(i + 1, len(pts) - 1)]
            b = pts[max(i - 1, 0)]
            tx, tz = a[0] - b[0], a[1] - b[1]
            l = math.hypot(tx, tz) or 1
            nx, nz = -tz / l * wdt / 2, tx / l * wdt / 2
            P.append([Vector((x - nx, y, z - nz)), Vector((x + nx, y, z + nz))])
        mb.quad_strip_grid("glyph", P, lambda i, j: (i / (len(pts) - 1), j))
    for s in (1, -1):   # the two lids
        strip([(0.24 * math.cos(math.pi * k / 16) * -1, cz + s * 0.11 * math.sin(math.pi * k / 16)) for k in range(17)], 0.022)
    strip([(0.06 * math.cos(a), cz + 0.06 * math.sin(a)) for a in [k / 20 * 2 * math.pi for k in range(21)]], 0.02)   # iris
    strip([(0.0, cz - 0.13), (0.012, cz - 0.17), (0.0, cz - 0.23), (-0.012, cz - 0.17), (0.0, cz - 0.13)], 0.018)       # tear
    for k in (-1, 0, 1):   # lashes
        strip([(k * 0.1, cz + 0.13 - abs(k) * 0.015), (k * 0.14, cz + 0.22 - abs(k) * 0.03)], 0.018)


def build():
    reset()
    M = {"korokbody": material("korokbody", color=(0.3, 0.19, 0.09, 1)), "korokleaf": material("korokleaf", color=(0.28, 0.5, 0.1, 1)),
         "korokeye": material("korokeye", color=(0.02, 0.02, 0.015, 1)), "korokpupil": material("korokpupil", color=(0.9, 0.9, 0.85, 1)),
         "koroktwig": material("koroktwig", color=(0.25, 0.16, 0.08, 1)),
         "slate": material("slate", color=(0.2, 0.21, 0.22, 1)), "glyph": material("glyph", color=(0.3, 0.85, 0.9, 1))}
    rnd = random.Random(3)
    objs = []
    mb = MeshBuilder(); korok(mb); objs += mb.build("korok", M)
    mb = MeshBuilder(); monolith(mb, rnd); objs += mb.build("monolith", M)
    for o in objs:
        print(" ", o.name, len(o.data.polygons))
    export("eggs", objs)


if __name__ == "__main__":
    build()
