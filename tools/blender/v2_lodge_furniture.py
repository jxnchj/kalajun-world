"""Editable, offline-only public-lodge furniture candidate. No original asset or GI overwrite.
Blender Z up, metres; export is glTF Y up. --preview renders inspectable neutral studio views.
"""
from pathlib import Path
import bpy, math, json, hashlib, time, argparse
import numpy as np
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'assets/src/v2/settlements/lodge-furniture-v38';OUT.mkdir(parents=True,exist_ok=True)
START=time.monotonic();SOURCE=ROOT/'web/public/assets/gh_lanchuan_lodge.glb';SOURCE_SHA=hashlib.sha256(SOURCE.read_bytes()).hexdigest()
assert SOURCE_SHA=='21d20750939a5915f33211eb3f68d5c9a691307589756fa68055b85c90f85997'
parser=argparse.ArgumentParser();parser.add_argument('--preview',action='store_true');args=parser.parse_args()
bpy.ops.wm.read_factory_settings(use_empty=True)
def mat(name,rgb,rough=.6,metal=0):
 m=bpy.data.materials.new(name);m.use_nodes=True;b=m.node_tree.nodes.get('Principled BSDF');b.inputs['Base Color'].default_value=(*rgb,1);b.inputs['Roughness'].default_value=rough;b.inputs['Metallic'].default_value=metal;return m
cloth=mat('candidate linen original mean',(.86,.85,.81),.86)
paint=mat('candidate enamel original aggregate',(.8,.78,.72),.26)
rubber=mat('candidate rubber',(.05,.045,.04),.85)
metal=mat('candidate satin alloy',(.37,.37,.36),.31,.75)
glass=mat('candidate dark drum glazing',(.05,.045,.04),.13,.15)
wood=mat('candidate hidden sofa feet',(.24,.13,.06),.6)
# Normal-only weave: no baked AO or albedo darkening. 256px tile spans 8cm of actual cloth.
n=256;y,x=np.mgrid[:n,:n]/n;h=.5+.16*np.sin(x*2*math.pi*32)+.16*np.sin(y*2*math.pi*32)+.04*np.sin((x+y)*2*math.pi*64)
dy,dx=np.gradient(h);normal=np.stack([-dx*1.8,-dy*1.8,np.ones_like(h)],axis=-1);normal/=np.linalg.norm(normal,axis=-1,keepdims=True);pixels=np.concatenate([normal*.5+.5,np.ones((n,n,1))],axis=-1).astype(np.float32)
im=bpy.data.images.new('lodge cloth weave normal 8cm',n,n);im.colorspace_settings.name='Non-Color';im.pixels.foreach_set(pixels.ravel());im.filepath_raw=str(OUT/'cloth-normal.png');im.file_format='PNG';im.save();im.pack()
nt=cloth.node_tree;tex=nt.nodes.new('ShaderNodeTexImage');tex.image=im;nm=nt.nodes.new('ShaderNodeNormalMap');nm.inputs['Strength'].default_value=.38;nt.links.new(tex.outputs['Color'],nm.inputs['Color']);nt.links.new(nm.outputs['Normal'],nt.nodes.get('Principled BSDF').inputs['Normal'])
objects=[];groups=[]
def finish(o,name,m):
 o.name=name;o.data.materials.append(m);objects.append(o)
 # Planar metric UV, selected dominant face, supports actual metre weave repeat.
 uv=o.data.uv_layers.new(name='FurnitureMetres') if not o.data.uv_layers else o.data.uv_layers[0]
 for p in o.data.polygons:
  axis=max(range(3),key=lambda a:abs(p.normal[a]));a,b=[i for i in range(3)if i!=axis]
  for li in p.loop_indices:
   co=o.data.vertices[o.data.loops[li].vertex_index].co;uv.data[li].uv=(co[a]/.08,co[b]/.08)
 return o

def box(name,loc,size,m,bevel=.02):
 bpy.ops.mesh.primitive_cube_add(size=1,location=loc);o=bpy.context.object;o.dimensions=size;bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
 if bevel:
  mod=o.modifiers.new('Editable soft edge radius','BEVEL');mod.width=bevel;mod.segments=4
  mod=o.modifiers.new('Weighted surface normals','WEIGHTED_NORMAL');mod.keep_sharp=True
 for p in o.data.polygons:p.use_smooth=True
 return finish(o,name,m)
