"""The second child, the schoolboy in the blue track uniform (the user's FBX set, assets/src/character/
schoolboy/FBX/*-30fps.fbx: each the rigged, skinned, textured character with one motion, 30 fps; the
set's own notes in 使用说明.txt and 动作对应表.csv): web/public/assets/schoolboy.glb with the mesh, the
Mixamo skeleton and the clips of web/src/character.js under the walker's names:

  idle     Idle                   standing (2.5 s loop)
  walk     Walk                   one cycle, played in place (its stride measured here)
  run      Run                    one cycle, in place
  jump     Jump                   crouch, take-off, air, landing (spliced in the set): in place, the lift
                                  taken off (the physics lifts the walker)
  rjump    RunningJump            the running jump (spliced from a run and a jump): likewise
  fall     FallingIdle            in the air (loop)
  land     Landing                touching down, the knees giving
  sitdown  StandToSitGround       from standing to sitting on the ground, leaning back on the hands
  standup  SitGroundToStand       from sitting on the ground to standing
  sit      SittingGroundPoseHold  sitting (a held pose)
  liedown  LyingDown              from standing to lying on the back
  lie      LyingPoseHold          lying on the back (a held pose)
  getup    GettingUp              from lying to standing
  pickup   PickingUp              bending to pick something up
  push     Pushing                leaning into something, stepping: in place
  (the second set, the user's commission: assets/src/character/儿童新动作制作结果/小男孩/新动作/, its
  动作交付清单.csv giving each clip's source and what is approximate)
  look     LookAround             looking left, right, up at the sky (9 s)
  wave     WaveStanding           waving, upright, the hand above the head (the greeting before, bent
                                  forward, dropped)
  sit, lie SittingIdle, LyingIdle the held poses of before, now breathing and looking about
  turnL/R, crouch, skip, spin, chase, stretch, point, talk, throw, ledgeDown, ledge, ledgeUp: as the
                                  walker's (tools/blender/character_mixamo.py)

Each clip also moves the armature object up and down (the jump's lift, a raise while falling, sitting
and lying): that is moved into the hips' own keys and the object's curves dropped, so the clips share
one root. The model's origin is at its middle: the armature is raised so the soles are at 0. The eyes are
painted on the surface (no sockets, unlike the walker's): found here on the texture for the skin
cleaning (tools/clean_character_texture.py), whose texture this build then takes if it exists.
Run: tools/.bpy/bin/python tools/blender/character_schoolboy.py
"""
import json, os
import bpy
import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree
from mathutils import geometry
import bmesh

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
SRC = os.path.join(ROOT, "assets", "src", "character", "schoolboy")
FBX = os.path.join(SRC, "FBX")
OUT = os.path.join(ROOT, "web", "public", "assets", "schoolboy.glb")
OUT = os.environ.get("KID_GLB_OUT", OUT)      # (a preview elsewhere, the game's left as it is)
NEW = os.path.join(ROOT, "assets", "src", "character", "儿童新动作制作结果", "小男孩", "新动作")
CLIPS = [("idle", "Idle"), ("walk", "Walk"), ("run", "Run"), ("jump", "Jump"), ("rjump", "RunningJump"),
         ("fall", "FallingIdle"), ("land", "Landing"), ("sitdown", "StandToSitGround"), ("standup", "SitGroundToStand"),
         ("sit", "+SittingIdle"), ("liedown", "LyingDown"), ("lie", "+LyingIdle"), ("getup", "GettingUp"),
         ("pickup", "PickingUp"), ("push", "Pushing"), ("wave", "+WaveStanding"), ("look", "+LookAround"),
         ("turnL", "+TurnLeft90"), ("turnR", "+TurnRight90"), ("crouch", "+CrouchLookFlower"), ("skip", "+Skip"),
         ("spin", "+SpinArmsOut"), ("chase", "+ChaseCatch"), ("stretch", "+Stretch"), ("point", "+PointFar"),
         ("talk", "+Talking"), ("throw", "+Throw"), ("ledgeDown", "+StandToSitLedge"), ("ledge", "+SitLedgeIdle"),
         ("ledgeUp", "+SitLedgeToStand")]   # (+: from the second set)
HIPS = "mixamorig:Hips"
TOES = ("mixamorig:LeftToeBase", "mixamorig:RightToeBase")

bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene
sc.render.fps = 30


def import_fbx(name):
    before = set(bpy.data.objects)
    path = os.path.join(NEW, f"{name[1:]}-30fps.fbx") if name.startswith("+") else os.path.join(FBX, f"{name}-30fps.fbx")
    bpy.ops.import_scene.fbx(filepath=path)
    new = [o for o in bpy.data.objects if o not in before]
    return [o for o in new if o.type == "ARMATURE"][0], [o for o in new if o.type == "MESH"]


