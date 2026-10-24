"""Lossless original GLB splice + real contextual AO, independent complete source."""
from pathlib import Path
import bpy,json,struct,copy,hashlib,random,time
import numpy as np
from mathutils import Vector,Matrix,Quaternion
from mathutils.bvhtree import BVHTree
ROOT=Path(__file__).resolve().parents[2];D=ROOT/'assets/src/v2/settlements/lodge-furniture-v38';SOURCE=ROOT/'web/public/assets/gh_lanchuan_lodge.glb';OUT=ROOT/'web/public/assets/v2/gh_lanchuan_lodge_furniture38.glb';BLEND=D/'lodge-complete.blend';start=time.monotonic()
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
def read(p):
 raw=p.read_bytes();n=struct.unpack_from('<I',raw,12)[0];return json.loads(raw[20:20+n]),bytearray(raw[28+n:])
def write(p,d,b):
 while len(b)%4:b.append(0)
 d['buffers']=[{'byteLength':len(b)}];j=json.dumps(d,separators=(',',':')).encode();j+=b' '*((-len(j))%4)
 p.write_bytes(struct.pack('<III',0x46546c67,2,28+len(j)+len(b))+struct.pack('<II',len(j),0x4e4f534a)+j+struct.pack('<II',len(b),0x004e4942)+b)
def acc(d,b,i):
 a=d['accessors'][i];v=d['bufferViews'][a['bufferView']];w={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4}[a['type']];dtype={5126:'<f4',5125:'<u4',5123:'<u2',5121:'u1'}[a['componentType']];size=np.dtype(dtype).itemsize
 return np.ndarray((a['count'],w),dtype=dtype,buffer=b,offset=v.get('byteOffset',0)+a.get('byteOffset',0),strides=(v.get('byteStride',w*size),size)).copy()
def add(d,b,array,typ,component,target):
 while len(b)%4:b.append(0)
 view=len(d['bufferViews']);d['bufferViews'].append({'buffer':0,'byteOffset':len(b),'byteLength':array.nbytes,'target':target});b.extend(array.tobytes());i=len(d['accessors']);d['accessors'].append({'bufferView':view,'componentType':component,'count':len(array),'type':typ});return i
orig,origbin=read(SOURCE);d,b=copy.deepcopy(orig),bytearray(origbin);removed=[]
boxes=[]
for cy,back in [(2.04,1),(-.6,-1)]:
 boxes += [('linen',(5.3,cy,.25),(2.4,.85,.5)),('linen',(5.3,cy+back*.32,.65),(2.4,.22,.5))]
for k in range(3):boxes += [('plasterw',(9.3+k*.75,2.95,.43),(.62,.62,.86)),('iron',(9.3+k*.75,2.64,.5),(.36,.02,.36))]
for material,center,size in boxes:
 c=np.array(center);s=np.array(size)/2;lo=c-s;hi=c+s;hits=0
 for mi,m in enumerate(d['meshes']):
  for pi,p in enumerate(m['primitives']):
   if d['materials'][p['material']]['name']!=material:continue
   xyz=acc(d,b,p['attributes']['POSITION']);xyz=xyz[:,[0,2,1]]*np.array([1,-1,1]);indices=acc(d,b,p['indices']).reshape(-1,3);points=xyz[indices]
   mask=np.all((points>=lo-2e-5)&(points<=hi+2e-5),axis=(1,2));count=int(mask.sum())
   if count:
    assert count==12,(material,center,count);hits+=count;new=indices[~mask].astype('<u4').reshape(-1,1);p['indices']=add(d,b,new,'SCALAR',5125,34963);removed.append({'mesh':m['name'],'material':material,'center':center,'triangles':count})
 assert hits==12,(material,center,hits)
# Empty original linen node remains an empty transform, never deletes its siblings.
for n in d['nodes']:
 if 'mesh'in n and all(d['accessors'][p['indices']]['count']==0 for p in d['meshes'][n['mesh']]['primitives']):del n['mesh']
