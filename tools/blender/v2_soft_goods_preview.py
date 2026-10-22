"""Neutral studio inspection of the authored soft-goods family, no runtime lights edited."""
from pathlib import Path
import bpy
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[2]
bpy.ops.wm.open_mainfile(filepath=str(ROOT/'assets/src/v2/pastoral/house_a-lived.blend'))
targets=[o for o in bpy.context.scene.objects if o.type=='MESH' and o.get('softGoodsVersion')=='pastoral-soft-goods-27']
for o in bpy.context.scene.objects:
    if o not in targets:o.hide_render=True
# A studio arrangement only in memory. Source object placement is never saved.
for o in targets:
    if '_chest_folded' in o.name:o.location.x-=.95;o.location.y-=1.98;o.location.z-=.6725
    else:
        n=int(o.name.rsplit('.',1)[1]) if '.' in o.name else 0
        o.location=(1.1+(n%2)*.60,-.25+(n//2)*.65,.08)
bpy.ops.mesh.primitive_plane_add(size=200);plane=bpy.context.object
mat=bpy.data.materials.new('inspection-neutral');mat.diffuse_color=(.19,.20,.19,1);plane.data.materials.append(mat);plane.location.z=-.006
scene=bpy.context.scene;scene.world=bpy.data.worlds.new('inspection-world');scene.world.use_nodes=True
scene.world.node_tree.nodes['Background'].inputs['Strength'].default_value=.3
for name,pos,power,size in [('key',(-2,-3,4),400,3),('fill',(2,1,3),150,2)]:
    light=bpy.data.lights.new('inspection-'+name,'AREA');light.energy=power;light.shape='DISK';light.size=size
    obj=bpy.data.objects.new(light.name,light);scene.collection.objects.link(obj);obj.location=pos;obj.rotation_euler=(Vector((.8,0,.25))-obj.location).to_track_quat('-Z','Y').to_euler()
camdata=bpy.data.cameras.new('inspection-camera');cam=bpy.data.objects.new(camdata.name,camdata);scene.collection.objects.link(cam)
cam.location=(2.7,-3.8,2.4);cam.rotation_euler=(Vector((.65,.10,.18))-cam.location).to_track_quat('-Z','Y').to_euler();camdata.lens=48;scene.camera=cam
scene.render.engine='CYCLES';scene.cycles.device='CPU';scene.cycles.samples=24;scene.cycles.use_denoising=True
scene.render.resolution_x=1100;scene.render.resolution_y=760;scene.render.resolution_percentage=100
scene.view_settings.view_transform='AgX';scene.render.image_settings.file_format='PNG'
scene.render.filepath=str(ROOT/'assets/src/v2/pastoral/soft-goods-27.studio.png')
bpy.ops.render.render(write_still=True)