def use_action(ob, action):
    ob.animation_data.action = action
    try:
        ob.animation_data.action_slot = ob.animation_data.action_suitable_slots[0]
    except Exception:
        pass


# ---------------------------------------------------------------- the character (from the idle file)
arm, meshes = import_fbx("Idle")
arm.name = "schoolboy"
body = meshes[0]
for m in meshes[1:]:
    bpy.data.objects.remove(m)
body.name = "body"
actions = {"idle": arm.animation_data.action}
for name, fn in CLIPS[1:]:
    a2, m2 = import_fbx(fn)
    actions[name] = a2.animation_data.action
    a2.animation_data.action = None
    for o in m2 + [a2]:
        bpy.data.objects.remove(o)
for name, a in actions.items():
    a.name = name
    a.use_fake_user = True
print("actions", {n: tuple(a.frame_range) for n, a in actions.items()})


def fcurves(action):
    out = []
    for layer in action.layers:
        for strip in layer.strips:
            for cb in strip.channelbags:
                out += [(cb, f) for f in cb.fcurves]
    return out


# the object's own motion into the hips: record the hips' world position with it, drop it, re-key
for name, a in actions.items():
    use_action(arm, a)
    f0, f1 = int(a.frame_range[0]), int(a.frame_range[1])
    pb = arm.pose.bones["mixamorig:Hips"]
    rec = []
    for f in range(f0, f1 + 1):
        sc.frame_set(f)
        rec.append((f, pb.matrix.copy(), (arm.matrix_world @ pb.matrix).translation.copy()))
    for cb, fc in fcurves(a):
        if not fc.data_path.startswith("pose.bones"):
            cb.fcurves.remove(fc)
    arm.location = (0, 0, 0); arm.rotation_euler = (0, 0, 0); arm.scale = (1, 1, 1)
    bpy.context.view_layer.update()
    Mi = arm.matrix_world.inverted()
    for f, m, p in rec:
        sc.frame_set(f)
        n = m.copy()
        n.translation = Mi @ p
        pb.matrix = n
        bpy.context.view_layer.update()
        pb.keyframe_insert("location", frame=f)

# the soles at 0: the armature raised by the lowest point of the mesh standing (idle, first frame)
use_action(arm, actions["idle"])
sc.frame_set(int(actions["idle"].frame_range[0]))
bpy.context.view_layer.update()
dg = bpy.context.evaluated_depsgraph_get()
ev = body.evaluated_get(dg)
low = min((body.matrix_world @ v.co).z for v in ev.data.vertices)
arm.location.z -= low
bpy.context.view_layer.update()
print("raised by", round(-low, 4))


# ---------------------------------------------------------------- root motion
def toes_z():
    W = arm.matrix_world
    return min((W @ arm.pose.bones[b].head).z for b in TOES)


def record(action):
    use_action(arm, action)
    f0, f1 = int(action.frame_range[0]), int(action.frame_range[1])
    pb = arm.pose.bones[HIPS]
    rec = []
    for f in range(f0, f1 + 1):
        sc.frame_set(f)
        rec.append((f, pb.matrix.copy(), (arm.matrix_world @ pb.matrix).translation.copy(), toes_z()))
    return rec


def rekey(action, rec, new_world):
    use_action(arm, action)
    pb = arm.pose.bones[HIPS]
    Mi = arm.matrix_world.inverted()
    for (f, m, p, _), q in zip(rec, new_world):
        sc.frame_set(f)
        n = m.copy()
        n.translation = Mi @ q
        pb.matrix = n
        bpy.context.view_layer.update()
        pb.keyframe_insert("location", frame=f)


def in_place(rec):
    p0, p1 = rec[0][2], rec[-1][2]
    n = len(rec) - 1
    return [Vector((p.x - (p1 - p0).x * i / n, p.y - (p1 - p0).y * i / n, p.z)) for i, (f, m, p, t) in enumerate(rec)]


def unlifted(rec, pts):
    """the height the feet rise above the ground taken off (a jump in place: the physics lifts it)"""
    return [Vector((q.x, q.y, q.z - max(0.0, t - g0 - 0.006))) for (f, m, p, t), q in zip(rec, pts)]


def air_frames(rec):
    """take-off and landing: the longest stretch with both feet well off the ground (a running jump's
    run has short flights of its own)"""
    g = min(t for *_, t in rec)
    best, cur = None, None
    for f, m, p, t in rec:
        if t > g + 0.05:
            cur = (cur[0], f) if cur else (f, f)
            if not best or cur[1] - cur[0] > best[1] - best[0]:
                best = cur
        else:
            cur = None
    return (best[0], best[1] + 1) if best else (None, None)


