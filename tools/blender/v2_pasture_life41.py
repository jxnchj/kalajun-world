"""Independent editable pastoral service group; metres, new source only.
Design interpretation. Shared accepted wood/iron material source, no new photos.
"""
import bpy,math,json,gzip
from pathlib import Path
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'tools/candidates/pasture-life41'
SOURCE=ROOT/'assets/src/v2/pastoral/pasture-life41.blend'
GLB=ROOT/'web/public/assets/v2/pasture-life41.glb'
site=json.loads((OUT/'placement.json').read_text())
bpy.ops.wm.read_factory_settings(use_empty=True)
with bpy.data.libraries.load(str(ROOT/'assets/src/v2/pastoral/house_a-lived.blend'),link=False) as(src,dst):
 dst.materials=[n for n in ['v2_pastoral_wood','v2_pastoral_pale','v2_pastoral_iron'] if n in src.materials]
assert len(dst.materials)==3
parts=[]
def assign(o,mat):
 o.data.materials.append(bpy.data.materials[mat]);o['designRole']=o.name;parts.append(o);return o
def box(name,lo,hi,mat='v2_pastoral_wood',grain=0,bevel=.004):
 lo,hi=Vector(lo),Vector(hi);bpy.ops.mesh.primitive_cube_add(size=1,location=(lo+hi)/2);o=bpy.context.object;o.name=name;o.dimensions=hi-lo;bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
 m=o.modifiers.new('hand softened arris','BEVEL');m.width=min(bevel,min(hi-lo)*.15);m.segments=2;bpy.ops.object.modifier_apply(modifier=m.name)
 uv=o.data.uv_layers.active
 for f in o.data.polygons:
  axis=max(range(3),key=lambda k:abs(f.normal[k]));across=next((k for k in range(3)if k!=grain and k!=axis),(grain+1)%3)
  for li in f.loop_indices:
   p=o.data.vertices[o.data.loops[li].vertex_index].co+o.location;uv.data[li].uv=(p[grain]*.8,p[across]*2.5)
 return assign(o,mat)
def rod(name,a,b,r,mat='v2_pastoral_wood',n=12):
 a,b=Vector(a),Vector(b);d=b-a;bpy.ops.mesh.primitive_cylinder_add(vertices=n,radius=r,depth=d.length,location=(a+b)/2);o=bpy.context.object;o.name=name;o.rotation_euler=d.to_track_quat('Z','Y').to_euler();return assign(o,mat)
def beam(name,a,b,width,mat='v2_pastoral_wood'):
 a,b=Vector(a),Vector(b);d=b-a;o=box(name,(-width/2,-width/2,-d.length/2),(width/2,width/2,d.length/2),mat,2);o.location=(a+b)/2;o.rotation_euler=d.to_track_quat('Z','Y').to_euler();return o
# Coordinates authored Blender (x,-world-z,height), water stays level.
# Raised trough with board joints, visible end grain and iron straps. Open top.
for j in range(4):
 o=box('waterproof lapped trough floor '+str(j),(-1.23,-.276+j*.138,.195),(1.23,-.139+j*.138,.245),grain=0)
 o.rotation_euler.y=.01
for side in[-1,1]:
 for j in range(2):
  box('trough side plank',(-1.25,side*.285-.025,.245+j*.138),(1.25,side*.285+.025,.383+j*.138),grain=0)
for end in[-1,1]:
 cheek=box('end cheek',(end*1.22-.035,-.31,.21),(end*1.22+.035,.31,.52),grain=1)
 if end==1:right_end=cheek
 for side in[-1,1]:
  box('end binding strap',(end*1.04-.012,side*.315-.004,.24),(end*1.04+.012,side*.315+.004,.50),'v2_pastoral_iron',2,.001)
  for h in[.29,.46]:rod('iron pin',(end*1.04,side*.32,h),(end*1.04,side*.327,h),.009,'v2_pastoral_iron',8)
