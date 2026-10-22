"""Kazakh yurt (kiiz üi): felt walls over a lattice, curved roof over radial poles with the
shanyrak crown, ornament bands, tie ropes, painted door. Door faces -Y. Floor z=0.

It can be entered. The two painted door leaves are objects of their own under empties at their
hinges (<name>_door<i>_out: they swing outward; web/src/slice.js Doors). Inside, as in a herder's
summer yurt: the red lattice wall (kerege) over reed screens (shi), the red roof poles (uyk) under
the felt rising to the crown, a woven band round the top of the lattice, wall carpets behind the
place of honour (tor); felt on the floor and rugs over it; the chest with the folded quilts and
pillows stacked on it at the back, a bed on the left, the kitchen cupboard with the kettle on the
right, the iron stove under the stovepipe, a low round table with cushions. The linings face
inward (wound by hand), and the sky each vertex sees is baked for the light inside.
"""
import math, random, sys, os
sys.path.insert(0, os.path.dirname(__file__))
from lib import *
from mathutils import Vector, Matrix


def mats():
    return {
        "felt": material("felt", "felt.png"),
        "band": material("band", "yurt_band_ai.png"),     # AI ram's-horn band (tools/prep_yurt_textures.py)
        "chiy": material("chiy", "chiy.png"),
        "iron": material("iron", color=(0.09, 0.085, 0.08, 1)),
        "door": material("door", "yurt_door.png"),
        "plank": material("plank", "wood_plank.png"),
        "log": material("log", "wood_log.png"),
        "rope": material("rope", color=(0.55, 0.45, 0.32, 1)),
        "orange": material("orangewood", color=(0.72, 0.28, 0.08, 1)),
        "stone": material("stone", "stone.png"),
        "plinth": material("plinth", "stone.png"),   # the levelled platform's stone face (shows where the ground falls away)
        # inside
        "felt_in": material("felt_in", "felt.png"),
        "chiy_in": material("chiy_in", "chiy.png"),
        "band_in": material("band_in", "yurt_band_ai.png"),
        "rug_in": material("rug_in", "rug_t09.png"),
        "floorfelt": material("floorfelt", "felt.png"),
        "rug": material("rug", "rug_t09.png"),
        "quilt_r": material("quilt_r", color=(0.36, 0.06, 0.05, 1)),
        "quilt_g": material("quilt_g", color=(0.07, 0.2, 0.11, 1)),
        "quilt_y": material("quilt_y", color=(0.5, 0.36, 0.09, 1)),
        "quilt_b": material("quilt_b", color=(0.08, 0.1, 0.26, 1)),
        "chest": material("chest", color=(0.42, 0.1, 0.05, 1)),
    }


INWARD = {"felt_in", "chiy_in", "band_in", "rug_in", "floorfelt", "door"}   # wound by hand (faces toward the inside)
FIXED_WINDING.update(INWARD | {"plinth"})


def inner(mb, mat, profile, **kw):
    """a surface of revolution facing the axis (the lining seen from inside): the profile reversed"""
    return lathe(mb, mat, list(reversed(profile)), **{**kw, "uvv": list(reversed(kw["uvv"])) if kw.get("uvv") else [1 - i / (len(profile) - 1) for i in range(len(profile))]})


def disk(mb, mat, r, z, seg=48, uv=0.35):
    """a flat round floor facing up"""
    V = [Vector((0, 0, z))] + [Vector((r * math.sin(j / seg * 2 * math.pi), -r * math.cos(j / seg * 2 * math.pi), z)) for j in range(seg)]
    F = [(0, 1 + j, 1 + (j + 1) % seg) for j in range(seg)]
    U = [[(V[i].x * uv, V[i].y * uv) for i in f] for f in F]
    mb.add(mat, V, F, U)


