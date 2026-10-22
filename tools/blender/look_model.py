"""A model looked at: rendered from several sides, lit plainly (its base colour on a diffuse surface, a sun and a
sky), in one row next to a reference picture -- for checking a generated model (Aholo's) against the pictures it
was made from. Prints its triangle count, size and loose pieces.

Run: tools/.bpy/bin/python -I tools/blender/look_model.py <model.glb> <reference.png|-> <out.jpg> [views] [size]
  views: comma-separated from right,left,front,back,top,bottom,34 (front-left from above), 34b (back-right)
         default right,left,front,back,34,top
  size:  pixels a tile (default 420)
The model is read with Blender's glTF importer (no scripts of its own are run).
"""
import sys, math
import numpy as np
import bpy, bmesh
from mathutils import Vector

args = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else sys.argv[-5:]
# (positional: the last 3-5 arguments)
tail = [a for a in sys.argv[1:] if not a.endswith(".py")]
glb, ref, out = tail[0], tail[1], tail[2]
views = (tail[3] if len(tail) > 3 else "right,left,front,back,34,top").split(",")
R = int(tail[4]) if len(tail) > 4 else 420

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=glb)
obs = [o for o in bpy.data.objects if o.type == "MESH"]
for ob in obs:
    for s in ob.material_slots:
        m = s.material
        if not m or not m.use_nodes:
            continue
        nt = m.node_tree
        b = next((n for n in nt.nodes if n.type == "BSDF_PRINCIPLED"), None)
        tex = b.inputs["Base Color"].links[0].from_node if b and b.inputs["Base Color"].is_linked else None
        d = nt.nodes.new("ShaderNodeBsdfDiffuse")
        if tex:
            nt.links.new(tex.outputs[0], d.inputs["Color"])
        elif b:
            d.inputs["Color"].default_value = b.inputs["Base Color"].default_value
        nt.links.new(d.outputs[0], next(n for n in nt.nodes if n.type == "OUTPUT_MATERIAL").inputs["Surface"])
dg = bpy.context.evaluated_depsgraph_get()
P = np.concatenate([np.array([tuple(o.matrix_world @ v.co) for v in o.evaluated_get(dg).data.vertices]) for o in obs])
tris = sum(sum(len(p.vertices) - 2 for p in o.data.polygons) for o in obs)
lo, hi = P.min(0), P.max(0)
c = Vector(((lo + hi) / 2).tolist())
ext = hi - lo
bm = bmesh.new()
for o in obs:
    bm.from_mesh(o.data)
bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=float(ext.max()) * 1e-5)
bm.verts.ensure_lookup_table()
seen, comps = set(), []
for v in bm.verts:
    if v.index in seen:
        continue
    st, n = [v], 0
    seen.add(v.index)
    while st:
        x = st.pop(); n += 1
        for e in x.link_edges:
            y = e.other_vert(x)
            if y.index not in seen:
                seen.add(y.index); st.append(y)
    comps.append(n)
comps.sort(reverse=True)
print(f"tris {tris}  extent x {ext[0]:.3f} y {ext[1]:.3f} z {ext[2]:.3f}  pieces {len(comps)} "
      f"(largest {comps[:3]}, tiny <50 vertices: {sum(1 for x in comps if x < 50)})")

sc = bpy.context.scene
sc.render.engine = "CYCLES"; sc.cycles.samples = 24; sc.cycles.device = "CPU"
sc.view_settings.view_transform = "Standard"
sc.render.resolution_x = sc.render.resolution_y = R
sc.world = bpy.data.worlds.new("w"); sc.world.use_nodes = True
bg = sc.world.node_tree.nodes["Background"]
bg.inputs["Color"].default_value = (0.75, 0.8, 0.85, 1); bg.inputs["Strength"].default_value = 0.8
sun = bpy.data.objects.new("sun", bpy.data.lights.new("sun", "SUN")); sun.data.energy = 3.0
sun.rotation_euler = (math.radians(45), 0, math.radians(35)); sc.collection.objects.link(sun)
cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam")); cam.data.type = "ORTHO"
cam.data.ortho_scale = float(ext.max()) * 1.15
sc.collection.objects.link(cam); sc.camera = cam
DIRS = {"right": (1, 0, 0), "left": (-1, 0, 0), "front": (0, -1, 0), "back": (0, 1, 0), "top": (0, 0, 1),
        "bottom": (0, 0, -1), "34": (0.7, -0.7, 0.45), "34b": (-0.7, 0.7, 0.45)}
tiles = []
if ref != "-":
    im = bpy.data.images.load(ref)
    W_, H_ = im.size
    a = np.array(im.pixels[:], np.float32).reshape(H_, W_, 4)
    s = min(R / W_, R / H_)
    yi = np.clip((np.arange(R) - (R - H_ * s) / 2) / s, 0, H_ - 1).astype(int)
    xi = np.clip((np.arange(R) - (R - W_ * s) / 2) / s, 0, W_ - 1).astype(int)
    tiles.append(a[yi][:, xi])
for k in views:
    d = Vector(DIRS[k]).normalized()
    cam.location = c + d * float(ext.max()) * 3
    cam.rotation_euler = (-d).to_track_quat("-Z", "Y").to_euler()
    sc.render.filepath = out + f".{len(tiles)}.png"
    bpy.ops.render.render(write_still=True)
    r = bpy.data.images.load(sc.render.filepath)
    tiles.append(np.array(r.pixels[:], np.float32).reshape(R, R, 4))
row = np.concatenate(tiles, 1)
o = bpy.data.images.new("g", row.shape[1], row.shape[0]); o.pixels = row.ravel()
o.filepath_raw = out; o.file_format = "JPEG"; o.save()
print("saved", out)
