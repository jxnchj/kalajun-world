"""One diffuse reflection from the three existing guest-room spot fixtures.
Unit candela and source material reflectance; probe -> opaque surface -> fixture.
The actual source Blend BVH blocks both legs. No direct lamp, sky or sun term.
"""
import base64,hashlib,json,math,subprocess,time
import bpy
import numpy as np
from mathutils import Vector
from v2_room_bounce import ROOT,FILES,geometry,SAMPLES
from v2_room_transport import encode_rle
from v2_room_second_bounce import positive_half_sh

OUT=ROOT/'web/src/v2/room-fixture-data.js'

def fixtures():
    code="""import{SettlementRuntime}from'./src/v2/settlements.js';
const r=new SettlementRuntime({entities:[{id:'guest',assetId:'gh_lanchuan'}],surface:{heightAt:()=>0,buildingPose:()=>({x:0,y:0,z:0,rot:0,scale:{x:1,y:1,z:1}})}});
const l=r.lights[0],out={};for(const a of r.anchors){if(!out[a.roomId])out[a.roomId]=[];out[a.roomId].push({position:a.position.toArray(),target:a.target.toArray(),distance:l.distance,angle:l.angle,penumbra:l.penumbra,decay:l.decay});}r.dispose();console.log(JSON.stringify(out));"""
    return json.loads(subprocess.check_output(['node','--input-type=module','-e',code],cwd=ROOT/'web',text=True))

def unit_spot_irradiance(point,normal,fixture,bvh):
    start=point+normal*.012;delta=Vector(fixture['position'])-start;distance=delta.length
    if distance<.001:return 0.
    toward=delta/distance;cosine=max(0.,normal.dot(toward))
    axis=(Vector(fixture['target'])-Vector(fixture['position'])).normalized()
    angle_cos=axis.dot(-toward);outer=math.cos(fixture['angle']);inner=math.cos(fixture['angle']*(1-fixture['penumbra']))
    t=max(0.,min(1.,(angle_cos-outer)/(inner-outer)));cone=t*t*(3-2*t)
    if cosine*cone<=0:return 0.
    # Exactly the live Three spot light's inverse-square / finite range law.
    falloff=1/max(distance**fixture['decay'],.01)
    if fixture['distance']>0:falloff*=max(0.,1-(distance/fixture['distance'])**4)**2
    if falloff<=0 or bvh.ray_cast(start,toward,max(.001,distance-.024))[0]is not None:return 0.
    return cosine*cone*falloff

def bake(key,base,lights,bvh,albedos,source,glb):
    start=time.monotonic();nx,ny,nz=base['size'];count=nx*ny*nz
    original=np.frombuffer(base64.b64decode(base['data']),dtype='<f2').reshape(4,nz,ny,nx,4)
    lo=np.array(base['bounds'][0]);hi=np.array(base['bounds'][1]);dirs=[]
    for i in range(SAMPLES):
        y=1-2*(i+.5)/SAMPLES;r=math.sqrt(1-y*y);phi=i*math.pi*(3-math.sqrt(5))
        dirs.append(Vector((r*math.cos(phi),y,r*math.sin(phi))))
    basis=np.array([[math.pi,*[2*math.pi*x for x in d]]for d in dirs])/SAMPLES
    tables=[];summary=[];cache={}
    for number,fixture in enumerate(lights):
        result=np.zeros_like(original,dtype=np.float32);result[:,:,:,:,3]=original[:,:,:,:,3]
        for iz in range(nz):
          for iy in range(ny):
           for ix in range(nx):
            if original[0,iz,iy,ix,3]==0:continue
            point=Vector(lo+(hi-lo)*np.array([ix/(nx-1),iy/(ny-1),iz/(nz-1)]));rad=[]
            for direction in dirs:
                hit,n,face,_=bvh.ray_cast(point,direction,30)
                if hit is None:rad.append(np.zeros(3));continue
                if n.dot(direction)>0:n=-n
                ck=(number,*[round(x/.015)for x in hit],*[round(x/.025)for x in n],face)
                value=cache.get(ck)
                if value is None:value=albedos[face]*unit_spot_irradiance(hit,n,fixture,bvh)/math.pi;cache[ck]=value
                rad.append(value)
            result[:,iz,iy,ix,:3]=basis.T@np.array(rad)
        assert np.isfinite(result).all()and(result[0,:,:,:,:3]>=0).all()
        half=positive_half_sh(result);tables.append(encode_rle(half.reshape(4,count,4)[:,:,:3]))
        valid=original[0,:,:,:,3]>0
        summary.append({'maxCoefficient':float(half[:,:,:,:,:3].max()),'meanConstant':np.mean(half[0,:,:,:,:3][valid],axis=0).astype(float).tolist()})
    for path,prop in [(source,'blendSHA256'),(glb,'sourceSHA256')]:assert hashlib.sha256(path.read_bytes()).hexdigest()==base[prop]
    result={k:base[k]for k in ['bounds','size','validProbes','sourceGLB','sourceSHA256','sourceBlend','blendSHA256','openings']}
    result.update({'fixtures':lights,'directions':tables,'samples':SAMPLES,'bounceOrder':1,'encoding':'zero-run-f16-rgb-sh4-v1','unitScale':[1,1,1],
      'summary':summary,'calibration':'unit candela; existing Three spotlight attenuation/cone; source opaque BVH; one Lambert material reflection; no direct/sky/sun'})
    print(json.dumps({'room':key,'seconds':round(time.monotonic()-start,3),'encodedBytes':sum(len(base64.b64decode(d))for d in tables),'summary':summary}),flush=True)
    return result

if __name__=='__main__':
    sources=json.loads((ROOT/'web/src/v2/room-bounce-data.js').read_text().split('export const ROOM_BOUNCE_DATA = ',1)[1].rsplit(';',1)[0]);lights=fixtures()
    rel,pub=FILES['lanchuan'];source=ROOT/'assets/src/v2'/rel;glb=ROOT/'web/public/assets/v2'/pub
    bpy.ops.wm.open_mainfile(filepath=str(source));bvh,albedos,_=geometry()
    folder=OUT.parent/'room-fixture-data';folder.mkdir(exist_ok=True)
    for key,lamps in lights.items():
        data=bake(key,sources[key],lamps,bvh,albedos,source,glb)
        (folder/(key+'.js')).write_text('// Generated one-bounce transfer from existing room fixtures.\nexport default '+json.dumps(data,separators=(',',':'))+';\n')
    OUT.write_text('// Load only the entered guest room; no fixture table in outdoor startup.\nexport const ROOM_FIXTURE_LOADERS=Object.freeze({\n'+''.join(json.dumps(k)+':()=>import("./room-fixture-data/'+k+'.js").then(m=>m.default),\n'for k in lights)+'});\n')
