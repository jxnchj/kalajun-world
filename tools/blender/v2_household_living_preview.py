from pathlib import Path
import bpy
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[2]
bpy.ops.wm.open_mainfile(filepath=str(ROOT/'assets/src/v2/pastoral/house_a-lived.blend'))
s=bpy.context.scene;s.world=bpy.data.worlds.new('living-preview');s.world.use_nodes=True;s.world.node_tree.nodes['Background'].inputs['Strength'].default_value=.5
for name,pos,power,size in [('key',(-3,-8,8),1100,5),('fill',(4,-7,3),500,4)]:
 d=bpy.data.lights.new(name,'AREA');d.energy=power;d.size=size;o=bpy.data.objects.new(name,d);s.collection.objects.link(o);o.location=pos;o.rotation_euler=(Vector((0,-3,1))-o.location).to_track_quat('-Z','Y').to_euler()
cd=bpy.data.cameras.new('living');cam=bpy.data.objects.new('living',cd);s.collection.objects.link(cam);s.camera=cam;cd.lens=48;cam.location=(-5.1,-7.6,2.2);cam.rotation_euler=(Vector((-1.6,-3.65,.55))-cam.location).to_track_quat('-Z','Y').to_euler()
s.render.engine='CYCLES';s.cycles.samples=24;s.cycles.use_denoising=True;s.render.threads_mode='FIXED';s.render.threads=4;s.render.resolution_x=1200;s.render.resolution_y=850;s.render.resolution_percentage=100;s.view_settings.view_transform='AgX'
for style in range(3):
 with bpy.data.libraries.load(str(ROOT/'assets/src/v2/pastoral/household-living-32.blend'),link=False)as(src,dst):dst.objects=[n for n in src.objects if n.startswith('household_'+str(style)+'_')]
 for o in dst.objects:s.collection.objects.link(o);o.location.x-=style*10
 s.render.filepath=str(ROOT/f'assets/src/v2/pastoral/household-living-32-{style}.png');bpy.ops.render.render(write_still=True)
 for o in dst.objects:bpy.data.objects.remove(o,do_unlink=True)
