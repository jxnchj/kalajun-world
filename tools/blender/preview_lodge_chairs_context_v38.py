from pathlib import Path
import bpy,bmesh
from mathutils import Vector
R=Path(__file__).resolve().parents[2];D=R/'assets/src/v2/settlements/lodge-chairs-v38';bpy.ops.wm.open_mainfile(filepath=str(D/'lodge-chairs-complete.blend'))
for o in bpy.context.scene.objects:
 if o.type=='MESH':o.hide_render=not any(p.name=='dining_chair38_'+str(i) for p in [o.parent] if p for i in range(1,7))
# Actual original first dining table triangles, no surrogate furniture.
o=bpy.data.objects['gh_lanchuan_lodge_plank'];o.data=o.data.copy();bm=bmesh.new();bm.from_mesh(o.data);bad=[]
for f in bm.faces:
 pts=[o.matrix_world@v.co for v in f.verts]
 if not all(-11.351<p.x<-9.449 and -1.851<p.y<-.949 and -.001<p.z<.771 for p in pts):bad.append(f)
bmesh.ops.delete(bm,geom=bad,context='FACES');bm.to_mesh(o.data);bm.free();o.hide_render=False
bpy.ops.mesh.primitive_plane_add(size=200,location=(0,0,-.008));floor=bpy.context.object;m=bpy.data.materials.new('Neutral preview ground');m.diffuse_color=(.23,.25,.24,1);floor.data.materials.append(m)
scene=bpy.context.scene;scene.world=scene.world or bpy.data.worlds.new('Preview world');scene.world.use_nodes=True;scene.world.node_tree.nodes['Background'].inputs[0].default_value=(.55,.62,.7,1);scene.world.node_tree.nodes['Background'].inputs[1].default_value=.35
for loc,energy,size in [((-9,-4,4),550,3),((-13,1,3),300,2)]:
 bpy.ops.object.light_add(type='AREA',location=loc);o=bpy.context.object;o.data.energy=energy;o.data.size=size;o.rotation_euler=(Vector((-10.4,-1.4,.6))-o.location).to_track_quat('-Z','Y').to_euler()
bpy.ops.object.camera_add(location=(-7.45,-4.25,1.55));camera=bpy.context.object;camera.data.lens=44;camera.rotation_euler=(Vector((-10.4,-1.4,.58))-camera.location).to_track_quat('-Z','Y').to_euler();scene.camera=camera
scene.render.engine='CYCLES';scene.cycles.samples=96;scene.cycles.use_denoising=True;scene.render.resolution_x=1200;scene.render.resolution_y=900;scene.render.resolution_percentage=100;scene.view_settings.view_transform='AgX';scene.render.filepath=str(D/'dining-group-distance.png');bpy.ops.render.render(write_still=True)
