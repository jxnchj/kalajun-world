"""Independent nine-node house_a textile contact candidate. No source/GLB overwrite.
Retains original material/UV motif family and all furniture/pillows. Export geometry
only; runtime borrows each original node's material. Not a cloth simulation.
"""
import bpy, math, json, hashlib
from pathlib import Path
from mathutils import Vector
from mathutils.bvhtree import BVHTree
from v2_tea_service import digest, count
from v2_interior_surfaces import contact_ao
R=Path(__file__).resolve().parents[2];OUT=R/'assets/src/v2/pastoral/textiles62';OUT.mkdir(parents=True,exist_ok=True)
SOURCE=R/'assets/src/v2/pastoral/house_a-lived-timber-38.blend';ORIGINAL=R/'web/public/assets/v2/house_a_lived.glb'
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest();hashes={str(p.relative_to(R)):sha(p)for p in [SOURCE,ORIGINAL]}
bpy.ops.wm.open_mainfile(filepath=str(SOURCE));bpy.context.preferences.filepaths.save_version=0;bpy.context.view_layer.update()
NAMES=['pastoral_house_felt_mattress','pastoral_house_bed_quilt','pastoral_house_bed_foot']+['pastoral_house_chest_folded'+str(i)for i in range(4)]+['pastoral_house_chest_topcover','pastoral_house_bench_felt']
protected={o.name:digest(o)for o in bpy.context.scene.objects if o.type=='MESH'and o.name not in NAMES};records=[];surfaces={}
def smooth(a,b,x):
 t=max(0,min(1,(x-a)/(b-a)));return t*t*(3-2*t)
def footprint(cx,cy,w,d,u,v):
 # Rounded corners within original footprint. Smooth, never diagonally clipped.
 x=(u-.5)*w;y=(v-.5)*d;r=min(.035,w*.035,d*.10);ix=w/2-r;iy=d/2-r
 qx=max(0,abs(x)-ix);qy=max(0,abs(y)-iy);n=math.hypot(qx,qy)
 if qx>0 and qy>0 and n>r:x=math.copysign(ix+qx*r/n,x);y=math.copysign(iy+qy*r/n,y)
 return cx+x,cy+y

def mesh_surface(o,fallback):
 o.data.calc_loop_triangles();b=BVHTree.FromPolygons([o.matrix_world@v.co for v in o.data.vertices],[t.vertices[:]for t in o.data.loop_triangles],all_triangles=True)
 def sample(x,y):
  hit=b.ray_cast(Vector((x,y,3)),Vector((0,0,-1)),4)[0]
  return hit.z if hit is not None else fallback(x,y)
 return sample

