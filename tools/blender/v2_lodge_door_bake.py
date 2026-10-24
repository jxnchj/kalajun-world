"""Three actual articulated-glazed-door transport states; original assets read only.
Only this lodge/dining receiver. Shared existing 96/32/81 integrators unchanged.
"""
import bpy,json,hashlib,time,subprocess,base64,math,argparse
import numpy as np
from mathutils import Vector,Quaternion
from mathutils.bvhtree import BVHTree
import v2_room_bounce as B
import v2_room_second_bounce as S
import v2_room_transport as T
import v2_room_second_solar as S2
import v2_room_aperture_visibility as A
ROOT=B.ROOT;load=lambda p:json.loads(p.read_text().split('export default ',1)[1].rsplit(';',1)[0]);sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
parser=argparse.ArgumentParser();parser.add_argument('--index',type=int,choices=[0,1,2],required=True);args=parser.parse_args()
base=load(ROOT/'web/src/v2/lodge-room-data.js');cross_base=load(ROOT/'web/src/v2/lodge-cross-data.js');first=base['sky'];KEY=base['key'];SOURCE=ROOT/first['sourceBlend'];GLB=ROOT/'web/public'/first['sourceGLB']
assert sha(SOURCE)==first['blendSHA256'] and sha(GLB)==first['sourceSHA256']
report=json.loads((ROOT/'tools/reports/lodge-dining-gi-v38.json').read_text());assert report['blendSHA256']==first['blendSHA256'] and report['sourceSHA256']==first['sourceSHA256']
info=json.loads(subprocess.check_output(['node','--input-type=module','-e',"import{LODGE_DINING_ASSET as room}from'./src/v2/lodge-opening.js';import{LODGE_EAST_OPENINGS as east}from'./src/v2/lodge-cross-openings.js';import{LODGE_DOOR as door}from'./src/v2/lodge-door.js';console.log(JSON.stringify({room,east,door}))"],cwd=ROOT/'web',text=True))
a={**info['room'],'probeSize':[17,5,13]};east={**a,'openings':[{**o,'skyWeight':1.0 if i==0 else o['skyWeight']}for i,o in enumerate(info['east'])]};door=info['door'];angle=door['open']*args.index/2
B.material_reflectance=lambda m:(np.zeros(3),True)if m.name=='glass'else(np.array(report['materialReflectance'][m.name]),False)
bpy.ops.wm.open_mainfile(filepath=str(SOURCE));start=time.monotonic();hinge=bpy.data.objects[door['name']];assert tuple(hinge.rotation_euler)==(0.,0.,0.)
p=hinge.matrix_world.translation;assert max(abs(x-y)for x,y in zip((p.x,p.z,-p.y),door['hinge']))<1e-6
assert hinge.rotation_mode=='QUATERNION' and tuple(hinge.rotation_quaternion)==(1.,0.,0.,0.)
hinge.rotation_quaternion=Quaternion((0,0,1),angle);bpy.context.view_layer.update()
# Verify actual world-axis orientation, not merely a stale Euler property.
axis=hinge.matrix_world.to_3x3()@Vector((1,0,0))
assert abs(axis.x-math.cos(angle))<1e-6 and abs(axis.y-math.sin(angle))<1e-6
opaque,colors,names=B.geometry();face_count=len(colors)
vertices=[];faces=[]
for obj in hinge.children_recursive:
 if obj.type!='MESH':continue
 obj.data.calc_loop_triangles();offset=len(vertices)
 for v in obj.data.vertices:
  p=obj.matrix_world@v.co;vertices.append(Vector((p.x,p.z,-p.y)))
 for tri in obj.data.loop_triangles:
  if obj.data.materials[tri.material_index].name=='glass':faces.append(tuple(offset+i for i in tri.vertices))
assert faces;glass=BVHTree.FromPolygons(vertices,faces,all_triangles=True)
def transmission(start,direction,distance):
 return .9 if glass.ray_cast(start,direction,max(.001,distance))[0]is not None else 1.
class ThinPaneBVH:
 # An attenuated opaque hit has a separate material index. This exactly applies
 # pane transmittance on probe->A and A->B segments without treating glass as a
 # diffuse reflector or dropping any source surface geometry.
 def ray_cast(self,start,direction,distance=1e30):
  hit,n,index,d=opaque.ray_cast(start,direction,distance)
  if hit is not None and transmission(start,direction,max(.001,d-.001))<1:index+=face_count
  return hit,n,index,d
# Same real pane segment must attenuate once despite its two solid faces;
# the opened aperture centre must clear the pane at the fully open endpoint.
centre_ray=transmission(Vector((-2.30,1.4,3.0)),Vector((0,0,1)),1.)
if args.index==0:assert centre_ray==.9,'Closed authored pane must attenuate aperture centre'
if args.index==2:assert centre_ray==1.,'Open authored pane must clear aperture centre'
bvh=ThinPaneBVH();colors=np.concatenate([colors,colors*.9])
def irradiance(point,normal,openings,bvh):
 start=point+normal*.012;value=0.
 for points,n,area in openings:
  for target in points:
   delta=target-start;d2=delta.length_squared;d=math.sqrt(d2)
   if d<.025:continue
   direction=delta/d;c=max(0,normal.dot(direction))*max(0,n.dot(direction))
   if c<=0 or opaque.ray_cast(start,direction,max(.001,d-.024))[0]is not None:continue
   value+=area*c/max(d2,.0025)*transmission(start,direction,d+.02)
 return min(math.pi,value)
