from pathlib import Path
import bpy,sys
from mathutils import Vector
R=Path(__file__).resolve().parents[2];D=R/'assets/src/v2/settlements/lodge-tables-v38';bpy.ops.wm.open_mainfile(filepath=str(D/'lodge-tables-complete.blend'))
scene=bpy.context.scene
for o in scene.objects:
 if o.type=='MESH':o.hide_render=True
original=[o for o in scene.objects if o.type=='MESH'];bounds={o.name:([min((o.matrix_world@v.co)[k]for v in o.data.vertices)for k in range(3)],[max((o.matrix_world@v.co)[k]for v in o.data.vertices)for k in range(3)])for o in original}
bpy.ops.mesh.primitive_plane_add(size=100,location=(0,0,.019));ground=bpy.context.object;m=bpy.data.materials.new('Preview neutral floor');m.diffuse_color=(.20,.22,.20,1);ground.data.materials.append(m)
scene.world=scene.world or bpy.data.worlds.new('Preview world');scene.world.use_nodes=True;scene.world.node_tree.nodes['Background'].inputs[0].default_value=(.55,.62,.70,1);scene.world.node_tree.nodes['Background'].inputs[1].default_value=.35
lights=[]
for energy,size in[(650,4),(400,3)]:bpy.ops.object.light_add(type='AREA');o=bpy.context.object;o.data.energy=energy;o.data.size=size;lights.append(o)
bpy.ops.object.camera_add();camera=bpy.context.object;scene.camera=camera;scene.render.engine='CYCLES';scene.cycles.samples=64;scene.cycles.use_denoising=True;scene.render.resolution_x=1200;scene.render.resolution_y=900;scene.render.resolution_percentage=100;scene.view_settings.view_transform='AgX'
shots=[
 ('dining-group',(-5.0,-5.2,3.3),(-8.4,.1,.5),48,'dining'),
 ('dining-joint-close',(-9.05,-2.6,1.08),(-10.4,-1.4,.55),55,'table1'),
 ('reception',(-2.4,-3.6,1.85),(.3,-.5,.65),50,'reception'),
 ('reception-edge-close',(1.85,-1.45,1.48),(1.08,-.55,.97),58,'reception'),
 ('tea-context',(7.6,-2.8,1.6),(5.3,.4,.45),48,'tea'),
 ('tea-edge-close',(6.15,-.55,.78),(5.3,.4,.30),58,'tea')]
if len(sys.argv)>1:shots=[s for s in shots if s[0]in sys.argv[1:]]
for name,eye,target,lens,kind in shots:
 for o in original:
  lo,hi=bounds[o.name];cx=(lo[0]+hi[0])/2;cy=(lo[1]+hi[1])/2
  o.hide_render=not((kind=='dining'and(o.name.startswith('tablecraft38_table')or o.name.startswith('chair38_')))or(kind=='table1'and(o.name.startswith('tablecraft38_table1_')or(o.name.startswith('chair38_')and cx<-8.5 and cy<0)))or(kind=='reception'and o.name.startswith('tablecraft38_reception'))or(kind=='tea'and(o.name.startswith('tablecraft38_tea')or('export_sofa_'in o.name or 'export sofa 'in o.name) or o.name=='gh_lanchuan_lodge_rug')))
 camera.location=eye;camera.rotation_euler=(Vector(target)-camera.location).to_track_quat('-Z','Y').to_euler();camera.data.lens=lens
 for light,offset in zip(lights,[(-2,-3,4),(2,2,3)]):light.location=Vector(target)+Vector(offset);light.rotation_euler=(Vector(target)-light.location).to_track_quat('-Z','Y').to_euler()
 scene.render.filepath=str(D/(name+'.png'));bpy.ops.render.render(write_still=True)
