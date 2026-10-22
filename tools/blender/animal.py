"""The pasture animals made from Aholo's raw models (assets/src/aholo/.../animal_<id>/textured.glb, ~300k
triangles in ~1400 overlapping pieces, texture in hundreds of tiny islands) into light, rigged, animated
models for the instanced herds of web/src/livestock.js.

Stage "prep" (this file, per species):
  - imported, its pieces joined and welded; set on its feet (the four hooves found as the lowest points),
    centred between them, facing -y (three's +z), scaled so its withers stand at the real height
  - rebuilt as one closed skin (voxel remesh: the overlapping shells and holes go), then decimated to each
    level of detail; each level unwrapped anew and its colour (and normals) baked from the raw model
  - saved to assets/src/animals/<id>/prep.blend (+ the baked textures) for the rig stage

Stage "rig":
  - a quadruped skeleton from the species' joint table (measured on the prepared model: slices of the legs
    for the knees, hocks and fetlocks; the head, ears and tail from side and front views on a 5 cm grid)
  - bone-heat weights on the finest level, carried to the coarser ones from its surface
  - the clips (tools/blender/animal_clips.py), keyed as actions; exported with all levels to
    web/public/assets/<id>.glb, the clip list (speeds, loops) in the armature's extras ("clips")

Run: tools/.bpy/bin/python -I tools/blender/animal.py <species> [prep|rig|all]
"""
import os, sys, math, json
import numpy as np
import bpy, bmesh
from mathutils import Vector, Matrix

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import animal_rig, animal_clips

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
RAW = os.path.join(ROOT, "assets", "src", "aholo")
SPECIES = {
    "sheep": dict(
        src=os.path.join(RAW, "animals_20261014", "animals-models-20261014", "animal_sheep", "textured.glb"),
        withers=0.75,                    # m, the real Kazakh fat-tailed ewe (docs/animals/aholo_animals_brief.md)
        voxel=0.006,                     # m, the remesh: finer than the ears' thickness
        lods=((4000, 1024), (1200, 512), (360, 256)),    # (triangles, texture size) per level of detail
        # joints (m; the left side, the right mirrored): name, head, tail, parent
        bones=[
            ("root", (0, 0, 0), (0, -0.2, 0), None),
            ("hips", (0, 0.14, 0.58), (0, 0.34, 0.56), "root"),
            ("spine1", (0, 0.14, 0.58), (0, -0.04, 0.59), "hips"),
            ("chest", (0, -0.04, 0.59), (0, -0.22, 0.61), "spine1"),
            ("neck1", (0, -0.25, 0.53), (0, -0.32, 0.63), "chest"),
            ("neck2", (0, -0.32, 0.63), (0, -0.38, 0.72), "neck1"),
            ("neck3", (0, -0.38, 0.72), (0, -0.44, 0.80), "neck2"),
            ("head", (0, -0.44, 0.80), (0, -0.625, 0.75), "neck3"),
            ("jaw", (0, -0.46, 0.75), (0, -0.60, 0.715), "head"),
            ("ear.L", (0.06, -0.47, 0.84), (0.15, -0.44, 0.70), "head"),
            ("tail1", (0, 0.34, 0.56), (0, 0.42, 0.50), "hips"),
            ("tail2", (0, 0.42, 0.50), (0, 0.45, 0.36), "tail1"),
            ("scapula.L", (0.06, -0.17, 0.66), (0.10, -0.29, 0.47), "chest"),
            ("upperarm.L", (0.10, -0.29, 0.47), (0.10, -0.225, 0.36), "scapula.L"),
            ("forearm.L", (0.10, -0.225, 0.36), (0.097, -0.245, 0.21), "upperarm.L"),
            ("cannon.L", (0.097, -0.245, 0.21), (0.096, -0.252, 0.06), "forearm.L"),
            ("hoof.L", (0.096, -0.252, 0.06), (0.096, -0.32, 0.005), "cannon.L"),
            ("thigh.L", (0.085, 0.25, 0.50), (0.11, 0.17, 0.38), "hips"),
            ("shin.L", (0.11, 0.17, 0.38), (0.094, 0.295, 0.245), "thigh.L"),
            ("hcannon.L", (0.094, 0.295, 0.245), (0.095, 0.29, 0.06), "shin.L"),
            ("hhoof.L", (0.095, 0.29, 0.06), (0.095, 0.215, 0.005), "hcannon.L"),
        ],
        # gaits: (cycle s, speed m/s); swing lift of the fetlock (fore, hind) m; the muzzle's height grazing;
        # lying: how far the front end drops kneeling, how far back the folded fore fetlock lies, the drop lying
        gait=dict(walk=(1.0, 0.6), walk_graze=(1.4, 0.28), trot=(0.6, 1.6), run=(0.45, 3.4), lift=(0.06, 0.05),
                  graze_z=0.07, graze_ahead=0.2, kneel_drop=0.19, kneel_back=0.13, lie_drop=0.25, lie_hind_y=-0.15),
        # coat regions (rest pose heights, m): the bare legs below the wool, the hooves
        regions=dict(kind="sheep", leg_z=(0.24, 0.3), hoof_z=(0.035, 0.055)),
    ),
    "cattle": dict(
        src=os.path.join(RAW, "animals_20261014", "animals-models-20261014", "animal_cattle", "textured.glb"),
        withers=1.25,                    # m, an adult cow (docs/animals/aholo_animals_brief.md)
        voxel=0.006,
        lods=((6000, 1024), (1600, 512), (500, 256)),
        bones=[
            ("root", (0, 0, 0), (0, -0.3, 0), None),
            ("hips", (0, 0.40, 1.12), (0, 0.78, 1.10), "root"),
            ("spine1", (0, 0.40, 1.12), (0, 0.0, 1.10), "hips"),
            ("chest", (0, 0.0, 1.10), (0, -0.38, 1.13), "spine1"),
            ("neck1", (0, -0.60, 0.86), (0, -0.69, 1.02), "chest"),
            ("neck2", (0, -0.69, 1.02), (0, -0.75, 1.17), "neck1"),
            ("neck3", (0, -0.75, 1.17), (0, -0.86, 1.28), "neck2"),
            ("head", (0, -0.86, 1.28), (0, -1.155, 1.03), "neck3"),
            ("jaw", (0, -0.88, 1.12), (0, -1.12, 0.99), "head"),
            ("ear.L", (0.12, -0.84, 1.28), (0.31, -0.83, 1.30), "head"),
            ("tail1", (0, 0.72, 1.22), (0, 0.81, 1.08), "hips"),
            ("tail2", (0, 0.81, 1.08), (0, 0.84, 0.80), "tail1"),
            ("tail3", (0, 0.84, 0.80), (0, 0.86, 0.55), "tail2"),
            ("tail4", (0, 0.86, 0.55), (0, 0.88, 0.30), "tail3"),
            ("scapula.L", (0.12, -0.36, 1.15), (0.18, -0.58, 0.85), "chest"),
            ("upperarm.L", (0.18, -0.58, 0.85), (0.17, -0.40, 0.60), "scapula.L"),
            ("forearm.L", (0.17, -0.40, 0.60), (0.165, -0.445, 0.35), "upperarm.L"),
            ("cannon.L", (0.165, -0.445, 0.35), (0.165, -0.465, 0.10), "forearm.L"),
            ("hoof.L", (0.165, -0.465, 0.10), (0.17, -0.60, 0.01), "cannon.L"),
            ("thigh.L", (0.16, 0.62, 0.95), (0.21, 0.50, 0.70), "hips"),
            ("shin.L", (0.21, 0.50, 0.70), (0.17, 0.63, 0.45), "thigh.L"),
            ("hcannon.L", (0.17, 0.63, 0.45), (0.177, 0.61, 0.10), "shin.L"),
            ("hhoof.L", (0.177, 0.61, 0.10), (0.18, 0.465, 0.01), "hcannon.L"),
        ],
        gait=dict(walk=(1.3, 0.95), walk_graze=(1.8, 0.4), trot=(0.8, 2.2), run=(0.6, 4.5), lift=(0.1, 0.09),
                  graze_z=0.1, graze_ahead=0.45, kneel_drop=0.36, kneel_back=0.22, lie_drop=0.45, lie_hind_y=-0.3, k=1.67, swish=True),
        regions=dict(kind="cattle", leg_z=(0.30, 0.38), hoof_z=(0.07, 0.095), face_y=(-0.93, -0.86), belly_z=(0.58, 0.7),
                     belly_x=(0.2, 0.26), horn_z=(1.37, 1.40), switch_z=(0.66, 0.72)),
    ),
    "horse": dict(
        src=os.path.join(RAW, "animals_20261014", "animals-models-20261014", "animal_horse", "textured.glb"),
        withers=1.48,                    # m, an Ili mare (docs/animals/aholo_animals_brief.md)
        withers_band=(0.3, 0.38),        # (its neck rises steeply in front of the withers, where the mane ends)
        voxel=0.006,
        lods=((7000, 1024), (2000, 512), (600, 256)),
        bones=[
            ("root", (0, 0, 0), (0, -0.3, 0), None),
            ("hips", (0, 0.35, 1.38), (0, 0.70, 1.40), "root"),
            ("spine1", (0, 0.35, 1.38), (0, 0.0, 1.30), "hips"),
            ("chest", (0, 0.0, 1.30), (0, -0.35, 1.33), "spine1"),
            ("neck1", (0, -0.55, 1.15), (0, -0.66, 1.36), "chest"),
            ("neck2", (0, -0.66, 1.36), (0, -0.75, 1.57), "neck1"),
            ("neck3", (0, -0.75, 1.57), (0, -0.85, 1.82), "neck2"),
            ("head", (0, -0.85, 1.82), (0, -1.25, 1.50), "neck3"),
            ("jaw", (0, -0.92, 1.66), (0, -1.22, 1.47), "head"),
            ("ear.L", (0.07, -0.86, 1.90), (0.12, -0.84, 2.0), "head"),
            ("tail1", (0, 0.70, 1.42), (0, 0.82, 1.22), "hips"),
            ("tail2", (0, 0.82, 1.22), (0, 0.90, 0.95), "tail1"),
            ("tail3", (0, 0.90, 0.95), (0, 0.97, 0.65), "tail2"),
            ("tail4", (0, 0.97, 0.65), (0, 1.03, 0.35), "tail3"),
            ("scapula.L", (0.10, -0.25, 1.40), (0.20, -0.60, 1.07), "chest"),
            ("upperarm.L", (0.20, -0.60, 1.07), (0.17, -0.40, 0.88), "scapula.L"),
            ("forearm.L", (0.17, -0.40, 0.88), (0.152, -0.455, 0.49), "upperarm.L"),
            ("cannon.L", (0.152, -0.455, 0.49), (0.152, -0.44, 0.19), "forearm.L"),
            ("hoof.L", (0.152, -0.44, 0.19), (0.16, -0.62, 0.012), "cannon.L"),
            ("thigh.L", (0.17, 0.60, 1.22), (0.22, 0.50, 0.92), "hips"),
            ("shin.L", (0.22, 0.50, 0.92), (0.19, 0.62, 0.55), "thigh.L"),
            ("hcannon.L", (0.19, 0.62, 0.55), (0.21, 0.545, 0.18), "shin.L"),
            ("hhoof.L", (0.21, 0.545, 0.18), (0.22, 0.33, 0.012), "hcannon.L"),
        ],
        gait=dict(walk=(1.1, 1.6), walk_graze=(1.6, 0.45), trot=(0.7, 3.4), run=(0.5, 6.0), lift=(0.15, 0.13),
                  graze_z=0.1, graze_ahead=0.5, kneel_drop=0.48, kneel_back=0.3, lie_drop=0.68, lie_hind_y=-0.42, k=2.0,
                  swish=True, rise="front"),
        regions=dict(kind="horse", leg_z=(0.52, 0.6), hoof_z=(0.07, 0.1), blaze_x=(0.022, 0.04), blaze_y=(-1.2, -0.97)),
    ),
    "dog": dict(
        src=os.path.join(RAW, "animals_20261015_dog", "animals-dog-20261015", "animal_dog", "textured.glb"),
        withers=0.70,                    # m, a Kazakh shepherd dog (tobet) (docs/animals/aholo_animals_brief.md)
        withers_band=(0.12, 0.28),
        voxel=0.005,
        lods=((5000, 1024), (1400, 512), (420, 256)),
        bones=[
            ("root", (0, 0, 0), (0, -0.2, 0), None),
            ("hips", (0, 0.20, 0.54), (0, 0.37, 0.53), "root"),
            ("spine1", (0, 0.20, 0.54), (0, -0.02, 0.55), "hips"),
            ("chest", (0, -0.02, 0.55), (0, -0.20, 0.57), "spine1"),
            ("neck1", (0, -0.25, 0.47), (0, -0.29, 0.56), "chest"),
            ("neck2", (0, -0.29, 0.56), (0, -0.31, 0.63), "neck1"),
            ("neck3", (0, -0.31, 0.63), (0, -0.33, 0.70), "neck2"),
            ("head", (0, -0.33, 0.70), (0, -0.54, 0.665), "neck3"),
            ("jaw", (0, -0.36, 0.64), (0, -0.52, 0.62), "head"),
            ("ear.L", (0.06, -0.34, 0.77), (0.11, -0.35, 0.69), "head"),
            ("tail1", (0, 0.38, 0.55), (0, 0.43, 0.42), "hips"),
            ("tail2", (0, 0.43, 0.42), (0, 0.475, 0.31), "tail1"),
            ("tail3", (0, 0.475, 0.31), (0, 0.51, 0.22), "tail2"),
            ("scapula.L", (0.05, -0.15, 0.62), (0.10, -0.28, 0.48), "chest"),
            ("upperarm.L", (0.10, -0.28, 0.48), (0.095, -0.165, 0.36), "scapula.L"),
            ("forearm.L", (0.095, -0.165, 0.36), (0.095, -0.195, 0.10), "upperarm.L"),
            ("cannon.L", (0.095, -0.195, 0.10), (0.095, -0.215, 0.035), "forearm.L"),
            ("hoof.L", (0.095, -0.215, 0.035), (0.095, -0.28, 0.01), "cannon.L"),
            ("thigh.L", (0.08, 0.37, 0.50), (0.10, 0.30, 0.38), "hips"),
            ("shin.L", (0.10, 0.30, 0.38), (0.085, 0.375, 0.185), "thigh.L"),
            ("hcannon.L", (0.085, 0.375, 0.185), (0.085, 0.36, 0.035), "shin.L"),
            ("hhoof.L", (0.085, 0.36, 0.035), (0.085, 0.29, 0.01), "hcannon.L"),
        ],
        gait=dict(walk=(0.8, 0.9), walk_graze=(1.0, 0.45), trot=(0.45, 2.2), run=(0.4, 4.4), lift=(0.06, 0.06),
                  graze_z=0.1, graze_ahead=0.15, kneel_drop=0.2, kneel_back=0.1, lie_drop=0.3, lie_hind_y=-0.12, k=0.93,
                  sniff=True, pant=True, wag=True, down="hind", rise="front", sit_drop=0.06, sit_y=0.0, sphinx_y=0.17,
                  hock_z=0.035),
        regions=dict(kind="dog", hoof_z=(0.0, 0.0), leg_z=(0.0, 0.01), saddle_z=0.07, saddle_y=(-0.16, 0.38), mask_y=(-0.47, -0.43),
                     nose_y=(-0.53, -0.51)),
    ),
    "marmot": dict(
        src=os.path.join(RAW, "animals_20261014", "animals-models-20261014", "animal_marmot", "textured.glb"),
        withers=0.33,                    # m: 0.5 m nose to rump (grey marmot head and body 47-65 cm)
        voxel=0.003,
        lods=((3000, 512), (900, 256), (280, 128)),
        # (measured at 0.22 m withers; x1.5 to the scale above)
        bones=[(n, tuple(1.5 * c for c in h), tuple(1.5 * c for c in t), par) for n, h, t, par in [
            ("root", (0, 0, 0), (0, -0.1, 0), None),
            ("hips", (0, 0.06, 0.15), (0, 0.13, 0.12), "root"),
            ("spine1", (0, 0.06, 0.15), (0, -0.03, 0.155), "hips"),
            ("chest", (0, -0.03, 0.155), (0, -0.09, 0.16), "spine1"),
            ("neck1", (0, -0.10, 0.13), (0, -0.115, 0.155), "chest"),
            ("neck2", (0, -0.115, 0.155), (0, -0.125, 0.18), "neck1"),
            ("neck3", (0, -0.125, 0.18), (0, -0.13, 0.20), "neck2"),
            ("head", (0, -0.13, 0.20), (0, -0.20, 0.19), "neck3"),
            ("jaw", (0, -0.14, 0.17), (0, -0.195, 0.165), "head"),
            ("ear.L", (0.035, -0.125, 0.215), (0.045, -0.125, 0.235), "head"),
            ("tail1", (0, 0.13, 0.095), (0, 0.175, 0.085), "hips"),
            ("tail2", (0, 0.175, 0.085), (0, 0.222, 0.075), "tail1"),
            ("scapula.L", (0.03, -0.06, 0.18), (0.05, -0.112, 0.11), "chest"),
            ("upperarm.L", (0.05, -0.112, 0.11), (0.05, -0.09, 0.064), "scapula.L"),
            ("forearm.L", (0.05, -0.09, 0.064), (0.05, -0.10, 0.02), "upperarm.L"),
            ("cannon.L", (0.05, -0.10, 0.02), (0.05, -0.115, 0.008), "forearm.L"),
            ("hoof.L", (0.05, -0.115, 0.008), (0.05, -0.135, 0.003), "cannon.L"),
            ("thigh.L", (0.045, 0.077, 0.11), (0.055, 0.056, 0.064), "hips"),
            ("shin.L", (0.055, 0.056, 0.064), (0.05, 0.089, 0.023), "thigh.L"),
            ("hcannon.L", (0.05, 0.089, 0.023), (0.05, 0.065, 0.006), "shin.L"),
            ("hhoof.L", (0.05, 0.065, 0.006), (0.05, 0.05, 0.002), "hcannon.L"),
        ]],
        gait=dict(walk=(0.5, 0.4), walk_graze=(0.7, 0.2), trot=(0.35, 1.2), run=(0.3, 3.0), lift=(0.03, 0.03),
                  graze_z=0.05, graze_ahead=0.06, kneel_drop=0.06, kneel_back=0.03, lie_drop=0.075, lie_hind_y=-0.03, k=0.45,
                  down="hind", rise="front", sit_drop=0.0, sit_y=0.0, sphinx_y=0.04, hock_z=0.012, sentinel=True),
        regions=dict(kind="marmot", hoof_z=(0.0, 0.0), leg_z=(0.0, 0.01), back_z=0.04, back_y=(-0.15, 0.2), face_y=(-0.28, -0.25)),
    ),
    "eagle": dict(
        src=os.path.join(RAW, "animals_20261014", "animals-models-20261014", "animal_golden_eagle", "textured_attempt3.glb"),
        bird=True, span=2.0, level=24,   # m wingspan, an adult golden eagle (docs/animals/aholo_animals_brief.md)
        voxel=0.0025,
        lods=((4000, 1024), (2000, 512), (900, 256)),     # (mostly seen far off, and only a few)
        bones=[
            ("root", (0, 0, 0), (0, -0.2, 0), None),
            ("hips", (0, 0.15, 0.06), (0, -0.22, 0.09), "root"),        # the body, rump to chest
            ("neck1", (0, -0.22, 0.09), (0, -0.33, 0.11), "hips"),
            ("head", (0, -0.33, 0.11), (0, -0.49, 0.05), "neck1"),
            ("tail1", (0, 0.18, 0.07), (0, 0.33, 0.05), "hips"),
            ("tail2", (0, 0.33, 0.05), (0, 0.49, 0.02), "tail1"),
            ("upperwing.L", (0.07, -0.20, 0.11), (0.33, -0.25, 0.10), "hips"),
            ("forewing.L", (0.33, -0.25, 0.10), (0.62, -0.29, 0.08), "upperwing.L"),
            ("hand.L", (0.62, -0.29, 0.08), (1.0, -0.28, 0.06), "forewing.L"),
        ],
        regions=dict(kind="bird", hoof_z=(0.0, 0.0), leg_z=(0.0, 0.01), beak_y=(-0.46, -0.43), feet_z=(-0.13, -0.1)),
    ),
    # the young: the adult's model and skeleton re-proportioned (per bone: across, along, across), then the whole
    # set at the young's height; its clips solved anew on the young skeleton
    "foal": dict(
        base="horse", withers=1.18,      # m, a 3-5-month foal in midsummer
        young=[(("upperarm", "forearm", "cannon", "hoof", "thigh", "shin", "hcannon", "hhoof"), (0.82, 1.12, 0.82)),
               (("hips", "spine1", "chest"), (0.85, 0.86, 0.85)), (("scapula",), (0.9, 1.0, 0.9)),
               (("neck1", "neck2", "neck3"), (0.8, 0.84, 0.8)), (("head", "jaw", "ear"), (1.1, 1.06, 1.1)),
               (("tail",), (0.8, 0.6, 0.8))],
    ),
    "lamb": dict(
        base="sheep", withers=0.52,      # m, a lamb of 3-4 months
        young=[(("upperarm", "forearm", "cannon", "hoof", "thigh", "shin", "hcannon", "hhoof"), (0.85, 1.15, 0.85)),
               (("hips", "spine1", "chest"), (0.8, 0.85, 0.8)), (("scapula",), (0.9, 1.0, 0.9)),
               (("neck1", "neck2", "neck3"), (0.85, 0.9, 0.85)), (("head", "jaw", "ear"), (1.12, 1.1, 1.12)),
               (("tail",), (0.55, 0.55, 0.55))],
    ),
}
WEB = os.path.join(ROOT, "web", "public", "assets")


