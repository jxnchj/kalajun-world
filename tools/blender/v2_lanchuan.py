"""Lanchuan room-family upgrade in its real existing guest-block shell.
Build: tools/.bpy/bin/python tools/blender/v2_lanchuan.py
Re-export hand-edited source: ... --export-existing
Optional Blender reference render: ... --preview
Original source and GLBs are never overwritten. Units: metres, Blender Z up.
"""
import argparse, json, math, os, random, struct, sys, zlib
from pathlib import Path
import bpy
import numpy as np
from mathutils import Vector
sys.path.insert(0,str(Path(__file__).resolve().parent))
import lib, guesthouses as gh, cabin

ROOT=Path(__file__).resolve().parents[2]
SRC=ROOT/"assets/src/v2/settlements"
TEX=SRC/"textures"
OUT=ROOT/"web/public/assets/v2/gh_lanchuan_rooms.glb"
BLEND=SRC/"lanchuan-freedom.blend"
for p in (SRC,TEX,OUT.parent): p.mkdir(parents=True,exist_ok=True)
parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument("--export-existing",action="store_true")
parser.add_argument("--preview",action="store_true")
parser.add_argument("--refine-surfaces",action="store_true",help="Refine current scene materials and sewn pillows, preserving existing layout")
args=parser.parse_args()
ROOMS=[]
ORIGINAL_ROOM=gh.room
ORIGINAL_MATS=gh.mats
ORIGINAL_MATERIAL=lib.material

REFERENCE={
 "url":"https://m.ctrip.com/webapp/hotel/album?hotelid=109634932&tab=0",
 "observedAt":"2026-10-19",
 "roomFamily":"自由者景观大床房｜落地窗正对雪山+户外露台+星级床品",
 "observed":["warm pale plaster","wood slat headboard","white duvet and pillows","taupe bed runner",
             "grey taupe full-height curtains","black bedside wall lamp","wood/rattan chairs",
             "rounded vanity entrance with round mirror and wood drawer basin cabinet"],
 "adaptation":["three right-hand bays use the same family template in the existing shell",
               "exact assignment of online room photos to those bays is unverified",
               "concealed shower, WC, wardrobe, dimensions and sockets are original functional design"],
 "notEvidence":"docs/guesthouses/lanchuan_room.jpg is an old render, not a reference photograph",
 "lighting":"geometry AO/sky visibility only; no sun or lamp light baked into albedo",
}

def png(path,pixels):
    pixels=np.clip(pixels*255,0,255).astype(np.uint8)
    h,w,_=pixels.shape
    def chunk(t,b): return struct.pack(">I",len(b))+t+b+struct.pack(">I",zlib.crc32(t+b)&0xffffffff)
    raw=b"".join(b"\x00"+pixels[j].tobytes() for j in range(h))
    path.write_bytes(b"\x89PNG\r\n\x1a\n"+chunk(b"IHDR",struct.pack(">IIBBBBB",w,h,8,2,0,0,0))+chunk(b"IDAT",zlib.compress(raw,6))+chunk(b"IEND",b""))

