"""The guesthouses of today's Qiongkushitai (built 2021-2025), modelled from their listings' photos
(Ctrip) and placed where their map pins and the 2022 satellite imagery put them (data/layout/
guesthouses.json, tools/place_objects.py). The rest of the scene keeps the 2013 layout.

  gh_lanchuan     岚川民宿, the guest block (the user's photos 2-5, the listing's): two long single-storey
                  log blocks under near-flat sod roofs, a timber-gabled entrance porch, floor-to-ceiling
                  glazing in black frames, along the rooms the porch of photos 4/5 (posts, light strip,
                  red-brown railing, the sign); the stair from the public building climbs to it
  gh_lanchuan_lodge 岚川民宿, the public building below the guest block (photo 1 from above): a 25 m
                  log house, one hall inside -- dining room under roofing felt, check-in up the steps
                  from the road, a lounge, laundry and store under a turf grown tall
  gh_fj_shed      梵净山舍: the long earth-sheltered sheep shed of the 2013 imagery, converted:
                  grey weathered logs, small windows and plank doors, a sod roof one with the slope
  gh_fj_lodge     梵净山舍: log lodge with a railed deck the length of its front, steps at one end,
                  string lights along the rail and the eave
  gh_fj_hut       梵净山舍: the small log hut with a corrugated iron roof and arched double doors
  gh_qk_long      青空冀翼: one of the four old cabins renovated: pale weathered logs, a rust-brown
                  corrugated roof, a row of tall windows, a railed deck along the front
  gh_qk_cabin     青空冀翼: the shorter cabins: ochre plank doors, small windows
  gh_tl_main      听岚山庄: board-clad house on the hilltop, a deep porch on posts over the slope
                  under a green iron roof
  gh_tl_wing      听岚山庄: its guest wings, a railed deck along the front

All face -Y (three +Z) with the floor at z=0; on a slope the plinth, the deck posts and the lower
steps go into the ground (slice.js levels a pad under each, the `_pad` empty). Doors open like the
houses' (cabin.py): each leaf under an empty `<name>_door<i>` at its hinge. Inside, guest rooms:
plaster or pine walls, a bed with white linen and a throw, chairs by the glass, a rug, a lamp.
"""
import math, random, sys, os
sys.path.insert(0, os.path.dirname(__file__))
from lib import *
import cabin
from cabin import shingle_slope, sod_slope
from mathutils import Vector, Matrix


def mats():
    M = cabin.mats()
    M.update({
        "logfresh": material("logfresh", "wood_log.png"),       # varnished new logs (岚川)
        "loggrey": material("loggrey", "wood_log.png"),         # silvered old logs (the shed)
        "logpale": material("logpale", "wood_log.png"),         # pale weathered logs (青空冀翼)
        "boardbrown": material("boardbrown", "wood_plank.png"), # stained board cladding (听岚)
        "plankpale": material("plankpale", "wood_plank_grey.png"),
        "deckdark": material("deckdark", "wood_plank.png"),
        "pine": material("pine", "wood_plank.png"),             # pine-boarded rooms
        "frame": material("frame", color=(0.025, 0.025, 0.026, 1)),
        "plaster": material("plaster", color=(0.8, 0.69, 0.48, 1)),
        "plasterw": material("plasterw", color=(0.8, 0.78, 0.72, 1)),
        "tile": material("tile", color=(0.62, 0.6, 0.56, 1)),
        "linen": material("linen", color=(0.86, 0.85, 0.81, 1)),
        "throw": material("throw", color=(0.55, 0.37, 0.19, 1)),
        "rattan": material("rattan", color=(0.48, 0.34, 0.19, 1)),
        "metalbrown": material("metalbrown", color=(0.1, 0.045, 0.03, 1)),
        "metalgreen": material("metalgreen", color=(0.045, 0.11, 0.065, 1)),
        "metalgrey": material("metalgrey", color=(0.17, 0.175, 0.175, 1)),
        "ochre": material("ochre", color=(0.42, 0.26, 0.06, 1)),
        "railred": material("railred", color=(0.25, 0.075, 0.045, 1)),   # painted rail (岚川's porch)
        "roofelt": material("roofelt", color=(0.045, 0.045, 0.05, 1)),     # roofing felt (岚川's west end)
        # the turf's grass, blade by blade (cabin.turf_blades): two-sided, shaded like the meadow
        "turfblade": material("turfblade", color=(0.1, 0.16, 0.035, 1)),
        "turfdry": material("turfdry", color=(0.3, 0.25, 0.1, 1)),
        "seedstalk": material("seedstalk", color=(0.42, 0.36, 0.2, 1)),
    })
    CARD_MATS.update(("turfblade", "turfdry", "seedstalk"))
    for k in ("metalbrown", "metalgreen", "metalgrey"):   # corrugated sheets: wound by hand (one-sided)
        M[k + "_sheet"] = material(k + "_sheet", color=M[k].node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value[:])
        FIXED_WINDING.add(k + "_sheet")
    return M


R_LOG, S_LOG = 0.15, 0.28   # log radius, course height
N_STEP = 7                  # treads in a flight down from a deck (0.2 m each), and two more below
                            # (in the ground where it is level; where a neighbour's cut lowers it, still there)
STEP_FEET = []              # where each flight meets the ground (local x, y, depth) -- `<name>_step<i>` empties


# ------------------------------------------------------------------ small shapes
def extrude_x(mb, mat, poly, x, t, uv=0.5):
    """a slab: polygon `poly` [(y, z)...] (counter-clockwise seen from +X) at x, t thick along X"""
    n = len(poly)
    V = [Vector((x - t / 2, y, z)) for y, z in poly] + [Vector((x + t / 2, y, z)) for y, z in poly]
    F = [tuple(range(n))[::-1], tuple(range(n, 2 * n))]
    U = [[(V[i].y * uv, V[i].z * uv) for i in F[0]], [(V[i].y * uv, V[i].z * uv) for i in F[1]]]
    for k in range(n):
        a, b = k, (k + 1) % n
        F.append((a, b, n + b, n + a))
        L = (Vector(poly[b]) - Vector(poly[a])).length
        U.append([(0, 0), (L * uv, 0), (L * uv, t * uv), (0, t * uv)])
    mb.add(mat, V, F, U)


def corrugated(mb, mat, x0, x1, p0, p1, nrm, period=0.2, amp=0.018):
    """corrugated iron sheet from the line p0 (y, z at the ridge) to p1 (at the eave), ribs along the
    slope, across x0..x1; nrm: the slope's outward normal (y, z)"""
    nx = int((x1 - x0) / (period / 4)) + 1
    P = []
    for (y, z) in (p0, p1):
        row = []
        for j in range(nx + 1):
            x = x0 + (x1 - x0) * j / nx
            off = amp * math.sin((x - x0) / period * 2 * math.pi)
            row.append(Vector((x, y + nrm[0] * off, z + nrm[1] * off)))
        P.append(row)
    L = math.hypot(p1[0] - p0[0], p1[1] - p0[1])
    n = (P[0][1] - P[0][0]).cross(P[1][0] - P[0][0])
    if n.y * nrm[0] + n.z * nrm[1] < 0:   # (wound to face out: these sheets keep their winding)
        P = [row[::-1] for row in P]
    mb.quad_strip_grid(mat + "_sheet", P, lambda i, j: (j / nx * (x1 - x0) * 0.5, i * L * 0.5))


def seg_cut(a, b, cuts):
    """the stretches of a..b left after the cut intervals"""
    out, cur = [], a
    for u0, u1 in sorted(cuts):
        if u1 <= cur or u0 >= b:
            continue
        if u0 > cur:
            out.append((cur, u0))
        cur = max(cur, u1)
    if cur < b:
        out.append((cur, b))
    return [s for s in out if s[1] - s[0] > 0.04]