def out_dir(sp_id):
    d = os.path.join(ROOT, "assets", "src", "animals", sp_id)
    os.makedirs(d, exist_ok=True)
    return d


def log(*a):
    print("[animal]", *a, flush=True)


def tris(ob):
    return sum(len(p.vertices) - 2 for p in ob.data.polygons)


def verts(ob):
    a = np.zeros(len(ob.data.vertices) * 3)
    ob.data.vertices.foreach_get("co", a)
    return a.reshape(-1, 3)


def select(ob):
    bpy.ops.object.select_all(action="DESELECT")
    ob.select_set(True)
    bpy.context.view_layer.objects.active = ob


def components(bm):
    """the vertex indices of each connected piece, largest first"""
    bm.verts.ensure_lookup_table()
    seen = np.zeros(len(bm.verts), bool)
    out = []
    for v in bm.verts:
        if seen[v.index]:
            continue
        st, idx = [v], []
        seen[v.index] = True
        while st:
            x = st.pop(); idx.append(x.index)
            for e in x.link_edges:
                y = e.other_vert(x)
                if not seen[y.index]:
                    seen[y.index] = True; st.append(y)
        out.append(idx)
    out.sort(key=len, reverse=True)
    return out


# ------------------------------------------------------------------------------------------------ prep
def import_raw(path):
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=path)
    new = [o for o in bpy.data.objects if o not in before]
    meshes = [o for o in new if o.type == "MESH"]
    select(meshes[0])
    for o in meshes:
        o.select_set(True)
    if len(meshes) > 1:
        bpy.ops.object.join()
    ob = bpy.context.view_layer.objects.active
    mw = ob.matrix_world.copy(); ob.parent = None; ob.matrix_world = mw
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    for o in new:
        if o is not ob and o.name in bpy.data.objects:
            bpy.data.objects.remove(o)
    bm = bmesh.new(); bm.from_mesh(ob.data)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=max(ob.dimensions) * 1e-5)
    bm.to_mesh(ob.data); bm.free(); ob.data.update()
    ob.name = "raw"
    # only its colour: the metal/roughness maps unlinked (the scene shades with the colour alone)
    mat = ob.material_slots[0].material
    nt = mat.node_tree
    bsdf = next(n for n in nt.nodes if n.type == "BSDF_PRINCIPLED")
    for k in ("Metallic", "Roughness"):
        for l in list(bsdf.inputs[k].links):
            nt.links.remove(l)
    bsdf.inputs["Metallic"].default_value = 0.0
    return ob


