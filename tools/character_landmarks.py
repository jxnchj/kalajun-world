"""Body landmarks of the user's character mesh (assets/src/character/scene.glb) for
tools/blender/rig_character.py, from its front silhouette (every triangle projected onto the
X-Z plane, 2 mm pixels) and the vertices:

  crotch      lowest height where the body is solid at x = 0 (the legs part below it)
  arms        per silhouette row, the x-interval of each arm where it stands free of the trunk
              (three runs in a row above the crotch, four below: hand, leg, leg, hand)
  armpit      the highest row where the arms stand free; fingertips the lowest
  neck        the narrowest trunk row between the shoulders and the head
  joints      hip, knee, ankle, toe, shoulder, elbow, wrist, fingertip centres (L = +X side; the
              mesh is near symmetric, the R side is the mirror), depth from the vertices there

Blender frame (the rig script's): X = glTF x, Y = -glTF z, Z = glTF y; centred in X/Y, feet on
Z = 0. Writes assets/src/character/landmarks.json and a debug silhouette PNG.
"""
import json, struct, sys
import numpy as np
from PIL import Image, ImageDraw

SRC = "assets/src/character/scene.glb"
OUT = "assets/src/character/landmarks.json"
f = open(SRC, "rb").read()
jl = struct.unpack("<I", f[12:16])[0]
J = json.loads(f[20:20 + jl])
binoff = 20 + jl + 8
prim = J["meshes"][0]["primitives"][0]
CT = {5126: np.float32, 5125: np.uint32, 5123: np.uint16}
NC = {"SCALAR": 1, "VEC2": 2, "VEC3": 3}


def acc(i):
    a = J["accessors"][i]
    bv = J["bufferViews"][a["bufferView"]]
    off = binoff + bv.get("byteOffset", 0) + a.get("byteOffset", 0)
    n = a["count"] * NC[a["type"]]
    return np.frombuffer(f, CT[a["componentType"]], n, off).reshape(a["count"], NC[a["type"]])


P = acc(prim["attributes"]["POSITION"]).astype(np.float64)
I = acc(prim["indices"]).reshape(-1, 3)
V = np.stack([P[:, 0], -P[:, 2], P[:, 1]], 1)
V[:, 0] -= (V[:, 0].max() + V[:, 0].min()) / 2
V[:, 1] -= (V[:, 1].max() + V[:, 1].min()) / 2
V[:, 2] -= V[:, 2].min()
H = V[:, 2].max()
X, Y, Z = V.T

# ---------------------------------------------------------------- front silhouette
PX = 0.002
W = int(np.ceil((X.max() - X.min()) / PX)) + 4
Hh = int(np.ceil(H / PX)) + 4
x0 = X.min() - 2 * PX
img = Image.new("L", (W, Hh), 0)
d = ImageDraw.Draw(img)
u = (X - x0) / PX
v = (H - Z) / PX + 2          # row 0 = top
for t in I:
    d.polygon([(u[t[0]], v[t[0]]), (u[t[1]], v[t[1]]), (u[t[2]], v[t[2]])], fill=255)
S = np.asarray(img) > 0
img.save("assets/src/character/silhouette.png")
col = lambda x: int(round((x - x0) / PX))
row = lambda z: int(round((H - z) / PX + 2))
zrow = lambda r: H - (r - 2) * PX
xcol = lambda c: x0 + c * PX
cx = col(0.0)


def runs(r):
    a = S[r].astype(np.int8)
    e = np.diff(np.concatenate([[0], a, [0]]))
    return list(zip(np.nonzero(e == 1)[0], np.nonzero(e == -1)[0] - 1))


# crotch: scanning up from the knees, the first row solid at x = 0 (a few pixels either side)
crotch = None
for r in range(row(0.15), row(0.85 * H), -1):
    if S[r, cx - 2:cx + 3].all():
        crotch = zrow(r)
        break
# arms standing free: the outermost runs of rows with >= 3 runs (above the crotch) / >= 4 below
arms = {}
for r in range(row(0.9 * H), row(0.05), 1):
    z = zrow(r)
    R = [q for q in runs(r) if q[1] - q[0] >= 2]
    need = 3 if z >= crotch else 4
    if len(R) >= need:
        l, rr = R[-1], R[0]
        if xcol(l[0]) > 0.04 and xcol(rr[1]) < -0.04:
            arms[round(z, 4)] = [xcol(rr[0]), xcol(rr[1]), xcol(l[0]), xcol(l[1])]
az = sorted(arms)
# the free-arm rows form one long block from the armpit to the fingertips; take the largest block
blocks, cur = [], [az[0]]
for a, b in zip(az[:-1], az[1:]):
    if b - a < 3 * PX + 1e-6:
        cur.append(b)
    else:
        blocks.append(cur); cur = [b]
