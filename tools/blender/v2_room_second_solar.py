"""Bake the second diffuse SOLAR reflection, separate from the unchanged first.
Probe -> surface A -> surface B -> authored aperture -> sun. All finite segments
use the source Blend BVH. Escape rays contribute zero, so direct sun/first bounce
are not counted twice. Runtime reuses the existing SH volume and sun direction grid.
"""
import argparse,base64,hashlib,json,math,time
import bpy
import numpy as np
from mathutils import Vector
from v2_room_bounce import ROOT,FILES,definitions,geometry,SAMPLES
from v2_room_transport import directions,solar_irradiance,encode_rle,AZIMUTHS,ELEVATIONS
from v2_room_second_bounce import cosine_directions,positive_half_sh,SURFACE_SAMPLES

OUT=ROOT/'web/src/v2/room-second-solar-data.js'

def second_hits(point,normal,bvh,samples=SURFACE_SAMPLES):
    for direction in cosine_directions(normal,samples):
        hit,n,face,_=bvh.ray_cast(point+normal*.012,direction,30)
        if hit is not None:
            if n.dot(direction)>0:n=-n
            yield hit,n,face

def second_solar_radiance(point,normal,reflectance,bvh,albedos,openings,sun,samples=SURFACE_SAMPLES):
    value=np.zeros(3)
    for hit,n,face in second_hits(point,normal,bvh,samples):
        value+=albedos[face]*solar_irradiance(hit,n,sun,openings,bvh)/math.pi
    return reflectance*value/samples

def solar_many(points,normals,sun,openings,bvh):
    """Same aperture/cosine/occlusion as solar_irradiance; batched rejection only."""
    direction=np.array(sun);cosines=np.maximum(0,normals@direction);starts=points+normals*.012
    aperture=np.zeros(len(points))
    for opening in openings:
        n=np.array(opening['normal'],dtype=float);den=n@direction
        if den<=1e-7:continue
        center=np.array(opening['center']);t=((center-starts)@n)/den
        delta=starts+t[:,None]*direction-center
        if opening['kind']=='roof-crown':inside=np.sum(delta*delta,axis=1)<opening['radius']**2
        else:
            u=np.cross([0,1,0],n);u/=np.linalg.norm(u);v=np.cross(n,u)
            inside=(np.abs(delta@u)<opening['width']*.5)&(np.abs(delta@v)<opening['height']*.5)
        aperture=np.maximum(aperture,np.where(inside&(t>.001),opening.get('skyWeight',1.),0))
    result=cosines*aperture
    for i in np.flatnonzero(result>0):
        if bvh.ray_cast(Vector(starts[i]),sun,30)[0]is not None:result[i]=0
    return result

