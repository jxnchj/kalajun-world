from pathlib import Path
import bpy,json,bmesh
from mathutils import Vector,Matrix
R=Path.cwd();out=R/'assets/src/v2/shore-candidate42';out.mkdir(exist_ok=True,parents=True);bpy.ops.wm.read_factory_settings(use_empty=True);bpy.ops.import_scene.gltf(filepath=str(R/'assets/src/polyhaven/rock_moss_set_01/rock_moss_set_01_1k.gltf'))
o=bpy.data.objects['rock_moss_set_01_rock05']
for x in list(bpy.context.scene.objects):
 if x!=o:bpy.data.objects.remove(x,do_unlink=True)
bpy.context.view_layer.objects.active=o;o.select_set(True);bpy.ops.object.transform_apply(location=True,rotation=True,scale=True);m=o.data

# Derive a stable support from the actual convex hull, not the review camera.
bm=bmesh.new();bm.from_mesh(m);result=bmesh.ops.convex_hull(bm,input=list(bm.verts),use_existing_faces=False)
hull=bmesh.new();vs={v:hull.verts.new(v.co) for v in result['geom'] if isinstance(v,bmesh.types.BMVert)}
for f in result['geom']:
 if isinstance(f,bmesh.types.BMFace):
  for v in f.verts:
   if v not in vs:vs[v]=hull.verts.new(v.co)
  try:hull.faces.new([vs[v] for v in f.verts])
  except ValueError:pass
bmesh.ops.triangulate(hull,faces=list(hull.faces));hull.normal_update()
centre=sum((v.co for v in hull.verts),Vector())/len(hull.verts);volume=0;centroid=Vector()
for f in hull.faces:
 a,b,c=[v.co for v in f.verts];w=(a-centre).dot((b-centre).cross(c-centre))/6;volume+=w;centroid+=(centre+a+b+c)*(w/4)
com=centroid/volume
options=[]
for f in hull.faces:
 a,b,c=[v.co for v in f.verts];n=(b-a).cross(c-a).normalized()
 if n.dot(com-a)>0:n=-n
 height=-n.dot(com-a);projected=com+n*height
 v0=b-a;v1=c-a;v2=projected-a;d00=v0.dot(v0);d01=v0.dot(v1);d11=v1.dot(v1);den=d00*d11-d01*d01
 if den<=1e-16:continue
 u=(d11*v2.dot(v0)-d01*v2.dot(v1))/den;v=(d00*v2.dot(v1)-d01*v2.dot(v0))/den
 if min(u,v,1-u-v)>.04:options.append((height,-f.calc_area(),n.copy(),[a.copy(),b.copy(),c.copy()],[1-u-v,u,v]))
assert options,'No stable support triangle'
height,_,n,feet,bary=min(options,key=lambda r:(r[0],r[1]));rotation=n.rotation_difference(Vector((0,0,-1)));support={'hullUniformDensityCOM':list(com),'sourceSupportNormal':list(n),'supportHeight':height,'barycentricCOM':bary,'rotationQuaternionWXYZ':list(rotation),'supportPoints':[list(v) for v in feet]}
o.rotation_mode='QUATERNION';o.rotation_quaternion=rotation;bpy.ops.object.transform_apply(location=False,rotation=True,scale=False);hull.free();bm.free()

lo=Vector([min(v.co[k] for v in m.vertices) for k in range(3)]);hi=Vector([max(v.co[k] for v in m.vertices) for k in range(3)]);centre=(lo+hi)/2;unit=max(hi.x-lo.x,hi.y-lo.y)/2
# Uniform object transform then apply: Blender transforms custom normals consistently.
o.location=-centre/unit;o.scale=(1/unit,)*3;bpy.ops.object.transform_apply(location=True,rotation=True,scale=True);m.calc_loop_triangles()
positions=[];normals=[];uv=[];indices=[];lookup={}
for tri in m.loop_triangles:
 for vi,li in zip(tri.vertices,tri.loops):
  p=m.vertices[vi].co;n=m.corner_normals[li].vector;t=m.uv_layers.active.data[li].uv;k=tuple(round(v,7) for v in (p.x,p.z,-p.y,n.x,n.z,-n.y,t.x,1-t.y))
  if k not in lookup:lookup[k]=len(positions)//3;positions.extend(k[:3]);normals.extend(k[3:6]);uv.extend(k[6:])
  indices.append(lookup[k])
(out/'rock05-shell.json').write_text(json.dumps({'position':positions,'normal':normals,'uv':uv,'index':indices},separators=(',',':')))
bpy.ops.wm.save_as_mainfile(filepath=str(out/'rock05.blend'));bpy.ops.export_scene.gltf(filepath=str(out/'rock05.glb'),export_format='GLB',use_selection=True)
(out/'rock05-source.json').write_text(json.dumps({'source':'assets/src/polyhaven/rock_moss_set_01/rock_moss_set_01_1k.gltf','object':'rock_moss_set_01_rock05','license':'CC0','normalization':'uniform only, centered; GLTF original tangent material and UV retained','triangles':len(indices)//3,'vertices':len(positions)//3,'production':False,'stableSupport':support,'adoptionRequirement':'Use this same shell and placement for visible geometry, collision and full-wind grass contact; no renderer-only replacement'},indent=2))
print('candidate complete',len(indices)//3,len(positions)//3)
