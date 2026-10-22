"""Small props: cosmos flower (for GPU instancing), swing, fence post/rail, boardwalk plank,
and decimated Poly Haven boulders (CC0)."""
import math, random, sys, os
sys.path.insert(0, os.path.dirname(__file__))
from lib import *
from mathutils import Vector, Matrix
import bpy


def cosmos():
    """unit cosmos: stem 0..1 m (scaled per instance), head radius ~4 cm.
    COLOR_0 encodes the part: R=petal, G=centre, B=stem/leaf (AO not needed)."""
    reset()
    M = {"petal": material("petal", "petal.png", alpha=True), "centre": material("centre", color=(0.95, 0.7, 0.1, 1)),
         "stem": material("stem", color=(0.2, 0.4, 0.1, 1)), "leaf": material("leaf", "cosmos_leaf.png", alpha=True)}
    mb = MeshBuilder()
    rnd = random.Random(5)
    top = Vector((0, 0, 1.0))
    # 8 broad petals, cupped, each a 3x2 grid; UV v from base (0) to tip (1)
    for k in range(8):
        a = k / 8 * 2 * math.pi + rnd.uniform(-0.06, 0.06)
        d = Vector((math.cos(a), math.sin(a), 0))
        s = Vector((-d.y, d.x, 0))
        P = []
        for i in range(4):
            t = i / 3
            row = []
            for j in range(3):
                u = j / 2 - 0.5
                w = 0.022 * (0.45 + 0.55 * math.sin(math.pi * min(1, t * 0.8 + 0.2)))
                p = top + d * (0.006 + 0.036 * t) + s * u * w * 2 + Vector((0, 0, 0.008 * t * t - 0.004 * abs(u) * t))
                row.append(p)
            P.append(row)
        mb.quad_strip_grid("petal", P, lambda i, j: (j / 2, 1 - i / 3))
    # centre: domed disc
    prof = [(0.0095, 1.0015), (0.008, 1.006), (0.004, 1.009), (0.0, 1.0095)]
    P = [[top.copy() * 0 + Vector((r * math.cos(q / 12 * 6.283), r * math.sin(q / 12 * 6.283), z)) for q in range(13)] for r, z in prof]
    mb.quad_strip_grid("centre", P, lambda i, j: (j / 12, i / 3))
    # stem: thin 4-sided tube, slight curve
    log(mb, "stem", (0, 0, 0), (0, 0, 0.995), 0.0025, seg=4, rings=5, wobble=0, bend=0.03, caps=False)
    # feathery leaves: two small cards along the stem
    for z, yaw in ((0.35, 0.3), (0.6, 2.2)):
        card(mb, "leaf", (0, 0, z), 0.09, 0.14, yaw, tilt=0.9)
    objs = mb.build("cosmos", M)
    for ob in objs:
        me = ob.data
        attr = me.color_attributes.new("Color", "FLOAT_COLOR", "POINT")
        c = {"petal": (1, 0, 0, 1), "centre": (0, 1, 0, 1)}.get(ob.name.split("_")[-1], (0, 0, 1, 1))
        for i in range(len(me.vertices)):
            attr.data[i].color = c
    export("cosmos", objs)


def swing():
    reset()
    M = {"bark": material("bark", "bark.png"), "log": material("log", "wood_log.png"), "logend": material("logend", "wood_end.png"),
         "rope": material("rope", color=(0.5, 0.4, 0.28, 1)), "plank": material("plank", "wood_plank.png")}
    mb = MeshBuilder()
    rnd = random.Random(2)
    for sx in (-1, 1):
        log(mb, "log", (sx * 1.7, 0.0, -0.4), (sx * 1.62, 0.0, 3.5), 0.13, seg=10, taper=0.15, wobble=0.06, seed=rnd.random(), end_mat="logend")
        for sy in (-1, 1):  # A-frame braces
            log(mb, "log", (sx * 1.66, sy * 0.9, -0.2), (sx * 1.64, 0, 2.2), 0.07, seg=8, wobble=0.05, seed=rnd.random(), end_mat="logend")
    log(mb, "log", (-2.1, 0, 3.45), (2.1, 0, 3.45), 0.14, seg=10, wobble=0.05, seed=rnd.random(), end_mat="logend")
    for sx in (-1.62, 1.62):  # rope lashings at the joints
        for k in range(5):
            log(mb, "rope", (sx - 0.1 + k * 0.05, -0.16, 3.3), (sx - 0.1 + k * 0.05, 0.16, 3.6), 0.02, seg=4, wobble=0, caps=False)
    for sx in (-0.32, 0.32):
        log(mb, "rope", (sx, 0, 3.33), (sx, 0, 0.72), 0.018, seg=5, wobble=0.0, caps=False)
    plank(mb, "plank", (0, 0, 0.68), 0.85, 0.28, 0.06, seed=3)
    objs = mb.build("swing", M)
    bake_vertex_ao(objs, samples=24, dist=1.5)
    export("swing", objs)


