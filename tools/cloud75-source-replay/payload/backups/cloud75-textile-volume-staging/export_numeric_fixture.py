"""Bounded read-only source extraction; not an envelope/baseline certification."""
import bpy, json, hashlib, time
from pathlib import Path
HERE=Path(__file__).resolve().parent
ROOT=HERE.parents[1]
SOURCE=ROOT/'assets/src/v2/pastoral/textiles62/house-a-textiles62.blend'
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
before=sha(SOURCE)
assert before=='c1a1e09f4fca922a94544c10f3f48a41ceb29ca50be4bac945bfeefb72113397'
bpy.ops.wm.open_mainfile(filepath=str(SOURCE));bpy.context.view_layer.update()
names=['pastoral_house_chest_body','pastoral_house_chest_lid','pastoral_house_chest_strap','pastoral_house_chest_strap.001']+['pastoral_house_chest_folded'+str(i)for i in range(4)]
lo=(.84,2.22);hi=(.90,2.28);rows=[];target=None;sourceid=0
for name in names:
 o=bpy.data.objects[name];o.data.calc_loop_triangles();points=[list(o.matrix_world@v.co)for v in o.data.vertices]
 for local,t in enumerate(o.data.loop_triangles):
  xyz=[points[i]for i in t.vertices];row={'sourceId':sourceid,'node':name,'localTriangleId':local,'vertexIds':list(t.vertices),'xyz':xyz}
  if all(min(p[k]for p in xyz)<=hi[k] and max(p[k]for p in xyz)>=lo[k]for k in range(2)):rows.append(row)
  if name=='pastoral_house_chest_lid'and local==534:target=row
  sourceid+=1
assert target and target['sourceId']==2262,target
out={'sourceSHA256':before,'blenderVersion':bpy.app.version_string,'sourceNodeOrder':names,'totalSourceTriangles':sourceid,'tile':[[.84,2.22],[.90,2.22],[.90,2.28],[.84,2.28]],'target':target,'records':rows,'scope':'Raw original triangles intersecting tile bounding box; NOT historical49 merged envelope cells','sourceUnchanged':sha(SOURCE)==before}
assert out['sourceUnchanged']
p=HERE/'v3_metrics/fixture_source2262_raw.json';assert not p.exists();p.write_text(json.dumps(out,separators=(',',':'))+'\n')
print(json.dumps({'output':str(p),'sha256':sha(p),'records':len(rows),'sourceTriangles':sourceid,'sourceUnchanged':True}))