def feet(P, frac=0.012):
    """the four hooves: the lowest points, split left/right and front/back; their centres (x, y, z)"""
    z0 = P[:, 2].min(); h = P[:, 2].max() - z0
    F = P[P[:, 2] < z0 + frac * h]
    ym = np.median(F[:, 1]); xm = np.median(F[:, 0])
    out = {}
    for side, sx in (("L", 1), ("R", -1)):       # Blender's +x is the animal's left when it faces -y
        for end, fy in (("front", -1), ("hind", 1)):
            m = (np.sign(F[:, 0] - xm) == sx) & (np.sign(F[:, 1] - ym) == fy)
            out[(end, side)] = F[m].mean(0)
    return out


def orient(ob):
    """turned about the vertical so it stands along y, head toward -y: the long side of the rectangle of its
    four feet is its length; the head end is the one reaching higher"""
    P = verts(ob)
    z0, h = P[:, 2].min(), np.ptp(P[:, 2])
    F = P[P[:, 2] < z0 + 0.012 * h][:, :2]
    ev, evec = np.linalg.eigh(np.cov((F - F.mean(0)).T))
    mx, my = evec[:, np.argmax(ev)]
    a = math.atan2(mx, my)
    ob.data.transform(Matrix.Rotation(a, 4, "Z"))
    P = verts(ob)
    cy = P[P[:, 2] < z0 + 0.012 * h][:, 1].mean()
    if P[P[:, 1] > cy, 2].max() > P[P[:, 1] < cy, 2].max():
        ob.data.transform(Matrix.Rotation(math.pi, 4, "Z"))
        a += math.pi
    ob.data.update()
    log(f"turned {math.degrees(a):.1f} deg about the vertical (feet {np.sqrt(ev.max()):.3f} x {np.sqrt(ev.min()):.3f} raw)")


