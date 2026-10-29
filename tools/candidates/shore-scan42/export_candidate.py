from pathlib import Path
import bpy,json
from mathutils import Vector,Matrix
R=Path.cwd();out=R/'assets/src/v2/shore-candidate42';out.mkdir(exist_ok=True,parents=True);bpy.ops.wm.read_factory_settings(use_empty=True);bpy.ops.import_scene.gltf(filepath=str(R/'assets/src/polyhaven/rock_moss_set_01/rock_moss_set_01_1k.gltf'))
o=bpy.data.objects['rock_moss_set_01_rock01']
for x in list(bpy.context.scene.objects):
 if x!=o:bpy.data.objects.remove(x,do_unlink=True)
bpy.context.view_layer.objects.active=o;o.select_set(True);bpy.ops.object.transform_apply(location=True,rotation=True,scale=True);m=o.data
lo=Vector([min(v.co[k] for v in m.vertices) for k in range(3)]);hi=Vector([max(v.co[k] for v in m.vertices) for k in range(3)]);centre=(lo+hi)/2;unit=max(hi.x-lo.x,hi.y-lo.y)/2
# Uniform object transform then apply: Blender transforms custom normals consistently.
o.location=-centre/unit;o.scale=(1/unit,)*3;bpy.ops.object.transform_apply(location=True,rotation=True,scale=True);m.calc_loop_triangles()
positions=[];normals=[];uv=[];indices=[];lookup={}
for tri in m.loop_triangles:
 for vi,li in zip(tri.vertices,tri.loops):
  p=m.vertices[vi].co;n=m.corner_normals[li].vector;t=m.uv_layers.active.data[li].uv;k=tuple(round(v,7) for v in (p.x,p.z,-p.y,n.x,n.z,-n.y,t.x,1-t.y))
  if k not in lookup:lookup[k]=len(positions)//3;positions.extend(k[:3]);normals.extend(k[3:6]);uv.extend(k[6:])
  indices.append(lookup[k])
(out/'rock01-shell.json').write_text(json.dumps({'position':positions,'normal':normals,'uv':uv,'index':indices},separators=(',',':')))
bpy.ops.wm.save_as_mainfile(filepath=str(out/'rock01.blend'));bpy.ops.export_scene.gltf(filepath=str(out/'rock01.glb'),export_format='GLB',use_selection=True)
(out/'source.json').write_text(json.dumps({'source':'assets/src/polyhaven/rock_moss_set_01/rock_moss_set_01_1k.gltf','object':'rock_moss_set_01_rock01','license':'CC0','normalization':'uniform only, centered; GLTF original tangent material and UV retained','triangles':len(indices)//3,'vertices':len(positions)//3,'production':False,'adoptionRequirement':'Use this same shell and placement for visible geometry, collision and full-wind grass contact; no renderer-only replacement'},indent=2))
print('candidate complete',len(indices)//3,len(positions)//3)
