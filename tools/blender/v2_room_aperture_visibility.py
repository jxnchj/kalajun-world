"""Bake opaque geometry visibility of each real room aperture.
This is direct diffuse SKY visibility, not another bounce or ambient brightness.
Use existing probe positions and pack into unused directional-slab alpha
at runtime; irradiance RGB, constant alpha, GPU size and four samples stay intact.
"""
import base64, hashlib, json, math
import bpy
import numpy as np
from mathutils import Vector
from v2_room_bounce import ROOT, FILES, geometry

OUT=ROOT/'web/src/v2/room-aperture-data.js'

def aperture_points(opening):
    p=Vector(opening['center']);n=Vector(opening['normal']);crown=opening['kind']=='roof-crown'
    u=Vector((1,0,0))if crown else Vector((0,1,0)).cross(n).normalized();v=n.cross(u).normalized()
    if crown:
        # Equal-area concentric samples, with no centre crossbar bias.
        return [p+(u*math.cos((i+.5)*math.pi*(3-math.sqrt(5)))+v*math.sin((i+.5)*math.pi*(3-math.sqrt(5))))*opening['radius']*math.sqrt((i+.5)/32)for i in range(32)]
    return [p+u*opening['width']*((i+.5)/6-.5)+v*opening['height']*((j+.5)/6-.5)for j in range(6)for i in range(6)]

def aperture_visibility(point,opening,bvh):
    """Fraction of aperture solid angle unobstructed by authored opaque meshes.
    Pane transmission is intentionally absent: runtime aperture already applies it.
    The BVH is tested up to the plane (with 2mm endpoint tolerance); no material
    reflectance/sky colour/normal cosine enters this visibility-only transfer.
    """
    normal=Vector(opening['normal']);total=visible=0.
    for target in aperture_points(opening):
        delta=target-point;distance=delta.length
        if distance<.003:continue
        direction=delta/distance;weight=max(0,normal.dot(direction))/(distance*distance)
        if weight<=0:continue
        total+=weight
        if bvh.ray_cast(point,direction,max(.001,distance-.002))[0]is None:visible+=weight
    return visible/total if total else 0.

def bake(key,base,bvh):
    nx,ny,nz=base['size'];n=nx*ny*nz
    raw=np.frombuffer(base64.b64decode(base['data']),dtype='<f2').reshape(4,nz,ny,nx,4)
    result=np.zeros((max(3,len(base["openings"])),nz,ny,nx),np.uint8);lo=np.array(base['bounds'][0]);hi=np.array(base['bounds'][1]);summary=[]
    for i,opening in enumerate(base['openings']):
        values=[]
        for z in range(nz):
          for y in range(ny):
            for x in range(nx):
                p=Vector(lo+(hi-lo)*np.array([x/(nx-1),y/(ny-1),z/(nz-1)]))
                value=aperture_visibility(p,opening,bvh);result[i,z,y,x]=round(255*value);values.append(value)
        summary.append({'opening':i,'meanVisibility':float(np.mean(values)),'occludedProbes':sum(v<.95 for v in values),'fullyBlockedProbes':sum(v<.001 for v in values),'maxVisibility':max(values)})
    item={k:base[k]for k in ['bounds','size','validProbes','sourceGLB','sourceSHA256','sourceBlend','blendSHA256','openings']}
    item.update({'encoding':'u8-opening-slabs','apertureSamples':36,'crownSamples':32,'summary':summary,'data':base64.b64encode(result.tobytes()).decode()})
    print(json.dumps({'room':key,'rawBytes':result.nbytes,'summary':summary}),flush=True)
    return item

if __name__=='__main__':
    fields=json.loads((ROOT/'web/src/v2/room-bounce-data.js').read_text().split('export const ROOM_BOUNCE_DATA = ',1)[1].rsplit(';',1)[0]);result={}
    for asset,(rel,pub)in FILES.items():
        source=ROOT/'assets/src/v2'/rel;glb=ROOT/'web/public/assets/v2'/pub
        bpy.ops.wm.open_mainfile(filepath=str(source));bvh,_,_=geometry()
        keys=[k for k in fields if k.startswith('lanchuan-')]if asset=='lanchuan'else[asset]
        for key in keys:
            base=fields[key]
            assert hashlib.sha256(source.read_bytes()).hexdigest()==base['blendSHA256']
            assert hashlib.sha256(glb.read_bytes()).hexdigest()==base['sourceSHA256']
            result[key]=bake(key,base,bvh)
    OUT.write_text('// Generated from unchanged opaque source meshes; diffuse aperture visibility only.\nexport const ROOM_APERTURE_DATA = '+json.dumps(result,separators=(',',':'))+';\n')
    (ROOT/'tools/reports/room-aperture-v25.json').write_text(json.dumps({k:{p:v for p,v in f.items()if p!='data'}for k,f in result.items()},indent=2)+'\n')
