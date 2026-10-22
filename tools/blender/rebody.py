"""The schoolboy's body replaced by the cartoon one Aholo's Lux3D made of him (tools/aholo.py: a picture of him
redrawn over a render of this model in its rest pose, checked by tools/silhouette_check.py to stand as
it does; four views of it; a model from them), on the same armature, so the clips stay as they are:

  - imported, its pieces joined, the vertices glTF split at its UV seams welded again
  - set where the old body stands in the rest pose: the same height (feet to crown), its feet on the
    same floor, centred on the same middle (it faces -y like the old one)
  - kept whole (~295k triangles): Blender's decimation smeared its texture across its UV seams
  - its weights the old body's: each vertex takes those of the nearest point on the old surface
    (Blender's data transfer, interpolated over the nearest face), then evened out a little and kept to
    the four largest
  - the old body deleted; the new one named "body", its material "Designer_Logic_PBR" (the children's
    shading in web/src/assets.js), parented to the armature with an armature modifier

Called from tools/blender/character_schoolboy.py (in the rest pose, after the soles are set at 0).
"""
import os
import numpy as np
import bpy, bmesh
from mathutils import Matrix, Vector

FACES = 90000
SKIN = (0.776, 0.573, 0.482)    # the approved picture's face skin (sRGB, median): assets/src/aholo/schoolboy_cartoon
LIFT = 1.13     # ... lifted: the scene shades a child's skin darker than the picture shows it -- by this, its face
                # as light as the walker's (whose face texture is ~(0.90, 0.635, 0.53)) in the same light
REF = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "assets", "src", "aholo", "schoolboy_cartoon",
                   "input", "cartoon_front.png")   # the picture the user approved (its words painted out)


def tris(ob):
    return sum(len(p.vertices) - 2 for p in ob.data.polygons)


def world_points(ob):
    dg = bpy.context.evaluated_depsgraph_get()
    ev = ob.evaluated_get(dg)
    return np.array([tuple(ob.matrix_world @ v.co) for v in ev.data.vertices])


def import_model(glb):
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=glb)
    new = [o for o in bpy.data.objects if o not in before]
    meshes = [o for o in new if o.type == "MESH"]
    bpy.ops.object.select_all(action="DESELECT")
    for o in meshes:
        o.select_set(True)
    bpy.context.view_layer.objects.active = meshes[0]
    if len(meshes) > 1:
        bpy.ops.object.join()
    ob = bpy.context.view_layer.objects.active
    mw = ob.matrix_world.copy()
    ob.parent = None
    ob.matrix_world = mw
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    for o in new:
        if o is not ob and o.name in bpy.data.objects:
            bpy.data.objects.remove(o)
    bm = bmesh.new(); bm.from_mesh(ob.data)
    size = max(ob.dimensions)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=size * 1e-5)
    bmesh.ops.dissolve_degenerate(bm, edges=bm.edges, dist=size * 1e-6)
    bm.to_mesh(ob.data); bm.free(); ob.data.update()
    # its colour texture (the one on the base colour); the others (its normal and roughness maps) unlinked:
    # the scene's shading uses the colour only
    mat = ob.material_slots[0].material
    nt = mat.node_tree
    bsdf = next(n for n in nt.nodes if n.type == "BSDF_PRINCIPLED")
    src = bsdf.inputs["Base Color"].links[0].from_node
    img = src.image
    for n in list(nt.nodes):
        if n.type in ("TEX_IMAGE", "NORMAL_MAP", "SEPARATE_COLOR", "SEPRGB") and n.name != src.name:   # (not `is`: new wrappers each time)
            nt.nodes.remove(n)
    return ob, img


def fill_forehead_hole(ob, log, img=None):
    """The generator made his mole a hole through the forehead (~1.5 cm round, rays pass through to the
    back of the head): found by rays from the front over the forehead (hits far behind their neighbours),
    the walls running in from its rim taken away, the opening closed flush (its UVs those of the rim's
    vertices in the faces round it: the skin round it) and the patch smoothed."""
    from mathutils.bvhtree import BVHTree
    bm = bmesh.new(); bm.from_mesh(ob.data)
    bmesh.ops.triangulate(bm, faces=bm.faces)
    bm.verts.ensure_lookup_table(); bm.faces.ensure_lookup_table()
    bvh = BVHTree.FromBMesh(bm)
    P = np.array([tuple(v.co) for v in bm.verts]); top = P[:, 2].max(); H = np.ptp(P[:, 2])
    cx = float(np.median(P[P[:, 2] > top - 0.15 * H][:, 0]))
    y0 = P[:, 1].min() - 1
    pts, deep = [], []
    step = 0.001 * H / 1.3
    for z in np.arange(top - 0.14 * H, top - 0.07 * H, step):
        row = []
        for x in np.arange(cx - 0.03 * H / 1.3, cx + 0.03 * H / 1.3, step):
            h = bvh.ray_cast(Vector((x, y0, z)), Vector((0, 1, 0)), 3.0)
            if h[0] is not None:
                row.append((x, z, h[0].y))
        if not row:
            continue
        med = np.median([r[2] for r in row])
        for x, z, y in row:
            (deep if y > med + 0.03 * H / 1.3 else pts).append((x, z, y))
    if len(deep) < 3:
        bm.free(); log("body: no hole in the forehead"); return
    D = np.array(deep)
    c = D[:, :2].mean(0); r = np.sqrt(((D[:, :2] - c) ** 2).sum(1)).max()
    S_ = np.array(pts); rim = S_[np.abs(np.sqrt(((S_[:, :2] - c) ** 2).sum(1)) - r * 1.3) < r * 0.3]
    ys = float(np.median(rim[:, 2]))
    C = Vector((c[0], ys, c[1]))
    # the forehead's surface round it, a quadratic in x, z fitted to the hits outside the hole
    near = S_[np.sqrt(((S_[:, :2] - c) ** 2).sum(1)) < r * 4]
    X = np.c_[np.ones(len(near)), near[:, 0] - c[0], near[:, 1] - c[1], (near[:, 0] - c[0]) ** 2,
              (near[:, 0] - c[0]) * (near[:, 1] - c[1]), (near[:, 1] - c[1]) ** 2]
    coef = np.linalg.lstsq(X, near[:, 2], rcond=None)[0]
    surf = lambda x, z: coef @ np.array([1, x - c[0], z - c[1], (x - c[0]) ** 2, (x - c[0]) * (z - c[1]), (z - c[1]) ** 2])
    # the walls: in the hole's footprint, more than 2 mm behind that surface
    walls = []
    for f in bm.faces:
        m = f.calc_center_median()
        if np.hypot(m.x - c[0], m.z - c[1]) < r * 1.6 and m.y > surf(m.x, m.z) + 0.002 and m.y < surf(m.x, m.z) + 0.08:
            walls.append(f)
    bmesh.ops.delete(bm, geom=walls, context="FACES")
    # the opening: the loop of boundary edges round it
    cand = [e for e in bm.edges if e.is_boundary and np.hypot((e.verts[0].co.x + e.verts[1].co.x) / 2 - c[0],
                                                               (e.verts[0].co.z + e.verts[1].co.z) / 2 - c[1]) < r * 2.2]
    # connected loops among them; the one round the hole's centre
    loops, left = [], set(cand)
    while left:
        e0 = left.pop(); loop = {e0}; stack = [e0]
        while stack:
            e = stack.pop()
            for v in e.verts:
                for e2 in v.link_edges:
                    if e2 in left:
                        left.discard(e2); loop.add(e2); stack.append(e2)
        loops.append(loop)
    def centre(loop):
        q = np.array([tuple(v.co) for e in loop for v in e.verts]); return np.hypot(q[:, 0].mean() - c[0], q[:, 2].mean() - c[1])
    loops.sort(key=centre)
    new = []
    if loops:
        res = bmesh.ops.holes_fill(bm, edges=list(loops[0]), sides=0)
        new = res["faces"]
        if not new:
            res = bmesh.ops.contextual_create(bm, geom=list(loops[0]))
            new = res["faces"]
    uvl = bm.loops.layers.uv.active
    # one UV for the whole patch, the skin's just outside it (the forehead's UV island has a hole there
    # too, other parts of the texture packed into it: UVs spread across it showed the shirt)
    # (of the rim's skin, the texel nearest the rim's median brightness: one picked at random could be a
    # shadowed one and show as a dark blot)
    cands = []
    for f in new:
        for l in f.loops:
            for m in l.vert.link_loops:
                if m.face not in new and m.face.normal.y < -0.2:
                    cands.append(m[uvl].uv.copy())
    rim_uv = None
    if cands and img is not None:
        W, Hh = img.size
        px = np.empty(W * Hh * 4, np.float32); img.pixels.foreach_get(px); px = px.reshape(Hh, W, 4)
        lum = np.array([px[min(Hh - 1, int((u.y % 1) * Hh)), min(W - 1, int((u.x % 1) * W)), :3] @ np.array([0.3, 0.59, 0.11]) for u in cands])
        rim_uv = cands[int(np.argmin(np.abs(lum - np.median(lum))))]
    elif cands:
        rim_uv = cands[0]
    if rim_uv is not None:
        for f in new:
            for l in f.loops:
                l[uvl].uv = rim_uv
    tri = bmesh.ops.triangulate(bm, faces=new) if new else {"faces": []}
    patch = {v for f in tri["faces"] for v in f.verts}
    for _ in range(6):
        bmesh.ops.smooth_vert(bm, verts=list(patch), factor=0.5, use_axis_x=True, use_axis_y=True, use_axis_z=True)
    log(f"body: hole edges: {len(cand)} in {len(loops)} loops")
    bm.to_mesh(ob.data); bm.free(); ob.data.update()
    log(f"body: the hole in the forehead closed ({len(D)} rays through it, {2 * r * 1000:.0f} mm across; "
        f"{len(walls)} wall faces off, {len(new)} faces filled)")


