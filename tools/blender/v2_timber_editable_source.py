"""Create editable derived woodhouse source corresponding exactly to runtime sidecar.
Original Blend/GLB and GI tables are never rewritten or rebound to a fake hash.
"""
import bpy,json,hashlib,base64,struct,array
import numpy as np
from pathlib import Path
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[2];DATA=ROOT/'web/src/v2/timber-continuity-data.js'
data=json.loads(DATA.read_text().split('export default ',1)[1].rsplit(';',1)[0])
source=ROOT/data['sourceBlend'];glb=ROOT/'web/public'/data['sourceGLB'];sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
assert sha(source)==data['blendSHA256'];assert sha(glb)==data['sourceSHA256']
blob=glb.read_bytes();size=struct.unpack_from('<I',blob,12)[0];doc=json.loads(blob[20:20+size]);binary=blob[28+size:]
node=next(n for n in doc['nodes']if n.get('name')==data['nodeName']);a=doc['accessors'][doc['meshes'][node['mesh']]['primitives'][0]['attributes']['POSITION']];v=doc['bufferViews'][a['bufferView']]
positions=np.ndarray((a['count'],3),dtype='<f4',buffer=binary,offset=v.get('byteOffset',0)+a.get('byteOffset',0),strides=(v.get('byteStride',12),4))
normals=np.frombuffer(base64.b64decode(data['normals']),dtype='<f4').reshape(-1,3);occlusion=np.frombuffer(base64.b64decode(data['occlusion']),dtype='<f4').reshape(-1,2)
key=lambda p:tuple(round(float(q),5)for q in p)
mapping={key(p):i for i,p in enumerate(positions)}
def digest_values(values):return hashlib.sha256(np.asarray(values).tobytes()).hexdigest()
def fingerprint():
 result={}
 for ob in bpy.context.scene.objects:
  if ob.type!='MESH':continue
  me=ob.data
  # Includes every spatial and UV input, material assignment and instance pose.
  result[ob.name]={'positions':digest_values([list(v.co)for v in me.vertices]),'faces':[list(p.vertices)for p in me.polygons],'uv':{u.name:digest_values([list(x.uv)for x in u.data])for u in me.uv_layers},'materials':[m.name if m else None for m in me.materials],'materialIndices':[p.material_index for p in me.polygons],'matrix':digest_values([list(row)for row in ob.matrix_world])}
  if ob.name!=data['nodeName']:
   result[ob.name]['smooth']=[p.use_smooth for p in me.polygons]
   result[ob.name]['normal']=digest_values([list(n.vector)for n in me.corner_normals])
   result[ob.name]['color']={a.name:digest_values([list(d.color)for d in a.data])for a in me.color_attributes}
 return hashlib.sha256(json.dumps(result,sort_keys=True).encode()).hexdigest()
bpy.ops.wm.open_mainfile(filepath=str(source));bpy.context.view_layer.update();before=fingerprint()
ob=bpy.data.objects[data['nodeName']];me=ob.data
local=[];colors=[]
for v in me.vertices:
 p=ob.matrix_world@v.co;i=mapping[key((p.x,p.z,-p.y))]
 n=Vector(normals[i]);world=Vector((n.x,-n.z,n.y));local.append((ob.matrix_world.to_3x3().transposed()@world).normalized());colors.append(occlusion[i])
for p in me.polygons:p.use_smooth=True
me.normals_split_custom_set([local[l.vertex_index]for l in me.loops])
attr=me.color_attributes.get('Color');assert attr.domain in ('POINT','CORNER')
# The imported legacy source is BYTE_COLOR. Retain the domain but use float
# storage in this new derived source so the traced linear AO/sky is not quantized.
if attr.data_type!='FLOAT_COLOR':
 domain=attr.domain;me.color_attributes.remove(attr);attr=me.color_attributes.new('Color','FLOAT_COLOR',domain)
 me.color_attributes.active_color_index=list(me.color_attributes).index(attr);me.color_attributes.render_color_index=list(me.color_attributes).index(attr)
for i,d in enumerate(attr.data):
 c=colors[me.loops[i].vertex_index if attr.domain=='CORNER' else i];d.color=(float(c[0]),float(c[0]),float(c[1]),1)
ob['timberContinuityVersion']=data['version'];ob['timberContinuityInputSHA256']=data['sourceSHA256'];ob['timberContinuityScope']='side normals and physically re-traced AO/sky only; original topology/UV/caps unchanged'
bpy.context.scene['timberContinuityOriginalBlendSHA256']=data['blendSHA256']
assert fingerprint()==before
out=ROOT/'assets/src/v2/pastoral/house_a-lived-timber-38.blend'
bpy.ops.wm.save_as_mainfile(filepath=str(out),check_existing=False)
bpy.ops.wm.open_mainfile(filepath=str(out));bpy.context.view_layer.update();assert fingerprint()==before
ob=bpy.data.objects[data['nodeName']];me=ob.data;max_error=0
normal_matrix=ob.matrix_world.to_3x3().inverted().transposed()
for loop,n in zip(me.loops,me.corner_normals):
 v=me.vertices[loop.vertex_index];p=ob.matrix_world@v.co;i=mapping[key((p.x,p.z,-p.y))]
 world=(normal_matrix@n.vector).normalized();actual=np.array([world.x,world.z,-world.y]);max_error=max(max_error,float(np.linalg.norm(actual-normals[i])))
 a=me.color_attributes['Color'];c=a.data[loop.index if a.domain=='CORNER' else loop.vertex_index].color
 assert abs(c[0]-occlusion[i,0])<1e-6 and abs(c[2]-occlusion[i,1])<1e-6
assert max_error<.001,('persisted custom normal differs',max_error)
assert sha(source)==data['blendSHA256'];assert sha(glb)==data['sourceSHA256']
derived={'path':str(out.relative_to(ROOT)),'sha256':sha(out),'originalSpatialUVMaterialAndOtherMeshShadingSHA256':before,'persistedNormalMaxError':max_error,'sourceAndOriginalGLBUnchanged':True,'runtimeContract':'Runtime still loads original GLB plus hash-bound sidecar. This editable Blend represents the exact side shading derivation; GI tables retain their actual original source identity, not this file hash.'}
data['editableDerivedSource']=derived;DATA.write_text('export default '+json.dumps(data,separators=(',',':'))+';\n')
(ROOT/'tools/reports/timber-editable-source-v38.json').write_text(json.dumps(derived,indent=2))
print(json.dumps(derived),flush=True)
