import bpy,json,hashlib
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
bpy.ops.wm.open_mainfile(filepath=str(ROOT/'assets/src/v2/pastoral/pasture-life41.blend'));bpy.context.view_layer.update()
rows=[]
for o in bpy.context.scene.objects:
 if o.type!='MESH':continue
 o.data.calc_loop_triangles();v=[o.matrix_world@p.co for p in o.data.vertices]
 rows.append({'name':o.name,'positions':[c for p in v for c in (p.x,p.z,-p.y)],'indices':[i for t in o.data.loop_triangles for i in t.vertices]})
(ROOT/'tools/candidates/pasture-life41/contact-meshes.json').write_text(json.dumps({'glbSHA256':hashlib.sha256((ROOT/'web/public/assets/v2/pasture-life41.glb').read_bytes()).hexdigest(),'meshes':rows}))
