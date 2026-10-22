"""The children's hands, made along their bones (both builds: tools/blender/character_schoolboy.py through
rebody.replace, and tools/blender/character_mixamo.py).

The models' own hands were mittens -- fingers one lump (the schoolboy's AI model), or fingers fused
round two finger bones (the walker's Mixamo rig: an index and a thumb only) -- torn or stiff when the
clips close a fist or point. Here:

  add_twist_bones   a twist bone along each forearm, taking the hand's twist in every clip (no wrung wrist)
  add_finger_bones  a two-finger rig gets middle, ring and little fingers' bones beside the index's, and
                    in every clip they take the index's turns (the hand closes as before)
  proportion_fingers  the fingers' bones shortened to a child's proportions (kept their directions)
  shorten_palms     the four fingers' bones moved toward the wrist (the schoolboy's rig had a long palm)
  new_hands         each hand cut off 2 cm up the forearm and made anew along its bones -- a palm and
                    wrist (one tube from the cut, joined to it by a strip of faces), four fingers and a
                    thumb (round tubes along their bones, a couple of millimetres apart), each part with
                    its bones' weights; a painted texture: the forearm's skin, the palm's side paler, the
                    creases at the joints and across the palm, the knuckles' wrinkles, the nails, the
                    tips a little pinker, and the shade where fingers and palm hide each other (occlusion
                    from rays, at rest); the forearm's texture faded into the hand's colour over 3 cm
  relax_fingers     a two-finger rig's clips (fingers held straight) given a relaxed curl
  point_index       in the pointing clip, the hand raised highest straightens its index finger as it rises,
                    the others closing
"""
import os
import numpy as np
import bpy, bmesh
from mathutils import Vector, Quaternion
from mathutils.bvhtree import BVHTree

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
TEMPLATE = os.path.join(ROOT, "assets", "src", "hands", "stylized_hand.npz")   # (tools/blender/extract_hand_template.py)
# its face sets: the wrist, its cap, the palm, and each finger's three parts from the knuckle (the thumb's from its root)
SETS = {"wrist": 262, "cap": 287, "palm": 273, "Thumb": (288, 285, 284), "Index": (278, 283, 282),
        "Middle": (277, 279, 272), "Ring": (280, 274, 275), "Pinky": (281, 286, 276)}
T_PALMAR = (0.0, 1.0, 0.0)  # (the template's palm faces +y)
FINGERS = ("Index", "Middle", "Ring", "Pinky")


def _ss(a, b, x):
    t = np.clip((np.asarray(x, float) - a) / (b - a), 0.0, 1.0)
    return t * t * (3 - 2 * t)


def _polar(theta, rad):
    th = np.r_[theta - 2 * np.pi, theta, theta + 2 * np.pi]
    rr = np.r_[rad, rad, rad]
    return lambda q: np.interp(q, th, rr)


def _perp(v, t):
    return (v - t * v.dot(t)).normalized()


def _channelbag(action):
    from bpy_extras import anim_utils
    if not len(action.slots):
        return None
    return anim_utils.action_get_channelbag_for_slot(action, action.slots[0])


# ---------------------------------------------------------------------------- bones
def add_twist_bones(arm, body, actions, log, prefix="mixamorig:"):
    """A twist bone along each forearm. The clips turn the forearm's twist (pronation) onto the hand bone -- the
    walker's hand 33 degrees about the forearm standing, 45 pointing, the schoolboy's 51 waving -- and the skin,
    blending from the forearm to the hand over a few centimetres at the wrist, wrung there into a ring (a
    "candy wrapper"). The twist bone, a copy of the forearm's (its parent), takes in every clip the twist of the
    hand's turn about the forearm (a swing-twist split of each key); the forearm's skin goes over to it from a
    sixth of the way down to the wrist, so the twist spreads along the forearm and wrist and hand differ only
    by the hand's bend."""
    Mw = arm.matrix_world
    vl = bpy.context.view_layer
    prev = vl.objects.active
    vl.objects.active = arm
    arm.select_set(True)
    bpy.ops.object.mode_set(mode="EDIT")
    eb = arm.data.edit_bones
    made = []
    for side in ("Right", "Left"):
        fa, hb = eb.get(prefix + side + "ForeArm"), eb.get(prefix + side + "Hand")
        n = prefix + side + "ForeArmTwist"
        if not fa or not hb or n in eb:
            continue
        t = eb.new(n)
        t.head, t.tail, t.roll = fa.head.copy(), fa.tail.copy(), fa.roll
        t.parent = fa; t.use_connect = False; t.use_deform = True
        made.append(side)
    bpy.ops.object.mode_set(mode="OBJECT")
    vl.objects.active = prev
    B = arm.data.bones
    keyed = 0
    for side in made:
        fa, hb, tb = B[prefix + side + "ForeArm"], B[prefix + side + "Hand"], B[prefix + side + "ForeArmTwist"]
        rel = (fa.matrix_local.inverted() @ hb.matrix_local).to_3x3()
        a_h = (rel.inverted() @ Vector((0, 1, 0))).normalized()        # (the forearm's axis in the hand's frame)
        a_t = (tb.matrix_local.inverted().to_3x3() @ (fa.matrix_local.to_3x3() @ Vector((0, 1, 0)))).normalized()
        for act in actions.values():
            cb = _channelbag(act)
            if cb is None:
                continue
            dp = f'pose.bones["{hb.name}"].rotation_quaternion'
            fcs = [cb.fcurves.find(dp, index=c) for c in range(4)]
            if any(fc is None for fc in fcs):
                continue
            keys = sorted({kp.co.x for fc in fcs for kp in fc.keyframe_points})
            vals = []
            for fr in keys:
                q = Quaternion([fc.evaluate(fr) for fc in fcs]).normalized()
                th = 2 * np.arctan2(Vector(q[1:]).dot(a_h), q[0])
                vals.append(Quaternion(a_t, th))
            tdp = f'pose.bones["{tb.name}"].rotation_quaternion'
            for c in range(4):
                nf = cb.fcurves.find(tdp, index=c) or cb.fcurves.new(tdp, index=c)
                nf.keyframe_points.clear()
                nf.keyframe_points.add(len(keys))
                nf.keyframe_points.foreach_set("co", np.array([(fr, v[c]) for fr, v in zip(keys, vals)], np.float32).ravel())
                nf.keyframe_points.foreach_set("interpolation", np.full(len(keys), 1, np.int32))
                nf.update()
                keyed += 1
        # the forearm's skin: over to the twist bone from a sixth of the way down to the wrist
        E, W_ = np.array(Mw @ fa.head_local), np.array(Mw @ hb.head_local)
        L = np.linalg.norm(W_ - E); ax = (W_ - E) / L
        gf = body.vertex_groups.get(fa.name)
        gt = body.vertex_groups.get(tb.name) or body.vertex_groups.new(name=tb.name)
        if gf is None:
            continue
        Mo = body.matrix_world
        for v in body.data.vertices:
            w = next((e.weight for e in v.groups if e.group == gf.index), 0.0)
            if w <= 0:
                continue
            k = float(_ss(0.17, 0.85, ((np.array(Mo @ v.co) - E) @ ax) / L))
            if k <= 1e-4:
                continue
            gf.add([v.index], w * (1 - k), "REPLACE")
            gt.add([v.index], w * k, "REPLACE")
    log(f"hands: forearm twist bones ({', '.join(s.lower() for s in made)}); {keyed} curves keyed from the hands' twist")


