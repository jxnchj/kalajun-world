"""Six existing house_a furniture nodes: explicit structural grain and end projection.
Original geometry, source UV, AO, normals, GLB and Blend remain untouched.
Adds editable UV and loop sidecar only; no rendering or runtime adoption.
Existing wood_end image is retained and still has a regular ring pattern.
"""
import bpy,sys,json,hashlib,math,base64
from pathlib import Path
import numpy as np
from mathutils import Vector
R=Path(__file__).resolve().parents[2];OUT=R/'assets/src/v2/pastoral/furniture58';OUT.mkdir(exist_ok=True)
SOURCE=R/'assets/src/v2/pastoral/house_a-lived-timber-38.blend';GLB=R/'web/public/assets/v2/house_a_lived.glb';TEX=R/'web/public/assets/v2/boardwalk'
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
original={str(p.relative_to(R)):sha(p)for p in [SOURCE,GLB,R/'assets/src/v2/pastoral/house_a-lived.blend']}
bpy.ops.wm.open_mainfile(filepath=str(SOURCE));bpy.context.view_layer.update()
def fingerprint():
 d={}
 for o in bpy.context.scene.objects:
  if o.type!='MESH':continue
  m=o.data;d[o.name]={'p':[list(v.co)for v in m.vertices],'polygons':[list(p.vertices)for p in m.polygons],'matrix':[list(v)for v in o.matrix_world],'uv':{u.name:[list(x.uv)for x in u.data]for u in m.uv_layers if u.name!='Furniture58'},'colors':{a.name:[list(x.color)for x in a.data]for a in m.color_attributes},'normals':[list(n.vector)for n in m.corner_normals]}
 return hashlib.sha256(json.dumps(d,sort_keys=True).encode()).hexdigest()
before=fingerprint();images={};bpy.context.preferences.filepaths.save_version=0
for name,file in [('color','rough_wood_diff_1k.jpg'),('normal','rough_wood_nor_gl_1k.jpg'),('rough','rough_wood_rough_1k.jpg'),('end','wood_end.png')]:
 im=bpy.data.images.load(str(TEX/file),check_existing=True);im.colorspace_settings.name='sRGB'if name in('color','end')else'Non-Color';images[name]=im;im.pack()

def image_mean(image):
 a=np.empty(len(image.pixels),dtype=np.float32);image.pixels.foreach_get(a);rgb=a.reshape(-1,4)[:,:3].astype(np.float64)
 # Loaded byte image.pixels are encoded values. Shader image nodes perform the
 # sRGB transfer; normalisation must use that same linear-light mean.
 if image.colorspace_settings.name=='sRGB':rgb=np.where(rgb<=.04045,rgb/12.92,((rgb+.055)/1.055)**2.4)
 return np.maximum(rgb.mean(0),.001)
means={k:image_mean(v)for k,v in images.items()if k in('color','end')};materials={}
def material(old,end):
 key=(old.name,end)
 if key in materials:return materials[key]
 oldbs=next((n for n in old.node_tree.nodes if n.type=='BSDF_PRINCIPLED'),None)if old.use_nodes else None
 target=np.array(oldbs.inputs['Base Color'].default_value[:3]if oldbs else old.diffuse_color[:3]);
 if oldbs and oldbs.inputs['Base Color'].is_linked:
  upstream=oldbs.inputs['Base Color'].links[0].from_node
  if upstream.type=='TEX_IMAGE'and upstream.image:target=image_mean(upstream.image)
 m=bpy.data.materials.new('furniture58/'+old.name+('/end'if end else'/long'));m.use_nodes=True;n=m.node_tree.nodes;l=m.node_tree.links;bs=n.get('Principled BSDF');bs.inputs['Roughness'].default_value=.62 if end else .55
 uv=n.new('ShaderNodeUVMap');uv.uv_map='Furniture58';t=n.new('ShaderNodeTexImage');t.image=images['end'if end else'color'];l.new(uv.outputs['UV'],t.inputs['Vector']);mul=n.new('ShaderNodeMixRGB');mul.blend_type='MULTIPLY';mul.inputs[0].default_value=1;factor=target/means['end'if end else'color'];mul.inputs[2].default_value=(*factor,1);l.new(t.outputs['Color'],mul.inputs[1]);contrast=n.new('ShaderNodeMixRGB');contrast.blend_type='MIX';contrast.inputs[0].default_value=.32 if end else .24;contrast.inputs[1].default_value=(*target,1);l.new(mul.outputs[0],contrast.inputs[2]);l.new(contrast.outputs[0],bs.inputs['Base Color'])
 if not end:
  rough=n.new('ShaderNodeTexImage');rough.image=images['rough'];l.new(uv.outputs[0],rough.inputs['Vector']);scale=n.new('ShaderNodeMapRange');scale.inputs['From Min'].default_value=0;scale.inputs['From Max'].default_value=1;scale.inputs['To Min'].default_value=.44;scale.inputs['To Max'].default_value=.66;l.new(rough.outputs['Color'],scale.inputs[0]);l.new(scale.outputs[0],bs.inputs['Roughness']);normal=n.new('ShaderNodeTexImage');normal.image=images['normal'];l.new(uv.outputs[0],normal.inputs['Vector']);nm=n.new('ShaderNodeNormalMap');nm.uv_map='Furniture58';nm.inputs['Strength'].default_value=.07;l.new(normal.outputs['Color'],nm.inputs['Color']);l.new(nm.outputs[0],bs.inputs['Normal'])
 m['sourceMaterial']=old.name;m['meanFactor']=[float(v)for v in factor];materials[key]=m;return m

