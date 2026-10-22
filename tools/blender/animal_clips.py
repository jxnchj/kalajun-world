"""The clips of a quadruped, written as poses over time (parameter dicts for animal_rig.Rig.pose), 30 fps.

  idle        standing, breathing, the head drifting, an ear flicked, the tail twitched          loop
  walk        lateral-sequence walk (left hind, left fore, right hind, right fore)            loop, in place
  walk_graze  a slow walk with the head down at the grass, a bite now and then                loop, in place
  trot        diagonal pairs                                                                  loop, in place
  run         gallop (hinds, then fores), the back flexing                                   loop, in place
  graze       head down: bites (a tug at the grass), chewing between, the head moving on     loop
  look        head up, ears forward, looking round                                            loop
  lie_down    kneels in front, then the hind end goes down                                    once
  lie         lying, chewing the cud, breathing                                               loop
  get_up      hind end up first, then off the knees                                           once

The in-place gaits move the feet backwards under the body at their speed: the herd moves the animal at the
same speed (clip rate = its speed / the clip's speed, in the clip list exported beside the model).
"""
import math
from animal_rig import mix, add, smooth

FPS = 30
TAU = 2 * math.pi
NECK = ("neck1", "neck2", "neck3", "head")


def frames(dur):
    n = int(round(dur * FPS))
    return [i / FPS for i in range(n + 1)], n


def ear(side, lift=0.0, fwd=0.0, twist=0.0):
    s = 1 if side == "L" else -1
    return (twist, -s * lift, -s * fwd)


def neck(pitch=0.0, yaw=0.0, roll=0.0, w=(0.32, 0.3, 0.2, 0.18), wy=(0.15, 0.3, 0.3, 0.25)):
    return {n: (pitch * a, roll * b, yaw * b) for n, a, b in zip(NECK, w, wy)}


def pulse(t, t0, dur):
    """0 -> 1 -> 0 over [t0, t0 + dur] (smooth)"""
    x = (t - t0) / dur
    return math.sin(math.pi * x) ** 2 if 0 <= x <= 1 else 0.0


def flick(t, t0, side, amp=0.5):
    p = pulse(t, t0, 0.28)
    return {f"ear.{side}": ear(side, lift=amp * p, fwd=0.3 * amp * p, twist=0.4 * amp * p)}


def neck_down(N, head_world, yaw=0.0, roll=0.0, root=0.68):
    """the neck lowered as an animal lowers it, `root` of it at the neck's root (N: the neck's whole bend,
    rad), the head held at head_world (its own nose-down turn from rest, rad, whatever the neck does)"""
    w = (root, (1 - root) * 0.6, (1 - root) * 0.4)
    P = {n: (N * a, roll * b, yaw * c) for n, a, b, c in zip(NECK[:3], w, (0.2, 0.3, 0.3), (0.15, 0.3, 0.3))}
    P["head"] = (head_world - N, roll * 0.2, yaw * 0.25)
    return P


def head_to(rig, P, z, head_world, root=0.68, lo=0.0, hi=2.6):
    """the neck's bend bringing the muzzle (the head's tip) down to height z, the rest of P as it is"""
    for _ in range(26):
        mid = (lo + hi) / 2
        M = rig.pose(add(P, neck_down(mid, head_world, root=root)))
        if rig.tip(M, "head").z > z:
            lo = mid
        else:
            hi = mid
    N = (lo + hi) / 2
    return N, rig.tip(rig.pose(add(P, neck_down(N, head_world, root=root))), "head")


def graze_pose(rig, P, z, ahead, k=1.0):
    """how the neck and head go down to graze: the muzzle at height z, `ahead` m in front of the fore feet;
    searched over how much of the bend is at the neck's root and how steeply the head points down"""
    fy = (rig.leg["FL"]["fetlock"].y + rig.leg["FR"]["fetlock"].y) / 2
    best = None
    for root in (0.3, 0.4, 0.5, 0.6, 0.7):
        for hw in (35, 42, 50, 58, 66, 74):
            N, tip = head_to(rig, P, z, math.radians(hw), root)
            err = abs(tip.y - (fy - ahead)) + 4 * max(tip.z - z, 0) + 0.01 * k * max(0, hw - 55) / 10
            if best is None or err < best[0]:
                best = (err, N, math.radians(hw), root, tip)
    return best[1:]


