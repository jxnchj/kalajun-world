"""Read-only actual source mesh support audit for the nine-node OFF candidate."""
import bpy,json,time
from pathlib import Path
from mathutils import Vector
from mathutils.bvhtree import BVHTree
r=Path(__file__).resolve().parents[2];start=time.monotonic();bpy.ops.wm.open_mainfile(filepath=str(r/'assets/src/v2/pastoral/textiles62/house-a-textiles62.blend'));bpy.context.view_layer.update()
items=[('felt_mattress','sleep_platform',48,36),('bed_quilt','felt_mattress',56,48),('bed_foot','bed_quilt',56,16),('chest_folded0','chest_lid',28,18),('chest_folded1','chest_folded0',28,18),('chest_folded2','chest_folded1',28,18),('chest_folded3','chest_folded2',28,18),('chest_topcover','chest_folded3',30,20),('bench_felt','window_bench',48,20)]
rows=[]
for name,support,nx,ny in items:
 o=bpy.data.objects['pastoral_house_'+name];s=bpy.data.objects['pastoral_house_'+support];s.data.calc_loop_triangles();b=BVHTree.FromPolygons([s.matrix_world@v.co for v in s.data.vertices],[t.vertices[:]for t in s.data.loop_triangles],all_triangles=True);n=(nx+1)*(ny+1);gaps=[];missing=0
 for j in range(1,ny):
  for i in range(1,nx):
   p=o.matrix_world@o.data.vertices[n+j*(nx+1)+i].co;hit=b.ray_cast(p+Vector((0,0,.15)),Vector((0,0,-1)),.4)
   if hit[0]is None:missing+=1
   else:gaps.append(p.z-hit[0].z)
 rows.append({'name':name,'support':support,'interiorSamples':len(gaps)+missing,'unsupportedXY':missing,'signedGapMin':min(gaps),'signedGapMax':max(gaps),'over2mm':sum(g>.002 for g in gaps),'penetrationOver2mm':sum(g<-.002 for g in gaps)})
out={'scope':'actual exported-source bottom grid against real supporting mesh, excluding outermost perimeter; positive=gap negative=penetration; slat air gaps and overhang are reported, not hidden','rows':rows,'elapsedSeconds':time.monotonic()-start};(r/'assets/src/v2/pastoral/textiles62/contact-audit.json').write_text(json.dumps(out,indent=2));print(json.dumps(out))
