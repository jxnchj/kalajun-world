# Geometry review only: neutral clay and a constant water plane, no production shading.
import bpy,json,math,os
from mathutils import Vector
base=os.path.dirname(os.path.abspath(__file__))
d=json.load(open(base+'/data.json'))
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
scene=bpy.context.scene;scene.render.engine='BLENDER_EEVEE'
scene.render.resolution_x=1280;scene.render.resolution_y=800;scene.render.resolution_percentage=100
scene.world.color=(.5,.5,.5);scene.view_settings.view_transform='Standard'
def mat(name,color):
 m=bpy.data.materials.new(name);m.diffuse_color=(*color,1);m.use_nodes=True;m.node_tree.nodes.clear();n=m.node_tree.nodes.new('ShaderNodeBsdfPrincipled');o=m.node_tree.nodes.new('ShaderNodeOutputMaterial');m.node_tree.links.new(n.outputs['BSDF'],o.inputs['Surface']);n.inputs['Base Color'].default_value=(*color,1);n.inputs['Roughness'].default_value=.85;return m
clay=mat('Neutral soil - geometry diagnostic',(.39,.32,.23));watermat=mat('Water extent only - no production reflection',(.18,.38,.48));rootmat=mat('Original tree root locations - markers only',(.10,.22,.12))
nt=watermat.node_tree;output=next(n for n in nt.nodes if n.type=='OUTPUT_MATERIAL');surface=output.inputs['Surface'].links[0].from_socket;transparent=nt.nodes.new('ShaderNodeBsdfTransparent');mix=nt.nodes.new('ShaderNodeMixShader');mix.inputs[0].default_value=.78;nt.links.new(surface,mix.inputs[1]);nt.links.new(transparent.outputs[0],mix.inputs[2]);nt.links.new(mix.outputs[0],output.inputs['Surface'])
def mesh(name,vertices,faces,material):
 me=bpy.data.meshes.new(name);me.from_pydata(vertices,[],faces);me.update();o=bpy.data.objects.new(name,me);scene.collection.objects.link(o);o.data.materials.append(material);
 for p in me.polygons:p.use_smooth=True
 return o
terrain=mesh('Exact unexaggerated reach',[(v[0],v[1],v[2]) for v in d['grid']],d['faces'],clay)
# Water cells are clipped conservatively to original water samples. This is a
# geometric extent illustration, not a new hydrology surface used by the project.
wv=[];wf=[]
for q in d['sections']:
 for side in [-1,1]:
  half=q['left'] if side<0 else q['right'];wv.append((q['x']-q['fz']*side*half-d['origin'][0],q['z']+q['fx']*side*half-d['origin'][2],q['level']-d['origin'][1]))
for i in range(1,len(d['sections'])):
 k=i*2;wf.extend([(k-2,k-1,k+1),(k-2,k+1,k)])
water=mesh('Unchanged water ribbon',wv,wf,watermat)

for r in d['trees']:
 if not (min(v[0] for v in d['grid'])<r['x']<max(v[0] for v in d['grid']) and min(v[1] for v in d['grid'])<r['z']<max(v[1] for v in d['grid'])):continue
 bpy.ops.mesh.primitive_cylinder_add(vertices=12,radius=.12,depth=.6,location=(r['x'],r['z'],r['y']+.3));bpy.context.object.data.materials.append(rootmat)
bpy.ops.object.light_add(type='AREA',location=(3,-8,20));bpy.context.object.data.energy=2600;bpy.context.object.data.shape='DISK';bpy.context.object.data.size=15
bpy.ops.object.light_add(type='SUN',location=(-10,-10,20));bpy.context.object.data.energy=1.3;bpy.context.object.rotation_euler=(.4,-.5,-.3)
bpy.ops.object.camera_add();camera=bpy.context.object;scene.camera=camera;camera.data.type='ORTHO';camera.data.lens=40
mid=Vector(((min(v[0] for v in d['grid'])+max(v[0] for v in d['grid']))/2,(min(v[1] for v in d['grid'])+max(v[1] for v in d['grid']))/2,0))
for mode in ['source','candidate']:
 for i,q in enumerate(d['sections'] if mode=='source' else d['waterSections']):
  for j,side in enumerate([-1,1]):
   half=q['left'] if side<0 else q['right'];water.data.vertices[i*2+j].co=(q['x']-q['fz']*side*half-d['origin'][0],q['z']+q['fx']*side*half-d['origin'][2],q['level']-d['origin'][1])
 water.data.update()
 for i,v in enumerate(d['grid']):terrain.data.vertices[i].co.z=v[2 if mode=='source' else 3]
 terrain.data.update()
 for view,offset,scale in [('top',(0,0,45),74),('low',(24,-30,9),47),('eye',(3,-6,1.7),14)]:
  camera.data.type='ORTHO';camera.location=mid+Vector(offset);target=mid;camera.data.ortho_scale=scale
  if view=='eye':
   e=d['eye'];camera.location=(e['x'],e['z'],e['sourceY' if mode=='source' else 'candidateY']);target=Vector(e['target']);camera.data.type='PERSP';camera.data.lens=24
  camera.rotation_euler=(target-camera.location).to_track_quat('-Z','Y').to_euler()
  for wet in [False,True]:
   water.hide_render=not wet;scene.render.filepath=base+'/'+mode+'-'+view+('-wet' if wet else '-dry')+'.png';bpy.ops.render.render(write_still=True)
