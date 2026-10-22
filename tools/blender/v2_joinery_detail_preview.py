"""Inspection renders of chest joinery and the supported entrance; no source edits."""
from pathlib import Path
import bpy
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[2]
for mode in ['chest','entrance']:
 bpy.ops.wm.open_mainfile(filepath=str(ROOT/'assets/src/v2/pastoral/house_a-lived.blend'))
 for o in bpy.context.scene.objects:
  o.hide_render=(o.type!='MESH' or ('chest'not in o.name if mode=='chest' else o.name.startswith('pastoral_')and o.name!='pastoral_house_entry_joinery'))
 scene=bpy.context.scene;scene.world=bpy.data.worlds.new('inspection-world');scene.world.use_nodes=True;scene.world.node_tree.nodes['Background'].inputs['Strength'].default_value=.45
 centre=Vector((.95,1.98,.55))if mode=='chest'else Vector((1,-2.65,1.65))
 for name,offset,power,size in [('key',(-2,-3,4),450,3),('fill',(1,-2,-.2),150,2)]:
  data=bpy.data.lights.new(name,'AREA');data.energy=power;data.shape='DISK';data.size=size;o=bpy.data.objects.new(name,data);scene.collection.objects.link(o);o.location=centre+Vector(offset);o.rotation_euler=(centre-o.location).to_track_quat('-Z','Y').to_euler()
 cd=bpy.data.cameras.new('inspection');cam=bpy.data.objects.new('inspection',cd);scene.collection.objects.link(cam);scene.camera=cam
 cam.location=centre+Vector((1.4,-1.8,1.25)if mode=='chest'else(1.4,-2.7,-.35));cam.rotation_euler=(centre-cam.location).to_track_quat('-Z','Y').to_euler();cd.lens=48
 scene.render.engine='CYCLES';scene.cycles.device='CPU';scene.cycles.samples=24;scene.cycles.use_denoising=True;scene.render.threads_mode='FIXED';scene.render.threads=4
 scene.render.resolution_x=1000;scene.render.resolution_y=800;scene.render.resolution_percentage=100;scene.view_settings.view_transform='AgX';scene.render.image_settings.file_format='PNG'
 scene.render.filepath=str(ROOT/'assets/src/v2/pastoral'/f'house_a-{mode}-30.studio.png');bpy.ops.render.render(write_still=True)
