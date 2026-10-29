from pathlib import Path
import bpy,math,json
from mathutils import Vector
R=Path.cwd();bpy.ops.wm.read_factory_settings(use_empty=True);bpy.ops.import_scene.gltf(filepath=str(R/'assets/src/polyhaven/rock_moss_set_01/rock_moss_set_01_1k.gltf'));objs=[x for x in bpy.context.scene.objects if x.type=='MESH'];rows=[]
for i,o in enumerate(objs):
 bpy.context.view_layer.objects.active=o;o.select_set(True);bpy.ops.object.transform_apply(location=True,rotation=True,scale=True);o.select_set(False)
 lo=Vector([min(v.co[k] for v in o.data.vertices) for k in range(3)]);hi=Vector([max(v.co[k] for v in o.data.vertices) for k in range(3)]);f=.30/max(hi.x-lo.x,hi.y-lo.y);centre=(lo+hi)/2
 # Object matrix uniform scaling retains custom-normal/tangent semantics.
 o.location=Vector(((i%3)*.42,(i//3)*.42,(hi.z-lo.z)*f/2))-centre*f;o.scale=(f,f,f);rows.append({'i':i,'name':o.name,'faces':len(o.data.polygons),'bounds':list(hi-lo)})
s=bpy.context.scene;s.render.engine='CYCLES';s.cycles.device='CPU';s.cycles.samples=16;s.render.resolution_x=768;s.render.resolution_y=768;s.render.resolution_percentage=100;s.render.threads_mode='FIXED';s.render.threads=2;s.world=bpy.data.worlds.new('Preview');s.world.color=(.3,.3,.3)
bpy.ops.object.light_add(type='AREA',location=(.4,-.1,1.5));bpy.context.object.data.energy=200;bpy.context.object.data.size=1
bpy.ops.object.camera_add(location=(.45,-1.2,1.7));c=bpy.context.object;c.rotation_euler=(Vector((.42,.42,0))-c.location).to_track_quat('-Z','Y').to_euler();c.data.type='ORTHO';c.data.ortho_scale=1.4;s.camera=c;s.view_settings.view_transform='AgX';s.render.image_settings.file_format='PNG';s.render.filepath=str(R/'tools/candidates/shore-scan42/moss-set01-source.png');(R/'tools/candidates/shore-scan42/moss-set01.json').write_text(json.dumps(rows,indent=2));bpy.ops.render.render(write_still=True)
