"""Pastoral farmstead pieces for the pre-tourism layout (traced from 2013 imagery):
two small herder houses (log walls, shingle roofs, no porch or a small one), a long low
sheep shed with an open front, and haystacks (a tall rounded stack and a long loaf).

Front faces -Y, floor at z=0, same conventions as cabin.py.
Usage: python farm.py [house|barn|hay|all]
"""
import math, random, sys, os
sys.path.insert(0, os.path.dirname(__file__))
from lib import *
from mathutils import Vector, Matrix
import cabin


def barn(name, w=16.0, d=6.0, seed=3):
    """sheep shed: log back and side walls, open front on posts behind a plank half-wall,
    lean-to shingle roof falling to the front"""
    reset()
    M = cabin.mats()
    mb = MeshBuilder()
    rnd = random.Random(seed)
    r, s = 0.15, 0.27
    zb, zf = 2.45, 1.85            # wall top at the back and at the front
    # back wall
    z = r
    while z < zb - 0.05:
        log(mb, "log", (-w / 2 - 0.3, d / 2, z), (w / 2 + 0.3, d / 2, z), r * rnd.uniform(0.93, 1.07), seg=9, seed=rnd.random(), end_mat="logend")
        z += s
    # side walls: logs get shorter above the front height (they follow the roof)
    for x in (-w / 2, w / 2):
        z = r + s / 2
        while z < zb - 0.05:
            yf = -d / 2 if z < zf else -d / 2 + (z - zf) / (zb - zf) * d
            if d / 2 - yf > 0.4:
                log(mb, "log", (x, yf - 0.25, z), (x, d / 2 + 0.3, z), r * rnd.uniform(0.93, 1.07), seg=9, seed=rnd.random(), end_mat="logend")
            z += s
    # front posts, top beam, plank half-wall with a gate gap
    npost = max(3, round(w / 3.0) + 1)
    xs = [-w / 2 + w * i / (npost - 1) for i in range(npost)]
    for x in xs:
        log(mb, "log", (x, -d / 2, -0.2), (x, -d / 2, zf), 0.11, seg=8, seed=rnd.random(), end_mat="logend")
    log(mb, "log", (-w / 2 - 0.35, -d / 2, zf + 0.05), (w / 2 + 0.35, -d / 2, zf + 0.05), 0.13, seg=9, seed=rnd.random(), end_mat="logend")
    gate = len(xs) // 2
    for i, (a, b) in enumerate(zip(xs[:-1], xs[1:])):
        if i == gate - 1:
            continue
        for k in range(3):
            plank(mb, "plank", ((a + b) / 2, -d / 2 - 0.05, 0.25 + k * 0.3), b - a - 0.1, 0.26, 0.05,
                  rot=Matrix.Rotation(math.pi / 2, 3, "X"), seed=rnd.random())
    # a hay rack along the inside back wall, seen through the open front
    box(mb, "plank", (0, d / 2 - 0.5, 0.9), (w - 1.0, 0.6, 0.08), uv_scale=0.5)
    # rafters, boards and shingles
    y0, y1 = d / 2 + 0.45, -d / 2 - 0.7
    z0 = zb + 0.18 + 0.45 * (zb - zf) / d
    z1 = zf + 0.18 - 0.7 * (zb - zf) / d
    for x in xs[::1]:
        log(mb, "log", (x, y0, z0 - 0.1), (x, y1, z1 - 0.1), 0.07, seg=6, seed=rnd.random(), end_mat="logend")
    sl = math.hypot(y0 - y1, z0 - z1)
    ang = math.atan2(z0 - z1, y0 - y1)
    box(mb, "plank", (0, (y0 + y1) / 2, (z0 + z1) / 2), (w + 0.9, sl, 0.08), rot=Matrix.Rotation(ang, 3, "X"), uv_scale=0.5)
    cabin.shingle_slope(mb, -w / 2 - 0.45, w / 2 + 0.45, y0, y1, z0, z1, rnd, lift=0.05)
    box(mb, "plank", (0, y1, z1 - 0.03), (w + 0.95, 0.06, 0.22), uv_scale=0.5)
    box(mb, "plank", (0, y0, z0 - 0.03), (w + 0.95, 0.06, 0.22), uv_scale=0.5)
    # trampled earth floor + turf bank below for slopes
    box(mb, "sod", (0, 0, -1.25), (w + 0.4, d + 0.4, 2.2), uv_scale=0.5)
    objs = mb.build(name, M)
    bake_vertex_ao(objs, samples=32, dist=2.5)
    export(name, objs)


def haystacks():
    """'stack': rounded tall stack with a pole (~3.4 m); 'loaf': long stack (7 x 2.6 m)"""
    reset()
    M = {"straw": material("straw", "straw.png"), "log": material("log", "wood_log.png"), "logend": material("logend", "wood_end.png")}
    objs = []

    def lathe(mb, prof, sx=1.0, seed=0, nseg=28):
        rnd = random.Random(seed)
        ph = [rnd.random() * 6.28 for _ in range(4)]
        P = []
        for i, (rad, z) in enumerate(prof):
            row = []
            for j in range(nseg + 1):
                a = j / nseg * 2 * math.pi
                # lumpy, slumped, windblown
                k = 1 + 0.06 * math.sin(3 * a + ph[0] + z) + 0.04 * math.sin(7 * a + ph[1]) + 0.05 * math.sin(z * 2.3 + ph[2])
                row.append(Vector((math.cos(a) * rad * k * sx, math.sin(a) * rad * k, z + 0.05 * math.sin(5 * a + ph[3]) * (rad > 0.3))))
            P.append(row)
        mb.quad_strip_grid("straw", P, lambda i, j: (j / nseg * 3.0 * sx, prof[i][1] / 1.6))

    mb = MeshBuilder()
    prof = [(1.45, -0.3), (1.62, 0.25), (1.72, 0.8), (1.66, 1.4), (1.45, 2.0), (1.1, 2.55), (0.68, 3.0), (0.3, 3.3), (0.05, 3.42)]
    lathe(mb, prof, seed=1)
    log(mb, "log", (0.02, 0.0, 2.9), (0.08, 0.04, 4.1), 0.045, seg=6, wobble=0.1, seed=2, end_mat="logend")
    objs += mb.build("stack", M)
    mb = MeshBuilder()
    prof = [(1.2, -0.3), (1.32, 0.3), (1.3, 0.9), (1.15, 1.5), (0.8, 2.0), (0.35, 2.35), (0.05, 2.45)]
    lathe(mb, prof, sx=2.6, seed=3)
    objs += mb.build("loaf", M)
    bake_vertex_ao(objs, samples=24, dist=2.0)
    export("haystack", objs)


if __name__ == "__main__":
    which = sys.argv[-1]
    if which in ("house", "all"):
        cabin.build("house_a", 7.2, 5.0, rows=8, pitch_deg=24, porch=0.0, front_windows=[-2.0], doors=[1.0],
                    back_windows=[0.0], side_windows=False, lanterns=[1.9], seed=11)
        cabin.build("house_b", 9.6, 5.6, rows=8, pitch_deg=28, porch=1.6, front_windows=[-2.8, 2.6], doors=[0.0],
                    back_windows=[-2.0, 2.0], lanterns=[1.0], seed=12)
    if which in ("barn", "all"):
        barn("barn", 16.0, 6.0)
    if which in ("hay", "all"):
        haystacks()
