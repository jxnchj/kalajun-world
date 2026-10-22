"""The walker from the user's Mixamo exports (assets/src/character/*.fbx, each the rigged character
with one animation, 30 fps): web/public/assets/character.glb with the mesh, the Mixamo skeleton and
the clips of web/src/character.js:

  idle     Standard Idle          breathing, weight shifting (3 s loop)
  look     Looking Around         now and then when standing still a while (10 s)
  walk     Dwarf Walk             (1.10 s cycle, 1.02 m) in place  } no longer among the FBX files: taken
  run      Fast Run               (0.53 s cycle, 1.76 m) in place  } from the previous build,
                                                                     locomotion_v1.glb (same skeleton,
                                                                     same rest pose: copied bone by bone)
  jump     Jumping                standing jump: crouch, take-off f17, air, landing f34, recovery
  rjump    Running Jump           jump on the move: take-off f5, landing f19, hardly any crouch
  fall     Falling Idle           in the air after stepping off something high (loop)
  land     Falling To Landing     touching down from such a fall at f9, knees giving, standing up
  standup  Standing Up            from sitting on the ground to standing (played backwards: sitting down)
  sit      Male Sitting Pose      sitting on the ground, leaning back on the hands
  liedown  Lying Down             from standing to lying on the back
  lie      Laying Idle            lying on the back
  getup    Getting Up             from lying to standing
  pickup   Picking Up             bending down to pick something up
  push     Pushing                leaning into something heavy, stepping (in place)
  wave     Waving                 waving
The second set (the user's commission, assets/src/character/儿童新动作制作结果/原来的孩子/新动作/
*-30fps.fbx, 2026-10-10: its 动作交付清单.csv gives each clip's source and what is approximate):
  sit      SittingIdle            sitting on the ground (the pose of before), breathing, looking about
  lie      LyingIdle              lying on the back (the pose of before), breathing
  turnL    TurnLeft90             stepping round 90 degrees to the left on the spot (the turn kept)
  turnR    TurnRight90            to the right
  crouch   CrouchLookFlower       crouching to look at (smell) a flower, standing up
  skip     Skip                   skipping (in place, one cycle)
  spin     SpinArmsOut            spinning twice round, arms out, a dizzy wobble
  chase    ChaseCatch             running with a hand reaching up and forward (in place, one cycle)
  stretch  Stretch                stretching, arms up
  point    PointFar               pointing far off, looking back
  talk     Talking                talking, gesturing (loop)
  throw    Throw                  an overhand throw
  ledgeDown StandToSitLedge       sitting down on a 40 cm edge behind (hips back 18 cm onto it)
  ledge    SitLedgeIdle           sitting on it, the legs swinging (loop)
  ledgeUp  SitLedgeToStand        standing up from it

Root motion: walk, run, rjump and push are made to play in place (the travel from the first frame to
the last taken off: the walker's physics moves it); jump and rjump lose the height the feet rise
in the air (the physics lifts it). The others move the hips as the body goes down and up.

Every FBX carries the same mesh three times over: one copy is kept whole (~99k triangles: a
decimation broke the texture's UV seams), given eyeballs (below) and the
texture of the original glb (the FBX files reference it but do not contain it). Mixamo works in
centimetres under a 0.01 scale; the glTF keeps that node scale. The model faces -Y here (three +Z).
Run: tools/.bpy/bin/python tools/blender/character_mixamo.py
"""
import json, os
import bpy
from mathutils import Vector, Matrix

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
SRC = os.path.join(ROOT, "assets", "src", "character")
OUT = os.path.join(ROOT, "web", "public", "assets", "character.glb")
OUT = os.environ.get("KID_GLB_OUT", OUT)      # (a preview elsewhere, the game's left as it is)
LOCO = os.path.join(SRC, "locomotion_v1.glb")
NEW = os.path.join(SRC, "儿童新动作制作结果", "原来的孩子", "新动作")
N = lambda n: os.path.join(NEW, f"{n}-30fps.fbx")
CLIPS = [("idle", "Standard Idle.fbx"), ("look", "Looking Around.fbx"), ("jump", "Jumping.fbx"), ("rjump", "Running Jump.fbx"),
         ("fall", "Falling Idle.fbx"), ("land", "Falling To Landing.fbx"), ("standup", "Standing Up.fbx"),
         ("sit", N("SittingIdle")), ("liedown", "Lying Down.fbx"), ("lie", N("LyingIdle")), ("getup", "Getting Up.fbx"),
         ("pickup", "Picking Up.fbx"), ("push", "Pushing.fbx"), ("wave", "Waving.fbx"),
         ("turnL", N("TurnLeft90")), ("turnR", N("TurnRight90")), ("crouch", N("CrouchLookFlower")), ("skip", N("Skip")),
         ("spin", N("SpinArmsOut")), ("chase", N("ChaseCatch")), ("stretch", N("Stretch")), ("point", N("PointFar")),
         ("talk", N("Talking")), ("throw", N("Throw")), ("ledgeDown", N("StandToSitLedge")), ("ledge", N("SitLedgeIdle")),
         ("ledgeUp", N("SitLedgeToStand"))]

bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene
sc.render.fps = 30


def import_fbx(path):
    before = set(bpy.data.objects)
    bpy.ops.import_scene.fbx(filepath=path)
    new = [o for o in bpy.data.objects if o not in before]
    arm = [o for o in new if o.type == "ARMATURE"][0]
    return arm, [o for o in new if o.type == "MESH"]


def use_action(ob, action):
    ob.animation_data.action = action
    try:
        ob.animation_data.action_slot = ob.animation_data.action_suitable_slots[0]
    except Exception:
        pass


# ---------------------------------------------------------------- the character (from the idle file)
arm, meshes = import_fbx(os.path.join(SRC, CLIPS[0][1]))
arm.name = "character"
body = meshes[0]
for m in meshes[1:]:
    bpy.data.objects.remove(m)
body.name = "body"
actions = {"idle": arm.animation_data.action}
# the other clips: import, take the action, drop the rest
for name, fn in CLIPS[1:]:
    a2, m2 = import_fbx(os.path.join(SRC, fn))
    actions[name] = a2.animation_data.action
    a2.animation_data.action = None
    for o in m2 + [a2]:
        bpy.data.objects.remove(o)

# walk and run from the previous build: the same skeleton in the same rest pose (checked), so each
# bone copies its source's world transform, baked into a new action
before_objs, before_acts = set(bpy.data.objects), set(bpy.data.actions)
bpy.ops.import_scene.gltf(filepath=LOCO)
loco_objs = [o for o in bpy.data.objects if o not in before_objs]
src_arm = [o for o in loco_objs if o.type == "ARMATURE"][0]
loco_acts = {a.name: a for a in bpy.data.actions if a not in before_acts}
if not src_arm.animation_data:
    src_arm.animation_data_create()
bpy.context.view_layer.objects.active = arm
arm.select_set(True)
for name in ("walk", "run"):
    a = loco_acts[name]
    use_action(src_arm, a)
    f0, f1 = int(a.frame_range[0]), int(a.frame_range[1])
    arm.animation_data.action = None
    bpy.ops.object.mode_set(mode="POSE")
    for pb in arm.pose.bones:
        if pb.name in src_arm.pose.bones:
            c = pb.constraints.new("COPY_TRANSFORMS")
            c.target, c.subtarget = src_arm, pb.name
    bpy.ops.pose.select_all(action="SELECT")
    bpy.ops.nla.bake(frame_start=f0, frame_end=f1, only_selected=False, visual_keying=True, clear_constraints=True,
                     use_current_action=False, bake_types={"POSE"})
    bpy.ops.object.mode_set(mode="OBJECT")
    actions[name] = arm.animation_data.action
    arm.animation_data.action = None
for o in loco_objs:
    bpy.data.objects.remove(o)
for a in loco_acts.values():
    bpy.data.actions.remove(a)