def match_skin(ob, img, log):
    """The skin brought to the approved picture's (SKIN): the model's face skin measured from the front
    (rays over the cheeks and forehead, skin-hued hits), and every skin-hued texel scaled by the ratio --
    weighted by how skin-like it is (hue, saturation, brightness), so the hair, the lips, the white collar
    and the blue uniform stay as they are. (The generator's four views darkened and warmed it; its texture
    darker again.)"""
    import colorsys
    from mathutils.bvhtree import BVHTree
    from mathutils import geometry
    bm = bmesh.new(); bm.from_mesh(ob.data); bmesh.ops.triangulate(bm, faces=bm.faces); bm.faces.ensure_lookup_table()
    uvl = bm.loops.layers.uv.active; bvh = BVHTree.FromBMesh(bm)
    P = np.array([tuple(v.co) for v in bm.verts]); top = P[:, 2].max(); H = np.ptp(P[:, 2])
    cx = float(np.median(P[P[:, 2] > top - 0.15 * H][:, 0]))
    W, Hh = img.size
    px = np.empty(W * Hh * 4, np.float32); img.pixels.foreach_get(px); px = px.reshape(Hh, W, 4)
    hits = []
    for z in np.arange(top - 0.17 * H, top - 0.08 * H, 0.003):
        for x in np.arange(cx - 0.05, cx + 0.05, 0.003):
            h = bvh.ray_cast(Vector((x, P[:, 1].min() - 1, z)), Vector((0, 1, 0)), 3.0)
            if h[0] is None:
                continue
            f = bm.faces[h[2]]; a0, b0, c0 = f.loops
            w = geometry.barycentric_transform(h[0], a0.vert.co, b0.vert.co, c0.vert.co,
                                               a0[uvl].uv.to_3d(), b0[uvl].uv.to_3d(), c0[uvl].uv.to_3d())
            hits.append(px[min(Hh - 1, int((w.y % 1) * Hh)), min(W - 1, int((w.x % 1) * W)), :3])
    bm.free()
    hits = np.array(hits)
    hsv = np.array([colorsys.rgb_to_hsv(*c) for c in hits])
    sk = hits[(hsv[:, 0] < 0.12) & (hsv[:, 1] > 0.15) & (hsv[:, 1] < 0.65) & (hsv[:, 2] > 0.3)]
    if len(sk) < 30:
        log("body: skin not measured"); return
    have = np.median(sk, 0)
    want = np.array(SKIN) * LIFT
    gain = want / have
    # the weight: skin-like hue (reds to oranges), moderate saturation, not dark
    c = px[..., :3]
    mx, mn = c.max(2), c.min(2)
    sat = (mx - mn) / np.maximum(mx, 1e-6)
    hue_ok = (c[..., 0] >= c[..., 1]) & (c[..., 1] >= c[..., 2] * 0.92)
    w = hue_ok * np.clip((sat - 0.1) / 0.08, 0, 1) * np.clip((0.75 - sat) / 0.1, 0, 1) * np.clip((mx - 0.28) / 0.12, 0, 1)
    # lips (redder than the skin) less
    red = c[..., 0] / np.maximum(c[..., 1], 1e-6)
    w *= np.clip((1.75 - red) / 0.25, 0, 1)
    px[..., :3] = np.clip(c * (1 + w[..., None] * (gain - 1)), 0, 1)
    img.pixels.foreach_set(px.ravel()); img.update()
    log(f"body: skin {have.round(3)} -> {want.round(3)} (gain {gain.round(2)}, {int((w > 0.5).sum())} texels mostly skin)")


def _load_rgb(path):
    im = bpy.data.images.load(path)
    W, H = im.size
    a = np.array(im.pixels[:], np.float32).reshape(H, W, 4)[::-1, :, :3].copy()     # rows from the top
    bpy.data.images.remove(im)
    return a


def _skin_mask(a):
    mx, mn = a.max(2), a.min(2)
    sat = (mx - mn) / np.maximum(mx, 1e-6)
    return (a[..., 0] > a[..., 1]) & (a[..., 1] > a[..., 2] * 0.95) & (sat > 0.15) & (sat < 0.6) & (mx > 0.4)


def _blobs(mask):
    """connected pieces of a mask: [(size, rows, cols)]"""
    lab = np.zeros(mask.shape, int); out = []
    for y0, x0 in zip(*np.nonzero(mask)):
        if lab[y0, x0]:
            continue
        n = len(out) + 1; lab[y0, x0] = n; st = [(y0, x0)]; ys, xs = [], []
        while st:
            y, x = st.pop(); ys.append(y); xs.append(x)
            for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                p, q = y + dy, x + dx
                if 0 <= p < mask.shape[0] and 0 <= q < mask.shape[1] and mask[p, q] and not lab[p, q]:
                    lab[p, q] = n; st.append((p, q))
        out.append((len(ys), np.array(ys), np.array(xs)))
    return sorted(out, key=lambda b: -b[0])