def add_finger_bones(arm, body, actions, log, prefix="mixamorig:"):
    """Middle, ring and little fingers for a rig with an index and a thumb only. In Mixamo's two-finger rig
    the "index" runs down the middle of the four fingers (the mitten the auto-rigger made of them): the
    fingers' width is measured on the mesh just past the knuckles (what goes with the index bones), and
    the four set across it a quarter of it apart -- the index chain itself moved to the thumb's side,
    the new middle, ring and little fingers' chains copies of it (its joints, its roll) beyond, the ring
    and little knuckles a little nearer the wrist, the fingers 1.06 / 0.98 / 0.80 the index's length,
    fanning out a few degrees. In every clip each new bone takes the index bone's keys (they used to move
    with it, being weighted to it)."""
    Mw = arm.matrix_world
    arm.data.pose_position = "REST"
    bpy.context.view_layer.update()
    B = arm.data.bones
    hd = lambda n: Mw @ B[prefix + n].head_local
    plan = {}
    for side in ("Right", "Left"):
        if prefix + f"{side}HandMiddle1" in B or prefix + f"{side}HandIndex1" not in B:
            continue
        chain = [f"{side}HandIndex{i}" for i in (1, 2, 3, 4) if prefix + f"{side}HandIndex{i}" in B]
        W0 = hd(side + "Hand")
        I = [hd(n) for n in chain]
        ax = (I[0] - W0).normalized()
        d1 = (I[1] - I[0]).normalized(); dl = (I[-1] - I[-2]).normalized()
        curl = dl - d1 * dl.dot(d1)
        # the fingers' section just past the knuckles (what goes with the index bones): its widest way is
        # across the hand, its narrowest the palm's side (the index's rest curl alone misled on one hand)
        gi = {g.index for g in body.vertex_groups if g.name.startswith(prefix + side + "HandIndex")}
        P = np.array([tuple(body.matrix_world @ v.co) for v in body.data.vertices
                      if sum(e.weight for e in v.groups if e.group in gi) > 0.5])
        rel = P - np.array(I[0])
        t = rel @ np.array(ax)
        m = (t > 0.004) & (t < 0.03)
        sec = rel[m] - np.outer(t[m], np.array(ax))
        e = np.linalg.svd(sec - sec.mean(0), full_matrices=False)[2]
        across, palmar = Vector(e[0]).normalized(), Vector(e[1]).normalized()
        palmar = _perp(palmar, ax); across = ax.cross(palmar).normalized()
        if palmar.dot(curl) < 0:
            palmar = -palmar
        if (hd(side + "HandThumb1") - W0).dot(across) > 0:
            across = -across                                   # (toward the little finger: away from the thumb)
        c = rel @ np.array(across)
        c_lo, c_hi = (float(x) for x in np.percentile(c[m], [3, 97]))
        s = (c_hi - c_lo) / 4
        plan[side] = (W0, ax, across, palmar, s, chain, c_lo)
    if not plan:
        return []
    vl = bpy.context.view_layer
    prev = vl.objects.active
    vl.objects.active = arm
    arm.select_set(True)
    bpy.ops.object.mode_set(mode="EDIT")
    eb = arm.data.edit_bones
    Mi = Mw.inverted()
    made = []
    for side, (W0, ax, across, palmar, s, chain, c_lo) in plan.items():
        idx = [eb[prefix + n] for n in chain]
        base = Mw @ idx[0].head
        # (the index to the thumb's side of the fingers' width; the others beyond it)
        shift = Mi.to_3x3() @ (across * (c_lo + 0.5 * s))
        for b in idx:
            b.head += shift; b.tail += shift
        base = Mw @ idx[0].head
        for k, (f, L, drop, splay) in enumerate((("Middle", 1.06, 0.002, 2.0), ("Ring", 0.98, -0.003, 5.0),
                                                ("Pinky", 0.80, -0.011, 9.0)), 1):
            K = base + across * (s * k) + ax * drop
            q = Quaternion(palmar, np.radians(splay))
            if (q @ ax).dot(across) < 0:
                q = Quaternion(palmar, -np.radians(splay))   # (fanning toward the little finger)
            parent = eb[prefix + side + "Hand"]
            for i, b in enumerate(idx):
                nb = eb.new(prefix + f"{side}Hand{f}{i + 1}")
                h, tl = Mw @ b.head, Mw @ b.tail
                nb.head = Mi @ (K + q @ ((h - base) * L))
                nb.tail = Mi @ (K + q @ ((tl - base) * L))
                nb.roll = b.roll
                nb.parent = parent
                nb.use_connect = b.use_connect and i > 0
                nb.use_deform = True
                parent = nb
                made.append((b.name, nb.name))
    bpy.ops.object.mode_set(mode="OBJECT")
    vl.objects.active = prev
    # the clips: each new bone the index bone's keys
    keyed = 0
    for a in actions.values():
        cb = _channelbag(a)
        if cb is None:
            continue
        for src, dst in made:
            for fc in [fc for fc in cb.fcurves if fc.data_path.startswith(f'pose.bones["{src}"].')]:
                dp = fc.data_path.replace(f'["{src}"]', f'["{dst}"]')
                if cb.fcurves.find(dp, index=fc.array_index):
                    continue
                nf = cb.fcurves.new(dp, index=fc.array_index)
                n = len(fc.keyframe_points)
                nf.keyframe_points.add(n)
                for attr in ("co", "handle_left", "handle_right"):
                    buf = np.empty(n * 2, np.float32); fc.keyframe_points.foreach_get(attr, buf)
                    nf.keyframe_points.foreach_set(attr, buf)
                buf = np.empty(n, np.int32); fc.keyframe_points.foreach_get("interpolation", buf)
                nf.keyframe_points.foreach_set("interpolation", buf)
                nf.update()
                keyed += 1
    log(f"hands: {len(made)} finger bones added beside the index fingers (knuckles "
        f"{', '.join(f'{p[4] * 100:.1f} cm' for p in plan.values())} apart); {keyed} curves copied into the clips")
    return [d for _, d in made]


def _finger_frame(arm, side, prefix="mixamorig:"):
    """a hand's frame at rest: the wrist, the way to the knuckles, across them (toward the little finger),
    and the palm's side (where the fingers curl; the thumb agrees on both rigs)"""
    Mw = arm.matrix_world
    B = arm.data.bones
    hb = lambda n: Mw @ B[prefix + n].head_local
    fs = [f for f in ("Index", "Middle", "Ring", "Pinky") if prefix + f"{side}Hand{f}1" in B]
    W0 = hb(side + "Hand")
    K = sum((hb(f"{side}Hand{f}1") for f in fs), Vector()) / len(fs)
    ax = (K - W0).normalized()
    across = _perp(hb(f"{side}Hand{fs[-1]}1") - hb(f"{side}Hand{fs[0]}1"), ax)
    curl = Vector()
    for f in fs:
        j1, j2, j3 = (hb(f"{side}Hand{f}{i}") for i in (1, 2, 3))
        d1 = (j2 - j1).normalized(); curl += (j3 - j1) - d1 * (j3 - j1).dot(d1)
    palmar = ax.cross(across)
    if palmar.dot(curl) < 0:
        palmar = -palmar
    return W0, ax, across, palmar, fs


def _flex(arm, name, axis_w, palmar, ang):
    """a turn of the bone `name` (in its own frame) by `ang` about the world axis `axis_w`, the way that brings
    its tip toward the palm"""
    bone = arm.data.bones[name]
    R = (arm.matrix_world @ bone.matrix_local).to_3x3().normalized()
    dirw = (R @ Vector((0, 1, 0))).normalized()
    axis_l = (R.inverted() @ axis_w).normalized()
    q = Quaternion(axis_l, ang)
    if (R @ (q @ Vector((0, 1, 0)))).dot(palmar) < dirw.dot(palmar):
        q = Quaternion(axis_l, -ang)
    return q


def _rekey(cb, name, fn):
    """a bone's rotation keys through fn(frame, quaternion) -> quaternion"""
    dp = f'pose.bones["{name}"].rotation_quaternion'
    fcs = [cb.fcurves.find(dp, index=c) for c in range(4)]
    if any(fc is None for fc in fcs):
        return False
    keys = sorted({kp.co.x for fc in fcs for kp in fc.keyframe_points})
    vals = [fn(fr, Quaternion([fc.evaluate(fr) for fc in fcs]).normalized()) for fr in keys]
    for c, fc in enumerate(fcs):
        fc.keyframe_points.clear()
        fc.keyframe_points.add(len(keys))
        fc.keyframe_points.foreach_set("co", np.array([(fr, v[c]) for fr, v in zip(keys, vals)], np.float32).ravel())
        fc.keyframe_points.foreach_set("interpolation", np.full(len(keys), 1, np.int32))
        fc.update()
    return True


