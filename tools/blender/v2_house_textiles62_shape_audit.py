"""Regression for the actual66 discontinuous displacement/internal leaf crossings."""
import bpy,json
from pathlib import Path
r=Path(__file__).resolve().parents[2]
from mathutils import Vector
from mathutils.bvhtree import BVHTree
names=['pastoral_house_chest_folded'+str(i)for i in range(4)]
bpy.ops.wm.open_mainfile(filepath=str(r/'assets/src/v2/pastoral/house_a-lived-timber-38.blend'));original={n:[(bpy.data.objects[n].matrix_world@v.co).z for v in bpy.data.objects[n].data.vertices]for n in names}
bpy.ops.wm.open_mainfile(filepath=str(r/'assets/src/v2/pastoral/textiles62/house-a-textiles62.blend'));rows=[]
for name in names:
 o=bpy.data.objects[name];m=o.data;m.calc_loop_triangles();pts=[o.matrix_world@v.co for v in m.vertices];delta=[p.z-original[name][i]for i,p in enumerate(pts)];jumps=[(abs(delta[e.vertices[0]]-delta[e.vertices[1]]),list(e.vertices))for e in m.edges];jumps.sort(reverse=True)
 def surf(lo,hi):return BVHTree.FromPolygons(pts,[t.vertices[:]for t in m.loop_triangles if all(lo<=i<hi for i in t.vertices)],all_triangles=True)
 lower=surf(0,551);upper=surf(2021,2572);gaps=[]
 for p in pts[:551]:
  a=lower.ray_cast(Vector((p.x,p.y,3)),Vector((0,0,-1)),5)[0];b=upper.ray_cast(Vector((p.x,p.y,-1)),Vector((0,0,1)),5)[0]
  if a is not None and b is not None:gaps.append(b.z-a.z)
 rows.append({'name':name,'maxAdjacentDisplacementJump':jumps[0],'over20mmEdges':sum(j[0]>.02 for j in jumps),'leafInteriorSamples':len(gaps),'minInternalLeafGap':min(gaps),'leafCrossingSamples':sum(g<-.0001 for g in gaps)})
print(json.dumps(rows));(r/'assets/src/v2/pastoral/textiles62/shape-regression67.json').write_text(json.dumps(rows,indent=2))
assert all(x['maxAdjacentDisplacementJump'][0]<2e-6 and x['leafCrossingSamples']==0 and x['minInternalLeafGap']>.0005 for x in rows), 'Rigid settlement lost original leaf shape or separation'