def solid(name,cx,cy,w,d,support,thickness,nx,ny,kind,coords=None,diagonal=None):
 o=bpy.data.objects[name];old=o.data;before=count(o);verts=[];uv=[];gap=[]
 for top in [True,False]:
  for j in range(ny+1):
   for i in range(nx+1):
    u=i/nx;v=j/ny;x,y=coords(i,j) if coords else footprint(cx,cy,w,d,u,v);base=support(x,y);th=thickness(x,y,u,v)
    assert th>.001
    h=base+th if top else base;verts.append((x,y,h));uv.append((u,v))
    if not top:gap.append(h-support(x,y))
 n=(nx+1)*(ny+1);faces=[]
 for j in range(ny):
  for i in range(nx):
   a=j*(nx+1)+i;q=(a,a+1,a+nx+2,a+nx+1)
   pair=[(q[0],q[1],q[2]),(q[0],q[2],q[3])] if diagonal is None or diagonal(i,j) else [(q[0],q[1],q[3]),(q[1],q[2],q[3])]
   faces.extend(pair+[tuple(k+n for k in reversed(t))for t in pair])
 boundary=list(range(nx+1))+[j*(nx+1)+nx for j in range(1,ny+1)]+[ny*(nx+1)+i for i in range(nx-1,-1,-1)]+[j*(nx+1)for j in range(ny-1,0,-1)]
 for k,a in enumerate(boundary):
  b=boundary[(k+1)%len(boundary)];faces.append((a,a+n,b+n,b))
 # Retain physical sewn edging rather than deleting the original bedding29
 # welt. Same source motif UV; millimetre geometry, not a painted dark outline.
 ring=len(verts);sides=6;radius=.0012 if 'bed_' in name else .0008
 for a in boundary:
  p=Vector(verts[a]);q=Vector(verts[a+n]);mid=(p+q)*.5
  out=Vector((p.x-cx,p.y-cy,0)).normalized()
  for k in range(sides):
   theta=math.tau*k/sides;vtx=mid-out*radius+out*radius*math.cos(theta);vtx.z+=radius*math.sin(theta)
   verts.append(tuple(vtx));uv.append(uv[a])
 for i in range(len(boundary)):
  for k in range(sides):faces.append((ring+i*sides+k,ring+((i+1)%len(boundary))*sides+k,ring+((i+1)%len(boundary))*sides+(k+1)%sides,ring+i*sides+(k+1)%sides))
 me=bpy.data.meshes.new(name+'-contact62');inv=o.matrix_world.inverted();me.from_pydata([inv@Vector(p)for p in verts],[],faces);me.update()
 for m in old.materials:me.materials.append(m)
 layer=me.uv_layers.new(name='UVMap')
 for p in me.polygons:
  p.use_smooth=True
  for li in p.loop_indices:layer.data[li].uv=uv[me.loops[li].vertex_index]
  # Side walls require an actual two-dimensional unwrap. Top/bottom sharing
  # the same UV collapses the side's area and destroys retained stitch/weave.
  if 4*nx*ny<=p.index<4*nx*ny+len(boundary):
   k=p.index-4*nx*ny;u0=k/len(boundary);u1=(k+1)/len(boundary)
   for li,q in zip(p.loop_indices,[(u0,0),(u0,1),(u1,1),(u1,0)]):layer.data[li].uv=q
 o.data=me;o['textileContact62']=kind;me.calc_loop_triangles();assert all(t.area>1e-12 for t in me.loop_triangles), [(t.vertices[:],t.area,[tuple(me.vertices[i].co)for i in t.vertices])for t in me.loop_triangles if t.area<=1e-12][:3]
 records.append({'name':name,'kind':kind,'trianglesBefore':before,'trianglesAfter':count(o),'vertices':len(me.vertices),'supportGapMax':max(gap),'bboxMin':[min(p[k]for p in verts)for k in range(3)],'bboxMax':[max(p[k]for p in verts)for k in range(3)],'materials':[m.name for m in me.materials]})
 analytic=lambda x,y:support(x,y)+thickness(x,y,max(0,min(1,(x-cx)/w+.5)),max(0,min(1,(y-cy)/d+.5)))
 return mesh_surface(o,analytic)
# Original slats top .440m; mattress lower face now rests on them rather than
# intersecting by 15mm. Perimeter compressed, centre keeps original .555m top.
def matth(x,y,u,v):
 e=min(u,1-u,v,1-v);return .054+.059*smooth(0,.20,e)
mat=solid(NAMES[0],-2,1.18,2.38,1.70,lambda x,y:.441,matth,48,36,'felt compressed on original slats')
def bed_support(x,y):return mat(max(-3.19,min(-.81,x)),max(.33,min(2.03,y)))+.001
# Loft is small and tied to the mattress, with two broad pressure creases. No
# independent downfold that clips the white mattress or produces a pointed rim.
def quiltth(x,y,u,v):
 e=min(u,1-u,v,1-v);core=smooth(0,.16,e);ridge=.030*math.exp(-((x+2.24-.15*(y-1.1))/.17)**2)+.019*math.exp(-((x+1.73+.10*(y-1.1))/.21)**2)
 return .008+core*(.018+ridge)*(1-.35*smooth(.73,.95,v))
