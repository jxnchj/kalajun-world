"""Method 2 sample: a high-fidelity cosmos plant modelled in Blender.

* petals: 14 x 8 curved grids per petal, obovate outline with three notched teeth, cupped
  along the length, troughed across, wavy edge and a slight twist; UVs 0..1 over the petal
* petal texture: procedural Cycles material (longitudinal veins, darker eye zone at the base,
  mottling, paler rim) baked to web/public/assets/cosmos_petal_hifi.png (greyscale, tinted in
  the engine per flower colour)
* disc: domed receptacle carrying ~110 tubular florets in a Fibonacci spiral
* bracts: two rings of green involucral bracts under each head
* stems: tapered tubes along curves; leaves: bipinnate, thread-like segments (real geometry)
Plant height 1 (scaled per instance). Exported as cosmos_hifi.glb with per-material parts
and baked vertex AO in COLOR_0.
"""
import math, random, sys, os
sys.path.insert(0, os.path.dirname(__file__))
from lib import *
from mathutils import Vector, Matrix, Quaternion
import bpy

rnd = random.Random(21)


def bezier(a, c, b, t):
    return a * (1 - t) ** 2 + c * (2 * t * (1 - t)) + b * (t * t)


def tube(mb, mat, pts, r0, r1, sides=7, uvlen=1.0):
    """tapered tube along a polyline"""
    P = []
    n = len(pts)
    for i, p in enumerate(pts):
        d = (pts[min(i + 1, n - 1)] - pts[max(i - 1, 0)]).normalized()
        a = Vector((0, 0, 1)) if abs(d.z) < 0.9 else Vector((1, 0, 0))
        x = d.cross(a).normalized(); y = d.cross(x)
        r = r0 + (r1 - r0) * i / (n - 1)
        P.append([p + (x * math.cos(j / sides * 6.2832) + y * math.sin(j / sides * 6.2832)) * r for j in range(sides + 1)])
    mb.quad_strip_grid(mat, P, lambda i, j: (j / sides, i / (n - 1) * uvlen))


def ribbon(mb, mat, pts, w0, w1, up=Vector((0, 0, 1))):
    """flat tapered ribbon along a polyline (thread-like leaf segment), double-sided in the shader"""
    P = []
    n = len(pts)
    for i, p in enumerate(pts):
        d = (pts[min(i + 1, n - 1)] - pts[max(i - 1, 0)]).normalized()
        s = d.cross(up)
        if s.length < 1e-4:
            s = d.cross(Vector((1, 0, 0)))
        s.normalize()
        w = w0 + (w1 - w0) * i / (n - 1)
        P.append([p - s * w, p + s * w])
    mb.quad_strip_grid(mat, P, lambda i, j: (j, i / (n - 1)))


# ---------------------------------------------------------------- petal
PU, PV = 14, 8  # rows along, columns across


def petal_shape(t):
    return (0.22 + 0.78 * math.sin(min(1, t * 1.15) * math.pi * 0.55)) * (1 - 0.05 * t)


def petal_points(L, W, cup, trough, wave, twist, seed, notch=True):
    r = random.Random(seed)
    ph = r.random() * 6
    rows = []
    for i in range(PU + 1):
        t = i / PU
        row = []
        for j in range(PV + 1):
            s = j / PV * 2 - 1
            w = W * petal_shape(t)
            x = t * L
            if i == PU and notch:  # notched tip: three shallow teeth
                x -= L * 0.035 * abs(math.sin((s + 1) * math.pi * 1.5))
            y = s * w
            z = cup * L * t * t + trough * L * s * s * t + wave * L * math.sin(t * 9 + ph) * s * s * t
            # twist about the long axis
            a = twist * t
            y, z = y * math.cos(a) - z * math.sin(a), y * math.sin(a) + z * math.cos(a)
            row.append(Vector((x, y, z)))
        rows.append(row)
    return rows


HEAD_UV = False  # True: petals sample the painted flower heads (AI atlas) instead of a petal strip
R_UV, RHO0 = 0.489, 0.18  # painted head radius in slot UVs; inner end of the petals (fraction of R)


