"""Additional east-hall exterior-source paths into unchanged dining probes.
Internal passage is not a source. Original GLB/derived six-aperture source are read only.
"""
import bpy,json,hashlib,time,subprocess,base64,math
import numpy as np
from mathutils import Vector
import v2_room_bounce as B
from v2_room_second_bounce import bake as sky2_bake,positive_half_sh
from v2_room_transport import bake as sun_bake
from v2_room_second_solar import bake as sun2_bake
from v2_room_aperture_visibility import aperture_points
ROOT=B.ROOT
load=lambda p:json.loads(p.read_text().split('export default ',1)[1].rsplit(';',1)[0])
base=load(ROOT/'web/src/v2/lodge-room-data.js');first=base['sky'];KEY=base['key'];sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
SOURCE=ROOT/first['sourceBlend'];GLB=ROOT/'web/public'/first['sourceGLB'];assert sha(SOURCE)==first['blendSHA256'];assert sha(GLB)==first['sourceSHA256']
report=json.loads((ROOT/'tools/reports/lodge-dining-gi-v38.json').read_text());assert report['blendSHA256']==first['blendSHA256'];assert report['sourceSHA256']==first['sourceSHA256']
a=json.loads(subprocess.check_output(['node','--input-type=module','-e',"import{LODGE_DINING_ASSET as a}from'./src/v2/lodge-opening.js';import{LODGE_EAST_OPENINGS as o}from'./src/v2/lodge-cross-openings.js';console.log(JSON.stringify({...a,openings:o,probeSize:[17,5,13]}))"],cwd=ROOT/'web',text=True))
B.material_reflectance=lambda m:(np.zeros(3),True)if m.name=='glass'else(np.array(report['materialReflectance'][m.name]),False)
bpy.ops.wm.open_mainfile(filepath=str(SOURCE));start=time.monotonic();bvh,colors,names=B.geometry()
assert tuple(bpy.data.objects['gh_lanchuan_lodge_door0'].rotation_euler)==(0.,0.,0.)
# Finite-area solid-angle integral, 36 points per source, all full-length rays
# test the original hall, partitions, chairs, door frame and room passage.
nx,ny,nz=first['size'];n=nx*ny*nz;original=np.frombuffer(base64.b64decode(first['data']),dtype='<f2').reshape(4,n,4);zero=np.zeros_like(original,dtype=np.float32);zero[:,:,3]=original[:,:,3];lo=np.array(first['bounds'][0]);hi=np.array(first['bounds'][1]);visible=[0]*len(a['openings'])
for z in range(nz):
 for y in range(ny):
  for x in range(nx):
   i=(z*ny+y)*nx+x
   if not original[0,i,3]:continue
   p=Vector(lo+(hi-lo)*np.array([x/(nx-1),y/(ny-1),z/(nz-1)]))
   for oidx,o in enumerate(a['openings']):
    area=o['width']*o['height']*o['skyWeight']/36;normal=Vector(o['normal'])
    for target in aperture_points(o):
     delta=target-p;d=delta.length;direction=delta/d;w=max(0,normal.dot(direction))*area/d**2
     if w==0 or bvh.ray_cast(p,direction,d-.002)[0]is not None:continue
     visible[oidx]+=1;zero[0,i,:3]+=B.SKY*w*.25
     for band in range(3):zero[band+1,i,:3]+=B.SKY*w*.5*direction[band]
zero_field={k:first[k]for k in ['bounds','size','validProbes','sourceGLB','sourceSHA256','sourceBlend','blendSHA256','openings']};zero_field.update({'data':base64.b64encode(positive_half_sh(zero.reshape(4,nz,ny,nx,4)).tobytes()).decode(),'model':'east exterior aperture finite solid-angle direct sky only, opaque full-building visibility; no direct solar','samplesPerAperture':36,'visibleSamplesByOpening':visible})
new_first=B.bake(KEY,a,bvh,colors,SOURCE,GLB,validity=first)
result={'key':KEY,'sourceOpenings':a['openings'],'directSky':zero_field,'sky':new_first,'secondSky':sky2_bake(KEY,a,first,bvh,colors,SOURCE,GLB),'solar':sun_bake(KEY,a,first,bvh,colors,SOURCE,GLB),'secondSolar':sun2_bake(KEY,a,first,bvh,colors,SOURCE,GLB),'model':'east exterior source contribution, original static closed glazed entry, full building BVH; six local apertures remain separate'}
# Common receiver identities stay the six-aperture field; source identities are
# explicit and separate, so runtime cannot mistake east supply for local holes.
for name in ['directSky','sky','secondSky','solar','secondSolar']:
 result[name]['openings']=first['openings'];result[name]['sourceOpenings']=a['openings']
assert sha(SOURCE)==first['blendSHA256'] and sha(GLB)==first['sourceSHA256']
OUT=ROOT/'web/src/v2/lodge-cross-data.js';OUT.write_text('// Generated source-separated cross-room transport.\nexport default '+json.dumps(result,separators=(',',':'))+';\n')
summary={'seconds':time.monotonic()-start,'sourceSHA256':first['sourceSHA256'],'blendSHA256':first['blendSHA256'],'moduleBytes':OUT.stat().st_size,'visibleDirectSamplesByOpening':visible,'firstSkyMean':float(np.frombuffer(base64.b64decode(new_first['data']),dtype='<f2').reshape(4,n,4)[0,:,:3].mean()),'sourceOpenings':a['openings']}
(ROOT/'tools/reports/lodge-cross-gi-v38.json').write_text(json.dumps(summary,indent=2));print(json.dumps(summary),flush=True)