for m in d['meshes']:m['primitives']=[p for p in m['primitives']if d['accessors'][p['indices']]['count']]
f,fb=read(D/'lodge-furniture.glb');offset={k:len(d.get(k,[]))for k in ['bufferViews','accessors','samplers','images','textures','materials','meshes','nodes']}
while len(b)%4:b.append(0)
base=len(b);b.extend(fb)
for v in f['bufferViews']:v['byteOffset']=v.get('byteOffset',0)+base
for a in f['accessors']:a['bufferView']+=offset['bufferViews']
for im in f.get('images',[]):
 if 'bufferView'in im:im['bufferView']+=offset['bufferViews']
for t in f.get('textures',[]):
 if 'source'in t:t['source']+=offset['images']
 if 'sampler'in t:t['sampler']+=offset['samplers']
def textures(o):
 if isinstance(o,dict):
  for k,v in o.items():
   if k.endswith('Texture')and isinstance(v,dict)and'index'in v:v['index']+=offset['textures']
   else:textures(v)
 elif isinstance(o,list):
  for v in o:textures(v)
for m in f['materials']:textures(m)
for m in f['meshes']:
 for p in m['primitives']:
  p['indices']+=offset['accessors'];p['material']+=offset['materials'];p['attributes']={k:v+offset['accessors']for k,v in p['attributes'].items()}
for n in f['nodes']:
 if 'mesh'in n:n['mesh']+=offset['meshes']
 if 'children'in n:n['children']=[i+offset['nodes']for i in n['children']]
for k in offset:d.setdefault(k,[]).extend(f.get(k,[]))
d['scenes'][d.get('scene',0)]['nodes'].extend(i+offset['nodes']for i in f['scenes'][f.get('scene',0)]['nodes'])
for k in ['extensionsUsed','extensionsRequired']:
 if k in f:d[k]=sorted(set(d.get(k,[])+f[k]))
# Drop unused original empty mesh record safely by replacing it with another valid
# unused original mesh definition; no node references this slot anymore.
for m in d['meshes']:
 if not m['primitives']:m['primitives']=copy.deepcopy(next(mm['primitives']for mm in orig['meshes']if mm['primitives']))
write(D/'lodge-complete-before-ao.glb',d,b)
bpy.ops.wm.read_factory_settings(use_empty=True);bpy.ops.import_scene.gltf(filepath=str(D/'lodge-complete-before-ao.glb'))
vs=[];fs=[]
for o in bpy.context.scene.objects:
 if o.type!='MESH' or any(m.name=='glass'for m in o.data.materials):continue
 first=len(vs);vs.extend(o.matrix_world@v.co for v in o.data.vertices);fs.extend(tuple(first+i for i in p.vertices)for p in o.data.polygons)
bvh=BVHTree.FromPolygons(vs,fs,epsilon=0);rng=random.Random(17);directions=[]
while len(directions)<64:
 v=Vector((rng.uniform(-1,1),rng.uniform(-1,1),rng.uniform(-1,1)))
 if .05<v.length<=1:directions.append(v.normalized())
parents={child:i for i,n in enumerate(d['nodes'])for child in n.get('children',[])}
def matrix(i):
 n=d['nodes'][i]
 if 'matrix'in n:m=Matrix(np.array(n['matrix']).reshape(4,4).T.tolist())
 else:q=n.get('rotation',[0,0,0,1]);m=Matrix.LocRotScale(Vector(n.get('translation',[0,0,0])),Quaternion((q[3],*q[:3])),Vector(n.get('scale',[1,1,1])))
 return matrix(parents[i])@m if i in parents else m