def add_petal(mb, M, rows, k=0, L=1.0, W=1.0):
    if not HEAD_UV:
        mb.quad_strip_grid("petal", [[M @ p for p in row] for row in rows], lambda i, j: (j / PV, i / PU))
        return
    # map petal k onto the k-th painted petal (petals of all four paintings point at k*45 deg)
    th = k / 8 * 2 * math.pi
    d = (math.cos(th), math.sin(th)); pp = (-math.sin(th), math.cos(th))

    def uv(i, j):
        t = i / PU
        s = (j / PV * 2 - 1) * W * petal_shape(t)
        rho = RHO0 + (1 - RHO0) * t
        lat = s / L * (1 - RHO0)
        x = 0.5 + R_UV * (rho * d[0] + lat * pp[0])
        y = 0.5 + R_UV * (rho * d[1] + lat * pp[1])
        return (x, 1 - y)  # glTF flips V: this stores image coordinates (y down)
    mb.quad_strip_grid("petal", [[M @ p for p in row] for row in rows], uv)


def head(mb, centre, normal, L, seed):
    """cosmos head: 8 ray petals + disc florets + bracts, facing `normal`"""
    r = random.Random(seed)
    n = normal.normalized()
    q = n.to_track_quat("Z", "Y")
    R = q.to_matrix().to_4x4()
    T = Matrix.Translation(centre)
    spin = r.random() * 6.28
    for k in range(8):
        a = spin + k / 8 * 2 * math.pi + r.uniform(-0.08, 0.08)
        Lk, Wk = L * r.uniform(0.92, 1.06), L * (0.44 if HEAD_UV else 0.36)
        rows = petal_points(Lk, Wk, cup=r.uniform(0.12, 0.22), trough=r.uniform(0.03, 0.07),
                            wave=r.uniform(0.01, 0.03), twist=r.uniform(-0.25, 0.25), seed=seed * 10 + k, notch=not HEAD_UV)
        M = T @ R @ Matrix.Rotation(a, 4, "Z") @ Matrix.Translation(Vector((L * 0.16, 0, 0.004 * (k % 2)))) @ Matrix.Rotation(-0.1, 4, "Y")
        add_petal(mb, M, rows, k, Lk, Wk)
    # receptacle dome
    dr = L * 0.24
    prof = [(dr * (1 - i / 5) ** 0.8, dr * 0.35 * math.sin(i / 5 * math.pi / 2)) for i in range(6)]
    P = []
    for rr, zz in prof:
        P.append([T @ R @ Vector((rr * math.cos(j / 16 * 6.283), rr * math.sin(j / 16 * 6.283), zz)) for j in range(17)])
    mb.quad_strip_grid("receptacle", P, lambda i, j: (j / 16, i / 5))
    # tubular florets (Fibonacci), outer ring orange, centre yellow-green buds
    nfl = 110
    for i in range(nfl):
        rho = dr * 0.95 * math.sqrt((i + 0.5) / nfl)
        th = i * 2.39996
        base = Vector((rho * math.cos(th), rho * math.sin(th), dr * 0.35 * math.cos(rho / dr * math.pi / 2)))
        h = L * (0.07 if rho > dr * 0.55 else 0.045)
        tip = base + Vector((base.x * 0.3, base.y * 0.3, h))
        mat = "floret_out" if rho > dr * 0.55 else "floret_in"
        pts = [T @ R @ (base + (tip - base) * t) for t in (0, 0.6, 1.0)]
        tube(mb, mat, pts, L * 0.013, L * 0.017 if rho > dr * 0.55 else L * 0.011, sides=5)
    # bracts: outer (spreading, pointed) + inner (broad, pressed to petals)
    for ring, (nb, ln, wd, tilt) in enumerate([(8, 0.32, 0.07, -0.9), (8, 0.25, 0.1, -0.35)]):
        for k in range(nb):
            a = spin + (k + 0.5 * ring) / nb * 6.283
            pts = [T @ R @ Matrix.Rotation(a, 4, "Z") @ Vector((L * 0.12 + L * ln * t * math.cos(tilt), 0, -L * 0.02 + L * ln * t * math.sin(tilt))) for t in (0, 0.5, 1)]
            ribbon(mb, "bract", pts, L * wd, L * 0.005, up=(R @ Matrix.Rotation(a, 4, "Z")).to_3x3() @ Vector((0, 0, 1)))