def pbr(name,color,rough=.65,surface=None,metal=0,emission=0,alpha=1):
    m=bpy.data.materials.new(name);m.use_nodes=True
    b=m.node_tree.nodes.get("Principled BSDF")
    b.inputs["Base Color"].default_value=(*color,alpha)
    b.inputs["Roughness"].default_value=rough;b.inputs["Metallic"].default_value=metal
    b.inputs["Alpha"].default_value=alpha
    if alpha<1:m.surface_render_method="DITHERED"
    if emission:
        b.inputs["Emission Color"].default_value=(*color,1);b.inputs["Emission Strength"].default_value=emission
    if surface:
        n=256;Y,X=np.mgrid[0:n,0:n]/n
        if surface=="wood":
            variation=.94+.04*np.sin(Y*310+3*np.sin(X*13))+ .025*np.sin(Y*1120+4*np.sin(X*18))
            height=.4+.18*np.sin(Y*310+3*np.sin(X*13))+.035*np.sin(Y*1120+4*np.sin(X*18))
        elif surface=="cloth":
            variation=.96+.025*np.sin(X*math.pi*192)*np.cos(Y*math.pi*192)
            height=.5+.12*np.sin(X*math.pi*192)+.12*np.sin(Y*math.pi*192)
        else:
            variation=.98+.008*np.sin(X*720+np.sin(Y*44)*2)*np.sin(Y*633)
            height=.5+.03*np.sin(X*720+np.sin(Y*44)*2)*np.sin(Y*633)
        base=np.stack([np.clip(variation*c,0,1) for c in color],axis=-1)
        path=TEX/(name+"-albedo.png");png(path,base)
        tex=m.node_tree.nodes.new("ShaderNodeTexImage");tex.image=bpy.data.images.load(str(path));tex.image.pack()
        m.node_tree.links.new(tex.outputs["Color"],b.inputs["Base Color"])
        dy,dx=np.gradient(height);normal=np.stack([-dx*.8,-dy*.8,np.ones_like(dx)],axis=-1)
        normal/=np.linalg.norm(normal,axis=2,keepdims=True);path=TEX/(name+"-normal.png");png(path,normal*.5+.5)
        tex=m.node_tree.nodes.new("ShaderNodeTexImage");tex.image=bpy.data.images.load(str(path));tex.image.colorspace_settings.name="Non-Color";tex.image.pack()
        node=m.node_tree.nodes.new("ShaderNodeNormalMap");node.inputs["Strength"].default_value=.3
        m.node_tree.links.new(tex.outputs["Color"],node.inputs["Color"]);m.node_tree.links.new(node.outputs["Normal"],b.inputs["Normal"])
        rr=np.repeat(np.clip(rough+(variation-1)*.35,0,1)[:,:,None],3,axis=2)
        path=TEX/(name+"-roughness.png");png(path,rr)
        tex=m.node_tree.nodes.new("ShaderNodeTexImage");tex.image=bpy.data.images.load(str(path));tex.image.colorspace_settings.name="Non-Color";tex.image.pack()
        m.node_tree.links.new(tex.outputs["Color"],b.inputs["Roughness"])
    return m

def compat_material(name,image=None,color=(.8,.8,.8,1),alpha=False):
    m=ORIGINAL_MATERIAL(name,image,color,False)
    if alpha:
        lib.CARD_MATS.add(name)
        tex=next(n for n in m.node_tree.nodes if n.type=="TEX_IMAGE")
        m.node_tree.links.new(tex.outputs["Alpha"],m.node_tree.nodes.get("Principled BSDF").inputs["Alpha"])
        m.surface_render_method="DITHERED"
    return m

def mats():
    M=ORIGINAL_MATS()
    M.update({
      "v2_oak":pbr("v2_oak",(.55,.43,.29),.57,"wood"),
      "v2_darkwood":pbr("v2_darkwood",(.28,.20,.13),.5,"wood"),
      "v2_linen":pbr("v2_linen",(.89,.88,.83),.88,"cloth"),
      "v2_taupe":pbr("v2_taupe",(.56,.51,.44),.9,"cloth"),
      "v2_curtain":pbr("v2_curtain",(.52,.50,.46),.88,"cloth"),
      "v2_paint":pbr("v2_paint",(.82,.78,.69),.86,"plaster"),
      "v2_stone":pbr("v2_stone",(.62,.61,.57),.72,"plaster"),
      "v2_ceramic":pbr("v2_ceramic",(.85,.86,.83),.22),
      "v2_black":pbr("v2_black",(.035,.037,.035),.34,metal=.5),
      "v2_glow":pbr("v2_glow",(1,.72,.36),.7,emission=1.5),
      "v2_mirror":pbr("v2_mirror",(.72,.77,.78),.08,metal=1),
    })
    # Clear glass deliberately stays a simple transparent surface, not a painted sky.
    g=M["glass"].node_tree.nodes.get("Principled BSDF")
    g.inputs["Base Color"].default_value=(.68,.76,.78,.065)
    g.inputs["Alpha"].default_value=.065;g.inputs["Roughness"].default_value=.08
    M["glass"].surface_render_method="DITHERED"
    M["plaster"]=M["v2_paint"]
    M["plasterw"]=M["v2_paint"]
    return M