# ------------------------------------------------------------------ a block of walls
class Block:
    """a rectangular single-storey block: walls of logs or boards with their openings, a lining
    inside, floor and ceiling. x0..x1 along the front, y0 (front) .. y1 (back), walls hw high.
    openings[side] = [dict(u=centre, w=width, z0=sill, z1=head, kind=win|tall|door|gdoor), ...]
    (u along x for front/back, along y for left/right)"""

    def __init__(self, x0, x1, y0, y1, hw, wall="log", wallmat="logfresh", lining="plaster", floor="plank",
                 openings=None, top_back=None, skip=()):
        self.x0, self.x1, self.y0, self.y1, self.hw = x0, x1, y0, y1, hw
        self.wall, self.wallmat, self.lining, self.floor = wall, wallmat, lining, floor
        self.op = {"front": [], "back": [], "left": [], "right": []}
        self.op.update(openings or {})
        self.top_back = top_back if top_back is not None else hw   # (a mono roof: the back wall rises to it)
        self.t = 2 * R_LOG if wall == "log" else 0.18
        self.skip = set(skip)   # sides another block's wall stands in for

    def side(self, s):
        """(axis, position, a, b): the wall line"""
        return {"front": ("x", self.y0, self.x0, self.x1), "back": ("x", self.y1, self.x0, self.x1),
                "left": ("y", self.x0, self.y0, self.y1), "right": ("y", self.x1, self.y0, self.y1)}[s]

    def top(self, y):
        return self.hw + (self.top_back - self.hw) * (y - self.y0) / (self.y1 - self.y0)

    def build(self, mb, rnd, doors):
        for s in ("front", "back", "left", "right"):
            if s not in self.skip:
                self.wall_side(mb, rnd, s)
        for s in ("front", "back", "left", "right"):
            for o in self.op[s]:
                self.opening(mb, rnd, s, o, doors)
        t = self.t
        xi0, xi1, yi0, yi1 = self.x0 + t / 2, self.x1 - t / 2, self.y0 + t / 2, self.y1 - t / 2
        fl = {"plank": "plank", "tile": "tile", "pine": "pine"}[self.floor]
        box(mb, fl, ((xi0 + xi1) / 2, (yi0 + yi1) / 2, -0.02), (xi1 - xi0, yi1 - yi0, 0.08), uv_scale=0.5)
        box(mb, self.lining, ((xi0 + xi1) / 2, (yi0 + yi1) / 2, self.hw - 0.03), (xi1 - xi0, yi1 - yi0, 0.06), uv_scale=0.5)

    def doors_u(self, a, b):
        """the front doors between a and b (x)"""
        return [o["u"] for o in self.op["front"] if o["kind"] in ("door", "gdoor") and a < o["u"] < b]

    def cuts(self, s, margin=0.0):
        return [(o["u"] - o["w"] / 2 - margin, o["u"] + o["w"] / 2 + margin, o.get("z0", 0.0), o.get("z1", 2.1)) for o in self.op[s]]

    def wall_side(self, mb, rnd, s):
        axis, pos, a, b = self.side(s)
        P = (lambda u, z, n=0.0: Vector((u, pos + n, z))) if axis == "x" else (lambda u, z, n=0.0: Vector((pos + n, u, z)))
        out = {"front": -1, "back": 1, "left": -1, "right": 1}[s]
        ops = self.cuts(s)
        t = self.t
        if self.wall == "log":
            oh = 0.22
            z = R_LOG if axis == "x" else R_LOG + S_LOG / 2
            if axis == "y":   # the sill log the side walls stand on
                log(mb, self.wallmat, P(a + R_LOG, R_LOG * 0.55), P(b - R_LOG, R_LOG * 0.55), R_LOG * 0.8, seg=10, seed=rnd.random(), end_mat="logend")
            while z < self.hw - 0.05:
                cuts = [(u0, u1) for u0, u1, lo, hi in ops if z + R_LOG * 0.4 > lo and z - R_LOG * 0.4 < hi]
                for u0, u1 in seg_cut(a - oh, b + oh, cuts):
                    log(mb, self.wallmat, P(u0, z), P(u1, z), R_LOG * rnd.uniform(0.93, 1.07), seg=10, seed=rnd.random(), end_mat="logend")
                z += S_LOG
        else:
            # the frame wall (core), cut round the openings, and horizontal boards over it
            core_t = 0.14
            for u0, u1 in seg_cut(a, b, [(o0, o1) for o0, o1, _, _ in ops]):
                c = P((u0 + u1) / 2, self.hw / 2)
                box(mb, self.lining, c, (u1 - u0, core_t, self.hw) if axis == "x" else (core_t, u1 - u0, self.hw), uv_scale=0.5)
            for o0, o1, lo, hi in ops:
                for z0_, z1_ in ((0.0, lo), (hi, self.hw)):
                    if z1_ - z0_ > 0.02:
                        c = P((o0 + o1) / 2, (z0_ + z1_) / 2)
                        box(mb, self.lining, c, (o1 - o0, core_t, z1_ - z0_) if axis == "x" else (core_t, o1 - o0, z1_ - z0_), uv_scale=0.5)
            bw = 0.18
            z = 0.0
            k = 0
            while z < self.hw - 0.02:
                zc = z + bw / 2
                cuts = [(u0, u1) for u0, u1, lo, hi in ops if zc + bw * 0.45 > lo and zc - bw * 0.45 < hi]
                for u0, u1 in seg_cut(a - 0.06, b + 0.06, cuts):
                    L = u1 - u0
                    rot = Matrix.Identity(3) if axis == "x" else rotz(math.pi / 2)
                    plank(mb, self.wallmat, P((u0 + u1) / 2, zc, out * (core_t / 2 + 0.018)), L, bw - 0.012, 0.03,
                          rot=rot @ Matrix.Rotation(math.pi / 2, 3, "X"), seed=rnd.random())
                z += bw
                k += 1
            for u in (a, b):   # corner boards
                box(mb, self.wallmat, P(u, self.hw / 2, out * (core_t / 2 + 0.03)), (0.14, 0.05, self.hw) if axis == "x" else (0.05, 0.14, self.hw), uv_scale=0.5)
        # the lining inside, cut round the openings
        inn = -out * (t / 2 + 0.012)
        for u0, u1 in seg_cut(a + t / 2, b - t / 2, [(o0, o1) for o0, o1, _, _ in ops]):
            c = P((u0 + u1) / 2, self.hw / 2, inn)
            box(mb, self.lining, c, (u1 - u0, 0.024, self.hw) if axis == "x" else (0.024, u1 - u0, self.hw), uv_scale=0.5)
        for o0, o1, lo, hi in ops:
            for z0_, z1_ in ((0.0, lo), (hi, self.hw)):
                if z1_ - z0_ > 0.02:
                    c = P((o0 + o1) / 2, (z0_ + z1_) / 2, inn)
                    box(mb, self.lining, c, (o1 - o0, 0.024, z1_ - z0_) if axis == "x" else (0.024, o1 - o0, z1_ - z0_), uv_scale=0.5)
        # a mono roof: the side walls' tops rise toward the back -- boards in the wedge over them
        if axis == "y" and self.top_back > self.hw + 0.02:
            extrude_x(mb, "plankpale" if self.wall == "log" else self.wallmat,
                      [(self.y0 - 0.05, self.hw - 0.08), (self.y1 + 0.05, self.hw - 0.08), (self.y1 + 0.05, self.top_back + 0.02), (self.y0 - 0.05, self.hw + 0.02)],
                      pos, t + 0.04)
        if axis == "x" and s == "back" and self.top_back > self.hw + 0.02:
            box(mb, "plankpale" if self.wall == "log" else self.wallmat, P((a + b) / 2, (self.hw + self.top_back) / 2), (b - a + 0.1, t + 0.04, self.top_back - self.hw + 0.1), uv_scale=0.5)

    def opening(self, mb, rnd, s, o, doors):
        axis, pos, a, b = self.side(s)
        out = {"front": -1, "back": 1, "left": -1, "right": 1}[s]
        P = (lambda u, z, n=0.0: Vector((u, pos + n, z))) if axis == "x" else (lambda u, z, n=0.0: Vector((pos + n, u, z)))
        S = (lambda du, dn, dz: (du, dn, dz)) if axis == "x" else (lambda du, dn, dz: (dn, du, dz))
        u, w, kind = o["u"], o["w"], o["kind"]
        z0, z1 = o.get("z0", 0.0), o.get("z1", 2.1)
        t = self.t + 0.04
        fr = o.get("frame", "frame")
        h = z1 - z0
        if kind == "gap":   # an open doorway in its frame (no leaf: the back way in from a stair)
            for du in (-w / 2 - 0.05, w / 2 + 0.05):
                box(mb, fr, P(u + du, z1 / 2), S(0.1, t, z1 + 0.05), uv_scale=0.5)
            box(mb, fr, P(u, z1 + 0.05), S(w + 0.2, t, 0.1), uv_scale=0.5)
            box(mb, "plank", P(u, 0.015), S(w + 0.1, t + 0.04, 0.05), uv_scale=0.5)
            return
        if kind in ("win", "tall"):
            box(mb, "glass", P(u, (z0 + z1) / 2), S(w, 0.03, h))
            for du in (-w / 2, w / 2):
                box(mb, fr, P(u + du, (z0 + z1) / 2), S(0.07, t, h + 0.07), uv_scale=0.5)
            for zz in (z0, z1):
                box(mb, fr, P(u, zz), S(w + 0.07, t, 0.07), uv_scale=0.5)
            nm = int(w / 1.3)
            for k in range(1, nm + 1):   # mullions
                box(mb, fr, P(u - w / 2 + w * k / (nm + 1), (z0 + z1) / 2), S(0.05, 0.08, h), uv_scale=0.5)
            if kind == "win":
                box(mb, "plank" if fr == "frame" else fr, P(u, z0 - 0.03, out * (t / 2 + 0.05)), S(w + 0.2, 0.14, 0.05), uv_scale=0.5)
                if o.get("transom", True):
                    box(mb, fr, P(u, z0 + h * 0.72), S(w, 0.07, 0.05), uv_scale=0.5)
            return
        # doors: the frame stays with the house, the leaf turns (front walls only)
        assert s == "front", "doors on the front walls only"
        for du in (-w / 2 - 0.05, w / 2 + 0.05):
            box(mb, fr, P(u + du, z1 / 2), S(0.1, t, z1 + 0.05), uv_scale=0.5)
        box(mb, fr, P(u, z1 + 0.05), S(w + 0.2, t, 0.1), uv_scale=0.5)
        box(mb, "plank", P(u, 0.015, -0.02), S(w + 0.1, t + 0.04, 0.05), uv_scale=0.5)   # threshold
        dm = MeshBuilder()
        lw = w - 0.02
        if kind == "door":
            leafmat = o.get("leaf", "plank")
            n = max(3, int(lw / 0.2))
            for k in range(n):
                plank(dm, leafmat, (lw * (k + 0.5) / n, 0, z1 / 2), z1 - 0.02, lw / n - 0.006, 0.06,
                      rot=rotz(math.pi / 2) @ Matrix.Rotation(-math.pi / 2, 3, "Y"), seed=rnd.random())
            for zz in (0.35, z1 - 0.35):
                box(dm, "iron" if leafmat != "ochre" else "plank", (lw / 2, -0.04, zz), (lw * 0.9, 0.02, 0.07))
        else:   # glazed door in a black frame
            box(dm, "glass", (lw / 2, 0, z1 / 2), (lw - 0.1, 0.025, z1 - 0.12))
            for xx in (0.04, lw - 0.04):
                box(dm, "frame", (xx, 0, z1 / 2), (0.08, 0.06, z1 - 0.02))
            for zz in (0.05, z1 - 0.05, 0.95):
                box(dm, "frame", (lw / 2, 0, zz), (lw, 0.06, 0.08 if zz != 0.95 else 0.05))
        box(dm, "iron", (lw - 0.12, -0.05, 1.02), (0.04, 0.05, 0.2))
        box(dm, "iron", (lw - 0.12, 0.05, 1.02), (0.04, 0.05, 0.2))
        doors.append((dm, Vector((u - w / 2 + 0.01, pos, 0.0))))


