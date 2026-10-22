"""Author complete pastoral bedding in the existing editable sources.
Preserve every other mesh byte-for-byte, object transforms, slots and placements.
Run tools/.bpy/bin/python tools/blender/v2_bedding.py, then export-existing.
This is a designed domestic textile, not a surveyed historic household object.
"""
import argparse, hashlib, json, math
from pathlib import Path
import bpy
import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree
from v2_fabrics import bed_surface, CLOTH, smooth
from v2_interior_surfaces import contact_ao
from v2_tea_service import digest, count
ROOT=Path(__file__).resolve().parents[2]
VERSION='pastoral-bedding-29'

def surface(name,x,y):
 cx,cy,z,w,d,phase,drop,_=CLOTH[name]
 u=(x-cx)/w+.5;v=(y-cy)/d+.5
 base=bed_surface(x,y,cx,cy,z,w,d,phase,drop,False)
 centre=max(0,math.sin(math.pi*max(0,min(1,u))))**2
 head=1-smooth(.68,.92,v)
 # Gentle filled loft and two hand-compressed longitudinal seams, not a
 # periodic sinusoidal blanket. Existing broad drape remains authoritative.
 loft=.024*centre*math.sin(math.pi*max(0,min(1,v)))**2*head
 path=.31+.012*math.sin(v*6+phase)
 seam=.003*math.exp(-((u-path)/.025)**2)+.0025*math.exp(-((u-.70-.015*math.sin(v*5))/.025)**2)
 gathers=.007*math.sin(25*u+7*v+phase)*math.exp(-((v-.08)/.13)**2)*centre
 turn=.022*math.exp(-((v-.77)/.065)**2)*centre
 return base+loft+turn-seam*head*math.sin(math.pi*max(0,min(1,v)))**2+gathers

def sheet(name,runner=False,quilt=None):
 cx,cy,z,w,d,phase,drop,kind=CLOTH[name]
 nx,ny=(56,16) if runner else ((56,48) if w>1 else (32,56))
 verts=[];uvs=[];faces=[];top=[];bottom=[]
 for j in range(ny+1):
  v=j/ny;y=cy+(v-.5)*d
  for i in range(nx+1):
   u=i/nx;x=cx+(u-.5)*w
   if runner:
    hit=quilt.ray_cast(Vector((x,y,2)),Vector((0,0,-1)),3)[0]
    h=(hit.z if hit is not None else surface('pastoral_house_bed_quilt',x,y))+.013
    th=.007
   else:
    h=surface(name,x,y);th=.014+.012*math.sin(math.pi*u)**2*math.sin(math.pi*v)**2
   top.append((x,y,h));bottom.append((x,y,h-th));uvs.append((u,v))
 verts=top+bottom;uvs=uvs+uvs;n=len(top)
 for j in range(ny):
  for i in range(nx):
   a=j*(nx+1)+i;q=(a,a+1,a+nx+2,a+nx+1)
   faces.append(q);faces.append(tuple(k+n for k in reversed(q)))
 boundary=list(range(nx+1))+[j*(nx+1)+nx for j in range(1,ny+1)]+[ny*(nx+1)+i for i in range(nx-1,-1,-1)]+[j*(nx+1)for j in range(ny-1,0,-1)]
 for i,a in enumerate(boundary):
  b=boundary[(i+1)%len(boundary)];faces.append((a,a+n,b+n,b))
 # Raised sewn welt: restrained 1.2 mm radius, entirely inside footprint.
 # Kept in the same mesh and material, with no new renderer group or texture.
 ring=len(verts);sides=6
 for a in boundary:
  p=np.array(top[a]);q=np.array(bottom[a]);mid=(p+q)/2
  outward=np.array([p[0]-cx,p[1]-cy,0]);outward/=np.linalg.norm(outward)
  for k in range(sides):
   theta=math.tau*k/sides
   vtx=mid-outward*.0015+outward*.0012*math.cos(theta);vtx[2]+=.0012*math.sin(theta)
   verts.append(vtx.tolist());uvs.append(uvs[a])
 for i in range(len(boundary)):
  for k in range(sides):faces.append((ring+i*sides+k,ring+((i+1)%len(boundary))*sides+k,ring+((i+1)%len(boundary))*sides+(k+1)%sides,ring+i*sides+(k+1)%sides))
 return verts,faces,uvs

