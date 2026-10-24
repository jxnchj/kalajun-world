"""Build web/public/data/objects.json: yurts, cabins, boardwalks, fences, horses, swing.

Positions come from (a) pixels picked in the calibrated photos and projected onto the
terrain (tools/photo_project.py), (b) the pre-tourism layout hand-traced from 2013 satellite
imagery (data/layout/trace_2013.txt: herder houses, sheep sheds, walled yards, folds, hay-field
fences, yurt rings, tracks), and (c) the photo-1 yurt detections (data/yurts_photo1.json).
The photographed places (lodge, photo-2 cabin + boardwalk, photo-8 camp, yurt camp, swing) are
kept as they are today; traced buildings too close to them are dropped, modern items skipped.
"""
import json, math, struct, sys
import numpy as np
sys.path.insert(0, "tools")
from photo_project import project, height, CAMS
from extent import cx, cy
from viewpoint import TO_UTM

PV = 4096 / 1400  # preview (1400 px wide) -> full-res scale


def pj(photo, u, v, preview=True):
    """project a picked pixel; objects on a skyline the smoothed DEM misses are nudged
    down a few pixels until the ray meets the ground"""
    s = PV if preview else 1.0
    w, h = (4096, 3072) if CAMS[photo]["aspect"] > 1 else (3072, 4096)
    for dv in range(0, 60, 4):
        r = project(photo, u * s, (v + dv) * s, w, h)
        if r:
            return r[0], r[1]
    raise ValueError((photo, u, v))


def rng(photo, u, dist):
    """point `dist` metres out along the bearing of preview column u (range from apparent size;
    used for nearby objects, where the smoothed DEM can't resolve the ground the photographer saw)"""
    c = CAMS[photo]
    fpx = 700 / math.tan(math.radians(c["hfov"] / 2))
    b = math.radians(c["yaw"] + math.degrees(math.atan((u - 700) / fpx)))
    return c["x"] + math.sin(b) * dist, c["z"] - math.cos(b) * dist


def size_range(photo, px, metres):
    """distance of an object `metres` across that spans `px` preview pixels"""
    fpx = 700 / math.tan(math.radians(CAMS[photo]["hfov"] / 2))
    return metres / (px / fpx)


def bearing_axis(deg):
    """unit vector (x east, z south) for a compass bearing"""
    a = math.radians(deg)
    return math.sin(a), -math.cos(a)


def rot_x_to(bearing):
    """rotation about +y (radians) that turns an object's local +x toward a compass bearing;
    its local +z (the front of cabins, yurts' doors) then faces bearing + 90°"""
    b = math.radians(bearing)
    return math.atan2(math.cos(b), math.sin(b))


def contour_angle(x, z):
    """long axis along the contour, front facing downhill"""
    e = 6.0
    gx = height(x + e, z) - height(x - e, z)
    gz = height(x, z + e) - height(x, z - e)
    return math.atan2(-gx, -gz) if abs(gx) + abs(gz) > 1e-3 else 0.0


P1, P2, P6, P7, P8 = "private-photo", "private-photo", "private-photo", "private-photo", "private-photo"
objs = {"yurts": [], "cabins": [], "boardwalks": [], "paths": [], "fences": [], "horses": [], "swings": []}

# --- yurts: photo 1 detections + photo 8 ---
for y in json.load(open("data/yurts_photo1.json")):
    objs["yurts"].append(dict(x=y["x"], z=y["z"], r=3.2, src="photo1"))
# photo 8: the big yurt spans 153 px for ~7.2 m; the twin yurts ~45 px each for ~5.6 m
p8 = []
for u, px, r in [(380, 153, 3.6), (222, 45, 2.8), (257, 45, 2.8)]:
    x, z = rng(P8, u, size_range(P8, px, 2 * r) + r)
    p8.append([x, z, r])
# the twins overlap in the photo (one stands a little behind the other): as placed by column they
# would interpenetrate, so they are spread apart about their middle until their decks (the yurt
# radius x 4.7 / 3.6, web/src/slice.js) clear each other by a metre
(ax, az, ra), (bx, bz, rb) = p8[1], p8[2]
d = math.hypot(bx - ax, bz - az)
need = (ra + rb) * 4.7 / 3.6 + 1.0
if d < need:
    ux, uz, mx, mz = (bx - ax) / d, (bz - az) / d, (ax + bx) / 2, (az + bz) / 2
    p8[1][:2] = mx - ux * need / 2, mz - uz * need / 2
    p8[2][:2] = mx + ux * need / 2, mz + uz * need / 2
