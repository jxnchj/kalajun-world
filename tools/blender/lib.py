"""Small bpy toolkit for the procedural stylised assets (Blender as a Python module).

Conventions: Blender Z-up, metres. Buildings face -Y (glTF/three +Z after export).
Every mesh gets a material by name; the web side swaps in its own toon material keyed on
that name, using the embedded base-colour texture and COLOR_0 (baked vertex AO).
"""
import math, os, random
import bpy, bmesh
from mathutils import Vector, Matrix
from mathutils.bvhtree import BVHTree

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
TEX = os.path.join(ROOT, "assets", "tex")
PH = os.path.join(ROOT, "assets", "src", "polyhaven")
OUT = os.path.join(ROOT, "web", "public", "assets")
os.makedirs(OUT, exist_ok=True)


def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    _mats.clear()


# ------------------------------------------------------------------ materials
_mats = {}
CARD_MATS = set()  # alpha-card materials (two-sided, AO uses world-up)
FIXED_WINDING = set()  # materials whose faces are wound by hand (inward-facing linings): normals not recalculated


def material(name, image=None, color=(0.8, 0.8, 0.8, 1), alpha=False):
    if name in _mats:
        return _mats[name]
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    bsdf = m.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = color
    bsdf.inputs["Roughness"].default_value = 0.9
    if image:
        path = image if os.path.isabs(image) else os.path.join(TEX, image)
        tex = m.node_tree.nodes.new("ShaderNodeTexImage")
        tex.image = bpy.data.images.load(path, check_existing=True)
        m.node_tree.links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
        if alpha:
            CARD_MATS.add(name)
            m.node_tree.links.new(tex.outputs["Alpha"], bsdf.inputs["Alpha"])
            m.blend_method = "CLIP" if hasattr(m, "blend_method") else None
            m.surface_render_method = "DITHERED" if hasattr(m, "surface_render_method") else None
    _mats[name] = m
    return m


# ------------------------------------------------------------------ mesh builder
class MeshBuilder:
    """Accumulates geometry per material; build() makes one object per material."""

    def __init__(self):
        self.parts = {}  # mat name -> (verts, faces, uvs)

    def _p(self, mat):
        return self.parts.setdefault(mat, ([], [], []))

    def add(self, mat, verts, faces, uvs):
        V, F, U = self._p(mat)
        o = len(V)
        V.extend(verts)
        for f, uv in zip(faces, uvs):
            F.append(tuple(i + o for i in f))
            U.append(uv)

    def quad_strip_grid(self, mat, P, uvfn):
        """P: rows x cols list of points; uvfn(i, j) -> (u, v)"""
        rows, cols = len(P), len(P[0])
        verts = [p for row in P for p in row]
        faces, uvs = [], []
        for i in range(rows - 1):
            for j in range(cols - 1):
                a, b, c, d = i * cols + j, i * cols + j + 1, (i + 1) * cols + j + 1, (i + 1) * cols + j
                faces.append((a, b, c, d))
                uvs.append([uvfn(i, j), uvfn(i, j + 1), uvfn(i + 1, j + 1), uvfn(i + 1, j)])
        self.add(mat, verts, faces, uvs)

    def build(self, name, mats):
        objs = []
        for mname, (V, F, U) in self.parts.items():
            if not F:
                continue
            me = bpy.data.meshes.new(f"{name}_{mname}")
            me.from_pydata([tuple(v) for v in V], [], F)
            uvl = me.uv_layers.new(name="UVMap")
            k = 0
            for poly, uv in zip(me.polygons, U):
                for li, t in zip(poly.loop_indices, uv):
                    uvl.data[li].uv = t
            me.materials.append(mats[mname])
            me.validate()
            if mats[mname].name not in CARD_MATS and mname not in FIXED_WINDING:  # closed parts: make normals point outward
                bm = bmesh.new()
                bm.from_mesh(me)
                bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
                bm.to_mesh(me)
                bm.free()
            ob = bpy.data.objects.new(f"{name}_{mname}", me)
            bpy.context.scene.collection.objects.link(ob)
            objs.append(ob)
        return objs


def frame(p0, p1, up=Vector((0, 0, 1))):
    """orthonormal frame with x along p0->p1"""
    x = (p1 - p0).normalized()
    if abs(x.dot(up)) > 0.95:
        up = Vector((0, 1, 0))
    y = up.cross(x).normalized()
    z = x.cross(y)
    return x, y, z


