"""Render both edited bedding groups for inspection; never save scene lighting."""
from pathlib import Path
import bpy
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[2]
for asset in ['house_a','yurt']:
 bpy.ops.wm.open_mainfile(filepath=str(ROOT/'assets/src/v2/pastoral'/f'{asset}-lived.blend'))
 targets=[o for o in bpy.context.scene.objects if o.type=='MESH' and o.name.startswith('pastoral_') and any(s in o.name for s in ['bed','pillow','felt_mattress','sleep_quilt','sleep_platform'])]
 for o in bpy.context.scene.objects:o.hide_render=o not in targets
 bpy.ops.mesh.primitive_plane_add(size=200);plane=bpy.context.object;plane.location.z=.025
 mat=bpy.data.materials.new('inspection-neutral');mat.diffuse_color=(.19,.20,.19,1);plane.data.materials.append(mat)
 scene=bpy.context.scene;scene.world=bpy.data.worlds.new('inspection-world');scene.world.use_nodes=True
 scene.world.node_tree.nodes['Background'].inputs['Strength'].default_value=.3
 centre=Vector((-2,1.1,.55))if asset=='house_a'else Vector((-2.15,.2,.5))
 for name,offset,power,size in [('key',(-2,-2,3),250,2),('fill',(2,1,2),110,1.6)]:
  light=bpy.data.lights.new('inspection-'+name,'AREA');light.energy=power;light.shape='DISK';light.size=size
  obj=bpy.data.objects.new(light.name,light);scene.collection.objects.link(obj);obj.location=centre+Vector(offset);obj.rotation_euler=(centre-obj.location).to_track_quat('-Z','Y').to_euler()
 cd=bpy.data.cameras.new('inspection-camera');cam=bpy.data.objects.new(cd.name,cd);scene.collection.objects.link(cam)
 cam.location=centre+Vector((2.6,-2.8,2.4));cam.rotation_euler=(centre-cam.location).to_track_quat('-Z','Y').to_euler();cd.lens=48;scene.camera=cam
 scene.render.engine='CYCLES';scene.cycles.device='CPU';scene.cycles.samples=24;scene.cycles.use_denoising=True
 scene.render.threads_mode='FIXED';scene.render.threads=4
 scene.render.resolution_x=1000;scene.render.resolution_y=700;scene.render.resolution_percentage=100
 scene.view_settings.view_transform='AgX';scene.render.image_settings.file_format='PNG'
 scene.render.filepath=str(ROOT/'assets/src/v2/pastoral'/f'{asset}-bedding-29.studio.png');bpy.ops.render.render(write_still=True)