for name, a in actions.items():
    a.name = name
    a.use_fake_user = True
arm.animation_data.action = actions["idle"]
print("actions", {n: tuple(a.frame_range) for n, a in actions.items()})

# ---------------------------------------------------------------- root motion
HIPS = "mixamorig:Hips"


def rekey_hips(action, fn):
    """rewrite the hips' location keys: fn(rec) -> new world positions, rec = [(frame, matrix, world_pos)]"""
    use_action(arm, action)
    f0, f1 = int(action.frame_range[0]), int(action.frame_range[1])
    pb = arm.pose.bones[HIPS]
    rec = []
    for f in range(f0, f1 + 1):
        sc.frame_set(f)
        rec.append((f, pb.matrix.copy(), (arm.matrix_world @ pb.matrix).translation.copy()))
    Mi = arm.matrix_world.inverted()
    info = fn(rec)
    for (f, m, p), q in zip(rec, info):
        new = m.copy()
        new.translation = Mi @ q
        pb.matrix = new
        bpy.context.view_layer.update()
        pb.keyframe_insert("location", frame=f)
    return rec


def strip_travel(rec):
    """in place: remove the straight-line travel from the first to the last frame"""
    p0, p1 = rec[0][2], rec[-1][2]
    n = len(rec) - 1
    return [Vector((p.x - (p1 - p0).x * i / n, p.y - (p1 - p0).y * i / n, p.z)) for i, (f, m, p) in enumerate(rec)]


def strip_lift(rec):
    """a jump in place: take off the height the feet rise above the ground (the lift is measured on
    the keys as they are: strip before any other rewrite of the same clip)"""
    out = []
    for f, m, p in rec:
        sc.frame_set(f)
        W = arm.matrix_world
        toes = [(W @ arm.pose.bones[b].head).z for b in ("mixamorig:LeftToeBase", "mixamorig:RightToeBase")]
        out.append(Vector((p.x, p.y, p.z - max(0.0, min(toes) - 0.006))))
    return out


def travel_and_lift(rec):
    lifted = strip_lift(rec)
    return strip_travel([(f, m, q) for (f, m, p), q in zip(rec, lifted)])


rekey_hips(actions["jump"], strip_lift)
rekey_hips(actions["rjump"], travel_and_lift)
rekey_hips(actions["push"], strip_travel)
arm.animation_data.action = actions["idle"]
travel = json.load(open(os.path.join(SRC, "clips.json")))["travel"]   # walk / run: measured in the first build
TOES = ("mixamorig:LeftToeBase", "mixamorig:RightToeBase")


def stride(action):
    """metres per cycle of a gait played in place: how fast the planted foot slides back under the
    body, times the cycle's length"""
    import statistics
    use_action(arm, action)
    f0, f1 = int(action.frame_range[0]), int(action.frame_range[1])
    W = arm.matrix_world
    P = []
    for f in range(f0, f1 + 1):
        sc.frame_set(f)
        P.append([(W @ arm.pose.bones[b].head).copy() for b in TOES])
    g = min(min(q.z for q in fr) for fr in P)
    v = [Vector((P[k][s].x - P[k - 1][s].x, P[k][s].y - P[k - 1][s].y)).length
         for k in range(1, len(P)) for s in (0, 1) if P[k - 1][s].z < g + 0.02 and P[k][s].z < g + 0.02]
    return statistics.median(v) * (f1 - f0) if v else 0.0


for name in ("skip", "chase"):
    a = actions[name]
    travel[name] = {"metres": round(stride(a), 4), "seconds": round((a.frame_range[1] - a.frame_range[0]) / 30, 4)}
arm.animation_data.action = actions["idle"]

# ---------------------------------------------------------------- the eyes
# The AI mesh has holes for eyes, the eye painted on the bottom of each hole several centimetres
# in: in the scene they read as dark holes. Find the two holes on a front depth map of the head
# (ray cast), and put an eyeball in each, textured by projecting the painted eye straight
# forward onto it (it looks as it did from the front, but it is a convex, lit eye).
from mathutils.bvhtree import BVHTree
from mathutils import geometry
import bmesh
import numpy as np