# ------------------------------------------------------------------ roofs
def gable_roof(mb, rnd, x0, x1, y0, y1, hw, pitch, cover, wall="log", wallmat="logfresh", eave=0.55, goh=0.45, mat=None,
               eave_f=None, sod_tall=0.0):
    """ridge along X over the block x0..x1, y0..y1; the gables filled with logs or boards
    (eave_f: a shorter front eave, where a porch roof runs on under it)"""
    tanp = math.tan(math.radians(pitch))
    yc, d = (y0 + y1) / 2, y1 - y0
    zr = hw + (d / 2) * tanp
    # gables
    for x in (x0, x1):
        if wall == "log":
            z = hw + S_LOG / 2 - R_LOG
            while True:
                half = (zr - z) / tanp - 0.1
                if half < 0.3:
                    break
                log(mb, wallmat, (x, yc - half, z), (x, yc + half, z), R_LOG * 0.95, seg=10, seed=rnd.random(), end_mat="logend")
                z += S_LOG
        else:
            extrude_x(mb, wallmat, [(y0, hw), (y1, hw), (yc, zr)], x, 0.2)
    # purlins/ridge beam ends
    if wall == "log":
        for yy in (yc - d / 4, yc, yc + d / 4):
            zz = zr - abs(yy - yc) * tanp - 0.12
            log(mb, "log", (x0 - goh, yy, zz), (x1 + goh, yy, zz), 0.13, seg=10, seed=rnd.random(), end_mat="logend")
    yf, yb = y0 - (eave if eave_f is None else eave_f), y1 + eave
    W = x1 - x0 + 2 * goh
    xm = (x0 + x1) / 2
    for ye, sgn in ((yf, -1), (yb, 1)):
        zf = zr - abs(yc - ye) * tanp
        sl = math.hypot(ye - yc, zr - zf)
        ang = math.atan2(zr - zf, abs(ye - yc))
        rot = Matrix.Rotation(-sgn * ang, 3, "X")
        box(mb, "plank", (xm, (yc + ye) / 2, (zr + zf) / 2 + 0.02), (W + 0.1, sl, 0.08), rot=rot, uv_scale=0.5)
        if cover == "shingle":
            shingle_slope(mb, x0 - goh - 0.05, x1 + goh + 0.05, yc, ye, zr + 0.02, zf + 0.02, rnd)
        elif cover == "sod":
            sod_slope(mb, x0 - goh, x1 + goh, yc, ye, zr, zf, rnd, tall=sod_tall, blades=True)
        elif cover == "felt":   # roofing felt in strips down the slope, held by battens
            nrm = Vector((0, sgn * math.sin(ang), math.cos(ang)))
            box(mb, "roofelt", Vector((xm, (yc + ye) / 2, (zr + zf) / 2 + 0.02)) + nrm * 0.05, (W + 0.12, sl + 0.04, 0.02), rot=rot)
            nb = int(W / 0.95)
            for k in range(nb + 1):
                xb = x0 - goh + W * k / nb
                box(mb, "plank", Vector((xb, (yc + ye) / 2, (zr + zf) / 2 + 0.02)) + nrm * 0.075, (0.05, sl, 0.03), rot=rot, uv_scale=0.5)
        else:
            nrm = (sgn * math.sin(ang), math.cos(ang))
            corrugated(mb, mat, x0 - goh - 0.05, x1 + goh + 0.05, (yc, zr + 0.07), (ye + sgn * 0.05, zf + 0.07 - 0.05 * tanp), nrm)
        box(mb, "plank" if cover != "metal" else mat, (xm, ye, zf - 0.03), (W + 0.2, 0.06, 0.22), uv_scale=0.5)   # fascia
    if cover == "metal":   # ridge cap
        for sgn in (-1, 1):
            box(mb, mat, (xm, yc + sgn * 0.12, zr + 0.1), (W + 0.2, 0.26, 0.03), rot=Matrix.Rotation(sgn * math.radians(pitch), 3, "X"))
    else:
        for sgn in (-1, 1):
            box(mb, "plank", (xm, yc + sgn * 0.11, zr + 0.12), (W + 0.25, 0.26, 0.05), rot=Matrix.Rotation(sgn * math.radians(pitch), 3, "X"), uv_scale=0.5)
    for x in (x0 - goh - 0.07, x1 + goh + 0.07):   # bargeboards
        for ye in (yf, yb):
            zf = zr - abs(yc - ye) * tanp
            p0, p1 = Vector((x, yc, zr + 0.04)), Vector((x, ye, zf + 0.04))
            rot = Matrix.Rotation(math.atan2(zf - zr, ye - yc), 3, "X")
            box(mb, "plank" if cover != "metal" else mat, (p0 + p1) / 2 + Vector((0, 0, 0.04)), (0.06, (p1 - p0).length + 0.08, 0.26), rot=rot, uv_scale=0.5)
    return zr


def mono_roof(mb, rnd, x0, x1, y0, y1, z_front, z_back, cover="sod", eave=0.45, goh=0.35, fascia="plankpale",
              eave_f=None, tall=0.0):
    """a near-flat roof falling to the front: boards, the turf, pale fascia boards all round"""
    yf, yb = y0 - (eave if eave_f is None else eave_f), y1 + eave
    k = (z_back - z_front) / (y1 - y0)
    zf, zb = z_front - (y0 - yf) * k, z_back + eave * k
    sl = math.hypot(yb - yf, zb - zf)
    ang = math.atan2(zb - zf, yb - yf)
    xm = (x0 + x1) / 2
    W = x1 - x0 + 2 * goh
    box(mb, "plank", (xm, (yf + yb) / 2, (zf + zb) / 2 + 0.04), (W, sl, 0.1), rot=Matrix.Rotation(ang, 3, "X"), uv_scale=0.5)
    if cover == "sod":
        sod_slope(mb, x0 - goh + 0.05, x1 + goh - 0.05, yb, yf, zb + 0.02, zf + 0.02, rnd, blades=True, tall=tall)
    for ye, ze in ((yf, zf), (yb, zb)):
        box(mb, fascia, (xm, ye, ze + 0.04), (W + 0.08, 0.06, 0.34), uv_scale=0.5)
    for x in (x0 - goh, x1 + goh):
        box(mb, fascia, (x, (yf + yb) / 2, (zf + zb) / 2 + 0.04), (0.06, sl + 0.06, 0.34), rot=Matrix.Rotation(ang, 3, "X"), uv_scale=0.5)


