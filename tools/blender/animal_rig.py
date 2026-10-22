"""A quadruped's skeleton, skin and clips (used by tools/blender/animal.py).

Skeleton: from a table of joints per species (metres, the prepared model's frame: facing -y, its left +x,
hooves on z=0): root -> hips (pelvis) -> spine1 -> chest -> neck1..3 -> head (jaw, ears); hips -> tail1..2;
chest -> scapula -> upperarm -> forearm -> cannon -> hoof; hips -> thigh -> shin -> hcannon -> hhoof.

Poses are computed here, not by Blender's constraints: a pose is a dict of parameters (angles about the
animal's own axes for the spine, neck, head, ears, tail; how far the front and the hind end are lowered;
for each foot where its fetlock is and how much the knee / hock is bent), solved bone by bone into
armature-space matrices (each leg by a two-joint solve with the lower joint's bend given), and keyed as
ordinary rotations (and the hips' translation), one action per clip.

Angles: pitch about the animal's left axis (+x), positive = nose / tip down; yaw about up (+z), positive =
turning to its left; roll about its length (y).
"""
import math
import numpy as np
import bpy
from mathutils import Vector, Matrix, Quaternion

LEGS = {   # leg: (upper, mid, low, foot), side, front?
    "FL": (("upperarm.L", "forearm.L", "cannon.L", "hoof.L"), "L", True),
    "FR": (("upperarm.R", "forearm.R", "cannon.R", "hoof.R"), "R", True),
    "HL": (("thigh.L", "shin.L", "hcannon.L", "hhoof.L"), "L", False),
    "HR": (("thigh.R", "shin.R", "hcannon.R", "hhoof.R"), "R", False),
}
X = Vector((1, 0, 0))


def mirror_table(bones):
    """the .L bones copied to .R (x mirrored)"""
    out = []
    for name, h, t, parent in bones:
        out.append((name, h, t, parent))
        if name.endswith(".L"):
            out.append((name[:-2] + ".R", (-h[0], h[1], h[2]), (-t[0], t[1], t[2]),
                        parent[:-2] + ".R" if parent and parent.endswith(".L") else parent))
    return out


def build_armature(table, name="rig"):
    data = bpy.data.armatures.new(name)
    arm = bpy.data.objects.new(name, data)
    bpy.context.scene.collection.objects.link(arm)
    bpy.ops.object.select_all(action="DESELECT")
    arm.select_set(True); bpy.context.view_layer.objects.active = arm
    bpy.ops.object.mode_set(mode="EDIT")
    eb = data.edit_bones
    for bname, h, t, parent in mirror_table(table):
        b = eb.new(bname)
        b.head = h; b.tail = t
        d = (Vector(t) - Vector(h)).normalized()
        z = X.cross(d)
        b.align_roll(z if z.length > 0.3 else Vector((0, 0, 1)))
        if parent:
            b.parent = eb[parent]
        b.use_connect = False
        b.use_deform = bname != "root"
    bpy.ops.object.mode_set(mode="OBJECT")
    return arm


def signed_angle(a, b, axis):
    a = a - axis * a.dot(axis); b = b - axis * b.dot(axis)
    return math.atan2(a.cross(b).dot(axis), a.dot(b))


def smooth(x):
    x = min(max(x, 0.0), 1.0)
    return x * x * (3 - 2 * x)


def mix(P, Q, w):
    """parameter dicts blended (numbers and tuples linearly; nested dicts by key)"""
    if w <= 0:
        return P
    if w >= 1:
        return Q
    out = {}
    for k in set(P) | set(Q):
        a, b = P.get(k), Q.get(k)
        if a is None:
            out[k] = _scale(b, w)
            continue
        if b is None:
            out[k] = _scale(a, 1 - w)
            continue
        if isinstance(a, dict):
            out[k] = mix(a, b, w)
        elif isinstance(a, (tuple, list)):
            out[k] = tuple(x + (y - x) * w for x, y in zip(a, b))
        else:
            out[k] = a + (b - a) * w
    return out


def _scale(a, w):
    if isinstance(a, dict):
        return {k: _scale(v, w) for k, v in a.items()}
    if isinstance(a, (tuple, list)):
        return tuple(x * w for x in a)
    return a * w


def add(P, Q):
    """Q's parameters added onto P's"""
    out = dict(P)
    for k, b in Q.items():
        a = out.get(k)
        if a is None:
            out[k] = b
        elif isinstance(a, dict):
            out[k] = add(a, b)
        elif isinstance(a, (tuple, list)):
            out[k] = tuple(x + y for x, y in zip(a, b))
        else:
            out[k] = a + b
    return out