arm.data.pose_position = "REST"
bpy.context.view_layer.update()


def rest_bmesh():
    dg = bpy.context.evaluated_depsgraph_get()
    bm = bmesh.new()
    bm.from_object(body, dg)
    bm.transform(body.matrix_world)
    bmesh.ops.triangulate(bm, faces=bm.faces)
    return bm


def neighbours(mask, iters):
    out = mask.copy()
    for _ in range(iters):
        m = out.copy()
        m[1:] |= out[:-1]; m[:-1] |= out[1:]; m[:, 1:] |= out[:, :-1]; m[:, :-1] |= out[:, 1:]
        out = m
    return out


def components(mask):
    lab = np.zeros(mask.shape, int)
    n = 0
    for i0, j0 in zip(*np.nonzero(mask)):
        if lab[i0, j0]:
            continue
        n += 1
        stack = [(i0, j0)]
        lab[i0, j0] = n
        while stack:
            i, j = stack.pop()
            for a, b in ((i + 1, j), (i - 1, j), (i, j + 1), (i, j - 1)):
                if 0 <= a < mask.shape[0] and 0 <= b < mask.shape[1] and mask[a, b] and not lab[a, b]:
                    lab[a, b] = n
                    stack.append((a, b))
    return lab, n


bm0 = rest_bmesh()
bvh0 = BVHTree.FromBMesh(bm0)
head_z = (arm.matrix_world @ arm.data.bones["mixamorig:Head"].head_local).z
top = max(v.co.z for v in bm0.verts)
C = 0.001
xs = np.arange(-0.11, 0.11, C)
zs = np.arange(top - 0.005, head_z, -C)
D = np.full((len(zs), len(xs)), 9.0)
for i, z in enumerate(zs):
    for j, x in enumerate(xs):
        hit = bvh0.ray_cast(Vector((x, -1.0, z)), Vector((0, 1, 0)), 2.0)
        if hit[0] is not None:
            D[i, j] = hit[0].y
front = D.min()
face = D < front + 0.045
closed = ~neighbours(~neighbours(face, 4), 4)              # closing: seal gaps in the face's outline
outside = np.zeros_like(face)                              # flood the non-face from the border
outside[0, :] = ~closed[0, :]; outside[-1, :] = ~closed[-1, :]; outside[:, 0] = ~closed[:, 0]; outside[:, -1] = ~closed[:, -1]
while True:
    grown = neighbours(outside, 1) & ~closed
    if (grown == outside).all():
        break
    outside = grown
holes = ~face & ~outside
lab, n = components(holes)
blobs = []
for k in range(1, n + 1):
    ii, jj = np.nonzero(lab == k)
    if len(ii) < 50:
        continue
    rim = neighbours(lab == k, 2) & face
    blobs.append(dict(area=len(ii), x=xs[jj].mean(), z=zs[ii].mean(), w=(jj.max() - jj.min() + 1) * C,
                      h=(ii.max() - ii.min() + 1) * C, rim=float(D[rim].mean())))
blobs.sort(key=lambda b: -b["area"])
L = [b for b in blobs if b["x"] > 0.02][:1]
R = [b for b in blobs if b["x"] < -0.02][:1]
assert L and R, blobs
# the mesh is symmetric: one eye size and height for both, mirrored
ex = (L[0]["x"] - R[0]["x"]) / 2
ez = (L[0]["z"] + R[0]["z"]) / 2
ew = min(L[0]["w"], R[0]["w"])
erim = (L[0]["rim"] + R[0]["rim"]) / 2
print(f"eye sockets x +-{ex:.4f} z {ez:.4f} width {ew:.4f} rim y {erim:.4f}")
bm0.free()

# ---------------------------------------------------------------- the mesh: kept whole
# (an edge-collapse decimation to ~40k triangles merged triangles across the texture's UV seams:
# hundreds of slivers then sampled the wrong island -- skin-coloured shards on the shirt, dark and
# blue ones on the arms and legs. ~99k triangles for the one walker are affordable.)
arm.data.pose_position = "POSE"
bpy.context.view_layer.objects.active = body
print("triangles", sum(len(p.vertices) - 2 for p in body.data.polygons))