def relax_fingers(arm, actions, log, angles=(18, 28, 18), prefix="mixamorig:"):
    """The fingers given a hand's ease in every clip. The walker's clips held its finger bones nearly
    straight -- its mitten was modelled cupped, the curl in the mesh; the new fingers follow the bones and
    hung stiff: each joint now turned a little more toward the palm (about the knuckles' line) in every
    key, a fist closing a little further, the pointing index straightened after (point_index)."""
    arm.data.pose_position = "REST"
    bpy.context.view_layer.update()
    n = 0
    for side in ("Right", "Left"):
        if prefix + f"{side}HandIndex1" not in arm.data.bones:
            continue
        W0, ax, across, palmar, fs = _finger_frame(arm, side, prefix)
        for f in fs:
            for i, a in zip((1, 2, 3), angles):
                name = prefix + f"{side}Hand{f}{i}"
                C = _flex(arm, name, across, palmar, np.radians(a))
                for act in actions.values():
                    cb = _channelbag(act)
                    if cb is not None and _rekey(cb, name, lambda fr, q, C=C: q @ C):
                        n += 1
    log(f"hands: fingers eased in every clip ({n} joint curves; {', '.join(str(a) for a in angles)} degrees)")


# a child's fingers against the palm (the wrist's joint to the middle knuckle), cartoon-short; their parts' shares
FINGER_LEN = {"Index": 0.76, "Middle": 0.82, "Ring": 0.77, "Pinky": 0.62, "Thumb": 0.92}
PART_SHARE = {"Thumb": (0.40, 0.33, 0.27)}
PART_DEFAULT = (0.45, 0.30, 0.25)


def proportion_fingers(arm, log, prefix="mixamorig:"):
    """The fingers' bones set to a child's proportions. The rigs' finger bones ran as long as the models'
    mittens -- the walker's index 3.8 + 3.3 cm and a tail, 1.7 times its palm; the schoolboy's 1.1 -- and the
    hands made along them had fingers as long as the hand. Each chain keeps its knuckle and its parts'
    directions (the clips turn the bones from these: they play as before); its parts' lengths become
    FINGER_LEN of the palm, shared as PART_SHARE; the third bone's tail is the fingertip (a leaf bone after it
    follows)."""
    vl = bpy.context.view_layer
    prev = vl.objects.active
    vl.objects.active = arm
    arm.select_set(True)
    bpy.ops.object.mode_set(mode="EDIT")
    eb = arm.data.edit_bones
    Mw = arm.matrix_world
    Mi = Mw.inverted()
    W = lambda v: np.array(Mw @ v)
    out = []
    for side in ("Right", "Left"):
        hand, mid = eb.get(prefix + side + "Hand"), eb.get(prefix + side + "HandMiddle1")
        if not hand or not mid:
            continue
        palm = float(np.linalg.norm(W(mid.head) - W(hand.head)))
        for f, k in FINGER_LEN.items():
            ch = [eb.get(prefix + f"{side}Hand{f}{i}") for i in (1, 2, 3)]
            if any(b is None for b in ch):
                continue
            leaf = eb.get(prefix + f"{side}Hand{f}4")
            H = [W(b.head) for b in ch]
            end = W(leaf.head) if leaf else W(ch[2].tail)
            dirs = [H[1] - H[0], H[2] - H[1], end - H[2]]
            dirs = [d / np.linalg.norm(d) for d in dirs]
            L = palm * k
            shares = PART_SHARE.get(f, PART_DEFAULT)
            pts = [H[0]]
            for d, sh in zip(dirs, shares):
                pts.append(pts[-1] + d * L * sh)
            for i, b in enumerate(ch):
                b.use_connect = False
                b.head = Mi @ Vector(pts[i]); b.tail = Mi @ Vector(pts[i + 1])
            if leaf:
                ln = (leaf.tail - leaf.head).length
                leaf.use_connect = False
                leaf.head = Mi @ Vector(pts[3])
                leaf.tail = leaf.head + (Mi.to_3x3() @ Vector(dirs[2])).normalized() * ln
            out.append(f"{side[0]}{f[:2]} {L * 100:.1f}")
    bpy.ops.object.mode_set(mode="OBJECT")
    vl.objects.active = prev
    log(f"hands: fingers set to a child's proportions (cm: {', '.join(out)})")


def shorten_palms(arm, log, by=0.02, prefix="mixamorig:"):
    """The palms shortened: the four fingers' bones (each chain whole) moved `by` toward the wrist along
    the hand (the schoolboy's knuckles sat 7.8 cm from the wrist's joint, a long palm for a child 1.3 m
    tall -- the user: "手掌太长"). The clips turn these bones, they do not move them: they play as before."""
    vl = bpy.context.view_layer
    prev = vl.objects.active
    vl.objects.active = arm
    arm.select_set(True)
    bpy.ops.object.mode_set(mode="EDIT")
    eb = arm.data.edit_bones
    Mw = arm.matrix_world
    Mi3 = Mw.inverted().to_3x3()
    moved = 0
    for side in ("Right", "Left"):
        hand = eb.get(prefix + side + "Hand")
        firsts = [eb[prefix + f"{side}Hand{f}1"] for f in ("Index", "Middle", "Ring", "Pinky") if prefix + f"{side}Hand{f}1" in eb]
        if not hand or not firsts:
            continue
        W0 = Mw @ hand.head
        K = sum((Mw @ b.head for b in firsts), Vector()) / len(firsts)
        d = Mi3 @ (-(K - W0).normalized() * by)
        for b in firsts:
            b.use_connect = False
            for c in [b] + list(b.children_recursive):
                c.head += d; c.tail += d
                moved += 1
    bpy.ops.object.mode_set(mode="OBJECT")
    vl.objects.active = prev
    log(f"hands: palms shortened by {by * 100:.1f} cm ({moved} finger bones moved toward the wrists)")


def _thumb_over(arm, side, closed, palmar, prefix="mixamorig:"):
    """the thumb's joints folding it over the curled middle finger, as a hand points: at rest, the other fingers
    in their closed turns, an IK chain of the thumb's three bones reaching for the back of the middle finger's
    middle part (a finger's thickness out from it); its local turns read back"""
    sc = bpy.context.scene
    ad = arm.animation_data
    keep = ad.action if ad else None
    if ad:
        ad.action = None
    vl = bpy.context.view_layer
    prev = vl.objects.active
    vl.objects.active = arm
    arm.data.pose_position = "POSE"
    for pb in arm.pose.bones:
        pb.rotation_mode = "QUATERNION"; pb.rotation_quaternion = (1, 0, 0, 0); pb.location = (0, 0, 0); pb.scale = (1, 1, 1)
    for n_, q in closed.items():
        arm.pose.bones[n_].rotation_quaternion = q
    vl.update()
    Mw = arm.matrix_world
    m2 = arm.pose.bones[prefix + side + "HandMiddle2"]
    a_, b_ = Mw @ m2.head, Mw @ m2.tail
    i1 = arm.pose.bones[prefix + side + "HandIndex1"]
    r = 0.42 * ((Mw @ arm.pose.bones[prefix + side + "HandRing1"].head) - (Mw @ i1.head)).length / 2
    goal = a_.lerp(b_, 0.5) + palmar * r * 1.6          # (on the palm's side of the curled finger: the thumb over it)
    goal = goal + ((Mw @ i1.head) - (Mw @ arm.pose.bones[prefix + side + "HandRing1"].head)).normalized() * r * 0.8
    emp = bpy.data.objects.new("thumb_goal", None); emp.location = goal
    bpy.context.scene.collection.objects.link(emp)
    t3 = arm.pose.bones[prefix + side + "HandThumb3"]
    c = t3.constraints.new("IK"); c.target = emp; c.chain_count = 3; c.iterations = 500; c.use_tail = True
    vl.update()
    out = {}
    for i in (1, 2, 3):
        pb = arm.pose.bones[prefix + f"{side}HandThumb{i}"]
        m = arm.convert_space(pose_bone=pb, matrix=pb.matrix, from_space="POSE", to_space="LOCAL")
        out[pb.name] = m.to_quaternion()
    t3.constraints.remove(c)
    bpy.data.objects.remove(emp)
    for pb in arm.pose.bones:
        pb.rotation_quaternion = (1, 0, 0, 0)
    if ad:
        ad.action = keep
        try:
            ad.action_slot = ad.action_suitable_slots[0]
        except Exception:
            pass
    vl.objects.active = prev
    return out


