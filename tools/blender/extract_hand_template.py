"""The stylized hand of Blender Studio's Human Base Meshes (CC0; assets/src/basemesh_dl, from blender.org's asset
bundles, v1.4.1) kept as a small file for the builds: assets/src/hands/stylized_hand.npz -- its vertices, faces,
UVs and face sets (the bundle's sculpt face sets: the wrist, its cap, the palm, three a finger and the thumb).
Read without running anything in the .blend (bpy.data.libraries.load).

Run: tools/.bpy/bin/python -I tools/blender/extract_hand_template.py
"""
import os, sys
import numpy as np
import bpy

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
SRC = os.path.join(ROOT, "assets", "src", "basemesh_dl", "human-base-meshes-bundle-v1.4.1", "human_base_meshes_bundle.blend")
OUT = os.path.join(ROOT, "assets", "src", "hands", "stylized_hand.npz")

bpy.ops.wm.read_factory_settings(use_empty=True)
with bpy.data.libraries.load(SRC, link=False) as (src, dst):
    dst.meshes = []
    dst.objects = ["Hand - Stylized "]
me = dst.objects[0].data
co = np.empty(len(me.vertices) * 3, np.float32); me.vertices.foreach_get("co", co)
loops = np.empty(len(me.loops), np.int32); me.loops.foreach_get("vertex_index", loops)
lens = np.empty(len(me.polygons), np.int32); me.polygons.foreach_get("loop_total", lens)
uv = np.empty(len(me.loops) * 2, np.float32); me.uv_layers["UVMap"].data.foreach_get("uv", uv)
fs = np.empty(len(me.polygons), np.int32); me.attributes[".sculpt_face_set"].data.foreach_get("value", fs)
np.savez_compressed(OUT, co=co.reshape(-1, 3), loops=loops, lens=lens, uv=uv.reshape(-1, 2), fs=fs)
print("saved", OUT, len(me.vertices), "vertices", len(me.polygons), "faces", os.path.getsize(OUT), "bytes")