# ------------------------------------------------------------------ decks, steps, railings, lights
def deck(mb, rnd, x0, x1, y0, y1, mat="plank", rail=(), steps=(), posts_down=1.8, z=0.0, rail_mat="plank"):
    """boards along X on joists, posts into the ground; rail: sides ('front','left','right','back')
    with a railing; steps: [(x, side)] flights down from the edge"""
    nb = max(2, int((y1 - y0) / 0.16))
    for k in range(nb):
        yy = y0 + (k + 0.5) * (y1 - y0) / nb
        xc = x0
        while xc < x1 - 0.05:
            L = min(rnd.uniform(2.2, 3.6), x1 - xc)
            plank(mb, mat, (xc + L / 2, yy, z - 0.03), L - 0.01, (y1 - y0) / nb - 0.014, 0.05, seed=rnd.random())
            xc += L
    box(mb, mat, ((x0 + x1) / 2, y0, z - 0.14), (x1 - x0, 0.06, 0.2), uv_scale=0.5)   # rim
    n = max(2, int((x1 - x0) / 1.8) + 1)
    for k in range(n):
        x = x0 + 0.1 + (x1 - x0 - 0.2) * k / (n - 1)
        box(mb, "plank", (x, (y0 + y1) / 2, z - 0.15), (0.08, y1 - y0, 0.16), uv_scale=0.5)          # joist
        for yy in (y0 + 0.12, y1 - 0.12):
            box(mb, "plank", (x, yy, z - posts_down / 2 - 0.1), (0.12, 0.12, posts_down), uv_scale=0.5)   # post
    gaps = {}
    for st in steps:
        gaps.setdefault(st[1], []).append((st[0] - 0.75, st[0] + 0.75))
    for sd in rail:
        if sd in ("front", "back"):
            yy = y0 + 0.05 if sd == "front" else y1 - 0.05
            for a, b in seg_cut(x0, x1, gaps.get(sd, [])):
                railing(mb, rnd, Vector((a, yy, z)), Vector((b, yy, z)), rail_mat)
        else:
            xx = x0 + 0.05 if sd == "left" else x1 - 0.05
            for a, b in seg_cut(y0, y1, gaps.get(sd, [])):
                railing(mb, rnd, Vector((xx, a, z)), Vector((xx, b, z)), rail_mat)
    for st in steps:   # (x, side[, treads down to the foot -- N_STEP unless a taller flight])
        sx, sd = st[0], st[1]
        ns = st[2] if len(st) > 2 else N_STEP
        foot = {"front": (sx, y0 - 0.17 - ns * 0.3), "left": (x0 - 0.17 - ns * 0.3, sx), "right": (x1 + 0.17 + ns * 0.3, sx)}[sd]
        STEP_FEET.append(foot + (ns * 0.2,))
        for k in range(ns + 2):
            if sd == "front":
                c = (sx, y0 - 0.17 - k * 0.3, z - 0.2 * (k + 1) + 0.03)
            elif sd == "left":
                c = (x0 - 0.17 - k * 0.3, sx, z - 0.2 * (k + 1) + 0.03)
            else:
                c = (x1 + 0.17 + k * 0.3, sx, z - 0.2 * (k + 1) + 0.03)
            rot = Matrix.Identity(3) if sd == "front" else rotz(math.pi / 2)
            plank(mb, mat, c, 1.4, 0.32, 0.06, rot=rot, seed=rnd.random())
            box(mb, "stone", (c[0], c[1], c[2] - 0.44), (1.25, 0.28, 0.8) if sd == "front" else (0.28, 1.25, 0.8))


def railing(mb, rnd, p0, p1, mat="plank", h=0.95):
    L = (p1 - p0).length
    if L < 0.2:
        return
    d = (p1 - p0) / L
    n = max(1, int(L / 1.6))
    for k in range(n + 1):
        p = p0 + d * (L * k / n)
        box(mb, mat, p + Vector((0, 0, h / 2)), (0.09, 0.09, h + 0.05), uv_scale=0.5)
    ang = math.atan2(d.y, d.x)
    for zz, th in ((h, 0.06), (0.12, 0.05)):
        box(mb, mat, (p0 + p1) / 2 + Vector((0, 0, zz)), (L, 0.1 if zz == h else 0.06, th), rot=rotz(ang), uv_scale=0.5)
    nb = int(L / 0.13)
    for k in range(1, nb):
        p = p0 + d * (L * k / nb)
        box(mb, mat, p + Vector((0, 0, (h + 0.12) / 2)), (0.035, 0.035, h - 0.12), uv_scale=0.5)


def string_lights(mb, p0, p1, sag=0.18, step=0.45):
    """a festoon of bulbs from p0 to p1, sagging between them"""
    p0, p1 = Vector(p0), Vector(p1)
    L = (p1 - p0).length
    n = max(2, int(L / step))
    pts = [p0 + (p1 - p0) * (k / n) - Vector((0, 0, sag * 4 * (k / n) * (1 - k / n))) for k in range(n + 1)]
    for a, b in zip(pts[:-1], pts[1:]):
        log(mb, "iron", a, b, 0.006, seg=3, caps=False, wobble=0)
    for p in pts[1:-1]:
        box(mb, "lamp", p - Vector((0, 0, 0.05)), (0.05, 0.05, 0.07))


def plinth(mb, x0, x1, y0, y1):
    box(mb, "plinth", ((x0 + x1) / 2, (y0 + y1) / 2, -1.2), (x1 - x0 + 0.2, y1 - y0 + 0.2, 2.2), uv_scale=0.7)


# ------------------------------------------------------------------ rooms
def room(mb, rnd, x0, x1, y0, y1, style="plaster", doors_u=()):
    """a guest room inside x0..x1, y0 (the glass front) .. y1: the bed against the back wall, chairs
    and a small table by the front, a rug, a lamp on the bedside table"""
    wr = x1 - x0
    bx, by = (x0 + x1) / 2 + (0.6 if wr > 5 else 0.0), y1 - 1.1
    if y1 - y0 < 3.2:
        return
    box(mb, "plank" if style != "pine" else "pine", (bx, by, 0.17), (1.75, 2.1, 0.3), uv_scale=0.5)    # bed frame
    box(mb, "linen", (bx, by - 0.02, 0.42), (1.65, 2.0, 0.22))
    box(mb, "linen", (bx, by - 0.28, 0.555), (1.7, 1.5, 0.06))
    box(mb, "throw", (bx, by - 0.8, 0.565), (1.76, 0.45, 0.07))
    for sx in (-0.42, 0.42):
        box(mb, "linen", (bx + sx, by + 0.8, 0.6), (0.62, 0.36, 0.15))
    for sx in (-1.15, 1.15):
        if x0 + 0.3 < bx + sx < x1 - 0.3:
            box(mb, "plank", (bx + sx, y1 - 0.3, 0.27), (0.45, 0.4, 0.5), uv_scale=0.5)
            log(mb, "iron", (bx + sx, y1 - 0.3, 0.52), (bx + sx, y1 - 0.3, 0.86), 0.012, seg=5, caps=False)
            log(mb, "linen", (bx + sx, y1 - 0.3, 0.84), (bx + sx, y1 - 0.3, 1.04), 0.13, seg=10)
    box(mb, "rug", (bx, (y0 + by) / 2 - 0.2, 0.025), (min(wr - 1.0, 2.4), 1.6, 0.012), uv_scale=0.35)
    # two lounge chairs and a small round table by the glass, on the side away from the door(s)
    near_l = min([abs(u - x0) for u in doors_u] or [9])
    near_r = min([abs(u - x1) for u in doors_u] or [9])
    sd = 1 if near_l >= near_r else -1
    xa = x0 if sd > 0 else x1
    cy = y0 + 0.95
    for k, cx in enumerate((xa + sd * 0.9, xa + sd * 2.3 if wr > 3.6 else None)):
        if cx is None:
            continue
        a = 0.35 if k == 0 else -0.35
        R = rotz(a)
        o = Vector((cx, cy, 0))
        box(mb, "rattan", o + R @ Vector((0, 0, 0.36)), (0.6, 0.6, 0.08), rot=R)
        box(mb, "linen", o + R @ Vector((0, 0.02, 0.43)), (0.54, 0.54, 0.07), rot=R)
        box(mb, "rattan", o + R @ Vector((0, 0.3, 0.68)), (0.6, 0.06, 0.6), rot=R @ Matrix.Rotation(-0.25, 3, "X"))
        for sx in (-0.29, 0.29):
            box(mb, "rattan", o + R @ Vector((sx, 0, 0.3)), (0.05, 0.62, 0.05), rot=R)
            box(mb, "rattan", o + R @ Vector((sx, 0, 0.5)), (0.05, 0.55, 0.04), rot=R)
            for sy in (-0.27, 0.27):
                box(mb, "rattan", o + R @ Vector((sx, sy, 0.16)), (0.04, 0.04, 0.32), rot=R)
    tx = xa + sd * 1.6
    log(mb, "plank", (tx, y0 + 0.6, 0.5), (tx, y0 + 0.6, 0.54), 0.3, seg=14)
    log(mb, "iron", (tx, y0 + 0.6, 0.0), (tx, y0 + 0.6, 0.5), 0.02, seg=5, caps=False)


def partition(mb, x, y0, y1, hw, mat, gap=None):
    """an inner wall across the block at x; gap: the y of a doorway through it"""
    for a, b in seg_cut(y0, y1, [(gap - 0.5, gap + 0.5)] if gap is not None else []):
        box(mb, mat, (x, (a + b) / 2, hw / 2), (0.12, b - a, hw), uv_scale=0.5)
    if gap is not None:
        box(mb, mat, (x, gap, (2.1 + hw) / 2), (0.12, 1.0, hw - 2.1), uv_scale=0.5)


