"""Method 2 sample: a modelled meadow-grass clump (40 blades) + a few seed stalks.

Each blade is a tapered, V-folded ribbon (10 segments x 3 across) arching under its own
weight with a little twist; blades vary in length, lean, width and colour (fresh green,
yellow-green, a few dry straw blades). Baked vertex AO is multiplied by a root-to-tip
gradient so the clump is dark inside and bright at the tips. Exported as grass_hifi.glb
(unit clump ~0.5 m tall; scaled per instance).
"""
import math, random, sys, os
sys.path.insert(0, os.path.dirname(__file__))
from lib import *
from mathutils import Vector


def blade(mb, mat, root, yaw, length, width, lean, droop, twist, fold=0.25, segs=10):
    d = Vector((math.cos(yaw), math.sin(yaw), 0))
    s = Vector((-d.y, d.x, 0))
    P = []
    for i in range(segs + 1):
        t = i / segs
        # arching centre line: rises, leans out, droops at the tip
        c = root + Vector((0, 0, length * t)) + d * (lean * length * t * t) + Vector((0, 0, -droop * length * t ** 3))
        w = width * (1 - t) ** 0.7 * (0.6 + 0.4 * math.sin(min(1, t * 3) * math.pi / 2))
        a = twist * t
        sv = s * math.cos(a) + Vector((0, 0, 1)).cross(s) * 0 + d * math.sin(a) * 0.3
        mid = c + (d * -1 + Vector((0, 0, 0.2))).normalized() * w * fold  # V-fold: midrib sits back
        P.append([c - sv * w, mid, c + sv * w])
    mb.quad_strip_grid(mat, P, lambda i, j: (j / 2, i / segs))


def build():
    reset()
    M = {k: material(k, color=c) for k, c in {
        "g_fresh": (0.14, 0.33, 0.06, 1), "g_deep": (0.08, 0.23, 0.06, 1), "g_yellow": (0.27, 0.37, 0.08, 1),
        "g_dry": (0.46, 0.4, 0.21, 1), "g_seed": (0.52, 0.46, 0.25, 1)}.items()}
    mb = MeshBuilder()
    r = random.Random(4)
    for k in range(40):
        a = r.uniform(0, 6.283)
        rr = 0.035 * math.sqrt(r.random())
        root = Vector((math.cos(a) * rr, math.sin(a) * rr, 0))
        mat = r.choices(["g_fresh", "g_deep", "g_yellow", "g_dry"], [0.45, 0.3, 0.18, 0.07])[0]
        length = r.uniform(0.28, 0.55)
        blade(mb, mat, root, a + r.uniform(-0.6, 0.6), length, r.uniform(0.006, 0.01), lean=r.uniform(0.05, 0.6),
              droop=r.uniform(0.0, 0.35), twist=r.uniform(-1.2, 1.2))
    for k in range(3):  # seed stalks with small spikelets
        a = r.uniform(0, 6.283)
        root = Vector((math.cos(a) * 0.02, math.sin(a) * 0.02, 0))
        top = root + Vector((math.cos(a) * 0.08, math.sin(a) * 0.08, r.uniform(0.6, 0.75)))
        pts = [root + (top - root) * (i / 8) + Vector((0, 0, -0.03 * math.sin(i / 8 * math.pi))) for i in range(9)]
        from hifi_cosmos import tube, ribbon
        tube(mb, "g_seed", pts, 0.0022, 0.0012, sides=4)
        for j in range(10):
            t = 0.55 + 0.45 * j / 9
            p = pts[0] + (pts[-1] - pts[0]) * t
            for sg in (-1, 1):
                q = p + Vector((math.cos(a + sg * 1.2), math.sin(a + sg * 1.2), 0.6)).normalized() * 0.035 * (1.1 - t)
                ribbon(mb, "g_seed", [p, (p + q) / 2, q], 0.004, 0.0015)
    objs = mb.build("grass_hifi", M)
    bake_vertex_ao(objs, samples=24, dist=0.12, ground=True)
    for ob in objs:  # root-to-tip gradient on top of AO
        me = ob.data
        attr = me.color_attributes["Color"]
        for i, v in enumerate(me.vertices):
            g = 0.6 + 0.4 * min(1.0, v.co.z / 0.45)
            c = attr.data[i].color
            attr.data[i].color = (c[0] * g, c[1] * g, c[2] * g, 1)
    print("faces", sum(len(o.data.polygons) for o in objs))
    export("grass_hifi", objs)


if __name__ == "__main__":
    build()