def set_in_flight(ob, span, level=0.0):
    """a bird in its gliding pose (wings along x, head toward -y): levelled (turned nose-down by `level` deg: the
    model came pitched up, body and wings alike), scaled to its wingspan, centred on its body (the middle of the
    part narrower than a quarter of the span: the body, not the wings)"""
    ob.data.transform(Matrix.Rotation(math.radians(level), 4, "X"))
    P = verts(ob)
    s = span / np.ptp(P[:, 0])
    W = np.ptp(P[:, 0])
    body = P[np.abs(P[:, 0] - (P[:, 0].min() + P[:, 0].max()) / 2) < 0.08 * W]
    c = (body.min(0) + body.max(0)) / 2
    c[0] = (P[:, 0].min() + P[:, 0].max()) / 2
    ob.data.transform(Matrix.Diagonal((s, s, s, 1)) @ Matrix.Translation(Vector(-c)))
    ob.data.update()
    P = verts(ob)
    log(f"bird: scaled x{s:.4f} to a {span} m span; extent {np.ptp(P, 0).round(3)}")


def set_on_feet(ob, withers, band=(0.0, 0.15)):
    """moved and scaled: hooves on z=0, centred between them, withers at the real height (the top of the back
    over `band`, fractions of the way from the fore to the hind feet: where the mane ends on a horse)"""
    P = verts(ob)
    ft = feet(P)
    c = np.mean(list(ft.values()), 0)
    floor = P[:, 2].min()
    yf = (ft[("front", "L")][1] + ft[("front", "R")][1]) / 2
    yh = (ft[("hind", "L")][1] + ft[("hind", "R")][1]) / 2
    W = P[:, 0].max() - P[:, 0].min()
    # withers: the top of the back just behind the front legs, on the middle line
    band = (P[:, 1] > yf + band[0] * (yh - yf)) & (P[:, 1] < yf + band[1] * (yh - yf)) & (np.abs(P[:, 0] - c[0]) < 0.12 * W)
    top = P[band, 2].max()
    s = withers / (top - floor)
    ob.data.transform(Matrix.Diagonal((s, s, s, 1)) @ Matrix.Translation((-c[0], -c[1], -floor)))
    ob.data.update()
    log(f"scaled x{s:.4f}: withers {top - floor:.3f} -> {withers} m; feet front y {(yf - c[1]) * s:.3f} "
        f"hind y {(yh - c[1]) * s:.3f}; size {tuple(round(x, 3) for x in ob.dimensions)}")
    return s


def remesh(raw, voxel):
    """one closed skin round everything (the overlapping shells and the holes gone), its largest piece"""
    me = raw.data.copy()
    ob = bpy.data.objects.new("skin", me)
    bpy.context.scene.collection.objects.link(ob)
    ob.data.materials.clear()
    m = ob.modifiers.new("vox", "REMESH")
    m.mode = "VOXEL"; m.voxel_size = voxel; m.adaptivity = 0.0
    select(ob)
    bpy.ops.object.modifier_apply(modifier="vox")
    bm = bmesh.new(); bm.from_mesh(ob.data)
    comps = components(bm)
    if len(comps) > 1:
        keep = set(comps[0])
        bmesh.ops.delete(bm, geom=[v for v in bm.verts if v.index not in keep], context="VERTS")
        log(f"remesh: dropped {len(comps) - 1} loose pieces ({sum(len(c) for c in comps[1:])} vertices)")
    bm.to_mesh(ob.data); bm.free(); ob.data.update()
    log(f"remesh {voxel * 1000:.0f} mm: {tris(ob)} triangles")
    return ob


def decimate(skin, n, name):
    me = skin.data.copy()
    ob = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(ob)
    m = ob.modifiers.new("dec", "DECIMATE")
    m.decimate_type = "COLLAPSE"; m.ratio = n / tris(skin)
    m.use_symmetry = True; m.symmetry_axis = "X"; m.use_collapse_triangulate = True
    select(ob)
    bpy.ops.object.modifier_apply(modifier="dec")
    for p in ob.data.polygons:
        p.use_smooth = True
    log(f"{name}: {tris(ob)} triangles")
    return ob