# ---------------------------------------------------------------- eyeballs
arm.data.pose_position = "REST"
bpy.context.view_layer.update()
bmL = rest_bmesh()
uvl = bmL.loops.layers.uv.active
bmL.faces.ensure_lookup_table()
bvh = BVHTree.FromBMesh(bmL)
r = ew * 0.58                                    # a little bigger than the opening: tucked under the lids
# bake the eye as seen from the front into its own small texture (both eyes side by side), by
# casting rays into the socket and sampling the body texture there; the eyeballs are then
# mapped flat from the front onto it -- no seams from the body texture's islands
tex_img = bpy.data.images.load(os.path.join(SRC, "texture.png"))
TW, TH = tex_img.size
tpx = np.empty(TW * TH * 4, np.float32)
tex_img.pixels.foreach_get(tpx)
tpx = tpx.reshape(TH, TW, 4)
ES = 128
eye_px = np.zeros((ES, 2 * ES, 4), np.float32)
eye_px[..., 3] = 1
half = 1.15 * r
centres = []
for k, sgn in enumerate((1, -1)):
    cx, cz = sgn * ex, ez
    centres.append((sgn, cx, cz, k))
    for i in range(ES):
        z = cz - half + (i + 0.5) / ES * 2 * half
        for j in range(ES):
            x = cx - half + (j + 0.5) / ES * 2 * half
            hit = bvh.ray_cast(Vector((x, -1.0, z)), Vector((0, 1, 0)), 2.0)
            if hit[0] is None:
                continue
            t = bmL.faces[hit[2]]
            a0, b0, c0 = t.loops
            w = geometry.barycentric_transform(hit[0], a0.vert.co, b0.vert.co, c0.vert.co,
                                               a0[uvl].uv.to_3d(), b0[uvl].uv.to_3d(), c0[uvl].uv.to_3d())
            u, v = w.x % 1.0, w.y % 1.0
            eye_px[i, k * ES + j] = tpx[min(TH - 1, int(v * TH)), min(TW - 1, int(u * TW))]
# the source texture is coarse in there: paint a clean eye in the same design (large dark brown
# iris, black pupil, highlight at the upper left, white of the eye at the corners, the upper lid's
# shadow), taking the iris colour from the sampled eye
dark = eye_px[..., :3].reshape(-1, 3)
dark = dark[dark.sum(1) < np.percentile(dark.sum(1), 30)]
iris_c = np.clip(np.median(dark, 0) * 1.2, 0.04, 0.4)
ES = 256
eye_px = np.zeros((ES, 2 * ES, 4), np.float32)
eye_px[..., 3] = 1
open_h = 0.011 / (2 * half)                       # half-height of the lid opening in texture units
iris_r = 0.86 * open_h * 1.05
jj, ii = np.meshgrid((np.arange(2 * ES) % ES + 0.5) / ES, (np.arange(ES) + 0.5) / ES)
sm = lambda e0, e1, x: np.clip((x - e0) / (e1 - e0), 0, 1) ** 2 * (3 - 2 * np.clip((x - e0) / (e1 - e0), 0, 1))
icx, icy = 0.5, 0.49
d = np.hypot(jj - icx, ii - icy) / iris_r
sclera = np.array([0.93, 0.91, 0.87]) * (1 - 0.35 * sm(0.5 + open_h * 0.2, 0.5 + open_h, ii))[..., None]   # lid shadow above
sclera *= (1 - 0.18 * sm(0.3, 0.75, np.abs(jj - 0.5) / (0.75 * 0.5)))[..., None]                         # rounder at the corners
iris = iris_c * (0.55 + 0.6 * sm(0.2, -0.9, (ii - icy) / iris_r))[..., None]       # lighter below
iris = iris * (1 - 0.55 * sm(0.72, 1.0, d))[..., None]                              # dark limbal ring
iris *= (1 - 0.35 * sm(0.5 + open_h * 0.3, 0.5 + open_h * 1.1, ii))[..., None]     # lid shadow
col = sclera * (1 - sm(0.96, 1.02, 2 - d)[..., None]) + iris * sm(0.96, 1.02, 2 - d)[..., None]
pupil = sm(0.45, 0.4, d)[..., None]
col = col * (1 - pupil) + np.array([0.015, 0.012, 0.01]) * pupil                    # pupil
for (ox, oy, rr, a) in ((-0.34, 0.36, 0.2, 1.0), (0.3, -0.3, 0.09, 0.8)):           # highlights
    h = sm(1.0, 0.7, np.hypot(jj - icx - ox * iris_r, ii - icy - oy * iris_r) / (rr * iris_r))
    col = col * (1 - a * h[..., None]) + np.array([1.0, 0.99, 0.97]) * (a * h)[..., None]