def gait(rig, t, T, v, duty, touch, lift, bend, hoof, heel=0.25, scap=0.7):
    """feet for a gait: touch = {leg: when its foot touches down (fraction of the cycle)}; bend/hoof = (fore, hind)
    peak flexion of the knee/hock and of the fetlock in the swing"""
    feet, P = {}, {}
    reach = v * T * duty
    for k, tau in touch.items():
        p = (t / T - tau) % 1.0
        front = rig.leg[k]["front"]
        if p < duty:
            s = p / duty
            dy = -reach / 2 + reach * s
            dz, bd = 0.0, 0.0
            hp = heel * smooth((s - 0.65) / 0.35)
        else:
            s = (p - duty) / (1 - duty)
            e = 0.5 - 0.5 * math.cos(math.pi * s)
            dy = reach / 2 - reach * e
            sw = math.sin(math.pi * min(s * 1.15, 1.0))
            dz = lift[0 if front else 1] * sw
            bd = bend[0 if front else 1] * math.sin(math.pi * s)
            hp = heel * (1 - s) + hoof[0 if front else 1] * math.sin(math.pi * s)
        feet[k] = {"at": (0.0, dy, dz), "bend": bd, "hoof": hp}
        if front:
            P[f"scapula.{k[1]}"] = (scap * dy, 0.0, 0.0)
    P["feet"] = feet
    return P


WALK = {"HL": 0.0, "FL": 0.25, "HR": 0.5, "FR": 0.75}
TROT = {"FL": 0.0, "HR": 0.0, "FR": 0.5, "HL": 0.5}
GALLOP = {"HR": 0.0, "HL": 0.1, "FR": 0.4, "FL": 0.5}


def swish(t, t0, tails, amp=0.5, dur=1.4):
    """a tail swung to one side and back, the wave running down it"""
    out = {}
    for i, n in enumerate(tails):
        p = pulse(t, t0 + 0.08 * i, dur)
        out[n] = (0.0, 0.0, amp * p * (0.6 + 0.4 * i / max(len(tails) - 1, 1)))
    return out