def unwrap(ob):
    select(ob)
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.smart_project(angle_limit=math.radians(60), island_margin=0.006, area_weight=0.0, scale_to_bounds=False)
    bpy.ops.uv.pack_islands(rotate=True, margin=0.004, shape_method="CONCAVE")
    bpy.ops.object.mode_set(mode="OBJECT")


def bake(raw, low, size, d, cage=0.025):
    """the raw model's colour and normals onto the low one's new UVs (Cycles, selected to active)"""
    sc = bpy.context.scene
    sc.render.engine = "CYCLES"; sc.cycles.device = "CPU"; sc.cycles.samples = 4
    out = {}
    for kind in ("color", "normal"):
        img = bpy.data.images.new(f"{low.name}_{kind}", size, size, alpha=True, float_buffer=(kind == "normal"))
        img.colorspace_settings.name = "sRGB" if kind == "color" else "Non-Color"
        img.pixels = np.zeros(size * size * 4, np.float32)          # alpha 0 = not reached by the bake
        mat = bpy.data.materials.new(f"{low.name}_bake"); mat.use_nodes = True
        tex = mat.node_tree.nodes.new("ShaderNodeTexImage"); tex.image = img
        mat.node_tree.nodes.active = tex
        low.data.materials.clear(); low.data.materials.append(mat)
        bpy.ops.object.select_all(action="DESELECT")
        raw.select_set(True); low.select_set(True)
        bpy.context.view_layer.objects.active = low
        kw = dict(use_selected_to_active=True, cage_extrusion=cage, max_ray_distance=cage * 2.5, margin=0)
        if kind == "color":
            sc.render.bake.use_pass_direct = False; sc.render.bake.use_pass_indirect = False
            sc.render.bake.use_pass_color = True
            bpy.ops.object.bake(type="DIFFUSE", pass_filter={"COLOR"}, **kw)
        else:
            bpy.ops.object.bake(type="NORMAL", normal_space="TANGENT", **kw)
        a = np.array(img.pixels[:], np.float32).reshape(size, size, 4)
        known = a[..., 3] > 0.5
        # islands padded outwards (no seams on the far levels' mip maps)
        _pad(a, known, 12)
        a[..., 3] = 1.0
        img.pixels = a.ravel()
        path = os.path.join(d, f"{low.name}_{kind}.png")
        img.filepath_raw = path; img.file_format = "PNG"; img.save()
        out[kind] = img
        log(f"baked {low.name} {kind} {size}px: {known.mean() * 100:.0f}% of the texture covered")
        bpy.data.materials.remove(mat)
    return out


def _pad(a, known, steps):
    K = known.copy()
    for _ in range(steps):
        acc = np.zeros(a.shape[:2] + (3,), np.float32); cnt = np.zeros(K.shape, np.float32)
        for dy in (-1, 0, 1):
            for dx in (-1, 0, 1):
                if dy or dx:
                    sh = np.roll(np.roll(K, dy, 0), dx, 1)
                    acc += np.roll(np.roll(a[..., :3], dy, 0), dx, 1) * sh[..., None]; cnt += sh
        new = (cnt > 0) & ~K
        if not new.any():
            break
        a[new, :3] = acc[new] / cnt[new][:, None]
        K |= new


def prep(sp_id):
    sp = SPECIES[sp_id]
    d = out_dir(sp_id)
    bpy.ops.wm.read_factory_settings(use_empty=True)
    raw = import_raw(sp["src"])
    log(f"raw: {tris(raw)} triangles")
    if sp.get("bird"):
        set_in_flight(raw, sp["span"], sp.get("level", 0.0))
    else:
        orient(raw)
        set_on_feet(raw, sp["withers"], sp.get("withers_band", (0.0, 0.15)))
    skin = remesh(raw, sp["voxel"])
    for i, (n, size) in enumerate(sp["lods"]):
        low = decimate(skin, n, f"lod{i}")
        unwrap(low)
        imgs = bake(raw, low, size, d, cage=0.025 + 0.006 * i)
        mat = bpy.data.materials.new(f"{sp_id}_lod{i}"); mat.use_nodes = True
        nt = mat.node_tree
        bsdf = nt.nodes["Principled BSDF"]
        t = nt.nodes.new("ShaderNodeTexImage"); t.image = imgs["color"]
        nt.links.new(t.outputs[0], bsdf.inputs["Base Color"])
        tn = nt.nodes.new("ShaderNodeTexImage"); tn.image = imgs["normal"]
        nm = nt.nodes.new("ShaderNodeNormalMap")
        nt.links.new(tn.outputs[0], nm.inputs["Color"]); nt.links.new(nm.outputs[0], bsdf.inputs["Normal"])
        bsdf.inputs["Roughness"].default_value = 0.9
        low.data.materials.clear(); low.data.materials.append(mat)
    bpy.data.objects.remove(skin)
    raw.hide_render = True
    for im in bpy.data.images:
        if im.name.startswith("lod"):
            im.filepath = os.path.join(d, f"{im.name}.png")
    path = os.path.join(d, "prep.blend")
    bpy.ops.wm.save_as_mainfile(filepath=path, compress=True)
    log("saved", path)


# ------------------------------------------------------------------------------------------------ coat regions
def _neighbours(me):
    nb = [[] for _ in me.vertices]
    for e in me.edges:
        a, b = e.vertices
        nb[a].append(b); nb[b].append(a)
    return nb


def _smooth_field(f, nb, n=3):
    for _ in range(n):
        f = np.array([(f[i] + f[nb[i]].mean()) / 2 if len(nb[i]) else f[i] for i in range(len(f))])
    return f


