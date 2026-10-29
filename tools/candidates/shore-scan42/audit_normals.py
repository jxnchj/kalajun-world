from pathlib import Path
import bpy,json,math
from mathutils import Vector
R=Path.cwd();bpy.ops.wm.read_factory_settings(use_empty=True);bpy.ops.import_scene.gltf(filepath=str(R/'assets/src/polyhaven/rock_07/rock_07_1k.gltf'));o=[x for x in bpy.context.scene.objects if x.type=='MESH'][0];bpy.context.view_layer.objects.active=o;o.select_set(True);mod=o.modifiers.new('runtime','DECIMATE');mod.ratio=.085;bpy.ops.object.modifier_apply(modifier=mod.name);m=o.data
lo=Vector([min(v.co[i] for v in m.vertices) for i in range(3)]);hi=Vector([max(v.co[i] for v in m.vertices) for i in range(3)]);centre=(lo+hi)/2;h=max((hi.x-lo.x)/2,(hi.y-lo.y)/2);z=(hi.z-lo.z)/2
old=[n.vector.copy() for n in m.corner_normals]
for v in m.vertices:v.co=Vector(((v.co.x-centre.x)/h,(v.co.y-centre.y)/h,(v.co.z-centre.z)/z))
m.update();m.calc_loop_triangles();errors=[];unchanged=0
for a,b in zip(old,m.corner_normals):
 e=Vector((a.x*h,a.y*h,a.z*z)).normalized();errors.append(math.degrees(e.angle(b.vector,0)));unchanged+=(a-b.vector).length<1e-7
result={'customNormals':m.has_custom_normals,'loops':len(old),'unchangedNormals':unchanged,'maxInverseTransposeErrorDegrees':max(errors),'meanInverseTransposeErrorDegrees':sum(errors)/len(errors),'horizontal':h,'height':z};print(json.dumps(result));(R/'tools/candidates/shore-scan42/normals-audit.json').write_text(json.dumps(result,indent=2))

expected=[Vector((a.x*h,a.y*h,a.z*z)).normalized() for a in old]
m.normals_split_custom_set(expected);m.update();error=max((a-b.vector).length for a,b in zip(expected,m.corner_normals));export_error=max((a-Vector(tuple(round(x,6) for x in a))).length for a in expected);assert export_error<1e-6,export_error
print("corrected normal max vector error",error)
result["blenderPackedNormalMaxVectorError"]=error;result["correctedExportMaxVectorError"]=export_error;(R/"tools/candidates/shore-scan42/normals-audit.json").write_text(json.dumps(result,indent=2))
