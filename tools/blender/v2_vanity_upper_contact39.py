"""Audit dense AO against actual existing vertex AO, without rebaking source."""
import bpy,random,math,json,hashlib,time,base64,sys
from pathlib import Path
from mathutils import Vector
from mathutils.bvhtree import BVHTree
from v2_room_contact import barycentric
R=Path(__file__).resolve().parents[2];S=R/'assets/src/v2/settlements/guest-vanity-v38/lanchuan-vanity.blend';start=time.monotonic()
bpy.ops.wm.open_mainfile(filepath=str(S));vs=[];faces=[]
for o in bpy.context.scene.objects:
 if o.type!='MESH'or any(m.name=='glass'for m in o.data.materials):continue
 base=len(vs);vs.extend(o.matrix_world@v.co for v in o.data.vertices);faces.extend(tuple(base+i for i in p.vertices)for p in o.data.polygons)
bvh=BVHTree.FromPolygons(vs,faces);rng=random.Random(38);dirs=[]
while len(dirs)<48:
 v=Vector([rng.uniform(-1,1)for _ in range(3)])
 if .05<v.length<=1:dirs.append(v.normalized())
report=[];fields={};full="--bake" in sys.argv
for o in bpy.context.scene.objects:
 if 'counter and recessed basin'not in o.name:continue
 m=o.data;m.calc_loop_triangles();verts=[o.matrix_world@v.co for v in m.vertices];tris=[tuple(t.vertices)for t in m.loop_triangles];surf=BVHTree.FromPolygons(verts,tris,all_triangles=True);attr=m.color_attributes['Color'];lo=[min(v[k]for v in verts)for k in range(3)];hi=[max(v[k]for v in verts)for k in range(3)];rows=[];nx=121 if full else 33;ny=57 if full else 19;raw=bytearray([255,0]*(nx*ny))
 for iy in range(ny):
  for ix in range(nx):
   x=lo[0]+(hi[0]-lo[0])*ix/(nx-1);y=lo[1]+(hi[1]-lo[1])*iy/(ny-1);hit,n,face,d=surf.ray_cast(Vector((x,y,hi[2]+.01)),Vector((0,0,-1)),.3)
   if hit is None or n.z<.999 or abs(hit.z-.94)>.0001:continue
   ids=tris[face];w=barycentric(hit,*[verts[i]for i in ids]);coarse=sum(t*attr.data[i].color[0]for i,t in zip(ids,w));occ=0
   for direction in dirs:
    d=direction if direction.dot(n)>0 else -direction;h=bvh.ray_cast(hit+n*.003,d,2.)
    if h[0]is not None:occ+=(1-h[3]/2.)**1.5
   fine=max(.3,min(1.,(1-occ/48)*1.08));ratio=min(1,fine/max(.3,coarse));rows.append({'point':list(hit),'coarseActualAO':coarse,'fineSameIntegral':fine,'ratio':ratio});at=((ny-1-iy)*nx+ix)*2;raw[at]=round(ratio*255);raw[at+1]=128
 fields['lanchuan-freedom-'+o.name[7]+'-vanity38']={'bounds':[[lo[0],-hi[1]],[hi[0],-lo[1]]],'size':[nx,ny],'heightRange':[.93,.95],'data':base64.b64encode(raw).decode(),'encoding':'raw8'}
 report.append({'object':o.name,'samples':len(rows),'below95':sum(r['ratio']<.95 for r in rows),'minRatio':min(r['ratio']for r in rows),'meanRatio':sum(r['ratio']for r in rows)/len(rows),'worst':sorted(rows,key=lambda r:r['ratio'])[:8]})
result={'sourceSHA256':hashlib.sha256(S.read_bytes()).hexdigest(),'seconds':time.monotonic()-start,'objects':report};(R/'tools/reports/vanity-upper-contact39-audit.json').write_text(json.dumps(result,indent=2));print(json.dumps(result))

if full:
 out={'sourceSHA256':hashlib.sha256((R/'web/public/assets/v2/gh_lanchuan_rooms_vanity38.glb').read_bytes()).hexdigest(),'blendSHA256':hashlib.sha256(S.read_bytes()).hexdigest(),'model':'dense original 48-direction 2m AO / actual source vertex COLOR.r barycentric AO; correction only','fields':fields};(R/'web/src/v2/generated/vanity-upper-contact39.json').write_text(json.dumps(out,separators=(',',':')))