# ------------------------------------------------------------------ output
def finish(name, mb, M, doors, pad, rnd, masks=()):
    """masks: more ground (x0, x1, y0, y1) that the building stands over beyond its pad -- a deck
    reaching out over a bank (`<name>_mask<i>` empties: no grass or flowers through it)"""
    objs = mb.build(name, M)
    # the foot of each flight of steps (web/src/slice.js keeps the floor within their reach)
    for i, (x, y, dz) in enumerate(STEP_FEET):
        e = bpy.data.objects.new(f"{name}_step{i}", None)
        bpy.context.scene.collection.objects.link(e)
        e.location = (x, y, -dz)
        objs.append(e)
    STEP_FEET.clear()
    p = bpy.data.objects.new(f"{name}_pad", None)
    bpy.context.scene.collection.objects.link(p)
    (x0, x1, y0, y1) = pad
    p.location = ((x0 + x1) / 2, (y0 + y1) / 2, 0)
    p.scale = ((x1 - x0) / 2, (y1 - y0) / 2, 1)
    door_objs = []
    for i, (dm, hinge) in enumerate(doors):
        parts = dm.build(f"{name}_door{i}", M)
        e = bpy.data.objects.new(f"{name}_door{i}", None)
        bpy.context.scene.collection.objects.link(e)
        e.location = hinge
        for ob in parts:
            ob.parent = e
        door_objs += parts + [e]
    bpy.context.view_layer.update()
    # (the glass lets the sky in: left out of the bake, a room behind floor-to-ceiling glazing is lit
    # by it as the listings' photos show, not dark as behind a wall)
    bake_vertex_ao([o for o in objs + door_objs if o.type == "MESH" and not o.name.endswith("_glass")], samples=24, dist=2.5, sky=True, sky_minz=-0.35)
    extra = []
    for i, (mx0, mx1, my0, my1) in enumerate(masks):
        e = bpy.data.objects.new(f"{name}_mask{i}", None)
        bpy.context.scene.collection.objects.link(e)
        e.location = ((mx0 + mx1) / 2, (my0 + my1) / 2, 0)
        e.scale = ((mx1 - mx0) / 2, (my1 - my0) / 2, 1)
        extra.append(e)
    export(name, objs + door_objs + [p] + extra)


def win(u, w=1.3, z0=0.9, z1=2.05, **k):
    return dict(u=u, w=w, z0=z0, z1=z1, kind="win", **k)


def tall(u, w=2.2, z1=2.4, **k):
    return dict(u=u, w=w, z0=0.08, z1=z1, kind="tall", **k)


def door(u, w=1.0, z1=2.05, glazed=False, **k):
    return dict(u=u, w=w, z0=0.0, z1=z1, kind="gdoor" if glazed else "door", **k)


def gap(u, w=1.0, z1=2.1, **k):
    return dict(u=u, w=w, z0=0.0, z1=z1, kind="gap", **k)


# ------------------------------------------------------------------ the buildings
def lanchuan():
    """岚川, the guest block (where the user's photos 2-5 were taken; photo 1 from beside it): the left
    block with the gabled entrance porch (lounge), its plain wood railing (the far end of photo 4); the
    right block of three rooms behind the porch of photos 4/5 -- four bays of 4.25 m between round log
    posts, a lean-to under the turf, a light strip along its edge that turns the corner at the east end,
    lanterns, the red-brown railing, the 岚川 sign hung across at its west end by the entrance; the logs
    weathered dark now (the listing's photos, from its opening, show them new), the turf grown tall"""
    reset(); M = mats(); mb = MeshBuilder(); rnd = random.Random(21); doors = []
    hwL, hwR = 2.85, 2.7
    L = Block(-15.0, -2.0, -4.0, 4.0, hwL, "log", "log", "plaster", "tile", top_back=hwL + 0.45, openings={
        "front": [win(-13.2, 1.5, 0.95, 2.1, transom=False), door(-9.4, 1.3, 2.3, glazed=True), tall(-7.6, 1.2, 2.4), tall(-4.5, 2.3, 2.45)],
        "back": [win(-12.0), win(-6.0)], "left": [win(0.0, 1.2)]})
    L.build(mb, rnd, doors)
    R = Block(-2.0, 15.0, -3.4, 4.0, hwR, "log", "log", "plaster", "tile", top_back=hwR + 0.4, skip=("left",), openings={
        "front": [tall(0.6, 2.4), door(2.7, 1.0, 2.3, glazed=True), tall(5.9, 2.4), door(8.0, 1.0, 2.3, glazed=True),
                  tall(12.0, 2.6), door(14.0, 0.9, 2.3)],   # (the east room's plank door, photo 4)
        "back": [win(1.5), win(7.5), win(12.5)], "right": [win(0.3, 1.2)]})
    R.build(mb, rnd, doors)
    mono_roof(mb, rnd, -15.0, -2.0, -4.0, 4.0, hwL + 0.15, hwL + 0.6, tall=1.4)
    mono_roof(mb, rnd, -2.0, 15.0, -3.4, 4.0, hwR + 0.15, hwR + 0.55, eave_f=0.1, tall=1.4)
    # the entrance porch: a steep timber gable on two posts before the glass door
    px, pw, pd = -9.4, 3.4, 1.7
    yp0, yp1 = -4.0 - pd, -4.0
    zt, zr = hwL + 0.25, hwL + 0.25 + (pw / 2) * math.tan(math.radians(36))
    for sx in (-1, 1):
        box(mb, "plank", (px + sx * (pw / 2 - 0.1), yp0 + 0.1, zt / 2), (0.18, 0.18, zt), uv_scale=0.5)
        box(mb, "plank", (px + sx * (pw / 2 - 0.1), (yp0 + yp1) / 2, zt - 0.08), (0.14, pd, 0.18), uv_scale=0.5)
    box(mb, "plank", (px, yp0 + 0.1, zt - 0.08), (pw, 0.16, 0.18), uv_scale=0.5)
    for k in range(int((zr - zt) / 0.15) + 1):   # the boarded gable
        z = zt + 0.075 + k * 0.15
        half = (zr - z) / math.tan(math.radians(36)) + 0.12
        if half > 0.1:
            box(mb, "plank", (px, yp0 - 0.02, z), (2 * half, 0.06, 0.15), uv_scale=0.5)
    for sgn in (-1, 1):   # its two roof slopes, boards and turf edge
        a = math.radians(36)
        Ls = (pw / 2 + 0.35) / math.cos(a)
        c = Vector((px + sgn * (pw / 4 + 0.17), (yp0 + yp1) / 2 - 0.15, (zt + zr) / 2 + 0.08))
        box(mb, "plank", c, (Ls, pd + 0.5, 0.08), rot=Matrix.Rotation(sgn * a, 3, "Y"), uv_scale=0.5)
        box(mb, "plankpale", c + Vector((0, -(pd + 0.5) / 2, -0.04)), (Ls, 0.05, 0.2), rot=Matrix.Rotation(sgn * a, 3, "Y"), uv_scale=0.5)
    # the decks: by the entrance, plain wood railing and the steps at the porch; along the rooms, the
    # porch's, red-brown railing, closed at the east end, a gap and steps where the stair from the public
    # building comes up (7.5)
    deck(mb, rnd, -15.3, -2.0, -5.8, -4.0, mat="deckdark", rail=("front", "left"), steps=[(-9.4, "front")], posts_down=1.6)
    y0, y1 = -5.8, -3.4
    deck(mb, rnd, -2.0, 15.3, y0, y1, mat="deckdark", rail=("front", "right"), steps=[(7.5, "front")], posts_down=1.6, rail_mat="railred")
    tl = math.tan(math.radians(9))
    yw, ye = y1 + 0.1, y0 - 0.45
    zl = lambda y: hwR + 0.1 - (yw - y) * tl
    yp = y0 + 0.12
    zb = zl(yp) - 0.16
    xs = [-2.0 + 4.25 * k for k in range(5)]
    for i, x in enumerate(xs):
        x += 0.1 if i == 0 else -0.1 if i == 4 else 0.0
        log(mb, "log", (x, yp, 0.0), (x, yp, zb - 0.08), 0.11, seg=8, seed=rnd.random(), end_mat="logend")
        for sg in (-1, 1):
            if -2.1 < x + sg * 0.5 < 15.1:
                log(mb, "log", (x, yp, zb - 0.68), (x + sg * 0.5, yp, zb - 0.12), 0.045, seg=6, seed=rnd.random())
    pa, pb = -2.45, 15.45
    log(mb, "log", (pa, yp, zb), (pb, yp, zb), 0.12, seg=10, seed=rnd.random(), end_mat="logend")
    for i in range(13):
        x = pa + 0.05 + (pb - pa - 0.1) * i / 12
        log(mb, "log", (x, yw, zl(yw) - 0.09), (x, ye, zl(ye) - 0.09), 0.06, seg=6, seed=rnd.random(), end_mat="logend")
    sl = math.hypot(yw - ye, zl(yw) - zl(ye))
    ang = math.atan2(zl(yw) - zl(ye), yw - ye)
    xm = (pa + pb) / 2
    box(mb, "plank", (xm, (yw + ye) / 2, (zl(yw) + zl(ye)) / 2), (pb - pa, sl, 0.06), rot=Matrix.Rotation(ang, 3, "X"), uv_scale=0.5)
    sod_slope(mb, pa, pb, yw, ye, zl(yw) + 0.03, zl(ye) + 0.03, rnd, tall=0.5, blades=True)
    box(mb, "plank", (xm, ye, zl(ye) - 0.03), (pb - pa + 0.05, 0.06, 0.22), uv_scale=0.5)          # fascia
    box(mb, "plank", (pb, (yw + ye) / 2, (zl(yw) + zl(ye)) / 2 - 0.05), (0.06, sl, 0.2), rot=Matrix.Rotation(ang, 3, "X"), uv_scale=0.5)
    zs = zl(ye) - 0.17
    log(mb, "lamp", (pa, ye + 0.06, zs), (pb - 0.06, ye + 0.06, zs), 0.018, seg=5, caps=False)          # the light strip
    log(mb, "lamp", (pb - 0.06, ye + 0.06, zs), (pb - 0.06, yw - 0.1, zl(yw - 0.1) - 0.17), 0.018, seg=5, caps=False)
    for x in (4.4, 12.9):
        cabin.lantern(mb, (x, y1 - 0.9, zl(y1 - 0.9) - 0.06), seed=rnd.random())
    xsg = -1.0   # the sign, hung across the porch at its west end, by the entrance
    box(mb, "plankpale", (xsg, y1 - 0.8, 2.15), (0.05, 1.1, 0.4), uv_scale=0.5)
    for yy in (y1 - 1.2, y1 - 0.4):
        log(mb, "iron", (xsg, yy, 2.3), (xsg, yy, zl(yy) - 0.05), 0.008, seg=4, caps=False)
    plinth(mb, -15.0, 15.0, -4.0, 4.0)
    # rooms: the lounge in the left block (sofa, armchairs), three guest rooms on the right
    box(mb, "linen", (-12.5, 2.8, 0.25), (2.6, 0.9, 0.5)); box(mb, "linen", (-12.5, 3.25, 0.65), (2.6, 0.25, 0.5))
    for sx in (-1.4, 1.4):
        box(mb, "linen", (-12.5 + sx, 2.85, 0.4), (0.25, 0.9, 0.3))
    log(mb, "plank", (-12.3, 1.2, 0.38), (-12.3, 1.2, 0.42), 0.5, seg=16)
    box(mb, "rug", (-12.3, 1.4, 0.02), (3.0, 2.2, 0.012), uv_scale=0.35)
    room(mb, rnd, -6.6, -2.2, -3.8, 3.8, doors_u=(-6.6,))
    partition(mb, -6.6, -3.85, 3.85, hwL, "plaster", gap=-2.6)
    for xa, xb in ((-1.85, 4.3), (4.3, 9.9), (9.9, 14.85)):
        room(mb, rnd, xa + 0.1, xb - 0.1, -3.25, 3.85, doors_u=R.doors_u(xa, xb))
    for xp in (4.3, 9.9):
        partition(mb, xp, -3.25, 3.85, hwR, "plaster")
    finish("gh_lanchuan", mb, M, doors, (-15.5, 15.6, -6.0, 4.3), rnd)


