"""A face that moves, for the children (tools/blender/character_mixamo.py, character_schoolboy.py): the
AI-made meshes have the mouth and the eyes painted on, no bones for them. Here, on the rest pose:

  the mouth   found on the texture (a front map of the face, ray cast): the lips (or a grin's teeth)
              that stand out from the skin below the eyes; the lip line through their middle, fitted
              with a parabola, the corners at their ends. Round the lips the mesh is subdivided (each
              edge in three: the cut and the weights smooth), then cut along the line between the
              corners (bisected, the cut's edges split): a slit that opens; along both its edges an
              inner lip (4 mm back, curling toward the opening: the red of the lips' inside).
  the jaw     a bone "Jaw" under the head, hinged below the ears; the lower lip (in an oval: full at
              the middle, nothing at the corners), the chin and the jaw line weighted to it, fading
              out toward the cheeks, the ears and the neck.
  the lips    "LipU" lifts the middle of the upper lip (the mouth opens to an oval, not a slot);
              "MouthL", "MouthR" at the corners (a smile: up, out and back; rounded lips: in and
              forward), the cheeks round them following.
  inside      behind the slit a mouth: a dark red cavity, the tongue below, a row of upper teeth, the
              lower half going with the jaw (its own small texture, material ..._mouth).
  the lids    (painted eyes, a cartoon's: the opening found as what is not skin round the eye, one shape
              for both eyes mirrored; the lid that shape, 0.4 mm off the face, the upper lid's skin
              carried down to a fine lash line along the lower edge.) Eyeballs: a bone each ("LidL",
              "LidR") and an almond-shaped patch over the eye, 0.7 mm off the
              face: on a depth map of the face (the socket of an eyeball filled smoothly across, a
              little bulge over the ball). It covers the eye and the line painted round it, shows the
              skin of the face just above the eye (its UVs a linear map from there: one skin, no seam
              crossed), a lash line along its lower edge (material ..._lid). Built closed; the bone
              points down the face and is scaled to nothing toward the brow to open it.

web/src/character.js moves them (talking, yawning, smiling, blinking, eyes shut). All in Blender's
frame: the model faces -Y, +X its left, Z up.
"""
import math, os
import bpy, bmesh
import numpy as np
from mathutils import Vector, Matrix
from mathutils.bvhtree import BVHTree
from mathutils import geometry

ss = lambda e0, e1, x: np.clip((x - e0) / (e1 - e0), 0, 1) ** 2 * (3 - 2 * np.clip((x - e0) / (e1 - e0), 0, 1))


def _rest_bmesh(body):
    dg = bpy.context.evaluated_depsgraph_get()
    bm = bmesh.new()
    bm.from_object(body, dg)
    bm.transform(body.matrix_world)
    bmesh.ops.triangulate(bm, faces=bm.faces)
    bm.faces.ensure_lookup_table()
    return bm


def _image_px(img):
    W, H = img.size
    px = np.empty(W * H * 4, np.float32)
    img.pixels.foreach_get(px)
    return W, H, px.reshape(H, W, 4)


def face_map(body, img, cx, top, bottom, half, C=0.0005, mat_index=0):
    """the face seen from the front: colour (the texture's, linear) and depth (y of the surface),
    rows from `top` down to `bottom`, columns cx +- half"""
    bm = _rest_bmesh(body)
    uvl = bm.loops.layers.uv.active
    bvh = BVHTree.FromBMesh(bm)
    W, H, P = _image_px(img)
    xs = np.arange(cx - half, cx + half, C)
    zs = np.arange(top, bottom, -C)
    col = np.full((len(zs), len(xs), 3), np.nan, np.float32)
    dep = np.full((len(zs), len(xs)), np.nan, np.float32)
    for i, z in enumerate(zs):
        for j, x in enumerate(xs):
            h = bvh.ray_cast(Vector((x, -5.0, z)), Vector((0, 1, 0)), 10.0)
            if h[0] is None:
                continue
            f = bm.faces[h[2]]
            if f.material_index != mat_index:
                continue
            a0, b0, c0 = f.loops
            w = geometry.barycentric_transform(h[0], a0.vert.co, b0.vert.co, c0.vert.co,
                                               a0[uvl].uv.to_3d(), b0[uvl].uv.to_3d(), c0[uvl].uv.to_3d())
            col[i, j] = P[min(H - 1, int((w.y % 1) * H)), min(W - 1, int((w.x % 1) * W)), :3]
            dep[i, j] = h[0].y
    bm.free()
    return xs, zs, col, dep


def _components(mask):
    from scipy import ndimage   # (Blender's python may lack scipy: fall back below)
    return ndimage.label(mask)


def _label(mask):
    try:
        return _components(mask)
    except Exception:
        lab = np.zeros(mask.shape, int)
        n = 0
        for i0, j0 in zip(*np.nonzero(mask)):
            if lab[i0, j0]:
                continue
            n += 1
            st = [(i0, j0)]
            lab[i0, j0] = n
            while st:
                i, j = st.pop()
                for a, b in ((i + 1, j), (i - 1, j), (i, j + 1), (i, j - 1)):
                    if 0 <= a < mask.shape[0] and 0 <= b < mask.shape[1] and mask[a, b] and not lab[a, b]:
                        lab[a, b] = n
                        st.append((a, b))
        return lab, n