def bake(key,definition,base,bvh,albedos,source,glb):
    start=time.monotonic();nx,ny,nz=base['size'];count=nx*ny*nz
    original=np.frombuffer(base64.b64decode(base['data']),dtype='<f2').reshape(4,count,4)
    lo=np.array(base['bounds'][0]);hi=np.array(base['bounds'][1]);probe_dirs=[]
    for i in range(SAMPLES):
        y=1-2*(i+.5)/SAMPLES;r=math.sqrt(1-y*y);phi=i*math.pi*(3-math.sqrt(5))
        probe_dirs.append(Vector((r*math.cos(phi),y,r*math.sin(phi))))
    basis=np.array([[math.pi,*[2*math.pi*x for x in d]]for d in probe_dirs])/SAMPLES
    first=[];first_cache={};probe_rays=[]
    for iz in range(nz):
      for iy in range(ny):
       for ix in range(nx):
        index=(iz*ny+iy)*nx+ix
        if original[0,index,3]==0:continue
        p=Vector(lo+(hi-lo)*np.array([ix/(nx-1),iy/(ny-1),iz/(nz-1)]))
        for ray,direction in enumerate(probe_dirs):
            hit,n,face,_=bvh.ray_cast(p,direction,30)
            if hit is None or not np.any(albedos[face]):continue
            if n.dot(direction)>0:n=-n
            ck=(*[round(x/.06)for x in hit],*[round(x/.12)for x in n],face)
            h=first_cache.get(ck)
            if h is None:h=len(first);first_cache[ck]=h;first.append((hit,n,albedos[face]))
            probe_rays.append((index,ray,h))
    second=[];second_cache={};edges=[]
    for a,(point,normal,rho)in enumerate(first):
        for hit,n,face in second_hits(point,normal,bvh):
            if not np.any(albedos[face]):continue
            ck=(*[round(x/.035)for x in hit],*[round(x/.10)for x in n],face)
            b=second_cache.get(ck)
            if b is None:b=len(second);second_cache[ck]=b;second.append((hit,n,albedos[face]))
            edges.append((a,b))
    first_rgb=np.array([h[2]for h in first]);points=np.array([tuple(h[0])for h in second]);normals=np.array([tuple(h[1])for h in second]);second_rgb=np.array([h[2]for h in second])
    edges=np.array(edges,dtype=np.int32);probe_rays=np.array(probe_rays,dtype=np.int32)
    print(json.dumps({'room':key,'firstHits':len(first),'secondHits':len(second),'edges':len(edges),'pathSeconds':round(time.monotonic()-start,3)}),flush=True)
    tables=[];maxes=[];means=[];lit=[]
    for number,sun in enumerate(directions()):
        irradiance=solar_many(points,normals,sun,definition['openings'],bvh)
        radiance=np.zeros((len(first),3));np.add.at(radiance,edges[:,0],second_rgb[edges[:,1]]*irradiance[edges[:,1],None])
        # Cosine-weighted hemisphere sampling contributes pi to irradiance,
        # cancelled by A's Lambert 1/pi. B retains its own Lambert 1/pi.
        radiance*=first_rgb/(math.pi*SURFACE_SAMPLES)
        result=np.zeros((4,count,4),np.float32);result[:,:,3]=original[:,:,3]
        for band in range(4):np.add.at(result[band,:,:3],probe_rays[:,0],radiance[probe_rays[:,2]]*basis[probe_rays[:,1],band,None])
        assert np.isfinite(result).all()
        assert np.all(result[0,:,:3]>=0)and np.all(result[0,:,:3]<=.9*.9+1e-5),'Passive reflectors cannot create energy'
        half=positive_half_sh(result.reshape(4,nz,ny,nx,4)).reshape(4,count,4)[:,:,:3]
        tables.append(encode_rle(half));maxes.append(float(np.abs(half).max()));means.append(np.mean(half[0][original[0,:,3]>0],axis=0).astype(float).tolist());lit.append(int(np.count_nonzero(irradiance)))
        if number%16==0:print(json.dumps({'room':key,'sunDirection':number,'seconds':round(time.monotonic()-start,2)}),flush=True)
    assert hashlib.sha256(glb.read_bytes()).hexdigest()==base['sourceSHA256']
    assert hashlib.sha256(source.read_bytes()).hexdigest()==base['blendSHA256']
    result={k:base[k]for k in ['bounds','size','validProbes','sourceGLB','sourceSHA256','sourceBlend','blendSHA256','openings']}
    result.update({'samples':SAMPLES,'surfaceSamples':SURFACE_SAMPLES,'bounceOrder':2,'azimuths':AZIMUTHS,'elevations':ELEVATIONS,'zenithIndex':len(tables)-1,'encoding':'zero-run-f16-rgb-sh4-v1',
      'directions':tables,'directionMax':maxes,'directionMean':means,'litSurfaceSamples':lit,'firstSurfaceSamples':len(first),'secondSurfaceSamples':len(second),'surfacePaths':len(edges),'seconds':round(time.monotonic()-start,3),
      'calibration':'unit directional irradiance; second Lambert reflection only; source opaque BVH; no sky, direct sun, first reflection or fixture term'})
    print(json.dumps({'room':key,'seconds':result['seconds'],'rleBytes':sum(len(base64.b64decode(d))for d in tables),'rawBytes':len(tables)*count*12*2,'maxCoefficient':max(maxes)}),flush=True)
    return result

if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--asset',choices=[*FILES,'all'],default='all');args=parser.parse_args()
    defs=definitions();base=json.loads((ROOT/'web/src/v2/room-bounce-data.js').read_text().split('export const ROOM_BOUNCE_DATA = ',1)[1].rsplit(';',1)[0]);existing={}
    folder=OUT.parent/'room-second-solar-data';folder.mkdir(exist_ok=True)
    for entry in folder.glob('*.js'):existing[entry.stem]=json.loads(entry.read_text().split('export default ',1)[1].rsplit(';',1)[0])
    for asset in FILES if args.asset=='all'else[args.asset]:
        rel,pub=FILES[asset];source=ROOT/'assets/src/v2'/rel;glb=ROOT/'web/public/assets/v2'/pub
        bpy.ops.wm.open_mainfile(filepath=str(source));bvh,colors,_=geometry()
        keys=[k for k in base if k.startswith('lanchuan-freedom')]if asset=='lanchuan'else[asset]
        for key in keys:existing[key]=bake(key,defs[key],base[key],bvh,colors,source,glb)
    for key,value in existing.items():(folder/(key+'.js')).write_text('// Generated source-geometry second solar reflection; loaded only for this room.\nexport default '+json.dumps(value,separators=(',',':'))+';\n')
    OUT.write_text('// Generated room-specific loaders; outdoor startup does not load solar tables.\nexport const ROOM_SECOND_SOLAR_LOADERS = Object.freeze({\n'+''.join('  '+json.dumps(key)+':()=>import("./room-second-solar-data/'+key+'.js").then(module=>module.default),\n'for key in existing)+'});\n')