stats=[]
for ni in range(offset['nodes'],len(d['nodes'])):
 node=d['nodes'][ni]
 if 'mesh'not in node:continue
 mesh=copy.deepcopy(d['meshes'][node['mesh']]);node['mesh']=len(d['meshes']);d['meshes'].append(mesh);world=matrix(ni);normalMatrix=world.to_3x3().inverted().transposed()
 for p in mesh['primitives']:
  xyz=acc(d,b,p['attributes']['POSITION']);normals=acc(d,b,p['attributes']['NORMAL']);out=np.zeros((len(xyz),4),dtype='<f4');cache={}
  for i,(co,no)in enumerate(zip(xyz,normals)):
   w=world@Vector(co);nn=(normalMatrix@Vector(no)).normalized();point=Vector((w.x,-w.z,w.y));normal=Vector((nn.x,-nn.z,nn.y));key=tuple(np.round((*point,*normal),6))
   if key not in cache:
    occ=sky=ns=0
    for ray in directions:
     ray=ray if ray.dot(normal)>0 else -ray;hit=bvh.ray_cast(point+normal*.008,ray,1.0)
     if hit[0]is not None:occ+=(1-hit[3])**2
     if ray.z>=-.35:
      ns+=1
      if bvh.ray_cast(point+normal*.008,ray,40)[0]is None:sky+=1
    ao=max(.25,min(1,1-.88*occ/64));cache[key]=(ao,ao,sky/max(1,ns),1)
   out[i]=cache[key]
  p['attributes']['COLOR_0']=add(d,b,out,'VEC4',5126,34962);stats.append({'node':node['name'],'vertices':len(out),'uniqueSamples':len(cache),'minAO':float(out[:,0].min()),'maxAO':float(out[:,0].max()),'minSky':float(out[:,2].min()),'maxSky':float(out[:,2].max())})
write(OUT,d,b)
# Strict untouched original payload/attribute check. Only old ten boxes' index lists differ.
assert bytes(b[:len(origbin)])==bytes(origbin)
for mi,m in enumerate(orig['meshes']):
 for pi,p in enumerate(m['primitives']):
  for sem,ai in p['attributes'].items():assert np.array_equal(acc(orig,origbin,ai),acc(d,b,ai)),(mi,pi,sem)
for i,n in enumerate(orig['nodes']):
 other=copy.deepcopy(d['nodes'][i]);old=copy.deepcopy(n)
 if 'mesh'in old and'mesh'not in other:del old['mesh']
 assert other==old,(i,n['name'])
triangles=sum(sum(d['accessors'][p['indices']]['count']//3 for p in d['meshes'][n['mesh']]['primitives'])for n in d['nodes']if'mesh'in n)
assert triangles==40552-120+23256,triangles
bpy.ops.wm.read_factory_settings(use_empty=True);bpy.ops.import_scene.gltf(filepath=str(OUT));bpy.ops.wm.save_as_mainfile(filepath=str(BLEND),compress=True)
originalMaterials=json.loads((ROOT/'tools/reports/lodge-dining-gi-v38.json').read_text())['materialReflectance'];newMaterials={}
for m in d['materials'][offset['materials']:]:
 p=m.get('pbrMetallicRoughness',{});factor=p.get('baseColorFactor',[1,1,1,1]);metallic=p.get('metallicFactor',1);newMaterials[m['name']]={'baseColor':factor,'metallic':metallic,'diffuseReflectance':(np.array(factor[:3])*(1-metallic)).tolist()}
meta={'sourceGLB':str(OUT.relative_to(ROOT/'web/public')),'sourceSHA256':sha(OUT),'sourceBlend':str(BLEND.relative_to(ROOT)),'blendSHA256':sha(BLEND),'originalSHA256':sha(SOURCE),'totalTriangles':triangles,'removedTriangles':120,'addedTriangles':23256,'nonFurnitureTriangles':40432,'removed':removed,'originalBinaryPrefixPreserved':True,'allOriginalVertexAttributesPreserved':True,'originalNodesAndDoorTransformPreserved':True,'newMaterials':newMaterials,'materialReflectance':{**originalMaterials,**{k:v['diffuseReflectance']for k,v in newMaterials.items()}},'ao':{'samples':64,'localDistance':1,'skyDistance':40,'excluded':'original transparent glass only','stats':stats},'seconds':time.monotonic()-start,'glbBytes':OUT.stat().st_size,'blendBytes':BLEND.stat().st_size,'limits':'New contextual AO has per-instance COLOR attributes; all identical geometry accessors remain shared. Original retained AO unchanged. GI and contact rebake mandatory.'}
(D/'complete-metadata.json').write_text(json.dumps(meta,indent=2)+'\n');print(json.dumps(meta),flush=True)