quilt=solid(NAMES[1],-2,1.12,2.40,1.67,bed_support,quiltth,56,48,'quilt follows compressed felt, rounded thin welt')
solid(NAMES[2],-2,.46,2.43,.46,lambda x,y:quilt(max(-3.2,min(-.8,x)),max(.285,min(1.955,y)))+.0007,lambda x,y,u,v:.005+.002*smooth(0,.13,min(u,1-u,v,1-v)),56,16,'runner rests on same quilt surface')
# Preserve the actual soft27 two leaves, all UV loops and both physical welts.
# Only a continuous vertical displacement attaches each source to its support.
def projected_surface(o,bottom=False,polygons=None,slope=.35):
 points=[o.matrix_world@v.co for v in o.data.vertices]
 o.data.calc_loop_triangles();allowed=set(i for f in polygons for i in f)if polygons is not None else None
 faces=[t.vertices[:]for t in o.data.loop_triangles if allowed is None or all(i in allowed for i in t.vertices)]
 b=BVHTree.FromPolygons(points,faces,all_triangles=True)
 ids=set(i for f in faces for i in f);cx=(min(points[i].x for i in ids)+max(points[i].x for i in ids))/2;cy=(min(points[i].y for i in ids)+max(points[i].y for i in ids))/2
 direction=Vector((0,0,1 if bottom else -1));z=-1 if bottom else 3
 def hit(x,y):return b.ray_cast(Vector((x,y,z)),direction,5)[0]
 assert hit(cx,cy)is not None
 def sample(x,y):
  p=hit(x,y)
  if p is not None:return p.z
  # Inward ray converges to the real projected silhouette, including bevels.
  # No rectangular clamp can send a corner back to a high flat fallback.
  lo=0.;hi=1.;p=hit(cx,cy)
  for _ in range(25):
   t=(lo+hi)/2;q=hit(cx+(x-cx)*t,cy+(y-cy)*t)
   if q is None:hi=t
   else:lo=t;p=q
  return p.z-slope*math.hypot(x-p.x,y-p.y)
 return sample

def deform_folded(name,support):
 o=bpy.data.objects[name];m=o.data;before=count(o);half=len(m.vertices)//2
 assert len(m.vertices)==2940 and half==1470, 'Actual soft27 source changed'
 faces=[p.vertices[:]for p in m.polygons];assert all(all(i<half for i in f)or all(i>=half for i in f)for f in faces)
 uvbefore=[[tuple(v.uv)for v in u.data]for u in m.uv_layers]
 bottom=projected_surface(o,True,[f for f in faces if max(f)<half],slope=0)
 inverse=o.matrix_world.inverted();beforepts=[o.matrix_world@v.co for v in m.vertices];shifts=[]
 # One rigid vertical displacement for the complete textile. The source
 # lower leaf and welts retain their shape, normals and separation exactly.
 # Sample true lower-surface vertices and triangle interiors, not bbox height.
 samples=[p for p in beforepts]
 for tri in m.loop_triangles:
  if not all(551<=i<1102 for i in tri.vertices):continue
  points=[beforepts[i]for i in tri.vertices]
  for weights in [(1/3,1/3,1/3),(.6,.2,.2),(.2,.6,.2),(.2,.2,.6)]:samples.append(sum((p*w for p,w in zip(points,weights)),Vector()))
 dy=max(support(p.x,p.y)+.0007-bottom(p.x,p.y)for p in samples)
 for v,p in zip(m.vertices,beforepts):
  shifts.append(dy);p.z+=dy;v.co=inverse@p
 m.update();m.calc_loop_triangles()
 assert faces==[p.vertices[:]for p in m.polygons]
 assert uvbefore==[[tuple(v.uv)for v in u.data]for u in m.uv_layers]
 assert all(t.area>1e-12 for t in m.loop_triangles)
 o['textileContact62']='original two folded leaves/UV/double welts, rigid vertical settlement only'
 pts=[o.matrix_world@v.co for v in m.vertices]
 records.append({'name':name,'kind':o['textileContact62'],'trianglesBefore':before,'trianglesAfter':count(o),'vertices':len(m.vertices),'topologyUnchanged':True,'uvUnchanged':True,'xyUnchanged':True,'verticalShiftRange':[min(shifts),max(shifts)],'bboxMin':[min(p[k]for p in pts)for k in range(3)],'bboxMax':[max(p[k]for p in pts)for k in range(3)],'materials':[x.name for x in m.materials]})
 return projected_surface(o)