for x, z, r in p8:
    objs["yurts"].append(dict(x=round(x, 1), z=round(z, 1), r=r, src="photo8", deck=True))

# --- cabins ---
def cabin(x, z, w, d, rot, src, **kw):
    objs["cabins"].append(dict(x=round(x, 1), z=round(z, 1), w=w, d=d, rot=round(rot, 3), src=src, **kw))

# the long lodge of photos 4/5 (axis along photo 5's view, porch on the south side);
# photo 1 sees its roof at bearing 208.7°, 77 m away, which pins the same spot
bx, bz = bearing_axis(208.7)
lx, lz = CAMS[P1]["x"] + bx * 77, CAMS[P1]["z"] + bz * 77
# 25.4 m long (岚川's old lodge; the user remembers about 25 m): photo 5, from the sign at the porch's
# west end, counts its posts to the east end -- four bays of ~4.1 m (scaled by the man at the second
# post, the railing, the beam), photo 4 the same from that end back; photo 1 shows the felt-roofed
# west part beyond. Its east end kept where the 40 m estimate had it (photo 5's position, 15 m from
# it, agrees), the west end then where the 2022 imagery shows a corner's shadow
# Where: the satellite views (Esri 2022, Amap) show it only by the shadows of its north and west walls
# (its turf is the meadow's colour), an L whose corner is at about (-2004.6, 3447.3) -- 5 m south of the
# photo fit -- and the stair from the block reaches its back there
ax, az = bearing_axis(103.9)
nx_, nz_ = bearing_axis(103.9 + 90)   # (its front)
lx, lz = -2004.6 + ax * 12.7 + nx_ * 3.5, 3447.3 + az * 12.7 + nz_ * 3.5
cabin(lx, lz, 25.4, 7, rot_x_to(103.9), "photo1+4+5", porch=2.4, lights=True, kind="lodge")
# photo 2: the small cabin at the end of the boardwalk; ridge across the view
# its 2 m door spans ~60 px -> facade ~31 m away; centre 3.3 m further
d2 = size_range(P2, 60, 2.0)
fx, fz = rng(P2, 895, d2 + 3.3)
cabin(fx, fz, 9, 6.5, rot_x_to(CAMS[P2]["yaw"] + 90), "photo2", lights=True)
# photo 8 camp: long sod-roof house with deck, two small cabins
# long house: ~4.5 m eave-to-ground spans 57 px -> ~76 m; facade 745..1066 px wide
d8 = size_range(P8, 57, 4.5)
xa, za = rng(P8, 745, d8); xb, zb = rng(P8, 1066, d8)
vx, vz = bearing_axis(CAMS[P8]["yaw"])
cabin((xa + xb) / 2 + vx * 4, (za + zb) / 2 + vz * 4, round(math.hypot(xb - xa, zb - za), 1), 8,
      rot_x_to(math.degrees(math.atan2(xb - xa, -(zb - za)))), "photo8", porch=2.2, lights=True, kind="lodge")
for u, px, w, d in [(300, 24, 11, 6), (525, 32, 6, 5)]:   # ~4 m tall cabins
    x, z = rng(P8, u, size_range(P8, px, 4.0))
    cabin(x, z, w, d, rot_x_to(CAMS[P8]["yaw"] + 90), "photo8")
# photo 1: cabins among the yurts (full-res pixels picked on the gridded crops)
for u, v, w in [(820, 1686, 12), (1110, 1700, 10), (1670, 1652, 18), (2308, 1860, 12), (2678, 1750, 14), (3168, 1694, 12)]:
    r = project(P1, u, v, 4096, 3072)
    cabin(r[0], r[1], w, 6.5, contour_angle(r[0], r[1]), "photo1")
# --- pre-tourism layout (2013 imagery) ---
def parse_trace(path):
    out = {"T": [], "H": [], "P": [], "Q": [], "F": [], "Y": [], "U": []}
    for ln in open(path):
        ln = ln.split("#")[0].strip()
        if not ln:
            continue
        k, *rest = ln.split()
        if k == "T":
            out["T"].append((rest[0], [tuple(map(float, q.split(","))) for q in rest[1:]]))
        elif k in ("F", "Y"):
            out[k].append([tuple(map(float, q.split(","))) for q in rest])
        elif k == "H":
            out["H"].append((rest[0], *map(float, rest[1:])))
        elif k in ("P", "Q", "U"):
            out[k].append(tuple(map(float, rest)))
    return out


def jitter(x, z, k=0):
    return (math.sin(x * 12.9898 + z * 78.233 + k * 3.1) * 43758.5453) % 1.0