def point_index(arm, action, log, prefix="mixamorig:"):
    """In the pointing clip the hand raised highest points: as it rises its index straightens (each joint
    turned toward its rest -- straight -- by how far the hand is up between its lowest and its highest)
    and the other fingers close (where the clip held them straighter: the walker's half-open hand), the
    thumb folding a little; all back as the hand comes down."""
    sc = bpy.context.scene
    ad = arm.animation_data
    keep = ad.action
    ad.action = action
    try:
        ad.action_slot = ad.action_suitable_slots[0]
    except Exception:
        pass
    arm.data.pose_position = "POSE"
    f0, f1 = int(action.frame_range[0]), int(action.frame_range[1])
    frames = list(range(f0, f1 + 1))
    H = {"Right": [], "Left": []}
    for f in frames:
        sc.frame_set(f)
        for side in H:
            H[side].append((arm.matrix_world @ arm.pose.bones[prefix + side + "Hand"].head).z)
    side = max(H, key=lambda s: max(H[s]))
    h = np.array(H[side])
    lo, hi = float(h.min()), float(h.max())
    w = _ss(lo + 0.3 * (hi - lo), lo + 0.75 * (hi - lo), h)
    cb = _channelbag(action)
    done = 0
    # the other fingers closed (the walker's clip held its hand half open, its fingers straight out) -- each joint
    # turned about the knuckles' line toward the palm -- and the thumb folded over the middle finger
    if prefix + f"{side}HandMiddle1" in arm.data.bones:
        W0, ax, across, palmar, fs = _finger_frame(arm, side, prefix)
        targets = {prefix + f"{side}Hand{f}{i}": _flex(arm, prefix + f"{side}Hand{f}{i}", across, palmar, np.radians(a))
                   for f in fs if f != "Index" for i, a in ((1, 68), (2, 88), (3, 58))}
        targets.update(_thumb_over(arm, side, targets, palmar, prefix))
        for n_, q in targets.items():
            _rekey(cb, n_, lambda fr, q0, q=q: q0.slerp(q, float(np.interp(fr, frames, w))))
    # the index straight: each part turned to lie along the one before it, the first along the palm (wrist to
    # knuckles) -- its rest is no straight finger (the walker's bent 45 and 30 degrees: "straightened" to it, it
    # pointed crooked); held 4 degrees short at each joint, a finger at ease
    B = arm.data.bones
    R = lambda n: B[prefix + n].matrix_local.to_3x3()
    Wh = B[prefix + side + "Hand"].head_local
    K = sum((B[prefix + f"{side}Hand{f}1"].head_local for f in FINGERS if prefix + f"{side}Hand{f}1" in B), Vector()) / 4
    prev_dir = (K - Wh).normalized()
    for i in (1, 2, 3):
        n_ = f"{side}HandIndex{i}"
        if prefix + n_ not in B:
            continue
        q = Vector((0, 1, 0)).rotation_difference((R(n_).inverted() @ prev_dir).normalized())
        q = Quaternion((1, 0, 0, 0)).slerp(q, 0.93)
        prev_dir = R(n_) @ (q @ Vector((0, 1, 0)))
        if _rekey(cb, prefix + n_, lambda fr, q0, q=q: q0.slerp(q, float(np.interp(fr, frames, w)))):
            done += 1
    ad.action = keep
    try:
        ad.action_slot = ad.action_suitable_slots[0]
    except Exception:
        pass
    log(f"hands: pointing -- the {side.lower()} index straightened in '{action.name}' ({done} joints; "
        f"fully from {int(np.argmax(w > 0.99)) + f0 if (w > 0.99).any() else '-'})")
    return side


# ---------------------------------------------------------------------------- the hands
def _template(levels=2):
    """the template hand, subdivided: a mesh with its UVs and its face sets ("fs")"""
    d = np.load(TEMPLATE)
    co, loops, lens, uv, fs = d["co"], d["loops"], d["lens"], d["uv"], d["fs"]
    starts = np.r_[0, np.cumsum(lens)[:-1]]
    me = bpy.data.meshes.new("hand_tpl")
    me.from_pydata(co.tolist(), [], [loops[s:s + n].tolist() for s, n in zip(starts, lens)])
    me.update()
    me.uv_layers.new(name="UVMap").data.foreach_set("uv", uv.ravel())
    me.attributes.new("fs", "INT", "FACE").data.foreach_set("value", fs)
    ob = bpy.data.objects.new("hand_tpl", me)
    bpy.context.scene.collection.objects.link(ob)
    m = ob.modifiers.new("sub", "SUBSURF"); m.levels = m.render_levels = levels
    dg = bpy.context.evaluated_depsgraph_get()
    me2 = bpy.data.meshes.new_from_object(ob.evaluated_get(dg))
    bpy.data.objects.remove(ob); bpy.data.meshes.remove(me)
    return me2


def _template_data(me):
    """the template's joints and, for each vertex, what it belongs to: set membership, the chain it is on, its
    place along it (0 at the knuckle -- the thumb's root -- 1 at the tip), its occlusion"""
    nV = len(me.vertices)
    V = np.empty(nV * 3); me.vertices.foreach_get("co", V); V = V.reshape(-1, 3)
    N = np.empty(nV * 3); me.vertices.foreach_get("normal", N); N = N.reshape(-1, 3)
    fs = np.empty(len(me.polygons), np.int32); me.attributes["fs"].data.foreach_get("value", fs)
    vsets = {}
    for p in me.polygons:
        for vi in p.vertices:
            vsets.setdefault(int(fs[p.index]), set()).add(vi)
    ring = lambda a, b: V[sorted(vsets[a] & vsets[b])].mean(0)
    J = {"W": ring(SETS["wrist"], SETS["palm"])}
    chains = {}
    for f in FINGERS + ("Thumb",):
        s0, s1, s2 = SETS[f]
        if f == "Thumb":
            M_, I_ = ring(s0, s1), ring(s1, s2)
            P0 = V[sorted(vsets[s0])]
            dm = (M_ - P0.mean(0)); dm /= np.linalg.norm(dm)
            base = M_ - dm * 0.8 * float(((M_ - P0) @ dm).max())
            j = [base, M_, I_]
        else:
            j = [ring(SETS["palm"], s0), ring(s0, s1), ring(s1, s2)]
        P2 = V[sorted(vsets[s2])]
        d3 = j[2] - j[1]; d3 /= np.linalg.norm(d3)
        tip = j[2] + d3 * float(((P2 - j[2]) @ d3).max())
        chains[f] = np.array(j + [tip])
    # each vertex: its chain (by its faces' sets), the place along it
    owner = np.full(nV, -1)
    names = FINGERS + ("Thumb",)
    for k, f in enumerate(names):
        for s in SETS[f]:
            owner[sorted(vsets[s])] = k
    s_rel = np.zeros(nV); seg = np.zeros(nV, int)
    for k, f in enumerate(names):
        pts = chains[f]
        L = np.r_[0, np.cumsum(np.linalg.norm(np.diff(pts, axis=0), axis=1))]
        idx = np.nonzero(owner == k)[0]
        best = np.full(len(idx), np.inf); sv = np.zeros(len(idx)); sg = np.zeros(len(idx), int)
        for i in range(3):
            a, b = pts[i], pts[i + 1]; ab = b - a; l2 = ab @ ab
            t = np.clip(((V[idx] - a) @ ab) / l2, 0, 1)
            dd = np.linalg.norm(V[idx] - (a + np.outer(t, ab)), axis=1)
            m = dd < best
            best[m] = dd[m]; sv[m] = (L[i] + t * np.sqrt(l2))[m] / L[-1]; sg[m] = i
        s_rel[idx] = sv; seg[idx] = sg
    # occlusion: rays over each vertex's hemisphere (2 cm), the template alone
    bm = bmesh.new(); bm.from_mesh(me); bvh = BVHTree.FromBMesh(bm); bm.free()
    rng = np.random.default_rng(3)
    dirs = rng.normal(size=(24, 3)); dirs /= np.linalg.norm(dirs, axis=1)[:, None]
    ao = np.ones(nV)
    for i in range(nV):
        n = Vector(N[i]); hit = 0
        for d in dirs:
            dv = Vector(d)
            if dv.dot(n) < 0:
                dv = -dv
            dv = (dv + n).normalized()
            hit += bvh.ray_cast(Vector(V[i]) + n * 0.0005, dv, 0.02)[0] is not None
        ao[i] = 1 - hit / len(dirs)
    vJ = {f: (np.r_[0, np.cumsum(np.linalg.norm(np.diff(chains[f], axis=0), axis=1))] /
              np.linalg.norm(np.diff(chains[f], axis=0), axis=1).sum()) for f in names}
    return dict(V=V, N=N, fs=fs, vsets=vsets, J=J, chains=chains, owner=owner, s_rel=s_rel, seg=seg, ao=ao, vJ=vJ)


