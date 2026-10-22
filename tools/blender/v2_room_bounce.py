"""Bake low-frequency, one-diffuse-bounce room skylight from existing source meshes.
Read-only to Blend/GLB. Writes compact half-float SH irradiance data, not lightmaps
or a claim of measured/full GI. No sun, lamps, second bounces or sky direct term.
tools/.bpy/bin/python tools/blender/v2_room_bounce.py --asset house_a
"""
import argparse, base64, hashlib, json, math, subprocess, time
from pathlib import Path
import bpy
import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree

ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/"web/src/v2/room-bounce-data.js"
SAMPLES=96
SKY=np.array([.82,.87,.90])
FILES={"house_a":("pastoral/house_a-lived.blend","house_a_lived.glb"),
       "yurt":("pastoral/yurt-lived.blend","yurt_lived.glb"),
       "lanchuan":("settlements/lanchuan-freedom.blend","gh_lanchuan_rooms.glb")}

def definitions():
    code="""import {SETTLEMENT_ASSETS}from'./src/v2/settlement-assets.js';
import {SettlementRuntime}from'./src/v2/settlements.js';
const w={entities:[{id:'guest',assetId:'gh_lanchuan'}],surface:{heightAt:()=>0,buildingPose:()=>({x:0,y:0,z:0,rot:0,scale:{x:1,y:1,z:1}})}};
const r=new SettlementRuntime(w);const result={...SETTLEMENT_ASSETS};
for(const room of r.guestRooms)result[room.roomId]=room.asset;
r.dispose();console.log(JSON.stringify(result));"""
    return json.loads(subprocess.check_output(["node","--input-type=module","-e",code],cwd=ROOT/"web",text=True))

def material_reflectance(m):
    if not m or not m.use_nodes:return np.array([.3,.3,.3]),False
    b=next((n for n in m.node_tree.nodes if n.type=="BSDF_PRINCIPLED"),None)
    if not b:return np.array([.3,.3,.3]),False
    alpha=b.inputs["Alpha"].default_value
    transmission=b.inputs["Transmission Weight"].default_value
    if alpha<.85 or transmission>.5 or m.name=="glass":return np.zeros(3),True
    color=np.array(b.inputs["Base Color"].default_value[:3])
    for link in b.inputs["Base Color"].links:
        n=link.from_node
        if n.type=="TEX_IMAGE" and n.image:
            im=n.image;pixels=np.array(im.pixels[:],dtype=np.float32).reshape(-1,4)[::16,:3]
            # Image.pixels for packed PNG is stored sRGB, verified against source
            # pixel values; material socket constants already use linear values.
            if im.colorspace_settings.name=="sRGB":
                pixels=np.where(pixels<=.04045,pixels/12.92,((pixels+.055)/1.055)**2.4)
            color=pixels.mean(axis=0)
    metal=b.inputs["Metallic"].default_value
    return np.clip(color*(1-metal),0,.9),False

def geometry():
    colors={m.name:material_reflectance(m)for m in bpy.data.materials}
    vertices=[];faces=[];albedos=[];names=[]
    bpy.context.view_layer.update()
    for o in bpy.context.scene.objects:
        if o.type!="MESH" or o.name.startswith("preview_"):continue
        start=len(vertices)
        for v in o.data.vertices:
            p=o.matrix_world@v.co;vertices.append(Vector((p.x,p.z,-p.y)))
        for f in o.data.polygons:
            m=o.data.materials[f.material_index]if o.data.materials else None
            color,transparent=colors.get(m.name,(np.array([.3,.3,.3]),False))if m else (np.array([.3,.3,.3]),False)
            if transparent:continue
            # BVHTree polygon index follows this list even when internally
            # triangulated, so an exact hit retains its source material.
            faces.append(tuple(start+i for i in f.vertices));albedos.append(color);names.append(o.name)
    return BVHTree.FromPolygons(vertices,faces,epsilon=0),np.array(albedos),names

