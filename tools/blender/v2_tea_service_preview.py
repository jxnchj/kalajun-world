"""Studio inspection only; source scenes and runtime lighting are never saved/edited."""
from pathlib import Path
import bpy
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[2]
bpy.ops.wm.open_mainfile(filepath=str(ROOT/'assets/src/v2/pastoral/house_a-lived.blend'))
targets=[o for o in bpy.context.scene.objects if o.type=='MESH' and '_low_table_' in o.name and o.get('teaServiceVersion')=='pastoral-tea-service-28']
for o in bpy.context.scene.objects:o.hide_render=o not in targets
bpy.ops.mesh.primitive_plane_add(size=200);plane=bpy.context.object;plane.location.z=.432
mat=bpy.data.materials.new('inspection-neutral');mat.diffuse_color=(.19,.20,.19,1);plane.data.materials.append(mat)
scene=bpy.context.scene;scene.world=bpy.data.worlds.new('inspection-world');scene.world.use_nodes=True
scene.world.node_tree.nodes['Background'].inputs['Strength'].default_value=.3
for name,pos,power,size in [('key',(-1.8,-2.1,3),170,1.8),('fill',(1,1,2),65,1.2)]:
 light=bpy.data.lights.new('inspection-'+name,'AREA');light.energy=power;light.shape='DISK';light.size=size
 obj=bpy.data.objects.new(light.name,light);scene.collection.objects.link(obj);obj.location=pos;obj.rotation_euler=(Vector((-.7,-.6,.55))-obj.location).to_track_quat('-Z','Y').to_euler()
cd=bpy.data.cameras.new('inspection-camera');cam=bpy.data.objects.new(cd.name,cd);scene.collection.objects.link(cam)
cam.location=(.50,-1.8,1.4);cam.rotation_euler=(Vector((-.70,-.61,.55))-cam.location).to_track_quat('-Z','Y').to_euler();cd.lens=56;scene.camera=cam
scene.render.engine='CYCLES';scene.cycles.device='CPU';scene.cycles.samples=24;scene.cycles.use_denoising=True
scene.render.resolution_x=1000;scene.render.resolution_y=700;scene.render.resolution_percentage=100
scene.view_settings.view_transform='AgX';scene.render.image_settings.file_format='PNG'
scene.render.filepath=str(ROOT/'assets/src/v2/pastoral/tea-service-28.studio.png');bpy.ops.render.render(write_still=True)