def regions(ob, sp, log):
    """per vertex, in the rest pose (colour attribute "region", exported as COLOR_0), the parts a coat
    repaints over the body colour, in this order: r, then g, then a; b = kept as the texture has it.
      sheep:  r head (face, ears; the dark-headed coats), g the bare legs below the wool, b hooves
      cattle: r the face (the whitehead's), g the legs below knee and hock, a the underline (belly, brisket,
              udder), b hooves, horns, the tail switch"""
    me = ob.data
    P = verts(ob)
    xx, yy, zz = P[:, 0], P[:, 1], P[:, 2]
    names = {g.index: g.name for g in ob.vertex_groups}
    W = {}
    for v in me.vertices:
        for g in v.groups:
            W.setdefault(names[g.group], np.zeros(len(me.vertices)))[v.index] = g.weight
    zero = np.zeros(len(me.vertices))
    w = lambda *ns: sum((W.get(n, zero) for n in ns), zero.copy())
    ramp = lambda x, lo_hi: np.clip((x - lo_hi[0]) / (lo_hi[1] - lo_hi[0]), 0, 1)
    R = sp["regions"]
    legb = w(*[b_ + s_ for b_ in ("forearm", "cannon", "hoof", "shin", "hcannon", "hhoof") for s_ in (".L", ".R")])
    tails = [n for n in W if n.startswith("tail")]
    hoof = 1 - ramp(zz, R["hoof_z"])
    legs = (legb > 0.5) * (1 - ramp(zz, R["leg_z"]))
    nb = [np.array(x, int) for x in _neighbours(me)]
    if R["kind"] == "sheep":
        r = np.clip(w("head", "jaw", "ear.L", "ear.R") + 0.5 * w("neck3"), 0, 1)
        a = zero.copy()
        keep = hoof
    elif R["kind"] == "bird":
        # the golden crown and nape; the beak and feet kept
        r = np.clip(w("head") + 0.6 * w("neck1"), 0, 1) * (zz > 0.06)
        a = zero.copy(); legs = zero.copy()
        keep = np.maximum((1 - ramp(yy, R["beak_y"])) * (w("head") > 0.5), 1 - ramp(zz, R["feet_z"]))
    elif R["kind"] == "marmot":
        # the darker back, the paler muzzle; nothing kept
        top = np.array([zz[np.abs(yy - y) < 0.015].max() if (np.abs(yy - y) < 0.015).any() else 0 for y in yy])
        r = (zz > top - R["back_z"]) * (yy > R["back_y"][0]) * (yy < R["back_y"][1]) * 1.0
        a = w("head", "jaw") * (1 - ramp(yy, R["face_y"]))
        keep = zero.copy(); legs = zero.copy()
        a = _smooth_field(a, nb, 2)
    elif R["kind"] == "dog":
        # the back's saddle (the dark-backed coats): the top of the body between withers and croup, and the tail;
        # the muzzle's mask; the black nose kept
        top = np.array([zz[np.abs(yy - y) < 0.02].max() if (np.abs(yy - y) < 0.02).any() else 0 for y in yy])
        r = (zz > top - R["saddle_z"]) * (yy > R["saddle_y"][0]) * (yy < R["saddle_y"][1]) * (w("head", "neck3", "jaw") < 0.3)
        r = np.clip(r + w(*tails) * 0.8, 0, 1)
        a = w("head", "jaw") * (1 - ramp(yy, R["mask_y"]))
        keep = (1 - ramp(yy, R["nose_y"])) * (w("head") > 0.5)
        legs = zero.copy()
        a = _smooth_field(a, nb, 2)
    elif R["kind"] == "horse":
        # the mane and forelock: the dark hair on the neck and head (from the baked colour; not the dark muzzle);
        # the tail is all hair
        lum, sat = _vertex_lum(ob)
        mane = (lum < 0.33) * (sat < 0.09) * (w("neck1", "neck2", "neck3", "head") > 0.5) * (yy > -1.02) * (zz > 1.0)
        r = np.clip(mane + w(*tails), 0, 1)
        nrm = np.array([v.normal[:] for v in me.vertices])
        front = (nrm[:, 1] * -0.55 + nrm[:, 2] * 0.83) > 0.55
        a = (w("head") > 0.5) * front * (1 - ramp(np.abs(xx), R["blaze_x"])) * (yy > R["blaze_y"][0]) * (yy < R["blaze_y"][1])
        a = a.astype(float)
        keep = hoof
    else:   # cattle
        r = np.clip(w("head", "jaw") * (1 - ramp(yy, R["face_y"])) - w("ear.L", "ear.R"), 0, 1)
        a = (1 - ramp(zz, R["belly_z"])) * (legb < 0.3) * (w(*tails) < 0.3) * (1 - ramp(np.abs(xx), R["belly_x"]))
        horns = ramp(zz, R["horn_z"]) * (yy < R["face_y"][1] + 0.1)
        switch = (w(*[t for t in tails if t >= "tail3"]) > 0.4) * (1 - ramp(zz, R["switch_z"]))
        keep = np.maximum.reduce([hoof, horns, switch])
        a = _smooth_field(a, nb, 3)
    r, legs = _smooth_field(r, nb, 3 if R["kind"] not in ("horse",) else 1), _smooth_field(legs, nb, 2)
    r = np.clip((r - 0.25) / 0.5, 0, 1)
    if R["kind"] == "horse":
        a = _smooth_field(a, nb, 1)
    attr = me.color_attributes.new("region", "FLOAT_COLOR", "POINT")
    col = np.c_[r, legs, keep, a].astype(np.float32)
    attr.data.foreach_set("color", col.ravel())
    me.color_attributes.active_color = attr
    return col


def _vertex_lum(ob):
    """each vertex's colour in its baked texture (mean over its corners): luminance and saturation (max - min; sRGB)"""
    me = ob.data
    img = next(n.image for n in me.materials[0].node_tree.nodes if n.type == "TEX_IMAGE" and n.image.name.endswith("_color"))
    W_, H_ = img.size
    px = np.array(img.pixels[:], np.float32).reshape(H_, W_, 4)
    uv = me.uv_layers.active.data
    acc = np.zeros((len(me.vertices), 3)); cnt = np.zeros(len(me.vertices))
    for l in me.loops:
        u, v = uv[l.index].uv
        acc[l.vertex_index] += px[min(int(v * H_), H_ - 1), min(int(u * W_), W_ - 1), :3]; cnt[l.vertex_index] += 1
    c = acc / np.maximum(cnt, 1)[:, None]
    return c @ np.array([0.3, 0.59, 0.11]), c.max(1) - c.min(1)


def region_colours(ob, col, img):
    """the texture's mean colour (sRGB) over the body and each region, weighted as the coat shader mixes them
    (web/src/animals.js): the shader repaints by coat / this mean"""
    me = ob.data
    W_, H_ = img.size
    px = np.array(img.pixels[:], np.float32).reshape(H_, W_, 4)
    uv = me.uv_layers.active.data
    acc = {k: np.zeros(3) for k in ("body", "r", "g", "a")}
    cnt = {k: 0.0 for k in acc}
    for l in me.loops:
        u, v = uv[l.index].uv
        c = px[min(int(v * H_), H_ - 1), min(int(u * W_), W_ - 1), :3]
        r, g, b, a = col[l.vertex_index]
        k = 1 - b
        for key, wt in (("a", a), ("g", g * (1 - a)), ("r", r * (1 - g) * (1 - a)), ("body", (1 - r) * (1 - g) * (1 - a))):
            acc[key] += c * wt * k; cnt[key] += wt * k
    out = {k: acc[k] / cnt[k] if cnt[k] > 1e-3 else acc["body"] / max(cnt["body"], 1e-6) for k in acc}
    return {k: [round(float(x), 4) for x in v] for k, v in out.items()}


# ------------------------------------------------------------------------------------------------ the young
def _weights(ob):
    names = {g.index: g.name for g in ob.vertex_groups}
    W = {}
    for v in ob.data.vertices:
        for g in v.groups:
            W.setdefault(names[g.group], np.zeros(len(ob.data.vertices)))[v.index] = g.weight
    return W


def _belly(P):
    """the underside of the body between the legs (min z of the middle third, narrow band)"""
    y0, y1 = np.percentile(P[:, 1], 30), np.percentile(P[:, 1], 60)
    m = (P[:, 1] > y0) & (P[:, 1] < y1) & (np.abs(P[:, 0]) < 0.12 * np.ptp(P[:, 0])) & (P[:, 2] > 0.15 * P[:, 2].max())
    return float(P[m, 2].min())