blocks.append(cur)
blk = max(blocks, key=len)
armpit, tips = max(blk), min(blk)
arms = {z: arms[z] for z in blk}
# the trunk's outer edges on each row of the arm block (the central run above the crotch, the
# two leg runs below): everything farther out is arm -- thumbs and fingers included
hipx = float(X[(X > 0.01) & (Z < crotch - 0.02) & (Z > crotch - 0.08)].mean())
trunk = {}
for z in arms:
    r = row(z)
    R = runs(r)
    if z >= crotch:
        c = [q for q in R if q[0] <= cx <= q[1]]
        if not c:
            continue
        trunk[z] = [xcol(c[0][0]), xcol(c[0][1])]
    else:
        cl = min(R, key=lambda q: abs(xcol((q[0] + q[1]) / 2) - hipx))
        cr = min(R, key=lambda q: abs(xcol((q[0] + q[1]) / 2) + hipx))
        trunk[z] = [xcol(cr[0]), xcol(cl[1])]
# neck: the narrowest run through x = 0 above the armpit
best, neck = 9, None
for r in range(row(armpit + 0.05), row(0.93 * H), -1):
    for a, b in runs(r):
        if a <= cx <= b and (b - a) * PX < best:
            best, neck = (b - a) * PX, zrow(r)


def depth(m):
    return float(Y[m].mean()) if m.any() else 0.0


def arm_centre(z):
    k = min(arms, key=lambda q: abs(q - z))
    xa, xb = arms[k][2], arms[k][3]
    m = (np.abs(Z - z) < 0.008) & (X > xa - 0.002) & (X < xb + 0.002)
    return [(xa + xb) / 2, depth(m), z]


hand_len = 0.085 * H
shoulder_z = armpit + 0.045
top_arm = arms[armpit]
m = (np.abs(Z - armpit) < 0.012) & (X > top_arm[2]) & (X < top_arm[3])
shoulder = [(top_arm[2] + top_arm[3]) / 2 - 0.005, depth(m), shoulder_z]
wrist = arm_centre(tips + hand_len)
elbow = arm_centre((shoulder_z + tips + hand_len) / 2 + 0.01)
tip = arm_centre(tips + 0.01)
legm = (X > 0.01) & (Z < crotch - 0.02)
hm = legm & (Z > crotch - 0.08)
hip = [float(X[hm].mean()), depth(hm), crotch + 0.04]
ankle_z = 0.075 * H / 1.4
am = legm & (np.abs(Z - ankle_z) < 0.012)
ankle = [float(X[am].mean()), depth(am), ankle_z]
knee_z = (hip[2] + ankle_z) / 2 + 0.01
km = legm & (np.abs(Z - knee_z) < 0.012)
knee = [float(X[km].mean()), depth(km) - 0.005, knee_z]
fm = legm & (Z < 0.05)
toe = [ankle[0], float(Y[fm].min()) + 0.045, 0.03]
toe_end = [ankle[0], float(Y[fm].min()), 0.025]
trunk_y = depth((Z > crotch) & (Z < armpit) & (np.abs(X) < 0.08))
out = dict(height=H, crotch=crotch, armpit=armpit, tips=tips, neck=neck, trunk_y=trunk_y,
           hip=hip, knee=knee, ankle=ankle, toe=toe, toe_end=toe_end, shoulder=shoulder, elbow=elbow, wrist=wrist, tip=tip,
           arms={f"{z:.4f}": [round(q, 4) for q in v] for z, v in arms.items()},
           trunk={f"{z:.4f}": [round(q, 4) for q in v] for z, v in trunk.items()})
json.dump(out, open(OUT, "w"), indent=1)
print({k: (round(v, 3) if isinstance(v, float) else [round(q, 3) for q in v]) for k, v in out.items() if k not in ("arms", "trunk")})
print("free-arm rows", len(arms))
# debug overlay
dbg = Image.fromarray((S * 90).astype(np.uint8)).convert("RGB")
dd = ImageDraw.Draw(dbg)
for z, v in arms.items():
    r = row(z)
    dd.line([(col(v[0]), r), (col(v[1]), r)], fill=(255, 80, 80))
    dd.line([(col(v[2]), r), (col(v[3]), r)], fill=(80, 160, 255))
for z, v in trunk.items():
    r = row(z)
    dd.point([(col(v[0]), r), (col(v[1]), r)], fill=(0, 255, 0))
for name in ("hip", "knee", "ankle", "shoulder", "elbow", "wrist", "tip", "toe"):
    p = out[name]
    for s in (1, -1):
        c, r = col(p[0] * s), row(p[2])
        dd.ellipse([c - 3, r - 3, c + 3, r + 3], fill=(255, 230, 0))
for z in (crotch, armpit, neck):
    dd.line([(0, row(z)), (W, row(z))], fill=(0, 255, 0))
dbg.save(sys.argv[1] if len(sys.argv) > 1 else "assets/src/character/landmarks_debug.png")
