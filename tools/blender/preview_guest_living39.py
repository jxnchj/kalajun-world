from pathlib import Path
import bpy,sys
from mathutils import Vector
R=Path(__file__).resolve().parents[2];D=R/'assets/src/v2/settlements/guest-living39'
for variant,path in [('before',R/'assets/src/v2/settlements/guest-vanity-v38/lanchuan-vanity.blend'),('candidate',D/'lanchuan-living39.blend')]:
 for view,pos,target in [('group',(4,-1.5,3.5),(.5,1.3,1.0)),('storage',(1.2,-2.4,1.65),(-1.35,-.6,1.05)),('sleep',(2.9,.5,1.6),(.6,2.7,.65)),('window',(.6,.8,1.6),(.6,-3.05,1.4)),('heading',(1.4,-1.2,2.8),(.6,-3.13,2.47))]:
  if len(sys.argv)>1 and view not in sys.argv[1:]:continue
  bpy.ops.wm.open_mainfile(filepath=str(path));s=bpy.context.scene
  for o in s.objects:o.hide_render=not(o.type=='MESH'and o.name.startswith('freedom1_'))
  s.render.engine='CYCLES';s.cycles.samples=48;s.cycles.use_denoising=True;s.render.resolution_x=1100;s.render.resolution_y=820;s.render.resolution_percentage=100;s.view_settings.view_transform='AgX'
  s.world=bpy.data.worlds.new('neutral inspection');s.world.use_nodes=True;s.world.node_tree.nodes['Background'].inputs[0].default_value=(.5,.5,.5,1);s.world.node_tree.nodes['Background'].inputs[1].default_value=.65
  for name,loc,power,size in [('window',(0,-4,3),500,4),('fill',(4,0,4),250,4)]:
   d=bpy.data.lights.new(name,'AREA');d.energy=power;d.shape='DISK';d.size=size;o=bpy.data.objects.new(name,d);s.collection.objects.link(o);o.location=loc;o.rotation_euler=(Vector(target)-o.location).to_track_quat('-Z','Y').to_euler()
  d=bpy.data.cameras.new('inspection');o=bpy.data.objects.new('inspection',d);s.collection.objects.link(o);s.camera=o;o.location=pos;d.lens=35 if view=='window' else 43;o.rotation_euler=(Vector(target)-o.location).to_track_quat('-Z','Y').to_euler();s.render.filepath=str(D/(variant+'-'+view+'.png'));bpy.ops.render.render(write_still=True)