def lanchuan_lodge():
    """岚川: the public building, 25 m, one open hall inside (the user). Its west 9 m under roofing felt
    is the dining room; the way in is a long steep flight up the cosmos bank from the road to a landing at
    the west end of the turf-roofed part, beside the dining room, and check-in is just inside the door; then the lounge; at
    the east end, behind a partition, the laundry and a store. The turf grown tall with seeding grass,
    the felt held by battens, as photo 1 sees them from beside the guest block above; a doorway at the
    back where the stair down from the guest block arrives. Small square windows behind; pale gables."""
    reset(); M = mats(); mb = MeshBuilder(); rnd = random.Random(22); doors = []
    wl, we = 9.0, 16.4
    w = wl + we
    d, hw = 7.0, 3.0
    x0, xj, x1 = -w / 2, -w / 2 + wl, w / 2      # west end, the joint, east end
    xd = xj + 1.4                                 # the door, at the head of the steps
    xp = x1 - 4.6                                 # the service rooms' partition
    xg = xj - 0.9                                 # the back doorway (the stair from the guest block)
    E = Block(xj, x1, -d / 2, d / 2, hw, "log", "log", "plasterw", "plank", openings={
        "front": [door(xd, 1.2, 2.3, glazed=True), tall(xj + 4.4, 2.0, 2.4), tall(xj + 7.6, 2.0, 2.4), tall(xj + 10.6, 1.6, 2.4),
                  win(x1 - 3.4, 1.0), win(x1 - 1.3, 1.0)],
        "back": [win(xj + 3.0, 0.8, 1.15, 1.85, transom=False), win(xj + 7.0, 0.8, 1.15, 1.85, transom=False),
                 win(xj + 10.5, 0.8, 1.15, 1.85, transom=False), win(x1 - 2.3, 0.8, 1.15, 1.85, transom=False)],
        "right": [win(0.0, 1.0)], "left": [gap(0.0, 3.4, 2.45)]})   # (open into the dining room)
    E.build(mb, rnd, doors)
    Wb = Block(x0, xj, -d / 2, d / 2, hw, "log", "log", "pine", "plank", skip=("right",), openings={
        "front": [tall(x0 + 1.9, 2.2, 2.45), tall(x0 + 4.5, 2.2, 2.45), tall(x0 + 7.1, 2.2, 2.45)],
        "back": [win(x0 + 2.5, 0.8, 1.15, 1.85, transom=False), gap(xg, 1.0, 2.1)],
        "left": [win(0.0, 1.0)]})
    Wb.build(mb, rnd, doors)
    gable_roof(mb, rnd, xj, x1, -d / 2, d / 2, hw, 20, "sod", "board", "plankpale", eave=0.5, goh=0.45, sod_tall=1.4)
    gable_roof(mb, rnd, x0, xj, -d / 2, d / 2, hw, 20, "felt", "board", "plankpale", eave=0.5, goh=0.45)
    plinth(mb, x0, x1, -d / 2, d / 2)
    # the landing before the door, plain wood railing, and the long steep flight down the cosmos bank
    # towards the road (the user: much steeper than a path, and longer -- twelve steps of 20 cm on 30 cm)
    yl = -d / 2 - 2.0
    NF = 12
    deck(mb, rnd, xd - 1.4, xd + 1.4, yl, -d / 2, mat="plank", rail=("front", "left", "right"), steps=[(xd, "front", NF)], posts_down=2.6)
    cabin.lantern(mb, (xd + 0.95, -d / 2 - 0.25, 2.65), seed=rnd.random())
    log(mb, "iron", (xd + 0.95, -d / 2 - 0.15, 2.65), (xd + 0.95, -d / 2 - 0.27, 2.65), 0.015, seg=4)
    def chair(o, a):
        R = rotz(a)
        box(mb, "rattan", o + Vector((0, 0, 0.44)), (0.44, 0.44, 0.05), rot=R)
        box(mb, "rattan", o + R @ Vector((0, 0.2, 0.72)), (0.44, 0.04, 0.5), rot=R)
        for sx in (-0.18, 0.18):
            for sy in (-0.18, 0.18):
                box(mb, "rattan", o + R @ Vector((sx, sy, 0.21)), (0.035, 0.035, 0.42), rot=R)
    # the dining room: four tables for six
    for tx, ty in ((x0 + 2.3, -1.4), (x0 + 6.3, -1.4), (x0 + 2.3, 1.7), (x0 + 6.3, 1.7)):
        box(mb, "plank", (tx, ty, 0.74), (1.9, 0.9, 0.05), uv_scale=0.5)
        for sx in (-0.8, 0.8):
            for sy in (-0.36, 0.36):
                box(mb, "plank", (tx + sx, ty + sy, 0.36), (0.06, 0.06, 0.72), uv_scale=0.5)
        for sx in (-0.6, 0.0, 0.6):
            chair(Vector((tx + sx, ty - 0.75, 0)), math.pi)
            chair(Vector((tx + sx, ty + 0.75, 0)), 0.0)
    # check-in: the desk to the right of the door, facing it
    box(mb, "pine", (xd + 2.6, -0.5, 0.55), (2.4, 0.6, 1.1), uv_scale=0.5)
    box(mb, "plank", (xd + 2.6, -0.52, 1.12), (2.5, 0.68, 0.05), uv_scale=0.5)
    box(mb, "pine", (xd + 2.6, 0.9, 0.9), (2.4, 0.4, 1.8), uv_scale=0.5)            # shelves behind it
    # the lounge: sofas round a low table on a rug
    lx_ = xj + 9.0
    box(mb, "rug", (lx_, 0.4, 0.02), (3.2, 2.6, 0.012), uv_scale=0.35)
    log(mb, "plank", (lx_, 0.4, 0.38), (lx_, 0.4, 0.42), 0.45, seg=14)
    for sy, a in ((2.05, 0.0), (-1.25, math.pi)):
        box(mb, "linen", (lx_, 0.4 + sy * 0.8, 0.25), (2.4, 0.85, 0.5))
        box(mb, "linen", (lx_, 0.4 + sy * 0.8 + (0.32 if sy > 0 else -0.32), 0.65), (2.4, 0.22, 0.5))
    # the laundry (behind) and a store (in front), off the hall through doorways
    partition(mb, xp, -d / 2, d / 2, hw, "plasterw", gap=1.6)
    box(mb, "plasterw", ((xp + 1.1 + x1) / 2, 0.0, hw / 2), (x1 - xp - 1.1, 0.12, hw), uv_scale=0.5)
    box(mb, "plasterw", (xp + 0.55, 0.0, (2.1 + hw) / 2), (1.0, 0.12, hw - 2.1), uv_scale=0.5)
    for k in range(3):   # washing machines and a dryer along the back
        box(mb, "plasterw", (xp + 1.2 + k * 0.75, d / 2 - 0.55, 0.43), (0.62, 0.62, 0.86))
        box(mb, "iron", (xp + 1.2 + k * 0.75, d / 2 - 0.86, 0.5), (0.36, 0.02, 0.36))
    box(mb, "pine", (x1 - 0.5, 1.8, 1.0), (0.5, 2.4, 2.0), uv_scale=0.5)
    for k in range(4):   # store shelves
        box(mb, "pine", (xp + 2.2, -d / 2 + 0.45, 0.3 + k * 0.5), (3.6, 0.5, 0.04), uv_scale=0.5)
    finish("gh_lanchuan_lodge", mb, M, doors, (x0 - 0.6, x1 + 0.6, -d / 2 - 0.3, d / 2 + 0.6), rnd,
           masks=[(xd - 1.7, xd + 1.7, yl - 0.3, -d / 2), (xd - 0.9, xd + 0.9, yl - 0.3 - NF * 0.3, yl - 0.3)])


