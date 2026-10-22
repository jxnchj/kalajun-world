"""Log cabins with sod roofs (the lodge of photos 4/5 and the small cabin of photo 2).

Front faces -Y. Floor level z=0; a stone skirt runs 2 m below it so the building can
sit on sloping ground. Logs cross at the corners, gables are stacked logs, purlins stick
out past the gables, the roof is boards + turf with grass tufts, and a lean-to porch with
railings, lanterns and steps runs along the front (without a porch, two steps up to the door).

The doors open: each door leaf is its own object under an empty named <name>_door<i> at the
hinge (the left jamb, seen from outside), swinging inward about the vertical (web/src/slice.js
turns it). Inside, a plank floor and a herder's winter room (interior()): a sleeping platform
along the back wall under a felt and a wall carpet, a painted chest with the folded quilts
stacked on it, a whitewashed clay stove with its pipe, a low round table, a felt rug. Longer
buildings are split into rooms by log partitions, one room per door.
"""
import math, random, sys, os
sys.path.insert(0, os.path.dirname(__file__))
from lib import *
from mathutils import Vector, Matrix


def mats():
    return {
        "log": material("log", "wood_log.png"),
        "logend": material("logend", "wood_end.png"),
        "plank": material("plank", "wood_plank.png"),
        "shutter": material("shutter", "wood_plank_grey.png"),
        "sod": material("sod", "sod.png"),
        "plinth": material("plinth", "stone.png"),   # the rubble-stone base the house stands on
        "shingle": material("shingle", "shingles.png"),
        "grass": material("grasscard", "grass_card.png", alpha=True),
        "stone": material("stone", "stone.png"),
        "glass": material("glass", color=(0.05, 0.06, 0.07, 1)),
        "lamp": material("lamp", color=(1.0, 0.7, 0.35, 1)),
        "iron": material("iron", color=(0.05, 0.045, 0.04, 1)),
        # inside: felt, an ornamented carpet, quilts in the old deep colours, whitewash
        "tekemet": material("tekemet", "felt.png"),
        "rug": material("rug", "rug_t09.png"),
        "quilt_r": material("quilt_r", color=(0.36, 0.06, 0.05, 1)),
        "quilt_g": material("quilt_g", color=(0.07, 0.2, 0.11, 1)),
        "quilt_y": material("quilt_y", color=(0.5, 0.36, 0.09, 1)),
        "quilt_b": material("quilt_b", color=(0.08, 0.1, 0.26, 1)),
        "whitewash": material("whitewash", color=(0.72, 0.69, 0.62, 1)),
        "chest": material("chest", color=(0.42, 0.1, 0.05, 1)),
    }


def lantern(mb, top, seed=0):
    """small hanging lantern, hook at `top`"""
    t = Vector(top)
    log(mb, "iron", t, t - Vector((0, 0, 0.18)), 0.008, seg=4, caps=False)
    c = t - Vector((0, 0, 0.36))
    box(mb, "lamp", c, (0.16, 0.16, 0.22))
    for sx in (-1, 1):
        for sy in (-1, 1):
            box(mb, "iron", c + Vector((sx * 0.085, sy * 0.085, 0)), (0.025, 0.025, 0.26))
    box(mb, "iron", c + Vector((0, 0, 0.135)), (0.22, 0.22, 0.04))
    box(mb, "iron", c + Vector((0, 0, -0.125)), (0.2, 0.2, 0.03))
    V = [c + Vector((x, y, 0.155)) for x, y in ((-0.11, -0.11), (0.11, -0.11), (0.11, 0.11), (-0.11, 0.11))] + [c + Vector((0, 0, 0.26))]
    mb.add("iron", V, [(0, 1, 4), (1, 2, 4), (2, 3, 4), (3, 0, 4)], [[(0, 0), (1, 0), (0.5, 1)]] * 4)


def shingle_slope(mb, x0, x1, y_ridge, y_eave, z_ridge, z_eave, rnd, lift=0.07):
    """overlapping rows of wood shingles on one roof slope (rows laid from the eave up);
    each row's butt edge stands proud so the roof reads as stepped courses"""
    run = y_eave - y_ridge
    L = math.hypot(run, z_eave - z_ridge)
    n = max(3, int(L / 0.3))
    nrm = Vector((0, -(z_eave - z_ridge), run)).normalized()
    if nrm.z < 0:
        nrm = -nrm
    at = lambda t: Vector((0, y_ridge + run * t, z_ridge + (z_eave - z_ridge) * t))
    nx = max(2, int(abs(x1 - x0) / 1.0))
    for i in range(n):
        t_lo = 1 - i / n                     # lower (butt) edge, counted from the eave
        t_hi = max(0.0, 1 - (i + 1.45) / n)  # upper edge tucks under the next row
        row = rnd.randrange(8)
        P = []
        for t, dz in ((t_hi, 0.0), (t_lo, 0.035)):
            base = at(t) + nrm * (lift + dz)
            P.append([Vector((x0 + (x1 - x0) * j / nx, base.y, base.z)) for j in range(nx + 1)])
        v0, v1 = (row + 0.02) / 8, (row + 0.98) / 8
        mb.quad_strip_grid("shingle", P, lambda a, j: (j * abs(x1 - x0) / nx / 2.2, v0 if a == 0 else v1))
        # butt edge face
        b0 = at(t_lo) + nrm * lift
        b1 = at(t_lo) + nrm * (lift + 0.035)
        Q = [[Vector((x0 + (x1 - x0) * j / nx, b1.y, b1.z)) for j in range(nx + 1)],
             [Vector((x0 + (x1 - x0) * j / nx, b0.y, b0.z)) for j in range(nx + 1)]]
        mb.quad_strip_grid("shingle", Q, lambda a, j: (j * abs(x1 - x0) / nx / 2.2, v1 - 0.01 * a))


