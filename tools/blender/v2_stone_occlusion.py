"""Trace continuous AO/sky only on connected original foundation stones.
Preserves flat render normals, every vertex/index/UV, and original Blend/GLB.
"""
import bpy,json,struct,hashlib,base64,math,time
from pathlib import Path
import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree
ROOT=Path(__file__).resolve().parents[2];SOURCE=ROOT/'assets/src/v2/pastoral/house_a-lived.blend';GLB=ROOT/'web/public/assets/v2/house_a_lived.glb'
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest();protected={str(p.relative_to(ROOT)):sha(p)for p in[SOURCE,GLB]}
blob=GLB.read_bytes();length=struct.unpack_from('<I',blob,12)[0];doc=json.loads(blob[20:20+length]);binary=blob[28+length:]
def accessor(index):
 a=doc['accessors'][index];v=doc['bufferViews'][a['bufferView']];dtype={5126:'<f4',5125:'<u4',5123:'<u2',5121:'u1'}[a['componentType']];dims={'VEC2':2,'VEC3':3,'VEC4':4,'SCALAR':1}[a['type']];size=np.dtype(dtype).itemsize
 out=np.ndarray((a['count'],dims),dtype=dtype,buffer=binary,offset=v.get('byteOffset',0)+a.get('byteOffset',0),strides=(v.get('byteStride',dims*size),size)).copy()
 return out.astype(float)/np.iinfo(dtype).max if a.get('normalized')else out
node=next(n for n in doc['nodes']if n.get('name')=='house_a_stone');assert not any(k in node for k in['matrix','rotation','scale','translation']);primitive=doc['meshes'][node['mesh']]['primitives'][0]
positions=accessor(primitive['attributes']['POSITION']);placement=json.loads((ROOT/'tools/reports/stone-placement-v38.json').read_text());assert placement['sourceSHA256']==sha(GLB);assert placement['thresholdSourceSHA256']==sha(ROOT/'web/src/v2/threshold-stones.js');final_positions=positions.copy()
for i,x,y,z in placement['shifts']:final_positions[i]+=np.array([x,y,z])
assert hashlib.sha256(final_positions.tobytes()).hexdigest()==placement['positionSHA256']
normals=accessor(primitive['attributes']['NORMAL']);old=accessor(primitive['attributes']['COLOR_0']);indices=accessor(primitive['indices']).reshape(-1,3)
key=lambda p:tuple(round(float(q),5)for q in p)
keys=[key(p)for p in positions];parents=list(range(len(indices)))
def find(i):
 while parents[i]!=i:parents[i]=parents[parents[i]];i=parents[i]
 return i
edges={}
for ti,ids in enumerate(indices):
 for a,b in[(ids[0],ids[1]),(ids[1],ids[2]),(ids[2],ids[0])]:
  edge=tuple(sorted((keys[a],keys[b])))
  if edge in edges:parents[find(ti)]=find(edges[edge])
  else:edges[edge]=ti
components={}
for ti in range(len(indices)):components.setdefault(find(ti),[]).append(ti)
selected=[];groups={};sampling={}
for component,faces in components.items():
 ids=np.unique(indices[faces]);lo=positions[ids].min(axis=0);hi=positions[ids].max(axis=0)
 # Original ring rubble only; excludes box footings, plinth, chimney and treads.
 if len(faces)<40 or hi[1]>.2 or lo[1]<-.65:continue
 selected.append({'id':component,'triangles':len(faces),'bounds':[lo.tolist(),hi.tolist()]})
 for i in ids:groups.setdefault((component,keys[i]),[]).append(int(i))
 for face in faces:
  a,b,c=indices[face];area=np.cross(positions[b]-positions[a],positions[c]-positions[a])
  for i in[a,b,c]:
   k=(component,keys[i]);sampling[k]=sampling.get(k,np.zeros(3))+area
assert selected,'No original foundation stones selected'
for k,n in sampling.items():assert np.linalg.norm(n)>1e-9;sampling[k]=n/np.linalg.norm(n)
shiftmap={key(positions[i]):Vector((x,y,z))for i,x,y,z in placement['shifts']}
bpy.ops.wm.open_mainfile(filepath=str(SOURCE));bpy.context.view_layer.update();vertices=[];faces=[]
for ob in bpy.context.scene.objects:
 if ob.type!='MESH'or ob.name.startswith('preview_')or(ob.data.materials and ob.data.materials[0].name=='glass'):continue
 start=len(vertices)
 for v in ob.data.vertices:
  p=ob.matrix_world@v.co;q=Vector((p.x,p.z,-p.y))
  if ob.name=='house_a_stone':q+=shiftmap.get(key(q),Vector((0,0,0)))
  vertices.append(q)
 faces.extend(tuple(start+i for i in f.vertices)for f in ob.data.polygons)