def clear_of_photo(x, z, r=0.0):
    """far enough from what the photos show (those stay exactly as photographed)"""
    for o in objs["cabins"]:
        if o["src"].startswith("photo") and math.hypot(x - o["x"], z - o["z"]) < max(o["w"], o["d"]) / 2 + 12 + r:
            return False
    return all(math.hypot(x - y["x"], z - y["z"]) > 10 + r for y in objs["yurts"])


def ring(x, z, rad, n=None):
    n = n or max(8, int(2 * math.pi * rad / 2.6))
    return [[round(x + math.cos(2 * math.pi * i / n) * rad, 1), round(z + math.sin(2 * math.pi * i / n) * rad, 1)] for i in range(n + 1)]


def rect(x, z, w, d, rot):
    c, s_ = math.cos(rot), math.sin(rot)
    pts = []
    for u, v in ((-w / 2, -d / 2), (w / 2, -d / 2), (w / 2, d / 2), (-w / 2, d / 2), (-w / 2, -d / 2)):
        pts.append([round(x + u * c + v * s_, 1), round(z - u * s_ + v * c, 1)])
    return pts


def local(x, z, rot, u, v):
    """point u along the building's long axis, v toward its back"""
    c, s_ = math.cos(rot), math.sin(rot)
    return x + u * c + v * s_, z - u * s_ + v * c


tr = parse_trace("data/layout/trace_2013.txt")
objs.update({"barns": [], "hay": [], "tracks": [], "hayfields": []})
# beyond the traced 2 km square: winter yards found automatically on the same imagery
# (tools/trace_layout.py candidates, forest clearings and bare scree filtered out)
for f in json.load(open("data/layout/outer_farms.json")):
    x, z, a = f["x"], f["z"], f["area"]
    rot = contour_angle(x, z) + (jitter(x, z) - 0.5) * 0.25
    if a >= 500:
        tr["H"].append(("compound", x, z, float(np.clip(math.sqrt(a) * 1.3, 20, 45)), float(np.clip(math.sqrt(a) * 0.95, 15, 32)), rot))
    else:
        tr["H"].append(("house", x, z))
        tr["P"].append((x + 12 * math.cos(rot + 1.2), z + 12 * math.sin(rot + 1.2), 6.0))

seen = []
for kind, x, z, *dims in tr["H"]:
    if any(math.hypot(x - a, z - b) < 7 for a, b in seen):
        continue                                  # traced twice where tiles overlap
    seen.append((x, z))
    rot = contour_angle(x, z) + (jitter(x, z) - 0.5) * 0.25
    L, W = (dims[0], dims[1]) if len(dims) >= 2 else (0, 0)
    if not clear_of_photo(x, z, max(L, W) / 2):
        continue
    if kind in ("house", "shed"):
        big = kind == "house" and jitter(x, z, 1) < 0.45
        cabin(x, z, 9.6 if big else (7.2 if kind == "house" else 5.4), 5.6 if big else 5.0, rot, "2013",
              kind="house_b" if big else "house_a", scale=1.0 if kind == "house" else 0.78)
    elif kind == "barn":
        objs["barns"].append(dict(x=round(x, 1), z=round(z, 1), w=round(min(max(L, 10), 26), 1), rot=round(rot, 3), src="2013"))
    elif kind == "compound":
        # walled winter yard: rail fence round it, house at one front corner, sheep shed along
        # the back, a haystack or two in a corner
        L, W = max(L, 18), max(W, 14)
        objs["fences"].append(dict(pts=rect(x, z, L, W, rot), src="2013"))
        hx, hz = local(x, z, rot, -L / 2 + 5.5, -W / 2 + 4.0)
        cabin(hx, hz, 7.2, 5.0, rot, "2013", kind="house_a")
        bx, bz = local(x, z, rot, 2.0, W / 2 - 4.0)
        objs["barns"].append(dict(x=round(bx, 1), z=round(bz, 1), w=round(min(L * 0.55, 22), 1), rot=round(rot, 3), src="2013"))
        for i in range(1 + (L > 35)):
            sx, sz = local(x, z, rot, L / 2 - 3.5 - i * 5, -W / 2 + 3.5)
            objs["hay"].append(dict(x=round(sx, 1), z=round(sz, 1), rot=round(jitter(x, z, i) * 6.28, 2), type="stack", s=round(0.85 + 0.3 * jitter(x, z, i + 5), 2)))
for x, z, r in tr["P"]:
    if clear_of_photo(x, z, r):
        objs["fences"].append(dict(pts=ring(x, z, r), src="2013"))