def sod_slope(mb, x0, x1, y_ridge, y_eave, z_ridge, z_eave, rnd, tufts=True, fringe=True, tall=0.0, blades=False):
    """turf layer on one roof slope: bumpy grid thickening from the edges, grass tufts on top,
    grass fringe hanging over the eave; blades: the grass as single blades in clumps of their own
    size, lean and colour, thick in patches and thin between (materials turfblade/turfdry/seedstalk,
    two-sided) instead of the tuft cards; tall: stalks of seeding grass per m² (an old turf left to
    grow, as on 岚川's lodge)"""
    nx = max(4, int(abs(x1 - x0) / 0.5))
    ny = max(3, int(abs(y_eave - y_ridge) / 0.5))
    run = y_eave - y_ridge
    slope_len = math.hypot(run, z_eave - z_ridge)
    nrm = Vector((0, -(z_eave - z_ridge), run)).normalized()
    if nrm.z < 0:
        nrm = -nrm
    P = []
    for i in range(ny + 1):
        v = i / ny
        row = []
        for j in range(nx + 1):
            u = j / nx
            edge = min(u, 1 - u, v * 3, 1 - v) * min(abs(x1 - x0), slope_len)
            bump = 0.7 + 0.6 * (0.5 + 0.5 * math.sin(u * 23 + v * 7 + rnd.random() * 0.8) * math.sin(v * 17 - u * 5))
            th = 0.24 * min(1, edge / 0.35) ** 0.6 * bump
            p = Vector((x0 + (x1 - x0) * u, y_ridge + run * v, z_ridge + (z_eave - z_ridge) * v))
            row.append(p + nrm * (0.07 + th))
        P.append(row)
    mb.quad_strip_grid("sod", P, lambda i, j: (j * 0.5 / 2.0, i * 0.5 / 2.0))
    if blades:
        turf_blades(mb, P, nrm, run, slope_len, abs(x1 - x0), rnd, tall)
        return
    if tufts:
        area = abs(x1 - x0) * slope_len
        for _ in range(int(area * 0.8)):
            u, v = rnd.uniform(0.04, 0.96), rnd.uniform(0.05, 0.95)
            p = Vector((x0 + (x1 - x0) * u, y_ridge + run * v, z_ridge + (z_eave - z_ridge) * v)) + nrm * 0.24
            h = rnd.uniform(0.12, 0.32)
            w = rnd.uniform(0.3, 0.55)
            yaw = rnd.uniform(0, math.pi)
            uv0 = rnd.choice([0, 0.5])
            card(mb, "grass", p - nrm * 0.05, w, h, yaw, uv=(uv0, 0, uv0 + 0.5, 0.5))
            card(mb, "grass", p - nrm * 0.05, w, h, yaw + math.pi / 2, uv=(0.5 - uv0, 0, 1 - uv0, 0.5))
    if fringe:
        n = int(abs(x1 - x0) / 0.6)
        s = 1 if run > 0 else -1
        for k in range(n):
            x = x0 + (x1 - x0) * (k + rnd.random()) / n
            p = Vector((x, y_eave + s * 0.02, z_eave + 0.2))
            w = rnd.uniform(0.35, 0.6)
            h = rnd.uniform(0.18, 0.38)
            # hanging: card pointing down and outward
            V = [p + Vector((-w / 2, 0, 0)), p + Vector((w / 2, 0, 0)), p + Vector((w / 2, s * h * 0.45, -h)), p + Vector((-w / 2, s * h * 0.45, -h))]
            u0 = rnd.choice([0, 0.5])
            mb.add("grass", V, [(0, 1, 2, 3)], [[(u0, 0.5), (u0 + 0.5, 0.5), (u0 + 0.5, 0.0), (u0, 0.0)]])
    if tall:
        # in drifts, thick in some stretches and thin in others, of uneven height and lean
        L = math.hypot(run, z_eave - z_ridge)
        for _ in range(int(abs(x1 - x0) * L * tall)):
            u, v = rnd.uniform(0.03, 0.97), rnd.uniform(0.08, 0.95)
            if rnd.random() > 0.35 + 0.65 * (0.5 + 0.5 * math.sin(u * 19.0 + v * 4.0)):
                continue
            p = Vector((x0 + (x1 - x0) * u, y_ridge + run * v, z_ridge + (z_eave - z_ridge) * v)) + nrm * 0.2
            h = rnd.uniform(0.3, 0.85)
            yaw = rnd.uniform(0, math.pi)
            uv0 = rnd.choice([0, 0.5])
            card(mb, "grass", p, rnd.uniform(0.16, 0.36), h, yaw, tilt=rnd.uniform(-0.25, 0.25), uv=(uv0, 0, uv0 + 0.5, 0.5))


