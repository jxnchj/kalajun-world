"""Deterministic PBR surface refinement of existing v2 room sources.
No shell/layout regeneration. Base colours contain no baked lighting.
"""
import math, struct, zlib, hashlib, json, random
from pathlib import Path
import bpy
import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree

VERSION = "interior-surfaces-1"
def png(path, a):
    a=np.uint8(np.clip(a,0,1)*255+.5);h,w,_=a.shape
    def chunk(t,b):return struct.pack(">I",len(b))+t+b+struct.pack(">I",zlib.crc32(t+b)&0xffffffff)
    path.write_bytes(b"\x89PNG\r\n\x1a\n"+chunk(b"IHDR",struct.pack(">IIBBBBB",w,h,8,2,0,0,0))+chunk(b"IDAT",zlib.compress(b"".join(b"\0"+row.tobytes()for row in a),6))+chunk(b"IEND",b""))

def field(x,y,seed,scale=1):
    rng=np.random.default_rng(seed);v=np.zeros_like(x)
    for i in range(9):
        a,b=rng.integers(1,8,2)*scale
        v+=np.sin(math.tau*(a*x+b*y)+rng.uniform(0,math.tau))/(i+3)
    return v/max(abs(v.min()),abs(v.max()))

def maps(color,rough,kind,seed):
    n=512 if kind in ("wood","cloth","pattern","wool") else 256
    y,x=np.mgrid[:n,:n]/n;broad=field(x,y,seed);fine=field(x,y,seed+1,13)
    if kind=="wood":
        # Thin irregular annual growth lines, not equally spaced dark stripes.
        # The integer-frequency fields tile while warping spacing along each board.
        phase=math.tau*(y*71+.55*np.sin(x*math.tau)+.34*broad)
        grain=np.sin(phase)+.28*np.sin(phase*2+.8*broad)
        pores=np.maximum(0,np.sin(phase*3+fine)-.80)
        height=.035*grain-.055*pores+.016*fine
        value=1+.045*broad+.018*grain-.048*pores
        rr=rough+.045*broad+.025*grain
        strength=.6
    elif kind in ("cloth","pattern","wool"):
        warp=np.sin(math.tau*(x*96+.045*broad));weft=np.sin(math.tau*(y*112+.055*broad))
        height=.20*warp+.20*weft+.055*fine+.04*broad
        value=1+.026*broad+.006*warp*weft
        rr=rough+.035*broad+.025*warp*weft
        strength=.60 if kind!="wool" else .75
    else:
        height=.07*fine+(.012 if kind=="plaster" else .04)*broad
        value=1+(.010 if kind=="plaster" else .025)*broad+.008*fine
        rr=rough+.045*broad+.025*fine
        strength=.65 if kind=="plaster" else .25
    rgb=np.stack([value*c for c in color],axis=-1)
    if kind=="pattern":
        # Existing diamond vocabulary, woven borders and stitch rows; original
        # design, not a claim to reproduce a particular household's craft.
        u=abs(((x*3+.5)%1)-.5);v=abs(((y*3+.5)%1)-.5)
        diamond=abs(u+v-.32)<.026
        edge=np.minimum.reduce([x,y,1-x,1-y])
        border=(edge<.028)|((edge>.052)&(edge<.060))
        rgb[diamond]=np.array([.64,.49,.29])*(1+.035*broad[diamond,None])
        rgb[border]=np.array([.19,.14,.105])*(1+.035*broad[border,None])
        stitch=(edge>.073)&(edge<.078)&(np.sin((x+y)*math.tau*80)>0)
        rgb[stitch]=(.62,.48,.31)
        height+=diamond*.05+border*.04
    if kind=="glaze":
        # Restrained brushed enamel; the darker lip is part of the fired colour.
        rim=(y>.52)&(y<.555)
        rgb[rim]=np.array([.21,.29,.27])*(1+.02*broad[rim,None])
    if kind=="metal":
        rgb*=np.clip(1-.10*np.maximum(0,broad),.88,1)[:,:,None]
        rr+=.08*np.maximum(0,broad)
    # Tangent-space normal, kept modest; derivative is per texture texel and
    # maps describe surface structure rather than light baked into the colour.
    dy,dx=np.gradient(height);normal=np.stack([-dx,-dy,np.ones_like(dx)],axis=-1)
    normal/=np.linalg.norm(normal,axis=2,keepdims=True)
    return {"albedo":np.clip(rgb,0,1),"normal":normal*.5+.5,
      "roughness":np.repeat(np.clip(rr,.12,.98)[:,:,None],3,axis=2)},strength