B.irradiance_at=irradiance;S.irradiance_at=irradiance
original_solar=T.solar_irradiance
T.solar_irradiance=lambda p,n,d,o,b:original_solar(p,n,d,o,b)*transmission(p+n*.012,d,30)
original_many=S2.solar_many
def solar_many(points,normals,sun,openings,bvh):
 result=original_many(points,normals,sun,openings,bvh)
 for i in np.flatnonzero(result>0):result[i]*=transmission(Vector(points[i]+normals[i]*.012),sun,30)
 return result
S2.solar_many=solar_many
def aperture_visibility(point,opening,bvh):
 normal=Vector(opening['normal']);visible=total=0.
 for target in A.aperture_points(opening):
  delta=target-point;d=delta.length
  if d<.003:continue
  direction=delta/d;w=max(0,normal.dot(direction))/d**2
  if w<=0:continue
  total+=w
  if opaque.ray_cast(point,direction,d-.002)[0]is None:visible+=w*transmission(point,direction,d+.02)
 return visible/total if total else 0.
A.aperture_visibility=aperture_visibility
nx,ny,nz=first['size'];count=nx*ny*nz;original=np.frombuffer(base64.b64decode(first['data']),dtype='<f2').reshape(4,count,4)
def direct_sky(definition):
 result=np.zeros_like(original,dtype=np.float32);result[:,:,3]=original[:,:,3];lo=np.array(first['bounds'][0]);hi=np.array(first['bounds'][1])
 for z in range(nz):
  for y in range(ny):
   for x in range(nx):
    i=(z*ny+y)*nx+x
    if not original[0,i,3]:continue
    point=Vector(lo+(hi-lo)*np.array([x/(nx-1),y/(ny-1),z/(nz-1)]))
    for o in definition['openings']:
     normal=Vector(o['normal']);area=o['width']*o['height']*o['skyWeight']/36
     for target in A.aperture_points(o):
      delta=target-point;d=delta.length;direction=delta/d;w=max(0,normal.dot(direction))*area/d**2
      if w<=0 or opaque.ray_cast(point,direction,d-.002)[0]is not None:continue
      w*=transmission(point,direction,d+.02);result[0,i,:3]+=B.SKY*w*.25
      for band in range(3):result[band+1,i,:3]+=B.SKY*w*.5*direction[band]
 out={k:first[k]for k in ['bounds','size','validProbes','sourceGLB','sourceSHA256','sourceBlend','blendSHA256','openings']};out['data']=base64.b64encode(S.positive_half_sh(result.reshape(4,nz,ny,nx,4)).tobytes()).decode();return out
result={'key':KEY,'door':door,'angle':angle,'index':args.index,'glassTransmission':.9,'model':'three actual opaque frames and transmissive pane poses; adjacent-state interpolation, not full dynamic GI'}
for group,definition in [('local',a),('cross',east)]:
 sky=B.bake(KEY,definition,bvh,colors,SOURCE,GLB,validity=first)
 item={'sky':sky,'secondSky':S.bake(KEY,definition,first,bvh,colors,SOURCE,GLB),'solar':T.bake(KEY,definition,first,bvh,colors,SOURCE,GLB),'secondSolar':S2.bake(KEY,definition,first,bvh,colors,SOURCE,GLB)}
 if group=='local':item['apertures']=A.bake(KEY,first,bvh)
 else:item['directSky']=direct_sky(definition)
 for f in item.values():f['openings']=first['openings'];f['sourceOpenings']=definition['openings']
 result[group]=item
assert sha(SOURCE)==first['blendSHA256'] and sha(GLB)==first['sourceSHA256']
# Preserve independent source bundles. Identical payloads refer to the exact
# baseline rather than duplicating bytes; no lossy coefficient quantisation.
reused=[]
for group,original_bundle in [('local',base),('cross',cross_base)]:
 for name,f in result[group].items():
  payload='directions'if'directions'in f else'data'
  if f.get(payload)==original_bundle[name].get(payload):f.pop(payload);f['reusePayload']=group+'/'+name;reused.append(group+'/'+name)
out=ROOT/'web/src/v2/lodge-door-data';out.mkdir(exist_ok=True);path=out/f'{args.index}.js';path.write_text('// Generated from unchanged lodge source at actual door angle.\nexport default '+json.dumps(result,separators=(',',':'))+';\n')
summary={'index':args.index,'angle':angle,'seconds':time.monotonic()-start,'bytes':path.stat().st_size,'reused':reused,'sourceSHA256':sha(GLB),'blendSHA256':sha(SOURCE),'glassTriangles':len(faces),'opaqueFaces':face_count,'centreRayTransmission':centre_ray,'worldLeafAxis':list(axis),'rotationMode':hinge.rotation_mode,'samples':B.SAMPLES,'surfaceSamples':S.SURFACE_SAMPLES,'sunDirections':81}
(ROOT/f'tools/reports/lodge-door-gi-{args.index}-v38.json').write_text(json.dumps(summary,indent=2));print(json.dumps(summary),flush=True)
