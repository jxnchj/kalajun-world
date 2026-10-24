from pathlib import Path
import bpy,json,struct,hashlib
import numpy as np
from mathutils import Vector,Matrix,Quaternion
ROOT=Path(__file__).resolve().parents[2];D=ROOT/'assets/src/v2/settlements/lodge-furniture-v38';meta=json.loads((D/'complete-metadata.json').read_text());GLB=ROOT/'web/public'/meta['sourceGLB'];BLEND=ROOT/meta['sourceBlend'];raw=GLB.read_bytes();n=struct.unpack_from('<I',raw,12)[0];d=json.loads(raw[20:20+n]);b=raw[28+n:]
def acc(i):
 a=d['accessors'][i];v=d['bufferViews'][a['bufferView']];w={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4}[a['type']];dtype={5126:'<f4',5125:'<u4',5123:'<u2',5121:'u1'}[a['componentType']];size=np.dtype(dtype).itemsize
 return np.ndarray((a['count'],w),dtype=dtype,buffer=b,offset=v.get('byteOffset',0)+a.get('byteOffset',0),strides=(v.get('byteStride',w*size),size)).copy()
parents={ch:i for i,nd in enumerate(d['nodes'])for ch in nd.get('children',[])}
def matrix(i):
 n=d['nodes'][i]
 if 'matrix'in n:m=Matrix(np.array(n['matrix']).reshape(4,4).T.tolist())
 else:q=n.get('rotation',[0,0,0,1]);m=Matrix.LocRotScale(Vector(n.get('translation',[0,0,0])),Quaternion((q[3],*q[:3])),Vector(n.get('scale',[1,1,1])))
 return matrix(parents[i])@m if i in parents else m
bpy.ops.wm.open_mainfile(filepath=str(BLEND));total=0;worst=0
for i,n in enumerate(d['nodes']):
 if 'mesh'not in n:continue
 o=bpy.data.objects[n['name']];expected=[]
 for p in d['meshes'][n['mesh']]['primitives']:
  xyz=acc(p['attributes']['POSITION']);indices=acc(p['indices']).reshape(-1)
  for idx in indices:q=matrix(i)@Vector(xyz[idx]);expected.append((q.x,-q.z,q.y))
 o.data.calc_loop_triangles();actual=[tuple(o.matrix_world@o.data.vertices[idx].co)for t in o.data.loop_triangles for idx in t.vertices]
 assert len(actual)==len(expected),(o.name,len(actual),len(expected))
 # Blender importer maintains triangle order for this GLB; compare coordinates directly.
 error=float(np.max(np.abs(np.asarray(actual)-np.asarray(expected))));assert error<2e-5,(o.name,error);worst=max(worst,error);total+=len(actual)//3
 if not o.name.startswith('gh_lanchuan'):
  assert o.data.color_attributes and any(c.color[0]<.99 for c in o.data.color_attributes.active_color.data)
assert total==63688
hinge=bpy.data.objects['gh_lanchuan_lodge_door0'];assert hinge.rotation_mode=='QUATERNION' and tuple(hinge.rotation_quaternion)==(1.,0.,0.,0.)
assert all(hashlib.sha256(p.read_bytes()).hexdigest()==h for p,h in [(GLB,meta['sourceSHA256']),(BLEND,meta['blendSHA256']),(ROOT/'web/public/assets/gh_lanchuan_lodge.glb',meta['originalSHA256'])])
for k,v in meta['newMaterials'].items():v['transparent']=False;v['alphaMode']='OPAQUE';v['transmission']=0
meta['independentVerification']={'completeBlendReopened':True,'allGLBTrianglesMatchBlend':total,'maximumCoordinateError':worst,'closedDoorQuaternionUnchanged':True,'everyNewMeshHasNonWhiteAO':True,'originalGLBUnchanged':True}
(D/'complete-metadata.json').write_text(json.dumps(meta,indent=2)+'\n');print(json.dumps(meta['independentVerification']))