def stride(action):
    """metres per cycle of a walk or run played in place: how fast the planted foot slides back under
    the body, times the cycle's length"""
    use_action(arm, action)
    f0, f1 = int(action.frame_range[0]), int(action.frame_range[1])
    W = arm.matrix_world
    P = []
    for f in range(f0, f1 + 1):
        sc.frame_set(f)
        P.append([(W @ arm.pose.bones[b].head).copy() for b in TOES])
    g = min(min(q.z for q in fr) for fr in P)
    v = []
    for k in range(1, len(P)):
        for s in (0, 1):
            a, b = P[k - 1][s], P[k][s]
            if a.z < g + 0.02 and b.z < g + 0.02:
                v.append(Vector((b.x - a.x, b.y - a.y)).length)
    return float(np.median(v)) * (f1 - f0) if v else 0.0


travel = {}
for name in ("walk", "run", "skip", "chase"):
    a = actions[name]
    travel[name] = {"metres": round(stride(a), 4), "seconds": round((a.frame_range[1] - a.frame_range[0]) / 30, 4)}
rec = record(actions["push"])
rekey(actions["push"], rec, in_place(rec))
air = {}
for name in ("jump", "rjump", "fall"):
    rec = record(actions[name])
    g0 = 0.0 if name == "fall" else min(t for *_, t in rec)
    air[name] = air_frames(rec)
    pts = [p for f, m, p, t in rec]
    if name == "rjump":
        pts = in_place(rec)
    rekey(actions[name], rec, unlifted(rec, pts))
rec = record(actions["land"])
g0 = min(t for *_, t in rec)
touch = next(f for f, m, p, t in rec if t < g0 + 0.02)
use_action(arm, actions["idle"])
print("travel", travel, "air", air, "landing touchdown", touch)

# ---------------------------------------------------------------- his own body, when there is one: the cartoon
# of him made by Aholo's Lux3D (assets/src/aholo/schoolboy_cartoon_3d*, tools/aholo.py: his picture redrawn
# over a render of this model at rest, tools/silhouette_check.py: it stands as this one does), on this
# armature with this body's weights (tools/blender/rebody.py): the clips as they are
import sys as _sys, importlib
_sys.path.insert(0, os.path.dirname(__file__))
AHOLO = os.path.join(ROOT, "assets", "src", "aholo")
cglbs = sorted((os.path.join(AHOLO, d, f) for d in (os.listdir(AHOLO) if os.path.isdir(AHOLO) else [])
                if d.startswith("schoolboy_cartoon_3d") for f in os.listdir(os.path.join(AHOLO, d)) if f.endswith(".glb")),
               key=os.path.getmtime)        # (the newest of its versions: schoolboy_cartoon_3d, _v2, ...)
NEW_BODY = bool(cglbs)
if NEW_BODY:
    import rebody, hands
    importlib.reload(hands)
    importlib.reload(rebody)
    hands.add_twist_bones(arm, body, actions, print)     # (on the old body: its weights go over to the new one)
    body, new_img = rebody.replace(arm, body, cglbs[-1])

# ---------------------------------------------------------------- the texture, and the painted eyes
img = new_img if NEW_BODY else next(i for i in bpy.data.images if i.size[0] >= 1024)
tex_path = os.path.join(SRC, "texture.png")
if not os.path.exists(tex_path) and not NEW_BODY:
    img.filepath_raw = tex_path
    img.file_format = "PNG"
    img.save()
arm.data.pose_position = "REST"
bpy.context.view_layer.update()
dg = bpy.context.evaluated_depsgraph_get()
bm = bmesh.new()
bm.from_object(body, dg)
bm.transform(body.matrix_world)
bmesh.ops.triangulate(bm, faces=bm.faces)
bm.faces.ensure_lookup_table()
uvl = bm.loops.layers.uv.active
bvh = BVHTree.FromBMesh(bm)
TW, TH = img.size
px = np.empty(TW * TH * 4, np.float32)
img.pixels.foreach_get(px)
px = px.reshape(TH, TW, 4)
head = arm.matrix_world @ arm.data.bones["mixamorig:Head"].head_local
C = 0.0015
xs = np.arange(head.x - 0.07, head.x + 0.07, C)
zs = np.arange(head.z + 0.0, head.z + 0.11, C)
lum = np.full((len(zs), len(xs)), 9.0)
hitp = {}
for i, z in enumerate(zs):
    for j, x in enumerate(xs):
        h = bvh.ray_cast(Vector((x, head.y - 1.0, z)), Vector((0, 1, 0)), 2.0)
        if h[0] is None:
            continue
        t = bm.faces[h[2]]
        a0, b0, c0 = t.loops
        w = geometry.barycentric_transform(h[0], a0.vert.co, b0.vert.co, c0.vert.co,
                                           a0[uvl].uv.to_3d(), b0[uvl].uv.to_3d(), c0[uvl].uv.to_3d())
        c = px[min(TH - 1, int((w.y % 1) * TH)), min(TW - 1, int((w.x % 1) * TW))]
        lum[i, j] = 0.3 * c[0] + 0.59 * c[1] + 0.11 * c[2]
        hitp[(i, j)] = h[0]