def leaf(mb, base, direction, length, seed):
    """bipinnate cosmos leaf: rachis with 5 pairs of primary lobes, each split into 3 threads"""
    r = random.Random(seed)
    d = direction.normalized()
    up = Vector((0, 0, 1))
    side = d.cross(up).normalized()
    arch = lambda t: base + d * length * t + up * (length * 0.25 * math.sin(t * math.pi) - length * 0.15 * t * t)
    ribbon(mb, "leaf", [arch(t) for t in (0, 0.25, 0.5, 0.75, 1.0)], 0.005, 0.0025)
    for k in range(5):
        t = 0.18 + 0.16 * k
        p0 = arch(t)
        for sg in (-1, 1):
            ll = length * (0.42 - 0.06 * k) * r.uniform(0.85, 1.1)
            dirk = (side * sg + d * 0.55).normalized()
            prim = [p0 + dirk * ll * u + up * (ll * 0.15 * math.sin(u * 3) - ll * 0.25 * u * u) for u in (0, 0.33, 0.66, 1.0)]
            ribbon(mb, "leaf", prim, 0.0045, 0.002)
            for m in range(3):  # thread-like secondary segments
                u = 0.35 + 0.3 * m
                pm = prim[0] + (prim[-1] - prim[0]) * u
                dm = (dirk + side * sg * 0.3 * (m - 1) + d * 0.2).normalized()
                ls = ll * 0.45
                ribbon(mb, "leaf", [pm + dm * ls * v + up * (-ls * 0.3 * v * v) for v in (0, 0.5, 1.0)], 0.0035, 0.0012)


def build_plant():
    reset()
    M = {
        "petal": material("petal", os.path.join(OUT, "cosmos_petal_hifi.png")),
        "receptacle": material("receptacle", color=(0.55, 0.42, 0.05, 1)),
        "floret_out": material("floret_out", color=(0.95, 0.62, 0.08, 1)),
        "floret_in": material("floret_in", color=(0.75, 0.7, 0.12, 1)),
        "bract": material("bract", color=(0.22, 0.42, 0.12, 1)),
        "stem": material("stem", color=(0.2, 0.4, 0.12, 1)),
        "leaf": material("leaf", color=(0.24, 0.5, 0.14, 1)),
        "bud": material("bud", color=(0.8, 0.35, 0.5, 1)),
    }
    mb = MeshBuilder()
    L = 0.066  # petal length (stylised ~1.7x life size, matching the mid-range flowers)
    heads = [
        (Vector((0.0, 0.0, 1.0)), Vector((0.02, 0.01, 0.55)), Vector((0.25, 0.15, 1)), 1.0),
        (Vector((0.17, 0.08, 0.86)), Vector((0.07, 0.03, 0.6)), Vector((0.7, 0.3, 1)), 0.9),
        (Vector((-0.13, -0.11, 0.76)), Vector((-0.05, -0.04, 0.5)), Vector((-0.6, -0.5, 1)), 0.82),
    ]
    for i, (p, c, n, s) in enumerate(heads):
        start = Vector((0, 0, 0)) if i == 0 else Vector((0, 0, 0.35 + i * 0.04))
        tube(mb, "stem", [bezier(start, c, p, t / 10) for t in range(11)], 0.0045 if i == 0 else 0.003, 0.0022, sides=6)
        head(mb, p + n.normalized() * 0.004, n, L * s, seed=i + 3)
    # a bud on a side shoot
    bp = Vector((0.06, -0.15, 0.62))
    tube(mb, "stem", [bezier(Vector((0, 0, 0.45)), Vector((0.02, -0.06, 0.52)), bp, t / 6) for t in range(7)], 0.0025, 0.0018, sides=5)
    for k in range(6):
        a = k / 6 * 6.283
        pts = [bp + Vector((0.004 * math.cos(a), 0.004 * math.sin(a), 0)) * (1 - t * 0.7) + Vector((0, 0, 0.022 * t)) + Vector((0.006 * math.cos(a), 0.006 * math.sin(a), 0)) * math.sin(t * math.pi) for t in (0, 0.5, 1)]
        ribbon(mb, "bud", pts, 0.004, 0.0015, up=Vector((math.cos(a), math.sin(a), 0)))
    # leaves along the stems
    for k, (z, a, ln) in enumerate([(0.08, 0.3, 0.22), (0.12, 2.4, 0.2), (0.16, 4.3, 0.21), (0.3, 1.2, 0.17), (0.34, 3.6, 0.17), (0.5, 5.0, 0.13), (0.62, 2.0, 0.1)]):
        leaf(mb, Vector((0, 0, z)), Vector((math.cos(a), math.sin(a), 0.35)), ln, seed=k)
    objs = mb.build("cosmos_hifi", M)
    bake_vertex_ao(objs, samples=24, dist=0.08, ground=True)
    return objs