SURFACES={
 "v2_pastoral_wood":((.46,.33,.215),.68,"wood"),
 "v2_pastoral_pale":((.66,.53,.36),.70,"wood"),
 "v2_pastoral_lining":((.59,.51,.40),.80,"wood"),
 "v2_pastoral_linen":((.82,.80,.72),.94,"cloth"),
 "v2_pastoral_wool":((.68,.64,.54),.97,"wool"),
 "v2_pastoral_red":((.36,.13,.10),.95,"pattern"),
 "v2_pastoral_blue":((.16,.28,.28),.95,"pattern"),
 "v2_pastoral_gold":((.49,.36,.19),.94,"cloth"),
 "v2_pastoral_ceramic":((.78,.79,.70),.34,"glaze"),
 "v2_pastoral_brass":((.68,.55,.31),.43,"metal"),
 "v2_pastoral_clay":((.55,.49,.39),.92,"plaster"),
 "v2_oak":((.58,.46,.31),.65,"wood"),
 "v2_darkwood":((.31,.235,.16),.61,"wood"),
 "v2_linen":((.86,.85,.80),.94,"cloth"),
 "v2_taupe":((.55,.50,.43),.95,"cloth"),
 "v2_curtain":((.53,.51,.46),.96,"cloth"),
 "v2_paint":((.83,.79,.70),.92,"plaster"),
 "v2_stone":((.60,.59,.54),.80,"plaster"),
 "v2_ceramic":((.88,.87,.81),.28,"ceramic"),
}

def refine_material(m, directory):
    color,rough,kind=SURFACES[m.name];seed=int(hashlib.sha256(m.name.encode()).hexdigest()[:8],16)
    data,strength=maps(color,rough,kind,seed);nodes=m.node_tree.nodes;links=m.node_tree.links
    bsdf=next(n for n in nodes if n.type=="BSDF_PRINCIPLED")
    # Replace only our generated surface links, preserving metal, alpha,
    # emission and other authored controls on the existing material.
    for socket in ("Base Color","Normal","Roughness"):
        for link in list(bsdf.inputs[socket].links):links.remove(link)
    for n in list(nodes):
        if n.get("interiorSurfaceNode"):nodes.remove(n)
    weave=None
    if kind in ("cloth","pattern","wool"):
        coords=nodes.new("ShaderNodeTexCoord");coords["interiorSurfaceNode"]=True
        weave=nodes.new("ShaderNodeMapping");weave["interiorSurfaceNode"]=True
        weave.inputs["Scale"].default_value=(3,3,1)
        links.new(coords.outputs["UV"],weave.inputs["Vector"])
    for name,a in data.items():
        path=directory/(m.name+"-refined-"+name+".png");png(path,a)
        image=bpy.data.images.load(str(path),check_existing=True);image.reload()
        image.colorspace_settings.name="sRGB" if name=="albedo" else "Non-Color";image.pack()
        node=nodes.new("ShaderNodeTexImage");node.image=image;node["interiorSurfaceNode"]=True
        if weave and name!="albedo":links.new(weave.outputs["Vector"],node.inputs["Vector"])
        if name=="normal":
            normal=nodes.new("ShaderNodeNormalMap");normal["interiorSurfaceNode"]=True;normal.inputs["Strength"].default_value=strength
            links.new(node.outputs["Color"],normal.inputs["Color"]);links.new(normal.outputs["Normal"],bsdf.inputs["Normal"])
        else:links.new(node.outputs["Color"],bsdf.inputs["Base Color" if name=="albedo" else "Roughness"])
    m["surfaceRefinement"]=VERSION

