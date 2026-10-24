"""Material-only editable derivative. Original GLB/Blend and every vertex stay untouched.
Runtime uses the same metre coordinates plus per-board scan offsets; no mesh export.
"""
from pathlib import Path
import bpy,json,struct,base64,hashlib
import numpy as np
ROOT=Path(__file__).resolve().parents[2];GLB=ROOT/'web/public/assets/gh_lanchuan_lodge.glb';LAYOUT=json.loads((ROOT/'web/src/v2/generated/lodge-wood-38.json').read_text());S=json.loads((ROOT/'web/src/v2/generated/lodge-wood-surfaces-38.json').read_text())
raw=GLB.read_bytes();assert hashlib.sha256(raw).hexdigest()==LAYOUT['sourceSHA256'];n=struct.unpack_from('<I',raw,12)[0];doc=json.loads(raw[20:20+n]);binary=raw[28+n:]
def accessor(index):
 a=doc['accessors'][index];v=doc['bufferViews'][a['bufferView']];components={'VEC2':2,'VEC3':3,'VEC4':4,'SCALAR':1}[a['type']];dtype={5126:'<f4',5123:'<u2',5125:'<u4',5121:'u1'}[a['componentType']];size=np.dtype(dtype).itemsize;start=v.get('byteOffset',0)+a.get('byteOffset',0);stride=v.get('byteStride',components*size)
 return np.ndarray((a['count'],components),dtype=dtype,buffer=binary,offset=start,strides=(stride,size)).copy()
bpy.ops.wm.read_factory_settings(use_empty=True);bpy.ops.import_scene.gltf(filepath=str(GLB),merge_vertices=False)
def fingerprint(o):
 h=hashlib.sha256();h.update(np.array([tuple(v.co)for v in o.data.vertices],dtype='<f4').tobytes());h.update(np.array([l.vertex_index for l in o.data.loops],dtype='<u4').tobytes());h.update(np.array([tuple(n.vector)for n in o.data.corner_normals],dtype='<f4').tobytes())
 for a in o.data.color_attributes:h.update(np.array([tuple(v.color)for v in a.data],dtype='<f4').tobytes())
 return h.hexdigest()
before={o.name:fingerprint(o)for o in bpy.context.scene.objects if o.type=='MESH'}
images={}
for kind,item in S['maps'].items():
 image=bpy.data.images.load(str(ROOT/'web/public/assets/v2/lodge-wood'/item['file']),check_existing=True);image.colorspace_settings.name='sRGB'if kind in('color','end')else'Non-Color';image.pack();images[kind]=image
mats={}
for role,label in enumerate(('finished dining timber','interior lining boards','interior floorboards','sawn furniture end')):
 m=bpy.data.materials.new('lodge38 '+label);m.use_nodes=True;nodes=m.node_tree.nodes;links=m.node_tree.links;bs=nodes.get('Principled BSDF');bs.inputs['Coat Weight'].default_value=(.22,.035,.10,0)[role];bs.inputs['Coat Roughness'].default_value=.3
 uv=nodes.new('ShaderNodeUVMap');uv.uv_map='LodgeWood38';separate=nodes.new('ShaderNodeSeparateXYZ');links.new(uv.outputs['UV'],separate.inputs[0]);seed=nodes.new('ShaderNodeAttribute');seed.attribute_name='LodgeWoodSeed38'
 def mathop(op,a,b=None):
  node=nodes.new('ShaderNodeMath');node.operation=op
  for i,value in enumerate((a,b)):
   if value is None:continue
   if isinstance(value,(int,float)):node.inputs[i].default_value=value
   else:links.new(value,node.inputs[i])
  return node.outputs[0]
 def hash_node(value):return mathop('FRACT',mathop('MULTIPLY',mathop('SINE',mathop('ADD',mathop('MULTIPLY',value,127.1),mathop('MULTIPLY',seed.outputs['Fac'],311.7))),43758.5453))
 x,y=separate.outputs['X'],separate.outputs['Y'];combine=nodes.new('ShaderNodeCombineXYZ')
 if role==3:
  links.new(mathop('ADD',mathop('DIVIDE',x,.35),.37),combine.inputs['X']);links.new(mathop('ADD',mathop('DIVIDE',y,.35),.61),combine.inputs['Y'])
 else:
  width=.14 if role==1 else .18;length=1.35 if role==2 else 9.;board=mathop('FLOOR',mathop('DIVIDE',x,width));join=mathop('FLOOR',mathop('DIVIDE',mathop('ADD',y,mathop('MULTIPLY',hash_node(board),length)),length));key=mathop('ADD',board,mathop('MULTIPLY',join,3.13))
  links.new(mathop('ADD',mathop('DIVIDE',x,S['metres']),hash_node(key)),combine.inputs['X']);links.new(mathop('ADD',mathop('DIVIDE',y,S['metres']),hash_node(mathop('ADD',key,41.))),combine.inputs['Y'])
 tex=nodes.new('ShaderNodeTexImage');tex.image=images['end'if role==3 else'color'];links.new(combine.outputs[0],tex.inputs['Vector']);color=tex.outputs['Color']
 if role==3:
  mix=nodes.new('ShaderNodeMixRGB');mix.inputs[0].default_value=.22;mix.inputs[1].default_value=(*S['endMean'],1);links.new(color,mix.inputs[2]);color=mix.outputs[0]
 mult=nodes.new('ShaderNodeMixRGB');mult.blend_type='MULTIPLY';mult.inputs[0].default_value=1;links.new(color,mult.inputs[1]);mult.inputs[2].default_value=(*(S['endFactor']if role==3 else S['factor']),1);links.new(mult.outputs[0],bs.inputs['Base Color'])
 if role<3:
  nt=nodes.new('ShaderNodeTexImage');nt.image=images['normal'];links.new(combine.outputs[0],nt.inputs['Vector']);normal=nodes.new('ShaderNodeNormalMap');normal.uv_map='LodgeWood38';normal.inputs['Strength'].default_value=.18 if role==0 else .28;links.new(nt.outputs['Color'],normal.inputs['Color']);links.new(normal.outputs['Normal'],bs.inputs['Normal'])
  rt=nodes.new('ShaderNodeTexImage');rt.image=images['roughness'];links.new(combine.outputs[0],rt.inputs['Vector']);value=mathop('ADD',mathop('MULTIPLY',rt.outputs['Color'],(.20,.20,.24)[role]),(.32,.62,.48)[role]);links.new(value,bs.inputs['Roughness'])
 else:bs.inputs['Roughness'].default_value=.68
 m['GI original linear mean']=S['giTargetLinear'];m['Runtime counterpart']='web/src/v2/lodge-wood.js; runtime additionally resolves tiny board seams in normals and roughness';mats[role]=m