for x in[-.9,.9]:box('cross bearer',(x-.065,-.38,.105),(x+.065,.38,.20),grain=1)
for i,f in enumerate(site['feet'][:4]):box('ground fitted trough foot '+str(i),(f['x']-.055,-f['z']-.055,f['bottom']),(f['x']+.055,-f['z']+.055,.16),grain=2)
# End drain is deliberately above soil; removable plug and separate open runoff lip.
bpy.ops.mesh.primitive_cylinder_add(vertices=20,radius=.027,depth=.16,location=(1.22,0,.255),rotation=(0,math.pi/2,0));cutter=bpy.context.object
modifier=right_end.modifiers.new('real drain bore','BOOLEAN');modifier.operation='DIFFERENCE';modifier.object=cutter
bpy.context.view_layer.objects.active=right_end;bpy.ops.object.modifier_apply(modifier=modifier.name);bpy.data.objects.remove(cutter,do_unlink=True)
rod('removable drain plug',(1.25,0,.255),(1.32,0,.255),.025,'v2_pastoral_pale',16)
box('short drain lip',(1.24,-.045,.215),(1.48,.045,.235),grain=0)
for y in[-.048,.048]:box('drain lip side',(1.24,y-.008,.23),(1.48,y+.008,.27),grain=0)
# Small open slatted rack, deliberately no fence or enclosure.
for i,f in enumerate(site['feet'][4:]):box('ground fitted rack foot '+str(i),(f['x']-.027,-f['z']-.027,f['bottom']),(f['x']+.027,-f['z']+.027,.67),grain=2)
for y in[-1.18,-.68]:box('rack rail',(-2.09,y-.025,.46),(-1.36,y+.025,.51),grain=0)
for j in range(5):box('rack raised shelf',(-2.10,-1.22+j*.122,.12),(-1.35,-1.115+j*.122,.155),grain=0)
beam('rack diagonal brace',(-2.05,-1.18,.16),(-1.4,-1.18,.63),.025)
# Empty stave pail, no filled solid cylinder. Real inside and bottom.
x,y,z=-1.78,-.92,.155
for i in range(16):
 a=i*math.tau/16;b=(i+.97)*math.tau/16
 verts=[(x+r*math.cos(t),y+r*math.sin(t),z+h)for h,r in[(0,.12),(.27,.15),(0,.108),(.27,.138)]for t in[a,b]]
 faces=[(0,1,3,2),(4,6,7,5),(2,3,7,6),(0,4,5,1),(0,2,6,4),(1,5,7,3)]
 m=bpy.data.meshes.new('pail stave');m.from_pydata(verts,[],faces);m.update();o=bpy.data.objects.new('pail stave',m);bpy.context.collection.objects.link(o);uv=m.uv_layers.new()
 for f in m.polygons:
  for li in f.loop_indices:
   p=m.vertices[m.loops[li].vertex_index].co;uv.data[li].uv=(p.z*2,(p.x+p.y)*3)
 assign(o,'v2_pastoral_pale')
rod('pail bottom',(x,y,z+.008),(x,y,z+.023),.111,'v2_pastoral_pale',24)
for h in[.045,.22]:
 r=.12+h/.27*.03+.003
 for i in range(24):
  a=i*math.tau/24;b=(i+1)*math.tau/24;rod('pail hoop',(x+r*math.cos(a),y+r*math.sin(a),z+h),(x+r*math.cos(b),y+r*math.sin(b),z+h),.005,'v2_pastoral_iron',6)
for i in range(20):
 a=i*math.pi/20;b=(i+1)*math.pi/20;rod('pail bail',(x+.16*math.cos(a),y,z+.25+.19*math.sin(a)),(x+.16*math.cos(b),y,z+.25+.19*math.sin(b)),.006,'v2_pastoral_iron',8)
# One long wooden cleaning brush resting on rack, articulated visible bristles.
a=Vector((-2.03,-.71,.17));b=Vector((-1.82,-.67,1.02));rod('cleaning brush handle',a,b,.014,'v2_pastoral_pale',12)
box('brush head',(-2.14,-.77,.155),(-1.93,-.67,.20),'v2_pastoral_wood',0)
for i in range(8):
 for j in range(3):rod('brush coarse fibre',(-2.13+i*.026,-.755+j*.032,.155),(-2.14+i*.026,-.755+j*.032,.11),.003,'v2_pastoral_pale',5)