def bake_petal_texture(path, w=256, h=512):
    """render the procedural petal material flat into the petal UV space"""
    reset()
    sc = bpy.context.scene
    sc.render.engine = "CYCLES"
    sc.cycles.samples = 16
    sc.cycles.device = "CPU"
    mb = MeshBuilder()
    rows = [[Vector((j / PV, i / PU, 0)) for j in range(PV + 1)] for i in range(PU + 1)]
    m = bpy.data.materials.new("petal_proc")
    m.use_nodes = True
    nt = m.node_tree
    bsdf = nt.nodes["Principled BSDF"]
    uvn = nt.nodes.new("ShaderNodeTexCoord")
    sep = nt.nodes.new("ShaderNodeSeparateXYZ")
    nt.links.new(uvn.outputs["UV"], sep.inputs[0])
    # longitudinal veins: waves across u, slightly distorted, converging toward the base
    wave = nt.nodes.new("ShaderNodeTexWave")
    wave.wave_type = "BANDS"; wave.bands_direction = "X"
    wave.inputs["Scale"].default_value = 11.0
    wave.inputs["Distortion"].default_value = 1.2
    wave.inputs["Detail"].default_value = 2.0
    wave.inputs["Detail Scale"].default_value = 1.5
    mapn = nt.nodes.new("ShaderNodeMapping")
    nt.links.new(uvn.outputs["UV"], mapn.inputs["Vector"])
    nt.links.new(mapn.outputs["Vector"], wave.inputs["Vector"])
    veinramp = nt.nodes.new("ShaderNodeValToRGB")
    veinramp.color_ramp.elements[0].position = 0.0; veinramp.color_ramp.elements[0].color = (0.78, 0.78, 0.78, 1)
    veinramp.color_ramp.elements[1].position = 0.18; veinramp.color_ramp.elements[1].color = (1, 1, 1, 1)
    nt.links.new(wave.outputs["Fac"], veinramp.inputs["Fac"])
    # eye zone darker toward the base, rim a little paler toward the tip
    eye = nt.nodes.new("ShaderNodeValToRGB")
    eye.color_ramp.elements[0].position = 0.0; eye.color_ramp.elements[0].color = (0.5, 0.5, 0.5, 1)
    eye.color_ramp.elements[1].position = 0.3; eye.color_ramp.elements[1].color = (0.95, 0.95, 0.95, 1)
    e3 = eye.color_ramp.elements.new(0.92); e3.color = (1, 1, 1, 1)
    nt.links.new(sep.outputs["Y"], eye.inputs["Fac"])
    noise = nt.nodes.new("ShaderNodeTexNoise")
    noise.inputs["Scale"].default_value = 9.0
    noise.inputs["Detail"].default_value = 4.0
    nramp = nt.nodes.new("ShaderNodeValToRGB")
    nramp.color_ramp.elements[0].position = 0.3; nramp.color_ramp.elements[0].color = (0.9, 0.9, 0.9, 1)
    nramp.color_ramp.elements[1].position = 0.7; nramp.color_ramp.elements[1].color = (1, 1, 1, 1)
    nt.links.new(noise.outputs["Fac"], nramp.inputs["Fac"])
    mul1 = nt.nodes.new("ShaderNodeMix"); mul1.data_type = "RGBA"; mul1.blend_type = "MULTIPLY"; mul1.inputs["Factor"].default_value = 1.0
    nt.links.new(veinramp.outputs["Color"], mul1.inputs["A"]); nt.links.new(eye.outputs["Color"], mul1.inputs["B"])
    mul2 = nt.nodes.new("ShaderNodeMix"); mul2.data_type = "RGBA"; mul2.blend_type = "MULTIPLY"; mul2.inputs["Factor"].default_value = 1.0
    nt.links.new(mul1.outputs["Result"], mul2.inputs["A"]); nt.links.new(nramp.outputs["Color"], mul2.inputs["B"])
    nt.links.new(mul2.outputs["Result"], bsdf.inputs["Base Color"])
    img = bpy.data.images.new("petalbake", w, h, alpha=False)
    tex = nt.nodes.new("ShaderNodeTexImage"); tex.image = img; nt.nodes.active = tex
    mb.quad_strip_grid("p", rows, lambda i, j: (j / PV, i / PU))
    ob = mb.build("petalplane", {"p": m})[0]
    bpy.context.view_layer.objects.active = ob
    ob.select_set(True)
    bpy.ops.object.bake(type="DIFFUSE", pass_filter={"COLOR"}, margin=8)
    img.filepath_raw = path; img.file_format = "PNG"; img.save()
    print("baked", path)


if __name__ == "__main__":
    if sys.argv[-1] == "hybrid":
        HEAD_UV = True
        objs = build_plant()
        export("cosmos_hybrid", objs)
    else:
        tex = os.path.join(OUT, "cosmos_petal_hifi.png")
        bake_petal_texture(tex)
        objs = build_plant()
        print("faces", sum(len(o.data.polygons) for o in objs))
        export("cosmos_hifi", objs)
