"""Read-only interior top-face clearance against the real lower textile."""
import bpy,json
from pathlib import Path
from mathutils import Vector
from mathutils.bvhtree import BVHTree
r=Path(__file__).resolve().parents[2];bpy.ops.wm.open_mainfile(filepath=str(r/'assets/src/v2/pastoral/textiles62/house-a-textiles62.blend'));bpy.context.view_layer.update()
o=bpy.data.objects['pastoral_house_chest_topcover'];s=bpy.data.objects['pastoral_house_chest_folded3'];s.data.calc_loop_triangles();bv=BVHTree.FromPolygons([s.matrix_world@v.co for v in s.data.vertices],[t.vertices[:]for t in s.data.loop_triangles],all_triangles=True);o.data.calc_loop_triangles();rows=[]
for t in o.data.loop_triangles:
 if t.normal.z<.2:continue
 pts=[o.matrix_world@o.data.vertices[i].co for i in t.vertices]
 for weights in [(1/3,1/3,1/3),(.6,.2,.2),(.2,.6,.2),(.2,.2,.6)]:
  p=sum((v*w for v,w in zip(pts,weights)),Vector());hit=bv.ray_cast(p+Vector((0,0,.2)),Vector((0,0,-1)),.4)[0]
  if hit is not None:rows.append((p.z-hit.z,list(p)))
rows.sort();out={'actualTopFaceSamples':len(rows),'minTopClearance':rows[0][0],'penetratingTopSamples':sum(x[0]<-.0001 for x in rows),'worst':rows[:8]};print(json.dumps(out));(r/'assets/src/v2/pastoral/textiles62/interior-top-audit67.json').write_text(json.dumps(out,indent=2))