def fj_shed():
    """梵净山舍: the long sheep shed of the 2013 imagery, dug into the slope, made into six rooms"""
    reset(); M = mats(); mb = MeshBuilder(); rnd = random.Random(33); doors = []
    w, d, hw = 40.0, 7.0, 2.45
    xs = [-w / 2 + w * (k + 0.5) / 6 for k in range(6)]
    front = []
    for k, x in enumerate(xs):
        front += [door(x - 1.6, 0.95, 2.0, leaf="plankpale"), win(x + 0.4, 1.6, 0.85, 1.95, frame="plankpale"), win(x + 2.4, 0.9, 1.0, 1.75, frame="plankpale")]
    B = Block(-w / 2, w / 2, -d / 2, d / 2, hw, "log", "loggrey", "plasterw", "plank", top_back=hw + 0.35, openings={"front": front})
    B.build(mb, rnd, doors)
    mono_roof(mb, rnd, -w / 2, w / 2, -d / 2, d / 2, hw + 0.12, hw + 0.5, eave=0.5, goh=0.3, fascia="loggrey")
    plinth(mb, -w / 2, w / 2, -d / 2, d / 2)
    # a plank walk along the front, steps at both ends
    deck(mb, rnd, -w / 2 - 0.3, w / 2 + 0.3, -d / 2 - 1.3, -d / 2, mat="plankpale", steps=[(-w / 2 + 2.0, "front"), (w / 2 - 2.0, "front")], posts_down=1.0)
    for k in range(5):
        partition(mb, -w / 2 + w * (k + 1) / 6, -d / 2, d / 2, hw, "plasterw")
    for k in range(6):
        a, b = -w / 2 + w * k / 6, -w / 2 + w * (k + 1) / 6
        room(mb, rnd, a + 0.2, b - 0.2, -d / 2 + 0.2, d / 2 - 0.2, "plasterw", B.doors_u(a, b))
    finish("gh_fj_shed", mb, M, doors, (-w / 2 - 0.5, w / 2 + 0.5, -d / 2 - 1.5, d / 2 + 0.6), rnd)


def fj_lodge():
    """梵净山舍: log lodge on posts, a railed deck the length of it, steps at the right end, lights"""
    reset(); M = mats(); mb = MeshBuilder(); rnd = random.Random(34); doors = []
    w, d, hw = 22.0, 7.0, 2.7
    front = []
    for k in range(4):
        x = -w / 2 + w * (k + 0.5) / 4
        front += [door(x - 1.3, 0.95), win(x + 0.7, 1.6, 0.85, 2.05)]
    B = Block(-w / 2, w / 2, -d / 2, d / 2, hw, "log", "log", "plasterw", "plank", openings={
        "front": front, "back": [win(-w / 4), win(w / 4)], "left": [win(0.0, 1.1)], "right": [win(0.0, 1.1)]})
    B.build(mb, rnd, doors)
    zr = gable_roof(mb, rnd, -w / 2, w / 2, -d / 2, d / 2, hw, 22, "shingle", "log", "log", eave=0.6)
    plinth(mb, -w / 2, w / 2, -d / 2, d / 2)
    dy0 = -d / 2 - 2.4
    deck(mb, rnd, -w / 2 - 0.3, w / 2 + 2.4, dy0, -d / 2, mat="plank", rail=("front", "left", "right"), steps=[(w / 2 + 1.2, "front")], posts_down=2.4)
    for u0, u1 in seg_cut(-w / 2 - 0.3, w / 2 + 2.4, [(w / 2 + 1.2 - 0.8, w / 2 + 1.2 + 0.8)]):   # the festoon along the rail (not over the steps)
        n = max(1, round((u1 - u0) / 3.0))
        for k in range(n):
            string_lights(mb, (u0 + (u1 - u0) * k / n, dy0 + 0.06, 1.0), (u0 + (u1 - u0) * (k + 1) / n, dy0 + 0.06, 1.0), sag=0.12)
    string_lights(mb, (-w / 2 - 0.4, -d / 2 - 0.62, hw + 0.05), (w / 2 + 0.4, -d / 2 - 0.62, hw + 0.05), sag=0.06, step=0.5)
    for k in range(3):
        partition(mb, -w / 2 + w * (k + 1) / 4, -d / 2, d / 2, hw, "plasterw")
    for k in range(4):
        a, b = -w / 2 + w * k / 4, -w / 2 + w * (k + 1) / 4
        room(mb, rnd, a + 0.25, b - 0.25, -d / 2 + 0.25, d / 2 - 0.25, "plasterw", B.doors_u(a, b))
    finish("gh_fj_lodge", mb, M, doors, (-w / 2 - 0.5, w / 2 + 2.6, dy0 - 0.2, d / 2 + 0.6), rnd)


def fj_hut():
    """梵净山舍: the little log hut by the gate, corrugated iron roof, arched double doors"""
    reset(); M = mats(); mb = MeshBuilder(); rnd = random.Random(35); doors = []
    w, d, hw = 6.0, 5.5, 2.5
    B = Block(-w / 2, w / 2, -d / 2, d / 2, hw, "log", "log", "pine", "plank", openings={
        "front": [door(-0.55, 0.9, 2.0), door(0.45, 0.9, 2.0), win(2.0, 0.8, 1.0, 1.8)],
        "left": [win(0.0, 1.0)], "right": [win(0.0, 1.0)]})
    B.build(mb, rnd, doors)
    for k in range(9):   # the arch over the doors
        a0, a1 = math.pi * k / 9, math.pi * (k + 1) / 9
        p0 = Vector((-0.05 + 1.0 * math.cos(a0), -d / 2 - 0.2, 2.05 + 0.4 * math.sin(a0)))
        p1 = Vector((-0.05 + 1.0 * math.cos(a1), -d / 2 - 0.2, 2.05 + 0.4 * math.sin(a1)))
        box(mb, "plank", (p0 + p1) / 2, ((p1 - p0).length + 0.02, 0.06, 0.12), rot=Matrix.Rotation(math.atan2(p1.z - p0.z, p1.x - p0.x), 3, "Y").transposed(), uv_scale=0.5)
    gable_roof(mb, rnd, -w / 2, w / 2, -d / 2, d / 2, hw, 24, "metal", "log", "log", mat="metalgrey", eave=0.5)
    plinth(mb, -w / 2, w / 2, -d / 2, d / 2)
    deck(mb, rnd, -w / 2, w / 2, -d / 2 - 1.6, -d / 2, mat="plank", rail=("left", "right"), steps=[(-0.05, "front")], posts_down=1.2)
    box(mb, "plank", (0, d / 2 - 0.5, 0.45), (3.5, 0.6, 0.9), uv_scale=0.5)   # a counter
    finish("gh_fj_hut", mb, M, doors, (-w / 2 - 0.3, w / 2 + 0.3, -d / 2 - 1.8, d / 2 + 0.5), rnd)