def fence():
    """split-rail fence pieces: 'post' (1.35 m, base at 0) and 'rail' (3 m along X, centred)"""
    reset()
    M = {"log": material("log", "wood_plank_grey.png"), "logend": material("logend", "wood_end.png"), "rope": material("rope", color=(0.45, 0.36, 0.25, 1))}
    objs = []
    for name, build in (("post", lambda mb: log(mb, "log", (0, 0, -0.3), (0, 0, 1.35), 0.075, seg=7, wobble=0.1, taper=0.2, seed=1, end_mat="logend")),
                        ("rail", lambda mb: log(mb, "log", (-1.55, 0, 0), (1.55, 0, 0), 0.05, seg=6, wobble=0.12, bend=0.01, seed=2, end_mat="logend"))):
        mb = MeshBuilder()
        build(mb)
        for ob in mb.build(name, M):
            objs.append(ob)
    export("fence", objs)


def boardwalk():
    """'board' 1.5 m across X, 0.2 m wide (Y), 5 cm thick, top at z=0; 'stringer' 3 m along Y; 'bpost' 1 m"""
    reset()
    M = {"plank": material("plank", "wood_plank_grey.png"), "log": material("log", "wood_log.png")}
    objs = []
    mb = MeshBuilder(); plank(mb, "plank", (0, 0, -0.025), 1.5, 0.19, 0.05, seed=4, uv_len=1.5); objs += mb.build("board", M)
    mb = MeshBuilder(); box(mb, "plank", (0, 0, -0.12), (0.1, 3.0, 0.14), uv_scale=0.5); objs += mb.build("stringer", M)
    mb = MeshBuilder(); log(mb, "log", (0, 0, -0.6), (0, 0, 0.9), 0.06, seg=6, wobble=0.08, seed=5); objs += mb.build("bpost", M)
    export("boardwalk", objs)


def railing():
    """boardwalk railing pieces: 'rpost' (1.15 m log post with rope lashing), 'rope' (unit span
    along +X from 0 to 1 with a 6 cm catenary sag, scaled per span), 'lpost' (2.6 m lantern post
    with an arm and a hanging lantern; the lantern body uses the 'lamp' material)"""
    reset()
    M = {"log": material("log", "wood_log.png"), "logend": material("logend", "wood_end.png"),
         "rope": material("rope", color=(0.4, 0.31, 0.2, 1)), "iron": material("iron", color=(0.05, 0.045, 0.04, 1)),
         "lamp": material("lamp", color=(1.0, 0.7, 0.35, 1))}
    objs = []
    rnd = random.Random(9)
    mb = MeshBuilder()
    log(mb, "log", (0, 0, -0.35), (0, 0, 1.15), 0.075, seg=8, wobble=0.07, taper=0.1, seed=1, end_mat="logend")
    for k in range(3):  # a few turns of rope where the railing is tied on
        z = 0.95 + k * 0.026
        pts = [Vector((0.08 * math.cos(a), 0.08 * math.sin(a), z + a * 0.004)) for a in [q / 10 * 6.283 for q in range(11)]]
        for p0, p1 in zip(pts[:-1], pts[1:]):
            log(mb, "rope", p0, p1, 0.011, seg=4, wobble=0, caps=False)
    objs += mb.build("rpost", M)
    mb = MeshBuilder()
    pts = [Vector((t / 12, 0, -0.06 * 4 * (t / 12) * (1 - t / 12))) for t in range(13)]
    for p0, p1 in zip(pts[:-1], pts[1:]):
        log(mb, "rope", p0, p1, 0.016, seg=5, wobble=0, caps=False)
    objs += mb.build("rope", M)
    mb = MeshBuilder()
    log(mb, "log", (0, 0, -0.4), (0, 0, 2.6), 0.1, seg=10, wobble=0.06, taper=0.12, seed=3, end_mat="logend")
    log(mb, "log", (-0.05, 0, 2.42), (0.62, 0, 2.42), 0.055, seg=8, wobble=0.05, seed=4, end_mat="logend")  # arm
    log(mb, "log", (0, 0, 2.0), (0.42, 0, 2.38), 0.035, seg=6, wobble=0.05, seed=5, end_mat="logend")     # brace
    for k in range(5):  # rope lashing at the joint
        log(mb, "rope", (-0.12, -0.1, 2.34 + k * 0.035), (0.12, 0.1, 2.36 + k * 0.035), 0.012, seg=4, wobble=0, caps=False)
    c = Vector((0.55, 0, 2.02))
    log(mb, "iron", (0.55, 0, 2.38), (0.55, 0, 2.2), 0.008, seg=4, wobble=0, caps=False)
    box(mb, "lamp", c, (0.16, 0.16, 0.22))
    for sx in (-1, 1):
        for sy in (-1, 1):
            box(mb, "iron", c + Vector((sx * 0.085, sy * 0.085, 0)), (0.025, 0.025, 0.26))
    box(mb, "iron", c + Vector((0, 0, 0.135)), (0.22, 0.22, 0.04))
    box(mb, "iron", c + Vector((0, 0, -0.125)), (0.2, 0.2, 0.03))
    V = [c + Vector((x, y, 0.155)) for x, y in ((-0.11, -0.11), (0.11, -0.11), (0.11, 0.11), (-0.11, 0.11))] + [c + Vector((0, 0, 0.27))]
    mb.add("iron", V, [(0, 1, 4), (1, 2, 4), (2, 3, 4), (3, 0, 4)], [[(0, 0), (1, 0), (0.5, 1)]] * 4)
    objs += mb.build("lpost", M)
    bake_vertex_ao(objs, samples=24, dist=1.0)
    export("railing", objs)


