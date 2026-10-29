"""Editable short rear landing fitted to the existing lodge and DEM.
Design interpretation, not a surveyed historic detail. Original four routes intact.
"""
import bpy,json,hashlib
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
site=json.loads((ROOT/'tools/candidates/route3-entry42/site.json').read_text())
bpy.ops.wm.read_factory_settings(use_empty=True)
with bpy.data.libraries.load(str(ROOT/'assets/src/v2/boardwalk/boardwalk-timber-38.blend'),link=False) as(a,b):
 b.materials=['boardwalk_weathered_timber','boardwalk_sawn_end']
wood,end=[bpy.data.materials[n]for n in b.materials] if isinstance(b.materials[0],str) else b.materials
parts=[]
def box(name,x0,x1,z0,z1,bottom,top,grain):
 bpy.ops.mesh.primitive_cube_add(size=1,location=((x0+x1)/2,-(z0+z1)/2,(bottom+top)/2));o=bpy.context.object;o.name=name;o.dimensions=(x1-x0,z1-z0,top-bottom);bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
 m=o.modifiers.new('softened worked edge','BEVEL');m.width=min(.0035,(top-bottom)*.1);m.segments=2;bpy.ops.object.modifier_apply(modifier=m.name)
 o.data.materials.append(wood);o.data.materials.append(end);uv=o.data.uv_layers.active
 for f in o.data.polygons:
  axis=max(range(3),key=lambda k:abs(f.normal[k]));across=next((k for k in range(3)if k!=grain and k!=axis),(grain+1)%3);is_end=abs(f.normal[grain])>.85;f.material_index=int(is_end);other=[k for k in range(3)if k!=grain]
  for li in f.loop_indices:
   p=o.data.vertices[o.data.loops[li].vertex_index].co
   uv.data[li].uv=(p[other[0]]*.9+.67,p[other[1]]*.9+.62)if is_end else(p[across]/.55+.5,p[grain]/2.1+.5)
 o['role']=name;parts.append(o)
# Four separate treads; drainage is simply through the physical 8 mm joints.
for i in range(4):
 z0=-4.38+i*.212;box('rear landing board '+str(i),-5.22,-3.98,z0,z0+.204,-.020,.035,0)
for x in [-5.08,-4.12]:box('longitudinal bearer',x-.055,x+.055,-4.35,-3.57,-.115,-.020,1)
for x in [-5.08,-4.12]:
 for z in [-4.20,-3.72]:
  sample=min(site['samples'],key=lambda p:(p['x']-x)**2+(p['z']-z)**2);ground=sample['y'];box('terrain fitted foot',x-.060,x+.060,z-.060,z+.060,ground-.035,-.075,2)
# Countersunk wooden pegs: genuine geometry, no painted fake shadow discs.
for i in range(4):
 for x in [-5.08,-4.12]:
  z=-4.38+i*.212+.102;bpy.ops.mesh.primitive_cylinder_add(vertices=12,radius=.008,depth=.006,location=(x,-z,.032));o=bpy.context.object;o.name='flush hardwood peg';o.data.materials.append(end);o.data.materials.append(end);parts.append(o)
result={'version':'route3-entry42','entityId':site['entityId'],'sourceSHA256':site['sourceSHA'],'floorTop':.035,'bounds':[[-5.22,-.235,-4.38],[-3.98,.035,-3.54]],'parts':{}}
p=[];n=[];u=[];groups=[]
for o in parts:
 o.data.calc_loop_triangles();uv=o.data.uv_layers.active
 for tri in o.data.loop_triangles:
  f=o.data.polygons[tri.polygon_index];mat=f.material_index
  if groups and groups[-1]['materialIndex']==mat:groups[-1]['count']+=3
  else:groups.append({'start':len(p)//3,'count':3,'materialIndex':mat})
  for li in tri.loops:
   v=o.matrix_world@o.data.vertices[o.data.loops[li].vertex_index].co;nn=o.matrix_world.to_3x3()@f.normal
   p.extend([round(v.x,7),round(v.z,7),round(-v.y,7)]);n.extend([round(nn.x,7),round(nn.z,7),round(-nn.y,7)]);u.extend([round(t,7)for t in uv.data[li].uv])
result['parts']['rear-entry42']={'position':p,'normal':n,'uv':u,'groups':groups,'size':[1.24,.27,.84],'triangles':len(p)//9}
bpy.context.scene.unit_settings.system='METRIC';bpy.context.scene.unit_settings.scale_length=1
source=ROOT/'assets/src/v2/boardwalk/route3-entry42.blend';bpy.ops.wm.save_as_mainfile(filepath=str(source))
bpy.ops.export_scene.gltf(filepath=str(ROOT/'web/public/assets/v2/route3-entry42.glb'),export_format='GLB',export_yup=True)
result['blendSHA256']=hashlib.sha256(source.read_bytes()).hexdigest()
(ROOT/'web/src/v2/generated/route3-entry42.json').write_text(json.dumps(result,separators=(',',':')))
print(json.dumps({'triangles':len(p)//9,'parts':len(parts),'source':str(source)}))