# the eyes: the darkest spots on the face below the hair, one each side of the middle
face = lum < 8
skin = np.median(lum[face])
dark = face & (lum < skin * 0.45)
eyes = []
for side in (1, -1):
    m = dark & ((xs[None, :] - head.x) * side > 0.012)
    ii, jj = np.nonzero(m)
    # the lowest dark patch on that side above the nose: the eye (the hair is above, the brows dark-ish)
    best = None
    for z in sorted(set(ii)):
        rows = jj[ii == z]
        if len(rows) >= 3:
            best = z
            break
    sel = (ii >= best) & (ii <= best + 8)
    pts = [hitp[(a, b)] for a, b in zip(ii[sel], jj[sel]) if (a, b) in hitp]
    e = sum(pts, Vector()) / len(pts)
    eyes.append(e)
bm.free()
arm.data.pose_position = "POSE"
Mi = body.matrix_world.inverted()
eyes_glb = [[round((Mi @ e).x, 4), round((Mi @ e).z, 4), round(-(Mi @ e).y, 4)] for e in eyes]   # (glTF: y up)
print("eyes (world)", [tuple(round(v, 3) for v in e) for e in eyes], "glb", eyes_glb)

# ---------------------------------------------------------------- material: the (cleaned) texture
clean = os.path.join(SRC, "texture_clean.png")
timg = img if NEW_BODY else bpy.data.images.load(clean if os.path.exists(clean) else tex_path)
for slot in body.material_slots:
    mat = slot.material
    if mat.name.startswith("Designer_Logic_PBR_hand"):     # (the remade hands keep their own: rebody.new_hands)
        continue
    mat.name = "Designer_Logic_PBR"
    nt = mat.node_tree
    bsdf = next(n for n in nt.nodes if n.type == "BSDF_PRINCIPLED")
    texn = next((n for n in nt.nodes if n.type == "TEX_IMAGE"), None) or nt.nodes.new("ShaderNodeTexImage")
    texn.image = timg
    nt.links.new(texn.outputs["Color"], bsdf.inputs["Base Color"])
    if bsdf.inputs["Metallic"].is_linked:
        nt.links.remove(bsdf.inputs["Metallic"].links[0])
    bsdf.inputs["Metallic"].default_value = 0.0
    if bsdf.inputs["Roughness"].is_linked:
        nt.links.remove(bsdf.inputs["Roughness"].links[0])
    bsdf.inputs["Roughness"].default_value = 0.85
print("triangles", sum(len(p.vertices) - 2 for p in body.data.polygons), "texture", os.path.basename(timg.filepath))

# ---------------------------------------------------------------- a face that moves (tools/blender/face_rig.py):
# the mouth cut along the lips with a jaw and a mouth inside, lids sliding over the painted eyes
import sys as _sys, importlib
_sys.path.insert(0, os.path.dirname(__file__))
import face_rig
importlib.reload(face_rig)
FACE = face_rig.add_face_rig(arm, body, timg, ("painted", eyes), debug=os.path.join(SRC, "face_debug.png"), name="schoolboy")

# ---------------------------------------------------------------- pointing: the raised hand's index straightened
import hands
importlib.reload(hands)
hands.point_index(arm, actions["point"], print)

# ---------------------------------------------------------------- export
for a in list(bpy.data.actions):
    if a not in actions.values():
        bpy.data.actions.remove(a)
arm.animation_data.action = actions["idle"]
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
           "jump": {"takeoff": air["jump"][0], "land": air["jump"][1], "frames": list(actions["jump"].frame_range)},
           "rjump": {"takeoff": air["rjump"][0], "land": air["rjump"][1], "frames": list(actions["rjump"].frame_range)},
           "land": {"touchdown": touch},
           "frames": {n: list(a.frame_range) for n, a in actions.items()},
           "eyes_glb": eyes_glb,
           "face": FACE},
          open(os.path.join(SRC, "clips.json"), "w"), indent=1)
