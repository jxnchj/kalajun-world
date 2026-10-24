"""Re-map existing sawn face texture only; keep original mesh and materials elsewhere."""
import bpy,json,hashlib, numpy as np
from pathlib import Path
from PIL import Image
from mathutils import Vector
R=Path(__file__).resolve().parents[2];D=R/'assets/src/v2/boardwalk/endgrain39';D.mkdir(exist_ok=True)
def linear(a):
 a=np.asarray(a,dtype=np.float64)/255;return np.where(a<=.04045,a/12.92,((a+.055)/1.055)**2.4)
tex=R/'web/public/assets/v2/boardwalk';wood=linear(Image.open(tex/'rough_wood_diff_1k.jpg').convert('RGB'));end=linear(Image.open(tex/'wood_end.png').convert('RGB'))
# Physical .42m diameter cross-section, no new texture or geometry.
diameter=.42; target=wood.mean((0,1))*np.array([.78,.64,.49]); yy,xx=np.mgrid[0:128,0:128];u=((xx+.5)/128-.5)*.29/diameter+.5;v=((yy+.5)/128-.5)*.075/diameter+.55
sample=end[np.clip(((1-v)*256).astype(int),0,255),np.clip((u*256).astype(int),0,255)];factor=target/sample.mean((0,1))
config={'version':39,'diameterMetres':diameter,'oldUVMetres':.9,'oldOffset':[.67,.62],'newCenter':[.5,.55],'endFactor':factor.tolist(),'longFaceTargetLinearMean':target.tolist(),'endSampleLinearMean':sample.mean((0,1)).tolist(),'sourceImages':{f:hashlib.sha256((tex/f).read_bytes()).hexdigest() for f in ['wood_end.png','rough_wood_diff_1k.jpg']}}
(R/'web/src/v2/generated/boardwalk-endgrain-39.json').write_text(json.dumps(config,indent=2)+'\n')
bpy.ops.wm.open_mainfile(filepath=str(R/'assets/src/v2/boardwalk/boardwalk-timber-38.blend'))
original={o.name:[tuple(v.co)for v in o.data.vertices]for o in bpy.context.scene.objects if o.type=='MESH'}
endmat=bpy.data.materials['boardwalk_sawn_end'];bs=endmat.node_tree.nodes.get('Principled BSDF');source=endmat.node_tree.nodes.get('Image Texture');multiply=endmat.node_tree.nodes.new('ShaderNodeMixRGB');multiply.blend_type='MULTIPLY';multiply.inputs[0].default_value=1;multiply.inputs[2].default_value=(*factor,1);endmat.node_tree.links.new(source.outputs['Color'],multiply.inputs[1]);endmat.node_tree.links.new(multiply.outputs[0],bs.inputs['Base Color'])
for o in bpy.context.scene.objects:
 if o.type!='MESH':continue
 for p in o.data.polygons:
  if p.material_index!=1:continue
  for li in p.loop_indices:
   uv=o.data.uv_layers.active.data[li].uv;uv.x=(uv.x-.67)/.9/diameter+.5;uv.y=(uv.y-.62)/.9/diameter+.55
 assert original[o.name]==[tuple(v.co)for v in o.data.vertices]
bpy.ops.wm.save_as_mainfile(filepath=str(D/'boardwalk-endgrain39.blend'))
# Only preview staging below; editable asset remains isolated original kit.
for o in list(bpy.context.scene.objects):
 if o.name!='plank':bpy.data.objects.remove(o,do_unlink=True)
o=bpy.data.objects['plank'];o.location=(0,0,.25)
wm=bpy.data.materials['boardwalk_weathered_timber'];bs=wm.node_tree.nodes.get('Principled BSDF');im=next(n for n in wm.node_tree.nodes if n.type=='TEX_IMAGE' and 'diff' in n.image.name);mix=wm.node_tree.nodes.new('ShaderNodeMixRGB');mix.blend_type='MULTIPLY';mix.inputs[0].default_value=1;mix.inputs[2].default_value=(.78,.64,.49,1);wm.node_tree.links.new(im.outputs['Color'],mix.inputs[1]);wm.node_tree.links.new(mix.outputs[0],bs.inputs['Base Color'])
for i in range(1,7):
 c=o.copy();c.data=o.data; bpy.context.collection.objects.link(c);c.location=(0,i*.31,.25+i*.04)
bpy.ops.mesh.primitive_plane_add(size=20);floor=bpy.context.object;mat=bpy.data.materials.new('neutral preview');mat.diffuse_color=(.18,.18,.18,1);floor.data.materials.append(mat)
s=bpy.context.scene;s.world=bpy.data.worlds.new('Preview');s.world.use_nodes=True;s.world.node_tree.nodes['Background'].inputs[0].default_value=(.65,.7,.8,1);s.world.node_tree.nodes['Background'].inputs[1].default_value=.6
bpy.ops.object.light_add(type='AREA',location=(1,-2,5));bpy.context.object.data.energy=400;bpy.context.object.data.size=4
bpy.ops.object.camera_add();cam=bpy.context.object;s.camera=cam;s.render.engine='CYCLES';s.cycles.samples=32;s.cycles.use_denoising=True;s.render.resolution_x=1100;s.render.resolution_y=700;s.render.resolution_percentage=100;s.view_settings.view_transform='AgX'
for name,loc,target in [('side',(2.3,-1.2,1.3),(0,.8,.3)),('close',(1.05,-.35,.55),(.6,.15,.29))]:
 cam.location=loc;cam.rotation_euler=(Vector(target)-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.lens=50;s.render.filepath=str(D/(name+'.png'));bpy.ops.render.render(write_still=True)
print(json.dumps(config))