eye_px[..., :3] = np.clip(col, 0, 1)
eye_img = bpy.data.images.new("eyes", 2 * ES, ES, alpha=False)
eye_img.colorspace_settings.name = "sRGB"
eye_img.pixels.foreach_set(eye_px.ravel())
eye_img.filepath_raw = os.path.join(SRC, "eyes.png")
eye_img.file_format = "PNG"
eye_img.save()
eye_objs = []
for sgn, cx, cz, k in centres:
    c = Vector((cx, erim + 0.002 + r, cz))       # its front just behind the lid rim
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=28, v_segments=18, radius=r)
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if v.co.y > 0.25 * r], context="VERTS")   # the back is never seen
    for v in bm.verts:
        v.co += c
    uv = bm.loops.layers.uv.verify()
    for f in bm.faces:
        for lp in f.loops:
            p = lp.vert.co
            lp[uv].uv = ((k + (p.x - (cx - half)) / (2 * half)) / 2, (p.z - (cz - half)) / (2 * half))
    me = bpy.data.meshes.new(f"eye{sgn}")
    bm.to_mesh(me)
    bm.free()
    me.uv_layers[0].name = body.data.uv_layers.active.name   # joined by name: must match the body's
    for p in me.polygons:
        p.use_smooth = True
    ob = bpy.data.objects.new(f"eye{sgn}", me)
    sc.collection.objects.link(ob)
    eye_objs.append(ob)
bmL.free()
arm.data.pose_position = "POSE"
# eye material: the body's texture, told apart so the web material can give it a wet glint
eye_mat = body.material_slots[0].material.copy()
for ob in eye_objs:
    ob.data.materials.append(eye_mat)
    g = ob.vertex_groups.new(name="mixamorig:Head")
    g.add(list(range(len(ob.data.vertices))), 1.0, "REPLACE")
bpy.ops.object.select_all(action="DESELECT")
for ob in eye_objs:
    ob.select_set(True)
body.select_set(True)
bpy.context.view_layer.objects.active = body
bpy.ops.object.join()
print("eyeballs radius", round(r, 4))
# the body's texture as cleaned on the surface (tools/clean_character_texture.py: one skin over the
# seams, no dots or scratches, no dark padding between the islands), else as made
clean = os.path.join(SRC, "texture_clean.png")
img = bpy.data.images.load(clean if os.path.exists(clean) else os.path.join(SRC, "texture.png"))
for k, slot in enumerate(body.material_slots):
    mat = slot.material
    is_eye = mat is eye_mat
    mat.name = "Designer_Logic_PBR" if not is_eye else "Designer_Logic_PBR_eye"
    nt = mat.node_tree
    bsdf = next(n for n in nt.nodes if n.type == "BSDF_PRINCIPLED")
    tex = next((n for n in nt.nodes if n.type == "TEX_IMAGE"), None) or nt.nodes.new("ShaderNodeTexImage")
    tex.image = img if not is_eye else eye_img
    nt.links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
    for inp in ("Metallic",):
        if bsdf.inputs[inp].is_linked:
            nt.links.remove(bsdf.inputs[inp].links[0])
        bsdf.inputs[inp].default_value = 0.0
    bsdf.inputs["Roughness"].default_value = 0.85