def pillow(o):
    if o.get("surfaceRefinement")==VERSION:return False
    old=o.data;coords=np.array([tuple(v.co)for v in old.vertices])
    lo,hi=coords.min(axis=0),coords.max(axis=0);centre=(lo+hi)/2;half=(hi-lo)/2
    nx,ny=12,8;verts=[];faces=[];uvs=[]
    for side in (1,-1):
      for j in range(ny+1):
       t=j/ny*2-1
       for i in range(nx+1):
        s=i/nx*2-1
        x=s*(.94+.06*(1-t*t));y=t*(.94+.06*(1-s*s))
        puff=max(0,(1-s*s)*(1-t*t))**.55
        crease=.018*math.sin(17*s+3*t)*math.sin(11*t)*max(abs(s),abs(t))**4
        z=side*(.035+.965*puff)+crease
        verts.append(tuple(centre+half*np.array([x,y,z])));uvs.append((i/nx,j/ny))
    count=(nx+1)*(ny+1)
    for j in range(ny):
      for i in range(nx):
       a=j*(nx+1)+i;top=(a,a+1,a+nx+2,a+nx+1)
       faces.append(top);faces.append(tuple(v+count for v in reversed(top)))
    boundary=list(range(nx+1))+[j*(nx+1)+nx for j in range(1,ny+1)]+[ny*(nx+1)+i for i in range(nx-1,-1,-1)]+[j*(nx+1)for j in range(ny-1,0,-1)]
    for k,a in enumerate(boundary):
        b=boundary[(k+1)%len(boundary)];faces.append((a,a+count,b+count,b))
    # A tiny sewn piping in the same object/material, not a new draw call.
    offset=len(verts)
    for k,a in enumerate(boundary):
        p=np.array(verts[a]);p[2]=centre[2]
        direction=p-centre;direction[2]=0;direction/=np.linalg.norm(direction)
        for j in range(3):
            angle=math.tau*j/3;point=p+direction*.0018*math.cos(angle);point[2]+=.0018*math.sin(angle)
            verts.append(tuple(point));uvs.append((k/len(boundary),.5+j*.003))
    for k in range(len(boundary)):
      for j in range(3):
        a=offset+k*3+j;b=offset+((k+1)%len(boundary))*3+j
        faces.append((a,b,offset+((k+1)%len(boundary))*3+(j+1)%3,offset+k*3+(j+1)%3))
    mesh=bpy.data.meshes.new(old.name+"-sewn");mesh.from_pydata(verts,[],faces);mesh.update()
    for m in old.materials:mesh.materials.append(m)
    uv=mesh.uv_layers.new(name="UVMap")
    for poly in mesh.polygons:
        poly.use_smooth=True
        for li in poly.loop_indices:uv.data[li].uv=uvs[mesh.loops[li].vertex_index]
    o.data=mesh;o["surfaceRefinement"]=VERSION;o["designDetail"]="soft sewn pillow; existing object transform and footprint"
    if old.users==0:bpy.data.meshes.remove(old)
    return True

def contact_ao(targets):
    obstacles=[o for o in bpy.context.scene.objects if o.type=="MESH" and not o.name.startswith("preview_") and o.data.materials and all(m.name!="glass"for m in o.data.materials)]
    bpy.context.view_layer.update();vertices=[];faces=[]
    for o in obstacles:
        start=len(vertices);vertices +=[o.matrix_world@v.co for v in o.data.vertices]
        faces +=[tuple(start+i for i in p.vertices)for p in o.data.polygons]
    bvh=BVHTree.FromPolygons(vertices,faces,epsilon=0)
    rng=random.Random(17);directions=[]
    while len(directions)<32:
        v=Vector((rng.uniform(-1,1),rng.uniform(-1,1),rng.uniform(-1,1)))
        if .05<v.length<=1:directions.append(v.normalized())
    for o in targets:
        me=o.data;old=me.color_attributes.get("Color");fresh=old is None
        attr=old or me.color_attributes.new("Color","FLOAT_COLOR","POINT")
        normals=o.matrix_world.to_3x3().inverted().transposed()
        for i,v in enumerate(me.vertices):
            p=o.matrix_world@v.co;n=(normals@v.normal).normalized();occ=0;sky=0;sky_n=0
            for d in directions:
                d=d if d.dot(n)>0 else -d
                hit=bvh.ray_cast(p+n*.008,d,1.0)
                if hit[0]is not None:occ+=(1-hit[3])**2
                if fresh and d.z>=-.35:
                    sky_n+=1
                    if bvh.ray_cast(p+n*.008,d,40)[0]is None:sky+=1
            ao=max(.25,min(1,1-.88*occ/len(directions)))
            sv=sky/max(1,sky_n) if fresh else attr.data[i].color[2]
            attr.data[i].color=(ao,ao,sv,1)

def refine_scene(texture_dir):
    directory=Path(texture_dir);directory.mkdir(parents=True,exist_ok=True)
    changed=[];pillows=[]
    for m in bpy.data.materials:
        if m.name in SURFACES and m.users:refine_material(m,directory);changed.append(m.name)
    targets=[]
    for o in list(bpy.context.scene.objects):
        if o.type!="MESH" or o.name.startswith("preview_"):continue
        if "pillow"in o.name and (o.name.startswith("pastoral_")or o.name.startswith("freedom")):
            if pillow(o):pillows.append(o.name)
        if o.name.startswith(("pastoral_","freedom")):
            targets.append(o)
            if "bowl"in o.name or "kettle"in o.name or "_tea_"in o.name:
                for face in o.data.polygons:
                    if len(face.vertices)==4:face.use_smooth=True
    contact_ao(targets)
    bpy.context.scene["surfaceRefinement"]=VERSION
    bpy.context.scene["surfaceLighting"]="1m contact AO on refined interior meshes; original sky visibility retained; no direct light or GI baked into base colour"
    result={"materials":changed,"pillows":pillows,"contactMeshes":len(targets),"version":VERSION}
    print(json.dumps(result),flush=True);return result