# Explicit construction axes follow v2_joinery.py, never a PCA length guess.
# Each expected extent also asserts that disconnected member order still agrees
# with the actual editable source before any new material assignment is saved.
def member(role,axis,dims):return (role,axis,dims)
BED=[member('stout foot',2,[.115,.115,.395])]*4
for _ in range(2):BED += [member('long apron',0,[2.35,.055,.215]),member('apron lower bead',0,[2.23,.055,.015])]
BED += [member('side apron',1,[.055,1.66,.215])]*2+[member('mattress supporting slat',0,[2.43,1.78/12-.009,.045])]*12+[member('tenon shoulder',2,[.08,.08,.085])]*4
CHEST=[member('corner stile',2,[.065,.065,.58])]*4
for _ in range(2):CHEST += [member('frame rail',0,[.77,.035,.065])]*2+[member('recessed panel',2,[.381,.023,.375])]*2
CHEST += [member('side panel',1,[.023,.47,.485])]*2+[member('floor panel',0,[.85,.55,.035]),member('upper rim',0,[.86,.56,.025])]
LID=[member('breadboard end',1,[.04,.63,.06])]*2+[member('lid plank',0,[.86,.63/3-.0016,.06])]*3
MEMBERS={
 'pastoral_house_sleep_platform':BED,
 'pastoral_house_chest_body':CHEST,
 'pastoral_house_chest_lid':LID,
 'pastoral_house_window_bench':[member('bench seat',0,[1.4,.42,.10])],
 'pastoral_house_bench_leg':[member('bench leg',2,[.08,.35,.40])],
 'pastoral_house_bench_leg.001':[member('bench leg',2,[.08,.35,.40])],
}
def selected(o):return o.name in MEMBERS
records=[]
for o in list(bpy.context.scene.objects):
 if o.type!='MESH'or not selected(o):continue
 m=o.data;oldm=list(m.materials);oldindices=[p.material_index for p in m.polygons];uv=m.uv_layers.new(name='Furniture58');count=len(m.vertices);parent=list(range(count))
 def find(x):
  while parent[x]!=x:parent[x]=parent[parent[x]];x=parent[x]
  return x
 def join(a,b):parent[find(a)]=find(b)
 # Recover original disconnected timber members, including UV seam duplicates.
 keys={}
 for v in m.vertices:
  k=tuple(round(float(x),5)for x in v.co)
  if k in keys:join(v.index,keys[k])
  else:keys[k]=v.index
 for e in m.edges:join(e.vertices[0],e.vertices[1])
 groups={}
 for i in range(count):groups.setdefault(find(i),[]).append(i)
 data={};component_records=[]
 assert len(groups)==len(MEMBERS[o.name]),(o.name,len(groups),len(MEMBERS[o.name]))
 for ci,ids in enumerate(sorted(groups.values(),key=min)):
  role,axisIndex,expected=MEMBERS[o.name][ci]
  points=np.array([o.matrix_world@m.vertices[i].co for i in ids]);center=(points.min(0)+points.max(0))/2;dimensions=np.ptp(points,axis=0)
  assert np.allclose(dimensions,expected,atol=2e-6,rtol=0),(o.name,ci,role,dimensions,expected)
  axis=np.eye(3)[axisIndex];endOnly=False
  helper=np.eye(3)[np.argmin(abs(axis))];a=np.cross(axis,helper);a/=np.linalg.norm(a);b=np.cross(axis,a);seed=int(hashlib.sha256((o.name+':'+str(ci)).encode()).hexdigest()[:8],16);offset=[(seed%997)/997,((seed//997)%991)/991];span=np.ptp((points-center)@np.column_stack([a,b,axis]),axis=0)
  for i in ids:data[i]=(ci,center,axis,a,b,offset,endOnly)
  component_records.append({'id':ci,'vertices':len(ids),'center':center.tolist(),'axis':axis.tolist(),'transverseU':a.tolist(),'transverseV':b.tolist(),'span':span.tolist(),'offset':offset,'endOnly':endOnly,'role':role,'axisIndex':axisIndex,'dimensionsWorld':dimensions.tolist(),'grainSource':'tools/blender/v2_joinery.py explicit member design (bench follows actual structural member)'})
 slots={};loops=[]
 for p in m.polygons:
  old=oldm[oldindices[p.index]];ci,c,axis,a,b,off,endOnly=data[p.vertices[0]];normal=np.array((o.matrix_world.to_3x3().inverted().transposed()@p.normal).normalized());end=endOnly or abs(np.dot(normal,axis))>.88;mat=material(old,end);key=mat.name
  if key not in slots:m.materials.append(mat);slots[key]=len(m.materials)-1
  p.material_index=slots[key]
  across=a if abs(np.dot(normal,b))>=abs(np.dot(normal,a))else b
  for li in p.loop_indices:
   vi=m.loops[li].vertex_index;delta=np.array(o.matrix_world@m.vertices[vi].co)-c
   corner=np.array((o.matrix_world.to_3x3().inverted().transposed()@m.corner_normals[li].vector).normalized());end=endOnly or abs(np.dot(corner,axis))>.88;across=a if abs(np.dot(corner,b))>=abs(np.dot(corner,a))else b
   q=(np.array([delta@a,delta@b])/.42+np.array([.5,.55]))if end else(np.array([delta@across/.55,delta@axis/2.1])+off)
   uv.data[li].uv=q;loops.append([li,vi,ci,int(end),float(q[0]),float(q[1])])
 o['furniture58Scope']='original geometry, source UV, AO and normals retained; additional editable per-member physical grain UV'
 records.append({'name':o.name,'originalMaterials':[x.name for x in oldm],'originalMaterialIndices':oldindices,'vertexCount':count,'components':component_records,'loops':loops,'worldPositions':[[float(v)for v in o.matrix_world@x.co]for x in m.vertices],'sourceUV':[[float(v)for v in m.uv_layers[0].data[i].uv]for i in range(len(m.loops))],'sourceNormals':[[float(v)for v in (o.matrix_world.to_3x3().inverted().transposed()@n.vector).normalized()]for n in m.corner_normals]})
assert set(x['name']for x in records)==set(MEMBERS) and fingerprint()==before,'Original topology/UV/AO/normals changed'
factorRecords={m['sourceMaterial']+('/end'if k[1]else'/long'):list(m['meanFactor'])for k,m in materials.items()}
scene=bpy.context.scene;scene['furniture58Originals']=json.dumps(original);scene['furniture58Scope']='offline candidate; no runtime GLB or GI replacement';blend=OUT/'house-a-furniture58.blend';bpy.ops.wm.save_as_mainfile(filepath=str(blend),check_existing=False)
bpy.ops.wm.open_mainfile(filepath=str(blend));assert fingerprint()==before,'Persisted source changed';assert all(sha(R/p)==h for p,h in original.items())
report={'version':'house-a-furniture58','sourceHashes':original,'derivedBlend':str(blend.relative_to(R)),'derivedSHA256':sha(blend),'preservedGeometrySourceUVAONormalsSHA256':before,'textureSources':{k:{'path':str((TEX/f).relative_to(R)),'sha256':sha(TEX/f)}for k,f in [('color','rough_wood_diff_1k.jpg'),('normal','rough_wood_nor_gl_1k.jpg'),('rough','rough_wood_rough_1k.jpg'),('end','wood_end.png')]},'coordinates':'Blender Z-up world metres, loops retain original mesh vertex ids; UV is added not original replaced','scaleMetres':{'longAcross':.55,'longAlong':2.1,'endDiameter':.42},'materialFactors':factorRecords,'textureLinearMeans':{k:[float(x)for x in v]for k,v in means.items()},'finishedContrast':{'long':.24,'end':.32},'addedUVLayer':'Furniture58','objects':records,'runtimeIntegrated':False,'limits':'Independent OFF candidate. Existing wood_end.png has regular rings; this corrects structural projection and mean-preserving contrast, not the original end-grain image. No new woodwork, GLB replacement, GI re-bake or collision geometry. Offline UV/material preview follows corner-based projection; bevel transition needs actual runtime review.'}
(OUT/'house-a-furniture58-coordinates.json').write_text(json.dumps(report,separators=(',',':')))
print(json.dumps({'objects':len(records),'components':sum(len(x['components'])for x in records),'loops':sum(len(x['loops'])for x in records),'preserved':True}),flush=True)