def lathe(name,cx,cy,cz,profile,m,segments=48):
 # radial profile (radius, axial y offset), circle lies XZ, front points toward -Y.
 vs=[(cx+r*math.cos(i*2*math.pi/segments),cy+d,cz+r*math.sin(i*2*math.pi/segments))for r,d in profile for i in range(segments)]
 fs=[]
 for j in range(len(profile)-1):
  for i in range(segments):k=(i+1)%segments;fs.append((j*segments+i,j*segments+k,(j+1)*segments+k,(j+1)*segments+i))
 me=bpy.data.meshes.new(name);me.from_pydata(vs,[],fs);me.update();o=bpy.data.objects.new(name,me);bpy.context.collection.objects.link(o)
 for p in me.polygons:p.use_smooth=True
 return finish(o,name,m)
def seam(name,pts):
 cu=bpy.data.curves.new(name,'CURVE');cu.dimensions='3D';cu.resolution_u=1;cu.bevel_depth=.0023;cu.bevel_resolution=2
 s=cu.splines.new('POLY');s.points.add(len(pts)-1)
 for p,co in zip(s.points,pts):p.co=(*co,1)
 o=bpy.data.objects.new(name,cu);bpy.context.collection.objects.link(o);cu.materials.append(cloth);objects.append(o)
def loop(x,y,z,w,d,r=.035):
 pts=[]
 for cx,cy,base in [(x+w/2-r,y+d/2-r,0),(x-w/2+r,y+d/2-r,90),(x-w/2+r,y-d/2+r,180),(x+w/2-r,y-d/2+r,270)]:
  for k in range(7):a=math.radians(base+k*90/6);pts.append((cx+r*math.cos(a),cy+r*math.sin(a),z))
 return pts+[pts[0]]
for index,(cy,back) in enumerate([(2.04,1),(-.6,-1)]):
 start=len(objects);cx=5.3;prefix=f'sofa {index+1}'
 box(prefix+' upholstered apron',(cx,cy,.235),(2.36,.81,.30),cloth,.055)
 for dx in [-1.04,1.04]:
  for dy in [-.31,.31]:box(prefix+' timber foot',(cx+dx,cy+dy,.06),(.09,.09,.12),wood,.012)
 for dx in [-1.09,1.09]:box(prefix+' rolled arm',(cx+dx,cy,.49),(.22,.83,.54),cloth,.075)
 for k in range(3):
  x=cx+(k-1)*.65
  box(prefix+f' seat cushion {k}',(x,cy-back*.07,.455),(.635,.62,.15),cloth,.058)
  seam(prefix+f' seat welt {k}',loop(x,cy-back*.07,.475,.617,.602,.055))
  o=box(prefix+f' loose back cushion {k}',(x,cy+back*.31,.665),(.637,.235,.465),cloth,.068)
  # No lean beyond original back envelope; shallow centre channel comes from distinct cushions.
 groups.append({'name':prefix,'objects':objects[start:],'bounds':[[4.1,cy-.43,0],[6.5,cy+.43,.9]],'originalParts':2})