class Rig:
    def __init__(self, arm):
        self.arm = arm
        bones = arm.data.bones
        self.R = {b.name: b.matrix_local.copy() for b in bones}
        self.Rr = {n: M.to_3x3() for n, M in self.R.items()}
        self.parent = {b.name: (b.parent.name if b.parent else None) for b in bones}
        self.length = {b.name: b.length for b in bones}
        order, seen = [], set()

        def visit(n):
            if n in seen:
                return
            if self.parent[n]:
                visit(self.parent[n])
            seen.add(n); order.append(n)
        for b in bones:
            visit(b.name)
        self.order = order
        self.head = {n: M.translation.copy() for n, M in self.R.items()}
        self.tail = {b.name: b.tail_local.copy() for b in bones}
        # the legs at rest: fetlock, lengths, the lower joint's bend
        self.leg = {}
        for k, ((up, mid, low, foot), side, front) in LEGS.items():
            if up not in self.R:          # (a bird: no legs to walk on)
                continue
            s2 = -1 if front else 1
            dm = (self.tail[mid] - self.head[mid]).normalized()
            dl = (self.tail[low] - self.head[low]).normalized()
            phi = -s2 * signed_angle(dm, dl, X)
            self.leg[k] = dict(fetlock=self.tail[low].copy(), phi=phi, u=self.length[up], a=self.length[mid],
                               b=self.length[low], front=front, toe=self.tail[foot] - self.tail[low])
        self.shoulder = (self.head["upperarm.L"] + self.head["upperarm.R"]) / 2 if "upperarm.L" in self.R else None
        self.hipjoint = (self.head["thigh.L"] + self.head["thigh.R"]) / 2 if "thigh.L" in self.R else None

    # ---- frames
    def carried(self, M, n):
        p = self.parent[n]
        if p is None:
            return self.R[n].copy()
        return M[p] @ self.R[p].inverted() @ self.R[n]

    def rotated(self, F, n, pitch=0.0, roll=0.0, yaw=0.0):
        A = Matrix.Rotation(yaw, 3, "Z") @ Matrix.Rotation(pitch, 3, "X") @ Matrix.Rotation(roll, 3, "Y")
        Rr = self.Rr[n]
        return F @ (Rr.inverted() @ A @ Rr).to_4x4()

    @staticmethod
    def aim(F, target):
        h = F.translation.copy()
        y = F.to_3x3().col[1].normalized()
        q = y.rotation_difference((target - h).normalized())
        M = (q.to_matrix() @ F.to_3x3()).to_4x4()
        M.translation = h
        return M

    def delta(self, M, n):
        """the rotation a posed bone has turned through from its rest (armature space)"""
        return M[n].to_3x3() @ self.Rr[n].inverted()

    # ---- the body
    def body(self, front_drop, hind_drop):
        """the hips' pitch and shift lowering the shoulder joints by front_drop and the hip joints by hind_drop"""
        S, H, p = self.shoulder, self.hipjoint, self.head["hips"]
        if S is None:
            return 0.0, Vector((0, 0, 0))
        th = math.atan2(front_drop - hind_drop, H.y - S.y)
        Rx = Matrix.Rotation(th, 3, "X")
        t = (H - Vector((0, 0, hind_drop))) - (Rx @ (H - p) + p)
        return th, t

    # ---- a pose
    def pose(self, P):
        M = {}
        th, t = self.body(P.get("front_drop", 0.0), P.get("hind_drop", 0.0))
        bx = P.get("body", (0, 0, 0, 0, 0, 0))
        feet = P.get("feet", {})
        done = set()
        for n in self.order:
            if n in done:
                continue
            F = self.carried(M, n)
            if n == "hips":
                F = self.rotated(F, n, th + bx[3], bx[4], bx[5])
                F.translation = F.translation + t + Vector(bx[:3])
                M[n] = F
                continue
            leg = next((k for k, (ch, _, _) in LEGS.items() if ch[0] == n), None)
            if leg:
                self._leg(M, leg, feet.get(leg, {}))
                done.update(LEGS[leg][0])
                continue
            a = P.get(n)
            M[n] = self.rotated(F, n, *a) if a else F
        return M

    def _leg(self, M, k, f):
        (up, mid, low, foot), side, front = LEGS[k]
        L = self.leg[k]
        Fu = self.carried(M, up)
        T = Fu.translation.copy()
        par = self.parent[up]
        lat = (self.delta(M, par) @ X).normalized()
        d0 = f.get("at", (0, 0, 0))                # fetlock offset from rest (armature space)
        hp = f.get("hoof", 0.0)                    # hoof pitch from flat (rad, + = toe back / heel up)
        Rh = Matrix.Rotation(hp, 3, lat)
        pivot = (L["toe"] - Rh @ L["toe"]) * f.get("pivot", 1.0)    # the heel lifting about the toe (planted)
        tgt = L["fetlock"] + Vector(d0) + pivot
        phi = L["phi"] + f.get("bend", 0.0)
        u, a, b = L["u"], L["a"], L["b"]
        c = math.sqrt(max(a * a + b * b + 2 * a * b * math.cos(phi), 1e-8))
        D = tgt - T
        d = min(max(D.length, abs(u - c) + 1e-4), u + c - 1e-4)
        e = D.normalized()
        perp = lat.cross(e).normalized()            # backwards when e points down
        s1 = 1 if front else -1                     # elbow back, stifle forward
        cA = (u * u + d * d - c * c) / (2 * u * d)
        sA = math.sqrt(max(1 - cA * cA, 0))
        J1 = T + u * (cA * e + s1 * sA * perp)
        Fe = T + e * d
        v = (Fe - J1).normalized()
        s2 = -1 if front else 1
        al = math.atan2(b * math.sin(phi), a + b * math.cos(phi))
        dm = Matrix.Rotation(s2 * al, 3, lat) @ v
        dl = Matrix.Rotation(-s2 * phi, 3, lat) @ dm
        J2 = J1 + a * dm
        Fx = J2 + b * dl
        M[up] = self.aim(Fu, J1)
        M[mid] = self.aim(self.carried(M, mid), J2)
        M[low] = self.aim(self.carried(M, low), Fx)
        Mf = (Rh @ self.Rr[foot]).to_4x4()
        Mf.translation = Fx
        M[foot] = Mf

    def tip(self, M, n):
        return M[n] @ (self.R[n].inverted() @ self.tail[n])

    # ---- keying
    def key(self, name, frames):
        """frames: a list of parameter dicts, one per frame (30 fps) -> an action"""
        arm = self.arm
        act = bpy.data.actions.new(name)
        act.use_fake_user = True
        arm.animation_data_create()
        arm.animation_data.action = act
        prev = {}
        for i, P in enumerate(frames):
            M = self.pose(P)
            for n in self.order:
                p = self.parent[n]
                B = (self.R[n].inverted() @ M[n]) if p is None else \
                    (self.R[p].inverted() @ self.R[n]).inverted() @ M[p].inverted() @ M[n]
                loc, rot, _ = B.decompose()
                if n in prev and prev[n].dot(rot) < 0:
                    rot.negate()
                prev[n] = rot
                pb = arm.pose.bones[n]
                pb.rotation_mode = "QUATERNION"
                pb.rotation_quaternion = rot
                pb.keyframe_insert("rotation_quaternion", frame=i)
                if n in ("root", "hips"):
                    pb.location = loc
                    pb.keyframe_insert("location", frame=i)
        act.frame_range = (0, len(frames) - 1)
        act.use_frame_range = True
        arm.animation_data.action = None
        return act