def _frame(d, p_ref, c_ref):
    """an orthonormal frame [d, p, c] (columns): d along, p toward p_ref, c toward c_ref (not forced right-handed:
    a mirrored hand maps through it)"""
    d = d / np.linalg.norm(d)
    p = p_ref - d * (p_ref @ d); p /= np.linalg.norm(p)
    c = c_ref - d * (c_ref @ d) - p * (c_ref @ p); c /= np.linalg.norm(c)
    return np.c_[d, p, c]


def new_hands(ob, arm, img, log, prefix="mixamorig:"):
    """Each hand cut off 2.2 cm up the forearm and replaced by the template hand (Blender Studio's stylized
    hand, CC0: assets/src/hands) fitted to its bones -- its palm by the wrist and the knuckles (an affine fit,
    its thickness by the palm's width), each finger's three parts and the thumb's by their bones (each part
    turned onto its bone, stretched to its length), the parts' weights spread a little over the surface so
    they blend; the wrist eased into the forearm's own outline and joined to the cut by a strip of faces;
    each part going with its bone (the same sets, spread less); a painted texture (skin from the forearm,
    paler palm, creases, nails, the tips flushed, the occlusion), the forearm faded into it."""
    from rebody import _uv_tris, _raster
    me = ob.data
    Mw, Mo = arm.matrix_world, ob.matrix_world
    Mi = Mo.inverted(); Mi3 = Mi.to_3x3()
    unit = (Mi3 @ Vector((1, 0, 0))).length
    B = arm.data.bones
    has = lambda n: (prefix + n) in B
    hd = lambda n: np.array(Mw @ B[prefix + n].head_local)
    tl = lambda n: np.array(Mw @ B[prefix + n].tail_local)
    TW, TH = img.size
    tpx = np.empty(TW * TH * 4, np.float32); img.pixels.foreach_get(tpx); tpx = tpx.reshape(TH, TW, 4)
    tme = _template()
    T = _template_data(tme)
    Vt, chains, J = T["V"], T["chains"], T["J"]
    names = FINGERS + ("Thumb",)
    # (the template's frame: to the knuckles, across them toward the little finger, the palm's side +y)
    Kt = np.array([chains[f][0] for f in FINGERS])
    ax_t = Kt.mean(0) - J["W"]; ax_t /= np.linalg.norm(ax_t)
    across_t = Kt[-1] - Kt[0]; across_t -= ax_t * (across_t @ ax_t)
    pal_t = np.array(T_PALMAR, float)
    for side in ("Right", "Left"):
        for f in names:
            for i in (1, 2, 3):
                n = prefix + f"{side}Hand{f}{i}"
                if n in B and n not in ob.vertex_groups:
                    ob.vertex_groups.new(name=n)
    gi = {g.name: g.index for g in ob.vertex_groups}
    bm = bmesh.new(); bm.from_mesh(me)
    dl = bm.verts.layers.deform.verify()
    uvl = bm.loops.layers.uv.active
    W = lambda p: Mo @ p
    mat = bpy.data.materials.new("Designer_Logic_PBR_hand")
    me.materials.append(mat)
    mi_hand = len(me.materials) - 1
    report, cuts, skin_samples = [], [], []
    for side in ("Right", "Left"):
        if not has(side + "Hand") or not all(has(f"{side}Hand{f}1") for f in FINGERS):
            continue
        W0 = hd(side + "Hand")
        fa = W0 - hd(side + "ForeArm"); fa /= np.linalg.norm(fa)
        _, _, across_v, palmar_v, _ = _finger_frame(arm, side, prefix)
        across, palmar = np.array(across_v), np.array(palmar_v)
        tgt = {}
        for f in names:
            js = [hd(f"{side}Hand{f}{i}") for i in (1, 2, 3)]
            tgt[f] = np.array(js + [tl(f"{side}Hand{f}3")])                    # (its tail the fingertip: proportion_fingers)
        K = np.array([tgt[f][0] for f in FINGERS])
        s_n = np.linalg.norm(K[-1] - K[0]) / np.linalg.norm(Kt[-1] - Kt[0])     # (thickness: by the palm's width)
        # the palm: an affine fit (the wrist, the knuckles, a point above each on the palm's side)
        src = [J["W"]] + list(Kt) + [J["W"] + pal_t * 0.02, Kt.mean(0) + pal_t * 0.02]
        dst = [W0] + list(K) + [W0 + palmar * 0.02 * s_n, K.mean(0) + palmar * 0.02 * s_n]
        Xs = np.c_[np.array(src), np.ones(len(src))]
        Apal = np.linalg.lstsq(Xs, np.array(dst), rcond=None)[0]               # (4 x 3: x' = [x 1] @ A)
        tfs = [lambda X, A=Apal: np.c_[X, np.ones(len(X))] @ A]
        mirror = (np.linalg.det(Apal[:3]) < 0) != (Mi3.determinant() < 0)     # (the fit or the mesh's own frame a mirror)
        for f in names:
            ct, cg = chains[f], tgt[f]
            for i in range(3):
                Ft = _frame(ct[i + 1] - ct[i], pal_t, across_t)
                Fg = _frame(cg[i + 1] - cg[i], palmar, across)
                s_d = np.linalg.norm(cg[i + 1] - cg[i]) / np.linalg.norm(ct[i + 1] - ct[i])
                M = Fg @ np.diag([s_d, s_n, s_n]) @ Ft.T
                tfs.append(lambda X, M=M, a_t=ct[i], a=cg[i]: a + (X - a_t) @ M.T)
        # the parts' weights: one each by face set, spread over the surface (to blend the fit; less, the bones)
        nV = len(Vt)
        one = np.zeros((nV, len(tfs)))
        bone_of = [prefix + side + "Hand"]
        for k, f in enumerate(names):
            for i in range(3):
                bone_of.append(prefix + f"{side}Hand{f}{i + 1}")
        set_to_t = {SETS["wrist"]: 0, SETS["cap"]: 0, SETS["palm"]: 0}
        for k, f in enumerate(names):
            for i, s in enumerate(SETS[f]):
                set_to_t[s] = 1 + 3 * k + i
        for p in tme.polygons:
            t = set_to_t[int(T["fs"][p.index])]
            for vi in p.vertices:
                one[vi, t] += 1
        one /= one.sum(1, keepdims=True)
        E = np.empty(len(tme.edges) * 2, np.int64); tme.edges.foreach_get("vertices", E); E = E.reshape(-1, 2)
        deg = np.bincount(E.ravel(), minlength=nV).astype(float)

        def spread(Wt, n):
            for _ in range(n):
                acc = np.zeros_like(Wt)
                np.add.at(acc, E[:, 0], Wt[E[:, 1]]); np.add.at(acc, E[:, 1], Wt[E[:, 0]])
                Wt = 0.5 * Wt + 0.5 * acc / np.maximum(deg, 1)[:, None]
            return Wt
        Wfit = spread(one, 12)
        X = np.zeros((nV, 3))
        for j, tf in enumerate(tfs):
            X += Wfit[:, j:j + 1] * tf(Vt)
        Wbone = spread(one, 3)
        # ---- the forearm cut: 2.2 cm up from the wrist, or above a groove the model's forearm has there (the
        # walker's, at 2.8 cm: left below the cut it read as the edge of a cuff)
        u_P = across - fa * (across @ fa); u_P /= np.linalg.norm(u_P); w_P = np.cross(fa, u_P)
        fav = Vector(fa)
        Vb = np.array([tuple(W(v.co)) for v in bm.verts])
        db = (Vb - W0) @ fa; rb = np.linalg.norm((Vb - W0) - np.outer(db, fa), axis=1)
        prof = []
        for a0 in np.arange(-0.07, 0.0001, 0.0025):
            m = (np.abs(db - a0) < 0.0012) & (rb < 0.07)
            prof.append((a0, float(np.percentile(rb[m], 95)) if m.sum() > 5 else np.nan))
        pa = np.array([a for a, _ in prof]); pr = np.array([r for _, r in prof])
        cut_d = 0.022
        dips = np.zeros(len(pr), bool)
        for i in range(len(pr)):
            nb = pr[max(0, i - 4):i + 5]; nb = nb[~np.isnan(nb)]
            if not np.isnan(pr[i]) and len(nb) > 2 and pr[i] < 0.94 * np.median(nb):
                dips[i] = True
                if -0.045 < pa[i] < -0.015:
                    cut_d = max(cut_d, min(0.04, -pa[i] + 0.008))
        ok_ = ~np.isnan(pr) & ~dips & (pa > -0.06)                             # (the forearm's taper: a straight fit,
        k1, k0 = np.polyfit(pa[ok_], pr[ok_], 1)                               # its grooves and ripples left out)
        r_of = lambda d: k0 + k1 * np.asarray(d)
        P = W0 - fa * cut_d
        Pc = P + fa * 0.004
        Pv = Vector(P)
        loc = lambda p: (W(p) - Pv)
        axial = lambda p: loc(p).dot(fav)
        radial = lambda p: (loc(p) - fav * loc(p).dot(fav)).length
        handw = [gi[n] for n in gi if n in (prefix + side + "ForeArm", prefix + side + "ForeArmTwist")
                 or n.startswith(prefix + side + "Hand")]
        wsum = lambda v: sum(v[dl].get(g, 0.0) for g in handw)
        bm.verts.ensure_lookup_table()
        weld = [v for v in bm.verts if abs(axial(v.co)) < 0.045 and radial(v.co) < 0.08 and wsum(v) > 0.3]
        bmesh.ops.remove_doubles(bm, verts=weld, dist=2e-5 * unit)
        near = [f for f in bm.faces if all(abs(axial(v.co)) < 0.03 and radial(v.co) < 0.07 and wsum(v) > 0.5 for v in f.verts)]
        geom = list({e for f in near for e in f.edges}) + near + list({v for f in near for v in f.verts})
        bmesh.ops.bisect_plane(bm, geom=geom, dist=1e-6 * unit, plane_co=Mi @ Pv, plane_no=(Mi3 @ fav).normalized())
        gone = [v for v in bm.verts if axial(v.co) > 1e-5 and (W(v.co) - Vector(W0)).length < 0.22 and wsum(v) > 0.5]
        for f in bm.faces:
            if f.material_index == 0 and all(-0.03 < axial(v.co) < 0 and radial(v.co) < 0.07 and wsum(v) > 0.5 for v in f.verts):
                uv = sum((lp[uvl].uv for lp in f.loops), Vector((0, 0))) / len(f.loops)
                skin_samples.append(tpx[min(TH - 1, int((uv.y % 1) * TH)), min(TW - 1, int((uv.x % 1) * TW)), :3])
        bmesh.ops.delete(bm, geom=gone, context="VERTS")
        bnd = [e for e in bm.edges if e.is_boundary and all(abs(axial(v.co)) < 2e-5 and radial(v.co) < 0.07 for v in e.verts)]
        ringA = _longest_loop(bnd, lambda v: radial(v.co))
        cA = np.mean([np.array(W(v.co)) for v in ringA], 0)
        rel = lambda x: (x - cA) - np.outer((x - cA) @ fa, fa) if x.ndim == 2 else (x - cA) - fa * ((x - cA) @ fa)
        angA = np.array([np.arctan2(rel(np.array(W(v.co))) @ w_P, rel(np.array(W(v.co))) @ u_P) for v in ringA])
        radA = np.array([np.linalg.norm(rel(np.array(W(v.co)))) for v in ringA])
        o = np.argsort(angA); angA, radA, ringA = angA[o], radA[o], [ringA[i] for i in o]
        rA = _polar(angA, radA)
        # the template's wrist reaching past the cut (stretched along the forearm if short of it)
        up = (W0 - X) @ fa
        need = cut_d - 0.004 + 0.012
        if up.max() < need:
            k_ = np.clip(up / max(1e-6, up.max()), 0, 1)
            X -= np.outer(k_ * (need - up.max()), fa)
        # the template's wrist eased into the forearm's outline over the 2 cm next to the cut
        ax_c = (X - Pc) @ fa                                                   # (toward the hand: +)
        R_ = rel(X)
        rr = np.linalg.norm(R_, axis=1)
        th = np.arctan2(R_ @ w_P, R_ @ u_P)
        # (from the cut to the wrist's joint the forearm's own outline, tapering as the model's did; past the joint, over 1.2 cm,
        # the template's palm taking over: no ring of its own wrist -- it swelled, then pinched at the joint)
        rf = rA(th)
        dj = float((W0 - Pc) @ fa)
        d_ = ax_c - dj                                                         # (from the wrist's joint: + toward the hand)
        target = rf * r_of(np.minimum(d_, 0.0)) / r_of(-cut_d + 0.004)
        k_ = 1 - _ss(dj, dj + 0.012, ax_c)
        new_r = rr + (target - rr) * k_
        X = X + R_ / np.maximum(rr, 1e-9)[:, None] * (new_r - rr)[:, None]
        # ---- the template into the body's mesh
        tverts = [bm.verts.new(Mi @ Vector(x)) for x in X]
        uvt = np.empty(len(tme.loops) * 2); tme.uv_layers["UVMap"].data.foreach_get("uv", uvt); uvt = uvt.reshape(-1, 2)
        tfaces = []
        for p in tme.polygons:
            vs = [tverts[i] for i in p.vertices]; lis = list(p.loop_indices)
            if mirror:
                vs, lis = vs[::-1], lis[::-1]
            try:
                f = bm.faces.new(vs)
            except ValueError:
                continue
            for lp, li in zip(f.loops, lis):
                lp[uvl].uv = uvt[li]
            f.material_index = mi_hand; f.smooth = True
            tfaces.append(f)
        g_arm = gi.get(prefix + side + "ForeArmTwist", gi[prefix + side + "ForeArm"])
        for i, v in enumerate(tverts):
            w = Wbone[i]
            ax_w = (np.array(W0) - X[i]) @ fa                                  # (up the forearm from the wrist: +)
            wf = float(1 - _ss(-0.010, 0.016, -ax_w))                          # (the forearm's share before the wrist)
            for j, x in enumerate(w):
                if x * (1 - wf) > 1e-4:
                    g = gi[bone_of[j]]
                    v[dl][g] = v[dl].get(g, 0.0) + float(x * (1 - wf))
            if wf > 1e-4:
                v[dl][g_arm] = float(wf)
        # the template cut at Pc (its forearm side removed), then joined to the forearm's cut
        tset = set(tverts)
        geom = list({e for f in tfaces for e in f.edges}) + tfaces + list(tset)
        bmesh.ops.bisect_plane(bm, geom=geom, dist=1e-6 * unit, plane_co=Mi @ Vector(Pc), plane_no=(Mi3 @ fav).normalized(),
                               clear_inner=True)
        bm.verts.ensure_lookup_table()
        tb = [e for e in bm.edges if e.is_boundary and e.link_faces and e.link_faces[0].material_index == mi_hand
              and all(abs(axial(v.co) - 0.004) < 2e-5 for v in e.verts)]
        ringB = _longest_loop(tb, lambda v: 1.0)
        angB = np.array([np.arctan2(rel(np.array(W(v.co))) @ w_P, rel(np.array(W(v.co))) @ u_P) for v in ringB])
        o = np.argsort(angB); angB, ringB = angB[o], [ringB[i] for i in o]
        uvB = {}
        for v in ringB:
            for lp in v.link_loops:
                uvB[v] = lp[uvl].uv.copy(); break
        _zip2(bm, uvl, Mi, ringA, angA, ringB, angB, uvB, Vector(cA), fav, mi_hand)
        # (one weighting across the join, forearm and hand alike, by the distance past the wrist's joint: the hand's
        # share from 0 at 3.5 cm before it to 1 at 0.8 cm past it -- the forearm's own vertices by the cut had kept a
        # share of the hand, the new ones none: turning the hand opened a ridge between them)
        g_fore = g_arm
        hand_g = {gi[n] for n in gi if n.startswith(prefix + side + "Hand")}
        W0v = Vector(W0)
        for v in bm.verts:
            if radial(v.co) > 0.08:
                continue
            d = (W(v.co) - W0v).dot(fav)
            if not (-0.05 < d < 0.009):
                continue
            is_t = v in tset
            if not is_t and wsum(v) < 0.3:
                continue
            h = float(_ss(-0.035, 0.008, d))
            dv = v[dl]
            hand_w = {g: x for g, x in dv.items() if g in hand_g}
            rest_w = {g: x for g, x in dv.items() if g not in hand_g}
            if is_t or not rest_w:
                rest_w = {g_fore: 1.0}
            hs, rs = sum(hand_w.values()), sum(rest_w.values())
            if hs < 1e-6:
                hand_w, hs = {gi[prefix + side + "Hand"]: 1.0}, 1.0
            for g in list(dv.keys()):
                del dv[g]
            for g, x in rest_w.items():
                if x * (1 - h) / rs > 1e-4:
                    dv[g] = x * (1 - h) / rs
            for g, x in hand_w.items():
                if x * h / hs > 1e-4:
                    dv[g] = dv.get(g, 0.0) + x * h / hs
        # (the join smoothed: the forearm's last 1.5 cm and the hand's first 2.5 cm, keeping their volume)
        bm.verts.ensure_lookup_table()
        band = [v for v in bm.verts if -0.015 < axial(v.co) < 0.025 and radial(v.co) < 0.07
                and (v in tset or wsum(v) > 0.3) and not v.is_boundary]
        # (Taubin's: a step in, a step out -- no shrinking; Blender's volume-keeping smooth flung an open
        # band's vertices out into spikes)
        nbrs = {v: [e.other_vert(v) for e in v.link_edges] for v in band}
        for _ in range(6):
            for lam in (0.5, -0.53):
                new_co = {v: v.co + (sum((u.co for u in nb), Vector()) / len(nb) - v.co) * lam for v, nb in nbrs.items() if nb}
                for v, c in new_co.items():
                    v.co = c
        cuts.append((P, fa))
        report.append(f"{side.lower()}: {len(tverts)} vertices, cut {cut_d * 100:.1f} cm up, ring {len(ringA)}/{len(ringB)}, "
                      f"{'mirrored' if mirror else 'as made'}, thickness x{s_n:.2f}")
    if skin_samples:          # (the forearm's own skin by the cut, all round: the fade into it no brighter band)
        skin = np.median(np.array(skin_samples), 0)
    else:
        skin = np.array([0.85, 0.62, 0.52])
    timg = _paint_template(tme, T, skin)
    mat.use_nodes = True
    nt = mat.node_tree; bsdf = nt.nodes["Principled BSDF"]
    tex = nt.nodes.new("ShaderNodeTexImage"); tex.image = timg; tex.interpolation = "Linear"
    nt.links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
    bsdf.inputs["Metallic"].default_value = 0.0; bsdf.inputs["Roughness"].default_value = 0.85
    bm.normal_update()
    bm.to_mesh(me); bm.free(); me.update()
    bpy.data.meshes.remove(tme)
    # the forearm's texture faded to the hand's colour over the last 3 cm before the cut
    Tt, lo, hi, mi_, tv = _uv_tris(me, TW, TH)
    Vw = np.array([tuple(Mo @ v.co) for v in me.vertices])
    for P, fa in cuts:
        ax = (Vw - P) @ fa
        rd = np.linalg.norm((Vw - P) - np.outer(ax, fa), axis=1)
        sel = np.nonzero((mi_ == 0) & ((hi - lo).max(1) < 64) & (ax[tv].max(1) > -0.04) & (ax[tv].min(1) < 0.001)
                         & (rd[tv].max(1) < 0.07))[0]
        for t in sel:
            yy, xx = _raster(Tt, lo, hi, t, TW, TH)
            if not len(yy):
                continue
            A_, B_, C_ = Tt[t]
            q = np.c_[xx + 0.5, yy + 0.5]
            d = (B_[1] - C_[1]) * (A_[0] - C_[0]) + (C_[0] - B_[0]) * (A_[1] - C_[1])
            l1 = ((B_[1] - C_[1]) * (q[:, 0] - C_[0]) + (C_[0] - B_[0]) * (q[:, 1] - C_[1])) / d
            l2 = ((C_[1] - A_[1]) * (q[:, 0] - C_[0]) + (A_[0] - C_[0]) * (q[:, 1] - C_[1])) / d
            axq = np.c_[l1, l2, 1 - l1 - l2] @ ax[tv[t]]
            k = _ss(-0.03, -0.003, axq)[:, None]
            tpx[yy, xx, :3] = tpx[yy, xx, :3] * (1 - k) + skin * k
    img.pixels.foreach_set(tpx.ravel()); img.update()
    log(f"hands: the template hand fitted to the bones ({'; '.join(report)}; skin {skin.round(3)})")


