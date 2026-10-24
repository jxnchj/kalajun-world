"""Round38 opt-in log-side normal/occlusion derivation; never writes original assets.
Uses the current complete editable house for ray occluders; preserves original
AO distance/falloff/clamp and legacy sky hemisphere definition for comparison.
After rebaking, run v2_timber_editable_source.py to refresh its verified editable
derivation metadata. This never authorizes rebinding old GI to the new source.
"""
import sys,json,struct,hashlib,base64,math,time
from pathlib import Path
import numpy as np
import bpy
from mathutils import Vector
from mathutils.bvhtree import BVHTree
ROOT=Path(__file__).resolve().parents[2]
SOURCE=ROOT/'assets/src/v2/pastoral/house_a-lived.blend'
GLB=ROOT/'web/public/assets/v2/house_a_lived.glb'
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
protected={str(p.relative_to(ROOT)):sha(p) for p in [SOURCE,GLB]}
blob=GLB.read_bytes();length=struct.unpack_from('<I',blob,12)[0]
doc=json.loads(blob[20:20+length]);binary=blob[28+length:]
def accessor(index):
 a=doc['accessors'][index];v=doc['bufferViews'][a['bufferView']]
 dtype={5126:'<f4',5125:'<u4',5123:'<u2',5121:'u1'}[a['componentType']]
 dims={'VEC2':2,'VEC3':3,'VEC4':4,'SCALAR':1}[a['type']]
 offset=v.get('byteOffset',0)+a.get('byteOffset',0);size=np.dtype(dtype).itemsize
 out=np.ndarray((a['count'],dims),dtype=dtype,buffer=binary,offset=offset,strides=(v.get('byteStride',dims*size),size)).copy()
 if a.get('normalized'):out=out.astype(float)/np.iinfo(dtype).max
 return out
node=next(n for n in doc['nodes']if n.get('name')=='house_a_log')
assert not any(k in node for k in ['matrix','rotation','scale','translation'])
assert doc['nodes'].index(node)in doc['scenes'][0]['nodes']
primitive=doc['meshes'][node['mesh']]['primitives'][0]
assert doc['materials'][primitive['material']]['name']=='log'
positions=accessor(primitive['attributes']['POSITION']);oldnormals=accessor(primitive['attributes']['NORMAL'])
oldcolor=accessor(primitive['attributes']['COLOR_0']);indices=accessor(primitive['indices']).reshape(-1,3)
# Coincident vertices are split for flat faces/UV seams in the legacy GLB.
# Share only side-surface shading, never cap topology, positions or UVs.
groups={}
for i,p in enumerate(positions):groups.setdefault(tuple(round(float(v),5)for v in p),[]).append(i)
normals=np.zeros_like(positions,dtype=np.float64)
for ids in indices:
 p,q,r=positions[ids];area=np.cross(q-p,r-p)
 for i in ids:normals[i]+=area
for ids in groups.values():
 n=normals[ids].sum(axis=0);n/=np.linalg.norm(n)
 assert min(n@oldnormals[i]for i in ids)>.45,'Potential sharp/crossing surface'
 for i in ids:normals[i]=n
bpy.ops.wm.open_mainfile(filepath=str(SOURCE));bpy.context.view_layer.update()
vertices=[];faces=[]
for ob in bpy.context.scene.objects:
 if ob.type!='MESH' or ob.name.startswith('preview_'):continue
 if ob.data.materials and ob.data.materials[0].name=='glass':continue
 start=len(vertices)
 for v in ob.data.vertices:
  p=ob.matrix_world@v.co;vertices.append(Vector((p.x,p.z,-p.y)))
 faces.extend(tuple(start+i for i in face.vertices)for face in ob.data.polygons)
start=len(vertices);vertices.extend([Vector((-500,-.02,500)),Vector((500,-.02,500)),Vector((500,-.02,-500)),Vector((-500,-.02,-500))]);ground_index=len(faces);faces.append(tuple(range(start,start+4)))
bvh=BVHTree.FromPolygons(vertices,faces,epsilon=0)
# Uniform deterministic hemisphere; equal samples at shared positions.
SAMPLES=256;data=np.zeros((len(positions),2),dtype='<f4')
def basis(n):
 t=n.cross(Vector((0,1,0))if abs(n.y)<.95 else Vector((1,0,0))).normalized()
 return t,n.cross(t)
started=time.monotonic()
for ids in groups.values():
 i=ids[0];point=Vector(positions[i]);normal=Vector(normals[i]);tangent,bitangent=basis(normal);origin=point+normal*.02
 occ=0.;up=escape=0
 for sample in range(SAMPLES):
  z=(sample+.5)/SAMPLES;rad=math.sqrt(1-z*z);phi=sample*math.pi*(3-math.sqrt(5))
  direction=normal*z+tangent*(rad*math.cos(phi))+bitangent*(rad*math.sin(phi))
  hit=bvh.ray_cast(origin,direction,2.)
  if hit[0]is not None:occ+=(1-hit[3]/2.)**1.5
  if direction.y>=-.35:
   up+=1;hit=bvh.ray_cast(origin,direction,40.)
   if hit[0]is None or hit[2]==ground_index:escape+=1
 ao=max(.3,min(1.,(1-occ/SAMPLES)*1.08));sky=escape/max(up,1)
 for j in ids:data[j]=(ao,sky)
payload=lambda a:base64.b64encode(np.asarray(a,dtype='<f4').tobytes()).decode()
hashbytes=lambda a:hashlib.sha256(a.tobytes()).hexdigest()
result={'version':'timber-continuity-38','assetId':'house_a','nodeName':'house_a_log','vertexCount':len(positions),'sourceGLB':'assets/v2/house_a_lived.glb','sourceSHA256':protected[str(GLB.relative_to(ROOT))],'sourceBlend':str(SOURCE.relative_to(ROOT)),'blendSHA256':protected[str(SOURCE.relative_to(ROOT))],'positionSHA256':hashbytes(positions),'indexSHA256':hashbytes(indices),'uvSHA256':hashbytes(accessor(primitive['attributes']['TEXCOORD_0'])),'normals':payload(normals),'occlusion':payload(data),'samples':SAMPLES,'uniquePositionCount':len(groups),'scope':'Original side geometry only; caps, UV, index, bounds and base color unchanged. AO and legacy sky visibility are traced against original editable complete house. This is not new GI.'}
out=ROOT/'web/src/v2/timber-continuity-data.js';out.write_text('export default '+json.dumps(result,separators=(',',':'))+';\n')
for p,h in protected.items():assert sha(ROOT/p)==h
report={k:v for k,v in result.items()if k not in ['normals','occlusion','positions']}
report.update(elapsedSeconds=time.monotonic()-started,bytes=out.stat().st_size,oldMeanAO=float(oldcolor[:,0].mean()),newMeanAO=float(data[:,0].mean()),oldMeanSky=float(oldcolor[:,2].mean()),newMeanSky=float(data[:,1].mean()),occlusionRange=[data.min(axis=0).tolist(),data.max(axis=0).tolist()],originalAssetsUnchanged=True)
(ROOT/'tools/reports/timber-continuity-v38.json').write_text(json.dumps(report,indent=2))
print(json.dumps(report),flush=True)