def log(mb, mat, p0, p1, r, seg=10, rings=None, wobble=0.04, uv_len=2.0, seed=None, taper=0.0, bend=0.0, caps=True, end_mat=None):
    """round log from p0 to p1 with irregular radius; UV: u along length (metres/uv_len), v around"""
    rnd = random.Random(seed)
    p0, p1 = Vector(p0), Vector(p1)
    L = (p1 - p0).length
    rings = rings or max(2, int(L / 0.6) + 1)
    x, y, z = frame(p0, p1)
    ph = [rnd.random() * 6.28 for _ in range(3)]
    P = []
    for i in range(rings):
        t = i / (rings - 1)
        c = p0 + (p1 - p0) * t + z * (math.sin(t * math.pi) * bend * L)
        rr = r * (1 - taper * t) * (1 + wobble * math.sin(t * 7 + ph[0]) + wobble * 0.5 * math.sin(t * 17 + ph[1]))
        row = []
        for j in range(seg + 1):
            a = j / seg * 2 * math.pi
            k = 1 + wobble * 0.6 * math.sin(a * 3 + ph[2] + t * 4)
            row.append(c + (y * math.cos(a) + z * math.sin(a)) * rr * k)
        P.append(row)
    mb.quad_strip_grid(mat, P, lambda i, j: (i / (rings - 1) * L / uv_len, j / seg))
    if caps:
        em = end_mat or mat
        for i, s in ((0, -1), (rings - 1, 1)):
            ring = P[i][:-1]
            c = sum(ring, Vector()) / len(ring) + x * s * r * 0.08
            verts = [c] + ring
            faces, uvs = [], []
            for j in range(seg):
                a0, a1 = j / seg * 2 * math.pi, (j + 1) / seg * 2 * math.pi
                f = (0, 1 + j, 1 + (j + 1) % seg) if s > 0 else (0, 1 + (j + 1) % seg, 1 + j)
                faces.append(f)
                uc = [(0.5, 0.5), (0.5 + 0.45 * math.cos(a0), 0.5 + 0.45 * math.sin(a0)), (0.5 + 0.45 * math.cos(a1), 0.5 + 0.45 * math.sin(a1))]
                uvs.append(uc if s > 0 else [uc[0], uc[2], uc[1]])
            mb.add(em, verts, faces, uvs)


def box(mb, mat, center, size, rot=Matrix.Identity(3), uv_scale=1.0, bevel=0.0):
    """axis box (optionally rotated) with per-face planar UVs in metres * uv_scale"""
    c = Vector(center)
    sx, sy, sz = (s / 2 for s in size)
    corners = [Vector((x, y, z)) for x in (-sx, sx) for y in (-sy, sy) for z in (-sz, sz)]
    V = [c + rot @ v for v in corners]
    # faces as (indices, axes for uv)
    F = [((0, 1, 3, 2), (1, 2)), ((4, 6, 7, 5), (1, 2)), ((0, 4, 5, 1), (0, 2)), ((2, 3, 7, 6), (0, 2)), ((0, 2, 6, 4), (0, 1)), ((1, 5, 7, 3), (0, 1))]
    faces, uvs = [], []
    for idx, (a, b) in F:
        faces.append(idx)
        uvs.append([((corners[i][a] + size[a] / 2) * uv_scale, (corners[i][b] + size[b] / 2) * uv_scale) for i in idx])
    mb.add(mat, V, faces, uvs)


def plank(mb, mat, center, length, width, thick, rot=Matrix.Identity(3), seed=0, uv_len=2.0):
    """board along local X with UV u along the grain; v selects one plank row of the texture"""
    rnd = random.Random(seed)
    row = rnd.randrange(4)
    c = Vector(center)
    sx, sy, sz = length / 2, width / 2, thick / 2
    corners = [Vector((x, y, z)) for x in (-sx, sx) for y in (-sy, sy) for z in (-sz, sz)]
    V = [c + rot @ v for v in corners]
    F = [(0, 1, 3, 2), (4, 6, 7, 5), (0, 4, 5, 1), (2, 3, 7, 6), (0, 2, 6, 4), (1, 5, 7, 3)]
    u0 = rnd.random()
    faces, uvs = [], []
    for f in F:
        faces.append(f)
        uvs.append([(u0 + (corners[i].x + sx) / uv_len, (row + 0.1 + 0.8 * (corners[i].y + sy) / (2 * sy)) / 4) for i in f])
    mb.add(mat, V, faces, uvs)


def rotz(a):
    return Matrix.Rotation(a, 3, "Z")


def card(mb, mat, base, width, height, yaw, tilt=0.0, uv=(0, 0, 1, 1)):
    """vertical alpha card standing at base (bottom centre)"""
    b = Vector(base)
    d = Vector((math.cos(yaw), math.sin(yaw), 0)) * (width / 2)
    up = Vector((math.sin(tilt) * math.sin(yaw + math.pi / 2), -math.sin(tilt) * math.cos(yaw + math.pi / 2), math.cos(tilt))) * height
    V = [b - d, b + d, b + d + up, b - d + up]
    u0, v0, u1, v1 = uv
    mb.add(mat, V, [(0, 1, 2, 3)], [[(u0, v1), (u1, v1), (u1, v0), (u0, v0)]])