previous=projected_surface(bpy.data.objects['pastoral_house_chest_lid'])
for k in range(4):previous=deform_folded(NAMES[3+k],previous)
# The cover copies the real upper leaf's 28x18 XY lattice. Outer rows alone
# extend to its original .94x.62m drape. Real folded topology is not replaced.
last=bpy.data.objects[NAMES[6]];upper=[last.matrix_world@last.data.vertices[1470+i].co for i in range(29*19)]
last.data.calc_loop_triangles();source_diagonals={}
for tri in last.data.loop_triangles:
 ids=[i-1470 for i in tri.vertices]
 if min(ids)<0 or max(ids)>=29*19:continue
 ii=min(i%29 for i in ids);jj=min(i//29 for i in ids);a=jj*29+ii
 if a in ids and a+30 in ids:source_diagonals[(ii,jj)]=True
 elif a+1 in ids and a+29 in ids:source_diagonals[(ii,jj)]=False
assert len(source_diagonals)==28*18
def coverdiagonal(i,j):return source_diagonals.get((i-1,j-1),True)
def coverxy(i,j):
 p=upper[max(0,min(18,j-1))*29+max(0,min(28,i-1))];x,y=p.x,p.y
 if i==0:x=.48
 if i==30:x=1.42
 if j==0:y=1.67
 if j==20:y=2.29
 if i in(0,30)and j in(0,20):return footprint(.95,1.98,.94,.62,i/30,j/20)
 return x,y
# Exact boundary vertices cannot be re-raycast: a grazing ray can miss the
# upper leaf and incorrectly hit its lower folded leaf. Use the actual source
# upper vertex and linearly continued source boundary, not a lower hit.
upper_by_xy={(round(p.x,7),round(p.y,7)):p.z for p in upper}
ub=list(range(29))+[j*29+28 for j in range(1,19)]+[18*29+i for i in range(27,-1,-1)]+[j*29 for j in range(17,0,-1)]
def cover_support(x,y):
 key=(round(x,7),round(y,7))
 if key in upper_by_xy:return upper_by_xy[key]+.0007
 best=None
 for k,a in enumerate(ub):
  p=upper[a];q=upper[ub[(k+1)%len(ub)]];dx=q.x-p.x;dy=q.y-p.y
  t=max(0,min(1,((x-p.x)*dx+(y-p.y)*dy)/(dx*dx+dy*dy)))
  distance=math.hypot(x-p.x-t*dx,y-p.y-t*dy);h=p.z+t*(q.z-p.z)
  if best is None or distance<best[0]:best=(distance,h)
 return best[1]+.0007-.35*best[0]
solid(NAMES[7],.95,1.98,.94,.62,cover_support,lambda x,y,u,v:.004+.002*smooth(0,.12,min(u,1-u,v,1-v)),30,20,'cover follows original folded upper leaf lattice',coords=coverxy,diagonal=coverdiagonal)
# Bench seat top .480m. No floating diagonal sheet; flat supported lower face,
# restrained compressions at two seated positions and softly rounded perimeter.
def benchth(x,y,u,v):
 e=min(u,1-u,v,1-v);core=smooth(0,.16,e);pressure=.008*(math.exp(-((x+2.43)/.19)**2)+math.exp(-((x+1.78)/.20)**2))*math.exp(-((y+2.08)/.12)**2)
 return .012+core*(.025-pressure)
bench=projected_surface(bpy.data.objects['pastoral_house_window_bench'],slope=.35)
solid(NAMES[8],-2.1,-2.08,1.4,.45,lambda x,y:bench(x,y)+.001,benchth,48,20,'felt seat contact with shallow paired compression')
bpy.context.view_layer.update();targets=[bpy.data.objects[n]for n in NAMES];contact_ao(targets)
for name,h in protected.items():assert digest(bpy.data.objects[name])==h,name
for p,h in hashes.items():assert sha(R/p)==h,p
bpy.context.scene['textiles62']='OFF candidate; house_a asset family; nine original nodes only; no cloth simulation'
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'house-a-textiles62.blend'))
bpy.ops.object.select_all(action='DESELECT')
for o in targets:o.select_set(True)
# No new material or texture copy. The runtime borrows the original named node's
# material including motif, PBR inputs and palette; this GLB supplies geometry.
bpy.ops.export_scene.gltf(filepath=str(OUT/'house-a-textiles62.glb'),export_format='GLB',use_selection=True,export_materials='NONE',export_yup=True,export_texcoords=True,export_normals=True,export_vertex_color='ACTIVE',export_active_vertex_color_when_no_material=True)
report={'version':62,'scope':'house_a asset family, explicit OFF candidate','sourceHashes':hashes,'nodes':records,'protectedMeshes':len(protected),'originalsUnchanged':all(sha(R/p)==h for p,h in hashes.items()),'newTextures':0,'limitations':['No cloth dynamics','Contact AO recalculated, room GI not rebaked','Original motif images retained; UV projection on reshaped cloth requires real review','Simple surface support approximation outside folded-layer footprint requires real edge review']}
(OUT/'source-validation.json').write_text(json.dumps(report,indent=2));print(json.dumps(report),flush=True)