def _longest_loop(edges, size):
    adj = {}
    for e in edges:
        a, b = e.verts
        adj.setdefault(a, []).append(b); adj.setdefault(b, []).append(a)
    loops, seen = [], set()
    for v0 in adj:
        if v0 in seen:
            continue
        lp, prev, cur = [v0], None, v0
        seen.add(v0)
        while True:
            nxt = [x for x in adj[cur] if x is not prev and x not in seen]
            if not nxt:
                break
            prev, cur = cur, nxt[0]; lp.append(cur); seen.add(cur)
        loops.append(lp)
    return max(loops, key=lambda l: sum(size(v) for v in l))


def _zip2(bm, uvl, Mi, A, angA, Bv, angB, uvB, centre, axis, mat_index):
    """faces between two rings (vertices in order of angle round the same axis): a zip along both, always
    taking the nearer next vertex by angle; faces outward; all one UV, the wrist's plain skin"""
    nA, nB = len(A), len(Bv)
    a = np.r_[angA, angA[0] + 2 * np.pi]
    jb = int(np.argmin(np.abs(((angB - angA[0]) + np.pi) % (2 * np.pi) - np.pi)))
    Bs = [Bv[(jb + k) % nB] for k in range(nB + 1)]
    b = np.array([angB[(jb + k) % nB] for k in range(nB + 1)], float)
    b = angA[0] + ((b - angA[0] + np.pi) % (2 * np.pi) - np.pi)
    for k in range(1, len(b)):
        while b[k] <= b[k - 1]:
            b[k] += 2 * np.pi
    As = A + [A[0]]
    Cm, axm = Mi @ centre, (Mi.to_3x3() @ axis).normalized()
    uv0 = uvB[Bv[0]]
    i = j = 0

    def tri(vs):
        try:
            f = bm.faces.new(vs)
        except ValueError:
            return
        f.normal_update()
        loc = f.calc_center_median() - Cm
        if f.normal.dot(loc - axm * loc.dot(axm)) < 0:
            f.normal_flip()
        for lp in f.loops:
            lp[uvl].uv = uv0          # (one texel of the wrist's plain skin: the template's UV seam there
                                      # crossed by a strip face sampled the whole island -- a red ring)
        f.material_index = mat_index; f.smooth = True
    while i < nA or j < nB:
        if i < nA and (j >= nB or a[i + 1] <= b[j + 1]):
            tri([As[i], As[i + 1], Bs[j]]); i += 1
        else:
            tri([As[i], Bs[j + 1], Bs[j]]); j += 1