def ceiling(a,x,z):
    if a.get("sourceAsset")=="house_a":return 2.44+(2.5-abs(z))*math.tan(math.radians(24))
    if a.get("sourceAsset")=="yurt":
        t=max(0,min(1,(3.424-math.hypot(x,z))/(3.424-.62)))
        return 1.62+(3.25-1.62)*(t+.18*math.sin(math.pi*t))-.012
    return a.get("height",2.70)

def inside(a,p):
    x,y,z=p;f=a["floor"]
    if f["shape"]=="circle" and math.hypot(x,z)>f["radius"]-.09:return False
    if y>ceiling(a,x,z)-.055:return False
    b=a.get("excludedBounds")
    if b and b[0]-.06<x<b[1]+.06 and b[2]-.06<z<b[3]+.06:return False
    return True

def aperture_samples(a):
    result=[]
    for opening in a["openings"]:
        p=Vector(opening["center"]);n=Vector(opening["normal"])
        crown=opening["kind"]=="roof-crown"
        u=Vector((1,0,0))if crown else Vector((0,1,0)).cross(n).normalized()
        v=n.cross(u).normalized()
        if crown:
            radius=opening["radius"]
            area=math.pi*radius*radius*.42
            points=[p+(u*math.cos((i+.5)*math.pi/2)+v*math.sin((i+.5)*math.pi/2))*radius*.65 for i in range(4)]
        else:
            area=opening["width"]*opening["height"]
            # Quadrants avoid the centre crossbar; all rays still test actual
            # mullions, furniture and partitions instead of treating panes open.
            points=[p+u*opening["width"]*sx+v*opening["height"]*sy for sx in (-.28,.28)for sy in (-.28,.28)]
        result.append((points,n,area*opening.get("skyWeight",1)/4))
    return result

def irradiance_at(point,normal,openings,bvh):
    start=point+normal*.012;value=0.
    for points,n,area in openings:
        for target in points:
            delta=target-start;d2=delta.length_squared;distance=math.sqrt(d2)
            if distance<.025:continue
            direction=delta/distance
            cosine=max(0,normal.dot(direction))*max(0,n.dot(direction))
            if cosine<=0:continue
            if bvh.ray_cast(start,direction,max(.001,distance-.024))[0]is not None:continue
            value+=area*cosine/max(d2,.0025)
    return min(math.pi,value)

