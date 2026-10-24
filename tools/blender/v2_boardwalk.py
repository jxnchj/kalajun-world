"""Editable structural timber kit for existing authored boardwalk routes.
No new bridge, route or historic identity is inferred. Metres, Blender Z up.
Exports the same evaluated triangles to GLB and an embedded runtime kit.
"""
import bpy,json
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
bpy.ops.wm.read_factory_settings(use_empty=True)
wood=bpy.data.materials.new('boardwalk_weathered_timber');wood.diffuse_color=(.35,.29,.20,1);wood.use_nodes=True;wood.node_tree.nodes.get('Principled BSDF').inputs['Roughness'].default_value=.91
end=bpy.data.materials.new('boardwalk_sawn_end');end.diffuse_color=(.24,.16,.09,1);end.use_nodes=True;end.node_tree.nodes.get('Principled BSDF').inputs['Roughness'].default_value=.95
for mat in [wood,end]:
 nodes=mat.node_tree.nodes;links=mat.node_tree.links;bsdf=nodes.get('Principled BSDF')
 sources=[('Base Color','rough_wood_diff_1k.jpg'),('Roughness','rough_wood_rough_1k.jpg'),('Normal','rough_wood_nor_gl_1k.jpg')]if mat==wood else [('Base Color','wood_end.png')]
 for socket,file in sources:
  image=bpy.data.images.load(str(ROOT/'web/public/assets/v2/boardwalk'/file));image.pack();node=nodes.new('ShaderNodeTexImage');node.image=image
  if socket!='Base Color':image.colorspace_settings.name='Non-Color'
  if socket=='Normal':normal=nodes.new('ShaderNodeNormalMap');normal.inputs['Strength'].default_value=.55;links.new(node.outputs['Color'],normal.inputs['Color']);links.new(normal.outputs['Normal'],bsdf.inputs[socket])
  else:links.new(node.outputs['Color'],bsdf.inputs[socket])
# X across path, Blender Y longitudinal, Z up. Runtime x,y,z = X,Z,-Y.
specs={'plank':((1.4,.29,.075),.0035,0),'bearer':((.12,1,.13),.004,1),'post':((.13,.13,1),.005,2),'endgrain':((.018,.29,.075),.001,1)}
result={'version':'boardwalk-timber-38','unit':'metres','parts':{}}
for name,(dims,bevel,grain) in specs.items():
 bpy.ops.mesh.primitive_cube_add(size=1);o=bpy.context.object;o.name=name;o.dimensions=dims;bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
 mod=o.modifiers.new('worked edge','BEVEL');mod.width=bevel;mod.segments=2;bpy.ops.object.modifier_apply(modifier=mod.name)
 o.data.materials.append(wood);o.data.materials.append(end);uv=o.data.uv_layers.active
 for face in o.data.polygons:
  axis=max(range(3),key=lambda k:abs(face.normal[k]));across=next((k for k in range(3)if k!=grain and k!=axis),(grain+1)%3)
  is_end=abs(face.normal[grain])>.85;face.material_index=1 if is_end else 0
  other=[k for k in range(3)if k!=grain]
  for li in face.loop_indices:
   p=o.data.vertices[o.data.loops[li].vertex_index].co
   # Scan fibres run vertically: V is physical grain length, U crosses it.
   # End faces require both transverse axes, never the constant long axis.
   uv.data[li].uv=(p[other[0]]*.9+.67,p[other[1]]*.9+.62)if is_end else(p[across]/.55+.5,p[grain]/2.1+.5)
 o.data.calc_loop_triangles();p=[];n=[];u=[];groups=[]
 for tri in o.data.loop_triangles:
  mat=o.data.polygons[tri.polygon_index].material_index
  if groups and groups[-1]['materialIndex']==mat:groups[-1]['count']+=3
  else:groups.append({'start':len(p)//3,'count':3,'materialIndex':mat})
  for li in tri.loops:
   v=o.data.vertices[o.data.loops[li].vertex_index].co;normal=o.data.polygons[tri.polygon_index].normal
   p.extend([round(v.x,7),round(v.z,7),round(-v.y,7)]);n.extend([round(normal.x,7),round(normal.z,7),round(-normal.y,7)]);u.extend([round(k,7)for k in uv.data[li].uv])
 result['parts'][name]={'position':p,'normal':n,'uv':u,'groups':groups,'size':[dims[0],dims[2],dims[1]],'triangles':len(p)//9}
 o['runtimePart']=name;o['sourceRole']='designed construction detail for existing source path'
 bpy.context.view_layer.objects.active=o
# Display kit separated in the editable file; geometry values above stay local.
for i,o in enumerate(bpy.context.scene.objects):o.location.x=i*1.8
source=ROOT/'assets/src/v2/boardwalk/boardwalk-timber-38.blend';bpy.ops.wm.save_as_mainfile(filepath=str(source))
bpy.ops.export_scene.gltf(filepath=str(ROOT/'web/public/assets/v2/boardwalk_timber_38.glb'),export_format='GLB',export_yup=True)
(ROOT/'web/src/v2/generated/boardwalk-timber-38.json').write_text(json.dumps(result,separators=(',',':')))
print(json.dumps({'parts':{k:v['triangles']for k,v in result['parts'].items()},'source':str(source)}))
