"""Rig the user's character (assets/src/character/scene.glb, a static AI-generated mesh) for the
third-person walker: web/public/assets/character.glb.

  1. stand it on z = 0, decimate (~99k -> ~40k triangles), texture as JPEG
  2. find the body landmarks from the mesh itself: the crotch (where the legs part), the armpits
     (where the arms part from the torso), fingertips, neck (narrowest point under the head),
     ankles, toes -- by slicing the vertex cloud
  3. build a humanoid skeleton: hips, spine, chest, neck, head; clavicle, upper arm, forearm,
     hand; upper leg, lower leg, foot, toe
  4. skin weights by region, not by bone heat (heat weighting fails on AI meshes, and the arms
     hang close to the body): arm vertices only take arm bones, leg vertices only their own
     leg's bones, the rest the trunk; inside a region each vertex blends its two or three
     nearest bones by inverse distance, so the joints bend smoothly
  5. export with the skeleton in its rest pose (no animation: web/src/character.js poses the
     bones procedurally from the walking speed)

Blender frame: the model faces -Y (three +Z), its right side is -X. Run:
tools/.bpy/bin/python tools/blender/rig_character.py
"""
import math, os, sys
import bpy, bmesh
import numpy as np
from mathutils import Vector, Matrix

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
SRC = os.path.join(ROOT, "assets", "src", "character", "scene.glb")
OUT = os.path.join(ROOT, "web", "public", "assets", "character.glb")
TARGET_TRIS = 40000

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=SRC)
ob = [o for o in bpy.data.objects if o.type == "MESH"][0]
bpy.context.view_layer.objects.active = ob
ob.select_set(True)
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
me = ob.data
co = np.array([v.co[:] for v in me.vertices])
me.transform(Matrix.Translation(Vector((-(co[:, 0].max() + co[:, 0].min()) / 2, -(co[:, 1].max() + co[:, 1].min()) / 2, -co[:, 2].min()))))
ob.name = "body"

# ---------------------------------------------------------------- decimate
tris = sum(len(p.vertices) - 2 for p in me.polygons)
dec = ob.modifiers.new("dec", "DECIMATE")
dec.ratio = min(1.0, TARGET_TRIS / tris)
bpy.ops.object.modifier_apply(modifier="dec")
me = ob.data
V = np.array([v.co[:] for v in me.vertices])
H = V[:, 2].max()
print("triangles", tris, "->", sum(len(p.vertices) - 2 for p in me.polygons), "verts", len(V), "height", round(H, 3))

# ---------------------------------------------------------------- landmarks
# from the front silhouette (tools/character_landmarks.py, same frame as here)
import json
LM = json.load(open(os.path.join(ROOT, "assets", "src", "character", "landmarks.json")))
X, Y, Z = V[:, 0], V[:, 1], V[:, 2]
crotch, armpit, neck_z, yc = LM["crotch"], LM["armpit"], LM["neck"], LM["trunk_y"]
J = {k: Vector(LM[k]) for k in ("hip", "knee", "ankle", "toe", "toe_end", "shoulder", "elbow", "wrist", "tip")}
shoulder, elbow, wrist, hand_tip = J["shoulder"], J["elbow"], J["wrist"], J["tip"]
hip, knee, ankle, toe, toe_end = J["hip"], J["knee"], J["ankle"], J["toe"], J["toe_end"]
arm_rows = np.array(sorted(float(z) for z in LM["arms"]))
arm_rows = np.array(sorted(float(z) for z in LM["trunk"]))
trunk_iv = np.array([LM["trunk"][f"{z:.4f}"] for z in arm_rows])   # the trunk's outer x, R and L side
print(f"crotch {crotch:.3f} armpit {armpit:.3f} neck {neck_z:.3f}")

# ---------------------------------------------------------------- skeleton
arm_ob = bpy.data.objects.new("rig", bpy.data.armatures.new("rig"))
bpy.context.scene.collection.objects.link(arm_ob)
bpy.context.view_layer.objects.active = arm_ob
bpy.ops.object.mode_set(mode="EDIT")
eb = arm_ob.data.edit_bones
B = {}


def bone(name, head, tail, parent=None, connect=False):
    b = eb.new(name)
    b.head, b.tail = Vector(head), Vector(tail)
    if parent:
        b.parent = B[parent]
        b.use_connect = connect
    B[name] = b
    return b


