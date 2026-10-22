"""Bake only the SECOND diffuse sky bounce through existing room geometry.
The source meshes, first sky bounce, solar transfer and direct lights are unchanged.
Cosine-weighted surface paths include furniture/partitions and material reflectance.
No runtime ray tracing or new GPU sampler is introduced.
"""
import argparse,base64,hashlib,json,math,time
import bpy
import numpy as np
from mathutils import Vector
from v2_room_bounce import ROOT,FILES,definitions,geometry,aperture_samples,irradiance_at,SAMPLES,SKY

OUT=ROOT/'web/src/v2/room-second-bounce-data.js'
SURFACE_SAMPLES=32

def cosine_directions(normal,count=SURFACE_SAMPLES):
    n=normal.normalized();axis=Vector((0,1,0))if abs(n.y)<.9 else Vector((1,0,0))
    u=axis.cross(n).normalized();v=n.cross(u)
    for i in range(count):
        r=math.sqrt((i+.5)/count);phi=i*math.pi*(3-math.sqrt(5))
        yield u*(r*math.cos(phi))+v*(r*math.sin(phi))+n*math.sqrt(1-r*r)

def second_radiance(point,normal,reflectance,bvh,albedos,openings,direct_cache=None,samples=SURFACE_SAMPLES):
    # E1 = pi * mean(L1) with cosine sampling; L2 = rho1 * E1/pi.
    # A ray escaping through a window contributes ZERO here: direct sky and
    # the first bounce already have separate runtime sources.
    if not np.any(reflectance):return np.zeros(3)
    cache=direct_cache if direct_cache is not None else {}
    result=np.zeros(3);start=point+normal*.012
    for direction in cosine_directions(normal,samples):
        hit,n,face,_=bvh.ray_cast(start,direction,30)
        if hit is None or not np.any(albedos[face]):continue
        if n.dot(direction)>0:n=-n
        key=(*[round(x/.035)for x in hit],*[round(x/.10)for x in n],face)
        e=cache.get(key)
        if e is None:e=irradiance_at(hit,n,openings,bvh);cache[key]=e
        result+=albedos[face]*SKY*(e/math.pi)
    return reflectance*result/samples

def positive_half_sh(data):
    # The first SH band can ring below zero for directional transport. Preserve
    # each probe's mean energy and hue, and shorten only an excessive vector.
    half=data.astype('<f2')
    for _ in range(4):
        values=half.astype(np.float32);length=np.linalg.norm(values[1:,:,:,:,:3],axis=0)
        constant=values[0,:,:,:,:3];bad=length>constant
        if not np.any(bad):break
        scale=np.ones_like(length);scale[bad]=np.maximum(0,constant[bad]-1.2e-7)/length[bad]*.999
        values[1:,:,:,:,:3]*=scale[None,:,:,:,:]
        half=values.astype('<f2')
    assert np.all(np.linalg.norm(half[1:,:,:,:,:3].astype(np.float32),axis=0)<=half[0,:,:,:,:3].astype(np.float32))
    return half

