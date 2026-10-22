"""Dead wood and rocks for the forest floor (web/public/assets/deadwood.glb):

  log_a, log_b, log_c   fallen spruce trunks, 7-13 m, bark (moss grows on their upper side in the
                         web material, kind 'deadbark'), splintered broken ends, branch stubs
  log_root              a windthrown trunk with its root plate torn up (earth and roots)
  snag                  a broken-off standing trunk, 2-3 m, jagged top
  stump                 a real stump with root flare (Poly Haven tree_stump_01, CC0), decimated
  rock01..rock13        moss-covered rocks (Poly Haven rock_moss_set_01/02, CC0), decimated

Logs lie along +x with the base at x = 0, resting on z = 0 (the renderer tilts them onto the
slope). Run: tools/.bpy/bin/python tools/blender/deadwood.py
"""
import math, os, random, sys
sys.path.insert(0, os.path.dirname(__file__))
from lib import *
from mathutils import Vector, Matrix
import bpy, bmesh


def splinters(mb, mat, c, axis, r, rnd, n=9, depth=0.35):
    """a broken end: a ring of jagged splinters closing to the centre"""
    x = axis.normalized()
    up = Vector((0, 0, 1)) if abs(x.z) < 0.9 else Vector((1, 0, 0))
    y = up.cross(x).normalized()
    z = x.cross(y)
    ring = [c + (y * math.cos(a) + z * math.sin(a)) * r for a in [k / n * 2 * math.pi for k in range(n)]]
    tips = [c + x * rnd.uniform(0.05, depth) * r * 3 + (y * math.cos(a) + z * math.sin(a)) * r * rnd.uniform(0.2, 0.7)
            for a in [(k + 0.5) / n * 2 * math.pi for k in range(n)]]
    centre = c + x * r * 0.4
    V = ring + tips + [centre]
    faces, uvs = [], []
    for k in range(n):
        a, b, t = k, (k + 1) % n, n + k
        faces += [(a, b, t), (t, b, 2 * n), (a, t, 2 * n)]
        uvs += [[(0, 0), (1, 0), (0.5, 1)], [(0.5, 1), (1, 0), (0.5, 0.5)], [(0, 0), (0.5, 1), (0.5, 0.5)]]
    mb.add(mat, V, faces, uvs)


def fallen(mb, L, r, rnd, stubs=True, broken_top=True):
    """a trunk along +x resting on the ground: base at 0, slightly curved, tapering"""
    p0, p1 = Vector((0, 0, r * 0.85)), Vector((L, 0, r * 0.5))
    log(mb, "deadbark", p0, p1, r, seg=10, rings=max(4, int(L / 0.8)), taper=0.45, wobble=0.05, bend=0.015,
        uv_len=1.2, seed=rnd.randint(0, 999), caps=False)
    splinters(mb, "logend", p0, Vector((-1, 0, 0)), r * 0.98, rnd, depth=0.15)            # the base, torn or rotted off
    if broken_top:
        splinters(mb, "logend", p1, Vector((1, 0, -0.02)), r * (1 - 0.45) * 0.98, rnd, depth=0.5)
    if stubs:   # dead branch stubs, mostly along the upper half
        for k in range(rnd.randint(5, 9)):
            t = rnd.uniform(0.25, 0.95)
            c = p0.lerp(p1, t)
            rr = r * (1 - 0.45 * t)
            a = rnd.uniform(-0.2, math.pi + 0.2)
            d = Vector((rnd.uniform(-0.3, 0.3), math.cos(a), math.sin(a))).normalized()
            log(mb, "deadbark", c + d * rr * 0.7, c + d * (rr + rnd.uniform(0.15, 0.6)), 0.035, seg=4, rings=2, taper=0.6,
                wobble=0.0, caps=False, seed=k)