def rocks():
    """Poly Haven boulders, decimated to ~1.5k tris, normalised to ~1 m size, base at z=0"""
    reset()
    names = ["boulder_01", "rock_moss_set_01", "rock_moss_set_02", "namaqualand_boulder_02", "namaqualand_boulder_05", "stone_01", "rock_07"]
    out = []
    for nm in names:
        path = os.path.join(PH, nm, f"{nm}_1k.gltf")
        before = set(bpy.data.objects)
        bpy.ops.import_scene.gltf(filepath=path)
        new = [o for o in bpy.data.objects if o not in before and o.type == "MESH"]
        for i, ob in enumerate(new):
            bpy.context.view_layer.objects.active = ob
            import bmesh
            bm = bmesh.new(); bm.from_mesh(ob.data)
            bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=0.0005)  # imported scans come split per face
            bm.to_mesh(ob.data); bm.free()
            for _ in range(4):  # collapse until under ~2k triangles
                tris = sum(len(p.vertices) - 2 for p in ob.data.polygons)
                if tris <= 2200:
                    break
                mod = ob.modifiers.new("dec", "DECIMATE")
                mod.ratio = max(0.02, min(1.0, 1800 / tris))
                mod.use_collapse_triangulate = True
                bpy.ops.object.modifier_apply(modifier="dec")
            # normalise: largest horizontal extent -> 1 m, base at 0, centred
            ob.data.transform(ob.matrix_world)
            ob.matrix_world = Matrix.Identity(4)
            xs = [v.co.x for v in ob.data.vertices]; ys = [v.co.y for v in ob.data.vertices]; zs = [v.co.z for v in ob.data.vertices]
            s = 1.0 / max(max(xs) - min(xs), max(ys) - min(ys), 1e-3)
            c = Vector(((max(xs) + min(xs)) / 2, (max(ys) + min(ys)) / 2, min(zs)))
            for v in ob.data.vertices:
                v.co = (v.co - c) * s
            ob.name = f"rock_{len(out)}"
            for m in ob.data.materials:
                m.name = "rock"
                for n in m.node_tree.nodes:
                    if n.type == "TEX_IMAGE" and n.image and "diff" not in n.image.name.lower():
                        m.node_tree.nodes.remove(n)  # keep only the colour map
            out.append(ob)
    for ob in list(bpy.data.objects):
        if ob not in out:
            bpy.data.objects.remove(ob)
    bake_vertex_ao(out, samples=24, dist=0.6, ground=True)
    export("rocks", out)


if __name__ == "__main__":
    which = sys.argv[-1]
    for name, fn in (("cosmos", cosmos), ("swing", swing), ("fence", fence), ("boardwalk", boardwalk), ("railing", railing), ("rocks", rocks)):
        if which in (name, "all"):
            fn()