def bake(key,definition,base,bvh,albedos,source,glb):
    start=time.monotonic();nx,ny,nz=base['size'];lo=np.array(base['bounds'][0]);hi=np.array(base['bounds'][1])
    original=np.frombuffer(base64.b64decode(base['data']),dtype='<f2').reshape(4,nz,ny,nx,4)
    data=np.zeros(original.shape,np.float32);data[:,:,:,:,3]=original[:,:,:,:,3]
    directions=[]
    for i in range(SAMPLES):
        y=1-2*(i+.5)/SAMPLES;r=math.sqrt(1-y*y);phi=i*math.pi*(3-math.sqrt(5))
        directions.append(Vector((r*math.cos(phi),y,r*math.sin(phi))))
    basis=np.array([[math.pi,*[2*math.pi*x for x in d]]for d in directions])/SAMPLES
    openings=aperture_samples(definition);cache={};direct_cache={};valid=0
    for iz in range(nz):
      for iy in range(ny):
       for ix in range(nx):
        if original[0,iz,iy,ix,3]==0:continue
        p=Vector(lo+(hi-lo)*np.array([ix/(nx-1),iy/(ny-1),iz/(nz-1)]));radiances=[]
        for direction in directions:
            hit,n,face,_=bvh.ray_cast(p,direction,30)
            if hit is None:radiances.append(np.zeros(3));continue
            if n.dot(direction)>0:n=-n
            ck=(*[round(x/.06)for x in hit],*[round(x/.12)for x in n],face)
            value=cache.get(ck)
            if value is None:
                value=second_radiance(hit,n,albedos[face],bvh,albedos,openings,direct_cache)
                cache[ck]=value
            radiances.append(value)
        data[:,iz,iy,ix,:3]=basis.T@np.array(radiances);valid+=1
      print(json.dumps({'room':key,'zSlice':iz+1,'zSlices':nz,'surfaceSamples':len(cache),'elapsedSeconds':round(time.monotonic()-start,2)}),flush=True)
    assert np.isfinite(data).all()
    assert valid==base['validProbes']
    assert (data[0,:,:,:,:3]>=0).all()
    assert (data[0,:,:,:,:3]<=math.pi*.9*.9*SKY+1e-5).all(), 'Second reflection cannot create energy'
    assert hashlib.sha256(glb.read_bytes()).hexdigest()==base['sourceSHA256']
    assert hashlib.sha256(source.read_bytes()).hexdigest()==base['blendSHA256']
    half=positive_half_sh(data)
    result={k:base[k]for k in ['bounds','size','validProbes','sourceGLB','sourceSHA256','sourceBlend','blendSHA256','openings']}
    second_mean=np.mean(data[0,:,:,:,:3][original[0,:,:,:,3]>0],axis=0)
    first_mean=np.mean(original[0,:,:,:,:3][original[0,:,:,:,3]>0],axis=0)
    result.update({'samples':SAMPLES,'surfaceSamples':SURFACE_SAMPLES,'bounceOrder':2,'skyOnly':True,
      'model':'second Lambertian sky reflection only; opaque BVH paths; no solar, fixture or direct sky term',
      'uniqueSurfaceSamples':len(cache),'uniqueDirectSamples':len(direct_cache),'seconds':round(time.monotonic()-start,3),
      'meanFirstCoefficient':first_mean.tolist(),'meanSecondCoefficient':second_mean.tolist(),
      'data':base64.b64encode(half.tobytes()).decode()})
    print(json.dumps({'room':key,'validProbes':valid,'bytes':half.nbytes,'seconds':result['seconds'],'meanFirstCoefficient':result['meanFirstCoefficient'],'meanSecondCoefficient':result['meanSecondCoefficient']}),flush=True)
    return result

if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--asset',choices=[*FILES,'all'],default='all');args=parser.parse_args()
    defs=definitions();base=json.loads((ROOT/'web/src/v2/room-bounce-data.js').read_text().split('export const ROOM_BOUNCE_DATA = ',1)[1].rsplit(';',1)[0]);existing={}
    if OUT.exists():existing=json.loads(OUT.read_text().split('export const ROOM_SECOND_BOUNCE_DATA = ',1)[1].rsplit(';',1)[0])
    for asset in FILES if args.asset=='all'else[args.asset]:
        rel,pub=FILES[asset];source=ROOT/'assets/src/v2'/rel;glb=ROOT/'web/public/assets/v2'/pub
        bpy.ops.wm.open_mainfile(filepath=str(source));bvh,colors,_=geometry()
        keys=[k for k in base if k.startswith('lanchuan-freedom')]if asset=='lanchuan'else[asset]
        for key in keys:existing[key]=bake(key,defs[key],base[key],bvh,colors,source,glb)
    OUT.write_text('// Generated by tools/blender/v2_room_second_bounce.py. Second sky bounce only; source assets unchanged.\nexport const ROOM_SECOND_BOUNCE_DATA = '+json.dumps(existing,separators=(',',':'))+';\n')