def turf_blades(mb, P, nrm, run, slope_len, width, rnd, tall):
    """grass on a turf grid P (rows from the ridge to the eave): clumps of blades, blades hanging
    over the eave, seed stalks"""
    ny, nx = len(P) - 1, len(P[0]) - 1
    def surf(u, v):
        fi, fj = v * ny, u * nx
        i, j = min(int(fi), ny - 1), min(int(fj), nx - 1)
        a, b = fi - i, fj - j
        return (P[i][j] * (1 - b) + P[i][j + 1] * b) * (1 - a) + (P[i + 1][j] * (1 - b) + P[i + 1][j + 1] * b) * a
    ph = rnd.uniform(0, 6.28)
    patch = lambda u, v: 0.5 + 0.5 * math.sin(u * width * 0.9 + ph) * math.sin(v * slope_len * 1.3 - u * width * 0.4 + ph * 2)
    down = Vector((0, run, 0)).normalized()   # (toward the eave)
    def blade(base, yaw, lean, L, w, mat):
        d = Vector((math.cos(yaw) * math.sin(lean), math.sin(yaw) * math.sin(lean), math.cos(lean)))
        side = Vector((-math.sin(yaw), math.cos(yaw), 0)) * (w / 2)
        mid = base + d * (L * 0.55) + Vector((0, 0, -L * 0.08 * lean))
        tip = base + d * L + Vector((0, 0, -L * 0.25 * lean * lean))
        mb.add(mat, [base - side, base + side, mid + side * 0.6, mid - side * 0.6, tip],
               [(0, 1, 2, 3), (3, 2, 4)], [[(0, 0), (1, 0), (0.8, 0.55), (0.2, 0.55)], [(0.2, 0.55), (0.8, 0.55), (0.5, 1)]])
    area = width * slope_len
    for _ in range(int(area * 7)):
        u, v = rnd.uniform(0.01, 0.99), rnd.uniform(0.03, 0.99)
        q = patch(u, v)
        if rnd.random() > 0.15 + 0.85 * q:
            continue
        c = surf(u, v) - nrm * 0.04
        dry = rnd.random() < 0.18 + 0.3 * (1 - q)
        g = 0.75 + 0.6 * q
        for _k in range(rnd.randint(3, 8)):
            o = Vector((rnd.uniform(-0.05, 0.05), rnd.uniform(-0.05, 0.05), 0))
            blade(c + o, rnd.uniform(0, 6.283), rnd.uniform(0.1, 0.7), rnd.uniform(0.14, 0.38) * g, rnd.uniform(0.018, 0.034),
                  "turfdry" if dry or rnd.random() < 0.12 else "turfblade")
    # over the eave: blades hanging out and down, in uneven bunches
    x = 0.0
    while x < 1.0:
        x += rnd.uniform(0.004, 0.03) * (1.6 - patch(x, 1.0)) / width * 6
        c = surf(min(x, 0.999), 0.985)
        yaw = math.atan2(down.y, down.x) + rnd.uniform(-0.6, 0.6)
        blade(c, yaw, rnd.uniform(1.0, 1.9), rnd.uniform(0.15, 0.36), rnd.uniform(0.02, 0.035), "turfdry" if rnd.random() < 0.4 else "turfblade")
    # seed stalks, in drifts
    for _ in range(int(area * tall)):
        u, v = rnd.uniform(0.02, 0.98), rnd.uniform(0.06, 0.95)
        if rnd.random() > 0.2 + 0.8 * patch(u + 0.37, v):
            continue
        b = surf(u, v) - nrm * 0.04
        yaw, lean, L = rnd.uniform(0, 6.283), rnd.uniform(0.0, 0.32), rnd.uniform(0.4, 0.9)
        d = Vector((math.cos(yaw) * math.sin(lean), math.sin(yaw) * math.sin(lean), math.cos(lean)))
        tip = b + d * L
        for a in (yaw, yaw + math.pi / 2):   # crossed thin ribbons, the head a narrow spindle
            sd = Vector((-math.sin(a), math.cos(a), 0))
            mb.add("seedstalk", [b - sd * 0.006, b + sd * 0.006, tip + sd * 0.004, tip - sd * 0.004], [(0, 1, 2, 3)], [[(0, 0), (1, 0), (1, 1), (0, 1)]])
            h0, h1 = tip, tip + d * rnd.uniform(0.07, 0.14)
            hm = (h0 + h1) / 2
            mb.add("seedstalk", [h0, hm + sd * 0.018, h1, hm - sd * 0.018], [(0, 1, 2, 3)], [[(0.5, 0), (1, 0.5), (0.5, 1), (0, 0.5)]])