def find_mouth(xs, zs, col, dep, eye_z, cx):
    """the lips (or a grin) below the eyes: the largest patch differing from the skin round it; its
    lip line (the middle of the patch in each column, a parabola fitted), corners, depth"""
    ok = ~np.isnan(dep)
    win = ok & (zs[:, None] < eye_z - 0.025) & (zs[:, None] > eye_z - 0.11) & (np.abs(xs[None, :] - cx) < 0.035)
    skin = np.median(col[win], axis=0)
    c0 = np.nan_to_num(col)
    # lips are redder than the skin (r - g up), a grin's teeth whiter, its outline darker
    red = (c0[..., 0] - c0[..., 1]) - (skin[0] - skin[1])
    d = np.linalg.norm(c0 - skin, axis=2)
    score = np.maximum(d, 2.5 * red)
    sm = score.copy()
    for _ in range(2):   # (a little smoothing: a patch, not specks)
        sm = (sm + np.roll(sm, 1, 0) + np.roll(sm, -1, 0) + np.roll(sm, 1, 1) + np.roll(sm, -1, 1)) / 5
    top = np.percentile(sm[win], 99.7)
    mask = win & (sm > top * 0.45)
    lab, n = _label(mask)
    best, k = -1, 1
    for kk in range(1, n + 1):   # the largest, nearest the middle of the face
        q = lab == kk
        area = q.sum()
        off = abs(xs[np.nonzero(q.any(0))[0]].mean() - cx)
        sc_ = area / (1 + (off / 0.01) ** 2)
        if sc_ > best:
            best, k = sc_, kk
    m = lab == k
    cols = np.nonzero(m.any(0))[0]
    X, Z = [], []
    for j in cols:
        r = np.nonzero(m[:, j])[0]
        X.append(xs[j]); Z.append((zs[r.min()] + zs[r.max()]) / 2)
    X, Z = np.array(X), np.array(Z)
    xc = (X.min() + X.max()) / 2
    A = np.stack([np.ones_like(X), X - xc, (X - xc) ** 2], 1)
    a, b, c = np.linalg.lstsq(A, Z, rcond=None)[0]
    jc = np.argmin(np.abs(xs - xc))
    ic = np.argmin(np.abs(zs - a))
    yv = dep[max(0, ic - 3):ic + 4, max(0, jc - 3):jc + 4]
    lip_y = float(np.nanmin(yv))
    rows = np.nonzero(m.any(1))[0]
    return dict(xc=float(xc), a=float(a), b=float(b), c=float(c), x0=float(X.min()), x1=float(X.max()),
                top=float(zs[rows.min()]), bottom=float(zs[rows.max()]), y=lip_y, skin=skin, mask=m)


def _fill(D, hole, iters=500):
    """the cells of `hole` filled smoothly from round them (Laplace)"""
    D = D.copy()
    known = ~np.isnan(D) & ~hole
    D[np.isnan(D)] = np.nanmean(D[known])
    for _ in range(iters):
        avg = (np.roll(D, 1, 0) + np.roll(D, -1, 0) + np.roll(D, 1, 1) + np.roll(D, -1, 1)) / 4
        D[hole] = avg[hole]
    return D


def _bilinear(xs, zs, D, x, z):
    fx = (x - xs[0]) / (xs[1] - xs[0])
    fz = (zs[0] - z) / (zs[0] - zs[1])
    j = int(np.clip(np.floor(fx), 0, len(xs) - 2)); i = int(np.clip(np.floor(fz), 0, len(zs) - 2))
    u, v = fx - j, fz - i
    return (D[i, j] * (1 - u) + D[i, j + 1] * u) * (1 - v) + (D[i + 1, j] * (1 - u) + D[i + 1, j + 1] * u) * v


def _material(name, img, rough):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    bs = m.node_tree.nodes["Principled BSDF"]
    tn = m.node_tree.nodes.new("ShaderNodeTexImage"); tn.image = img
    m.node_tree.links.new(tn.outputs["Color"], bs.inputs["Base Color"])
    bs.inputs["Roughness"].default_value = rough
    return m