def make_young(arm, lods, spec, log):
    """the skeleton and each level's skin re-proportioned bone by bone (each bone scaled in its own frame about its
    head, its children carried along: longer, thinner legs; a shorter, slimmer body; a shorter, thinner neck; a
    bigger head; a shorter tail), the skin moved by the same per-bone transforms blended by its weights; then the
    whole lifted onto its feet and scaled to the young's withers height. Returns (scale, belly before, after)."""
    bones = arm.data.bones
    R = {b.name: b.matrix_local.copy() for b in bones}
    par = {b.name: (b.parent.name if b.parent else None) for b in bones}
    order, seen = [], set()

    def visit(n):
        if n not in seen:
            if par[n]:
                visit(par[n])
            seen.add(n); order.append(n)
    for b in bones:
        visit(b.name)

    def scale_of(n):
        base = n.split(".")[0]
        for names, sc in spec["young"]:
            if any(base == k or base.startswith(k) for k in names):
                return sc
        return (1.0, 1.0, 1.0)
    A = {}
    for n in order:
        sx, sy, sz = scale_of(n)
        head = R[n].translation.copy()
        new_head = (A[par[n]] @ head) if par[n] else head
        Rr = R[n].to_3x3().to_4x4()
        A[n] = Matrix.Translation(new_head) @ Rr @ Matrix.Diagonal((sx, sy, sz, 1)) @ Rr.inverted() @ Matrix.Translation(-head)
    P0 = verts(lods[0])
    belly0 = _belly(P0)

    def deform(ob):
        P = verts(ob)
        W = _weights(ob)
        out = np.zeros_like(P); tot = np.zeros(len(P))
        Ph = np.c_[P, np.ones(len(P))]
        for n, w in W.items():
            if n not in A:
                continue
            M = np.array(A[n])
            out += (Ph @ M.T)[:, :3] * w[:, None]; tot += w
        return out / np.maximum(tot, 1e-9)[:, None]
    Q = deform(lods[0])
    # onto its feet, at the young's withers (the top of the back over the shoulder blades)
    z0 = Q[:, 2].min()
    wy = (np.array(A["scapula.L"]) @ np.r_[R["scapula.L"].translation, 1])[1]
    band = (np.abs(Q[:, 1] - wy) < 0.04 * np.ptp(Q[:, 1])) & (np.abs(Q[:, 0]) < 0.1 * np.ptp(Q[:, 0]))
    g = spec["withers"] / (Q[band, 2].max() - z0)
    F = Matrix.Diagonal((g, g, g, 1)) @ Matrix.Translation((0, 0, -z0))
    for n in A:
        A[n] = F @ A[n]
    for o in lods:
        Pn = deform(o)
        o.data.vertices.foreach_set("co", Pn.astype(np.float32).ravel())
        o.data.update()
    bpy.ops.object.select_all(action="DESELECT")
    arm.select_set(True); bpy.context.view_layer.objects.active = arm
    bpy.ops.object.mode_set(mode="EDIT")
    for b in arm.data.edit_bones:
        h = A[b.name] @ R[b.name].translation
        t = A[b.name] @ (R[b.name] @ Vector((0, b.length, 0)))
        roll = b.roll
        b.head = h; b.tail = t; b.roll = roll
    bpy.ops.object.mode_set(mode="OBJECT")
    belly1 = _belly(verts(lods[0]))
    log(f"young: x{g:.3f} overall to {spec['withers']} m at the withers; belly {belly0:.3f} -> {belly1:.3f} m")
    return g, belly0, belly1


def young_gait(gait, kk, kb):
    """the adult's gait numbers for the young: distances by its size kk (the belly's height by kb), speeds and
    cycle times by the square root of it (the same Froude number: the same way of going)"""
    g = dict(gait)
    r = math.sqrt(kk)
    for key in ("walk", "walk_graze", "trot", "run"):
        T, v = g[key]
        g[key] = (T * r, v * r)
    g["lift"] = tuple(x * kk for x in g["lift"])
    for key in ("graze_z", "graze_ahead", "kneel_back", "lie_hind_y", "sit_drop", "sit_y", "sphinx_y", "hock_z", "k"):
        if key in g:
            g[key] = g[key] * kk
    for key in ("kneel_drop", "lie_drop"):
        g[key] = g[key] * kb
    return g


def young_stage(sp_id):
    sp = SPECIES[sp_id]
    base = SPECIES[sp["base"]]
    bpy.ops.wm.open_mainfile(filepath=os.path.join(out_dir(sp["base"]), "rig.blend"))
    for a in list(bpy.data.actions):
        bpy.data.actions.remove(a)
    arm = bpy.data.objects["rig"]
    lods = [bpy.data.objects[f"lod{i}"] for i in range(len(base["lods"]))]
    g, b0, b1 = make_young(arm, lods, sp, log)
    kk = sp["withers"] / base["withers"]
    gait = young_gait(base["gait"], kk, b1 / b0)
    rig = animal_rig.Rig(arm)
    seqs, meta = animal_clips.clips(rig, gait)
    finish(sp_id, arm, lods, rig, seqs, meta, regions_from=None)


