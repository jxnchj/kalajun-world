from pathlib import Path
import bpy,math
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[2];D=ROOT/'assets/src/v2/settlements/lodge-chairs-v38'
bpy.ops.wm.open_mainfile(filepath=str(D/'chairs-editable.blend'))
parent=bpy.data.objects['dining_chair38_1'];bpy.context.view_layer.update();base=parent.matrix_world.copy()
for o in bpy.context.scene.objects:
 if o.type=='MESH':o.hide_render=o.parent!=parent
bpy.ops.mesh.primitive_plane_add(size=200,location=(0,0,-.008));floor=bpy.context.object
m=bpy.data.materials.new('Neutral preview ground');m.diffuse_color=(.23,.25,.24,1);floor.data.materials.append(m)
world=bpy.context.scene.world or bpy.data.worlds.new('World');bpy.context.scene.world=world;world.use_nodes=True;world.node_tree.nodes['Background'].inputs[0].default_value=(.55,.62,.70,1);world.node_tree.nodes['Background'].inputs[1].default_value=.3
for loc,energy,size in [((2,-3,4),450,3),((-2,1,2.5),200,2)]:
 bpy.ops.object.light_add(type='AREA',location=base@Vector(loc));o=bpy.context.object;o.data.energy=energy;o.data.shape='DISK';o.data.size=size;o.rotation_euler=((base@Vector((0,0,.5)))-o.location).to_track_quat('-Z','Y').to_euler()
scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.samples=96;scene.cycles.use_denoising=True;scene.render.resolution_x=900;scene.render.resolution_y=900;scene.render.resolution_percentage=100
scene.view_settings.view_transform='AgX'
for name,loc,target in [('front',(1.05,-1.60,1.10),(0,0,.49)),('side',(-1.95,-.42,1.09),(0,0,.49)),('back',(.95,1.65,1.18),(0,0,.49)),('weave-close',(.16,-.28,.88),(0,.19,.74)),('dining-distance',(1.55,-2.5,1.45),(0,0,.49))]:
 bpy.ops.object.camera_add(location=base@Vector(loc));o=bpy.context.object;o.data.lens=58;o.rotation_euler=((base@Vector(target))-o.location).to_track_quat('-Z','Y').to_euler();scene.camera=o;scene.render.filepath=str(D/(name+'.png'));bpy.ops.render.render(write_still=True);bpy.data.objects.remove(o,do_unlink=True)