for x, z, w, d in tr["Q"]:
    if clear_of_photo(x, z, max(w, d) / 2):
        objs["fences"].append(dict(pts=rect(x, z, w, d, contour_angle(x, z)), src="2013"))
for pts in tr["F"]:
    objs["fences"].append(dict(pts=[[round(a, 1), round(b, 1)] for a, b in pts], src="2013"))
for x, z in tr["U"]:
    if clear_of_photo(x, z):
        objs["yurts"].append(dict(x=x, z=z, r=3.2, src="2013"))
WIDTH = {"road": 3.2, "track": 2.2, "path": 1.2}
for cls, pts in tr["T"]:
    objs["tracks"].append(dict(cls=cls, width=WIDTH[cls], pts=[[a, b] for a, b in pts]))
# hay fields: loaf stacks along the parcel, a few tall stacks (last summer's hay, not yet carted)
for k, pts in enumerate(tr["Y"]):
    objs["hayfields"].append(dict(pts=[[a, b] for a, b in pts]))
    P = np.array(pts)
    lo, hi = P.min(0), P.max(0)
    placed = 0
    for i in range(200):
        if placed >= 5:
            break
        x = lo[0] + (hi[0] - lo[0]) * jitter(k, i, 1)
        z = lo[1] + (hi[1] - lo[1]) * jitter(k, i, 2)
        inside = False
        for (x0, z0), (x1, z1) in zip(pts, pts[1:] + pts[:1]):
            if (z0 > z) != (z1 > z) and x < x0 + (z - z0) / (z1 - z0) * (x1 - x0):
                inside = not inside
        if inside and all(math.hypot(x - h["x"], z - h["z"]) > 40 for h in objs["hay"]):
            objs["hay"].append(dict(x=round(x, 1), z=round(z, 1), rot=round(contour_angle(x, z), 2), type="loaf" if i % 3 else "stack", s=round(0.9 + 0.25 * jitter(k, i, 3), 2)))
            placed += 1

# --- boardwalks / paths / fences (polylines of projected photo pixels) ---
def line(photo, pix):
    return [[round(c, 1) for c in pj(photo, u, v)] for u, v in pix]

def ranged(photo, cols_dists):
    return [[round(c, 1) for c in rng(photo, u, d)] for u, d in cols_dists]

# photo 2: boardwalk from the photographer's feet (~3 m) straight to the cabin door
objs["boardwalks"].append(dict(width=1.2, pts=ranged(P2, [(838, 2.5), (834, 8), (822, 16), (828, 24), (836, d2)])))
# photo 8: fence posts (1.2 m) give 16-30 m; the boardwalk runs ~4 m behind the fence
posts = [(0, 60), (175, 60), (370, 60), (548, 73), (700, 67), (840, 62), (965, 56), (1105, 58), (1255, 39), (1398, 36)]
fd = [(u, size_range(P8, px, 1.2)) for u, px in posts]
objs["fences"].append(dict(pts=ranged(P8, fd)))
objs["boardwalks"].append(dict(width=1.5, pts=ranged(P8, [(u, d + 4) for u, d in fd])))
objs["boardwalks"].append(dict(width=1.2, pts=ranged(P8, [(0, 52), (150, 49), (300, 47)])))
objs["paths"].append(dict(width=1.6, pts=ranged(P8, [(470, 47), (600, 58), (660, 68), (600, 84), (470, 110), (360, 150)])))
objs["fences"].append(dict(pts=ranged(P8, [(1120, 84), (1250, 72), (1398, 62)])))

# --- horses: photo 6 ridge (dark, white, bay) + a grazing group seen in photo 1 ---
for u, px, coat, yaw_off in [(690, 102, "black", -90), (812, 110, "white", -90), (1245, 113, "bay", -90)]:
    x, z = rng(P6, u, size_range(P6, px, 2.3))
    # they walk left across the frame
    objs["horses"].append(dict(x=round(x, 1), z=round(z, 1), rot=round(rot_x_to(CAMS[P6]["yaw"] + yaw_off), 3), coat=coat, src="photo6", walk=True))
for i, (u, v) in enumerate([(360, 1602), (420, 1606), (455, 1598), (500, 1604), (530, 1610)]):
    r = project(P1, u, v, 4096, 3072)
    if r:
        objs["horses"].append(dict(x=round(r[0], 1), z=round(r[1], 1), rot=round(i * 1.3, 3), coat=["bay", "chestnut", "black", "bay", "white"][i], src="photo1", graze=True))

