from pathlib import Path
import bpy
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[2]
bpy.ops.wm.open_mainfile(filepath=str(ROOT/'assets/src/v2/pastoral/house_a-lived.blend'))
scene=bpy.context.scene;scene.world=bpy.data.worlds.new('porch-inspection');scene.world.use_nodes=True;scene.world.node_tree.nodes['Background'].inputs['Strength'].default_value=.5
for name,pos,power,size in [('key',(-3,-8,8),1100,5),('fill',(4,-7,3),500,4)]:
 data=bpy.data.lights.new(name,'AREA');data.energy=power;data.size=size;o=bpy.data.objects.new(name,data);scene.collection.objects.link(o);o.location=pos;o.rotation_euler=(Vector((0,-3,1))-o.location).to_track_quat('-Z','Y').to_euler()
cd=bpy.data.cameras.new('porch');cam=bpy.data.objects.new('porch',cd);scene.collection.objects.link(cam);scene.camera=cam;cd.lens=42
scene.render.engine='CYCLES';scene.cycles.samples=24;scene.cycles.use_denoising=True;scene.render.threads_mode='FIXED';scene.render.threads=4;scene.render.resolution_x=1400;scene.render.resolution_y=900;scene.render.resolution_percentage=100;scene.view_settings.view_transform='AgX'
for mode,pos,target in [('overall',(7,-12,5),(0,-2.5,1.2)),('detail',(-.8,-9,1.6),(0,-3.4,.9))]:
 cam.location=pos;cam.rotation_euler=(Vector(target)-cam.location).to_track_quat('-Z','Y').to_euler();scene.render.filepath=str(ROOT/f'assets/src/v2/pastoral/house_a-porch-31-{mode}.png');bpy.ops.render.render(write_still=True)