def interior(mb, x0, x1, y0, y1, chimney, roof_z, rnd, back_windows=(), win_w=1.25):
    """one room between x0..x1 (inside the walls), y0 (front) .. y1 (back); chimney: (x, y) of the
    stone chimney if it rises in this room, else None (an iron pipe goes out through the roof);
    roof_z(y): height of the roof's underside; back_windows: x of the windows in the back wall"""
    wr = x1 - x0
    # felt rug on the floor in the middle, the sleeping platform along the back wall
    box(mb, "rug", ((x0 + x1) / 2, (y0 + y1) / 2 - 0.3, 0.035), (min(wr - 1.2, 3.2), min(y1 - y0 - 2.4, 2.2), 0.012), uv_scale=0.35)
    sx = x1 - 1.0 if chimney is None else chimney[0]                           # the stove (right-back corner, under the chimney)
    px0, px1 = x0 + 0.05, max(x0 + 1.6, sx - 0.75)                             # the platform left of the stove
    pd, ph = 1.7, 0.42
    py = y1 - pd / 2
    for k in range(int((px1 - px0) / 0.6) + 1):                                 # its front: vertical boards
        x = px0 + 0.3 + k * 0.6
        if x < px1:
            plank(mb, "plank", (x, y1 - pd, ph / 2), ph, 0.58, 0.04, rot=Matrix.Rotation(math.pi / 2, 3, "Y"), seed=rnd.random())
    box(mb, "plank", ((px0 + px1) / 2, py, ph - 0.03), (px1 - px0, pd, 0.06), uv_scale=0.5)
    box(mb, "tekemet", ((px0 + px1) / 2, py, ph + 0.03), (px1 - px0 - 0.05, pd - 0.05, 0.06), uv_scale=0.6)
    # the wall carpet behind it, in the longest stretch of wall between the windows
    free = [(px0 + 0.15, px1 - 0.15)]
    for xw in back_windows:
        a, b = xw - win_w / 2 - 0.15, xw + win_w / 2 + 0.15
        free = [q for (u, v) in free for q in ((u, min(v, a)), (max(u, b), v)) if q[1] - q[0] > 0.05]
    if free:
        u, v = max(free, key=lambda q: q[1] - q[0])
        cw = min(v - u, 3.0)
        if cw > 1.0:
            box(mb, "rug", ((u + v) / 2, y1 - 0.02, ph + 1.0), (cw, 0.02, 1.35), uv_scale=0.45)
    # the chest at the platform's left end, the folded quilts and pillows stacked on it
    cx_, cy_ = px0 + 0.55, y1 - 0.42
    box(mb, "chest", (cx_, cy_, ph + 0.28), (0.95, 0.55, 0.5))
    box(mb, "iron", (cx_, cy_ - 0.28, ph + 0.3), (0.9, 0.012, 0.05))
    z = ph + 0.53
    cols = ["quilt_r", "quilt_g", "quilt_y", "quilt_b", "quilt_r", "quilt_y", "quilt_g"]
    for k in range(5 + rnd.randrange(3)):
        t = rnd.uniform(0.09, 0.14)
        box(mb, cols[(k + rnd.randrange(2)) % len(cols)], (cx_ + rnd.uniform(-0.03, 0.03), cy_, z + t / 2), (0.92 + rnd.uniform(-0.05, 0.05), 0.52, t))
        z += t
    for k in range(2):
        box(mb, "quilt_y" if k else "quilt_r", (cx_ - 0.2 + k * 0.4, cy_, z + 0.08), (0.38, 0.32, 0.16))
    box(mb, "tekemet", (cx_, cy_ - 0.02, z + 0.2), (1.02, 0.58, 0.03))           # the cover over the stack
    # the stove: whitewashed clay, an iron cooking plate, a kettle, the pipe
    sy = y1 - 0.75 if chimney is None else chimney[1]
    box(mb, "whitewash", (sx, sy, 0.42), (0.95, 0.75, 0.84))
    box(mb, "iron", (sx, sy, 0.86), (0.85, 0.65, 0.04))
    box(mb, "iron", (sx, sy - 0.38, 0.3), (0.32, 0.02, 0.24))                   # fire door
    log(mb, "iron", (sx + 0.15, sy - 0.1, 0.88), (sx + 0.15, sy - 0.1, 1.05), 0.11, seg=10)   # kettle
    log(mb, "iron", (sx + 0.15, sy - 0.1, 1.05), (sx + 0.15, sy - 0.1, 1.09), 0.05, seg=8)
    top = roof_z(sy) + (0.9 if chimney is None else 0.05)
    log(mb, "iron", (sx - 0.2, sy + 0.15, 0.88), (sx - 0.2, sy + 0.15, top), 0.07, seg=8, caps=chimney is None)
    # a low round table on the rug, a few cushions round it
    tx, ty = (x0 + x1) / 2 - 0.3, (y0 + y1) / 2 - 0.4
    log(mb, "plank", (tx, ty, 0.3), (tx, ty, 0.34), 0.48, seg=16)
    for a in (0.4, 2.5, 4.6):
        log(mb, "plank", (tx + 0.3 * math.cos(a), ty + 0.3 * math.sin(a), 0.03), (tx + 0.3 * math.cos(a), ty + 0.3 * math.sin(a), 0.3), 0.03, seg=6, caps=False)
    for a, col in ((1.6, "quilt_r"), (3.6, "quilt_b"), (5.6, "quilt_g")):
        box(mb, col, (tx + 0.8 * math.cos(a), ty + 0.8 * math.sin(a), 0.07), (0.45, 0.45, 0.09), rot=rotz(a))