def clips(rig, g):
    """g: the species' gait numbers (see animal.SPECIES[...]['gait'])"""
    g = dict(g)
    k = g.get("k", 1.0)                    # size against the sheep, for the few absolute offsets below
    tails = sorted(n for n in rig.order if n.startswith("tail"))
    sw = g.get("swish", False)

    def pant(t):
        """a dog's open mouth and quick breath"""
        if not g.get("pant"):
            return {}
        return {"jaw": (0.13 + 0.03 * math.sin(TAU * 3 * t), 0.0, 0.0), "chest": (0.012 * math.sin(TAU * 3 * t), 0.0, 0.0)}

    def wag(t, amp=0.35, f=2.0):
        """a dog's tail wagging, the wave running down it (whole cycles in the clip loops: f in Hz)"""
        if not g.get("wag"):
            return {}
        return {n: (0.0, 0.0, amp * math.sin(TAU * f * t - 0.7 * i)) for i, n in enumerate(tails)}

    def swishes(t, times, amp=0.45):
        P = {}
        if sw:
            for i, t0 in enumerate(times):
                P = add(P, swish(t, t0, tails[1:], amp * (1 if i % 2 else -1)))
        return P
    for gk in ("walk", "walk_graze", "trot", "run"):        # cycles a whole number of frames: seamless loops
        T, v = g[gk]
        g[gk] = (max(round(T * FPS), 8) / FPS, v)
    out, meta = {}, {}
    rest = {}

    # ---- idle
    ts, n = frames(4.0)
    seq = []
    for t in ts:
        P = {"chest": (0.012 * math.sin(TAU * t / 2), 0.0, 0.0)}
        P = add(P, neck(0.05 * math.sin(TAU * t / 4), 0.12 * math.sin(TAU * t / 4 + 1.0)))
        P = add(P, flick(t, 1.0, "L")); P = add(P, flick(t, 2.9, "R"))
        P["tail2"] = (0.0, 0.0, 0.25 * pulse(t, 2.0, 0.4))
        P = add(P, swishes(t, (0.5, 2.3)))
        P = add(P, pant(t)); P = add(P, wag(t, 0.2, 1.0))
        seq.append(P)
    out["idle"] = seq; meta["idle"] = dict(loop=True)

    # ---- walk
    T, v = g["walk"]
    ts, n = frames(T)
    seq = []
    for t in ts:
        P = gait(rig, t, T, v, 0.62, WALK, g["lift"], (1.1, 0.7), (1.3, 1.0))
        ph = TAU * t / T
        P["body"] = (0.0, 0.0, -0.006 * (0.5 - 0.5 * math.cos(2 * ph)), 0.0, 0.025 * math.sin(ph), 0.02 * math.sin(ph))
        P = add(P, neck(0.04 * math.sin(2 * ph + 0.6), -0.04 * math.sin(ph)))
        P["tail1"] = (0.0, 0.0, 0.06 * math.sin(ph + 1.0))
        P = add(P, wag(t, 0.15, 1.0 / T))
        seq.append(P)
    out["walk"] = seq; meta["walk"] = dict(loop=True, speed=v)

    # ---- walk_graze
    T, v = g["walk_graze"]
    ts, n = frames(2 * T)
    seq = []
    base = {"front_drop": 0.02 * k}
    pitch, HW, ROOT, _ = graze_pose(rig, base, g["graze_z"] + 0.04 * k, g["graze_ahead"], k)
    for t in ts:
        P = gait(rig, t, T, v, 0.68, WALK, (g["lift"][0] * 0.7, g["lift"][1] * 0.7), (0.9, 0.6), (1.1, 0.8))
        ph = TAU * t / T
        P["front_drop"] = 0.02 * k
        bite = pulse(t, 0.9 * T, 0.35)
        P = add(P, neck_down(pitch + 0.06 * bite - 0.03 * math.sin(2 * ph), HW, 0.25 * math.sin(TAU * t / (2 * T)), root=ROOT))
        P["jaw"] = (0.1 * pulse(t, 0.8 * T, 0.2), 0.0, 0.0)
        P["body"] = (0.0, 0.0, -0.004 * (0.5 - 0.5 * math.cos(2 * ph)), 0.0, 0.02 * math.sin(ph), 0.0)
        seq.append(P)
    out["walk_graze"] = seq; meta["walk_graze"] = dict(loop=True, speed=v)

    # ---- trot
    T, v = g["trot"]
    ts, n = frames(T)
    seq = []
    for t in ts:
        P = gait(rig, t, T, v, 0.42, TROT, (g["lift"][0] * 1.4, g["lift"][1] * 1.4), (1.5, 1.0), (1.6, 1.2))
        ph = TAU * (t / T - 0.21)
        P["body"] = (0.0, 0.0, -0.012 * (0.5 + 0.5 * math.cos(2 * ph)), 0.0, 0.0, 0.0)
        P = add(P, neck(-0.12 + 0.03 * math.cos(2 * ph)))
        P["ear.L"] = ear("L", 0.0, -0.3); P["ear.R"] = ear("R", 0.0, -0.3)
        P["tail1"] = (-0.05, 0.0, 0.0)
        seq.append(P)
    out["trot"] = seq; meta["trot"] = dict(loop=True, speed=v)

    # ---- run (gallop)
    T, v = g["run"]
    ts, n = frames(T)
    seq = []
    for t in ts:
        P = gait(rig, t, T, v, 0.32, GALLOP, (g["lift"][0] * 1.8, g["lift"][1] * 1.6), (1.8, 1.2), (1.8, 1.4), scap=1.0)
        ph = TAU * t / T
        # rising off the hinds (0-0.2), over the fores (0.4-0.6): the front up then down; the back gathering
        P["body"] = (0.0, 0.0, 0.02 * math.sin(ph - 0.6) - 0.012, 0.035 * math.sin(ph + 2.2), 0.0, 0.0)
        P["spine1"] = (0.03 * math.sin(ph + 0.4), 0.0, 0.0)
        P["chest"] = (0.02 * math.sin(ph + 0.4), 0.0, 0.0)
        P = add(P, neck(-0.1 - 0.04 * math.sin(ph + 2.2)))
        P["ear.L"] = ear("L", 0.1, -0.5); P["ear.R"] = ear("R", 0.1, -0.5)
        P["tail1"] = (-0.12, 0.0, 0.0)
        seq.append(P)
    out["run"] = seq; meta["run"] = dict(loop=True, speed=v)

    # ---- graze
    ts, n = frames(6.0)
    base = {"front_drop": 0.03 * k,
            "feet": {"FL": {"at": (0.0, -0.05 * k, 0.0)}, "FR": {"at": (0.0, 0.02 * k, 0.0)}}}
    pitch, HW, ROOT, tip = graze_pose(rig, base, g["graze_z"], g["graze_ahead"], k)
    meta_graze = dict(muzzle=[round(tip.y, 3), round(tip.z, 3)], head_deg=round(math.degrees(HW)), root=ROOT)
    bites = (0.4, 1.2, 1.9, 3.3, 4.1, 5.0)
    seq = []
    for t in ts:
        P = dict(base)
        b = sum(pulse(t, t0, 0.3) for t0 in bites)              # down into the grass
        tug = sum(pulse(t, t0 + 0.22, 0.25) for t0 in bites)    # the tug back
        side = sum(pulse(t, t0 + 0.2, 0.3) * (1 if i % 2 else -1) for i, t0 in enumerate(bites))
        if g.get("sniff"):   # a dog: the nose along the ground, quick sniffs, the head sweeping
            P = add(P, neck_down(pitch + 0.03 * math.sin(TAU * 4 * t) ** 8, HW, 0.35 * math.sin(TAU * t / 3), 0.0, root=ROOT))
            P = add(P, wag(t, 0.15, 1.0))
        else:
            P = add(P, neck_down(pitch + 0.07 * b - 0.09 * tug, HW + 0.05 * b, 0.22 * math.sin(TAU * t / 6) + 0.08 * side,
                                 0.05 * side, root=ROOT))
            chew = 0.0 if b > 0.05 else 1.0
            P["jaw"] = (sum(0.12 * pulse(t, t0 - 0.12, 0.2) for t0 in bites)
                        + chew * 0.035 * (0.5 + 0.5 * math.sin(TAU * 1.5 * t)), 0.0, chew * 0.03 * math.sin(TAU * 0.75 * t))
        P = add(P, flick(t, 2.6, "L")); P = add(P, flick(t, 4.6, "R"))
        P["tail2"] = (0.0, 0.0, 0.3 * pulse(t, 3.8, 0.45))
        P = add(P, swishes(t, (1.0, 2.6, 4.4)))
        P["chest"] = (0.01 * math.sin(TAU * t / 3), 0.0, 0.0)
        seq.append(P)
    out["graze"] = seq; meta["graze"] = dict(loop=True)
    print("[animal] graze:", meta_graze)

    # ---- look
    ts, n = frames(5.0)
    seq = []
    for t in ts:
        yaw = 0.55 * (smooth((t - 0.6) / 0.7) - smooth((t - 2.0) / 0.9)) - 0.45 * (smooth((t - 2.3) / 0.8) - smooth((t - 3.9) / 0.8))
        up = -0.32 - 0.05 * math.sin(TAU * t / 5)
        P = neck(up, yaw, 0.0)
        P["ear.L"] = ear("L", 0.3, 0.35); P["ear.R"] = ear("R", 0.3, 0.35)
        P = add(P, flick(t, 3.0, "R", 0.3))
        P["chest"] = (0.01 * math.sin(TAU * t / 2.5), 0.0, 0.0)
        P = add(P, pant(t)); P = add(P, wag(t, 0.3, 2.0))
        seq.append(P)
    out["look"] = seq; meta["look"] = dict(loop=True)

    # ---- lying down, lying, getting up
    L = rig.leg
    deg = math.radians
    kneel_drop = g["kneel_drop"]
    M = rig.pose({"front_drop": kneel_drop})
    KNEEL = {"front_drop": kneel_drop, "feet": {}}
    for leg in ("FL", "FR"):
        up = rig.leg[leg]
        sh = M[f"upperarm.{leg[1]}"].translation           # the shoulder joint, lowered
        carpus_y = sh.y + 0.035 * k                        # the knee on the ground under the elbow
        fy = carpus_y + up["b"] * 0.97                     # the cannon folded back along the ground
        KNEEL["feet"][leg] = {"at": (0.0, fy - up["fetlock"].y, 0.045 * k - up["fetlock"].z), "bend": deg(90) - up["phi"],
                            "hoof": 2.3, "pivot": 0.0}
    KNEEL = add(KNEEL, neck(0.25))
    lie_drop = g["lie_drop"]
    LIE = {"front_drop": lie_drop, "hind_drop": lie_drop,
           "feet": {**{f: {"at": (0.0, 0.01 * k, -0.02 * k), "bend": deg(158) - L[f]["phi"], "hoof": 2.4, "pivot": 0.0}
                       for f in ("FL", "FR")},
                    **{f: {"at": ((0.03 if f == "HL" else -0.03) * k, g["lie_hind_y"], -0.02 * k), "bend": deg(150) - L[f]["phi"],
                           "hoof": 1.6, "pivot": 0.0} for f in ("HL", "HR")}}}
    if g.get("down") == "hind":   # a dog lies like a sphinx: the fore legs out in front along the ground
        for f in ("FL", "FR"):
            LIE["feet"][f] = {"at": (0.0, -g["sphinx_y"], -0.02 * k), "bend": 0.0, "hoof": 0.0, "pivot": 0.0}
    if g.get("hock_z") is not None:   # the folded hind foot flat on the ground, the hock resting on it
        for f in ("HL", "HR"):
            LIE["feet"][f]["hoof"] = 0.0
            best = None
            for d_ in range(90, 178, 2):
                LIE["feet"][f]["bend"] = deg(d_) - L[f]["phi"]
                hz = rig.tip(rig.pose(LIE), "shin." + f[1]).z
                if best is None or abs(hz - g["hock_z"]) < best[0]:
                    best = (abs(hz - g["hock_z"]), d_)
            LIE["feet"][f]["bend"] = deg(best[1]) - L[f]["phi"]
            print(f"[animal] lying {f}: hock bent {best[1]} deg, {best[0] * 100:.1f} cm off its height")
    LIE = add(LIE, neck(-0.05))
    STOOP = neck(0.2)
    # sitting on the folded hinds, the fore legs straight: how a horse gets up, how a dog sits down
    SIT = {"front_drop": g.get("sit_drop", lie_drop * 0.45), "hind_drop": lie_drop,
           "feet": {**{f: {"at": (0.0, -g.get("sit_y", 0.12 * k), 0.0), "bend": 0.0} for f in ("FL", "FR")},
                    **{f: LIE["feet"][f] for f in ("HL", "HR")}}}
    SIT = add(SIT, neck(-0.15))

    def arc(P, Q, w, lift=0.04 * k, lag=0.25):
        R = mix(P, Q, w)
        # one fore leg ahead of the other (the left first)
        wl, wr = smooth(w / (1 - lag)), smooth((w - lag) / (1 - lag))
        for leg, ww in (("FL", wl), ("FR", wr)):
            a, b = P.get("feet", {}).get(leg), Q.get("feet", {}).get(leg)
            if a != b:
                R.setdefault("feet", {})[leg] = mix({"f": a or {}}, {"f": b or {}}, ww)["f"]
        for leg, f in list(R.get("feet", {}).items()):
            moving = (P.get("feet", {}).get(leg) != Q.get("feet", {}).get(leg))
            if moving:
                ww = wl if leg == "FL" else wr if leg == "FR" else w
                at = f.get("at", (0, 0, 0))
                f = dict(f); f["at"] = (at[0], at[1], at[2] + lift * math.sin(math.pi * ww)); R["feet"][leg] = f
        return R

    # ---- a marmot's sentry: sitting bolt upright on its haunches, fore paws held at the chest, looking round,
    # a whistle now and then
    if g.get("sentinel"):
        up = -1.25                                         # the body's pitch up (rad)
        H = rig.hipjoint
        STAND = {"front_drop": math.tan(up) * (H.y - rig.shoulder.y), "hind_drop": g["lie_drop"] * 0.9,
                 "feet": {f: dict(LIE["feet"][f]) for f in ("HL", "HR")}}
        STAND = add(STAND, neck(-up * 0.95))
        STAND["tail1"] = (-up * 0.6, 0.0, 0.0); STAND["tail2"] = (0.2, 0.0, 0.0)
        Mst = rig.pose(STAND)
        for f in ("FL", "FR"):
            sh = Mst[f"upperarm.{f[1]}"].translation
            tgt = sh + (Mst["chest"].to_3x3() @ rig.Rr["chest"].inverted()) @ (rig.leg[f]["fetlock"] - rig.shoulder) * 0.35
            tgt.y -= 0.03 * k
            STAND["feet"][f] = {"at": tuple(tgt - rig.leg[f]["fetlock"]), "bend": deg(110) - L[f]["phi"], "hoof": 1.2, "pivot": 0.0}
        ts, n = frames(4.0)
        seq = []
        for t in ts:
            yaw = 0.6 * math.sin(TAU * t / 4) + 0.2 * math.sin(TAU * t / 2)
            P = add(STAND, neck(0.0, yaw))
            whistle = pulse(t, 1.1, 0.25) + pulse(t, 1.45, 0.25) + pulse(t, 3.0, 0.3)
            P["jaw"] = (0.2 * whistle, 0.0, 0.0)
            P["chest"] = (0.02 * math.sin(TAU * t / 2) - 0.03 * whistle, 0.0, 0.0)
            P = add(P, flick(t, 2.2, "L", 0.4))
            seq.append(P)
        out["stand"] = seq; meta["stand"] = dict(loop=True)
        ts, n = frames(0.6)
        out["stand_up"] = [mix({}, STAND, smooth(t / 0.6)) for t in ts]; meta["stand_up"] = dict(loop=False)
        ts, n = frames(0.5)
        out["stand_down"] = [mix(STAND, {}, smooth(t / 0.5)) for t in ts]; meta["stand_down"] = dict(loop=False)

    ts, n = frames(2.6)
    seq = []
    for t in ts:
        if g.get("down") == "hind":   # sits, then the fore legs slide forward
            if t < 1.1:
                P = mix({}, SIT, smooth(t / 1.1))
            elif t < 2.1:
                P = arc(SIT, LIE, smooth((t - 1.1) / 1.0), 0.02 * k)
            else:
                P = LIE
        elif t < 0.4:
            P = mix({}, STOOP, smooth(t / 0.4))
        elif t < 1.3:
            P = arc(STOOP, KNEEL, smooth((t - 0.4) / 0.9))
        elif t < 2.2:
            P = arc(KNEEL, LIE, smooth((t - 1.3) / 0.9), 0.02 * k)
        else:
            P = LIE
        seq.append(P)
    out["lie_down"] = seq; meta["lie_down"] = dict(loop=False)

    ts, n = frames(6.0)
    seq = []
    for t in ts:
        P = add(LIE, {"chest": (0.015 * math.sin(TAU * t / 3), 0.0, 0.0)})
        P = add(P, neck(0.04 * math.sin(TAU * t / 6), 0.3 * math.sin(TAU * t / 6 + 0.5)))
        P["jaw"] = (0.035 * (0.5 + 0.5 * math.sin(TAU * 1.5 * t)), 0.0, 0.03 * math.sin(TAU * 0.75 * t))
        P = add(P, flick(t, 1.6, "L")); P = add(P, flick(t, 4.2, "R"))
        P = add(P, swishes(t, (3.0,), 0.3))
        seq.append(P)
    out["lie"] = seq; meta["lie"] = dict(loop=True)

    ts, n = frames(2.2)
    seq = []
    # (a horse or a dog: the fore legs straightened first, sitting up on its folded hinds, then up behind)
    for t in ts:
        if g.get("rise") == "front":
            if t < 0.9:
                P = arc(LIE, SIT, smooth(t / 0.9), 0.03 * k)
            elif t < 1.7:
                P = mix(SIT, STOOP, smooth((t - 0.9) / 0.8))
            else:
                P = mix(STOOP, {}, smooth((t - 1.7) / 0.5))
        elif t < 0.9:
            P = arc(LIE, KNEEL, smooth(t / 0.9), 0.02 * k)
        elif t < 1.7:
            P = arc(KNEEL, STOOP, smooth((t - 0.9) / 0.8))
        else:
            P = mix(STOOP, {}, smooth((t - 1.7) / 0.5))
        seq.append(P)
    out["get_up"] = seq; meta["get_up"] = dict(loop=False)
    return out, meta


