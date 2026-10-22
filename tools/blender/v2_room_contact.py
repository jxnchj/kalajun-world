"""Bake missing near-floor ambient occlusion from unchanged authored room geometry.
A fine sample divided by the same integral at its receiving triangle's vertices
adds only missing contact detail. Existing vertex AO/sky, direct sun and lamps
are retained. No source Blend/GLB or light colours are changed.
"""
import argparse,base64,hashlib,json,math,time
from pathlib import Path
import bpy
import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree
from v2_room_bounce import ROOT,FILES,definitions,material_reflectance

OUT=ROOT/'web/src/v2/room-contact-data.js'
STEP=.025
SAMPLES=64
RADIUS=.55
HEIGHT_RANGE=[-.10,.25]
DIRECTIONS=[Vector((math.sqrt((i+.5)/SAMPLES)*math.cos(i*math.pi*(3-math.sqrt(5))),
                    math.sqrt(1-(i+.5)/SAMPLES),
                    math.sqrt((i+.5)/SAMPLES)*math.sin(i*math.pi*(3-math.sqrt(5)))))for i in range(SAMPLES)]

def visibility(point,bvh):
    start=point+Vector((0,.0025,0));occlusion=0.
    for direction in DIRECTIONS:
        hit,_,_,distance=bvh.ray_cast(start,direction,RADIUS)
        if hit is not None:occlusion+=(1-distance/RADIUS)**2
    return max(.02,1-occlusion/SAMPLES)

def barycentric(p,a,b,c):
    v0=b-a;v1=c-a;v2=p-a
    d00=v0.dot(v0);d01=v0.dot(v1);d11=v1.dot(v1);d20=v2.dot(v0);d21=v2.dot(v1)
    denominator=d00*d11-d01*d01
    if abs(denominator)<1e-16:return(1.,0.,0.)
    v=(d11*d20-d01*d21)/denominator;w=(d00*d21-d01*d20)/denominator
    return(1-v-w,v,w)

def geometry():
    transparent={m.name:material_reflectance(m)[1]for m in bpy.data.materials}
    vertices=[];triangles=[];names=[]
    bpy.context.view_layer.update()
    for obj in bpy.context.scene.objects:
        if obj.type!='MESH'or obj.name.startswith('preview_'):continue
        offset=len(vertices)
        for vertex in obj.data.vertices:
            p=obj.matrix_world@vertex.co;vertices.append(Vector((p.x,p.z,-p.y)))
        obj.data.calc_loop_triangles()
        for triangle in obj.data.loop_triangles:
            material=obj.data.materials[triangle.material_index]if obj.data.materials else None
            if material and transparent[material.name]:continue
            triangles.append(tuple(offset+i for i in triangle.vertices));names.append(obj.name)
    return vertices,triangles,names,BVHTree.FromPolygons(vertices,triangles,all_triangles=True)

def encode(values):
    # Pairs of [run length, byte value]. Lossless RG8, no browser decoder package.
    flat=values.reshape(-1);out=bytearray();i=0
    while i<len(flat):
        end=i+1
        while end<len(flat)and flat[end]==flat[i]and end-i<255:end+=1
        out.extend([end-i,int(flat[i])]);i=end
    raw=flat.tobytes()
    return('run8' if len(out)<len(raw)else'raw8',base64.b64encode(out if len(out)<len(raw)else raw).decode())