# ------------------------------------------------------------------------------------------------ skin
def skin(arm, lods, log):
    """bone-heat weights on the finest level, carried to the others from its surface; four a vertex"""
    lod0 = lods[0]
    bpy.ops.object.select_all(action="DESELECT")
    lod0.select_set(True); arm.select_set(True)
    bpy.context.view_layer.objects.active = arm
    bpy.ops.object.parent_set(type="ARMATURE_AUTO")
    unw = sum(1 for v in lod0.data.vertices if not any(x.weight > 0 for x in v.groups))
    log(f"skin {lod0.name}: bone heat, {unw} vertices without weights")
    for o in lods[1:]:
        bpy.ops.object.select_all(action="DESELECT")
        o.select_set(True); arm.select_set(True)
        bpy.context.view_layer.objects.active = arm
        bpy.ops.object.parent_set(type="ARMATURE_NAME")
        bpy.ops.object.select_all(action="DESELECT")
        o.select_set(True); lod0.select_set(True)
        bpy.context.view_layer.objects.active = lod0
        bpy.ops.object.data_transfer(use_reverse_transfer=False, data_type="VGROUP_WEIGHTS",
                                     vert_mapping="POLYINTERP_NEAREST", layers_select_src="ALL",
                                     layers_select_dst="NAME", mix_mode="REPLACE", use_object_transform=True)
    for o in lods:
        bpy.ops.object.select_all(action="DESELECT")
        o.select_set(True); bpy.context.view_layer.objects.active = o
        bpy.ops.object.mode_set(mode="WEIGHT_PAINT")
        bpy.ops.object.vertex_group_clean(group_select_mode="ALL", limit=0.01)
        bpy.ops.object.vertex_group_limit_total(group_select_mode="ALL", limit=4)
        bpy.ops.object.vertex_group_normalize_all(group_select_mode="ALL", lock_active=False)
        bpy.ops.object.mode_set(mode="OBJECT")