def finish(sp_id, arm, lods, rig, seqs, meta, regions_from=SPECIES):
    """key the clips, the coat regions (unless kept from the adult), save, export"""
    for name, seq in seqs.items():
        rig.key(name, seq)
        meta[name]["frames"] = len(seq) - 1
        log(f"clip {name}: {len(seq) - 1} frames ({(len(seq) - 1) / animal_clips.FPS:.2f} s)")
    arm["clips"] = json.dumps(meta)
    if regions_from is not None:
        sp = regions_from[sp_id]
        for i, o in enumerate(lods):
            col = regions(o, sp, log)
            if i == 0:
                img = next(n.image for n in o.data.materials[0].node_tree.nodes if n.type == "TEX_IMAGE" and n.image.name.endswith("_color"))
                base = region_colours(o, col, img)
                arm["coat_base"] = json.dumps(base)
                arm["regions"] = sp["regions"]["kind"]
                log("region colours (texture means)", base)
    for o in lods:
        o.data.materials[0].name = f"{sp_id}_lod{lods.index(o)}"
    d = out_dir(sp_id)
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(d, "rig.blend"), compress=True)
    out = os.path.join(WEB, f"{sp_id}.glb")
    bpy.ops.object.select_all(action="DESELECT")
    arm.select_set(True)
    for o in lods:
        o.select_set(True)
    bpy.context.view_layer.objects.active = arm
    bpy.ops.export_scene.gltf(filepath=out, export_format="GLB", use_selection=True, export_skins=True,
                              export_animations=True, export_animation_mode="ACTIONS", export_anim_single_armature=True,
                              export_image_format="JPEG", export_image_quality=90, export_apply=False,
                              export_force_sampling=True, export_frame_step=1, export_extras=True, export_yup=True,
                              export_vertex_color="ACTIVE", export_all_vertex_colors=False)
    log("exported", out, os.path.getsize(out) // 1024, "KB")


# ------------------------------------------------------------------------------------------------ rig
def rig_stage(sp_id):
    sp = SPECIES[sp_id]
    d = out_dir(sp_id)
    bpy.ops.wm.open_mainfile(filepath=os.path.join(d, "prep.blend"))
    bpy.data.objects.remove(bpy.data.objects["raw"])
    lods = [bpy.data.objects[f"lod{i}"] for i in range(len(sp["lods"]))]
    arm = animal_rig.build_armature(sp["bones"])
    animal_rig.skin(arm, lods, log)
    rig = animal_rig.Rig(arm)
    seqs, meta = animal_clips.bird_clips(rig, sp) if sp.get("bird") else animal_clips.clips(rig, sp["gait"])
    finish(sp_id, arm, lods, rig, seqs, meta)


# ------------------------------------------------------------------------------------------------ looking
VIEWS = {"right": (1, 0, 0), "left": (-1, 0, 0), "front": (0, -1, 0), "back": (0, 1, 0), "top": (0, 0, 1),
         "34": (0.7, -0.7, 0.45), "34b": (-0.7, 0.7, 0.45), "low": (0.8, -0.5, 0.12)}


def render_views(objs, out, views=("right", "34", "front"), size=420, frame=None, ortho=None, center=None):
    """objs side by side? no: each view of all `objs` together, one row; Cycles, a sun and a sky"""
    sc = bpy.context.scene
    sc.render.engine = "CYCLES"; sc.cycles.samples = 16; sc.cycles.device = "CPU"
    sc.view_settings.view_transform = "Standard"
    sc.render.resolution_x = sc.render.resolution_y = size
    sc.render.film_transparent = False
    if not sc.world:
        sc.world = bpy.data.worlds.new("w")
    sc.world.use_nodes = True
    bg = sc.world.node_tree.nodes["Background"]
    bg.inputs["Color"].default_value = (0.75, 0.8, 0.85, 1); bg.inputs["Strength"].default_value = 0.9
    if "sun" not in bpy.data.objects:
        sun = bpy.data.objects.new("sun", bpy.data.lights.new("sun", "SUN")); sun.data.energy = 3.0
        sun.rotation_euler = (math.radians(40), 0, math.radians(35)); sc.collection.objects.link(sun)
    cam = bpy.data.objects.get("cam")
    if not cam:
        cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam")); cam.data.type = "ORTHO"
        sc.collection.objects.link(cam)
    sc.camera = cam
    if frame is not None:
        sc.frame_set(frame)
    dg = bpy.context.evaluated_depsgraph_get()
    P = np.concatenate([np.array([tuple(o.matrix_world @ v.co) for v in o.evaluated_get(dg).data.vertices]) for o in objs])
    lo, hi = P.min(0), P.max(0)
    c = Vector(center) if center else Vector(((lo + hi) / 2).tolist())
    ext = float((hi - lo).max())
    cam.data.ortho_scale = ortho or ext * 1.15
    shown = set(objs)
    for o in bpy.data.objects:
        if o.type == "MESH":
            o.hide_render = o not in shown
    tiles = []
    for k in views:
        d = Vector(VIEWS[k]).normalized()
        cam.location = c + d * ext * 3
        cam.rotation_euler = (-d).to_track_quat("-Z", "Y").to_euler()
        sc.render.filepath = out + f".{len(tiles)}.png"
        bpy.ops.render.render(write_still=True)
        r = bpy.data.images.load(sc.render.filepath)
        tiles.append(np.array(r.pixels[:], np.float32).reshape(size, size, 4))
        bpy.data.images.remove(r)
        os.remove(sc.render.filepath)
    return tiles


def save_rows(rows, out):
    rows = [np.concatenate(r, 1) for r in rows]
    w = max(r.shape[1] for r in rows)
    rows = [np.pad(r, ((0, 0), (0, w - r.shape[1]), (0, 0)), constant_values=1) for r in rows]
    img = np.concatenate(rows[::-1], 0)
    o = bpy.data.images.new("rows", img.shape[1], img.shape[0]); o.pixels = img.ravel()
    o.filepath_raw = out; o.file_format = "JPEG"; o.save()
    bpy.data.images.remove(o)
    log("saved", out)


def measure(sp_id, out):
    """for writing the joint table: the side profile (back and belly lines), each leg's centre line and
    radius by height (knees, hocks and fetlocks show as bulges), and side / front views on a 5 cm grid"""
    bpy.ops.wm.open_mainfile(filepath=os.path.join(out_dir(sp_id), "prep.blend"))
    P = verts(bpy.data.objects["raw"])
    H = P[:, 2].max()
    log(f"bounds {P.min(0).round(3)} {P.max(0).round(3)}")
    step = round(max(0.02, (P[:, 1].max() - P[:, 1].min()) / 40), 3)
    print("   y      top    bottom(middle band)   |x|max")
    for y in np.arange(P[:, 1].min(), P[:, 1].max(), step):
        m = np.abs(P[:, 1] - y) < step / 2
        mm = m & (np.abs(P[:, 0]) < 0.06 * H)
        if mm.any():
            print(f"  {y:+.3f}  {P[mm, 2].max():.3f}  {P[mm, 2].min():.3f}   {P[m, 0].max():.3f}")
    ft = feet(P)
    for (end, side), c in ft.items():
        print(f"{end} {side} foot {c.round(3)}")
        cx, cy = c[0], c[1]
        for z in np.arange(0.01 * H, 0.62 * H, 0.025 * H):
            m = (np.abs(P[:, 2] - z) < 0.006 * H) & (np.hypot(P[:, 0] - cx, P[:, 1] - cy) < 0.08 * H)
            if m.sum() < 5:
                continue
            q = P[m]; cx, cy = q[:, 0].mean(), q[:, 1].mean()
            r = np.median(np.hypot(q[:, 0] - cx, q[:, 1] - cy))
            print(f"   z {z:.3f}  c ({cx:+.3f},{cy:+.3f})  r {r:.3f}  y [{q[:, 1].min():+.3f},{q[:, 1].max():+.3f}]  n {m.sum()}")
    ob = bpy.data.objects["lod0"]
    ext = P.max(0) - P.min(0)
    rows = []
    for view, c, sz in (("right", (0, (P[:, 1].min() + P[:, 1].max()) / 2, H / 2), max(ext[1], ext[2]) * 1.08),
                        ("front", (0, 0, H * 0.62), H * 0.8)):
        c = (round(c[0] / 0.05) * 0.05, round(c[1] / 0.05) * 0.05, round(c[2] / 0.05) * 0.05)
        R_ = 900
        t = render_views([ob], out + ".tmp", (view,), R_, center=c, ortho=sz)[0]
        for k in np.arange(-3, 3, 0.05):
            ip = int(round((k / sz + 0.5) * R_))
            if 0 <= ip < R_:
                strong = abs(round(k * 100) % 10) == 0
                col = np.array([0.9, 0.2, 0.2, 1]) if strong else np.array([0.3, 0.3, 0.9, 1])
                t[:, ip] = t[:, ip] * 0.5 + col * 0.5
                t[ip, :] = t[ip, :] * 0.5 + col * 0.5
        rows.append([t])
        log(f"grid {view}: centre {c}, {sz:.3f} m across; lines every 5 cm, red at multiples of 10 cm from the centre")
    save_rows(rows, out)


def look_prep(sp_id, out):
    bpy.ops.wm.open_mainfile(filepath=os.path.join(out_dir(sp_id), "prep.blend"))
    rows = []
    raw = bpy.data.objects["raw"]
    for o in [raw] + [bpy.data.objects[f"lod{i}"] for i in range(3)]:
        rows.append(render_views([o], out + ".tmp", ("right", "34", "front", "back"), 360))
    save_rows(rows, out)


def look_rig(sp_id, out, clips=None, per=6, view="right", size=230):
    """each clip a row of `per` frames, the camera still (so the motion shows), the finest level"""
    bpy.ops.wm.open_mainfile(filepath=os.path.join(out_dir(sp_id), "rig.blend"))
    arm = bpy.data.objects["rig"]
    ob = bpy.data.objects["lod0"]
    meta = json.loads(arm["clips"])
    rows = []
    for name in (clips or list(meta)):
        arm.animation_data.action = bpy.data.actions[name]
        n = meta[name]["frames"]
        fr = [round(i * n / (per - (1 if not meta[name]["loop"] else 0))) for i in range(per)]
        row = []
        for f in fr:
            H = SPECIES[sp_id]["withers"]
            row += render_views([ob], out + ".tmp", (view,), size, frame=f, ortho=1.25 * H / 0.75 * 1.4, center=(0, -0.1 * H / 0.75, 0.45 * H / 0.75))
        rows.append(row)
        log("rendered", name, fr)
    save_rows(rows, out)


if __name__ == "__main__":
    tail = [a for a in sys.argv[1:] if not a.endswith(".py") and not a.startswith("-")]
    sp_id = tail[0]
    stage = tail[1] if len(tail) > 1 else "all"
    if stage in ("prep", "all") and not SPECIES[sp_id].get("base"):
        prep(sp_id)
    if stage in ("rig", "all"):
        young_stage(sp_id) if SPECIES[sp_id].get("base") else rig_stage(sp_id)
    if stage == "look_rig":
        look_rig(sp_id, tail[2], tail[3].split(",") if len(tail) > 3 else None)
    if stage == "measure":
        measure(sp_id, tail[2])
    if stage == "look_prep":
        look_prep(sp_id, tail[2])
