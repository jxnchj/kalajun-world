"""Bake only a second diffuse reflection of existing guest-room spot fixtures.
Probe -> opaque surface -> opaque surface -> fixture, with both material
reflectances and BVH-tested legs. No direct fixture, first bounce, sun or sky.
"""
import base64, hashlib, json, math, time
import bpy
import numpy as np
from mathutils import Vector
from v2_room_bounce import ROOT, FILES, geometry, SAMPLES
from v2_room_fixture import fixtures, unit_spot_irradiance
from v2_room_second_bounce import positive_half_sh, cosine_directions
from v2_room_transport import encode_rle

OUT=ROOT/'web/src/v2/room-second-fixture-data.js'
SURFACE_SAMPLES=48

def second_fixture_radiance(point,normal,reflectance,fixture,bvh,albedos,direct_cache=None,samples=SURFACE_SAMPLES):
    if not np.any(reflectance): return np.zeros(3)
    cache=direct_cache if direct_cache is not None else {}
    result=np.zeros(3); start=point+normal*.012
    for direction in cosine_directions(normal,samples):
        hit,n,face,_=bvh.ray_cast(start,direction,30)
        # Escaping to a lamp or sky contributes zero: those terms exist already.
        if hit is None or not np.any(albedos[face]): continue
        if n.dot(direction)>0:n=-n
        key=(*[round(x/.015)for x in hit],*[round(x/.025)for x in n],face)
        value=cache.get(key)
        if value is None:
            value=albedos[face]*unit_spot_irradiance(hit,n,fixture,bvh)/math.pi;cache[key]=value
        result+=value
    # Cosine-weighted hemisphere E=pi*mean(L); outgoing L=rho*E/pi.
    return reflectance*result/samples

def bake(key,base,lights,bvh,albedos,source,glb):
    started=time.monotonic();nx,ny,nz=base['size'];count=nx*ny*nz
    original=np.frombuffer(base64.b64decode(base['data']),dtype='<f2').reshape(4,nz,ny,nx,4)
    lo=np.array(base['bounds'][0]);hi=np.array(base['bounds'][1]);dirs=[]
    for i in range(SAMPLES):
        y=1-2*(i+.5)/SAMPLES;r=math.sqrt(1-y*y);phi=i*math.pi*(3-math.sqrt(5))
        dirs.append(Vector((r*math.cos(phi),y,r*math.sin(phi))))
    basis=np.array([[math.pi,*[2*math.pi*x for x in d]]for d in dirs])/SAMPLES
    tables=[];summary=[]
    for number,fixture in enumerate(lights):
        result=np.zeros_like(original,dtype=np.float32);result[:,:,:,:,3]=original[:,:,:,:,3]
        cache={};direct_cache={}
        for iz in range(nz):
          for iy in range(ny):
           for ix in range(nx):
            if original[0,iz,iy,ix,3]==0:continue
            point=Vector(lo+(hi-lo)*np.array([ix/(nx-1),iy/(ny-1),iz/(nz-1)]));rad=[]
            for direction in dirs:
                hit,n,face,_=bvh.ray_cast(point,direction,30)
                if hit is None:rad.append(np.zeros(3));continue
                if n.dot(direction)>0:n=-n
                ck=(*[round(x/.045)for x in hit],*[round(x/.10)for x in n],face)
                value=cache.get(ck)
                if value is None:
                    value=second_fixture_radiance(hit,n,albedos[face],fixture,bvh,albedos,direct_cache);cache[ck]=value
                rad.append(value)
            result[:,iz,iy,ix,:3]=basis.T@np.array(rad)
        assert np.isfinite(result).all() and (result[0,:,:,:,:3]>=0).all()
        half=positive_half_sh(result);tables.append(encode_rle(half.reshape(4,count,4)[:,:,:3]))
        valid=original[0,:,:,:,3]>0
        summary.append({'maxCoefficient':float(half[:,:,:,:,:3].max()),'meanConstant':np.mean(half[0,:,:,:,:3][valid],axis=0).astype(float).tolist()})
        print(json.dumps({'room':key,'fixture':number,'seconds':round(time.monotonic()-started,2),'surfaces':len(cache),'directSurfaces':len(direct_cache),'summary':summary[-1]}),flush=True)
    for path,prop in [(source,'blendSHA256'),(glb,'sourceSHA256')]:assert hashlib.sha256(path.read_bytes()).hexdigest()==base[prop]
    result={k:base[k]for k in ['bounds','size','validProbes','sourceGLB','sourceSHA256','sourceBlend','blendSHA256','openings']}
    result.update({'fixtures':lights,'directions':tables,'samples':SAMPLES,'surfaceSamples':SURFACE_SAMPLES,'bounceOrder':2,'encoding':'zero-run-f16-rgb-sh4-v1','unitScale':[1,1,1],
      'summary':summary,'calibration':'unit candela; existing Three spotlight attenuation/cone; source opaque BVH; second Lambert material reflection only; no direct/first/sky/sun'})
    return result

if __name__=='__main__':
    sources=json.loads((ROOT/'web/src/v2/room-bounce-data.js').read_text().split('export const ROOM_BOUNCE_DATA = ',1)[1].rsplit(';',1)[0]);lights=fixtures()
    rel,pub=FILES['lanchuan'];source=ROOT/'assets/src/v2'/rel;glb=ROOT/'web/public/assets/v2'/pub
    bpy.ops.wm.open_mainfile(filepath=str(source));bvh,albedos,_=geometry()
    folder=OUT.parent/'room-second-fixture-data';folder.mkdir(exist_ok=True)
    for key,lamps in lights.items():
        data=bake(key,sources[key],lamps,bvh,albedos,source,glb)
        (folder/(key+'.js')).write_text('// Generated second-bounce transfer from existing room fixtures.\nexport default '+json.dumps(data,separators=(',',':'))+';\n')
    OUT.write_text('// Load only the entered guest room; second fixture bounce is absent from outdoor startup.\nexport const ROOM_SECOND_FIXTURE_LOADERS=Object.freeze({\n'+''.join(json.dumps(k)+':()=>import("./room-second-fixture-data/'+k+'.js").then(m=>m.default),\n'for k in lights)+'});\n')