report=[]
for record in LAYOUT['nodes']:
 o=bpy.data.objects[record['name']];primitive=next(m for m in doc['meshes']if m['name']==o.name)['primitives'][0];pos=accessor(primitive['attributes']['POSITION']);normal=accessor(primitive['attributes']['NORMAL']);field=np.frombuffer(base64.b64decode(record['field']),dtype='<f4').reshape(-1,4)
 lookup={}
 for i,p in enumerate(pos):lookup.setdefault(tuple(np.rint(p.astype(float)*100000).astype(np.int64)),[]).append(i)
 uv=o.data.uv_layers.new(name='LodgeWood38');seed=o.data.attributes.new('LodgeWoodSeed38','FLOAT','CORNER');slots={}
 for role,m in mats.items():slots[role]=len(o.data.materials);o.data.materials.append(m)
 assigned=0
 for face in o.data.polygons:
  roles=[]
  for li in face.loop_indices:
   v=o.matrix_world@o.data.vertices[o.data.loops[li].vertex_index].co;p=np.array([v.x,v.z,-v.y]);n=o.matrix_world.to_3x3()@o.data.corner_normals[li].vector;ng=np.array([n.x,n.z,-n.y]);ids=lookup.get(tuple(np.rint(p.astype(float)*100000).astype(np.int64)),[])
   if not ids:raise RuntimeError(('position differs',o.name,p))
   index=max(ids,key=lambda i:float(normal[i]@ng));f=field[index];uv.data[li].uv=tuple(f[:2]);seed.data[li].value=float(f[3]);roles.append(int(f[2]))
  assert len(set(roles))==1,(o.name,roles)
  if roles[0]>=0:face.material_index=slots[roles[0]];assigned+=1
 assert fingerprint(o)==before[o.name],('geometry or vertex AO changed',o.name)
 report.append({'node':o.name,'assignedFaces':assigned,'fingerprint':before[o.name]})
for o in bpy.context.scene.objects:
 if o.type=='MESH':assert fingerprint(o)==before[o.name]
OUT=ROOT/'assets/src/v2/settlements/lanchuan-lodge-wood-v38.blend';bpy.ops.wm.save_as_mainfile(filepath=str(OUT),compress=True);assert hashlib.sha256(GLB.read_bytes()).hexdigest()==LAYOUT['sourceSHA256']
(ROOT/'tools/reports/lodge-wood-blend-v38.json').write_text(json.dumps({'sourceSHA256':LAYOUT['sourceSHA256'],'derivedBlend':str(OUT.relative_to(ROOT)),'derivedSHA256':hashlib.sha256(OUT.read_bytes()).hexdigest(),'nodes':report,'allGeometryNormalsAOUnchanged':True},indent=2)+'\n');print('Saved editable material derivative',OUT)