def bake(key,a,bvh,albedos,source,glb,validity=None):
    started=time.monotonic();f=a["floor"]
    if f["shape"]=="circle":
        r=f["radius"]-.10;lo=np.array([-r,f["y"]+.11,-r]);hi=np.array([r,3.25-.13,r]);dims=[9,5,9]
    else:
        lo=np.array([f["x0"]+.10,f["y"]+.11,f["z0"]+.10])
        hi=np.array([f["x1"]-.10,ceiling(a,(f["x0"]+f["x1"])/2,0)-.13,f["z1"]-.10])
        dims=[9,5,7]if a.get("sourceAsset")=="house_a"else[9,5,9]
    nx,ny,nz=dims;data=np.zeros((4,nz,ny,nx,4),np.float32)
    # External furnishing variants leave the original indoor receiving volume
    # unchanged. Freeze its validity instead of letting exterior hit normals
    # reclassify a room probe as inside solid furniture. Sampling stays identical.
    valid_grid=None
    if validity is not None:
        assert validity["size"]==dims and validity["bounds"]==[lo.tolist(),hi.tolist()]
        valid_grid=np.frombuffer(base64.b64decode(validity["data"]),dtype="<f2").reshape(4,nz,ny,nx,4)[0,:,:,:,3]
    dirs=[]
    for k in range(SAMPLES):
        y=1-2*(k+.5)/SAMPLES;r=math.sqrt(1-y*y);phi=k*math.pi*(3-math.sqrt(5))
        dirs.append(Vector((r*math.cos(phi),y,r*math.sin(phi))))
    openings=aperture_samples(a);valid=0;cache={}
    for iz in range(nz):
      for iy in range(ny):
       for ix in range(nx):
        p=lo+(hi-lo)*np.array([ix/(nx-1),iy/(ny-1),iz/(nz-1)])
        if not inside(a,p) or (valid_grid is not None and not valid_grid[iz,iy,ix]):continue
        point=Vector(p);radiances=[];back=0;distances=[]
        for direction in dirs:
            hit,normal,index,distance=bvh.ray_cast(point,direction,30)
            if hit is None:radiances.append(np.zeros(3));continue
            distances.append(distance)
            if normal.dot(direction)>0:normal=-normal;back+=1
            # Cache only for this room, so different openings never share flux.
            ck=(*[round(x/.08)for x in hit],*[round(x/.2)for x in normal],index)
            e=cache.get(ck)
            if e is None:e=irradiance_at(hit,normal,openings,bvh);cache[ck]=e
            radiances.append(albedos[index]*SKY*(e/math.pi))
        # Reject probes enclosed by furniture; keep boundary-invalid probes at
        # zero alpha so filtered neighbours can renormalize without wall leaks.
        if valid_grid is None and back>SAMPLES*.82 and distances and np.median(distances)<1.2:continue
        rad=np.array(radiances);direction=np.array([tuple(d)for d in dirs])
        data[0,iz,iy,ix,:3]=math.pi*rad.mean(axis=0)
        for k in range(3):data[k+1,iz,iy,ix,:3]=2*math.pi*(rad*direction[:,k:k+1]).mean(axis=0)
        data[:,iz,iy,ix,3]=1;valid+=1
    assert valid>nx*ny*nz*.35,(key,valid,dims)
    assert np.isfinite(data).all()
    half=data.astype("<f2")
    result={"bounds":[lo.tolist(),hi.tolist()],"size":dims,"samples":SAMPLES,"validProbes":valid,
      "sourceGLB":str(glb.relative_to(ROOT/"web/public")),"sourceSHA256":hashlib.sha256(glb.read_bytes()).hexdigest(),
      "sourceBlend":str(source.relative_to(ROOT)),"blendSHA256":hashlib.sha256(source.read_bytes()).hexdigest(),
      "openings":a["openings"],"data":base64.b64encode(half.tobytes()).decode()}
    print(json.dumps({"field":key,"valid":valid,"total":nx*ny*nz,"bytes":half.nbytes,"maxIrradianceCoefficient":float(abs(data[:,:,:,:,:3]).max()),"seconds":round(time.monotonic()-started,2)}),flush=True)
    return result

if __name__=="__main__":
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument("--asset",choices=["house_a","yurt","lanchuan","all"],default="all")
    args=parser.parse_args();defs=definitions()
    existing={}
    if OUT.exists():existing=json.loads(OUT.read_text().split("export const ROOM_BOUNCE_DATA = ",1)[1].rsplit(";",1)[0])
    for asset in FILES if args.asset=="all" else [args.asset]:
        rel,pub=FILES[asset];source=ROOT/"assets/src/v2"/rel;glb=ROOT/"web/public/assets/v2"/pub
        bpy.ops.wm.open_mainfile(filepath=str(source));bvh,colors,names=geometry()
        keys=[k for k in defs if k.startswith("lanchuan-freedom")]if asset=="lanchuan"else[asset]
        for key in keys:existing[key]=bake(key,defs[key],bvh,colors,source,glb)
    OUT.write_text("// Generated by tools/blender/v2_room_bounce.py from existing opaque geometry.\\n// Half-float one-bounce skylight SH: 4 coefficient slabs; alpha is probe validity.\\n".replace("\\n","\n")+"export const ROOM_BOUNCE_DATA = "+json.dumps(existing,separators=(",",":"))+";\n")