def bake(key,definition,source,glb,geometry_data):
    started=time.monotonic();vertices,triangles,names,bvh=geometry_data;floor=definition['floor']
    if floor['shape']=='circle':
        r=floor['radius'];bounds=[[-r,-r],[r,r]]
    else:bounds=[[floor['x0'],floor['z0']],[floor['x1'],floor['z1']]]
    lo,hi=np.array(bounds[0]),np.array(bounds[1]);size=np.ceil((hi-lo)/STEP).astype(int)+1;nx,nz=map(int,size)
    receivers=[];receiver_names=[]
    for indices,name in zip(triangles,names):
        points=[vertices[i]for i in indices]
        if min(p.y for p in points)<floor['y']-.025 or max(p.y for p in points)>floor['y']+.085:continue
        normal=(points[1]-points[0]).cross(points[2]-points[0])
        if normal.length<1e-10 or normal.normalized().y<.65:continue
        if max(p.x for p in points)<lo[0]or min(p.x for p in points)>hi[0]or max(p.z for p in points)<lo[1]or min(p.z for p in points)>hi[1]:continue
        receivers.append(indices);receiver_names.append(name)
    receiver_bvh=BVHTree.FromPolygons(vertices,receivers,all_triangles=True)
    coarse={};data=np.zeros((nz,nx,2),np.uint8);data[:,:,0]=255;min_ratio=1;valid=0;affected=0;sample_records=[]
    for iz in range(nz):
        z=lo[1]+(hi[1]-lo[1])*iz/(nz-1)
        for ix in range(nx):
            x=lo[0]+(hi[0]-lo[0])*ix/(nx-1)
            if floor['shape']=='circle'and x*x+z*z>floor['radius']**2:continue
            hit,normal,face,_=receiver_bvh.ray_cast(Vector((x,floor['y']+.10,z)),Vector((0,-1,0)),.15)
            if hit is None:continue
            ids=receivers[face];values=[]
            for index in ids:
                if index not in coarse:coarse[index]=visibility(vertices[index],bvh)
                values.append(coarse[index])
            weights=barycentric(hit,*[vertices[i]for i in ids]);coarse_value=sum(w*v for w,v in zip(weights,values));dense=visibility(hit,bvh)
            ratio=min(1,max(.20,dense/max(.02,coarse_value)))
            data[iz,ix,0]=round(ratio*255)
            data[iz,ix,1]=max(1,min(255,round((hit.y-HEIGHT_RANGE[0])/(HEIGHT_RANGE[1]-HEIGHT_RANGE[0])*255)))
            min_ratio=min(min_ratio,ratio);valid+=1;affected+=ratio<.95
            if ratio<.65 and len(sample_records)<12:sample_records.append({'x':x,'z':z,'height':hit.y,'ratio':ratio,'fineVisibility':dense,'coarseVisibility':coarse_value,'receiver':receiver_names[face]})
    encoding,encoded=encode(data);output={'bounds':bounds,'size':[nx,nz],'heightRange':HEIGHT_RANGE,'spacing':STEP,'samples':SAMPLES,'radius':RADIUS,'encoding':encoding,'data':encoded,
      'sourceBlend':str(source.relative_to(ROOT)),'blendSHA256':hashlib.sha256(source.read_bytes()).hexdigest(),
      'sourceGLB':str(glb.relative_to(ROOT/'web/public')),'sourceSHA256':hashlib.sha256(glb.read_bytes()).hexdigest(),
      'validTexels':valid,'contactTexels':affected,'minimumCorrection':min_ratio,'receiverTriangles':len(receivers),'representativeSamples':sample_records,
      'model':'fine/coarse short-radius cosine-weighted visibility, capped to never brighten; geometry and original AO unchanged'}
    print(json.dumps({'room':key,'size':[nx,nz],'rawBytes':data.nbytes,'encodedBytes':len(base64.b64decode(encoded)),'valid':valid,'contact':affected,'minCorrection':min_ratio,'seconds':round(time.monotonic()-started,2),'samples':sample_records[:3]}),flush=True)
    return output

if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--asset',choices=[*FILES,'all'],default='all');args=parser.parse_args()
    definitions=definitions();existing={}
    if OUT.exists():existing=json.loads(OUT.read_text().split('export const ROOM_CONTACT_DATA = ',1)[1].rsplit(';',1)[0])
    for asset in FILES if args.asset=='all'else[args.asset]:
        rel,pub=FILES[asset];source=ROOT/'assets/src/v2'/rel;glb=ROOT/'web/public/assets/v2'/pub
        bpy.ops.wm.open_mainfile(filepath=str(source));geometry_data=geometry()
        keys=[k for k in definitions if k.startswith('lanchuan-freedom')]if asset=='lanchuan'else[asset]
        for key in keys:existing[key]=bake(key,definitions[key],source,glb,geometry_data)
    OUT.write_text('// Static contact correction from unchanged room geometry; no light is baked into colour.\nexport const ROOM_CONTACT_DATA = '+json.dumps(existing,separators=(',',':'))+';\n')
