"""Non-destructive house_a timber surfacing study. Original GLB/Blend untouched.
Create editable source and loop-coordinate sidecar; no runtime or GI adoption.
--render adds independently lit review images, not baked world lighting.
"""
import bpy,sys,json,hashlib,math,base64
from pathlib import Path
import numpy as np
from mathutils import Vector
R=Path(__file__).resolve().parents[2];OUT=R/'assets/src/v2/pastoral/timber48';OUT.mkdir(exist_ok=True)
SOURCE=R/'assets/src/v2/pastoral/house_a-lived-timber-38.blend';GLB=R/'web/public/assets/v2/house_a_lived.glb';TEX=R/'web/public/assets/v2/boardwalk'
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
original={str(p.relative_to(R)):sha(p)for p in [SOURCE,GLB,R/'assets/src/v2/pastoral/house_a-lived.blend']}
bpy.ops.wm.open_mainfile(filepath=str(SOURCE));bpy.context.view_layer.update()
def fingerprint():
 d={}
 for o in bpy.context.scene.objects:
  if o.type!='MESH':continue
  m=o.data;d[o.name]={'p':[list(v.co)for v in m.vertices],'polygons':[list(p.vertices)for p in m.polygons],'matrix':[list(v)for v in o.matrix_world],'uv':{u.name:[list(x.uv)for x in u.data]for u in m.uv_layers if u.name!='Timber48'},'colors':{a.name:[list(x.color)for x in a.data]for a in m.color_attributes},'normals':[list(n.vector)for n in m.corner_normals]}
 return hashlib.sha256(json.dumps(d,sort_keys=True).encode()).hexdigest()
before=fingerprint();images={};bpy.context.preferences.filepaths.save_version=0
for name,file in [('color','rough_wood_diff_1k.jpg'),('normal','rough_wood_nor_gl_1k.jpg'),('rough','rough_wood_rough_1k.jpg'),('end','wood_end.png')]:
 im=bpy.data.images.load(str(TEX/file),check_existing=True);im.colorspace_settings.name='sRGB'if name in('color','end')else'Non-Color';images[name]=im;im.pack()

def image_mean(image):
 a=np.empty(len(image.pixels),dtype=np.float32);image.pixels.foreach_get(a);return np.maximum(a.reshape(-1,4)[:,:3].mean(0),.001)
means={k:image_mean(v)for k,v in images.items()if k in('color','end')};materials={}
def material(old,end):
 key=(old.name,end)
 if key in materials:return materials[key]
 oldbs=next((n for n in old.node_tree.nodes if n.type=='BSDF_PRINCIPLED'),None)if old.use_nodes else None
 target=np.array(oldbs.inputs['Base Color'].default_value[:3]if oldbs else old.diffuse_color[:3]);
 if oldbs and oldbs.inputs['Base Color'].is_linked:
  upstream=oldbs.inputs['Base Color'].links[0].from_node
  if upstream.type=='TEX_IMAGE'and upstream.image:target=image_mean(upstream.image)
 m=bpy.data.materials.new('timber48/'+old.name+('/end'if end else'/long'));m.use_nodes=True;n=m.node_tree.nodes;l=m.node_tree.links;bs=n.get('Principled BSDF');bs.inputs['Roughness'].default_value=.86
 uv=n.new('ShaderNodeUVMap');uv.uv_map='Timber48';t=n.new('ShaderNodeTexImage');t.image=images['end'if end else'color'];l.new(uv.outputs['UV'],t.inputs['Vector']);mul=n.new('ShaderNodeMixRGB');mul.blend_type='MULTIPLY';mul.inputs[0].default_value=1;factor=target/means['end'if end else'color'];mul.inputs[2].default_value=(*factor,1);l.new(t.outputs['Color'],mul.inputs[1]);l.new(mul.outputs[0],bs.inputs['Base Color'])
 if not end:
  rough=n.new('ShaderNodeTexImage');rough.image=images['rough'];l.new(uv.outputs[0],rough.inputs['Vector']);scale=n.new('ShaderNodeMapRange');scale.inputs['From Min'].default_value=0;scale.inputs['From Max'].default_value=1;scale.inputs['To Min'].default_value=.68;scale.inputs['To Max'].default_value=.96;l.new(rough.outputs['Color'],scale.inputs[0]);l.new(scale.outputs[0],bs.inputs['Roughness']);normal=n.new('ShaderNodeTexImage');normal.image=images['normal'];l.new(uv.outputs[0],normal.inputs['Vector']);nm=n.new('ShaderNodeNormalMap');nm.uv_map='Timber48';nm.inputs['Strength'].default_value=.23;l.new(normal.outputs['Color'],nm.inputs['Color']);l.new(nm.outputs[0],bs.inputs['Normal'])
 m['sourceMaterial']=old.name;m['meanFactor']=[float(v)for v in factor];materials[key]=m;return m