start=len(vertices);vertices.extend([Vector((-500,-.02,500)),Vector((500,-.02,500)),Vector((500,-.02,-500)),Vector((-500,-.02,-500))]);ground=len(faces);faces.append(tuple(range(start,start+4)))
bvh=BVHTree.FromPolygons(vertices,faces,epsilon=0);SAMPLES=256;data=np.asarray(old[:,[0,2]],dtype='<f4').copy();started=time.monotonic()
for k,ids in groups.items():
 point=Vector(final_positions[ids[0]]);n=Vector(sampling[k]);t=n.cross(Vector((0,1,0))if abs(n.y)<.95 else Vector((1,0,0))).normalized();bt=n.cross(t);origin=point+n*.02;occ=0;up=escape=0
 for sample in range(SAMPLES):
  z=(sample+.5)/SAMPLES;r=math.sqrt(1-z*z);phi=sample*math.pi*(3-math.sqrt(5));direction=n*z+t*(r*math.cos(phi))+bt*(r*math.sin(phi));hit=bvh.ray_cast(origin,direction,2.)
  if hit[0]is not None:occ+=(1-hit[3]/2.)**1.5
  if direction.y>=-.35:
   up+=1;hit=bvh.ray_cast(origin,direction,40.)
   if hit[0]is None or hit[2]==ground:escape+=1
 ao=max(.3,min(1.,(1-occ/SAMPLES)*1.08));sky=escape/max(up,1)
 for i in ids:data[i]=(ao,sky)
# Save an editable derived scene with AO only. Render normals/smoothing stay hard.
def fingerprint():
 result={}
 for ob in bpy.context.scene.objects:
  if ob.type!='MESH':continue
  me=ob.data;result[ob.name]={'positions':[list(v.co)for v in me.vertices],'polys':[list(p.vertices)for p in me.polygons],'uv':{a.name:[list(v.uv)for v in a.data]for a in me.uv_layers},'normal':[list(v.vector)for v in me.corner_normals],'smooth':[p.use_smooth for p in me.polygons],'materials':[m.name for m in me.materials],'matrix':[list(r)for r in ob.matrix_world]}
  if ob.name!='house_a_stone':result[ob.name]['color']={a.name:[list(v.color)for v in a.data]for a in me.color_attributes}
 return hashlib.sha256(json.dumps(result,sort_keys=True).encode()).hexdigest()
before=fingerprint();ob=bpy.data.objects['house_a_stone'];me=ob.data;mapping={}
for k,ids in groups.items():
 if k[1]in mapping:assert np.array_equal(mapping[k[1]],data[ids[0]]),'Different connected stones coincide; do not average'
 mapping[k[1]]=data[ids[0]]
a=me.color_attributes['Color'];domain=a.domain;values=[tuple(v.color)for v in a.data]
if a.data_type!='FLOAT_COLOR':me.color_attributes.remove(a);a=me.color_attributes.new('Color','FLOAT_COLOR',domain)
for i,v in enumerate(a.data):
 vi=me.loops[i].vertex_index if domain=='CORNER'else i;p=ob.matrix_world@me.vertices[vi].co;c=mapping.get(key((p.x,p.z,-p.y)));v.color=values[i]if c is None else(float(c[0]),float(c[0]),float(c[1]),1)
assert fingerprint()==before
outblend=ROOT/'assets/src/v2/pastoral/house_a-lived-stone-38.blend';bpy.ops.wm.save_as_mainfile(filepath=str(outblend),check_existing=False);bpy.ops.wm.open_mainfile(filepath=str(outblend));assert fingerprint()==before
ob=bpy.data.objects['house_a_stone'];a=ob.data.color_attributes['Color'];matched=0
for i,v in enumerate(a.data):
 vi=ob.data.loops[i].vertex_index if a.domain=='CORNER'else i;p=ob.matrix_world@ob.data.vertices[vi].co;c=mapping.get(key((p.x,p.z,-p.y)))
 if c is not None:assert abs(v.color[0]-c[0])<1e-6 and abs(v.color[2]-c[1])<1e-6;matched+=1
assert matched>0
hashbytes=lambda a:hashlib.sha256(a.tobytes()).hexdigest();payload=lambda a:base64.b64encode(a.tobytes()).decode();affected=sorted(set(i for ids in groups.values()for i in ids))
result={'version':'stone-occlusion-38','nodeName':'house_a_stone','vertexCount':len(positions),'sourceGLB':'assets/v2/house_a_lived.glb','sourceSHA256':sha(GLB),'sourceBlend':str(SOURCE.relative_to(ROOT)),'blendSHA256':sha(SOURCE),'positionSHA256':hashbytes(final_positions),'originalPositionSHA256':hashbytes(positions),'thresholdPlacement':{'sourceSHA256':placement['thresholdSourceSHA256'],'moved':placement['stats']['moved']},'normalSHA256':hashbytes(normals),'indexSHA256':hashbytes(indices),'uvSHA256':hashbytes(accessor(primitive['attributes']['TEXCOORD_0'])),'occlusion':payload(data),'affected':affected,'components':selected,'groups':[ids for ids in groups.values()],'samples':SAMPLES,'editableDerivedSource':{'path':str(outblend.relative_to(ROOT)),'sha256':sha(outblend),'spatialUVMaterialRenderNormalsAndOtherMeshesSHA256':before},'scope':'Foundation connected stones AO/sky only; original flat normals/topology/UV and all other shading unchanged. Complete original house occlusion; no new GI.'}
out=ROOT/'web/src/v2/stone-occlusion-data.js';out.write_text('export default '+json.dumps(result,separators=(',',':'))+';\n')
for p,h in protected.items():assert sha(ROOT/p)==h
report={k:v for k,v in result.items()if k not in['occlusion','affected','groups']};report.update(seconds=time.monotonic()-started,affectedVertices=len(affected),physicalSamples=len(groups),range=[data[affected].min(axis=0).tolist(),data[affected].max(axis=0).tolist()],payloadBytes=out.stat().st_size,originalSourcesUnchanged=True)
(ROOT/'tools/reports/stone-occlusion-v38.json').write_text(json.dumps(report,indent=2));print(json.dumps(report),flush=True)
