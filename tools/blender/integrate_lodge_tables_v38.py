"""Lossless original GLB splice + real contextual AO, independent complete source."""
from pathlib import Path
import bpy,json,struct,copy,hashlib,random,time
import numpy as np
from mathutils import Vector,Matrix,Quaternion
from mathutils.bvhtree import BVHTree
ROOT=Path(__file__).resolve().parents[2];D=ROOT/'assets/src/v2/settlements/lodge-tables-v38';SOURCE=ROOT/'web/public/assets/v2/gh_lanchuan_lodge_chairs38.glb';OUT=D/'lodge-tables-complete.glb';BLEND=D/'lodge-tables-complete.blend';start=time.monotonic()
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
layout=json.loads((ROOT/'web/src/v2/generated/lodge-interior-wood-38.json').read_text())
assert sha(SOURCE)==layout['sourceSHA256']
selected={r['name']:[c for c in r['components']if c.get('table')or c.get('leg')or c.get('indoorTop')or(r['name'].endswith('_pine')and abs(c['min'][0]+.9)<1e-5 and abs(c['max'][1]-1.1)<1e-5)]for r in layout['nodes']}
assert sum(map(len,selected.values()))==23
for mesh in d['meshes']:
 if mesh['name']not in selected:continue
 for p in mesh['primitives']:
  xyz=acc(d,b,p['attributes']['POSITION']);indices=acc(d,b,p['indices']).reshape(-1,3);points=xyz[indices];mask=np.zeros(len(indices),dtype=bool)
  parent=list(range(len(indices)));owner={}
  def find(i):
   while parent[i]!=i:parent[i]=parent[parent[i]];i=parent[i]
   return i
  for ti,triangle in enumerate(points):
   for point in triangle:
    key=tuple(np.round(point,6))
    if key in owner:parent[find(ti)]=find(owner[key])
    else:owner[key]=ti
  components={}
  for ti in range(len(indices)):components.setdefault(find(ti),[]).append(ti)
  for comp in selected[mesh['name']]:
   lo=np.array(comp['min']);hi=np.array(comp['max']);inside=np.zeros(len(indices),dtype=bool)
   for component in components.values():
    coords=points[component].reshape(-1,3)
    if np.max(np.abs(coords.min(axis=0)-lo))<2e-5 and np.max(np.abs(coords.max(axis=0)-hi))<2e-5:inside[component]=True
   count=int(inside.sum());expected=56 if comp.get('name')=='lounge-tea-top'else 12
   assert count==expected,(mesh['name'],comp,count);assert not np.any(mask&inside);mask|=inside
   removed.append({'mesh':mesh['name'],'bounds':[comp['min'],comp['max']],'name':comp.get('name','dining-table'if comp.get('table')else'dining-leg'if comp.get('leg')else'reception-body'),'triangles':count})
  p['indices']=add(d,b,indices[~mask].astype('<u4').reshape(-1,1),'SCALAR',5125,34963)
assert sum(r['triangles']for r in removed)==320
# Empty original linen node remains an empty transform, never deletes its siblings.
for n in d['nodes']:
 if 'mesh'in n and all(d['accessors'][p['indices']]['count']==0 for p in d['meshes'][n['mesh']]['primitives']):del n['mesh']
for m in d['meshes']:m['primitives']=[p for p in m['primitives']if d['accessors'][p['indices']]['count']]
f,fb=read(D/'joinery.glb');offset={k:len(d.get(k,[]))for k in ['bufferViews','accessors','samplers','images','textures','materials','meshes','nodes']}
# Reuse exact existing image bytes and texture objects; do not append another oak set.
def viewbytes(doc,binary,vi):
 v=doc['bufferViews'][vi];a=v.get('byteOffset',0);return bytes(binary[a:a+v['byteLength']])
oldimages={hashlib.sha256(viewbytes(d,b,im['bufferView'])).hexdigest():i for i,im in enumerate(d.get('images',[]))if'bufferView'in im}
image_reuse={};view_reuse={}
for i,im in enumerate(f.get('images',[])):
 h=hashlib.sha256(viewbytes(f,fb,im['bufferView'])).hexdigest()
 if h in oldimages:image_reuse[i]=oldimages[h];view_reuse[im['bufferView']]=d['images'][oldimages[h]]['bufferView']
