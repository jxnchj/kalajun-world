from pathlib import Path
import bpy,math
from mathutils import Vector
R=Path.cwd();out=R/'tools/candidates/shore-scan42';bpy.ops.wm.read_factory_settings(use_empty=True);bpy.ops.import_scene.gltf(filepath=str(R/'assets/src/polyhaven/rock_07/rock_07_1k.gltf'));o=[x for x in bpy.context.scene.objects if x.type=='MESH'][0]
s=bpy.context.scene;s.render.engine='CYCLES';s.cycles.device='CPU';s.cycles.samples=16;s.render.resolution_x=512;s.render.resolution_y=512;s.render.resolution_percentage=100;s.render.threads_mode='FIXED';s.render.threads=2
s.world=bpy.data.worlds.new('Preview');s.world.color=(.3,.3,.3)
bpy.ops.object.light_add(type='AREA',location=(.1,-.1,.5));bpy.context.object.data.energy=30;bpy.context.object.data.shape='DISK';bpy.context.object.data.size=.3
bpy.ops.object.camera_add(location=(.27,-.38,.28));c=bpy.context.object;c.rotation_euler=(Vector((0,0,.065))-c.location).to_track_quat('-Z','Y').to_euler();c.data.type='ORTHO';c.data.ortho_scale=.4;s.camera=c
s.view_settings.view_transform='AgX';s.render.image_settings.file_format='PNG';s.render.filepath=str(out/'original-source.png');bpy.ops.render.render(write_still=True)
bpy.context.view_layer.objects.active=o;o.select_set(True);mod=o.modifiers.new('runtime','DECIMATE');mod.ratio=.085;bpy.ops.object.modifier_apply(modifier=mod.name);s.render.filepath=str(out/'decimated-source.png');bpy.ops.render.render(write_still=True)