def _edges(skin, y, cx, gap):
    """a row's face edges: out from the middle while it is skin, over gaps (an eye, a brow) up to `gap`"""
    row = skin[y]; n = len(row)

    def walk(step):
        x = last = int(cx); miss = 0
        while 0 <= x + step < n and miss <= gap:
            x += step
            if row[x]:
                last, miss = x, 0
            else:
                miss += 1
        return last
    return walk(-1), walk(1)


def _bridge_ears(E, out, eye_d):
    """one edge of a face, row by row (`out` the sign of outward), where an ear sits on it -- from a step
    outward to a step back in (each a sixth of the eyes' spacing within two rows), half to one and a half
    eye-spacings apart -- the straight line between the rows either side; and the rows bridged"""
    E = E.astype(float).copy(); n = len(E)
    d2 = np.r_[(E[2:] - E[:-2]) * out, 0, 0]
    thr = eye_d / 6
    starts = [i for i in range(n - 2) if d2[i] >= thr and d2[i] >= d2[max(0, i - 1)] and d2[i] >= d2[i + 1]]
    ends = [j for j in range(n - 2) if d2[j] <= -thr and d2[j] <= d2[max(0, j - 1)] and d2[j] <= d2[j + 1]]
    spans = []
    for j in ends:
        c = [i for i in starts if 0.5 * eye_d <= j - i <= 1.5 * eye_d]
        if c:
            i = max(c)
            E[i + 1:j + 2] = np.interp(np.arange(i + 1, j + 2), [i, j + 2], [E[i], E[j + 2]])
            spans.append((i + 1, j + 1))
    return E, spans


def _eye_pair(blobs, cx, lo, hi):
    """the two blobs most like a pair of eyes: level, either side of the middle, `lo`..`hi` apart"""
    c = [(xs.mean(), ys.mean()) for n, ys, xs in blobs if n > 4]
    best = None
    for a in c:
        for b in c:
            if a[0] < cx < b[0] and lo < b[0] - a[0] < hi:
                cost = abs(a[1] - b[1]) + abs(a[0] + b[0] - 2 * cx)
                if best is None or cost < best[0]:
                    best = (cost, a, b)
    return best[1], best[2]


def _rows(lum, skin, cx, eye_y, eye_d):
    """down the middle of a face from its eyes (a row, their spacing): the hairline (the skin's top), the
    nose (the nostrils' shadow: the darkest row of a band as wide as the nose), the mouth (the darkest row
    of the middle below it)"""
    cx = int(round(cx))
    c = lum[:, cx - 3:cx + 4].mean(1)
    b = lum[:, int(cx - 0.22 * eye_d):int(cx + 0.22 * eye_d) + 1].mean(1)
    y = int(eye_y)
    while y > 0 and skin[y - 1, cx]:
        y -= 1
    a, z = int(eye_y + 0.35 * eye_d), int(eye_y + 0.75 * eye_d)
    nose = a + int(np.argmin(b[a:z]))
    a, z = int(nose + 0.15 * eye_d), int(eye_y + 1.2 * eye_d)
    mouth = a + int(np.argmin(c[a:z]))
    return y, nose, mouth, c