def interior(mb, R, hw, zc, r_top, roof, door_half, px, py, rnd):
    """the lining, the frame seen from inside and the household (see the module doc)"""
    gap = door_half + 0.03   # (the linings end behind the jambs: no slit beside the door)
    # reed screens behind the lattice, the felt under the roof
    inner(mb, "chiy_in", [(R - 0.035, 0.02), (R - 0.035, hw)], seg=44, uv_u=14, theta0=gap, theta1=2 * math.pi - gap, uvv=[1.0, 0.0])
    t0 = (roof[0][0] - (R - 0.04)) / (roof[0][0] - roof[-1][0])
    lin = []
    for k in range(9):
        t = t0 + (1 - t0) * k / 8
        i = min(9, int(t * 10)); f = t * 10 - i
        r = roof[i][0] + (roof[i + 1][0] - roof[i][0]) * f
        z = roof[i][1] + (roof[i + 1][1] - roof[i][1]) * f
        lin.append((r, z - 0.045))
    # (down to the head of the reed screen: the outer shell is one-sided, no slit to see out by)
    inner(mb, "felt_in", [(R - 0.035, hw - 0.03)] + lin, seg=56, uv_u=7)
    # the lattice: laths crossing in diamonds, red-painted
    rl = R - 0.07
    n = int(2 * math.pi * rl / 0.34)
    span = (hw - 0.1) / rl
    for k in range(n):
        a0 = k / n * 2 * math.pi
        for sgn in (1, -1):
            pts = [(a0 + sgn * span * q / 6, 0.06 + (hw - 0.12) * q / 6) for q in range(7)]
            for (aa, za), (ab, zb) in zip(pts[:-1], pts[1:]):
                am = ((aa + ab) / 2) % (2 * math.pi)
                if am < gap or am > 2 * math.pi - gap:
                    continue
                log(mb, "orange", (rl * math.sin(aa), -rl * math.cos(aa), za), (rl * math.sin(ab), -rl * math.cos(ab), zb), 0.014, seg=4, wobble=0, caps=False)
    # the roof poles, from the lattice head to the crown ring, under the felt
    npole = 56
    for k in range(npole):
        a = (k + 0.5) / npole * 2 * math.pi
        pts = [Vector(((r - 0.01) * math.sin(a), -(r - 0.01) * math.cos(a), z - 0.035)) for r, z in lin]
        pts[0] = Vector((rl * math.sin(a), -rl * math.cos(a), hw - 0.02))
        for p0, p1 in zip(pts[:-1], pts[1:]):
            log(mb, "orange", p0, p1, 0.022, seg=5, wobble=0, caps=False)
    # the woven band round the head of the lattice
    inner(mb, "band_in", [(R - 0.1, hw - 0.3), (R - 0.1, hw - 0.06)], seg=44, uv_u=8, theta0=gap, theta1=2 * math.pi - gap, uvv=[0.9, 0.1])
    # wall carpets behind the place of honour (the back, +Y)
    for a0, a1 in ((math.pi - 0.62, math.pi - 0.05), (math.pi + 0.05, math.pi + 0.62)):
        inner(mb, "rug_in", [(R - 0.13, 0.55), (R - 0.13, 1.6)], seg=10, uv_u=1.2, theta0=a0, theta1=a1, uvv=[0.0, 1.0])
    # felt over the floor, rugs on it
    disk(mb, "floorfelt", R - 0.03, 0.02)
    box(mb, "rug", (0, 0.35, 0.035), (2.6, 1.8, 0.012), uv_scale=0.35)
    box(mb, "rug", (-1.3, -0.4, 0.035), (1.0, 1.9, 0.012), rot=rotz(0.25), uv_scale=0.35)
    box(mb, "rug", (1.45, -0.2, 0.034), (1.1, 2.1, 0.012), rot=rotz(-0.3), uv_scale=0.35)
    # the place of honour: the chest at the back with the quilts and pillows stacked on it
    cy = R - 0.62
    box(mb, "chest", (0, cy, 0.3), (1.2, 0.6, 0.56))
    box(mb, "iron", (0, cy - 0.31, 0.32), (1.12, 0.012, 0.05))
    z = 0.58
    cols = ["quilt_r", "quilt_g", "quilt_y", "quilt_b", "quilt_r", "quilt_y", "quilt_g"]
    for k in range(6):
        t = rnd.uniform(0.09, 0.13)
        box(mb, cols[(k + rnd.randrange(2)) % len(cols)], (rnd.uniform(-0.03, 0.03), cy, z + t / 2), (1.15 + rnd.uniform(-0.05, 0.05), 0.56, t))
        z += t
    for k in range(3):
        box(mb, ["quilt_y", "quilt_r", "quilt_b"][k], (-0.36 + k * 0.36, cy, z + 0.08), (0.34, 0.3, 0.16))
    box(mb, "rug", (0, cy - 0.02, z + 0.2), (1.25, 0.62, 0.03), uv_scale=0.4)
    # a bed on the left (seen from the door), along the wall, a quilt and a pillow on it
    a = -math.pi / 2 - 0.15
    bx, by = (R - 0.75) * math.sin(a), -(R - 0.75) * math.cos(a)
    rot = rotz(a)
    box(mb, "plank", (bx, by, 0.2), (0.85, 1.9, 0.36), rot=rot, uv_scale=0.5)
    box(mb, "quilt_r", (bx, by, 0.43), (0.82, 1.85, 0.1), rot=rot)
    pv = rot @ Vector((0, 0.7, 0))
    box(mb, "quilt_y", (bx + pv.x, by + pv.y, 0.53), (0.5, 0.35, 0.12), rot=rot)
    # the kitchen on the right: the cupboard, the kettle on it, a pot
    a = math.pi / 2 + 0.55
    kx, ky = (R - 0.45) * math.sin(a), -(R - 0.45) * math.cos(a)
    # (a painted cupboard on short legs, its back to the lattice: two doors painted like the yurt's,
    # a cornice, iron knobs; in its own frame x runs along the wall, +y faces the hearth)
    rk = rotz(a)
    L = lambda x, y, z: tuple(Vector((kx, ky, 0.0)) + rk @ Vector((x, y, z)))
    box(mb, "chest", L(0, 0, 0.62), (0.95, 0.45, 0.9), rot=rk)
    for sx_ in (-1, 1):
        for sy_ in (-1, 1):
            box(mb, "orange", L(sx_ * 0.42, sy_ * 0.18, 0.085), (0.06, 0.06, 0.17), rot=rk)
    box(mb, "orange", L(0, 0, 0.19), (0.97, 0.47, 0.05), rot=rk)
    box(mb, "orange", L(0, 0.01, 1.1), (1.03, 0.51, 0.07), rot=rk)
    V = [Vector(L(x, 0.227, z)) for x, z in ((-0.44, 0.23), (0.44, 0.23), (0.44, 1.02), (-0.44, 1.02))]
    mb.add("door", V, [(0, 3, 2, 1)], [[(1.0, 1.0), (1.0, 0.0), (0.0, 0.0), (0.0, 1.0)]])
    box(mb, "orange", L(0, 0.232, 0.625), (0.03, 0.012, 0.8), rot=rk)
    for sx_ in (-1, 1):
        box(mb, "iron", L(sx_ * 0.06, 0.24, 0.63), (0.025, 0.02, 0.045), rot=rk)
    log(mb, "iron", (kx, ky, 1.135), (kx, ky, 1.355), 0.11, seg=10)
    log(mb, "iron", (kx, ky, 1.355), (kx, ky, 1.395), 0.05, seg=8)
    log(mb, "iron", L(-0.74, 0.08, 0.02), L(-0.74, 0.08, 0.28), 0.17, seg=12)
    # the iron stove under the pipe, a kettle on it
    box(mb, "iron", (px, py, 0.27), (0.55, 0.45, 0.5))
    box(mb, "iron", (px, py - 0.23, 0.2), (0.22, 0.01, 0.16))
    log(mb, "iron", (px - 0.12, py - 0.05, 0.52), (px - 0.12, py - 0.05, 0.66), 0.09, seg=10)
    # the low round table before the place of honour, cushions round it
    tx, ty = 0.0, 1.1
    log(mb, "plank", (tx, ty, 0.3), (tx, ty, 0.34), 0.52, seg=18)
    for q in (0.4, 2.5, 4.6):
        log(mb, "plank", (tx + 0.32 * math.cos(q), ty + 0.32 * math.sin(q), 0.03), (tx + 0.32 * math.cos(q), ty + 0.32 * math.sin(q), 0.3), 0.03, seg=6, caps=False)
    for q, col in ((0.3, "quilt_r"), (2.8, "quilt_b"), (math.pi + 0.9, "quilt_g")):
        box(mb, col, (tx + 0.85 * math.cos(q), ty + 0.85 * math.sin(q), 0.07), (0.45, 0.45, 0.09), rot=rotz(q))