def build(name, w, d, rows=9, pitch_deg=26, porch=0.0, front_windows=None, doors=None, back_windows=None,
          side_windows=True, chimney=True, lanterns=(), light_strip=False, seed=1):
    reset()
    M = mats()
    mb = MeshBuilder()
    rnd = random.Random(seed)
    r, s, oh = 0.17, 0.30, 0.38
    hw = r + (rows - 1) * s + r
    tanp = math.tan(math.radians(pitch_deg))
    zr = hw + (d / 2) * tanp  # ridge height (at wall line)
    front_windows = front_windows if front_windows is not None else [-w * 0.25, w * 0.25]
    doors = doors if doors is not None else [0.0]
    back_windows = back_windows if back_windows is not None else [-w * 0.2, w * 0.2]
    win_w, win_z0, win_z1 = (1.25, 0.85, 2.05)
    # (a herder's door: under 2 m, and well inside the wall -- its lintel two logs below the top,
    # the eave in front of it above it)
    door_w, door_h = 1.1, min(2.0, hw - 0.45)
    openings = {"front": [(x - win_w / 2, x + win_w / 2, win_z0, win_z1) for x in front_windows] + [(x - door_w / 2, x + door_w / 2, -1, door_h) for x in doors],
                "back": [(x - win_w / 2, x + win_w / 2, win_z0, win_z1) for x in back_windows],
                "side": [(-0.55, 0.55, win_z0, win_z1)] if side_windows else []}

    def wall_logs(axis, pos, length, z0, openings, oh_):
        k = 0
        z = z0
        while z < hw - 0.05:
            cuts = sorted((a, b) for a, b, lo, hi in openings if z + r * 0.4 > lo and z - r * 0.4 < hi)
            segs, cur = [], -length / 2 - oh_
            for a, b in cuts:
                segs.append((cur, a)); cur = b
            segs.append((cur, length / 2 + oh_))
            for a, b in segs:
                if b - a < 0.15:
                    continue
                if axis == "x":
                    p0, p1 = Vector((a, pos, z)), Vector((b, pos, z))
                else:
                    p0, p1 = Vector((pos, a, z)), Vector((pos, b, z))
                log(mb, "log", p0, p1, r * rnd.uniform(0.93, 1.07), seg=10, seed=rnd.random(), end_mat="logend")
            z += s
            k += 1

    wall_logs("x", -d / 2, w, r, openings["front"], oh)
    wall_logs("x", d / 2, w, r, openings["back"], oh)
    wall_logs("y", -w / 2, d, r + s / 2, openings["side"], oh)
    wall_logs("y", w / 2, d, r + s / 2, openings["side"], oh)
    for x in (-w / 2, w / 2):   # the sill logs the side walls stand on (they start half a log up)
        log(mb, "log", (x, -d / 2 + r, r * 0.55), (x, d / 2 - r, r * 0.55), r * 0.8, seg=10, seed=rnd.random(), end_mat="logend")
    # log gables
    z = hw + s / 2 - r
    while True:
        half = (zr - z) / tanp - 0.1
        if half < 0.35:
            break
        for x in (-w / 2, w / 2):
            log(mb, "log", (x, -half, z), (x, half, z), r * 0.95, seg=10, seed=rnd.random(), end_mat="logend")
        z += s
    # purlins + ridge beam sticking out past the gables
    goh = 0.6
    for yy in (-d / 4, 0.0, d / 4):
        zz = zr - abs(yy) * tanp - 0.12
        log(mb, "log", (-w / 2 - goh, yy, zz), (w / 2 + goh, yy, zz), 0.15, seg=10, seed=rnd.random(), end_mat="logend")

    # roof boards (two slopes) + sod
    eave = 0.65
    board_t = 0.1
    ye_f, ye_b = -(d / 2 + eave), d / 2 + eave
    ze_f, ze_b = zr - (d / 2 + eave) * tanp, zr - (d / 2 + eave) * tanp
    for (ye, ze) in ((ye_f, ze_f), (ye_b, ze_b)):
        sl = math.hypot(ye, ze - zr)
        ang = math.atan2(ze - zr, abs(ye))
        cy, cz = ye / 2, (zr + ze) / 2 + 0.02
        rot = Matrix.Rotation(ang if ye > 0 else -ang, 3, "X")
        box(mb, "plank", (0, cy, cz), (w + 2 * goh + 0.2, sl, board_t), rot=rot, uv_scale=0.5)
        shingle_slope(mb, -w / 2 - goh - 0.05, w / 2 + goh + 0.05, 0.0, ye, zr + 0.02, ze + 0.02, rnd)
        # fascia board along the eave
        box(mb, "plank", (0, ye, ze - 0.02), (w + 2 * goh + 0.24, 0.07, 0.26), uv_scale=0.5)
    # ridge cap: two boards meeting over the ridge
    for sgn in (-1, 1):
        rot = Matrix.Rotation(sgn * math.radians(pitch_deg), 3, "X")
        box(mb, "plank", (0, sgn * 0.11, zr + 0.13), (w + 2 * goh + 0.3, 0.26, 0.05), rot=rot, uv_scale=0.5)
    # bargeboards on the gables
    for x in (-w / 2 - goh - 0.08, w / 2 + goh + 0.08):
        for ye, ze in ((ye_f, ze_f), (ye_b, ze_b)):
            p0, p1 = Vector((x, 0, zr + 0.05)), Vector((x, ye, ze + 0.05))
            L = (p1 - p0).length
            rot = Matrix.Rotation(math.atan2(ze - zr, ye), 3, "X")
            box(mb, "plank", (p0 + p1) / 2 + Vector((0, 0, 0.05)), (0.07, L + 0.1, 0.3), rot=rot, uv_scale=0.5)
        # crossed gable finial
        for sgn in (-1, 1):
            p0 = Vector((x, -sgn * 0.12, zr + 0.28))
            p1 = p0 + Vector((0, sgn * 0.42, 0.34))
            log(mb, "log", p0, p1, 0.045, seg=6, seed=rnd.random(), caps=True, end_mat="logend")

    # windows: frame, mullions, glass, shutters
    def window(x, y, face, z0, z1, width, shutters=True):
        # face: -1 front (-Y), +1 back, or 'side'
        t = 2 * r + 0.06
        zc, hgt = (z0 + z1) / 2, z1 - z0
        if face in (-1, 1):
            box(mb, "glass", (x, y, zc), (width, 0.04, hgt))
            for dx in (-width / 2, width / 2):
                box(mb, "plank", (x + dx, y, zc), (0.12, t, hgt + 0.12), uv_scale=0.5)
            for dz in (z0, z1):
                box(mb, "plank", (x, y + face * 0.02, dz), (width + 0.24, t + 0.06, 0.12), uv_scale=0.5)
            box(mb, "plank", (x, y + face * (r + 0.08), z0 - 0.04), (width + 0.3, 0.18, 0.06), uv_scale=0.5)  # sill
            box(mb, "plank", (x, y + face * r * 0.6, zc), (0.05, 0.06, hgt), uv_scale=0.5)
            box(mb, "plank", (x, y + face * r * 0.6, zc + hgt * 0.1), (width, 0.06, 0.05), uv_scale=0.5)
            if shutters:
                for sx in (-1, 1):
                    cx = x + sx * (width / 2 + 0.34)
                    for k in range(3):
                        box(mb, "shutter", (cx - 0.2 + k * 0.2, y + face * (r + 0.04), zc), (0.19, 0.04, hgt + 0.1), uv_scale=0.5)
                    box(mb, "shutter", (cx, y + face * (r + 0.07), zc + hgt * 0.3), (0.62, 0.03, 0.08), uv_scale=0.5)
                    box(mb, "shutter", (cx, y + face * (r + 0.07), zc - hgt * 0.3), (0.62, 0.03, 0.08), uv_scale=0.5)

    for x in front_windows:
        window(x, -d / 2, -1, win_z0, win_z1, win_w)
    for x in back_windows:
        window(x, d / 2, 1, win_z0, win_z1, win_w)
    if side_windows:
        for x, sgn in ((-w / 2, -1), (w / 2, 1)):
            box(mb, "glass", (x, 0, (win_z0 + win_z1) / 2), (0.04, 1.1, win_z1 - win_z0))
            for dy in (-0.55, 0.55):
                box(mb, "plank", (x, dy, (win_z0 + win_z1) / 2), (2 * r + 0.06, 0.12, win_z1 - win_z0 + 0.12), uv_scale=0.5)
            for dz in (win_z0, win_z1):
                box(mb, "plank", (x, 0, dz), (2 * r + 0.12, 1.34, 0.12), uv_scale=0.5)
            box(mb, "plank", (x + sgn * r * 0.6, 0, (win_z0 + win_z1) / 2), (0.06, 0.05, win_z1 - win_z0), uv_scale=0.5)

    # doors: each leaf its own object (vertical planks, iron straps, handle), built round its hinge
    # at the left jamb (x - door_w/2, the wall line); the frame stays with the house
    door_mbs = []
    for x in doors:
        y = -d / 2
        dm = MeshBuilder()
        hx = x - door_w / 2
        for k in range(5):
            plank(dm, "plank", (0.11 + k * 0.22 - 0.005, 0, door_h / 2), door_h, 0.21, 0.07, rot=rotz(math.pi / 2) @ Matrix.Rotation(-math.pi / 2, 3, "Y"), seed=rnd.random())
        for zz in (0.45, door_h - 0.45):
            box(dm, "iron", (door_w / 2, -0.05, zz), (door_w * 0.9, 0.02, 0.08))
        box(dm, "iron", (door_w * 0.82, -0.07, 1.05), (0.05, 0.05, 0.18))
        box(dm, "iron", (door_w * 0.82, 0.07, 1.05), (0.05, 0.05, 0.18))           # (and inside)
        door_mbs.append((dm, Vector((hx, y, 0.0))))
        for dx in (-door_w / 2 - 0.06, door_w / 2 + 0.06):
            box(mb, "plank", (x + dx, y, door_h / 2), (0.14, 2 * r + 0.08, door_h + 0.1), uv_scale=0.5)
        box(mb, "plank", (x, y, door_h + 0.08), (door_w + 0.4, 2 * r + 0.1, 0.16), uv_scale=0.5)

    # floor-level stone foundation + skirt below
    for (a, b, yy, axis) in ((-w / 2, w / 2, -d / 2, "x"), (-w / 2, w / 2, d / 2, "x"), (-d / 2, d / 2, -w / 2, "y"), (-d / 2, d / 2, w / 2, "y")):
        n = int((b - a) / 0.55) + 1
        for k in range(n):
            t = a + (b - a) * k / max(n - 1, 1) + rnd.uniform(-0.1, 0.1)
            c = (t, yy, -0.06) if axis == "x" else (yy, t, -0.06)
            rock(mb, "stone", c, rnd.uniform(0.3, 0.42), seed=rnd.random(), squash=0.5, subdiv=2)
    # the rubble-stone plinth under the walls (on a slope it shows on the downhill side; uphill it is
    # in the ground)
    box(mb, "plinth", (0, 0, -1.25), (w + 0.3, d + 0.3, 2.2), uv_scale=0.7)
    # inside: a plank floor, log partitions between the doors' rooms, a furnished room each
    xi0, xi1, yi0, yi1 = -w / 2 + r, w / 2 - r, -d / 2 + r, d / 2 - r
    nbd = max(2, int((yi1 - yi0) / 0.18))
    for k in range(nbd):
        yy = yi0 + (k + 0.5) * (yi1 - yi0) / nbd
        xcur = xi0
        while xcur < xi1 - 0.05:
            L = min(rnd.uniform(2.0, 3.4), xi1 - xcur)
            plank(mb, "plank", (xcur + L / 2, yy, 0.015), L - 0.01, (yi1 - yi0) / nbd - 0.012, 0.03, seed=rnd.random())
            xcur += L
    ds = sorted(doors)
    cuts = [(a + b) / 2 for a, b in zip(ds[:-1], ds[1:])]
    for xc in cuts:
        z = r + s / 2
        while z < hw - 0.05:
            log(mb, "log", (xc, yi0, z), (xc, yi1, z), r * 0.85 * rnd.uniform(0.95, 1.05), seg=10, seed=rnd.random(), end_mat="logend")
            z += s
    bounds = [xi0] + [c for c in cuts] + [xi1]
    roof_z = lambda yy: zr - abs(yy) * tanp - 0.1
    for a, b in zip(bounds[:-1], bounds[1:]):
        a2 = a + (r * 0.85 if a != xi0 else 0.0)
        b2 = b - (r * 0.85 if b != xi1 else 0.0)
        ch = (w / 2 - 1.3, d / 4) if (chimney and a2 < w / 2 - 1.3 < b2) else None
        interior(mb, a2, b2, yi0, yi1, ch, roof_z, rnd, back_windows=[xw for xw in back_windows if a2 < xw < b2], win_w=win_w)

    # chimney on the back slope near one gable
    if chimney:
        cx, cy = w / 2 - 1.3, d / 4
        zbase = zr - cy * tanp - 0.3
        zz = zbase
        box(mb, "stone", (cx, cy, (zbase + zr + 1.0) / 2), (0.62, 0.62, zr + 1.0 - zbase), uv_scale=0.6)
        while zz < zr + 1.0:
            for k in range(6):
                a = k / 6 * 6.283 + zz * 3
                rock(mb, "stone", (cx + 0.3 * math.cos(a), cy + 0.3 * math.sin(a), zz + rnd.uniform(-0.03, 0.03)), rnd.uniform(0.15, 0.2), seed=rnd.random(), squash=0.6, subdiv=2)
            zz += 0.2
        box(mb, "stone", (cx, cy, zz + 0.05), (0.85, 0.85, 0.1), uv_scale=0.5)
        box(mb, "iron", (cx, cy, zz - 0.1), (0.3, 0.3, 0.4))

    # porch: deck, joists, posts, beam, lean-to roof, railing, steps, lanterns
    anchors = []
    if porch > 0:
        y0, y1 = -d / 2 - 0.05, -d / 2 - porch
        zdeck = 0.02
        nb = int(porch / 0.2)
        for k in range(nb):
            yy = y0 - (k + 0.5) * (porch / nb)
            xcur = -w / 2 - 0.2
            while xcur < w / 2 + 0.2:
                L = min(rnd.uniform(2.2, 3.6), w / 2 + 0.2 - xcur)
                plank(mb, "plank", (xcur + L / 2, yy, zdeck + rnd.uniform(-0.01, 0.01)), L - 0.02, porch / nb - 0.025, 0.06, seed=rnd.random())
                xcur += L
        # the deck's rim beams (front and ends); it stands on stone piers, open below
        box(mb, "plank", (0, y1 + 0.02, -0.1), (w + 0.45, 0.09, 0.26), uv_scale=0.5)
        for sx_ in (-1, 1):
            box(mb, "plank", (sx_ * (w / 2 + 0.2), (y0 + y1) / 2, -0.1), (0.09, porch, 0.26), uv_scale=0.5)
        for k in range(int(w / 1.6) + 1):   # joists under the boards, seen from the side
            xj = -w / 2 - 0.15 + (w + 0.3) * k / max(1, int(w / 1.6))
            box(mb, "plank", (xj, (y0 + y1) / 2, -0.12), (0.08, porch, 0.16), uv_scale=0.5)
        npost = max(2, round(w / 3.2) + 1)
        zbeam = hw + 0.05
        zpost_top = zbeam - (porch - 0.15) * math.tan(math.radians(11))
        xs = [-w / 2 - 0.05 + (w + 0.1) * i / (npost - 1) for i in range(npost)]
        # no post in front of a door: nudge it to the side of the doorway
        for i in range(1, npost - 1):
            for g in doors:
                if abs(xs[i] - g) < door_w / 2 + 0.35:
                    xs[i] = g + (1 if xs[i] >= g else -1) * (door_w / 2 + 0.35)
        for x in xs:   # a stone pier under each post (down into the ground)
            box(mb, "plinth", (x, y1 + 0.15, -1.3), (0.42, 0.42, 2.25), uv_scale=0.7)
        for x in xs:
            log(mb, "log", (x, y1 + 0.15, 0.0), (x, y1 + 0.15, zpost_top), 0.12, seg=8, seed=rnd.random(), end_mat="logend")
            for sg in (-1, 1):  # knee braces
                log(mb, "log", (x, y1 + 0.15, zpost_top - 0.6), (x + sg * 0.5, y1 + 0.15, zpost_top - 0.1), 0.05, seg=6, seed=rnd.random())
        log(mb, "log", (-w / 2 - 0.4, y1 + 0.15, zpost_top + 0.08), (w / 2 + 0.4, y1 + 0.15, zpost_top + 0.08), 0.13, seg=10, seed=rnd.random(), end_mat="logend")
        # lean-to roof: rafters + boards + sod
        yr0, yr1 = -d / 2 + 0.1, y1 - 0.45
        zr0 = zbeam + 0.12
        zr1 = zr0 - (yr0 - yr1) * math.tan(math.radians(11))
        for x in xs[:: max(1, len(xs) // 12)] + [0]:
            log(mb, "log", (x, yr0, zr0 - 0.08), (x, yr1, zr1 - 0.08), 0.07, seg=6, seed=rnd.random(), end_mat="logend")
        sl = math.hypot(yr0 - yr1, zr0 - zr1)
        ang = math.atan2(zr0 - zr1, yr0 - yr1)
        box(mb, "plank", (0, (yr0 + yr1) / 2, (zr0 + zr1) / 2), (w + 1.0, sl, 0.08), rot=Matrix.Rotation(ang, 3, "X"), uv_scale=0.5)
        shingle_slope(mb, -w / 2 - 0.5, w / 2 + 0.5, yr0, yr1, zr0, zr1, rnd, lift=0.05)
        box(mb, "plank", (0, yr1, zr1 - 0.03), (w + 1.04, 0.06, 0.22), uv_scale=0.5)
        if light_strip:
            log(mb, "lamp", (-w / 2 - 0.3, yr1 + 0.06, zr1 - 0.18), (w / 2 + 0.3, yr1 + 0.06, zr1 - 0.18), 0.018, seg=5, caps=False)
        # railing between posts except at the entrance(s)
        gaps = [x for x in doors]
        for a, b in zip(xs[:-1], xs[1:]):
            mid = (a + b) / 2
            gs = [g for g in gaps if abs(mid - g) < (b - a) / 2]
            if gs:
                # steps down in front of the door (on a slope the porch stands high: five steps of
                # 20 cm, on stone footings; where the ground is level the lower ones are in it)
                sx_ = min(max(gs[0], a + 0.85), b - 0.85)
                for k in range(5):
                    plank(mb, "plank", (sx_, y1 - 0.2 - k * 0.3, -0.18 - k * 0.2), 1.6, 0.3, 0.07, seed=rnd.random())
                    box(mb, "stone", (sx_, y1 - 0.2 - k * 0.3, -0.62 - k * 0.2), (1.4, 0.26, 0.8))
                continue
            yy = y1 + 0.15
            log(mb, "log", (a, yy, 0.95), (b, yy, 0.95), 0.06, seg=6, seed=rnd.random())
            log(mb, "log", (a, yy, 0.22), (b, yy, 0.22), 0.045, seg=6, seed=rnd.random())
            nbal = int((b - a) / 0.28)
            for k in range(1, nbal):
                x = a + (b - a) * k / nbal
                log(mb, "log", (x, yy, 0.22), (x, yy, 0.95), 0.03, seg=5, seed=rnd.random(), caps=False)
        for x in (lanterns or [xs[len(xs) // 2 - 1] + 1.6]):
            anchors.append((x, y1 + 0.35, zpost_top - 0.05))
            lantern(mb, (x, y1 + 0.35, zpost_top - 0.02))
    else:
        for x in (lanterns or [doors[0] + 0.9]):
            lantern(mb, (x, -d / 2 - 0.25, door_h + 0.35))
            log(mb, "iron", (x, -d / 2 - r, door_h + 0.35), (x, -d / 2 - 0.27, door_h + 0.35), 0.015, seg=4)
        for x in doors:   # steps up to each door, on stone footings (the lower ones in the ground where it is level)
            for k in range(4):
                plank(mb, "plank", (x, -d / 2 - r - 0.2 - k * 0.3, -0.16 - k * 0.2), 1.5, 0.32, 0.07, seed=rnd.random())
                box(mb, "stone", (x, -d / 2 - r - 0.2 - k * 0.3, -0.6 - k * 0.2), (1.3, 0.28, 0.8))

    objs = mb.build(name, M)
    # where the ground must be lower than the floor (web/src/slice.js buildPads): the plinth and the
    # porch, as an empty scaled to the half sizes
    py0, py1 = -d / 2 - 0.15 - porch, d / 2 + 0.15
    pad = bpy.data.objects.new(f"{name}_pad", None)
    bpy.context.scene.collection.objects.link(pad)
    pad.location = (0, (py0 + py1) / 2, 0)
    pad.scale = ((w + 0.3) / 2 + (0.1 if porch > 0 else 0), (py1 - py0) / 2, 1)
    objs_extra = [pad]
    # the door leaves: objects of their own under an empty at the hinge
    door_objs = []
    for i, (dm, hinge) in enumerate(door_mbs):
        parts = dm.build(f"{name}_door{i}", M)
        e = bpy.data.objects.new(f"{name}_door{i}", None)
        bpy.context.scene.collection.objects.link(e)
        e.location = hinge
        for ob in parts:
            ob.parent = e                       # (built round the hinge: no offset of its own)
        door_objs += parts + [e]
    bpy.context.view_layer.update()
    bake_vertex_ao(objs + [o for o in door_objs if o.type == "MESH"], samples=32, dist=2.5, sky=True)
    export(name, objs + door_objs + objs_extra)


if __name__ == "__main__":
    which = sys.argv[-1]
    if which in ("small", "all"):
        build("cabin_small", 8.4, 6.2, rows=9, pitch_deg=30, porch=2.0, front_windows=[-2.3, 2.3], doors=[0.0],
              back_windows=[-1.6, 1.6], lanterns=[1.2], seed=2)
    if which in ("lodge", "all"):
        n = 8
        doors = [-15.0, -5.0, 5.0, 15.0]
        wins = [x for x in [-18.5 + i * 3.4 for i in range(12)] if all(abs(x - dd) > 1.4 for dd in doors)]
        build("lodge", 40.0, 7.0, rows=10, pitch_deg=22, porch=2.4, front_windows=wins, doors=doors,
              back_windows=[-16, -8, 0, 8, 16], lanterns=[-10.0, 0.0, 10.0], light_strip=True, seed=5)
    if which in ("lodge24", "all"):
        doors = [-6.0, 6.0]
        wins = [x for x in [-10.5 + i * 3.5 for i in range(7)] if all(abs(x - dd) > 1.4 for dd in doors)]
        build("lodge24", 24.0, 8.0, rows=10, pitch_deg=20, porch=2.2, front_windows=wins, doors=doors,
              back_windows=[-8, 0, 8], lanterns=[-3.0, 3.0], light_strip=True, seed=8)