def root_plate(mb, r, rnd):
    """the torn-up root plate at the base of a windthrown tree: an earthy disc with roots"""
    R = r * 4.2
    c = Vector((-0.15, 0, R * 0.8))
    n = 14
    rim = []
    for k in range(n):
        a = k / n * 2 * math.pi
        rr = R * rnd.uniform(0.8, 1.1)
        rim.append(c + Vector((rnd.uniform(-0.1, 0.1), math.cos(a) * rr, math.sin(a) * rr * 0.85)))
    back = [p + Vector((-0.35, 0, 0)) for p in rim]
    V = rim + back + [c + Vector((0.1, 0, 0)), c + Vector((-0.45, 0, 0))]
    faces, uvs = [], []
    for k in range(n):
        a, b = k, (k + 1) % n
        faces += [(a, b, 2 * n), (n + b, n + a, 2 * n + 1), (a, n + a, n + b, b)]
        uvs += [[(0, 0), (1, 0), (0.5, 0.5)], [(1, 0), (0, 0), (0.5, 0.5)], [(0, 0), (0, 1), (1, 1), (1, 0)]]
    mb.add("earth", V, faces, uvs)
    for k in range(12):   # roots sticking out of the plate
        a = rnd.uniform(0, 2 * math.pi)
        s = c + Vector((0, math.cos(a), math.sin(a) * 0.85)) * R * rnd.uniform(0.3, 0.9)
        e = s + Vector((rnd.uniform(-0.6, 0.2), math.cos(a), math.sin(a))) * rnd.uniform(0.4, 1.1)
        log(mb, "deadbark", s, e, rnd.uniform(0.03, 0.07), seg=4, rings=3, taper=0.8, wobble=0.1, caps=False, seed=k)


def snag(mb, rnd):
    H, r = rnd.uniform(2.2, 3.0), 0.3
    log(mb, "deadbark", (0, 0, -0.3), (0, 0, H), r, seg=10, rings=5, taper=0.15, wobble=0.05, caps=False, seed=7)
    splinters(mb, "logend", Vector((0, 0, H)), Vector((0.1, 0, 1)), r * 0.85 * 0.98, rnd, n=10, depth=1.2)


def import_ph(name, target_faces, mat_name):
    """import a Poly Haven model, decimate each part, rename its material"""
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=os.path.join(PH, name, f"{name}_1k.gltf"))
    objs = [o for o in bpy.data.objects if o not in before and o.type == "MESH"]
    for o in objs:
        bpy.context.view_layer.objects.active = o
        ratio = min(1.0, target_faces / max(len(o.data.polygons), 1))
        m = o.modifiers.new("dec", "DECIMATE")
        m.ratio = ratio
        for s in o.material_slots:
            if s.material:
                s.material.name = mat_name
        # bottom at z = 0, centred in x/y
        o.data.transform(o.matrix_world)
        o.matrix_world = Matrix.Identity(4)
        bb = [Vector(c) for c in o.bound_box]
        lo = Vector((min(p.x for p in bb), min(p.y for p in bb), min(p.z for p in bb)))
        hi = Vector((max(p.x for p in bb), max(p.y for p in bb), max(p.z for p in bb)))
        o.data.transform(Matrix.Translation(Vector((-(lo.x + hi.x) / 2, -(lo.y + hi.y) / 2, -lo.z))))
    return objs


def build():
    reset()
    M = {"deadbark": material("deadbark", "bark.png"), "logend": material("logend", "wood_end.png"),
         "earth": material("earth", color=(0.16, 0.11, 0.07, 1))}
    objs = []
    rnd = random.Random(4)
    for name, L, r in (("log_a", 7.0, 0.24), ("log_b", 10.0, 0.3), ("log_c", 13.0, 0.36)):
        mb = MeshBuilder()
        fallen(mb, L, r, rnd)
        objs += mb.build(name, M)
    mb = MeshBuilder()
    fallen(mb, 11.0, 0.33, rnd, broken_top=True)
    root_plate(mb, 0.33, rnd)
    objs += mb.build("log_root", M)
    mb = MeshBuilder()
    snag(mb, rnd)
    objs += mb.build("snag", M)
    bake_vertex_ao(objs, samples=32, dist=2.0)
    st = import_ph("tree_stump_01", 1600, "deadbark")
    for o in st:
        o.name = "stump"
    rocks = import_ph("rock_moss_set_01", 700, "rock") + import_ph("rock_moss_set_02", 700, "rock")
    for i, o in enumerate(rocks):
        o.name = f"rock{i + 1:02d}"
    for o in objs + st + rocks:
        print(f"  {o.name}: {len(o.data.polygons)} faces (before decimation)")
    export("deadwood", objs + st + rocks)


if __name__ == "__main__":
    build()
