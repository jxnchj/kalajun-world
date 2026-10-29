import bpy,json,os,math
from mathutils import Vector
base=os.path.dirname(os.path.abspath(__file__));d=json.load(open(base+'/data.json'))
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
scene=bpy.context.scene;scene.render.engine='BLENDER_EEVEE';scene.eevee.taa_render_samples=32 if hasattr(scene,'eevee') else 32
scene.render.resolution_x=1280;scene.render.resolution_y=800;scene.render.resolution_percentage=100;scene.world.color=(.4,.4,.4);scene.view_settings.view_transform='Standard'
def mat(name,color):
 m=bpy.data.materials.new(name);m.diffuse_color=(*color,1);m.use_nodes=True;m.node_tree.nodes.clear();n=m.node_tree.nodes.new('ShaderNodeBsdfPrincipled');o=m.node_tree.nodes.new('ShaderNodeOutputMaterial');m.node_tree.links.new(n.outputs['BSDF'],o.inputs['Surface']);n.inputs['Base Color'].default_value=(*color,1);n.inputs['Roughness'].default_value=.85;return m
soil=mat('neutral geometry study only',(.35,.28,.19));grass=mat('original full grass geometry without textures',(.12,.23,.075));watermat=mat('actual water extent diagnostic',(.18,.36,.42))
def mesh(name,verts,faces,material):
 me=bpy.data.meshes.new(name);me.from_pydata(verts,[],faces);me.update();o=bpy.data.objects.new(name,me);scene.collection.objects.link(o);me.materials.append(material)
 for p in me.polygons:p.use_smooth=True
 return o
terrain=mesh('shared physical terrain',[(v[0],-v[1],v[2])for v in d['grid']],d['faces'],soil)
plants={}
for name,m in d['meshes'].items():plants[name]=mesh(name,[(p[0],-p[1],p[2]) for p in zip(*[iter(m['position'])]*3)],list(zip(*[iter(m['indices'])]*3)),grass)
bpy.ops.object.light_add(type='AREA',location=(3,-8,18));bpy.context.object.data.energy=2000;bpy.context.object.data.shape='DISK';bpy.context.object.data.size=15
bpy.ops.object.light_add(type='SUN',location=(-10,-10,20));bpy.context.object.data.energy=1.2;bpy.context.object.rotation_euler=(.4,-.5,-.3)
bpy.ops.object.camera_add();camera=bpy.context.object;scene.camera=camera
for mode in ['source','candidate']:
 for name,o in plants.items():o.hide_render=not(name==mode or(mode=='candidate' and name=='cover'))
 for i,v in enumerate(d['grid']):terrain.data.vertices[i].co.z=v[2 if mode=='source' else 3]
 terrain.data.update();wv=[];wf=[]
 for q in (d['sourceSections'] if mode=='source' else d['sections']):
  for side in [-1,1]:
   half=q['left']if side<0 else q['right'];wv.append((q['x']-q['fz']*side*half-d['origin'][0],-(q['z']+q['fx']*side*half-d['origin'][2]),q['level']-d['origin'][1]))
 for i in range(1,len(d['sections'])):
  k=2*i;wf.extend([(k-2,k-1,k+1),(k-2,k+1,k)])
 water=mesh('actual candidate water boundary',wv,wf,watermat)
 # Source dry study intentionally uses no candidate water; compare ground morphology.
 for view in ['eye','top']:
  if view=='eye':
   camera.data.type='PERSP';camera.data.lens=24;camera.location=Vector((-3611.851-d['origin'][0],-(4805.483-d['origin'][2]),2329.157-d['origin'][1]));target=camera.location+Vector((math.sin(math.radians(-29.888))*10,math.cos(math.radians(-29.888))*10,math.tan(math.radians(-10))*10))
  else:camera.data.type='ORTHO';camera.data.ortho_scale=41;camera.location=Vector((-3,0,45));target=Vector((-3,0,0))
  camera.rotation_euler=(target-camera.location).to_track_quat('-Z','Y').to_euler()
  water.hide_render=True;scene.render.filepath=base+'/'+mode+'-'+view+'-dry.png';bpy.ops.render.render(write_still=True)
  water.hide_render=False;scene.render.filepath=base+'/'+mode+'-'+view+'-wet.png';bpy.ops.render.render(write_still=True)
 bpy.data.objects.remove(water,do_unlink=True)
