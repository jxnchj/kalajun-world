"""Fresh-process reopen validation of the material-only derivative."""
from pathlib import Path
import bpy,json,hashlib
import numpy as np
ROOT=Path(__file__).resolve().parents[2]
report=json.loads((ROOT/'tools/reports/lodge-wood-blend-v38.json').read_text())
def digest(o):
 h=hashlib.sha256()
 for a in ([tuple(v.co) for v in o.data.vertices],[l.vertex_index for l in o.data.loops],[tuple(n.vector) for n in o.data.corner_normals]):h.update(np.array(a,dtype='<f8').tobytes())
 for a in o.data.color_attributes:h.update(np.array([tuple(v.color) for v in a.data],dtype='<f4').tobytes())
 for uv in o.data.uv_layers:
  if uv.name!='LodgeWood38':h.update(np.array([tuple(v.uv) for v in uv.data],dtype='<f4').tobytes())
 return h.hexdigest()
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(ROOT/'web/public/assets/gh_lanchuan_lodge.glb'),merge_vertices=False)
before={o.name:digest(o) for o in bpy.context.scene.objects if o.type=='MESH'}
bpy.ops.wm.open_mainfile(filepath=str(ROOT/report['derivedBlend']))
after={o.name:digest(o) for o in bpy.context.scene.objects if o.type=='MESH'}
assert before==after,'original geometry, normals, AO or UV changed'
for rec in report['nodes']:
 o=bpy.data.objects[rec['node']]
 assert o.data.uv_layers.get('LodgeWood38') and o.data.attributes.get('LodgeWoodSeed38')
 assert sum(o.data.materials[f.material_index].name.startswith('lodge38 ') for f in o.data.polygons)==rec['assignedFaces']
for m in bpy.data.materials:
 if m.name.startswith('lodge38 '):assert m.use_nodes and any(n.type=='TEX_IMAGE' and n.image.packed_file for n in m.node_tree.nodes)
report.update(reopened=True,originalMeshCount=len(before),originalGeometryNormalsAOAndUVUnchangedAfterReopen=True,derivedBytes=(ROOT/report['derivedBlend']).stat().st_size)
(ROOT/'tools/reports/lodge-wood-blend-v38.json').write_text(json.dumps(report,indent=2)+'\n')
print('REOPEN VERIFIED',len(before),'original meshes')
