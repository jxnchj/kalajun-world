import bpy,json,hashlib
from pathlib import Path
R=Path(__file__).resolve().parents[1];D=R/'assets/src/v2/boardwalk/endgrain39'
def capture(path):
 bpy.ops.wm.open_mainfile(filepath=str(path));out={}
 for o in bpy.context.scene.objects:
  if o.type!='MESH':continue
  m=o.data;m.calc_loop_triangles();out[o.name]={'positions':[list(v.co)for v in m.vertices],'triangles':[list(t.vertices)for t in m.loop_triangles],'normals':[list(p.normal)for p in m.polygons],'materials':[p.material_index for p in m.polygons],'matrix':[list(row)for row in o.matrix_world],'uv':[list(d.uv)for d in m.uv_layers.active.data]}
 return out
src=R/'assets/src/v2/boardwalk/boardwalk-timber-38.blend';dst=D/'boardwalk-endgrain39.blend';a=capture(src);b=capture(dst)
assert a.keys()==b.keys();checks={}
for k in a:
 checks[k]={n:a[k][n]==b[k][n]for n in ['positions','triangles','normals','materials','matrix']};assert all(checks[k].values());checks[k]['triangleCount']=len(a[k]['triangles']);checks[k]['uvChanged']=a[k]['uv']!=b[k]['uv']
report={'sourceSHA256':hashlib.sha256(src.read_bytes()).hexdigest(),'candidateSHA256':hashlib.sha256(dst.read_bytes()).hexdigest(),'checks':checks,'geometryChanged':False,'candidateOnly':True};(R/'tools/reports/boardwalk-endgrain39-source.json').write_text(json.dumps(report,indent=2));print(json.dumps(report))