def lathe(mb, mat, profile, seg=48, uv_u=4.0, ripple=0, ripple_amp=0.0, theta0=0.0, theta1=2 * math.pi, uvv=None):
    """revolve (r, z) profile around Z; optional radial ripple (roof poles under felt)"""
    P = []
    for (r, z) in profile:
        row = []
        for j in range(seg + 1):
            a = theta0 + (theta1 - theta0) * j / seg
            rr = r * (1 + ripple_amp * (1 - abs(math.cos(a * ripple / 2))) if ripple else 1)
            row.append(Vector((rr * math.sin(a), -rr * math.cos(a), z)))
        P.append(row)
    rows = len(profile)
    vv = uvv or [i / (rows - 1) for i in range(rows)]
    mb.quad_strip_grid(mat, P, lambda i, j: (j / seg * uv_u, vv[i]))
    return P


def build(name, R=3.2, hw=1.7, rise=1.55, deck=False, seed=1):
    reset()
    M = mats()
    mb = MeshBuilder()
    rnd = random.Random(seed)
    door_half = math.atan2(0.55, R)  # door opening half-angle (door centred on -Y, angle 0)
    # felt wall with a slight outward bulge; leave the door opening
    # in summer the lowest felt is rolled up: the chiy reed screen shows below the roll
    z0 = 0.5
    prof = [(R * (1 + 0.012 * math.sin(math.pi * k / 6)), z0 + (hw - z0) * k / 6) for k in range(7)]
    lathe(mb, "felt", prof, seg=44, uv_u=6, theta0=door_half, theta1=2 * math.pi - door_half)
    lathe(mb, "chiy", [(R * 0.995, 0.02), (R * 0.995, z0 + 0.02)], seg=44, uv_u=14, theta0=door_half, theta1=2 * math.pi - door_half, uvv=[1.0, 0.0])
    roll = [(R * 1.0 + 0.05 + 0.07 * math.cos(a), z0 + 0.02 + 0.07 * math.sin(a)) for a in [k / 8 * 2 * math.pi - math.pi / 2 for k in range(9)]]
    P = lathe(mb, "felt", roll, seg=44, uv_u=6, theta0=door_half, theta1=2 * math.pi - door_half)
    for j in (0, 44):   # the roll's ends at the door, closed (they stand a little proud of the jambs)
        ring = [P[i][j] for i in range(8)]
        mb.add("felt", ring, [tuple(range(8))], [[(0.5 + 0.5 * math.cos(k / 8 * 2 * math.pi), 0.5 + 0.5 * math.sin(k / 8 * 2 * math.pi)) for k in range(8)]])
    # ornament band near the wall top and a narrow one at the bottom
    lathe(mb, "band", [(R * 1.013, hw * 0.66), (R * 1.013, hw * 0.9)], seg=44, uv_u=7, theta0=door_half, theta1=2 * math.pi - door_half, uvv=[0.9, 0.1])
    lathe(mb, "band", [(R * 1.012, z0 + 0.12), (R * 1.012, z0 + 0.24)], seg=44, uv_u=12, theta0=door_half, theta1=2 * math.pi - door_half, uvv=[0.9, 0.1])
    # tie ropes around the wall (slightly sagging bands)
    for z in (hw * 0.35, hw * 0.55, hw * 0.96):
        lathe(mb, "rope", [(R * 1.02, z - 0.02), (R * 1.025, z), (R * 1.02, z + 0.02)], seg=44, uv_u=1, theta0=door_half, theta1=2 * math.pi - door_half)
    # roof: from the eave (overhanging lip) up to the crown ring, slightly convex; pole ripples
    r_top, zc = 0.62, hw + rise
    roof = []
    for k in range(11):
        t = k / 10
        r = R * 1.07 + (r_top - R * 1.07) * t
        z = hw - 0.08 + (zc - hw + 0.08) * (t + 0.18 * math.sin(math.pi * t))  # convex dome
        roof.append((r, z))
    lathe(mb, "felt", roof, seg=64, uv_u=8, ripple=40, ripple_amp=0.012)
    # eave lip hanging down
    lathe(mb, "felt", [(R * 1.07, hw - 0.08), (R * 1.075, hw - 0.28)], seg=64, uv_u=8)
    # roof ornament band
    lathe(mb, "band", [(roof[3][0] + 0.03, roof[3][1] + 0.02), (roof[2][0] + 0.03, roof[2][1] + 0.02)], seg=64, uv_u=9, uvv=[0.9, 0.1])
    # radial roof ropes (8), draped over the felt
    for k in range(8):
        a = k / 8 * 2 * math.pi + math.pi / 8
        pts = [Vector((r * math.sin(a), -r * math.cos(a), z + 0.035)) for r, z in roof]
        for p0, p1 in zip(pts[:-1], pts[1:]):
            log(mb, "rope", p0, p1, 0.022, seg=5, wobble=0.0, caps=False)
    # shanyrak: crown ring + arched cross bars + small felt cap
    for rr, zz, th in ((r_top, zc, 0.07), (r_top * 0.95, zc + 0.08, 0.05)):
        n = 24
        for j in range(n):
            a0, a1 = j / n * 2 * math.pi, (j + 1) / n * 2 * math.pi
            log(mb, "orange", (rr * math.sin(a0), -rr * math.cos(a0), zz), (rr * math.sin(a1), -rr * math.cos(a1), zz), th, seg=6, wobble=0, caps=False)
    for a in (0, math.pi / 2):
        pts = []
        for k in range(9):
            t = k / 8 * 2 - 1
            pts.append(Vector((t * r_top * math.cos(a), t * r_top * math.sin(a), zc + 0.1 + 0.28 * (1 - t * t))))
        for p0, p1 in zip(pts[:-1], pts[1:]):
            log(mb, "orange", p0, p1, 0.035, seg=6, wobble=0, caps=False)
    lathe(mb, "felt", [(r_top * 0.98, zc + 0.12), (r_top * 0.55, zc + 0.36), (0.02, zc + 0.42)], seg=32, uv_u=3,
          theta0=math.pi * 0.15, theta1=math.pi * 1.85)  # felt flap (tunduk), folded back at the front
    # tin stovepipe up through the crown from the stove, a little off-centre, with a small rain cap
    px, py = 0.22, 0.18
    log(mb, "iron", (px, py, 0.52), (px, py, zc + 1.05), 0.065, seg=10, rings=8, wobble=0.0, caps=False)
    cap = [(0.02, zc + 1.2), (0.16, zc + 1.12), (0.16, zc + 1.1)]
    P = [[Vector((px + r * math.cos(j / 12 * 2 * math.pi), py + r * math.sin(j / 12 * 2 * math.pi), z)) for j in range(13)] for r, z in cap]
    mb.quad_strip_grid("iron", P, lambda i, j: (j / 12, i / 2))
    # door frame + painted double door
    dw, dh = 1.1, 1.55
    y = -R * math.cos(door_half)
    for sx in (-1, 1):
        box(mb, "orange", (sx * (dw / 2 + 0.07), y, dh / 2), (0.14, 0.2, dh + 0.1), uv_scale=0.5)
    box(mb, "orange", (0, y, dh + 0.08), (dw + 0.36, 0.22, 0.16), uv_scale=0.5)
    box(mb, "orange", (0, y, 0.04), (dw + 0.28, 0.24, 0.08), uv_scale=0.5)
    # two painted door leaves, each its own object round its hinge at the frame (front and back
    # faces painted, a board between); they open outward
    leaves = []
    for sx in (-1, 1):
        dm = MeshBuilder()
        hx = sx * dw / 2                       # the hinge, at this leaf's jamb
        x0, x1 = sorted((0.0, -sx * (dw / 2 - 0.005)))
        u0, u1 = (0.5, 1.0) if sx > 0 else (0.0, 0.5)
        box(dm, "orange", ((x0 + x1) / 2, 0, (0.08 + dh) / 2), (x1 - x0, 0.05, dh - 0.08), uv_scale=0.5)
        for yy, flip in ((-0.03, False), (0.03, True)):
            V = [Vector((x0, yy, 0.08)), Vector((x1, yy, 0.08)), Vector((x1, yy, dh)), Vector((x0, yy, dh))]
            f = (0, 3, 2, 1) if flip else (0, 1, 2, 3)
            uv = [(u0, 1.0), (u1, 1.0), (u1, 0.0), (u0, 0.0)] if sx > 0 else [(u1, 1.0), (u0, 1.0), (u0, 0.0), (u1, 0.0)]
            dm.add("door", V, [f], [[uv[i] for i in f]])
        leaves.append((dm, Vector((hx, y, 0.0))))
    # base: stones around the bottom edge, or a plank deck with steps
    if deck:
        n = 28
        rd = R + 1.1
        for k in range(int(2 * rd / 0.22)):
            yy = -rd + (k + 0.5) * 0.22
            half = math.sqrt(max(rd * rd - yy * yy, 0))
            if half > 0.3:
                plank(mb, "plank", (0, yy, -0.05), 2 * half, 0.2, 0.08, seed=rnd.random())
        lathe(mb, "plank", [(rd, -0.09), (rd, -0.5)], seg=n, uv_u=6)
        for k in range(5):   # steps down (on a slope the deck stands high; the lower ones in the ground where level)
            plank(mb, "plank", (0, -rd - 0.2 - k * 0.32, -0.22 - k * 0.2), 1.6, 0.32, 0.07, seed=rnd.random())
            box(mb, "stone", (0, -rd - 0.2 - k * 0.32, -0.66 - k * 0.2), (1.4, 0.28, 0.8))
        for a in range(0, 360, 30):  # posts and a low rail around the deck, gap at the steps
            if abs(((a + 180) % 360) - 180) < 35:
                continue
            r0 = rd - 0.08
            p = Vector((r0 * math.sin(math.radians(a)), -r0 * math.cos(math.radians(a)), 0))
            log(mb, "log", p, p + Vector((0, 0, 0.8)), 0.05, seg=6, seed=rnd.random())
        for a in range(30, 330, 30):
            if abs(((a + 180) % 360) - 180) < 35 or abs(((a + 30 + 180) % 360) - 180) < 35:
                continue
            a0, a1 = math.radians(a), math.radians(a + 30)
            r0 = rd - 0.08
            log(mb, "log", (r0 * math.sin(a0), -r0 * math.cos(a0), 0.75), (r0 * math.sin(a1), -r0 * math.cos(a1), 0.75), 0.04, seg=6, seed=rnd.random())
    else:
        for k in range(26):
            a = k / 26 * 2 * math.pi
            if abs(((a + math.pi) % (2 * math.pi)) - math.pi) < door_half + 0.1:
                continue
            rock(mb, "stone", (R * 1.03 * math.sin(a), -R * 1.03 * math.cos(a), 0.0), rnd.uniform(0.12, 0.2), seed=rnd.random(), squash=0.5, subdiv=1)
        # on a slope the ground is levelled for it: dug in uphill, built up downhill behind a dry-stone
        # face (most of it in the ground where it is level), and flat stones as steps up to the door
        lathe(mb, "plinth", [(R * 1.12, -1.8), (R * 1.08, -0.6), (R * 1.05, 0.0)], seg=40, uv_u=12)   # (wound outward)
        for k in range(6):
            box(mb, "stone", (0, -R * 1.05 - 0.25 - k * 0.32, -0.12 - k * 0.2), (1.3 - k * 0.04, 0.34, 0.24))
            box(mb, "stone", (0, -R * 1.05 - 0.25 - k * 0.32, -0.6 - k * 0.2), (1.2, 0.3, 0.8))
    interior(mb, R, hw, zc, r_top, roof, door_half, px, py, rnd)
    objs = mb.build(name, M)
    extra = []
    for i, (dm, hinge) in enumerate(leaves):
        parts = dm.build(f"{name}_door{i}_out", M)
        e = bpy.data.objects.new(f"{name}_door{i}_out", None)
        bpy.context.scene.collection.objects.link(e)
        e.location = hinge
        for ob in parts:
            ob.parent = e
        extra += parts + [e]
    # the ground inside is lowered to below the floor (web/src/slice.js buildPads): a round pad
    pad = bpy.data.objects.new(f"{name}_padc", None)
    bpy.context.scene.collection.objects.link(pad)
    pad.scale = (R * 0.99, R * 0.99, 1)
    extra.append(pad)
    bpy.context.view_layer.update()
    bake_vertex_ao(objs + [o for o in extra if o.type == "MESH"], samples=32, dist=2.5, sky=True)
    export(name, objs + extra)


if __name__ == "__main__":
    build("yurt", deck=False, seed=3)
    build("yurt_deck", R=3.6, deck=True, seed=4)