# ------------------------------------------------------------------------------------------------ birds
def wing(side, lift=0.0, sweep=0.0, twist=0.0):
    """a wing bone turned: lift = tip up, sweep = tip back, twist = leading edge down (rad)"""
    s = 1 if side == "L" else -1
    return (twist, -s * lift, s * sweep)


def bird_clips(rig, g):
    """glide (wings spread, small adjustments, the tail steering, the head scanning the ground), flap (one
    wingbeat: the downstroke spread, the upstroke with the hand and forearm folded back), flap_fast"""
    out, meta = {}, {}
    ts, n = frames(4.0)
    seq = []
    for t in ts:
        P = {}
        a = TAU * t / 4
        for sd, ph in (("L", 0.0), ("R", 1.3)):
            P[f"upperwing.{sd}"] = wing(sd, 0.06 + 0.025 * math.sin(a + ph), 0.02 * math.sin(2 * a + ph))
            P[f"forewing.{sd}"] = wing(sd, 0.02 * math.sin(a + ph + 0.5), 0.03 * math.sin(a + ph))
            P[f"hand.{sd}"] = wing(sd, 0.05 + 0.04 * math.sin(a + ph + 1.0), 0.04 * math.sin(2 * a + ph), 0.03 * math.sin(a))
        P["tail1"] = (0.03 * math.sin(a + 0.7), 0.06 * math.sin(a), 0.0)
        P["tail2"] = (0.02 * math.sin(a + 1.2), 0.05 * math.sin(a + 0.4), 0.0)
        P["neck1"] = (0.15, 0.0, 0.25 * math.sin(a * 0.5 + 0.3) ** 3)
        P["head"] = (0.2 + 0.08 * math.sin(a), 0.1 * math.sin(a + 1), 0.25 * math.sin(a * 0.5) ** 3)
        P["body"] = (0.0, 0.0, 0.01 * math.sin(a), 0.0, 0.0, 0.0)
        seq.append(P)
    out["glide"] = seq; meta["glide"] = dict(loop=True)
    for name, T, amp in (("flap", 0.5, 1.0), ("flap_fast", 0.37, 1.15)):
        ts, n = frames(T)
        T = n / FPS                                          # (a whole number of frames: a seamless loop)
        seq = []
        for t in ts:
            p = t / T
            fold = max(0.0, -math.sin(TAU * p))                 # the upstroke (second half)
            P = {}
            for sd in ("L", "R"):
                P[f"upperwing.{sd}"] = wing(sd, amp * 0.55 * math.cos(TAU * p), 0.15 * fold, -0.1 * math.sin(TAU * p))
                P[f"forewing.{sd}"] = wing(sd, amp * 0.25 * math.cos(TAU * (p - 0.08)), 0.45 * fold)
                P[f"hand.{sd}"] = wing(sd, amp * 0.35 * math.cos(TAU * (p - 0.15)), 0.8 * fold, 0.25 * fold - 0.15 * math.sin(TAU * p))
            P["tail1"] = (0.06 * math.cos(TAU * p), 0.0, 0.0)
            P["neck1"] = (0.1 - 0.05 * math.cos(TAU * p), 0.0, 0.0)
            P["head"] = (0.15 + 0.05 * math.cos(TAU * p), 0.0, 0.0)
            P["body"] = (0.0, 0.0, -0.03 * amp * math.cos(TAU * p), 0.03 * math.sin(TAU * p), 0.0, 0.0)
            seq.append(P)
        out[name] = seq; meta[name] = dict(loop=True)
    return out, meta