texture_reuse={}
for i,t in enumerate(f.get('textures',[])):
 if t.get('source')not in image_reuse:continue
 for oi,ot in enumerate(d.get('textures',[])):
  if ot.get('source')==image_reuse[t['source']]and d.get('samplers',[])[ot.get('sampler',0)]==f.get('samplers',[])[t.get('sampler',0)]:texture_reuse[i]=oi;break
compressed=bytearray()
for vi,v in enumerate(f['bufferViews']):
 if vi in view_reuse:continue
 payload=viewbytes(f,fb,vi)
 while len(compressed)%4:compressed.append(0)
 v['byteOffset']=len(compressed);compressed.extend(payload)
fb=compressed
while len(b)%4:b.append(0)
base=len(b);b.extend(fb)
for vi,v in enumerate(f['bufferViews']):
 if vi in view_reuse:v.update(d['bufferViews'][view_reuse[vi]])
 else:v['byteOffset']=v.get('byteOffset',0)+base
for a in f['accessors']:a['bufferView']+=offset['bufferViews']
for im in f.get('images',[]):
 if 'bufferView'in im:im['bufferView']+=offset['bufferViews']
for t in f.get('textures',[]):
 if 'source'in t:t['source']+=offset['images']
 if 'sampler'in t:t['sampler']+=offset['samplers']
def textures(o):
 if isinstance(o,dict):
  for k,v in o.items():
   if k.endswith('Texture')and isinstance(v,dict)and'index'in v:v['index']=texture_reuse.get(v['index'],v['index']+offset['textures'])
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
write(D/'lodge-tables-before-ao.glb',d,b)
bpy.ops.wm.read_factory_settings(use_empty=True);bpy.ops.import_scene.gltf(filepath=str(D/'lodge-tables-before-ao.glb'))
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
assert triangles==114088-320+json.loads((D/'joinery-metadata.json').read_text())['triangles'],triangles
bpy.ops.wm.read_factory_settings(use_empty=True);bpy.ops.import_scene.gltf(filepath=str(OUT));bpy.ops.wm.save_as_mainfile(filepath=str(BLEND),compress=True)
originalMaterials=json.loads((ROOT/'assets/src/v2/settlements/lodge-chairs-v38/complete-metadata.json').read_text())['materialReflectance'];newMaterials={}
for m in d['materials'][offset['materials']:]:
 p=m.get('pbrMetallicRoughness',{});factor=p.get('baseColorFactor',[1,1,1,1]);metallic=p.get('metallicFactor',1);newMaterials[m['name']]={'baseColor':factor,'metallic':metallic,'factorOnlyReflectance':(np.array(factor[:3])*(1-metallic)).tolist(),'diffuseReflectance':json.loads((ROOT/'web/src/v2/generated/lodge-wood-surfaces-38.json').read_text())['giTargetLinear'],'reflectanceBasis':'calibrated full texture linear mean, not baseColorFactor alone'}
meta={'sourceGLB':str(OUT.relative_to(ROOT)),'sourceSHA256':sha(OUT),'sourceBlend':str(BLEND.relative_to(ROOT)),'blendSHA256':sha(BLEND),'originalSHA256':sha(SOURCE),'totalTriangles':triangles,'removedTriangles':320,'addedTriangles':json.loads((D/'joinery-metadata.json').read_text())['triangles'],'retainedTriangles':113768,'removed':removed,'originalBinaryPrefixPreserved':True,'reusedOriginalImages':len(image_reuse),'reusedOriginalTextures':len(texture_reuse),'allOriginalVertexAttributesPreserved':True,'originalNodesAndDoorTransformPreserved':True,'newMaterials':newMaterials,'materialReflectance':{**originalMaterials,**{k:v['diffuseReflectance']for k,v in newMaterials.items()}},'ao':{'samples':64,'localDistance':1,'skyDistance':40,'excluded':'original transparent glass only','stats':stats},'seconds':time.monotonic()-start,'glbBytes':OUT.stat().st_size,'blendBytes':BLEND.stat().st_size,'limits':'Offline only. 23 original components removed precisely; original other geometry/AO/door retained. Tea support reaches rug top .026. New full GI/contact and collision recapture required after approval; production remains unchanged.'}
(D/'complete-metadata.json').write_text(json.dumps(meta,indent=2)+'\n');print(json.dumps({k:v for k,v in meta.items()if k not in ['ao','materialReflectance','newMaterials','removed']}),flush=True)