def qk_long():
    """青空冀翼: the long cabin, a row of tall windows behind a railed deck, rust-brown iron roof"""
    reset(); M = mats(); mb = MeshBuilder(); rnd = random.Random(41); doors = []
    w, d, hw = 20.0, 6.5, 2.75
    front = [tall(-8.2, 1.6, 2.35), door(-6.6, 1.0, 2.3, glazed=True), tall(-3.4, 1.8, 2.35), tall(-0.6, 1.8, 2.35),
             door(1.2, 1.0, 2.3, glazed=True), tall(3.6, 1.8, 2.35), tall(6.4, 1.8, 2.35), door(8.3, 1.0, 2.3, glazed=True)]
    B = Block(-w / 2, w / 2, -d / 2, d / 2, hw, "log", "logpale", "plasterw", "tile", openings={
        "front": front, "back": [win(-6), win(0), win(6)], "left": [tall(0.0, 1.8, 2.35)], "right": [win(0.0, 1.2)]})
    B.build(mb, rnd, doors)
    gable_roof(mb, rnd, -w / 2, w / 2, -d / 2, d / 2, hw, 20, "metal", "log", "logpale", mat="metalbrown", eave=0.6)
    plinth(mb, -w / 2, w / 2, -d / 2, d / 2)
    deck(mb, rnd, -w / 2 - 2.0, w / 2 + 0.3, -d / 2 - 2.2, -d / 2, mat="plankpale", rail=("front", "left"), steps=[(0.0, "front"), (w / 2 - 0.9, "front")], posts_down=1.6, rail_mat="plankpale")
    deck(mb, rnd, -w / 2 - 2.0, -w / 2, -d / 2, d / 2 - 0.5, mat="plankpale", rail=("left",), posts_down=1.6, rail_mat="plankpale")
    for xp in (-5.0, 2.4):
        partition(mb, xp, -d / 2, d / 2, hw, "plasterw")
    for a, b in ((-w / 2, -5.0), (-5.0, 2.4), (2.4, w / 2)):
        room(mb, rnd, a + 0.25, b - 0.25, -d / 2 + 0.25, d / 2 - 0.25, "plasterw", B.doors_u(a, b))
    finish("gh_qk_long", mb, M, doors, (-w / 2 - 2.2, w / 2 + 0.5, -d / 2 - 2.4, d / 2 + 0.6), rnd)


def qk_cabin():
    """青空冀翼: a shorter cabin, two rooms behind ochre doors"""
    reset(); M = mats(); mb = MeshBuilder(); rnd = random.Random(42); doors = []
    w, d, hw = 12.5, 6.0, 2.6
    B = Block(-w / 2, w / 2, -d / 2, d / 2, hw, "log", "logpale", "plasterw", "tile", openings={
        "front": [win(-4.4, 1.2), door(-2.3, 1.0, leaf="ochre"), door(2.3, 1.0, leaf="ochre"), win(4.4, 1.2)],
        "back": [win(-3.0), win(3.0)], "left": [win(0.0, 1.1)], "right": [win(0.0, 1.1)]})
    B.build(mb, rnd, doors)
    gable_roof(mb, rnd, -w / 2, w / 2, -d / 2, d / 2, hw, 24, "shingle", "log", "logpale", eave=0.55)
    plinth(mb, -w / 2, w / 2, -d / 2, d / 2)
    deck(mb, rnd, -w / 2 - 0.2, w / 2 + 0.2, -d / 2 - 1.4, -d / 2, mat="plankpale", steps=[(-2.3, "front"), (2.3, "front")], posts_down=1.4)
    partition(mb, 0.0, -d / 2, d / 2, hw, "plasterw")
    room(mb, rnd, -w / 2 + 0.25, -0.15, -d / 2 + 0.25, d / 2 - 0.25, "plasterw", B.doors_u(-w / 2, 0))
    room(mb, rnd, 0.15, w / 2 - 0.25, -d / 2 + 0.25, d / 2 - 0.25, "plasterw", B.doors_u(0, w / 2))
    finish("gh_qk_cabin", mb, M, doors, (-w / 2 - 0.4, w / 2 + 0.4, -d / 2 - 1.6, d / 2 + 0.6), rnd)


def tl_main():
    """听岚山庄: the board house on the hilltop, a deep porch on posts over the slope, green roof"""
    reset(); M = mats(); mb = MeshBuilder(); rnd = random.Random(51); doors = []
    w, d, hw = 13.0, 8.0, 2.8
    B = Block(-w / 2, w / 2, -d / 2, d / 2, hw, "board", "boardbrown", "pine", "pine", openings={
        "front": [tall(-4.3, 2.4, 2.3), door(-1.6, 1.0, 2.1, glazed=True), tall(1.6, 2.6, 2.3), win(5.0, 1.4)],
        "back": [win(-3.5), win(1.5), win(4.5)], "left": [win(-1.5), win(1.5)], "right": [win(0.0, 1.4)]})
    B.build(mb, rnd, doors)
    zr = gable_roof(mb, rnd, -w / 2, w / 2, -d / 2, d / 2, hw, 26, "metal", "board", "boardbrown", mat="metalgreen", eave=0.5)
    plinth(mb, -w / 2, w / 2, -d / 2, d / 2)
    pd = 3.2
    y0 = -d / 2 - pd
    deck(mb, rnd, -w / 2, w / 2, y0, -d / 2, mat="plank", rail=("front", "left", "right"), steps=[(-w / 2 + 0.9, "front")], posts_down=3.2, rail_mat="plank")
    zp = hw + 0.2
    for k in range(5):   # porch posts, beam, lean-to roof in green iron
        x = -w / 2 + 0.15 + (w - 0.3) * k / 4
        box(mb, "plank", (x, y0 + 0.15, zp / 2), (0.16, 0.16, zp), uv_scale=0.5)
    box(mb, "plank", (0, y0 + 0.15, zp), (w + 0.3, 0.2, 0.22), uv_scale=0.5)
    zt = hw + 0.75
    corrugated(mb, "metalgreen", -w / 2 - 0.3, w / 2 + 0.3, (-d / 2 + 0.1, zt), (y0 - 0.4, zp + 0.12 - 0.4 * (zt - zp) / pd), (-0.15, 0.99))
    box(mb, "plank", (0, (-d / 2 + y0) / 2, (zt + zp) / 2 - 0.02), (w + 0.4, pd + 0.3, 0.05), rot=Matrix.Rotation(math.atan2(zt - zp, pd), 3, "X"), uv_scale=0.5)
    partition(mb, 0.0, -d / 2, d / 2, hw, "pine", gap=-1.6)
    room(mb, rnd, -w / 2 + 0.25, -0.2, -d / 2 + 0.25, d / 2 - 0.25, "pine", B.doors_u(-w / 2, 0))
    box(mb, "rug", (3.5, 0.0, 0.02), (3.0, 2.2, 0.012), uv_scale=0.35)
    log(mb, "pine", (3.5, 0.3, 0.4), (3.5, 0.3, 0.45), 0.45, seg=14)
    for a in (0.0, 2.1, 4.2):
        box(mb, "rattan", (3.5 + 1.0 * math.cos(a), 0.3 + 1.0 * math.sin(a), 0.22), (0.5, 0.5, 0.44))
    finish("gh_tl_main", mb, M, doors, (-w / 2 - 0.3, w / 2 + 0.3, y0 - 0.3, d / 2 + 0.6), rnd)


def tl_wing():
    """听岚山庄: a guest wing, four rooms off a railed deck"""
    reset(); M = mats(); mb = MeshBuilder(); rnd = random.Random(52); doors = []
    w, d, hw = 18.0, 6.5, 2.7
    front = []
    for k in range(4):
        x = -w / 2 + w * (k + 0.5) / 4
        front += [door(x - 1.1, 0.95, 2.05, glazed=True), tall(x + 0.8, 1.8, 2.25)]
    B = Block(-w / 2, w / 2, -d / 2, d / 2, hw, "board", "boardbrown", "pine", "pine", openings={
        "front": front, "back": [win(-6), win(-2), win(2), win(6)], "left": [win(0, 1.1)], "right": [win(0, 1.1)]})
    B.build(mb, rnd, doors)
    gable_roof(mb, rnd, -w / 2, w / 2, -d / 2, d / 2, hw, 24, "metal", "board", "boardbrown", mat="metalgreen", eave=0.55)
    plinth(mb, -w / 2, w / 2, -d / 2, d / 2)
    deck(mb, rnd, -w / 2, w / 2, -d / 2 - 2.0, -d / 2, mat="plank", rail=("front", "left", "right"), steps=[(0.0, "front")], posts_down=2.4)
    for k in range(3):
        partition(mb, -w / 2 + w * (k + 1) / 4, -d / 2, d / 2, hw, "pine")
    for k in range(4):
        a, b = -w / 2 + w * k / 4, -w / 2 + w * (k + 1) / 4
        room(mb, rnd, a + 0.25, b - 0.25, -d / 2 + 0.25, d / 2 - 0.25, "pine", B.doors_u(a, b))
    finish("gh_tl_wing", mb, M, doors, (-w / 2 - 0.3, w / 2 + 0.3, -d / 2 - 2.2, d / 2 + 0.6), rnd)


ALL = {"lanchuan": lanchuan, "lanchuan_lodge": lanchuan_lodge, "fj_shed": fj_shed, "fj_lodge": fj_lodge, "fj_hut": fj_hut,
       "qk_long": qk_long, "qk_cabin": qk_cabin, "tl_main": tl_main, "tl_wing": tl_wing}

if __name__ == "__main__":
    which = sys.argv[-1]
    for k, f in ALL.items():
        if which in (k, "all"):
            f()
