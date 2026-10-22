"""One Lambertian solar bounce through authored apertures in existing source rooms.
Does not alter Blend/GLB/sky bake. Unit incoming directional irradiance, RGB
material albedo, first-band cosine-convolved SH. Direction interpolation is a
low-frequency transport approximation, not a direct sun lightmap/full GI.
"""
import argparse, base64, hashlib, json, math, time
from pathlib import Path
import bpy
import numpy as np
from mathutils import Vector
from v2_room_bounce import ROOT, FILES, definitions, geometry, SAMPLES

OUT=ROOT/'web/src/v2/room-transport-data.js'
AZIMUTHS=16
ELEVATIONS=[0,15,35,60,85]

def directions():
    result=[]
    for elevation in ELEVATIONS:
        a=math.radians(elevation)
        for j in range(AZIMUTHS):
            p=j*2*math.pi/AZIMUTHS
            result.append(Vector((math.cos(a)*math.sin(p),math.sin(a),math.cos(a)*math.cos(p))))
    result.append(Vector((0,1,0)))
    return result

def aperture_path(start,direction,openings):
    """A ray must exit through this room's declared aperture, never a bathroom."""
    result=0.
    for o in openings:
        n=Vector(o['normal']);den=n.dot(direction)
        if den<=1e-7:continue
        t=(Vector(o['center'])-start).dot(n)/den
        if t<=.001:continue
        d=start+direction*t-Vector(o['center'])
        if o['kind']=='roof-crown':
            inside=d.length_squared<o['radius']**2
        else:
            u=Vector((0,1,0)).cross(n).normalized();v=n.cross(u)
            inside=abs(d.dot(u))<o['width']*.5 and abs(d.dot(v))<o['height']*.5
        if inside:result=max(result,o.get('skyWeight',1.))
    return result

def solar_irradiance(point,normal,direction,openings,bvh):
    cosine=max(0,normal.dot(direction))
    if cosine<=0:return 0.
    start=point+normal*.012
    aperture=aperture_path(start,direction,openings)
    if aperture<=0:return 0.
    # Includes actual frames, walls, furniture, roof and the bathroom partitions.
    if bvh.ray_cast(start,direction,30)[0]is not None:return 0.
    return cosine*aperture

def encode_rle(half):
    values=half.astype('<f2').view('<u2').reshape(-1).copy();values[values==32768]=0
    chunks=[];i=0
    while i<len(values):
        zero=values[i]==0;j=i+1
        while j<len(values)and(values[j]==0)==zero and j-i<32767:j+=1
        chunks.append(np.array([(j-i)|(0 if zero else 32768)],dtype='<u2').tobytes())
        if not zero:chunks.append(values[i:j].tobytes())
        i=j
    return base64.b64encode(b''.join(chunks)).decode()

def bake(key,a,field,bvh,albedos,source,glb):
    started=time.monotonic();nx,ny,nz=field['size'];count=nx*ny*nz
    old=np.frombuffer(base64.b64decode(field['data']),dtype='<f2').reshape(4,nz,ny,nx,4)
    valid=old[0,:,:,:,3].reshape(-1)>0
    dirs=[]
    for k in range(SAMPLES):
        y=1-2*(k+.5)/SAMPLES;r=math.sqrt(1-y*y);phi=k*math.pi*(3-math.sqrt(5))
        dirs.append(Vector((r*math.cos(phi),y,r*math.sin(phi))))
    # Trace the unchanged probe->surface segments once; all 81 solar directions
    # then reuse these exact hit locations/materials, rather than rebaking rays.
    hits=[];rays=[];cache={};lo=np.array(field['bounds'][0]);hi=np.array(field['bounds'][1])
    for iz in range(nz):
      for iy in range(ny):
       for ix in range(nx):
        index=(iz*ny+iy)*nx+ix
        if not valid[index]:continue
        p=Vector(lo+(hi-lo)*np.array([ix/(nx-1),iy/(ny-1),iz/(nz-1)]))
        for ray,d in enumerate(dirs):
            hit,n,face,dist=bvh.ray_cast(p,d,30)
            if hit is None:continue
            if n.dot(d)>0:n=-n
            ck=(*[round(x/.02)for x in hit],*[round(x/.02)for x in n],face)
            h=cache.get(ck)
            if h is None:h=len(hits);cache[ck]=h;hits.append((hit,n,albedos[face]))
            rays.append((index,ray,h))
    rays=np.array(rays,dtype=np.int32);rgb=np.array([hit[2]for hit in hits]);basis=np.array([[math.pi,*[2*math.pi*x for x in d]]for d in dirs])/SAMPLES
    tables=[];maxes=[];nonzero=[]
    for number,sun in enumerate(directions()):
        visibility=np.array([solar_irradiance(p,n,sun,a['openings'],bvh)for p,n,_ in hits])
        radiance=rgb*visibility[:,None]/math.pi
        result=np.zeros((4,count,3),dtype=np.float32)
        for band in range(4):np.add.at(result[band],rays[:,0],radiance[rays[:,2]]*basis[rays[:,1],band,None])
        assert np.isfinite(result).all()
        tables.append(encode_rle(result));maxes.append(float(np.abs(result).max()));nonzero.append(int(np.count_nonzero(visibility)))
    output={k:field[k]for k in ['bounds','size','validProbes','sourceGLB','sourceSHA256','sourceBlend','blendSHA256','openings']}
    assert hashlib.sha256(glb.read_bytes()).hexdigest()==field['sourceSHA256'],'Sky field source GLB changed'
    assert hashlib.sha256(source.read_bytes()).hexdigest()==field['blendSHA256'],'Sky field source Blend changed'
    output.update({'samples':SAMPLES,'azimuths':AZIMUTHS,'elevations':ELEVATIONS,'zenithIndex':len(tables)-1,'encoding':'zero-run-f16-rgb-sh4-v1','directions':tables,
      'directionMax':maxes,'litSurfaceSamples':nonzero,'uniqueSurfaceSamples':len(hits),'calibration':'unit directional irradiance; Lambert albedo/pi; sky and direct sun excluded'})
    print(json.dumps({'room':key,'directions':len(tables),'surfaceSamples':len(hits),'rleBytes':sum(len(base64.b64decode(d))for d in tables),'rawBytes':81*count*4*3*2,'maxCoefficient':max(maxes),'seconds':round(time.monotonic()-started,2)}),flush=True)
    return output

if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--asset',choices=[*FILES,'all'],default='all');args=parser.parse_args()
    defs=definitions();sky=json.loads((ROOT/'web/src/v2/room-bounce-data.js').read_text().split('export const ROOM_BOUNCE_DATA = ',1)[1].rsplit(';',1)[0]);existing={}
    if OUT.exists():existing=json.loads(OUT.read_text().split('export const ROOM_TRANSPORT_DATA = ',1)[1].rsplit(';',1)[0])
    for asset in FILES if args.asset=='all'else[args.asset]:
        rel,pub=FILES[asset];source=ROOT/'assets/src/v2'/rel;glb=ROOT/'web/public/assets/v2'/pub
        bpy.ops.wm.open_mainfile(filepath=str(source));bvh,colors,_=geometry()
        keys=[k for k in sky if k.startswith('lanchuan-freedom')]if asset=='lanchuan'else[asset]
        for key in keys:existing[key]=bake(key,defs[key],sky[key],bvh,colors,source,glb)
    OUT.write_text('// Generated static one-bounce solar transfer. Existing sky data and source assets unchanged.\nexport const ROOM_TRANSPORT_DATA = '+json.dumps(existing,separators=(',',':'))+';\n')