def mattress(o):
 old=np.array([o.matrix_world@v.co for v in o.data.vertices]);lo=old.min(0);hi=old.max(0);size=hi-lo;nx,ny=32,32
 verts=[];uvs=[];faces=[]
 for side in (1,-1):
  for j in range(ny+1):
   t=j/ny*2-1
   for i in range(nx+1):
    s=i/nx*2-1;puff=max(0,(1-s*s)*(1-t*t))**.32
    x=s*(1-.035*abs(t)**10);y=t*(1-.035*abs(s)**10)
    z=side*(.30+.70*puff)
    # Side gathers converge into the compressed perimeter instead of making
    # an inflated toy cube; top and bottom remain supported by the bed frame.
    z+=.025*math.sin(19*s+3*t)*math.exp(-((abs(t)-.91)/.12)**2)
    z+=.022*math.sin(17*t-2*s)*math.exp(-((abs(s)-.91)/.12)**2)
    verts.append((x,y,z));uvs.append((i/nx,j/ny))
 n=(nx+1)*(ny+1)
 for j in range(ny):
  for i in range(nx):
   a=j*(nx+1)+i;q=(a,a+1,a+nx+2,a+nx+1);faces.append(q);faces.append(tuple(k+n for k in reversed(q)))
 boundary=list(range(nx+1))+[j*(nx+1)+nx for j in range(1,ny+1)]+[ny*(nx+1)+i for i in range(nx-1,-1,-1)]+[j*(nx+1)for j in range(ny-1,0,-1)]
 for k,a in enumerate(boundary):
  b=boundary[(k+1)%len(boundary)];faces.append((a,a+n,b+n,b))
 coords=np.array(verts);coords=lo+(coords-coords.min(0))/(coords.max(0)-coords.min(0))*size
 return coords.tolist(),faces,uvs

def replace(o,data,kind):
 old=o.data;before=count(o);m=bpy.data.meshes.new(o.name+'-bedding29');verts,faces,uvs=data
 inv=o.matrix_world.inverted();m.from_pydata([tuple(inv@Vector(v))for v in verts],[],faces);m.update()
 for mat in old.materials:m.materials.append(mat)
 uv=m.uv_layers.new(name='UVMap')
 for p in m.polygons:
  p.use_smooth=True
  for k in p.loop_indices:uv.data[k].uv=uvs[m.loops[k].vertex_index]
 o.data=m;o['beddingVersion']=VERSION;o['beddingOriginalTriangles']=before;o['beddingKind']=kind
 m.calc_loop_triangles();assert min(t.area for t in m.loop_triangles)>1e-12
 assert all(math.isfinite(x)for v in m.vertices for x in v.co)
 result={'name':o.name,'kind':kind,'trianglesBefore':before,'trianglesAfter':count(o),'verticesAfter':len(m.vertices),'transformUnchanged':True,'materialSlotsUnchanged':True}
 if old.users==0:bpy.data.meshes.remove(old)
 return result

def run(asset):
 path=ROOT/'assets/src/v2/pastoral'/f'{asset}-lived.blend';bpy.ops.wm.open_mainfile(filepath=str(path));bpy.context.view_layer.update()
 names=['pastoral_house_felt_mattress','pastoral_house_bed_quilt','pastoral_house_bed_foot'] if asset=='house_a' else ['pastoral_yurt_felt_bedding','pastoral_yurt_sleep_quilt']
 allmeshes=[o for o in bpy.context.scene.objects if o.type=='MESH'];targets=[bpy.data.objects[n]for n in names]
 assert not any(o.get('beddingVersion')==VERSION for o in targets),'Restore exact backup before reauthoring a candidate'
 protected={o.name:digest(o)for o in allmeshes if o not in targets};matrices={o.name:o.matrix_world.copy()for o in targets}
 before=sum(count(o)for o in allmeshes);results=[];quilt=None
 for o in targets:
  if 'felt_' in o.name:data=mattress(o);kind='compressed layered felt mattress'
  else:
   runner='bed_foot' in o.name;data=sheet(o.name,runner,quilt);kind='fitted sewn bed runner'if runner else'lofted quilt with gathered edge and sewn welt'
  results.append(replace(o,data,kind))
  if 'quilt' in o.name:quilt=BVHTree.FromPolygons([o.matrix_world@v.co for v in o.data.vertices],[p.vertices[:]for p in o.data.polygons])
 contact_ao(targets)
 for o in targets:assert o.matrix_world==matrices[o.name]
 for name,h in protected.items():assert digest(bpy.data.objects[name])==h,name
 assert sum(o.get('softGoodsVersion')=='pastoral-soft-goods-27'for o in allmeshes)==7
 assert sum(o.get('teaServiceVersion')=='pastoral-tea-service-28'for o in allmeshes)==(36 if asset=='house_a'else 31)
 bpy.context.scene['beddingVersion']=VERSION;bpy.ops.wm.save_as_mainfile(filepath=str(path))
 result={'asset':asset,'version':VERSION,'objects':results,'changedMeshes':len(targets),'protectedMeshesUnchanged':len(protected),'protectedDigest':protected,'meshCountBefore':len(allmeshes),'meshCountAfter':len(allmeshes),'trianglesBefore':before,'trianglesAfter':sum(count(o)for o in allmeshes),'source':str(path.relative_to(ROOT)),'originalMaterialsRetained':True,'newTextures':0}
 (ROOT/'assets/src/v2/pastoral'/f'{asset}-bedding-29.json').write_text(json.dumps(result,indent=2));print(json.dumps({k:v for k,v in result.items()if k not in ('objects','protectedDigest')}),flush=True)
if __name__=='__main__':
 p=argparse.ArgumentParser(description=__doc__);p.add_argument('--asset',choices=['all','house_a','yurt'],default='all');args=p.parse_args()
 for asset in ['house_a','yurt']if args.asset=='all'else[args.asset]:run(asset)