# --- swing seen in photo 7 ---
# it stands on the near ridge edge, which the 30 m DEM rounds off, so the ray overshoots;
# range it from its size instead (posts ~3.6 m tall span ~250 px of the 240 mm frame)
c7 = CAMS[P7]
fpx = 700 / math.tan(math.radians(c7["hfov"] / 2))
brg = c7["yaw"] + math.degrees(math.atan((265 - 700) / fpx))
dist = 3.6 / (250 / fpx)
bx, bz = bearing_axis(brg)
x, z = c7["x"] + bx * dist, c7["z"] + bz * dist
objs["swings"].append(dict(x=round(x, 1), z=round(z, 1), rot=round(rot_x_to(c7["yaw"] + 90), 3), src="photo7"))

# --- today's guesthouses (data/layout/guesthouses.json): at their sites the scene shows today,
# elsewhere 2013 -- the 2013 buildings, yurts and fences standing where they are now are dropped
gh = json.load(open("data/layout/guesthouses.json"))
def on_site(x, z, pad=0.0):
    return any(math.hypot(x - cx, z - cz) < r + pad for cx, cz, r in (s_["clear"] for s_ in gh["sites"]))
drop = {k: 0 for k in ("cabins", "barns", "yurts", "fences", "hay")}
for k in ("cabins", "barns", "yurts", "hay"):
    keep = [o for o in objs[k] if not (o.get("src") == "2013" and on_site(o["x"], o["z"]))]
    drop[k] = len(objs[k]) - len(keep)
    objs[k] = keep
keep = []
for f in objs["fences"]:
    if f.get("src") == "2013" and any(on_site(x, z) for x, z in f["pts"]):
        drop["fences"] += 1
    else:
        keep.append(f)
objs["fences"] = keep
objs["guesthouses"] = [dict(model=b["model"], x=b["x"], z=b["z"], rot=b["rot"], site=b["site"], src="today", **({"cosmos": True} if b.get("cosmos") else {}))
                       for b in gh["buildings"]]
# the lodge of photos 1/4/5 is 岚川's old lodge (the user, 2026-10-09): today's model where the photos
# put it (and still the home the scene starts from)
lodge = next(c for c in objs["cabins"] if c["src"] == "photo1+4+5")
objs["cabins"].remove(lodge)
objs["guesthouses"].insert(0, dict(model="gh_lanchuan_lodge", x=lodge["x"], z=lodge["z"], rot=lodge["rot"], site="岚川民宿", src="photo1+4+5", home=True,
                                   floor="back", cosmos=True,   # (its floor level with the ground at its back: up steps from the road)
                                   cosmos_beds=[[-2.3, 10.4, 10.5, 6.2]]))   # (the slope before its door, down to the road: all cosmos)
# each one's level pad (the `_pad` empty of its model): no grass or flowers through its floors
def glb_rects(model):
    """its `_pad` and any `_mask<i>`: [cx, cz, hx, hz] in its frame"""
    b = open(f"web/public/assets/{model}.glb", "rb").read()
    n = struct.unpack("<I", b[12:16])[0]
    pad, masks = None, []
    for nd in json.loads(b[20:20 + n])["nodes"]:
        nm = nd.get("name", "")
        if nm == model + "_pad" or nm.startswith(model + "_mask"):
            t, sc = nd["translation"], nd["scale"]
            r = [round(t[0], 2), round(t[2], 2), round(sc[0], 2), round(sc[2], 2)]
            if nm.endswith("_pad"):
                pad = r
            else:
                masks.append(r)
    return pad, masks
for g in objs["guesthouses"]:
    g["pad"], m = glb_rects(g["model"])
    if m:
        g["masks"] = m
objs["yurts"] += [dict(x=y["x"], z=y["z"], r=y["r"], src="today", gh=True) for y in gh["yurts"]]
objs["swings"] += [dict(x=w["x"], z=w["z"], rot=w["rot"], src="today") for w in gh["swings"]]
objs["boardwalks"] += [dict(width=w["width"], pts=w["pts"], rail=w["rail"], src="today", **({"stairs": True} if w.get("stairs") else {})) for w in gh["boardwalks"]]
print("guesthouse sites: dropped 2013", drop)

for k, v in objs.items():
    print(k, len(v))
print("lodge", objs["guesthouses"][0])
print("swing", objs["swings"][0], "dist from cam7", math.hypot(x - CAMS[P7]["x"], z - CAMS[P7]["z"]))
json.dump(objs, open(sys.argv[1] if len(sys.argv) > 1 else "web/public/data/objects.json", "w"), separators=(",", ":"))
