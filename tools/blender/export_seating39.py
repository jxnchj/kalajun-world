import bpy,json,hashlib
from pathlib import Path
from mathutils import Vector
from mathutils.bvhtree import BVHTree
R=Path(__file__).resolve().parents[2];out={'version':39,'sources':[],'seats':[]}
for kind,path,entity in [('lodge','assets/src/v2/settlements/lodge-tables-v38/lodge-tables-complete.blend','guesthouses:-1993.1,3453.7:5b4988c14b5aecdb'),('porch','assets/src/v2/pastoral/house_a-lived.blend','cabins:-1743,3612:30f9adc9fb584805')]:
 p=R/path;bpy.ops.wm.open_mainfile(filepath=str(p));out['sources'].append({'path':path,'sha256':hashlib.sha256(p.read_bytes()).hexdigest()})
 objects=[o for o in bpy.context.scene.objects if o.type=='MESH'and ('linen original' in o.name if kind=='lodge' else 'pastoral_house_porch' in o.name)]
 vs=[];ts=[]
 for o in objects:
  o.data.calc_loop_triangles();off=len(vs);vs.extend(o.matrix_world@v.co for v in o.data.vertices);ts.extend(tuple(off+i for i in t.vertices)for t in o.data.loop_triangles)
 bvh=BVHTree.FromPolygons(vs,ts,all_triangles=True)
 hints=[('sofa-1',4.65,1.97,-1),('sofa-2',4.65,-.53,1)]if kind=='lodge'else[('porch-bench',-2.,-3.74,-1)]
 for name,x,y,front in hints:
  hit,n,face,d=bvh.ray_cast(Vector((x,y,.61 if kind=='lodge'else .5)),Vector((0,0,-1)),.5)
  if hit is None:raise RuntimeError('seat source miss '+name)
  out['seats'].append({'id':name,'entityId':entity,'kind':kind,'sourceNames':[o.name for o in objects],'localSeat':[hit.x,hit.z,-hit.y],'localFront':[0,0,-front],'sourceTriangle':list(ts[face]),'normal':list(n)})
(R/'web/src/v2/generated/seating-39.json').write_text(json.dumps(out,indent=2));print(json.dumps(out))