def selected(o):
 return o.name in ('house_a_log','house_a_logend','house_a_plank','house_a_shutter','house_a_door0_plank')or o.name.startswith('pastoral_house_lining_')or(o.name.startswith('pastoral_house_porch_')and any(m and m.name in ('log','logend','plank','v2_pastoral_pale','v2_pastoral_wood')for m in o.data.materials))
records=[]
for o in list(bpy.context.scene.objects):
 if o.type!='MESH'or not selected(o):continue
 m=o.data;oldm=list(m.materials);oldindices=[p.material_index for p in m.polygons];uv=m.uv_layers.new(name='Timber48');count=len(m.vertices);parent=list(range(count))
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
 for ci,ids in enumerate(groups.values()):
  points=np.array([o.matrix_world@m.vertices[i].co for i in ids]);center=(points.min(0)+points.max(0))/2;_,_,vt=np.linalg.svd(points-points.mean(0),full_matrices=False);axis=vt[0];axis*=1 if axis[np.argmax(abs(axis))]>=0 else-1
  endOnly=all(x.name=='logend'for x in oldm)
  if endOnly:axis=vt[-1];axis*=1 if axis[np.argmax(abs(axis))]>=0 else-1
  helper=np.eye(3)[np.argmin(abs(axis))];a=np.cross(axis,helper);a/=np.linalg.norm(a);b=np.cross(axis,a);seed=int(hashlib.sha256((o.name+':'+str(ci)).encode()).hexdigest()[:8],16);offset=[(seed%997)/997,((seed//997)%991)/991];span=np.ptp((points-center)@np.column_stack([a,b,axis]),axis=0)
  for i in ids:data[i]=(ci,center,axis,a,b,offset,endOnly)
  component_records.append({'id':ci,'vertices':len(ids),'center':center.tolist(),'axis':axis.tolist(),'transverseU':a.tolist(),'transverseV':b.tolist(),'span':span.tolist(),'offset':offset,'endOnly':endOnly})
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
 o['timber48Scope']='original geometry, source UV, AO and normals retained; additional editable per-member physical grain UV'
 records.append({'name':o.name,'originalMaterials':[x.name for x in oldm],'originalMaterialIndices':oldindices,'vertexCount':count,'components':component_records,'loops':loops,'worldPositions':[[float(v)for v in o.matrix_world@x.co]for x in m.vertices],'sourceUV':[[float(v)for v in m.uv_layers[0].data[i].uv]for i in range(len(m.loops))],'sourceNormals':[[float(v)for v in (o.matrix_world.to_3x3().inverted().transposed()@n.vector).normalized()]for n in m.corner_normals]})
assert records and fingerprint()==before,'Original topology/UV/AO/normals changed'
factorRecords={m['sourceMaterial']+('/end'if k[1]else'/long'):list(m['meanFactor'])for k,m in materials.items()}
scene=bpy.context.scene;scene['timber48Originals']=json.dumps(original);scene['timber48Scope']='offline candidate; no runtime GLB or GI replacement';blend=OUT/'house-a-group-timber48.blend';bpy.ops.wm.save_as_mainfile(filepath=str(blend),check_existing=False)
bpy.ops.wm.open_mainfile(filepath=str(blend));assert fingerprint()==before,'Persisted source changed';assert all(sha(R/p)==h for p,h in original.items())
report={'version':'house-a-group-timber48','sourceHashes':original,'derivedBlend':str(blend.relative_to(R)),'derivedSHA256':sha(blend),'preservedGeometrySourceUVAONormalsSHA256':before,'textureSources':{k:{'path':str((TEX/f).relative_to(R)),'sha256':sha(TEX/f)}for k,f in [('color','rough_wood_diff_1k.jpg'),('normal','rough_wood_nor_gl_1k.jpg'),('rough','rough_wood_rough_1k.jpg'),('end','wood_end.png')]},'coordinates':'Blender Z-up world metres, loops retain original mesh vertex ids; UV is added not original replaced','scaleMetres':{'longAcross':.55,'longAlong':2.1,'endDiameter':.42},'materialFactors':factorRecords,'objects':records,'runtimeIntegrated':False,'limits':'Component PCA and per-face end detection require close review; no GI re-bake or changed collision geometry.'}
(OUT/'house-a-timber48-coordinates.json').write_text(json.dumps(report,separators=(',',':')))
print(json.dumps({'objects':len(records),'components':sum(len(x['components'])for x in records),'loops':sum(len(x['loops'])for x in records),'preserved':True}),flush=True)
if '--render'in sys.argv:
 if '--baseline'in sys.argv:bpy.ops.wm.open_mainfile(filepath=str(SOURCE))
 scene=bpy.context.scene
 for o in list(scene.objects):
  if o.type in('CAMERA','LIGHT'):bpy.data.objects.remove(o,do_unlink=True)
 scene.world=bpy.data.worlds.new('timber48-review-world');scene.world.use_nodes=True;scene.world.node_tree.nodes['Background'].inputs[0].default_value=(.55,.65,.8,1);scene.world.node_tree.nodes['Background'].inputs[1].default_value=.55
 light=bpy.data.lights.new('review-sun','SUN');light.energy=2;light.angle=.08;o=bpy.data.objects.new('review-sun',light);scene.collection.objects.link(o);o.rotation_euler=(.55,-.3,-.5)
 fill=bpy.data.lights.new('review-inspection-fill','AREA');fill.energy=0;fill.shape='DISK';fill.size=2;fo=bpy.data.objects.new('review-inspection-fill',fill);scene.collection.objects.link(fo);fo.location=(1,-1.8,2.2);fo.rotation_euler=(Vector((-2,1,1.3))-fo.location).to_track_quat('-Z','Y').to_euler()
 cam=bpy.data.objects.new('review-camera',bpy.data.cameras.new('review-camera'));scene.collection.objects.link(cam);scene.camera=cam;cam.data.lens=22
 scene.render.engine='CYCLES';scene.cycles.device='CPU';scene.cycles.samples=20;scene.cycles.use_denoising=True;scene.render.resolution_x=1100;scene.render.resolution_y=760;scene.render.resolution_percentage=100;scene.view_settings.view_transform='AgX';scene.render.image_settings.file_format='PNG'
 for name,pos,target in [('exterior',(9,-10,5),(0,0,1.3)),('porch',(-4,-6,2.2),(0,-2.5,1.2)),('interior',(1.8,-1.7,1.65),(-2,1.5,1.6))]:
  fill.energy=180 if name=='interior'else 0
  cam.location=pos;cam.rotation_euler=(Vector(target)-cam.location).to_track_quat('-Z','Y').to_euler();scene.render.filepath=str(OUT/(('baseline-'if '--baseline'in sys.argv else'')+name+'.png'));bpy.ops.render.render(write_still=True)
