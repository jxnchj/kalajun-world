"""Neutral offline inspection only; not runtime GI acceptance."""
from pathlib import Path
import bpy
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[2];D=ROOT/'assets/src/v2/settlements/guest-vanity-v38'
for variant,path in [('before',ROOT/'assets/src/v2/settlements/lanchuan-freedom.blend'),('candidate',D/'lanchuan-vanity.blend')]:
 bpy.ops.wm.open_mainfile(filepath=str(path));scene=bpy.context.scene
 keep=['vanity','basin','tap','drawer handle','round mirror','mirror light','craft38']
 for o in scene.objects:o.hide_render=not(o.type=='MESH'and o.name.startswith('freedom1_')and any(s in o.name for s in keep))
 scene.render.engine='CYCLES';scene.cycles.samples=128;scene.cycles.use_denoising=True
 scene.render.resolution_x=1000;scene.render.resolution_y=1000;scene.render.resolution_percentage=100;scene.view_settings.view_transform='AgX'
 scene.world=bpy.data.worlds.new('inspection neutral world');scene.world.use_nodes=True;scene.world.node_tree.nodes['Background'].inputs[0].default_value=(.5,.5,.5,1);scene.world.node_tree.nodes['Background'].inputs[1].default_value=.5
 ld=bpy.data.lights.new('inspection softbox','AREA');ld.energy=400;ld.size=3;l=bpy.data.objects.new('inspection softbox',ld);scene.collection.objects.link(l);l.location=(1.5,1.5,3.5);l.rotation_euler=(Vector((3.3,3.5,1))-l.location).to_track_quat('-Z','Y').to_euler()
 cd=bpy.data.cameras.new('inspection camera');c=bpy.data.objects.new('inspection camera',cd);scene.collection.objects.link(c);scene.camera=c;cd.lens=46;c.location=(4.8,.65,2.3);c.rotation_euler=(Vector((3.3,3.5,1.05))-c.location).to_track_quat('-Z','Y').to_euler()
 scene.render.filepath=str(D/(variant+'.png'));bpy.ops.render.render(write_still=True)