MATS={}
def cube(name,center,dimensions,mat,bevel=0):
    bpy.ops.mesh.primitive_cube_add(size=1,location=center)
    o=bpy.context.object;o.name=name;o.dimensions=dimensions
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    o.data.materials.append(MATS[mat])
    if bevel:
        mod=o.modifiers.new("rounded construction edges","BEVEL");mod.width=bevel;mod.segments=3
        bpy.context.view_layer.objects.active=o;bpy.ops.object.modifier_apply(modifier=mod.name)
        for p in o.data.polygons:p.use_smooth=True
        mod=o.modifiers.new("weighted normals","WEIGHTED_NORMAL");mod.keep_sharp=True
        bpy.ops.object.modifier_apply(modifier=mod.name)
    # Shared metre-scale box UVs, including the bevel faces.
    if not o.data.uv_layers:o.data.uv_layers.new(name="UVMap")
    for p in o.data.polygons:
        n=p.normal;axis=max(range(3),key=lambda i:abs(n[i]));uvaxis=[i for i in range(3) if i!=axis]
        for li in p.loop_indices:
            pnt=o.data.vertices[o.data.loops[li].vertex_index].co
            o.data.uv_layers.active.data[li].uv=(pnt[uvaxis[0]]*.7,pnt[uvaxis[1]]*.7)
    return o

def ellipsoid(name,center,size,mat):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=20,ring_count=10,location=center)
    o=bpy.context.object;o.name=name;o.scale=size;o.data.materials.append(MATS[mat])
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    for p in o.data.polygons:p.use_smooth=True
    return o

def rod(name,a,b,r,mat,vertices=10):
    a,b=Vector(a),Vector(b);d=b-a
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices,radius=r,depth=d.length,location=(a+b)/2)
    o=bpy.context.object;o.name=name;o.rotation_euler=d.to_track_quat("Z","Y").to_euler();o.data.materials.append(MATS[mat])
    return o

def cone(name,center,r1,r2,h,mat):
    bpy.ops.mesh.primitive_cone_add(vertices=20,radius1=r1,radius2=r2,depth=h,location=center)
    o=bpy.context.object;o.name=name;o.data.materials.append(MATS[mat]);return o

def fabric(name,cx,cy,z,w,d,mat,phase=0):
    nx,ny=32,32;verts=[];faces=[];uvs=[]
    for j in range(ny+1):
      t=j/ny;yy=(t-.5)*d
      for i in range(nx+1):
        s=i/nx;xx=(s-.5)*w
        edge=max(0,(abs(s-.5)-.39)/.11)
        foot=max(0,(.12-t)/.12)
        zz=z-.16*edge**1.4-.1*foot**1.3+.007*math.sin(xx*16+phase)*math.sin(yy*10+.7)+.0035*math.sin(xx*29+yy*19)
        verts.append((cx+xx,cy+yy,zz));uvs.append((s*1.3,t*1.5))
    for j in range(ny):
      for i in range(nx):
        a=j*(nx+1)+i;faces.append((a,a+1,a+nx+2,a+nx+1))
    mesh=bpy.data.meshes.new(name);mesh.from_pydata(verts,[],faces);mesh.materials.append(MATS[mat])
    uv=mesh.uv_layers.new()
    for p in mesh.polygons:
      p.use_smooth=True
      for li in p.loop_indices:uv.data[li].uv=uvs[mesh.loops[li].vertex_index]
    o=bpy.data.objects.new(name,mesh);bpy.context.scene.collection.objects.link(o)
    mod=o.modifiers.new("cloth edge thickness","SOLIDIFY");mod.thickness=.018
    bpy.context.view_layer.objects.active=o;bpy.ops.object.modifier_apply(modifier=mod.name)
    return o