def _smooth(v, sigma):
    k = np.exp(-0.5 * (np.arange(-3 * sigma, 3 * sigma + 1) / sigma) ** 2); k /= k.sum()
    p = np.pad(v, len(k) // 2, mode="edge")
    return np.convolve(p, k, mode="valid")


def _uv_tris(me, TW, TH):
    """the mesh's triangles in texel units: corners (n, 3, 2), their boxes, materials, vertices"""
    uvs = np.empty(len(me.loops) * 2); me.uv_layers.active.data.foreach_get("uv", uvs)
    uvs = uvs.reshape(-1, 2) * [TW, TH]
    me.calc_loop_triangles()
    n = len(me.loop_triangles)
    tl = np.empty(n * 3, np.int64); me.loop_triangles.foreach_get("loops", tl)
    tv = np.empty(n * 3, np.int64); me.loop_triangles.foreach_get("vertices", tv)
    mi = np.empty(n, np.int64); me.loop_triangles.foreach_get("material_index", mi)
    T = uvs[tl.reshape(-1, 3)]
    return T, np.floor(T.min(1)).astype(int), np.ceil(T.max(1)).astype(int), mi, tv.reshape(-1, 3)


def _raster(T, lo, hi, t, TW, TH):
    """the texels (rows, columns) whose centres lie in triangle t"""
    A, B, Cc = T[t]
    (ax, ay), (bx, by) = lo[t], hi[t]
    yy, xx = np.mgrid[max(0, ay):min(TH, by + 1), max(0, ax):min(TW, bx + 1)]
    d = (B[1] - Cc[1]) * (A[0] - Cc[0]) + (Cc[0] - B[0]) * (A[1] - Cc[1])
    if not yy.size or abs(d) < 1e-12:
        return yy[:0], xx[:0]
    qx, qy = xx + 0.5, yy + 0.5
    l1 = ((B[1] - Cc[1]) * (qx - Cc[0]) + (Cc[0] - B[0]) * (qy - Cc[1])) / d
    l2 = ((Cc[1] - A[1]) * (qx - Cc[0]) + (A[0] - Cc[0]) * (qy - Cc[1])) / d
    m = (l1 >= -1e-6) & (l2 >= -1e-6) & (l1 + l2 <= 1 + 1e-6)
    return yy[m], xx[m]


def _coverage(me, TW, TH, box):
    """the texels (TH x TW) whose centres some triangle of the mesh covers, within box (x0, x1, y0, y1)"""
    T, lo, hi, mi, _ = _uv_tris(me, TW, TH)
    x0, x1, y0, y1 = box
    sel = np.nonzero((hi[:, 0] >= x0) & (lo[:, 0] <= x1) & (hi[:, 1] >= y0) & (lo[:, 1] <= y1) & (mi == 0)
                     & ((hi - lo).max(1) < 64))[0]
    cov = np.zeros((TH, TW), bool)
    for t in sel:
        yy, xx = _raster(T, lo, hi, t, TW, TH)
        cov[yy, xx] = True
    return cov


def _grow(tpx, known, into, steps):
    """colour carried from the `known` texels into the `into` texels next to them, a ring at a time (each
    the mean of its known neighbours); how many were reached"""
    ys_, xs_ = np.nonzero(known)
    if not len(ys_):
        return 0
    H, W = known.shape
    y0, y1 = max(0, ys_.min() - steps - 1), min(H, ys_.max() + steps + 2)
    x0, x1 = max(0, xs_.min() - steps - 1), min(W, xs_.max() + steps + 2)
    K = known[y0:y1, x0:x1].copy(); I = into[y0:y1, x0:x1]; T_ = tpx[y0:y1, x0:x1, :3]
    n = 0
    for _ in range(steps):
        acc = np.zeros_like(T_); cnt = np.zeros(K.shape)
        for dy in (-1, 0, 1):
            for dx in (-1, 0, 1):
                if dy or dx:
                    sh = np.roll(np.roll(K, dy, 0), dx, 1)
                    acc += np.roll(np.roll(T_, dy, 0), dx, 1) * sh[..., None]; cnt += sh
        new = (cnt > 0) & I & ~K
        if not new.any():
            break
        T_[new] = acc[new] / cnt[new][:, None]
        K |= new; n += int(new.sum())
    return n


def _ss(a, b, x):
    t = np.clip((np.asarray(x, float) - a) / (b - a), 0.0, 1.0)
    return t * t * (3 - 2 * t)


def fix_neck(ob, arm, log, head="mixamorig:Head", neck="mixamorig:Neck", chest="mixamorig:Spine2"):
    """The neck the old body's auto-rig left almost all to the chest (Spine2): looking up, the chin went
    with the head and the throat stayed -- the face drawn down into the neck. In the middle of the body
    (out to the jaw's sides) the weights are set by two planes across the neck, seen from the side:
      - the head's: from under the chin (where the front of the face steps back to the throat) to the
        back of the neck halfway down from the head's joint -- above it the head;
      - the neck's root: 3 cm lower, parallel -- above it the neck, below it the chest (the open collar's
        skin, the shirt)
    each blended over a centimetre or so; toward the sides (the shoulders, the ears) faded back into
    the weights it had."""
    from mathutils.bvhtree import BVHTree
    me = ob.data
    Mw, Mo = arm.matrix_world, ob.matrix_world
    Hb = Mw @ arm.data.bones[head].head_local
    bm = bmesh.new(); bm.from_mesh(me); bm.transform(Mo); bvh = BVHTree.FromBMesh(bm); bm.free()

    def ray(z, from_front=True):
        o = Vector((Hb.x, -2.0 if from_front else 2.0, z))
        h = bvh.ray_cast(o, Vector((0, 1 if from_front else -1, 0)), 5)
        return h[0].y if h[0] else np.nan
    zs = np.arange(Hb.z, Hb.z - 0.09, -0.002)
    fy = np.array([ray(z) for z in zs])
    jump = np.nonzero(np.diff(fy) > 0.025)[0]                  # (the front steps back: under the chin)
    if not len(jump):
        log("body: neck not fixed (no chin found)"); return
    k = jump[0]
    zc, yt = zs[k], fy[k + 1]                                  # under the chin; the throat's front
    zb = (zc + Hb.z) / 2
    yb = ray(zb, False)
    A, Bp = np.array([yt, zc]), np.array([yb, zb])            # (y, z) the head's plane, seen from the side
    d = (Bp - A) / np.linalg.norm(Bp - A)
    nrm = np.array([-d[1], d[0]])                              # (up, toward the front)
    if nrm[1] < 0:
        nrm = -nrm
    V = np.array([tuple(Mo @ v.co) for v in me.vertices])
    s_head = (V[:, 1:3] - A) @ nrm
    s_root = s_head + 0.03 * nrm[1]
    h = _ss(-0.004, 0.009, s_head)
    n = _ss(-0.012, 0.012, s_root)
    f = (_ss(0.075, 0.055, np.abs(V[:, 0] - Hb.x)) * _ss(zc - 0.1, zc - 0.07, V[:, 2])
         * _ss(Hb.z + 0.06, Hb.z + 0.03, V[:, 2]))
    gi = {g.name: g.index for g in ob.vertex_groups}
    gh, gn, gc = (ob.vertex_groups[x] for x in (head, neck, chest))
    want = {gh.index: h, gn.index: (1 - h) * n, gc.index: (1 - h) * (1 - n)}
    changed = 0
    for i in np.nonzero(f > 1e-3)[0]:
        v = me.vertices[i]
        old = {e.group: e.weight for e in v.groups}
        new = {g: w_ * (1 - f[i]) for g, w_ in old.items()}
        for g, arr in want.items():
            new[g] = new.get(g, 0.0) + f[i] * arr[i]
        for g, w_ in new.items():
            vg = ob.vertex_groups[g]
            if w_ > 1e-4:
                vg.add([int(i)], float(w_), "REPLACE")
            elif g in old:
                vg.remove([int(i)])
        changed += 1
    log(f"body: neck weights redone ({changed} vertices; under the chin z {zc:.3f}, throat y {yt:+.3f}, "
        f"back of the neck y {yb:+.3f} at z {zb:.3f})")


HAND_SKIN = None      # (set per build: the forearm's skin at the wrist)


def clean_skin_marks(ob, img, log, regions, prefix="mixamorig:"):
    """Blotches the texture's painter left on the skin -- the walker's: red-brown patches round the neck,
    scab-like spots on the knees. For each region (the bones its skin goes with: the weights), the skin's
    own colour (the median of its skin-coloured texels) and redness; a texel clearly redder than that,
    or much darker, counts as a blotch (with a texel round it), refilled from the clean skin about it.
    The face is left alone (lips, cheeks and the painted shade there are meant)."""
    me = ob.data
    TW, TH = img.size
    tpx = np.empty(TW * TH * 4, np.float32); img.pixels.foreach_get(tpx); tpx = tpx.reshape(TH, TW, 4)
    T, lo, hi, mi, tv = _uv_tris(me, TW, TH)
    small = (mi == 0) & ((hi - lo).max(1) < 64)
    names = {g.index: g.name[len(prefix):] if g.name.startswith(prefix) else g.name for g in ob.vertex_groups}
    c = tpx[..., :3]
    lum = c @ np.array([0.3, 0.59, 0.11])
    red = (c[..., 0] - c[..., 1]) / np.maximum(c[..., 0] + c[..., 1], 1e-6)
    mx, mn = c.max(2), c.min(2)
    skinish = ((c[..., 0] > c[..., 1]) & (c[..., 1] > c[..., 2] * 0.8) & ((mx - mn) / np.maximum(mx, 1e-6) > 0.12)
               & (mx > 0.25) & (lum > 0.4))                     # (lit enough: a dull brown patch on the shirt is not skin)
    out = []
    Vw = np.array([tuple(ob.matrix_world @ v.co) for v in me.vertices])
    Vz = Vw[:, 2]
    warm = c[..., 0] > c[..., 2] * 1.05                       # (never the shirt: a blotch's edge spreads over skin only)
    for region in regions:
        label, bones = region[0], region[1]
        zmax = region[2] if len(region) > 2 else None       # (only below this height: the head's skin under the jaw)
        ymin = region[3] if len(region) > 3 else None       # (and behind this: not the face)
        w = np.zeros(len(me.vertices))
        for v in me.vertices:
            for e in v.groups:
                if names.get(e.group) in bones:
                    w[v.index] += e.weight
        sel = small & (w[tv].mean(1) > 0.5)
        if zmax is not None:
            sel &= Vz[tv].max(1) < zmax
        if ymin is not None:
            sel &= Vw[tv][:, :, 1].min(1) > ymin
        m = np.zeros((TH, TW), bool)
        for t in np.nonzero(sel)[0]:
            yy, xx = _raster(T, lo, hi, t, TW, TH)
            m[yy, xx] = True
        sk = m & skinish
        if sk.sum() < 50:
            out.append(f"{label}: no skin"); continue
        l0, r0 = np.median(lum[sk]), np.median(red[sk])
        reddish = m & warm & (c[..., 0] > c[..., 1] * 1.05) & ((mx - mn) / np.maximum(mx, 1e-6) > 0.2)
        # (a blotch: clearly redder than the skin at any brightness -- thin dark-red lines too -- or, on lit
        # skin, much darker; skin in plain shade is as red as the rest and stays)
        bad = (reddish & (red - r0 > 0.06)) | (sk & ((red - r0 > 0.045) | (lum < 0.7 * l0)))
        for _ in range(2):
            bad = m & warm & (bad | np.roll(bad, 1, 0) | np.roll(bad, -1, 0) | np.roll(bad, 1, 1) | np.roll(bad, -1, 1))
        good = sk & ~bad
        n = _grow(tpx, good, bad, 60)
        lum = c @ np.array([0.3, 0.59, 0.11])
        red = (c[..., 0] - c[..., 1]) / np.maximum(c[..., 0] + c[..., 1], 1e-6)
        still = bad & ((red - r0 > 0.045) | (lum < 0.7 * l0))      # (out of the clean skin's reach: its middle tone)
        c[still] = np.median(c[good], 0)
        # (the refill softened a little: a box blur over the filled texels only)
        for _ in range(2):
            ys_, xs_ = np.nonzero(bad)
            if not len(ys_):
                break
            acc = np.zeros((len(ys_), 3)); cnt = 0
            for dy in (-1, 0, 1):
                for dx in (-1, 0, 1):
                    acc += c[np.clip(ys_ + dy, 0, TH - 1), np.clip(xs_ + dx, 0, TW - 1)]; cnt += 1
            c[ys_, xs_] = acc / cnt
        out.append(f"{label}: {int(bad.sum())} of {int(sk.sum())} skin texels ({n} refilled)")
    img.pixels.foreach_set(tpx.ravel()); img.update()
    log("body: skin marks cleaned -- " + "; ".join(out))


def fix_unseen(ob, arm, img, log):
    """What the generator could not see in its four views it coloured at random, in islands of a few
    texels each: greyish-pink, white and violet flecks on the shirt's sides under the arms -- seen as the
    clips lift the arms. Triangle by triangle (their texels' mean), round the armpits (by where they
    are): on the body only the shirt's blue, on the arm the shirt, its stripes or the skin; a fleck takes
    the shirt round it. (The hands' blue flecks went with the hands: new_hands.)"""
    me = ob.data
    TW, TH = img.size
    tpx = np.empty(TW * TH * 4, np.float32); img.pixels.foreach_get(tpx); tpx = tpx.reshape(TH, TW, 4)
    T, lo, hi, mi, tv = _uv_tris(me, TW, TH)
    V = np.array([tuple(v.co) for v in me.vertices])
    gi = {g.index: g.name for g in ob.vertex_groups}
    hand, limb = np.zeros(len(V)), np.zeros(len(V))
    for v in me.vertices:
        for e in v.groups:
            n = gi.get(e.group, "")
            if "Hand" in n:
                hand[v.index] += e.weight
            if n.endswith("Arm"):                 # (the arms: RightArm, RightForeArm, ...)
                limb[v.index] += e.weight
    Mw = arm.matrix_world
    sh = [Mw @ arm.data.bones["mixamorig:" + n].head_local for n in ("RightArm", "LeftArm")]
    pit_z, cx = sum(p.z for p in sh) / 2, sum(p.x for p in sh) / 2
    pit_x = sum(abs(p.x - cx) for p in sh) / 2
    C = V[tv].mean(1)
    small = (mi == 0) & ((hi - lo).max(1) < 64)
    parts = {"armpits": small & (C[:, 2] > pit_z - 0.2) & (C[:, 2] < pit_z - 0.02)
                        & (np.abs(C[:, 0] - cx) > pit_x - 0.07) & (np.abs(C[:, 0] - cx) < pit_x + 0.05)}
    c = tpx[..., :3]
    out = []
    for part, sel in parts.items():
        tris = []
        for t in np.nonzero(sel)[0]:
            yy, xx = _raster(T, lo, hi, t, TW, TH)
            if len(yy):
                tris.append((yy, xx, c[yy, xx].mean(0), t))
        M = np.array([q[2] for q in tris])
        blue = (M[:, 2] > M[:, 0] * 1.3) & (M[:, 2] > M[:, 1] * 1.15)
        mx_, mn_ = M.max(1), M.min(1)
        skin = (M[:, 0] > M[:, 1]) & (M[:, 1] > M[:, 2]) & ((mx_ - mn_) / np.maximum(mx_, 1e-6) > 0.2) & (mx_ > 0.35)
        if part == "hands":
            bad, want = blue, np.median(M[skin], 0)
            for (yy, xx, _, _), b in zip(tris, bad):
                if b:
                    c[yy, xx] = want
            out.append(f"{part}: {int(bad.sum())} of {len(tris)} triangles -> {want.round(3)}")
            continue
        # round the armpits: on the body (not going with the arm's bones) only the shirt -- the flecks
        # there came pale pink as well as white and violet -- and on the arm the shirt, its white
        # stripes or the skin; a bad
        # one takes the median of the shirt's triangles round it (1.5 cm, in 3D: its shading there)
        from mathutils.kdtree import KDTree
        on_arm = limb[tv[[q[3] for q in tris]]].mean(1) > 0.5
        white = (mx_ > 0.6) & ((mx_ - mn_) / np.maximum(mx_, 1e-6) < 0.25)       # (the sleeves' stripes)
        bad = ~blue & ~((skin | white) & on_arm)
        P3 = C[[q[3] for q in tris]]
        kd = KDTree(int(blue.sum()))
        good_i = np.nonzero(blue)[0]          # (the shirt's: not the arm's skin)
        for k, i in enumerate(good_i):
            kd.insert(P3[i], k)
        kd.balance()
        fixed = 0
        for i, (yy, xx, m_, _) in enumerate(tris):
            if bad[i]:
                near = [good_i[k] for _, k, _ in kd.find_range(P3[i], 0.015)] or [good_i[k] for _, k, _ in kd.find_n(P3[i], 8)]
                c[yy, xx] = np.median(M[near], 0); fixed += 1
        out.append(f"{part}: {fixed} of {len(tris)} triangles to the shirt round them")
    img.pixels.foreach_set(tpx.ravel()); img.update()
    log("body: unseen parts recoloured -- " + "; ".join(out))


def even_chest(ob, arm, img, log):
    """The chest's skin in the open collar, which the generator could not see in its views, came in red
    streaks: evened toward its own middle tone (its warm texels -- not the white collar -- on the front
    of the chest and neck, by the bones they go with: the weights from the old body)."""
    me = ob.data
    TW, TH = img.size
    tpx = np.empty(TW * TH * 4, np.float32); img.pixels.foreach_get(tpx); tpx = tpx.reshape(TH, TW, 4)
    T, lo, hi, mi, tv = _uv_tris(me, TW, TH)
    V = np.array([tuple(v.co) for v in me.vertices])
    gi = {g.index: g.name.replace("mixamorig:", "") for g in ob.vertex_groups}
    chest = np.zeros(len(V))
    for v in me.vertices:
        for e in v.groups:
            if gi.get(e.group, "") in ("Spine2", "Neck"):
                chest[v.index] += e.weight
    Mw = arm.matrix_world
    pit_z = sum((Mw @ arm.data.bones["mixamorig:" + n].head_local).z for n in ("RightArm", "LeftArm")) / 2
    head_z = (Mw @ arm.data.bones["mixamorig:Head"].head_local).z
    C = V[tv].mean(1)
    N = np.cross(V[tv[:, 1]] - V[tv[:, 0]], V[tv[:, 2]] - V[tv[:, 0]])
    N /= np.maximum(np.linalg.norm(N, axis=1), 1e-12)[:, None]
    sel = ((mi == 0) & ((hi - lo).max(1) < 64) & (chest[tv].mean(1) > 0.5) & (C[:, 2] > pit_z - 0.06)
           & (C[:, 2] < head_z) & (N[:, 1] < -0.3))
    m = np.zeros((TH, TW), bool)
    for t in np.nonzero(sel)[0]:
        yy, xx = _raster(T, lo, hi, t, TW, TH)
        m[yy, xx] = True
    c = tpx[..., :3]
    q = c[m]; mx_, mn_ = q.max(1), q.min(1)
    warm = (q[:, 0] > q[:, 1]) & (q[:, 1] > q[:, 2] * 0.9) & ((mx_ - mn_) / np.maximum(mx_, 1e-6) > 0.15) & (mx_ > 0.25)
    mid = np.median(q[warm], 0)
    ys_, xs_ = np.nonzero(m); ys_, xs_ = ys_[warm], xs_[warm]
    c[ys_, xs_] = c[ys_, xs_] * 0.3 + mid * 0.7
    img.pixels.foreach_set(tpx.ravel()); img.update()
    log(f"body: the chest in the collar evened ({len(ys_)} texels toward {mid.round(3)})")


def pad_islands(ob, img, log, steps=8):
    """Each island of the texture's colour carried out `steps` texels over the margin round it. The
    generator cut what it could not see well -- the sides under the arms, the fingers -- into islands of
    a few texels each, set in margins of blurred colour from elsewhere (skin, grey, white); sampled across
    their edges and in the smaller mip levels those margins showed: blue flecks over the fingers, a
    scramble of white and violet on the shirt's side under the right arm."""
    TW, TH = img.size
    tpx = np.empty(TW * TH * 4, np.float32); img.pixels.foreach_get(tpx); tpx = tpx.reshape(TH, TW, 4)
    cov = _coverage(ob.data, TW, TH, (0, TW, 0, TH))
    n = _grow(tpx, cov, ~cov, steps)
    img.pixels.foreach_set(tpx.ravel()); img.update()
    log(f"body: the texture's islands padded {steps} texels out ({n} texels of margin, {100 * cov.mean():.0f}% covered)")


def fit_face(ob, img, log, head_bone="mixamorig:Head"):
    """The face made the approved picture's (REF). The model came with the picture's eyes, hairline and
    chin where they are in it (by the eyes' spacing), but its nose and mouth lower, its jaw rounder and
    wider, its eyes two dots. So, on the front of the head (its vertices weighted to the head bone, in
    front of the neck):
      - the nose, mouth and chin moved up to where the picture has them (the hairline and the eyes stay;
        a smooth curve between),
      - the jaw narrowed row by row to the picture's outline (below the ears; only narrower),
      - then the picture's face (eyes, brows, nose, mouth, skin) painted onto the texture where the face
        looks forward, fading out toward the picture's outline (its ears bridged over) and where the face
        turns away.
    The picture is found the same way the model is: eyes the darkest pair of blobs, the rows down the
    middle (_rows), the chin where the picture's middle drops into the shadow under it / where the
    model's surface goes back to the neck."""
    from mathutils.bvhtree import BVHTree
    from mathutils import geometry
    lumw = np.array([0.3, 0.59, 0.11])
    ref = _load_rgb(REF)
    RH, RW = ref.shape[:2]
    rsk, rl = _skin_mask(ref), ref @ lumw
    rcx = RW / 2
    # the picture
    reg = np.zeros_like(rsk); reg[int(0.1 * RH):int(0.3 * RH), int(rcx - 0.09 * RW):int(rcx + 0.09 * RW)] = True
    pL, pR = _eye_pair(_blobs(reg & (rl < 0.1)), rcx, 0.03 * RW, 0.1 * RW)
    p_eye, p_d, p_mid = (pL[1] + pR[1]) / 2, pR[0] - pL[0], (pL[0] + pR[0]) / 2
    p_hair, p_nose, p_mouth, pc = _rows(rl, rsk, p_mid, p_eye, p_d)
    a, z = int(p_mouth + 0.3 * p_d), int(p_mouth + 1.0 * p_d)
    pcs = _smooth(pc, 1.0)
    p_chin = a + int(np.argmin(pcs[a + 2:z + 2] - pcs[a - 2:z - 2]))
    rows_p = np.arange(int(p_hair), p_chin + 1)
    E = np.array([_edges(rsk, y, p_mid, 0.7 * p_d) for y in rows_p], float)
    pEL, sl = _bridge_ears(E[:, 0], -1, p_d)
    pER, sr = _bridge_ears(E[:, 1], 1, p_d)
    p_ear_end = rows_p[max([e for _, e in sl + sr], default=0)] + 1
    pw = pER - pEL
    k0 = p_ear_end - rows_p[0]
    p_jaw_end = rows_p[k0 + int(np.argmin(pw[k0:]))]          # (below: the neck behind the chin)
    log(f"face: picture eyes {pL[0]:.0f},{pL[1]:.0f} / {pR[0]:.0f},{pR[1]:.0f} px; rows: hairline {p_hair}, "
        f"nose {p_nose}, mouth {p_mouth}, chin {p_chin}; ears down to {p_ear_end}, jaw to {p_jaw_end}")

    # the model from the front (1 mm rays): colour, depth
    bm = bmesh.new(); bm.from_mesh(ob.data); bmesh.ops.triangulate(bm, faces=bm.faces); bm.faces.ensure_lookup_table()
    uvl = bm.loops.layers.uv.active; bvh = BVHTree.FromBMesh(bm)
    V = np.array([tuple(v.co) for v in ob.data.vertices]); top = V[:, 2].max(); H = np.ptp(V[:, 2])
    mcx = float(np.median(V[V[:, 2] > top - 0.25 * H][:, 0])); y_in = V[:, 1].min() - 1
    TW, TH = img.size
    tpx = np.empty(TW * TH * 4, np.float32); img.pixels.foreach_get(tpx); tpx = tpx.reshape(TH, TW, 4)
    C = 0.001
    gx = np.arange(mcx - 0.13, mcx + 0.13, C); gz = top + 0.002 - C * np.arange(int(0.34 * H / C))
    mcol = np.zeros((len(gz), len(gx), 3), np.float32); dep = np.full((len(gz), len(gx)), np.nan)
    for i, z in enumerate(gz):
        for j, x in enumerate(gx):
            h = bvh.ray_cast(Vector((x, y_in, z)), Vector((0, 1, 0)), 3.0)
            if h[0] is None:
                continue
            f = bm.faces[h[2]]; a0, b0, c0 = f.loops
            w = geometry.barycentric_transform(h[0], a0.vert.co, b0.vert.co, c0.vert.co,
                                               a0[uvl].uv.to_3d(), b0[uvl].uv.to_3d(), c0[uvl].uv.to_3d())
            mcol[i, j] = tpx[min(TH - 1, int((w.y % 1) * TH)), min(TW - 1, int((w.x % 1) * TW)), :3]
            dep[i, j] = h[0].y
    bm.free()
    msk, ml = _skin_mask(mcol) & ~np.isnan(dep), mcol @ lumw
    reg = np.zeros_like(msk); reg[int(0.1 * H / C):int(0.22 * H / C), :] = True
    mL, mR = _eye_pair(_blobs(reg & ~np.isnan(dep) & (ml < 0.18)), (mcx - gx[0]) / C, 0.04 / C, 0.12 / C)
    m_eye, m_d, m_mid = (mL[1] + mR[1]) / 2, mR[0] - mL[0], (mL[0] + mR[0]) / 2        # (rows, columns)
    m_hair, m_nose, m_mouth, _ = _rows(ml, msk, m_mid, m_eye, m_d)
    ci = int(round(m_mid)); dc = dep[:, ci]
    a, z = int(m_mouth + 0.3 * m_d), int(m_mouth + 1.0 * m_d)
    m_chin = a + int(np.nanargmax(np.diff(dc[a:z + 1])))
    yf = np.nanmin(dep[int(m_eye):m_chin])                       # (the tip of the nose)
    # its jaw's outline: the outermost surface in front of the ears and the neck
    sil = np.full(len(gz), np.nan)
    for i in range(int(m_eye), m_chin + 1):
        js = np.nonzero(~np.isnan(dep[i]))[0]
        if len(js) and max(dep[i, js[0]], dep[i, js[-1]]) - yf < 0.125:
            sil[i] = (js[-1] - js[0]) / 2
    vr = np.nonzero(~np.isnan(sil))[0]
    m_ear_end = vr[0]; m_jaw_end = vr[0] + int(np.argmax(np.diff(np.r_[vr, 10 ** 6]) > 1))
    s = m_d / p_d                                   # model rows (mm) per picture pixel
    log(f"face: model eyes {m_d:.1f} mm apart ({s:.3f} mm per picture px); rows below the crown: hairline "
        f"{m_hair}, eyes {m_eye:.0f}, nose {m_nose}, mouth {m_mouth}, chin {m_chin}; jaw outline {m_ear_end}..{m_jaw_end}")
    # where the picture has them, in model rows
    tgt = lambda py: m_eye + (py - p_eye) * s
    keys = [(m_hair, 0.0), (m_eye, 0.0), (m_nose, m_nose - tgt(p_nose)), (m_mouth, m_mouth - tgt(p_mouth)),
            (m_chin, m_chin - tgt(p_chin))]
    log("face: moved up (mm): " + ", ".join(f"{n} {v:+.1f}" for n, (_, v) in zip(("hairline", "eyes", "nose", "mouth", "chin"), keys)))
    R = np.arange(len(gz))
    up = _smooth(np.interp(R, [k for k, _ in keys], [v for _, v in keys]), 5.0)        # rows (mm) up, by row
    up[R <= m_eye] = 0.0
    up = _smooth(up, 2.0)
    # the jaw's half-width wanted, by (unmoved) row: the picture's at the row it is moved to
    ratio = np.full(len(gz), np.nan)
    for i in range(m_ear_end, m_jaw_end + 1):
        py = p_eye + (i - up[i] - m_eye) / s
        k = int(round(py)) - rows_p[0]
        if p_ear_end <= py <= p_jaw_end and 0 <= k < len(pw) and not np.isnan(sil[i]):
            ratio[i] = pw[k] / 2 * s / sil[i]
    ok = np.nonzero(~np.isnan(ratio))[0]
    r0, r1 = ok[0], ok[-1]
    rr = np.minimum(_smooth(np.interp(R, ok, ratio[ok]), 3.0), 1.0).clip(0.75, 1.0)
    rr[:r0] = 1 + (rr[r0] - 1) * np.clip((R[:r0] - (r0 - 0.25 * m_d)) / (0.25 * m_d), 0, 1)
    rr[r1:] = rr[r1]
    log(f"face: jaw narrowed x{rr[r0]:.2f} (row {r0}) .. x{rr[int((r0 + r1) / 2)]:.2f} .. x{rr[r1]:.2f} (row {r1} and below)")
    # the vertices of the face: weighted to the head, in front of the neck
    g = ob.vertex_groups[head_bone].index
    hw = np.array([next((e.weight for e in v.groups if e.group == g), 0.0) for v in ob.data.vertices])
    wd = np.clip((0.135 - (V[:, 1] - yf)) / 0.025, 0, 1)
    vrow = np.clip((top + 0.002 - V[:, 2]) / C, 0, len(gz) - 1)
    w = hw * wd * (vrow > m_hair - 20)
    V2 = V.copy()
    V2[:, 2] += np.interp(vrow, R, up) * C * w
    V2[:, 0] = mcx + (V[:, 0] - mcx) * (1 + (np.interp(vrow, R, rr) - 1) * w)
    ob.data.vertices.foreach_set("co", V2.ravel()); ob.data.update()
    log(f"face: {int((w > 0.01).sum())} vertices moved, at most {np.abs(V2 - V).max() * 1000:.1f} mm")

    # the picture's face onto the texture
    soft = np.zeros((RH, RW), np.float32)
    for k, y in enumerate(rows_p):
        if y > p_hair + 0.2 * p_d:          # (not up to the hairline: the model's fringe hangs lower in places)
            soft[y, int(round(pEL[k])):int(round(pER[k])) + 1] = 1
    for _ in range(3):
        soft = (soft * 2 + np.roll(soft, 1, 0) + np.roll(soft, -1, 0) + np.roll(soft, 1, 1) + np.roll(soft, -1, 1)) / 6
    soft = np.clip((soft - 0.1) / 0.8, 0, 1)
    sm = s * C                                       # metres per picture pixel
    lit = np.clip(ref * LIFT, 0, 1)                  # (its colours lifted as the skin is: match_skin)
    ex, ez = gx[0] + m_mid * C, gz[0] - m_eye * C     # the model's eyes' middle
    me = ob.data; uv = me.uv_layers.active.data
    me.calc_loop_triangles()
    zlo, zhi = ez - (p_chin + 4 - p_eye) * sm, ez + (p_eye - p_hair + 4) * sm
    done = 0; painted = np.zeros((TH, TW), bool)
    for t in me.loop_triangles:
        vi = list(t.vertices)
        Pt = V2[vi]
        if Pt[:, 2].max() < zlo or Pt[:, 2].min() > zhi or Pt[:, 1].min() - yf > 0.08 or hw[vi].min() < 0.3:
            continue
        n = np.cross(Pt[1] - Pt[0], Pt[2] - Pt[0]); nl = np.linalg.norm(n)
        if nl < 1e-12 or -n[1] / nl < 0.35:
            continue
        facing = -n[1] / nl
        U = np.array([tuple(uv[li].uv) for li in t.loops]) * [TW, TH]
        x0, y0 = np.floor(U.min(0)).astype(int); x1, y1 = np.ceil(U.max(0)).astype(int)
        if x1 - x0 > 64 or y1 - y0 > 64:
            continue
        yy, xx = np.mgrid[max(0, y0):min(TH, y1 + 1), max(0, x0):min(TW, x1 + 1)]
        q = np.c_[xx.ravel() + 0.5, yy.ravel() + 0.5]
        A, B, Cc = U
        v0, v1, v2 = B - A, Cc - A, q - A
        d00, d01, d11 = v0 @ v0, v0 @ v1, v1 @ v1
        den = d00 * d11 - d01 * d01
        if abs(den) < 1e-12:
            continue
        b1 = (d11 * (v2 @ v0) - d01 * (v2 @ v1)) / den; b2 = (d00 * (v2 @ v1) - d01 * (v2 @ v0)) / den
        inside = (b1 >= -0.02) & (b2 >= -0.02) & (b1 + b2 <= 1.02)
        if not inside.any():
            continue
        Xw = np.c_[1 - b1 - b2, b1, b2][inside] @ Pt
        px = p_mid + (Xw[:, 0] - ex) / sm; py = p_eye - (Xw[:, 2] - ez) / sm
        okp = (px >= 0) & (px < RW - 1) & (py >= 0) & (py < RH - 1)
        if not okp.any():
            continue
        ix, iy = px[okp], py[okp]
        x0i, y0i = ix.astype(int), iy.astype(int); fx, fy = (ix - x0i)[:, None], (iy - y0i)[:, None]
        c = (lit[y0i, x0i] * (1 - fx) * (1 - fy) + lit[y0i, x0i + 1] * fx * (1 - fy)
             + lit[y0i + 1, x0i] * (1 - fx) * fy + lit[y0i + 1, x0i + 1] * fx * fy)
        wt = (soft[y0i, x0i] * np.clip((facing - 0.35) / 0.3, 0, 1))[:, None]
        ty, tx = yy.ravel()[inside][okp], xx.ravel()[inside][okp]
        tpx[ty, tx, :3] = tpx[ty, tx, :3] * (1 - wt) + c * wt
        painted[ty, tx] |= wt[:, 0] > 0.01
        done += int((wt > 0.5).sum())
    # the margins round the painted islands (the texture is sampled across an island's edge: unpainted,
    # its edges showed as fine lines over the face): their colour carried out 3 texels, where no
    # triangle has its own
    ys_, xs_ = np.nonzero(painted)
    cov = _coverage(me, TW, TH, (xs_.min() - 4, xs_.max() + 5, ys_.min() - 4, ys_.max() + 5))
    grown = _grow(tpx, painted, ~cov, 3)
    img.pixels.foreach_set(tpx.ravel()); img.update()
    log(f"face: the picture's face painted onto {done} texels (and {grown} round the islands' edges)")


def seam_verts(ob):
    """vertices on a UV seam (their corners not all at one UV)"""
    me = ob.data; uv = me.uv_layers.active.data
    first, seam = {}, set()
    for l in me.loops:
        u = (round(uv[l.index].uv.x, 5), round(uv[l.index].uv.y, 5))
        if first.setdefault(l.vertex_index, u) != u:
            seam.add(l.vertex_index)
    return seam


def lighten(ob, faces, log):
    """collapsed towards `faces` triangles, the UV seams' vertices held (collapsing across a seam smeared
    the texture over the triangles there -- a pale patch and a crease through a brow), then made valid"""
    n0 = tris(ob)
    bpy.context.view_layer.objects.active = ob
    seam = seam_verts(ob)
    g = ob.vertex_groups.new(name="_free")
    g.add([i for i in range(len(ob.data.vertices)) if i not in seam], 1.0, "REPLACE")
    for _ in range(4):
        n = tris(ob)
        if n <= faces * 1.1:
            break
        d = ob.modifiers.new("dec", "DECIMATE"); d.ratio = max(0.05, faces / n)
        d.vertex_group = "_free"; d.vertex_group_factor = 10.0
        bpy.ops.object.modifier_apply(modifier=d.name)
    ob.vertex_groups.remove(ob.vertex_groups["_free"])
    ob.data.validate(clean_customdata=False)
    log(f"body: {n0} -> {tris(ob)} triangles ({len(seam)} seam vertices held)")


def replace(arm, old, glb, log=print):
    arm.data.pose_position = "REST"
    bpy.context.view_layer.update()
    Q = world_points(old)                       # the old body as it stands at rest
    new, img = import_model(glb)
    P = np.array([tuple(v.co) for v in new.data.vertices])
    # same height, the feet on the same floor, the same middle (the feet's and the hips' x, y)
    s = np.ptp(Q[:, 2]) / np.ptp(P[:, 2])
    low_q = Q[Q[:, 2] < Q[:, 2].min() + 0.25 * np.ptp(Q[:, 2])]
    low_p = P[P[:, 2] < P[:, 2].min() + 0.25 * np.ptp(P[:, 2])]
    cq = np.r_[(low_q[:, :2].min(0) + low_q[:, :2].max(0)) / 2, Q[:, 2].min()]
    cp = np.r_[(low_p[:, :2].min(0) + low_p[:, :2].max(0)) / 2, P[:, 2].min()]
    M = Matrix.Translation(Vector(cq)) @ Matrix.Scale(s, 4) @ Matrix.Translation(Vector(-cp))
    new.data.transform(M); new.data.update()
    P = np.array([tuple(v.co) for v in new.data.vertices])
    log(f"body: scale {s:.4f}; height {np.ptp(P[:, 2]):.3f} (old {np.ptp(Q[:, 2]):.3f}); "
        f"width {np.ptp(P[:, 0]):.3f} (old {np.ptp(Q[:, 0]):.3f}); depth {np.ptp(P[:, 1]):.3f} (old {np.ptp(Q[:, 1]):.3f})")
    fill_forehead_hole(new, log, img)
    match_skin(new, img, log)
    # (not lightened: Blender's collapse smears this texture -- across its UV seams a pale patch over a
    # brow; with the seams held, the shirt's blue on a cheek. Kept whole: ~295k triangles.)
    new.data.validate(clean_customdata=False)

    # the old body's weights, from the nearest point of its surface
    new.vertex_groups.clear()
    for g in old.vertex_groups:
        new.vertex_groups.new(name=g.name)
    bpy.ops.object.select_all(action="DESELECT")
    new.select_set(True); old.select_set(True)
    bpy.context.view_layer.objects.active = old
    bpy.ops.object.data_transfer(use_reverse_transfer=False, data_type="VGROUP_WEIGHTS",
                                 vert_mapping="POLYINTERP_NEAREST", layers_select_src="ALL",
                                 layers_select_dst="NAME", mix_mode="REPLACE", use_object_transform=True)
    bpy.ops.object.select_all(action="DESELECT")
    new.select_set(True); bpy.context.view_layer.objects.active = new
    bpy.ops.object.mode_set(mode="WEIGHT_PAINT")
    bpy.ops.object.vertex_group_smooth(group_select_mode="ALL", factor=0.5, repeat=2)
    bpy.ops.object.vertex_group_limit_total(group_select_mode="ALL", limit=4)
    bpy.ops.object.vertex_group_normalize_all(group_select_mode="ALL", lock_active=False)
    bpy.ops.object.mode_set(mode="OBJECT")
    unweighted = sum(1 for v in new.data.vertices if not v.groups)
    log(f"body: weights from the old body; {unweighted} vertices without any")
    fix_neck(new, arm, log)
    import hands
    hands.shorten_palms(arm, log)
    hands.proportion_fingers(arm, log)
    hands.new_hands(new, arm, img, log)
    fix_unseen(new, arm, img, log)
    even_chest(new, arm, img, log)
    fit_face(new, img, log)
    pad_islands(new, img, log)

    # in its place
    name = old.name
    old_mats = [s_.material for s_ in old.material_slots if s_.material]
    bpy.data.objects.remove(old)
    for m in old_mats:
        if m.users == 0:
            bpy.data.materials.remove(m)
    new.name = name
    new.parent = arm
    new.matrix_parent_inverse = arm.matrix_world.inverted()
    mod = new.modifiers.new("arm", "ARMATURE"); mod.object = arm
    mat = new.material_slots[0].material
    mat.name = "Designer_Logic_PBR"
    bsdf = next(n for n in mat.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    for k in ("Metallic", "Roughness"):
        if bsdf.inputs[k].is_linked:
            mat.node_tree.links.remove(bsdf.inputs[k].links[0])
    bsdf.inputs["Metallic"].default_value = 0.0
    bsdf.inputs["Roughness"].default_value = 0.85
    for p in new.data.polygons:
        p.use_smooth = True
    return new, img