# Three original appliances, preserve physical positions, spacing and face direction.
for index in range(3):
 start=len(objects);cx=9.3+index*.75;cy=2.95;prefix=('washer 'if index<2 else'dryer ')+str(index+1);front=cy-.28
 for dx in [-.298,.298]:box(prefix+' side',(cx+dx,cy,.43),(.024,.62,.86),paint,.01)
 box(prefix+' back',(cx,cy+.298,.43),(.572,.024,.836),paint,.009)
 box(prefix+' top',(cx,cy,.847),(.60,.60,.026),paint,.012)
 box(prefix+' toe kick',(cx,front+.02,.065),(.572,.04,.13),paint,.012)
 box(prefix+' control fascia',(cx,front+.012,.765),(.572,.024,.138),paint,.008)
 # White front panel with real round aperture, not a circle laid on an unbroken box.
 seg=64;vs=[]
 for i in range(seg):
  a=2*math.pi*i/seg;dx=math.cos(a);dz=math.sin(a);r=.208
  t=min(.286/max(abs(dx),1e-8),(.695-.445)/max(dz,1e-8) if dz>0 else (.445-.13)/max(-dz,1e-8))
  vs.extend([(cx+dx*r,front,.445+dz*r),(cx+dx*t,front,.445+dz*t)])
 fs=[(2*i,2*i+1,2*((i+1)%seg)+1,2*((i+1)%seg))for i in range(seg)]
 me=bpy.data.meshes.new(prefix+' aperture mesh');me.from_pydata(vs,[],fs);me.update();o=bpy.data.objects.new(prefix+' round aperture face',me);bpy.context.collection.objects.link(o);finish(o,o.name,paint)
 lathe(prefix+' door enamel ring',cx,front,.445,[(.209,0),(.218,-.005),(.222,-.008),(.218,-.012),(.193,-.015),(.182,-.009)],paint)
 lathe(prefix+' rubber seal',cx,front,.445,[(.182,-.009),(.174,.004),(.174,.029),(.169,.035)],rubber)
 lathe(prefix+' glass rim',cx,front,.445,[(.169,.035),(.164,.029),(.156,.032)],metal)
 lathe(prefix+' drum cavity',cx,front,.445,[(.156,.032),(.151,.16),(.01,.18),(0,.18)],glass)
 for k in range(3):
  a=k*2*math.pi/3;lathe(prefix+f' drum rib {k}',cx+math.cos(a)*.10,front+.12,.445+math.sin(a)*.10,[(.013,0),(.013,.035),(0,.035)],metal,12)
 lathe(prefix+' selector',cx+.105,front-.012,.765,[(.032,0),(.032,-.012),(.029,-.018),(0,-.018)],metal,32)
 box(prefix+' drawer',(cx-.15,front-.005,.778),(.18,.012,.044),paint,.006)
 box(prefix+' screen',(cx+.205,front-.004,.768),(.067,.006,.029),rubber,.004)
 for dx in [.185,.211,.237]:lathe(prefix+' option key',cx+dx,front-.007,.725,[(.006,0),(.006,-.003),(0,-.003)],metal,12)
 groups.append({'name':prefix,'objects':objects[start:],'bounds':[[cx-.31,cy-.32,0],[cx+.31,cy+.31,.86]],'originalParts':2})
# Keep aggregate diffuse albedo comparable to original disconnected boxes. Geometry changes still need GI rebake.
def area(o):
 dg=bpy.context.evaluated_depsgraph_get();ev=o.evaluated_get(dg);me=ev.to_mesh();a=sum(p.area for p in me.polygons);ev.to_mesh_clear();return a

def balance(gs,adjust,target):
 weights={}
 for g in gs:
  for o in g['objects']:
   m=o.data.materials[0];weights[m]=weights.get(m,0)+area(o)
 total=sum(weights.values());other=np.zeros(3)
 for m,a in weights.items():
  if m!=adjust:other+=a*np.array(m.node_tree.nodes.get('Principled BSDF').inputs['Base Color'].default_value[:3])
 value=(np.array(target)*total-other)/weights[adjust];assert np.all(value<=1) and np.all(value>=0),value
 adjust.node_tree.nodes.get('Principled BSDF').inputs['Base Color'].default_value=(*value,1)
 return {'target':list(target),'adjustedBase':value.tolist(),'area':total,'method':'evaluated mesh surface area weighted diffuse RGB; not transport equivalence'}
originalWhiteArea=2*(.62*.62+2*.62*.86);originalDarkArea=2*(.36*.36+2*.36*.02)
originalAppliance=(np.array([.8,.78,.72])*originalWhiteArea+np.array([.05,.045,.04])*originalDarkArea)/(originalWhiteArea+originalDarkArea)
balances={'sofa':balance(groups[:2],cloth,[.86,.85,.81]),'appliances':balance(groups[2:],paint,originalAppliance)}
records=[]
for g in groups:
 lo=np.full(3,np.inf);hi=-lo;tris=0
 for o in g['objects']:
  ev=o.evaluated_get(bpy.context.evaluated_depsgraph_get());me=ev.to_mesh();me.calc_loop_triangles();tris+=len(me.loop_triangles)
  for v in me.vertices:p=o.matrix_world@v.co;lo=np.minimum(lo,p);hi=np.maximum(hi,p)
  ev.to_mesh_clear()
 b=np.array(g['bounds']);assert np.all(lo>=b[0]-.001) and np.all(hi<=b[1]+.001),(g['name'],lo,hi,b)
 records.append({'name':g['name'],'bounds':g['bounds'],'actualBounds':[lo.tolist(),hi.tolist()],'triangles':tris,'objects':len(g['objects']),'originalParts':g['originalParts']})