# ---------------------------------------------------------------- the hands (tools/blender/hands.py): the rig's
# two fingers (an index and a thumb) made five -- middle, ring and little fingers' bones beside the index's, taking
# its turns in every clip -- and the hands remade along the bones (they were fused, the three fingers riding on
# the index); in the pointing clip the raised hand's index straightened
import sys as _sys, importlib
_sys.path.insert(0, os.path.dirname(__file__))
import hands, rebody
importlib.reload(hands); importlib.reload(rebody)
arm.data.pose_position = "REST"
bpy.context.view_layer.update()
# (the texture's blotches first: red-brown patches round the neck and under the jaw, scab-like spots on the knees)
_head_z = (arm.matrix_world @ arm.data.bones["mixamorig:Head"].head_local).z     # (about the mouth's height)
_bw = np.array([tuple(body.matrix_world @ v.co) for v in body.data.vertices])
_mouth_y = float(np.percentile(_bw[np.abs(_bw[:, 2] - _head_z) < 0.01][:, 1], 1))   # (the face's front there: the lips)
rebody.clean_skin_marks(body, img, print, [("neck", {"Neck", "Spine2", "LeftShoulder", "RightShoulder"}),
                                           ("under the jaw", {"Head", "Neck"}, _head_z - 0.005, _mouth_y + 0.04),
                                           ("arms", {"LeftArm", "RightArm", "LeftForeArm", "RightForeArm"}),
                                           ("legs", {"LeftUpLeg", "RightUpLeg", "LeftLeg", "RightLeg"})])
hands.add_twist_bones(arm, body, actions, print)
hands.add_finger_bones(arm, body, actions, print)
hands.proportion_fingers(arm, print)
hands.relax_fingers(arm, actions, print)
hands.new_hands(body, arm, img, print)
hands.point_index(arm, actions["point"], print)
# (the texture's islands -- many only a few texels across round the neck -- padded out over the margins
# between them: the blotches' red was left there, and the filtering pulled it back in)
rebody.pad_islands(body, img, print)
arm.data.pose_position = "REST"
bpy.context.view_layer.update()

# ---------------------------------------------------------------- a face that moves (tools/blender/face_rig.py):
# the mouth cut along the lips with a jaw and a mouth inside, lids over the eyeballs
import face_rig
importlib.reload(face_rig)
balls = [(Vector((cx, erim + 0.002 + r, cz)), r) for sgn, cx, cz, k in centres]
FACE = face_rig.add_face_rig(arm, body, img, ("balls", balls), debug=os.path.join(SRC, "face_debug.png"), name="walker")

# ---------------------------------------------------------------- export
for a in list(bpy.data.actions):          # (leftovers of the imports and the bake)
    if a not in actions.values():
        bpy.data.actions.remove(a)
bpy.ops.object.select_all(action="DESELECT")
body.select_set(True)
arm.select_set(True)
bpy.context.view_layer.objects.active = arm
bpy.ops.export_scene.gltf(filepath=OUT, export_format="GLB", use_selection=True, export_skins=True,
                          export_animations=True, export_animation_mode="ACTIONS", export_anim_single_armature=True,
                          export_image_format="JPEG", export_image_quality=88, export_apply=False,
                          export_force_sampling=True, export_frame_step=1)
print("exported", OUT, os.path.getsize(OUT) // 1024, "KB")
json.dump({"travel": travel,
           "jump": {"takeoff": 17, "land": 34, "frames": list(actions["jump"].frame_range)},
           "rjump": {"takeoff": 5, "land": 19, "frames": list(actions["rjump"].frame_range)},
           "land": {"touchdown": 9},
           "frames": {n: list(a.frame_range) for n, a in actions.items()},
           "face": FACE},
          open(os.path.join(SRC, "clips.json"), "w"), indent=1)
print(travel)