def rock(mb, mat, center, radius, seed, squash=0.6, subdiv=2):
    """faceted low-poly stone (for chimneys and foundations)"""
    rnd = random.Random(seed)
    bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=subdiv, radius=1.0)
    ph = [rnd.random() * 10 for _ in range(3)]
    for v in bm.verts:
        n = v.co.normalized()
        k = 1 + 0.18 * math.sin(n.x * 3 + ph[0]) * math.sin(n.y * 3 + ph[1]) + 0.1 * math.sin(n.z * 5 + ph[2])
        v.co = Vector((n.x * k, n.y * k, n.z * k * squash)) * radius
    V = [Vector(center) + v.co for v in bm.verts]
    faces, uvs = [], []
    for f in bm.faces:
        idx = [v.index for v in f.verts]
        faces.append(tuple(idx))
        uvs.append([((V[i].x + V[i].y) * 0.5, V[i].z * 0.5 + 0.3 * rnd.random()) for i in idx])
    bm.free()
    mb.add(mat, V, faces, uvs)


# ------------------------------------------------------------------ AO bake + export
def bake_vertex_ao(objs, samples=48, dist=3.0, strength=1.0, ground=True, sky=False, sky_minz=0.05):
    """hemisphere ray-cast AO into a colour attribute 'Color' (linear grey). sky=True: the blue
    channel instead holds how much open sky the vertex sees (rays out of its hemisphere that rise
    and meet nothing within 40 m) -- inside a house only what comes in at the windows and the door
    (web/src/assets.js uIndoor darkens interiors by it)."""
    dg = bpy.context.evaluated_depsgraph_get()
    verts, polys = [], []
    for ob in objs:
        me = ob.data
        o = len(verts)
        verts += [ob.matrix_world @ v.co for v in me.vertices]
        polys += [tuple(o + i for i in p.vertices) for p in me.polygons]
    ground_face = -1
    if ground:  # large ground quad at z=0 so bottoms get darker
        o = len(verts)
        verts += [Vector((-500, -500, -0.02)), Vector((500, -500, -0.02)), Vector((500, 500, -0.02)), Vector((-500, 500, -0.02))]
        polys.append((o, o + 1, o + 2, o + 3))
        ground_face = len(polys) - 1
    bvh = BVHTree.FromPolygons(verts, polys, epsilon=0.0)
    rnd = random.Random(3)
    dirs = []
    while len(dirs) < samples:
        v = Vector((rnd.uniform(-1, 1), rnd.uniform(-1, 1), rnd.uniform(-1, 1)))
        if 0.05 < v.length <= 1:
            dirs.append(v.normalized())
    sky_dirs = []
    while sky and len(sky_dirs) < 64:
        v = Vector((rnd.uniform(-1, 1), rnd.uniform(-1, 1), rnd.uniform(-1, 1)))
        if 0.05 < v.length <= 1:
            sky_dirs.append(v.normalized())
    for ob in objs:
        me = ob.data
        me.calc_loop_triangles() if hasattr(me, "calc_loop_triangles") else None
        attr = me.color_attributes.get("Color") or me.color_attributes.new("Color", "FLOAT_COLOR", "POINT")
        card = any(m and m.name in CARD_MATS for m in me.materials)
        nrm = [Vector((0, 0, 1)) if card else ob.matrix_world.to_3x3() @ v.normal for v in me.vertices]
        for i, v in enumerate(me.vertices):
            p = ob.matrix_world @ v.co
            n = nrm[i].normalized()
            occ = 0.0
            cnt = 0
            for d in dirs:
                if d.dot(n) <= 0:
                    d = -d
                hit = bvh.ray_cast(p + n * 0.02, d, dist)
                cnt += 1
                if hit[0] is not None:
                    occ += (1 - hit[3] / dist) ** 1.5
            ao = 1 - strength * occ / max(cnt, 1)
            ao = max(0.3, min(1.0, ao * 1.08))
            sv = ao
            if sky:
                up = esc = 0
                for d in sky_dirs:
                    if d.dot(n) <= 0:
                        d = -d
                    if d.z < sky_minz:   # (sky_minz below 0: the light off the sunlit ground outside counts too)
                        continue
                    up += 1
                    hit = bvh.ray_cast(p + n * 0.02, d, 40.0)
                    if hit[0] is None or (sky_minz < 0 and hit[2] == ground_face):   # (open sky, or the lit ground outside)
                        esc += 1
                sv = esc / max(up, 1) if up else 0.0
            attr.data[i].color = (ao, ao, sv, 1)


def export(name, objs=None):
    bpy.ops.object.select_all(action="DESELECT")
    for ob in objs or bpy.context.scene.objects:
        ob.select_set(True)
    path = os.path.join(OUT, f"{name}.glb")
    bpy.ops.export_scene.gltf(filepath=path, export_format="GLB", use_selection=True, export_vertex_color="ACTIVE",
                              export_all_vertex_colors=False, export_yup=True, export_apply=True,
                              export_image_format="AUTO", export_animations=False)
    print("exported", path, os.path.getsize(path) // 1024, "KB")
    return path