# Root collection preserves original placement; each semantic furniture group is independently editable.
for g in groups:
 col=bpy.data.collections.new(g['name']);bpy.context.scene.collection.children.link(col)
 for o in g['objects']:
  for c in list(o.users_collection):c.objects.unlink(o)
  col.objects.link(o)
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'lodge-furniture.blend'),compress=True)
# Export batches only; .blend retains the independent editable source and modifiers.
exportObjects=[];applianceTemplate=[]
for gi,g in enumerate(groups):
 if gi>=3:
  for proto in applianceTemplate:
   o=bpy.data.objects.new(g['name']+' '+proto.name,proto.data);bpy.context.collection.objects.link(o);o.location.x=(gi-2)*.75;exportObjects.append(o)
  continue
 byMaterial={}
 for source in g['objects']:
  ev=source.evaluated_get(bpy.context.evaluated_depsgraph_get());me=bpy.data.meshes.new_from_object(ev,preserve_all_data_layers=True,depsgraph=bpy.context.evaluated_depsgraph_get());o=bpy.data.objects.new('export '+source.name,me);bpy.context.collection.objects.link(o);o.matrix_world=source.matrix_world;byMaterial.setdefault(source.data.materials[0].name,[]).append(o)
 for key,batch in byMaterial.items():
  bpy.ops.object.select_all(action='DESELECT')
  for o in batch:o.select_set(True)
  bpy.context.view_layer.objects.active=batch[0];bpy.ops.object.join();o=bpy.context.object;o.name='export '+g['name']+' '+key;exportObjects.append(o)
  # Normalize template origins to world zero for shared geometry placements.
  bpy.ops.object.transform_apply(location=True,rotation=True,scale=True)
  if gi==2:applianceTemplate.append(o)
bpy.ops.object.select_all(action='DESELECT')
for o in exportObjects:o.select_set(True)
bpy.ops.export_scene.gltf(filepath=str(OUT/'lodge-furniture.glb'),export_format='GLB',use_selection=True,export_apply=True,export_animations=False,export_lights=False,export_cameras=False,export_extras=True)
exportBatchCount=len(exportObjects);uniqueExportGeometry=len({id(o.data)for o in exportObjects})
for o in exportObjects:bpy.data.objects.remove(o,do_unlink=True)
report={'status':'offline candidate; not enabled; GI rebake required','sourceSHA256':SOURCE_SHA,'coordinates':'Blender x y z; glTF x z -y','originalSourceUnchanged':hashlib.sha256(SOURCE.read_bytes()).hexdigest()==SOURCE_SHA,'groups':records,'materialBalance':balances,'exportNodes':exportBatchCount,'uniqueExportGeometry':uniqueExportGeometry,'totalTriangles':sum(r['triangles']for r in records),'source':'original project furniture arrangement, new authored geometry; no external product likeness claim; no Aholo','blendBytes':(OUT/'lodge-furniture.blend').stat().st_size,'glbBytes':(OUT/'lodge-furniture.glb').stat().st_size,'generationSeconds':time.monotonic()-START}
(OUT/'metadata.json').write_text(json.dumps(report,indent=2)+'\n')
if args.preview:
 scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.samples=20;scene.cycles.use_denoising=True;scene.render.resolution_x=1200;scene.render.resolution_y=800;scene.render.resolution_percentage=100;scene.view_settings.view_transform='AgX'
 scene.world=bpy.data.worlds.new('preview neutral world');scene.world.use_nodes=True;scene.world.node_tree.nodes['Background'].inputs[0].default_value=(.7,.7,.7,1);scene.world.node_tree.nodes['Background'].inputs[1].default_value=.4
 ground=box('preview ground',(7,1,-.04),(12,9,.08),mat('preview grey',(.27,.27,.27)),.01)
 ld=bpy.data.lights.new('preview softbox','AREA');ld.energy=900;ld.size=5;light=bpy.data.objects.new('preview softbox',ld);scene.collection.objects.link(light);light.location=(6,-2,5);light.rotation_euler=(Vector((6,1,.4))-light.location).to_track_quat('-Z','Y').to_euler()
 cd=bpy.data.cameras.new('preview camera');cam=bpy.data.objects.new('preview camera',cd);scene.collection.objects.link(cam);scene.camera=cam;cd.lens=48
 for name,loc,target in [('sofa',(7.5,2.6,2.05),(5.3,-.6,.4)),('laundry',(12.2,.1,1.7),(10.05,2.95,.43))]:
  for gi,g in enumerate(groups):
   for o in g['objects']:o.hide_render=(gi!=1 if name=='sofa' else gi<2)
  cam.location=loc;cam.rotation_euler=(Vector(target)-cam.location).to_track_quat('-Z','Y').to_euler();scene.render.filepath=str(OUT/(name+'.png'));bpy.ops.render.render(write_still=True)
 print('PREVIEW_SECONDS',time.monotonic()-START)
print(json.dumps(report))