def curtain(prefix,x0,x1,y,height=2.48):
    for k,xc in enumerate((x0+.22,x1-.22)):
      width=.56;nx,ny=24,12;verts=[];faces=[]
      for j in range(ny+1):
       z=.12+(height-.12)*j/ny
       for i in range(nx+1):
        t=i/nx;f=math.sin(t*math.pi*8)*(.045+.025*(1-j/ny))
        verts.append((xc+(t-.5)*width,y+f,z+.015*math.sin(t*19)))
      for j in range(ny):
       for i in range(nx):
        a=j*(nx+1)+i;faces.append((a,a+1,a+nx+2,a+nx+1))
      mesh=bpy.data.meshes.new(prefix+"curtain");mesh.from_pydata(verts,[],faces);mesh.materials.append(MATS["v2_curtain"])
      uv=mesh.uv_layers.new()
      for p in mesh.polygons:
       p.use_smooth=True
       for li in p.loop_indices:
        ix=mesh.loops[li].vertex_index;uv.data[li].uv=((ix%(nx+1))/nx*2,(ix//(nx+1))/ny*3)
      o=bpy.data.objects.new(prefix+"curtain"+str(k),mesh);bpy.context.scene.collection.objects.link(o)
      mod=o.modifiers.new("hem thickness","SOLIDIFY");mod.thickness=.012;bpy.context.view_layer.objects.active=o;bpy.ops.object.modifier_apply(modifier=mod.name)
    rod(prefix+"curtain track",(x0-.08,y,2.53),(x1+.08,y,2.53),.018,"v2_black")

def armchair(prefix,x,y,turn=0):
    parts=[];parts.append(cube(prefix+"seat frame",(x,y,.37),(.66,.61,.09),"v2_darkwood",.025))
    parts.append(cube(prefix+"seat cushion",(x,y-.02,.45),(.59,.54,.09),"v2_linen",.04))
    back=cube(prefix+"back frame",(x,y+.27,.73),(.65,.045,.59),"v2_darkwood",.018);back.rotation_euler.x=-.14;parts.append(back)
    # Visible woven bands with open gaps. Low enough to reuse in all three rooms.
    for j in range(10):
        parts.append(cube(prefix+"rattan horizontal"+str(j),(x,y+.235,.48+j*.048),(.56,.012,.018),"v2_oak"))
    for j in range(10):
        parts.append(cube(prefix+"rattan vertical"+str(j),(x-.26+j*.057,y+.225,.72),(.017,.012,.49),"v2_oak"))
    for sx in (-.28,.28):
        for sy in (-.24,.24):parts.append(rod(prefix+"leg",(x+sx,y+sy,.04),(x+sx*.9,y+sy,.38),.025,"v2_darkwood",8))
        parts.append(cube(prefix+"arm",(x+sx,y,.65),(.045,.65,.045),"v2_darkwood",.018))
        parts.append(rod(prefix+"arm post",(x+sx,y-.2,.39),(x+sx,y-.2,.65),.018,"v2_darkwood",8))
    if turn:
      c,s=math.cos(turn),math.sin(turn)
      for o in parts:
        dx,dy=o.location.x-x,o.location.y-y;o.location.x=x+c*dx-s*dy;o.location.y=y+s*dx+c*dy;o.rotation_euler.z+=turn

def arch_lintel(name,cx,y,width,shoulder,top,radius=.16):
    left,right=cx-width/2,cx+width/2
    profile=[(left,top),(right,top),(right,shoulder)]
    for k in range(1,9):
        a=k/8*math.pi/2
        profile.append((right-radius+radius*math.cos(a),shoulder+radius*math.sin(a)))
    profile.append((left+radius,shoulder+radius))
    for k in range(1,9):
        a=math.pi/2+k/8*math.pi/2
        profile.append((left+radius+radius*math.cos(a),shoulder+radius*math.sin(a)))
    n=len(profile);vertices=[(x,y+dy,z) for dy in (-.07,.07) for x,z in profile]
    faces=[tuple(range(n-1,-1,-1)),tuple(range(n,2*n))]
    faces.extend((i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n))
    mesh=bpy.data.meshes.new(name);mesh.from_pydata(vertices,[],faces);mesh.materials.append(MATS["v2_paint"])
    uv=mesh.uv_layers.new()
    for face in mesh.polygons:
        for li in face.loop_indices:
            p=mesh.vertices[mesh.loops[li].vertex_index].co;uv.data[li].uv=(p.x*.7,p.z*.7)
    o=bpy.data.objects.new(name,mesh);bpy.context.scene.collection.objects.link(o)
    return o

def room(mb,rnd,x0,x1,y0,y1,style="plaster",doors_u=()):
    if x1<0:return ORIGINAL_ROOM(mb,rnd,x0,x1,y0,y1,style,doors_u)
    idx=len(ROOMS)+1;prefix=f"freedom{idx}_";windowx=(.6,5.9,12)[idx-1]
    ROOM= {"id":f"lanchuan-freedom-{idx}","bounds":[x0,x1,y0,y1],"floor":.035,"windowX":windowx,
           "doorX":list(doors_u)[0],"provenance":"same-family adaptation; numbered bay assignment unverified"}
    ROOMS.append(ROOM)
    # New wood finish sits on the existing slab and remains inside its wall boundary.
    for j in range(math.ceil((y1-y0)/.18)):
       a=y0+j*.18;b=min(y1,a+.176)
       if b>a:cube(prefix+"floor"+str(j),((x0+x1)/2,(a+b)/2,.018),(x1-x0,b-a,.035),"v2_oak",.002)
    if idx==1:cube(prefix+"shared-wall lining",(x0-.055,(y0+y1)/2,1.34),(.035,y1-y0,2.65),"v2_paint")
    bx,by=windowx,y1-1.3
    cube(prefix+"bed frame",(bx,by,.25),(1.92,2.16,.29),"v2_darkwood",.045)
    cube(prefix+"mattress",(bx,by,.48),(1.86,2.08,.24),"v2_linen",.075)
    fabric(prefix+"duvet",bx,by-.18,.65,2.02,1.88,"v2_linen",idx*.7)
    fabric(prefix+"runner",bx,by-.88,.69,2.04,.50,"v2_taupe",idx*.8)
    for sx in (-.43,.43):
       pillow=ellipsoid(prefix+"pillow",(bx+sx,by+.70,.72),(.42,.25,.12),"v2_linen")
       pillow.rotation_euler.x=.15
    cube(prefix+"headboard",(bx,y1-.15,.78),(2.5,.10,1.12),"v2_darkwood",.025)
    for i in range(24):cube(prefix+"headboard slat"+str(i),(bx-1.2+i*.104,y1-.218,.79),(.086,.035,1.0),"v2_oak",.006)
    for sx in (-1.12,1.12):
       xx=bx+sx
       if not x0+.18<xx<x1-.18:continue
       cube(prefix+"nightstand",(xx,y1-.44,.46),(.42,.43,.54),"v2_oak",.025)
       cube(prefix+"drawer gap",(xx,y1-.665,.48),(.36,.008,.012),"v2_black")
       rod(prefix+"sconce stem",(xx,y1-.25,1.48),(xx,y1-.46,1.48),.014,"v2_black")
       cone(prefix+"wall lamp",(xx,y1-.46,1.39),.12,.055,.19,"v2_black")
       cone(prefix+"lamp glow",(xx,y1-.46,1.295),.105,.10,.012,"v2_glow")
       cube(prefix+"socket",(xx,y1-.27,.96),(.075,.015,.10),"v2_black",.006)
    # Window furniture leaves the doorway approach clear.
    armchair(prefix+"chairA_",windowx-.65,y0+1.08,-.14)
    armchair(prefix+"chairB_",windowx+.65,y0+1.08,.14)
    rod(prefix+"coffee top",(windowx,y0+.63,.53),(windowx,y0+.63,.57),.29,"v2_darkwood",24)
    for a in (0,2.094,4.188):
       rod(prefix+"coffee leg",(windowx+math.cos(a)*.21,y0+.63+math.sin(a)*.21,.04),
           (windowx+math.cos(a)*.15,y0+.63+math.sin(a)*.15,.53),.019,"v2_black",8)
    rod(prefix+"cup",(windowx-.08,y0+.63,.58),(windowx-.08,y0+.63,.66),.034,"v2_ceramic",12)
    rod(prefix+"kettle",(windowx+.10,y0+.65,.58),(windowx+.10,y0+.65,.79),.065,"v2_ceramic",14)
    curtain(prefix,windowx-1.27,windowx+1.27,y0+.12)
    # Concealed wet-room plan is designed, not claimed as a measured photograph.
    bathx=x1-1.8;bathy=y1-2.35;archx=x1-.9
    cube(prefix+"bath side",(bathx,(bathy+y1)/2,1.32),(.12,y1-bathy,2.64),"v2_paint",.025)
    # Rounded-corner lintel segmented around a generous 0.94 m clear opening.
    for left,right in ((bathx,archx-.49),(archx+.49,x1)):
       cube(prefix+"bath doorway side",((left+right)/2,bathy,1.32),(right-left,.14,2.64),"v2_paint",.035)
    arch_lintel(prefix+"bath rounded opening",archx,bathy,.98,2.16,2.64)
    cube(prefix+"wet floor",((bathx+x1)/2,(bathy+y1)/2,.048),(x1-bathx,y1-bathy,.025),"v2_stone",.008)
    # Basin and round metal-backed mirror seen through the doorway.
    cube(prefix+"vanity cabinet",(archx,y1-.32,.49),(1.12,.50,.78),"v2_oak",.035)
    for zz in (.36,.65):
       cube(prefix+"vanity drawer",(archx,y1-.581,zz),(1.02,.025,.25),"v2_oak",.015)
       for sx in (-.40,.40):ellipsoid(prefix+"drawer handle",(archx+sx,y1-.61,zz),(.016,.018,.016),"v2_black")
    cube(prefix+"basin counter",(archx,y1-.31,.91),(1.19,.55,.06),"v2_ceramic",.04)
    ellipsoid(prefix+"basin bowl",(archx,y1-.39,.943),(.28,.17,.023),"v2_stone")
    rod(prefix+"tap",(archx,y1-.15,.95),(archx,y1-.15,1.15),.014,"v2_black",10)
    rod(prefix+"tap spout",(archx,y1-.15,1.15),(archx,y1-.32,1.15),.014,"v2_black",10)
    mirror=rod(prefix+"round mirror",(archx,y1-.15,1.62),(archx,y1-.12,1.62),.36,"v2_mirror",48)
    rod(prefix+"mirror light",(archx-.37,y1-.18,2.08),(archx+.37,y1-.18,2.08),.016,"v2_glow",8)
    # Side shower and compact WC occupy the rear suite without blocking the vanity.
    showerx=bathx+.42;showery=bathy+.58
    cube(prefix+"shower tray",(showerx,showery,.075),(.74,.94,.075),"v2_ceramic",.025)
    cube(prefix+"shower glass",(bathx+.82,showery,1.08),(.015,.96,1.98),"glass")
    rod(prefix+"shower rail",(bathx+.15,showery,1.0),(bathx+.15,showery,2.18),.012,"v2_black")
    rod(prefix+"shower arm",(bathx+.15,showery,2.18),(bathx+.34,showery,2.18),.012,"v2_black")
    rod(prefix+"shower head",(bathx+.34,showery,2.16),(bathx+.34,showery,2.18),.09,"v2_black",18)
    wcx=x1-.35;wcy=bathy+.60
    ellipsoid(prefix+"wc base",(wcx,wcy,.24),(.21,.28,.22),"v2_ceramic")
    ellipsoid(prefix+"wc seat",(wcx,wcy-.06,.43),(.23,.30,.045),"v2_ceramic")
    cube(prefix+"wc cistern",(wcx,wcy+.18,.63),(.40,.18,.46),"v2_ceramic",.055)
    # Narrow wardrobe away from the entrance path.
    cube(prefix+"wardrobe",(x0+.34,y0+2.65,1.0),(.55,1.05,1.93),"v2_oak",.025)
    for yy in (y0+2.40,y0+2.85):
       rod(prefix+"wardrobe handle",(x0+.63,yy,.9),(x0+.63,yy,1.12),.01,"v2_black",8)
    cube(prefix+"luggage bench",(x0+.40,y0+3.70,.33),(.62,.65,.075),"v2_darkwood",.02)

def finish(name,mb,M,doors,pad,rnd,masks=()):
    shell=mb.build("lanchuan_shell",M)
    for i,(x,y,dz) in enumerate(gh.STEP_FEET):
        e=bpy.data.objects.new(f"{name}_step{i}",None);bpy.context.scene.collection.objects.link(e);e.location=(x,y,-dz)
    gh.STEP_FEET.clear()
    p=bpy.data.objects.new(name+"_pad",None);bpy.context.scene.collection.objects.link(p)
    x0,x1,y0,y1=pad;p.location=((x0+x1)/2,(y0+y1)/2,0);p.scale=((x1-x0)/2,(y1-y0)/2,1)
    for i,(dm,hinge) in enumerate(doors):
       parts=dm.build(f"{name}_door{i}",M);e=bpy.data.objects.new(f"{name}_door{i}",None);bpy.context.scene.collection.objects.link(e);e.location=hinge
       e.rotation_euler.z=math.radians(-102) if i>0 else 0
       for o in parts:o.parent=e
    bpy.context.view_layer.update()
    # Ray-based contact and sky visibility, separated from intrinsic material colour.
    opaque=[o for o in bpy.context.scene.objects if o.type=="MESH" and o.data.materials and o.data.materials[0].name!="glass"]
    fine=[o for o in opaque if not any(s in o.name for s in ("turfblade","turfdry","seedstalk"))]
    lib.bake_vertex_ao(fine,samples=12,dist=2.0,sky=True,sky_minz=-.35)
    for o in opaque:
       if o in fine:continue
       attr=o.data.color_attributes.new("Color","FLOAT_COLOR","POINT")
       for v in attr.data:v.color=(.85,.85,1,1)
    scene=bpy.context.scene;scene.unit_settings.system="METRIC";scene.unit_settings.scale_length=1
    scene["reference"]=json.dumps(REFERENCE,ensure_ascii=False)
    scene["rooms"]=json.dumps(ROOMS,ensure_ascii=False)
    scene["assetContract"]="metres; Blender Z up; same original building origin/pad; COLOR_0=(AO,AO,sky)"
    scene["doorState"]="Right three room doors fixed open; animation and collision not implemented"
    scene["designStatus"]="First reusable room-family candidate; no measured floor-plan claim"
    for image in bpy.data.images:
       if image.source=="FILE":image.pack()
    bpy.ops.wm.save_as_mainfile(filepath=str(BLEND))

if args.export_existing:
    bpy.ops.wm.open_mainfile(filepath=str(BLEND))
    ROOMS=json.loads(bpy.context.scene.get("rooms","[]"))
else:
    lib.material=gh.material=cabin.material=compat_material
    def upgraded_mats():
       global MATS
       MATS=mats();return MATS
    gh.mats=upgraded_mats;gh.room=room;gh.finish=finish
    gh.lanchuan()

if args.refine_surfaces:
    from v2_interior_surfaces import refine_scene
    refine_scene(TEX)
    bpy.ops.wm.save_as_mainfile(filepath=str(BLEND))

objects=[o for o in bpy.context.scene.objects if o.type in ("MESH","EMPTY") and not o.name.startswith("preview_")]
bpy.ops.object.select_all(action="DESELECT")
for o in objects:o.select_set(True)
bpy.ops.export_scene.gltf(filepath=str(OUT),export_format="GLB",use_selection=True,export_apply=True,
    export_vertex_color="ACTIVE",export_all_vertex_colors=False,export_extras=True,
    export_animations=False,export_lights=False,export_cameras=False,export_image_format="AUTO")
(SRC/"lanchuan-freedom.metadata.json").write_text(json.dumps({"asset":str(OUT.relative_to(ROOT)),"source":str(BLEND.relative_to(ROOT)),
  "reference":REFERENCE,"rooms":ROOMS,"coordinates":"Blender x,y,z; Three x,z,-y","sourceAsset":"gh_lanchuan",
  "doorState":"fixed open","collision":"room floors exposed by settlements.js; wall/furniture collision not implemented"},ensure_ascii=False,indent=2))
if args.preview:
    scene=bpy.context.scene
    scene.world=bpy.data.worlds.new("preview_world");scene.world.use_nodes=True
    scene.world.node_tree.nodes["Background"].inputs["Color"].default_value=(.63,.73,.9,1)
    scene.world.node_tree.nodes["Background"].inputs["Strength"].default_value=.7
    lampdata=bpy.data.lights.new("preview_sun","SUN");lampdata.energy=2.0;lampdata.angle=.08
    lamp=bpy.data.objects.new("preview_sun",lampdata);scene.collection.objects.link(lamp);lamp.rotation_euler=(.5,-.4,-.5)
    lightdata=bpy.data.lights.new("preview_roomfill","AREA");lightdata.energy=70;lightdata.shape="DISK";lightdata.size=2.4
    light=bpy.data.objects.new("preview_roomfill",lightdata);scene.collection.objects.link(light);light.location=(.6,-3.1,1.8)
    light.rotation_euler=(Vector((.6,1.6,1.1))-light.location).to_track_quat("-Z","Y").to_euler()
    camera_data=bpy.data.cameras.new("preview_camera");camera=bpy.data.objects.new("preview_camera",camera_data);scene.collection.objects.link(camera)
    camera.location=(2.42,-2.2,1.6);camera.rotation_euler=(Vector((.8,2.1,1.05))-camera.location).to_track_quat("-Z","Y").to_euler()
    camera_data.lens=20;scene.camera=camera
    scene.render.engine="CYCLES";scene.cycles.device="CPU";scene.cycles.samples=24;scene.cycles.use_denoising=True
    scene.render.resolution_x=1440;scene.render.resolution_y=960;scene.render.resolution_percentage=100
    scene.view_settings.view_transform="AgX";scene.render.image_settings.file_format="PNG"
    scene.render.filepath=str(SRC/"lanchuan-freedom.preview.png");bpy.ops.render.render(write_still=True)
print(json.dumps({"blend":str(BLEND),"glb":str(OUT),"rooms":len(ROOMS),"bytes":OUT.stat().st_size}))