def add_face_rig(arm, body, img, eyes, head_bone="mixamorig:Head", debug=None, name="face"):
    """eyes: ("balls", [(centre, radius), ...]) for eyeballs in sockets, or ("painted", [centre, centre])
    (world, rest pose). Returns the measures (for clips.json)."""
    sc = bpy.context.scene
    if bpy.context.object and bpy.context.object.mode != "OBJECT":
        bpy.ops.object.mode_set(mode="OBJECT")
    arm.data.pose_position = "REST"
    bpy.context.view_layer.update()
    Mw = body.matrix_world.copy()
    Mi = Mw.inverted()
    kind, E = eyes
    ec = [e[0] if kind == "balls" else e for e in E]
    eye_z = sum(e.z for e in ec) / len(ec)
    cx = sum(e.x for e in ec) / len(ec)
    # ---------------------------------------------------------------- the face map, the mouth
    xs, zs, col, dep = face_map(body, img, cx, eye_z + 0.03, eye_z - 0.13, 0.075)
    M = find_mouth(xs, zs, col, dep, eye_z, cx)
    xc, a, b, c = M["xc"], M["a"], M["b"], M["c"]
    hw = (M["x1"] - M["x0"]) / 2
    line = lambda x: a + b * (x - xc) + c * (x - xc) ** 2
    faceH = eye_z - a
    lip_y = M["y"]
    ic = int(np.argmin(np.abs(zs - a)))
    row = dep[ic]
    front = np.nonzero(~np.isnan(row) & (row < lip_y + 0.03))[0]
    half_face = float(max(abs(xs[front.min()] - xc), abs(xs[front.max()] - xc)))
    chin_z = a - 0.62 * faceH
    tmj = Vector((xc, lip_y + 0.72 * faceH, a + 0.22 * faceH))
    print(f"{name}: mouth at x {xc:.4f} z {a:.4f} y {lip_y:.4f}, half-width {hw:.4f}, curve {c:.2f}; face half {half_face:.3f}; chin z {chin_z:.4f}; eyes z {eye_z:.4f}")
    # the opening's outline along the lips: a super-ellipse, flat across the middle and rounding into
    # the corners (an oval mouth; a plain ellipse with the lips' own sag made it a diamond)
    ell = lambda dx, e=3.0: max(0.0, 1 - (dx / (hw * 1.02)) ** e) ** (1 / e)

    # ---------------------------------------------------------------- materials: the inside, the lash
    mimg = bpy.data.images.new(f"{name}_mouth", 64, 64, alpha=False)
    T = np.zeros((64, 64, 4), np.float32); T[..., 3] = 1
    for i in range(64):
        v = (i + 0.5) / 64                 # cavity: 0 bottom .. 1 top, the lip line at 0.5
        for j in range(64):
            u = (j + 0.5) / 64
            if u < 0.07:                   # the inner lip: from its edge (v 0) back into the mouth (v 1)
                T[i, j, :3] = np.array([0.62, 0.28, 0.27]) * (1 - 0.45 * v)
                continue
            uu = (u - 0.08) / 0.92
            edge = 1 - abs(2 * uu - 1)     # (darker toward the sides, deep in the cheeks)
            base = np.array([0.42, 0.09, 0.09]) * (0.45 + 0.55 * max(0.0, edge) ** 0.5)
            if 0.54 < v < 0.66 and 0.12 < uu < 0.88:
                base = np.array([0.88, 0.86, 0.8]) * (0.75 + 0.25 * edge)      # upper teeth
            elif v < 0.4:
                base = np.array([0.78, 0.38, 0.38]) * (0.55 + 0.45 * max(0.0, edge) ** 0.5)   # the tongue
            T[i, j, :3] = base
    mimg.pixels.foreach_set(T.ravel())
    mimg.pack()
    mm = _material("Designer_Logic_PBR_mouth", mimg, 0.6)
    limg = bpy.data.images.new(f"{name}_lid", 8, 32, alpha=False)
    L = np.zeros((32, 8, 4), np.float32); L[..., 3] = 1
    for i in range(32):
        L[i, :, :3] = np.array([0.035, 0.022, 0.016]) * (0.8 + 0.4 * (i + 0.5) / 32)
    limg.pixels.foreach_set(L.ravel())
    limg.pack()
    lm = _material("Designer_Logic_PBR_lid", limg, 0.8)
    me = body.data
    body_mat = body.material_slots[0].material
    me.materials.append(mm)
    mouth_slot = len(me.materials) - 1

    # ---------------------------------------------------------------- denser round the lips; the cut
    bm = bmesh.new()
    bm.from_mesh(me)
    dl = bm.verts.layers.deform.verify()
    uvl = bm.loops.layers.uv.active
    flat = lambda p: Vector((p.x, p.y, p.z - (line(p.x) - a)))
    for v in bm.verts:
        v.co = flat(Mw @ v.co)
    bm.normal_update()
    near = lambda f, mx, mz: (abs(f.calc_center_median().x - xc) < hw + mx and abs(f.calc_center_median().z - a) < mz
                              and f.calc_center_median().y < lip_y + 0.015 and f.normal.y < -0.1)
    region = [f for f in bm.faces if near(f, 0.012, 0.014)]
    bmesh.ops.subdivide_edges(bm, edges=list({e for f in region for e in f.edges}), cuts=2, use_grid_fill=True)
    bm.normal_update()
    sel = [f for f in bm.faces if near(f, 0.004, 0.006)]
    geom = list({e for f in sel for e in f.edges}) + sel + list({v for f in sel for v in f.verts})
    bmesh.ops.bisect_plane(bm, geom=geom, dist=1e-6, plane_co=Vector((0, 0, a)), plane_no=Vector((0, 0, 1)))
    online = lambda v: abs(v.co.z - a) < 2e-6 and abs(v.co.x - xc) < hw * 0.97 and v.co.y < lip_y + 0.012
    cut = [e for e in bm.edges if all(online(v) for v in e.verts) and len(e.link_faces) == 2]
    bmesh.ops.split_edges(bm, edges=cut)
    side = {}
    for v in bm.verts:
        if v.co.z < a - 2e-6:
            side[v] = True
        elif v.co.z > a + 2e-6:
            side[v] = False
        else:
            fz = [f.calc_center_median().z for f in v.link_faces]
            side[v] = bool(fz) and sum(fz) / len(fz) < a
    # the inner lips: the slit's two edges taken 3 mm back and 0.8 mm across toward the opening
    bnd = [e for e in bm.edges if e.is_boundary and all(online(v) for v in e.verts)]
    n_in = 0
    for low in (False, True):
        es = [e for e in bnd if (e.link_faces[0].calc_center_median().z < a) == low]
        if not es:
            continue
        ret = bmesh.ops.extrude_edge_only(bm, edges=es)
        nv = [g for g in ret["geom"] if isinstance(g, bmesh.types.BMVert)]
        nf = [g for g in ret["geom"] if isinstance(g, bmesh.types.BMFace)]
        for v in nv:
            v.co += Vector((0, 0.003, 0.0008 if low else -0.0008))
            side[v] = low
        newset = set(nv)
        for f in nf:
            f.material_index = mouth_slot
            f.normal_update()
            if f.normal.y > 0:
                f.normal_flip()
            for lp in f.loops:
                lp[uvl].uv = (0.03, 0.9 if lp.vert in newset else 0.05)
        n_in += len(nf)
    for v in bm.verts:   # back to the mesh's own frame
        v.co = Mi @ Vector((v.co.x, v.co.y, v.co.z + (line(v.co.x) - a)))
    print(f"{name}: cut {len(cut)} edges along the lips, {n_in} faces of inner lip")

    # ---------------------------------------------------------------- weights: jaw, upper lip, corners
    online_v = lambda v: abs((Mw @ v.co).z - line((Mw @ v.co).x)) < 2e-5 and abs((Mw @ v.co).x - xc) < hw * 1.02
    gi = {g.name: g.index for g in body.vertex_groups}
    hi = gi[head_bone]
    ji = body.vertex_groups.new(name="Jaw").index
    ui = body.vertex_groups.new(name="LipU").index
    ci = {s_: body.vertex_groups.new(name=n_).index for s_, n_ in ((1, "MouthL"), (-1, "MouthR"))}
    corners = {s_: Vector((xc + s_ * hw, lip_y, line(xc + s_ * hw))) for s_ in (1, -1)}
    # (the corners' own region: within 0.85 of the half-width of them -- further in they would take
    # the lower lip's middle off the jaw, and an open mouth would drop to a V)
    Rc = 0.85 * hw
    nj = nc = 0
    for v in bm.verts:
        dv = v[dl]
        wh = dv.get(hi, 0.0)
        p = Mw @ v.co
        dx = abs(p.x - xc)
        if wh > 0 and side.get(v, False):
            s_ = line(p.x) - p.z
            # (the jaw is a hinge: the lips' sides, further back, nearer its axis, would drop less than
            # the middle -- a V; near the line the weight is evened out by the distance to the axis)
            ratio = (tmj.y - lip_y) / max(0.01, tmj.y - p.y)
            k = max(min(1.0, ell(dx) * ratio), ss(0.004, 0.022, s_))
            j = float(k * ss(half_face * 1.02, half_face * 0.55, dx) * ss(chin_z - 0.022, chin_z + 0.004, p.z)
                      * ss(tmj.y + 0.004, tmj.y - 0.022, p.y))
            if j > 0.01:
                dv[hi] = wh * (1 - j); dv[ji] = wh * j; nj += 1
        elif wh > 0 and dx < hw * 1.05 and p.y < lip_y + 0.012:
            su = p.z - line(p.x)
            u = float(0.9 * ell(dx, 4.0) * ss(0.009, 0.0005, su))
            if u > 0.01:
                dv[hi] = wh * (1 - u); dv[ui] = wh * u
        if p.y < lip_y + 0.014:
            for s_, P in corners.items():
                d = (p - Vector((P.x, p.y, P.z))).length            # (across the face)
                w = float(0.9 * ss(Rc, 0.2 * Rc, d))
                if w > 0.01 and (dv.get(hi, 0) + dv.get(ji, 0) + dv.get(ui, 0)) > 0.3:
                    for g in list(dv.keys()):
                        dv[g] = dv[g] * (1 - w)
                    dv[ci[s_]] = w
                    nc += 1
    # the mouth's weights (head, jaw, upper lip, corners) smoothed over the surface round it, each lip
    # among its own side (none across the slit; the slit's edges kept): no sharp step in them across a
    # fold of the faceted face (it opened into a dark crease) nor a sliver turned inside out
    G = [hi, ji, ui, ci[1], ci[-1]]
    bm.verts.ensure_lookup_table()
    zone = [v for v in bm.verts if (Mw @ v.co - Vector((xc, lip_y, a))).length < 2.6 * hw + 0.02
            and any(v[dl].get(g, 0) > 0 for g in G)]
    # (the AI mesh keeps duplicate vertices along its texture's seams: welded here by position, so
    # the copies keep the same weights -- else the seams open into cracks; the slit's two lips stay apart)
    key = {v: (round(v.co.x, 6), round(v.co.y, 6), round(v.co.z, 6), side.get(v, False)) for v in zone}
    members = {}
    for v in zone:
        members.setdefault(key[v], []).append(v)
    nbk = {k_: set() for k_ in members}
    for v in zone:
        for e in v.link_edges:
            u = e.other_vert(v)
            if u in key and key[u][3] == key[v][3] and key[u] != key[v]:
                nbk[key[v]].add(key[u])
    fixedk = {key[v] for v in zone if online_v(v)}
    Wk = {k_: [sum(m[dl].get(g, 0.0) for m in ms) / len(ms) for g in G] for k_, ms in members.items()}
    for _ in range(6):
        W1 = dict(Wk)
        for k_, nb in nbk.items():
            if k_ in fixedk or not nb:
                continue
            tot = sum(Wk[k_])
            avg = [0.5 * Wk[k_][i] + 0.5 * sum(Wk[u][i] for u in nb) / len(nb) for i in range(len(G))]
            sa = sum(avg) or 1
            W1[k_] = [x * tot / sa for x in avg]
        Wk = W1
    for k_, ms in members.items():
        for v in ms:
            dv = v[dl]
            for g, x in zip(G, Wk[k_]):
                if x > 1e-4 or g in dv:
                    dv[g] = x
    bm.to_mesh(me)
    bm.free()
    me.update()
    print(f"{name}: {nj} vertices on the jaw, {nc} weighted to the corners")

    # ---------------------------------------------------------------- the mouth inside
    bm = bmesh.new()
    R = (hw * 1.02, 0.016, 0.011)
    cav = Vector((xc, lip_y + 0.006 + R[1], a))         # (6 mm in: clear of the lips pulled back in a smile)
    bmesh.ops.create_uvsphere(bm, u_segments=24, v_segments=14, radius=1.0)
    for v in bm.verts:
        v.co = Vector((cav.x + v.co.x * R[0], cav.y + v.co.y * R[1], cav.z + v.co.z * R[2]))
    for f in bm.faces:   # (seen from inside: turned inward)
        f.normal_flip()
    dep_c = _fill(dep, np.zeros_like(dep, bool))
    for v in bm.verts:   # (kept 3 mm behind the face: toward the corners the face turns back past it)
        v.co.y = max(v.co.y, _bilinear(xs, zs, dep_c, v.co.x, v.co.z) + 0.003)
    uv = bm.loops.layers.uv.verify()
    for f in bm.faces:
        for lp in f.loops:
            q = lp.vert.co
            lp[uv].uv = (0.08 + 0.92 * (0.5 + (q.x - cav.x) / (2 * R[0]) * 0.9), min(0.99, max(0.01, 0.5 + (q.z - cav.z) / (2 * R[2]))))
    cme = bpy.data.meshes.new(f"{name}_mouth")
    bm.to_mesh(cme)
    bm.free()
    cme.uv_layers[0].name = me.uv_layers.active.name
    cob = bpy.data.objects.new(f"{name}_mouth", cme)
    sc.collection.objects.link(cob)
    cme.materials.append(mm)
    gh, gj = cob.vertex_groups.new(name=head_bone), cob.vertex_groups.new(name="Jaw")
    for v in cme.vertices:
        j = float(ss(a + 0.002, a - 0.004, v.co.z))
        if j < 1: gh.add([v.index], 1 - j, "REPLACE")
        if j > 0: gj.add([v.index], j, "REPLACE")

    # ---------------------------------------------------------------- the lids
    bm_rest = _rest_bmesh(body)
    bm_rest.faces.ensure_lookup_table()
    uvr = bm_rest.loops.layers.uv.active
    bvh_rest = BVHTree.FromBMesh(bm_rest)

    def uv_hit(x, z):
        h = bvh_rest.ray_cast(Vector((x, -5.0, z)), Vector((0, 1, 0)), 10.0)
        f = bm_rest.faces[h[2]]
        while f.material_index != 0:   # (an eyeball, the inside of the mouth: look past it)
            h = bvh_rest.ray_cast(h[0] + Vector((0, 0.0005, 0)), Vector((0, 1, 0)), 10.0)
            f = bm_rest.faces[h[2]]
        return f, h[0]

    def uv_at(x, z):
        f, hp = uv_hit(x, z)
        l0, l1, l2 = f.loops[:3]
        w = geometry.barycentric_transform(hp, l0.vert.co, l1.vert.co, l2.vert.co, l0[uvr].uv.to_3d(), l1[uvr].uv.to_3d(), l2[uvr].uv.to_3d())
        return w.x, w.y

    def affine(x0, z0):
        """the texture round the face point (x0, z0) as a linear map (x, z) -> uv: fitted to the surface's
        UVs over a small patch there (a lone thin triangle gave a skewed, magnified map); the patch
        shrunk if it straddles a seam of the texture's islands"""
        for ex, ez in ((0.006, 0.0025), (0.003, 0.0012)):
            X, Y = [], []
            for dx in np.linspace(-ex, ex, 7):
                for dz in np.linspace(-ez, ez, 4):
                    u, v = uv_at(x0 + dx, z0 + dz)
                    X.append([1, dx, dz]); Y.append([u, v])
            X, Y = np.array(X), np.array(Y)
            C, *_ = np.linalg.lstsq(X, Y, rcond=None)
            if np.abs(X @ C - Y).max() < 0.004:
                u0, J = C[0], C[1:].T
                return lambda x, z: tuple(u0 + J @ np.array([x - x0, z - z0]))
        f, hp = uv_hit(x0, z0)
        l0, l1, l2 = f.loops[:3]
        A = np.array([[l1.vert.co.x - l0.vert.co.x, l2.vert.co.x - l0.vert.co.x],
                      [l1.vert.co.z - l0.vert.co.z, l2.vert.co.z - l0.vert.co.z]])
        Bm = np.array([[l1[uvr].uv.x - l0[uvr].uv.x, l2[uvr].uv.x - l0[uvr].uv.x],
                       [l1[uvr].uv.y - l0[uvr].uv.y, l2[uvr].uv.y - l0[uvr].uv.y]])
        J = Bm @ np.linalg.inv(A)
        w = geometry.barycentric_transform(hp, l0.vert.co, l1.vert.co, l2.vert.co, l0[uvr].uv.to_3d(), l1[uvr].uv.to_3d(), l2[uvr].uv.to_3d())
        u0 = np.array((w.x, w.y))
        return lambda x, z: tuple(u0 + J @ np.array([x - x0, z - z0]))

    lum = np.nanmean(col, axis=2)
    lid_objs, info_lids, outlines = [], [], []
    Ai = arm.matrix_world.inverted()
    C_ = xs[1] - xs[0]
    okc = ~np.isnan(col).any(2)

    # painted eyes: each eye's opening -- what is not skin round it (the iris and pupil, the white, the
    # lashes painted round), one piece from the iris out, its holes filled -- and one shape for both, the
    # two mirrored onto each other (a cartoon's eyes, each found apart, came out unlike: the lids too)
    if kind == "painted":
        local = []
        for ce in ec:
            win = (np.abs(xs[None, :] - ce.x) < 0.032) & (np.abs(zs[:, None] - ce.z) < 0.016) & okc
            core = (np.abs(xs[None, :] - ce.x) < 0.024) & (np.abs(zs[:, None] - ce.z) < 0.011)
            skin_c = np.median(col[win & ~core], 0)
            c0 = np.nan_to_num(col)
            dcol = np.linalg.norm(c0 - skin_c, axis=2) / max(1e-6, float(np.linalg.norm(skin_c)))
            sat = (c0.max(2) - c0.min(2)) / np.maximum(c0.max(2), 1e-6)
            sat_s = (skin_c.max() - skin_c.min()) / max(1e-6, skin_c.max())
            m = win & ((dcol > 0.3) | (sat < 0.6 * sat_s))     # (unlike the skin, or greyer: the white)
            near = win & (np.hypot(xs[None, :] - ce.x, zs[:, None] - ce.z) < 0.004)
            iz, jx = np.unravel_index(np.argmin(np.where(near, lum, 9)), lum.shape)
            comp = np.zeros_like(m); comp[iz, jx] = True; st = [(iz, jx)]
            while st:
                a_, b_ = st.pop()
                for da, db in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    p_, q_ = a_ + da, b_ + db
                    if 0 <= p_ < m.shape[0] and 0 <= q_ < m.shape[1] and m[p_, q_] and not comp[p_, q_]:
                        comp[p_, q_] = True; st.append((p_, q_))
            for r_ in range(comp.shape[0]):           # (holes: filled row by row)
                j_ = np.nonzero(comp[r_])[0]
                if len(j_):
                    comp[r_, j_.min():j_.max() + 1] = True
            ii_, jj_ = np.nonzero(comp)
            ox, oz = (xs[jj_.min()] + xs[jj_.max()]) / 2, (zs[ii_.min()] + zs[ii_.max()]) / 2
            local.append((ox, oz, [(xs[j] - ox, zs[i] - oz) for i, j in zip(ii_, jj_)]))
        # the shared shape: per column (mm across, from the opening's middle; the other eye mirrored)
        cols = {}
        for k2, (ox, oz, pts) in enumerate(local):
            mirror = -1 if ec[k2].x < cx else 1
            for dx, dz in pts:
                key = int(round(mirror * dx / C_))
                lo_, hi_ = cols.get(key, (dz, dz))
                cols[key] = (min(lo_, dz), max(hi_, dz))
        keys = np.array(sorted(cols))
        bot_c = np.array([cols[k2][0] for k2 in keys]); top_c = np.array([cols[k2][1] for k2 in keys])
        for _ in range(10):     # (a ragged painted edge smoothed)
            top_c[1:-1] = (top_c[:-2] + 2 * top_c[1:-1] + top_c[2:]) / 4
            bot_c[1:-1] = (bot_c[:-2] + 2 * bot_c[1:-1] + bot_c[2:]) / 4
        shape_x = keys * C_
        log_ = f"{name}: painted eyes' opening {np.ptp(shape_x) * 1000:.1f} x {np.max(top_c - bot_c) * 1000:.1f} mm (both mirrored into one)"
        print(log_)

    for k, e in enumerate(E):
        nm = "LidL" if ec[k].x > cx else "LidR"
        ce = ec[k]
        if kind == "painted":
            ox, oz, _ = local[k]
            mirror = -1 if ce.x < cx else 1
            side, mt, mb_ = 0.0025, 0.0025, 0.0015     # (a band of the face's own skin round the opening)
            x0s, x1s = shape_x.min() - side, shape_x.max() + side
            topf = lambda dx: oz + np.interp(mirror * dx, shape_x, top_c) + mt
            botf = lambda dx: oz + np.interp(mirror * dx, shape_x, bot_c) - mb_

            def edges(t):
                """top and bottom at t (-1 .. 1 across): the shape's, the two tapering to a point at the ends"""
                dx = (x0s + x1s) / 2 * mirror + t * (x1s - x0s) / 2
                X_ = ox + dx
                tz, bz = topf(dx), botf(dx)
                e_ = min(1.0, (1 - abs(t)) / 0.12)
                midz = (tz + bz) / 2
                return X_, midz + (tz - midz) * (e_ ** 0.5), midz + (bz - midz) * (e_ ** 0.5)

            bm_rest.normal_update()

            def surf(x, z):
                """the face's surface in front at (x, z): the point, its normal (the vertices', smooth)"""
                f, hp = uv_hit(x, z)
                l0, l1, l2 = f.loops[:3]
                w = geometry.barycentric_transform(hp, l0.vert.co, l1.vert.co, l2.vert.co,
                                                   Vector((1, 0, 0)), Vector((0, 1, 0)), Vector((0, 0, 1)))
                return hp, (l0.vert.normal * w.x + l1.vert.normal * w.y + l2.vert.normal * w.z).normalized()

            def at(x, z, off):           # (on the face itself, `off` in front of it: no line where they cross)
                return Vector((x, surf(x, z)[0].y - off, z))

            def face_n(x, z):
                return surf(x, z)[1]
            # its colour: the face's just outside its top edge and just outside its bottom edge (far
            # enough out to be clear of the painted lash line), column by column, graded from the one to
            # the other -- its edge does not show -- and a little deeper toward the lash line
            def raw_col(x, z):
                fx = np.clip((x - xs[0]) / C_, 0, len(xs) - 1.001); fz = np.clip((zs[0] - z) / (zs[0] - zs[1]), 0, len(zs) - 1.001)
                j, i = int(fx), int(fz); u, v = fx - j, fz - i
                q = col[i:i + 2, j:j + 2].reshape(-1, 3); w4 = np.array([(1 - u) * (1 - v), u * (1 - v), (1 - u) * v, u * v])
                okq = ~np.isnan(q).any(1)
                return (q[okq] * w4[okq, None]).sum(0) / w4[okq].sum() if okq.any() else tone
            open_b = lambda dx: oz + np.interp(mirror * dx, shape_x, bot_c)
            TW, TH = 64, 32
            tex = np.zeros((TH, TW, 4), np.float32); tex[..., 3] = 1
            ts_ = [edges(-1 + 2 * (tx + 0.5) / TW) for tx in range(TW)]
            colt = np.array([raw_col(X_, tz + 0.0004) for X_, tz, bz in ts_])
            colb = np.array([raw_col(X_, bz - 0.0004) for X_, tz, bz in ts_])
            for _ in range(3):
                colt[1:-1] = (colt[:-2] + colt[1:-1] * 2 + colt[2:]) / 4
                colb[1:-1] = (colb[:-2] + colb[1:-1] * 2 + colb[2:]) / 4
            for ty in range(TH):
                v = (ty + 0.5) / TH                         # 0 the bottom edge .. 1 the top
                tex[ty, :, :3] = (colb + (colt - colb) * v) * (1 - 0.07 * np.exp(-((v - 0.12) / 0.15) ** 2))
            kimg = bpy.data.images.new(f"{name}_{nm}_skin", TW, TH, alpha=False)
            kimg.pixels.foreach_set(tex.ravel()); kimg.pack()
            kmat = _material("Designer_Logic_PBR_lidskin", kimg, 0.85)
            nu, nv = 36, 12
            skin_bm, lash_bm = bmesh.new(), bmesh.new()

            def grid(bmx, P, U):
                vs = [[bmx.verts.new(q) for q in rowp] for rowp in P]
                ul = bmx.loops.layers.uv.verify()
                for i in range(len(P) - 1):
                    for jj2 in range(len(P[0]) - 1):
                        f = bmx.faces.new((vs[i][jj2], vs[i + 1][jj2], vs[i + 1][jj2 + 1], vs[i][jj2 + 1]))
                        for lp, (i2, j2) in zip(f.loops, ((i, jj2), (i + 1, jj2), (i + 1, jj2 + 1), (i, jj2 + 1))):
                            lp[ul].uv = U[i2][j2]
            P, U = [], []
            for i in range(nv + 1):
                rowp, rowu = [], []
                for jj2 in range(nu + 1):
                    t = -1 + 2 * jj2 / nu
                    X_, tz, bz = edges(t)
                    z = tz + (bz - tz) * i / nv
                    edge_ = i == 0 or jj2 in (0, nu)
                    rowp.append(at(X_, z, 0.0001 if edge_ else 0.0004)); rowu.append(((t + 1) / 2, 1 - i / nv))
                P.append(rowp); U.append(rowu)
            grid(skin_bm, P, U)
            P2, U2 = [], []
            lx0, lx1 = shape_x.min(), shape_x.max()      # (the lash line: along the opening's bottom)
            for i, dz in enumerate((0.0009, 0.0)):
                rowp, rowu = [], []
                for jj2 in range(nu + 1):
                    t = -1 + 2 * jj2 / nu
                    dx = (lx0 + lx1) / 2 * mirror + t * (lx1 - lx0) / 2     # (left to right on both: faces out)
                    rowp.append(at(ox + dx, open_b(dx) + 0.0002 + dz * (1 - 0.7 * t * t), 0.0007)); rowu.append((jj2 / nu, 1 - i))
                P2.append(rowp); U2.append(rowu)
            grid(lash_bm, P2, U2)
            outlines.append([edges(t)[:2] for t in np.linspace(-1, 1, 15)] + [(edges(t)[0], edges(t)[2]) for t in np.linspace(1, -1, 15)])
            topmid = P[0][nu // 2]
            hgt = max(edges(t)[1] - edges(t)[2] for t in np.linspace(-1, 1, 21))
            info_lids.append({"bone": nm, "kind": "slide", "top": list(topmid), "height": hgt})
            for bmx, mat, tag in ((skin_bm, kmat, "skin"), (lash_bm, lm, "lash")):
                lme = bpy.data.meshes.new(f"{name}_{nm}_{tag}")
                bmx.to_mesh(lme); bmx.free()
                lme["face_normals"] = [c_ for v in lme.vertices for c_ in face_n(v.co.x, v.co.z)]
                lme.uv_layers[0].name = me.uv_layers.active.name
                lob = bpy.data.objects.new(f"{name}_{nm}_{tag}", lme)
                sc.collection.objects.link(lob)
                lme.materials.append(mat)
                g = lob.vertex_groups.new(name=nm)
                g.add(list(range(len(lme.vertices))), 1.0, "REPLACE")
                lid_objs.append(lob)
            continue
        win = (np.abs(xs[None, :] - ce.x) < 0.02) & (np.abs(zs[:, None] - ce.z) < 0.016)
        if kind == "balls":
            r = e[1]
            near_eye = win & (np.abs(xs[None, :] - ce.x) < 1.3 * r) & (np.abs(zs[:, None] - ce.z) < 1.3 * r)
            mask = near_eye & np.isnan(dep)
            # (and the socket's inner wall: anything well behind the face round it, a pixel more)
            rim = float(np.nanpercentile(np.where(win & ~mask, dep, np.nan), 25))
            mask |= near_eye & (np.nan_to_num(dep, nan=9) > rim + 0.002)
            for _ in range(2):
                mask = mask | (np.roll(mask, 1, 0) | np.roll(mask, -1, 0) | np.roll(mask, 1, 1) | np.roll(mask, -1, 1)) & near_eye
            ms, mt, mb_ = 0.004, 0.0055, 0.0016           # (margins: sides, top, bottom: over the painted ring and lashes)
            dtop, fac = 0.004, 0.15                        # (the donor skin: above it, not the brows)
        else:
            iz = np.argmin(np.abs(zs - ce.z)); jx = np.argmin(np.abs(xs - ce.x))
            sk = float(np.nanmedian(lum[max(0, iz - 40):iz + 40, max(0, jx - 40):jx + 40]))
            mask = win & (lum < sk * 0.62) & (np.abs(xs[None, :] - ce.x) < 0.012) & (np.abs(zs[:, None] - ce.z) < 0.009)
            ms, mt, mb_ = 0.0025, 0.002, 0.0015
            dtop, fac = 0.0025, 0.35
        ii, jj = np.nonzero(mask)
        bx0, bx1, btop, bbot = xs[jj.min()], xs[jj.max()], zs[ii.min()], zs[ii.max()]
        D = _fill(dep, mask) if kind == "balls" else _fill(dep, np.zeros_like(mask))
        # the face's own normal there (from the depth smoothed a little: the face as the browser
        # shades it, its normals smoothed on loading): the lid lit as the skin round it, its edge
        # where it tucks under the face no dark ring
        Ds = D.copy()
        for _ in range(6):
            Ds = (Ds * 2 + np.roll(Ds, 1, 0) + np.roll(Ds, -1, 0) + np.roll(Ds, 1, 1) + np.roll(Ds, -1, 1)) / 6
        gz_, gx_ = np.gradient(Ds, zs[1] - zs[0], xs[1] - xs[0])

        def face_n(x, z):
            n = Vector((_bilinear(xs, zs, gx_, x, z), -1.0, _bilinear(xs, zs, gz_, x, z)))
            return n.normalized()
        mx, w2 = (bx0 + bx1) / 2, (bx1 - bx0) / 2 + ms
        top, hgt = btop + mt, (btop - bbot) + mt + mb_
        rad = max((bx1 - bx0) / 2, (btop - bbot) / 2)
        zt = lambda t: top - 0.22 * hgt * t * t                 # t: -1 .. 1 across
        zb = lambda t: top - hgt * (1 - 0.45 * t * t)

        def at(x, z, off):
            y = _bilinear(xs, zs, D, x, z)
            if kind == "balls":   # (over the eyeball: a little bulge)
                q = ((x - mx) ** 2 + (z - (btop + bbot) / 2) ** 2) / rad ** 2
                y -= 0.0007 * max(0.0, 1 - q)
            return Vector((x, y - off, z))
        # the lid's own texture: the face's colours just outside its border (1.2 mm out; lashes,
        # brows and painted shadow there replaced by the skin's tone) filled smoothly across it
        # (Laplace): it carries on the eye's surround in every direction, no patch of another tone.
        # Rows: v 0 the lower edge (the lash line) .. 1 the top.
        TW, TH = 48, 32
        X2, Z2 = np.meshgrid(xs, zs)
        dist = np.hypot((X2 - mx) / (w2 + 0.006), (Z2 - (top - hgt / 2)) / (hgt / 2 + 0.006))
        ringm = (dist > 1.0) & (dist < 1.6) & ~np.isnan(col).any(2) & ~mask
        rc = col[ringm]
        lum_r = rc.mean(1)
        med = np.median(lum_r)
        tone = rc[np.abs(lum_r - med) < 0.08 * med].mean(0)

        def face_col(x, z):
            jx = int(np.clip(np.round((x - xs[0]) / (xs[1] - xs[0])), 0, len(xs) - 1))
            iz = int(np.clip(np.round((zs[0] - z) / (zs[0] - zs[1])), 0, len(zs) - 1))
            cpx = col[max(0, iz - 1):iz + 2, max(0, jx - 1):jx + 2].reshape(-1, 3)
            cpx = cpx[~np.isnan(cpx).any(1)]
            if not len(cpx):
                return tone
            q = cpx.mean(0)
            l = q.mean()
            return q if 0.6 * med < l < 1.3 * med else tone   # (a lash, a brow, a hole: the skin's tone; the painted shade round the eye kept)
        tex = np.zeros((TH, TW, 4), np.float32); tex[..., 3] = 1
        C3 = np.tile(tone, (TH, TW, 1)).astype(np.float64)
        fixd = np.zeros((TH, TW), bool)
        for tx in range(TW):
            t = -1 + 2 * (tx + 0.5) / TW
            x = mx + w2 * t
            C3[TH - 1, tx] = face_col(x, zt(t) + 0.0012); fixd[TH - 1, tx] = True
            C3[0, tx] = face_col(x, zb(t) - 0.0015); fixd[0, tx] = True
        for ty in range(TH):
            v = (ty + 0.5) / TH
            for sd, tx in ((-1, 0), (1, TW - 1)):
                z = zb(sd * 1.0) + (zt(sd * 1.0) - zb(sd * 1.0)) * v
                C3[ty, tx] = face_col(mx + sd * (w2 + 0.0012), z); fixd[ty, tx] = True
        for _ in range(800):
            avg = (np.roll(C3, 1, 0) + np.roll(C3, -1, 0) + np.roll(C3, 1, 1) + np.roll(C3, -1, 1)) / 4
            C3 = np.where(fixd[..., None], C3, avg)
        tex[..., :3] = C3
        if debug:
            from PIL import Image as _I
            _I.fromarray((np.clip(tex[::-1, :, :3], 0, 1) * 255).astype(np.uint8)).resize((TW * 6, TH * 6), 0).save(debug.replace(".png", f"_{nm}.png"))   # (top up)
        kimg = bpy.data.images.new(f"{name}_{nm}_skin", TW, TH, alpha=False)
        kimg.pixels.foreach_set(tex.ravel())
        kimg.pack()
        kmat = _material("Designer_Logic_PBR_lidskin", kimg, 0.85)
        nu, nv = 28, 14     # (fine: the faceted face round the eye must not poke through between its rows)
        skin_bm, lash_bm = bmesh.new(), bmesh.new()

        def grid(bmx, P, U):
            vs = [[bmx.verts.new(q) for q in rowp] for rowp in P]
            ul = bmx.loops.layers.uv.verify()
            for i in range(len(P) - 1):
                for jj2 in range(len(P[0]) - 1):
                    f = bmx.faces.new((vs[i][jj2], vs[i + 1][jj2], vs[i + 1][jj2 + 1], vs[i][jj2 + 1]))
                    for lp, (i2, j2) in zip(f.loops, ((i, jj2), (i + 1, jj2), (i + 1, jj2 + 1), (i, jj2 + 1))):
                        lp[ul].uv = U[i2][j2]
        P, U = [], []
        for i in range(nv + 1):
            rowp, rowu = [], []
            for jj2 in range(nu + 1):
                t = -1 + 2 * jj2 / nu
                x = mx + w2 * t
                z = zt(t) + (zb(t) - zt(t)) * i / nv
                # (the top and the sides just under the face: it hides the lid's border)
                edge = kind == "balls" and (i == 0 or jj2 in (0, nu))   # (over a socket; a painted eye's face is smooth)
                rowp.append(at(x, z, -0.0004 if edge else 0.001)); rowu.append(((t + 1) / 2, 1 - i / nv))
            P.append(rowp); U.append(rowu)
        grid(skin_bm, P, U)
        P2, U2 = [], []
        for i, dz in enumerate((0.0008, 0.0)):
            rowp, rowu = [], []
            for jj2 in range(nu + 1):
                t = -1 + 2 * jj2 / nu
                x = mx + w2 * t
                z = zb(t) + dz * (1 - 0.6 * t * t)
                rowp.append(at(x, z, 0.0012)); rowu.append((jj2 / nu, 1 - i))
            P2.append(rowp); U2.append(rowu)
        grid(lash_bm, P2, U2)
        outlines.append([(mx + w2 * t, zt(t)) for t in np.linspace(-1, 1, 15)] + [(mx + w2 * t, zb(t)) for t in np.linspace(1, -1, 15)])
        topmid = P[0][nu // 2]
        info_lids.append({"bone": nm, "kind": "slide", "top": list(topmid), "height": hgt})
        for bmx, mat, tag in ((skin_bm, kmat, "skin"), (lash_bm, lm, "lash")):
            lme = bpy.data.meshes.new(f"{name}_{nm}_{tag}")
            bmx.to_mesh(lme)
            bmx.free()
            lme["face_normals"] = [c_ for v in lme.vertices for c_ in face_n(v.co.x, v.co.z)]
            lme.uv_layers[0].name = me.uv_layers.active.name
            lob = bpy.data.objects.new(f"{name}_{nm}_{tag}", lme)
            sc.collection.objects.link(lob)
            lme.materials.append(mat)
            g = lob.vertex_groups.new(name=nm)
            g.add(list(range(len(lme.vertices))), 1.0, "REPLACE")
            lid_objs.append(lob)
    bm_rest.free()

    # ---------------------------------------------------------------- bones
    bpy.ops.object.select_all(action="DESELECT")
    bpy.context.view_layer.objects.active = arm
    arm.select_set(True)
    bpy.ops.object.mode_set(mode="EDIT")
    eb = arm.data.edit_bones
    parent = eb[head_bone]

    def bone(nm, h, t):
        x = eb.new(nm); x.head = Ai @ h; x.tail = Ai @ t; x.parent = parent
    bone("Jaw", tmj, Vector((xc, lip_y - 0.005, chin_z + 0.01)))
    bone("LipU", Vector((xc, lip_y, a + 0.002)), Vector((xc, lip_y - 0.01, a + 0.002)))
    for s_, nm in ((1, "MouthL"), (-1, "MouthR")):
        P = corners[s_]
        bone(nm, P, P + Vector((0, -0.01, 0)))
    for L in info_lids:
        tp = Vector(L["top"])
        bone(L["bone"], tp, tp + Vector((0, 0, -L["height"])))
    bpy.ops.object.mode_set(mode="OBJECT")

    # ---------------------------------------------------------------- join into the body
    for ob in [cob] + lid_objs:   # (into the body's frame)
        T_ = Mi @ ob.matrix_world
        ob.data.transform(T_)
        if T_.determinant() < 0:      # (a mirrored frame -- the walker's: keep their faces facing out)
            fb = bmesh.new(); fb.from_mesh(ob.data)
            for f in fb.faces:
                f.normal_flip()
            fb.to_mesh(ob.data); fb.free()
        ob.matrix_world = Mw
    for ob in lid_objs:   # (their normals the face's: custom normals, in the body's frame)
        fn = ob.data.get("face_normals")
        if fn:
            M3 = Mi.to_3x3()
            ns = [(M3 @ Vector(fn[3 * i:3 * i + 3])).normalized() for i in range(len(ob.data.vertices))]
            ob.data.normals_split_custom_set_from_vertices(ns)
            del ob.data["face_normals"]
    bpy.ops.object.select_all(action="DESELECT")
    for ob in [cob] + lid_objs:
        ob.select_set(True)
    body.select_set(True)
    bpy.context.view_layer.objects.active = body
    bpy.ops.object.join()
    arm.data.pose_position = "POSE"
    # ---------------------------------------------------------------- a debug picture
    if debug:
        from PIL import Image, ImageDraw
        im = Image.fromarray((np.clip(np.nan_to_num(col), 0, 1) ** (1 / 2.2) * 255).astype(np.uint8)).resize((len(xs) * 2, len(zs) * 2))
        d = ImageDraw.Draw(im)
        Pp = lambda x, z: ((x - xs[0]) / (xs[1] - xs[0]) * 2, (zs[0] - z) / (zs[0] - zs[1]) * 2)
        d.line([Pp(x, line(x)) for x in np.linspace(xc - hw, xc + hw, 30)], fill=(0, 255, 0), width=2)
        for s_, P in corners.items():
            q = Pp(P.x, P.z)
            d.ellipse([q[0] - Rc / 0.0005, q[1] - Rc / 0.0005, q[0] + Rc / 0.0005, q[1] + Rc / 0.0005], outline=(255, 0, 255))
        for o in outlines:
            d.line([Pp(x, z) for x, z in o] + [Pp(*o[0])], fill=(255, 200, 0), width=1)
        d.line([Pp(xs[0], chin_z), Pp(xs[-1], chin_z)], fill=(0, 128, 255))
        im.save(debug)
    return {"jaw": {"tmj": list(tmj), "mouth_half": hw, "face_h": faceH}, "lids": [{"bone": L["bone"], "kind": "slide"} for L in info_lids],
            "scale": hw / 0.0165}