def _paint_template(tme, T, skin, size=1024):
    """the hand's texture, in the template's own UVs (both hands share it): skin; the palm's side paler and
    pinker, the back a shade darker; on the palm side a crease at each joint, on the back two faint wrinkles
    over the middle joints; the nails (on the back of the last part, a rounded oblong, the rim darker, the
    free edge paler); the tips flushed; the occlusion; a little mottling. Where the wrist meets the forearm:
    plain skin."""
    from rebody import _raster
    V, N, owner, s_rel, ao = T["V"], T["N"], T["owner"], T["s_rel"], T["ao"]
    handness = np.ones(len(V))                                                   # (0 on the wrist: plain skin there)
    handness[sorted(T["vsets"][SETS["wrist"]] | T["vsets"].get(SETS["cap"], set()))] = 0.0
    names = FINGERS + ("Thumb",)
    nV = len(V)
    pal = np.clip(N @ np.array(T_PALMAR, float), -1, 1)                      # (+1 the palm's side)
    # the angle round each finger from its back (0) -- by the vertex's normal about its part's axis
    side_a = np.zeros(nV)
    for k, f in enumerate(names):
        ch = T["chains"][f]
        idx = np.nonzero(owner == k)[0]
        for i in range(3):
            m = idx[T["seg"][idx] == i]
            d = ch[i + 1] - ch[i]; d /= np.linalg.norm(d)
            p = np.array(T_PALMAR, float) - d * (np.array(T_PALMAR, float) @ d); p /= np.linalg.norm(p)
            c = np.cross(d, p)
            side_a[m] = np.arctan2(N[m] @ c, -(N[m] @ p))
    uv = np.empty(len(tme.loops) * 2); tme.uv_layers["UVMap"].data.foreach_get("uv", uv); uv = uv.reshape(-1, 2) * size
    tme.calc_loop_triangles()
    nT = len(tme.loop_triangles)
    tl_ = np.empty(nT * 3, np.int64); tme.loop_triangles.foreach_get("loops", tl_); tl_ = tl_.reshape(-1, 3)
    tv_ = np.empty(nT * 3, np.int64); tme.loop_triangles.foreach_get("vertices", tv_); tv_ = tv_.reshape(-1, 3)
    Tuv = uv[tl_]
    lo = np.floor(Tuv.min(1)).astype(int); hi = np.ceil(Tuv.max(1)).astype(int)
    img = np.ones((size, size, 3), np.float32) * skin
    cov = np.zeros((size, size), bool)
    pink = np.array([1.05, 0.97, 0.97])
    nail_c = np.clip(skin * 0.55 + np.array([0.98, 0.84, 0.80]) * 0.45, 0, 1)
    vJ = T["vJ"]
    # (the occlusion relative to the hand's open surfaces: it darkens the hidden places, not the whole hand)
    ao_norm = 0.62 + 0.38 * float(np.percentile(ao[handness > 0.5], 70)) ** 1.3
    for t in range(nT):
        yy, xx = _raster(Tuv, lo, hi, t, size, size)
        if not len(yy):
            continue
        A_, B_, C_ = Tuv[t]
        q = np.c_[xx + 0.5, yy + 0.5]
        d = (B_[1] - C_[1]) * (A_[0] - C_[0]) + (C_[0] - B_[0]) * (A_[1] - C_[1])
        if abs(d) < 1e-12:
            continue
        l1 = ((B_[1] - C_[1]) * (q[:, 0] - C_[0]) + (C_[0] - B_[0]) * (q[:, 1] - C_[1])) / d
        l2 = ((C_[1] - A_[1]) * (q[:, 0] - C_[0]) + (A_[0] - C_[0]) * (q[:, 1] - C_[1])) / d
        bw = np.c_[l1, l2, 1 - l1 - l2]
        vs = tv_[t]
        hn = (bw @ handness[vs])[:, None]
        P_ = bw @ pal[vs]; AO = 1 - (1 - bw @ ao[vs]) * hn[:, 0]
        S = np.ones((len(yy), 3)) * skin
        own = np.bincount(owner[vs] + 1, minlength=7).argmax() - 1
        palm_f = _ss(0.15, 0.7, P_)[:, None] * hn; back_f = _ss(0.15, 0.7, -P_)[:, None] * hn
        S = S * (1 + palm_f * 0.04 - back_f * 0.025) * (1 + palm_f * (pink - 1))
        if own >= 0 and (owner[vs] == own).all():
            f = names[own]
            s = bw @ s_rel[vs]
            a = bw @ side_a[vs]
            j = vJ[f]
            crease = np.zeros(len(s))
            for kk, sj in enumerate(j[1:3]):
                crease += np.exp(-0.5 * ((s - sj) / 0.006) ** 2) * palm_f[:, 0]
                crease += 0.45 * (np.exp(-0.5 * ((s - sj + 0.012) / 0.004) ** 2) + np.exp(-0.5 * ((s - sj - 0.012) / 0.004) ** 2)) * back_f[:, 0]
            S *= (1 - 0.18 * np.clip(crease, 0, 1))[:, None]
            S *= 1 + _ss(0.86, 1.0, s)[:, None] * (pink - 1) * 1.4
            v0 = j[2] + 0.42 * (1 - j[2]); v1 = 0.975
            du = np.abs(a) / (0.62 if f == "Thumb" else 0.58)
            dv = (s - (v0 + v1) / 2) / ((v1 - v0) / 2)
            r = (du ** 4 + np.clip(dv, -9, 9) ** 4) ** 0.25
            m = _ss(1.0, 0.82, r)[:, None]
            S = S * (1 - m) + nail_c * m
            S *= (1 - 0.16 * np.exp(-0.5 * ((r - 1.0) / 0.08) ** 2) * (dv < 0.3) * (du < 1.2))[:, None]
            S = S + 0.06 * m * _ss(0.5, 0.95, dv)[:, None]
        S *= (np.minimum((0.62 + 0.38 * np.clip(AO, 0, 1) ** 1.3) / ao_norm, 1.06))[:, None]
        img[yy, xx] = S
        cov[yy, xx] = True
    # the margins: each island's colour carried out a few texels (no seams under filtering)
    from rebody import _grow
    px = np.concatenate([img, np.ones((size, size, 1), np.float32)], 2)
    _grow(px, cov, ~cov, 6)
    rng = np.random.default_rng(7)
    nz = rng.normal(size=(size // 32 + 2, size // 32 + 2))
    nz = np.kron(nz, np.ones((32, 32)))[:size, :size]
    for _ in range(3):
        nz = (nz + np.roll(nz, 8, 0) + np.roll(nz, -8, 0) + np.roll(nz, 8, 1) + np.roll(nz, -8, 1)) / 5
    px[..., :3] *= (1 + 0.02 * nz)[..., None]
    im = bpy.data.images.new("hand_skin", size, size, alpha=False)
    im.pixels.foreach_set(np.clip(px, 0, 1).ravel())
    im.pack()
    return im