pz = crotch + 0.04
chest_z = (armpit + neck_z) / 2 - 0.02
bone("hips", (0, yc, pz), (0, yc, pz + 0.12))
bone("spine", (0, yc, pz + 0.12), (0, yc, chest_z - 0.05), "hips", True)
bone("chest", (0, yc, chest_z - 0.05), (0, yc, neck_z - 0.01), "spine", True)
bone("neck", (0, yc, neck_z - 0.01), (0, yc + 0.005, neck_z + 0.05), "chest", True)
bone("head", (0, yc + 0.005, neck_z + 0.05), (0, yc + 0.005, H), "neck", True)
for s, side in ((1, "L"), (-1, "R")):     # (L = the model's left, +X)
    m = Vector((s, 1, 1))
    mul = lambda v: Vector((v.x * s, v.y, v.z))
    bone(f"clavicle.{side}", (0.03 * s, yc, neck_z - 0.03), mul(shoulder), "chest")
    bone(f"upperarm.{side}", mul(shoulder), mul(elbow), f"clavicle.{side}", True)
    bone(f"forearm.{side}", mul(elbow), mul(wrist), f"upperarm.{side}", True)
    bone(f"hand.{side}", mul(wrist), mul(hand_tip), f"forearm.{side}", True)
    bone(f"thigh.{side}", mul(hip), mul(knee), "hips")
    bone(f"shin.{side}", mul(knee), mul(ankle), f"thigh.{side}", True)
    bone(f"foot.{side}", mul(ankle), mul(toe), f"shin.{side}", True)
    bone(f"toe.{side}", mul(toe), mul(toe_end), f"foot.{side}", True)
segs = {n: (np.array(b.head[:]), np.array(b.tail[:])) for n, b in B.items()}
bpy.ops.object.mode_set(mode="OBJECT")

# ---------------------------------------------------------------- weights by region
def seg_dist(P, a, b):
    ab = b - a
    t = np.clip(((P - a) @ ab) / max(ab @ ab, 1e-9), 0, 1)
    return np.linalg.norm(P - (a + t[:, None] * ab), axis=1)


names = list(segs)
D = np.stack([seg_dist(V, *segs[n]) for n in names], 1)          # verts x bones
allowed = np.zeros_like(D, bool)
idx = {n: i for i, n in enumerate(names)}
side = np.where(X >= 0, "L", "R")
ax = np.abs(X)
# arm vertices: farther out than the trunk's silhouette edge on their row (thumbs included)
k = np.clip(np.searchsorted(arm_rows, Z), 0, len(arm_rows) - 1)
inrange = (Z >= arm_rows[0] - 0.004) & (Z <= arm_rows[-1] + 0.004)
is_arm = inrange & (((X > 0) & (X > trunk_iv[k, 1] + 0.003)) | ((X < 0) & (X < trunk_iv[k, 0] - 0.003)))
shoulder_cap = (~is_arm) & (Z > armpit - 0.01) & (Z < shoulder.z + 0.07) & (ax > shoulder.x - 0.045)
is_leg = (~is_arm) & (Z < crotch - 0.015)
hip_band = (~is_arm) & (~is_leg) & (Z < crotch + 0.09) & (ax > 0.015)
for i in range(len(V)):
    s = side[i]
    if is_arm[i]:
        c = [f"upperarm.{s}", f"forearm.{s}", f"hand.{s}"]
    elif shoulder_cap[i]:
        c = ["chest", f"clavicle.{s}", f"upperarm.{s}"]
    elif is_leg[i]:
        c = [f"thigh.{s}", f"shin.{s}", f"foot.{s}", f"toe.{s}"]
    elif hip_band[i]:
        c = ["hips", "spine", f"thigh.{s}"]
    else:
        c = ["hips", "spine", "chest", "neck", "head", f"clavicle.{s}"]
    for n in c:
        allowed[i, idx[n]] = True
Wt = np.where(allowed, 1.0 / (D + 0.01) ** 4, 0.0)
order = np.argsort(-Wt, 1)
keep = np.zeros_like(Wt, bool)
np.put_along_axis(keep, order[:, :3], True, 1)
Wt = np.where(keep, Wt, 0)
Wt /= Wt.sum(1, keepdims=True)
for n in names:
    g = ob.vertex_groups.new(name=n)
    col = Wt[:, idx[n]]
    for i in np.nonzero(col > 0.01)[0]:
        g.add([int(i)], float(col[i]), "REPLACE")
mod = ob.modifiers.new("rig", "ARMATURE")
mod.object = arm_ob
ob.parent = arm_ob
print("arm verts", int(is_arm.sum()), "leg verts", int(is_leg.sum()), "shoulder", int(shoulder_cap.sum()))

# ---------------------------------------------------------------- export
bpy.ops.object.select_all(action="DESELECT")
ob.select_set(True)
arm_ob.select_set(True)
bpy.context.view_layer.objects.active = arm_ob
bpy.ops.export_scene.gltf(filepath=OUT, export_format="GLB", use_selection=True, export_skins=True, export_animations=False,
                          export_image_format="JPEG", export_image_quality=88, export_apply=False)
print("exported", OUT, os.path.getsize(OUT) // 1024, "KB")
import json
json.dump({k: [round(float(x), 4) for x in v[0]] + [round(float(x), 4) for x in v[1]] for k, v in segs.items()},
          open(os.path.join(ROOT, "assets", "src", "character", "bones.json"), "w"), indent=1)