# Separate bounded water surface, no spill or fictitious feed pipe.
water=bpy.data.materials.new('pasture_trough_water');water.use_nodes=True
nodes=water.node_tree.nodes;nodes.clear();bs=nodes.new('ShaderNodeBsdfPrincipled');out=nodes.new('ShaderNodeOutputMaterial');water.node_tree.links.new(bs.outputs['BSDF'],out.inputs['Surface']);bs.inputs['Base Color'].default_value=(.055,.11,.10,1);bs.inputs['Roughness'].default_value=.12;bs.inputs['Metallic'].default_value=0;bs.inputs['IOR'].default_value=1.333
box('level contained water',(-1.18,-.257,.386),(1.18,.257,.389),'pasture_trough_water',0,.001)
# Exact coarse occupancy annotations in Three axes, not visible proxy boxes.
for name,center,half in [('trough',[0,.31,0],[1.29,.24,.34]),('rack',[-1.73,.36,.95],[.41,.38,.31])]:
 o=bpy.data.objects.new('collision_'+name,None);bpy.context.collection.objects.link(o);o['collisionRole']='solid-box';o['centerThree']=center;o['halfExtentsThree']=half
bpy.context.scene.unit_settings.system='METRIC';bpy.context.scene.unit_settings.scale_length=1
bpy.context.scene['designBasis']='Pastoral service group, interpreted design; hand-filled, no surveyed historic attribution.'
bpy.context.scene['siteJSON']=json.dumps(site)
# Pack existing shared textures so editable source is self-contained.
bpy.ops.file.pack_all();SOURCE.parent.mkdir(parents=True,exist_ok=True);bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE))
# Export merged material batches only after saving individually editable parts.
batches={}
for o in parts:batches.setdefault(o.active_material.name,[]).append(o)
for mat,group in batches.items():
 bpy.ops.object.select_all(action='DESELECT')
 for o in group:o.select_set(True)
 bpy.context.view_layer.objects.active=group[0];bpy.ops.object.join();group[0].name='pasture_service_'+mat
bpy.ops.export_scene.gltf(filepath=str(GLB),export_format='GLB',export_extras=True,export_yup=True)
raw=GLB.read_bytes();GLB.with_suffix('.glb.gz').write_bytes(gzip.compress(raw,mtime=0))
for o in bpy.context.scene.objects:
 if o.type=='MESH':o.data.calc_loop_triangles()
report={'source':str(SOURCE.relative_to(ROOT)),'glb':str(GLB.relative_to(ROOT)),'bytes':len(raw),'gzipBytes':GLB.with_suffix('.glb.gz').stat().st_size,'materials':[m.name for m in bpy.data.materials if m.users],'triangles':sum(len(o.data.loop_triangles)for o in bpy.context.scene.objects if o.type=='MESH'),'site':site,'status':'candidate, not browser accepted'}
(OUT/'asset.json').write_text(json.dumps(report,indent=2));print(json.dumps(report))
# Neutral isolated inspection only; production lights are unchanged.
bpy.ops.object.camera_add(location=(3.6,-4.4,2.8));cam=bpy.context.object;cam.rotation_euler=(Vector((-.35,-.35,.32))-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.type='ORTHO';cam.data.ortho_scale=4.8;bpy.context.scene.camera=cam
bpy.ops.object.light_add(type='AREA',location=(1,-3,5));bpy.context.object.data.energy=700;bpy.context.object.data.shape='DISK';bpy.context.object.data.size=4
world=bpy.data.worlds.new('neutral asset inspection');world.use_nodes=True;world.node_tree.nodes.get('Background').inputs[0].default_value=(.3,.3,.3,1);world.node_tree.nodes.get('Background').inputs[1].default_value=.7;bpy.context.scene.world=world
scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.samples=32;scene.render.resolution_x=1000;scene.render.resolution_y=760;scene.render.resolution_percentage=100;scene.render.image_settings.file_format='PNG';scene.render.film_transparent=True;scene.render.filepath=str(OUT/'asset-preview.png');bpy.ops.render.render(write_still=True)
