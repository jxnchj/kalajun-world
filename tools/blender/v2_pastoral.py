"""Shared pastoral house/yurt upgrade. Originals are imported as code, never overwritten.
Build: tools/.bpy/bin/python tools/blender/v2_pastoral.py --asset all --preview
Re-export edited source: tools/.bpy/bin/python tools/blender/v2_pastoral.py --asset house_a --export-existing --rebake-occlusion
The default build regenerates these NEW source files. Use --export-existing after hand editing.
Keep CONTRACTS and settlement-assets.js floor/openings/viewpoints in sync if layout changes.
The --rebake-occlusion option updates baked AO/sky and saves the edited source before export.
Blender Z-up metres; origin, pad and exterior openings remain the legacy ones.
"""
import argparse,json,math,random,sys,struct,zlib
from pathlib import Path
import bpy
import numpy as np
from mathutils import Vector,Matrix
sys.path.insert(0,str(Path(__file__).resolve().parent))
import lib,cabin,yurt
ROOT=Path(__file__).resolve().parents[2]
SRC=ROOT/"assets/src/v2/pastoral";TEX=SRC/"textures";OUT=ROOT/"web/public/assets/v2"
for p in (SRC,TEX,OUT):p.mkdir(parents=True,exist_ok=True)
parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument("--asset",choices=["all","house_a","yurt"],default="all")
parser.add_argument("--export-existing",action="store_true");parser.add_argument("--preview",action="store_true")
parser.add_argument("--rebake-occlusion",action="store_true")
parser.add_argument("--refine-surfaces",action="store_true",help="Refine current scene materials and sewn pillows, preserving existing layout")
args=parser.parse_args()
MATS={};CURRENT=None
ORIGINAL_MATERIAL=lib.material;CABIN_MATS=cabin.mats;YURT_MATS=yurt.mats
REFERENCES=[
 {"url":"https://www.xjyl.gov.cn/xjylz/c112431/202609/bcea37d2fb954a6eb04c437c40785efb.shtml",
  "scope":"Qiongkushitai log-built dwellings beside river/forest; cultural context, not a measured interior", "observed":"2026-10-19"},
 {"url":"https://ich.unesco.org/en/RL/traditional-knowledge-and-skills-in-making-kyrgyz-kazakh-and-karakalpak-yurts-turkic-nomadic-dwellings-02284",
  "scope":"wooden circular frame, felt covering, braided ropes, woven and embroidered decoration", "observed":"2026-10-19"},
 {"url":"https://archive.unesco-ichcap.org/eng/ek/sub2017_4/sub2.php",
  "scope":"Kazakh/Kyrgyz yurt craft context; household items placed along kerege, not a local house survey", "observed":"2026-10-19"}]
CONTRACTS={
 "house_a":{"sourceAsset":"house_a","file":"house_a_lived.glb","count":113,"floor":{"shape":"rect","x0":-3.4,"x1":3.4,"z0":-2.3,"z1":2.3,"y":.035},
   "floorY":.035,"openings":[
     {"kind":"door","center":[1,.995,2.5],"width":1.1,"height":1.99,"normal":[0,0,1]},
     {"kind":"window","center":[-2,1.45,2.5],"width":1.25,"height":1.2,"normal":[0,0,1]},
     {"kind":"window","center":[0,1.45,-2.5],"width":1.25,"height":1.2,"normal":[0,0,-1]}],
   "entry":{"from":[1,1.6,1.8],"to":[-.9,.9,-1.15]},"window":{"from":[-2.3,1.7,1.6],"to":[-2.3,1.7,9]},
   "representativeId":"cabins:-1743,3612:30f9adc9fb584805","representativeXZ":[-1743,3612]},
 "yurt":{"sourceAsset":"yurt","file":"yurt_lived.glb","count":72,"floor":{"shape":"circle","radius":3.16,"y":.025},
   "floorY":.025,"openings":[
     {"kind":"door","center":[0,.775,3.154],"width":1.1,"height":1.55,"normal":[0,0,1]},
     {"kind":"roof-crown","center":[0,3.25,0],"radius":.62,"partlyCovered":True,"normal":[0,1,0]}],
   "entry":{"from":[0,1.55,2.2],"to":[-.35,.75,-1.35]},"window":{"from":[.15,1.4,.6],"to":[0,1.35,9]},
   "representativeId":"yurts:-1551,3489:3337d4a3e634caaf","representativeXZ":[-1551,3489]},
}
def png(path,arr):
    arr=np.clip(arr*255,0,255).astype(np.uint8);h,w,_=arr.shape
    def ch(t,b):return struct.pack(">I",len(b))+t+b+struct.pack(">I",zlib.crc32(t+b)&0xffffffff)
    raw=b"".join(b"\0"+arr[y].tobytes() for y in range(h))
    path.write_bytes(b"\x89PNG\r\n\x1a\n"+ch(b"IHDR",struct.pack(">IIBBBBB",w,h,8,2,0,0,0))+ch(b"IDAT",zlib.compress(raw,6))+ch(b"IEND",b""))
def material(name,color,rough=.7,surface=None,metal=0):
    m=bpy.data.materials.new(name);m.use_nodes=True;b=m.node_tree.nodes.get("Principled BSDF")
    b.inputs["Base Color"].default_value=(*color,1);b.inputs["Roughness"].default_value=rough;b.inputs["Metallic"].default_value=metal
    if surface:
        n=256;Y,X=np.mgrid[:n,:n]/n
        if surface=="wood":h=.5+.12*np.sin(Y*230+2*np.sin(X*9))+.035*np.sin(Y*851+X*6);v=.94+.06*(h-.5)
        else:h=.5+.11*np.sin(X*math.pi*160)+.11*np.cos(Y*math.pi*160);v=.96+.035*np.sin(X*math.pi*160)*np.cos(Y*math.pi*160)
        rgb=np.stack([v*c for c in color],axis=-1)
        if surface=="pattern":
            u=np.abs(((X*3+.5)%1)-.5);q=np.abs(((Y*3+.5)%1)-.5)
            motif=np.abs(u+q-.32)<.042;border=(X<.045)|(X>.955)|(Y<.045)|(Y>.955)
            rgb[motif]=(.73,.54,.30);rgb[border]=(.24,.16,.12)
        dy,dx=np.gradient(h);normal=np.stack([-dx,-dy,np.ones_like(dx)],axis=-1);normal/=np.linalg.norm(normal,axis=2,keepdims=True)
        for kind,arr in [("albedo",rgb),("normal",normal*.5+.5),("roughness",np.repeat(np.clip(rough+(v-1)*.12,0,1)[:,:,None],3,axis=2))]:
            path=TEX/(name+"-"+kind+".png");png(path,arr)
            image=bpy.data.images.load(str(path),check_existing=True);image.pack()
            if kind!="albedo":image.colorspace_settings.name="Non-Color"
            t=m.node_tree.nodes.new("ShaderNodeTexImage");t.image=image
            if kind=="normal":
                nm=m.node_tree.nodes.new("ShaderNodeNormalMap");nm.inputs["Strength"].default_value=.25;m.node_tree.links.new(t.outputs["Color"],nm.inputs["Color"]);m.node_tree.links.new(nm.outputs["Normal"],b.inputs["Normal"])
            else:m.node_tree.links.new(t.outputs["Color"],b.inputs["Base Color" if kind=="albedo" else "Roughness"])
    return m
def compat_material(name,image=None,color=(.8,.8,.8,1),alpha=False):
    m=ORIGINAL_MATERIAL(name,image,color,False)
    if alpha:
        lib.CARD_MATS.add(name);t=next(n for n in m.node_tree.nodes if n.type=="TEX_IMAGE")
        m.node_tree.links.new(t.outputs["Alpha"],m.node_tree.nodes.get("Principled BSDF").inputs["Alpha"]);m.surface_render_method="DITHERED"
    return m
def make_mats():
    global MATS
    MATS=(CABIN_MATS if CURRENT=="house_a" else YURT_MATS)()
    for name,c,r,s,metal in [
      ("wood",(.42,.29,.17),.64,"wood",0),("pale",(.65,.51,.32),.66,"wood",0),
      ("wool",(.72,.67,.56),.94,"cloth",0),("linen",(.86,.82,.71),.87,"cloth",0),
      ("red",(.38,.105,.065),.92,"pattern",0),("blue",(.11,.27,.27),.92,"pattern",0),
      ("gold",(.50,.34,.12),.92,"cloth",0),("iron",(.065,.063,.058),.42,None,.65),
      ("ceramic",(.68,.73,.66),.22,None,0),("brass",(.48,.32,.13),.30,None,.75),
      ("clay",(.58,.51,.40),.90,None,0)]:
        MATS[name]=material("v2_pastoral_"+name,c,r,s,metal)
    if CURRENT=="house_a":
        MATS["lining"]=material("v2_pastoral_lining",(.52,.43,.32),.76,"wood")
    if "glass" in MATS:
        b=MATS["glass"].node_tree.nodes.get("Principled BSDF");b.inputs["Base Color"].default_value=(.7,.76,.78,.055);b.inputs["Alpha"].default_value=.055;b.inputs["Roughness"].default_value=.10;MATS["glass"].surface_render_method="DITHERED"
    return MATS
def role(o,detail="interior"):
    o["detailRole"]=detail;o["sourcePrototype"]=CURRENT;return o
def cube(name,p,size,mat,bevel=.015,detail="interior",bevel_segments=2):
    bpy.ops.mesh.primitive_cube_add(size=1,location=p);o=bpy.context.object;o.name="pastoral_"+name;o.dimensions=size
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);o.data.materials.append(MATS[mat])
    if bevel:
        mod=o.modifiers.new("physical edge radius","BEVEL");mod.width=bevel;mod.segments=bevel_segments;bpy.context.view_layer.objects.active=o;bpy.ops.object.modifier_apply(modifier=mod.name)
        mod=o.modifiers.new("weighted corner normals","WEIGHTED_NORMAL");mod.keep_sharp=True;bpy.ops.object.modifier_apply(modifier=mod.name)
    uv=o.data.uv_layers.new(name="UVMap") if not o.data.uv_layers else o.data.uv_layers.active
    for f in o.data.polygons:
        axis=max(range(3),key=lambda i:abs(f.normal[i]));a=[i for i in range(3) if i!=axis]
        for li in f.loop_indices:
            v=o.data.vertices[o.data.loops[li].vertex_index].co;uv.data[li].uv=(v[a[0]]+.5,v[a[1]]+.5)
    return role(o,detail)
def ellipsoid(name,p,size,mat):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=16,ring_count=8,location=p);o=bpy.context.object;o.name="pastoral_"+name;o.scale=size;o.data.materials.append(MATS[mat])
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    for f in o.data.polygons:f.use_smooth=True
    return role(o)
def rod(name,a,b,r,mat,n=10,detail="interior"):
    a,b=Vector(a),Vector(b);d=b-a;bpy.ops.mesh.primitive_cylinder_add(vertices=n,radius=r,depth=d.length,location=(a+b)/2)
    o=bpy.context.object;o.name="pastoral_"+name;o.rotation_euler=d.to_track_quat("Z","Y").to_euler();o.data.materials.append(MATS[mat]);return role(o,detail)
def lathe(name,p,profile,mat,n=20,detail="interior"):
    verts=[];faces=[];uvs=[]
    for k,(r,z)in enumerate(profile):
        for j in range(n+1):
            a=j/n*math.tau;verts.append((p[0]+r*math.cos(a),p[1]+r*math.sin(a),p[2]+z));uvs.append((j/n,k/(len(profile)-1)))
    for k in range(len(profile)-1):
        for j in range(n):
            a=k*(n+1)+j;faces.append((a,a+1,a+n+2,a+n+1))
    mesh=bpy.data.meshes.new(name);mesh.from_pydata(verts,[],faces);mesh.materials.append(MATS[mat]);uv=mesh.uv_layers.new()
    for f in mesh.polygons:
        f.use_smooth=True
        for li in f.loop_indices:uv.data[li].uv=uvs[mesh.loops[li].vertex_index]
    o=bpy.data.objects.new("pastoral_"+name,mesh);bpy.context.scene.collection.objects.link(o);return role(o,detail)
def cloth(name,p,w,d,mat,phase=0,drop=.07):
    nx,ny=14,12;verts=[];faces=[];uvs=[]
    for j in range(ny+1):
      y=(j/ny-.5)*d
      for i in range(nx+1):
        x=(i/nx-.5)*w;e=max(0,(abs(i/nx-.5)-.40)/.10)
        z=p[2]-drop*e+.012*math.sin(x*14+phase)*math.sin(y*11)+.006*math.cos(x*23+y*15)
        verts.append((p[0]+x,p[1]+y,z));uvs.append((i/nx,j/ny))
    for j in range(ny):
      for i in range(nx):
        a=j*(nx+1)+i;faces.append((a,a+1,a+nx+2,a+nx+1))
    mesh=bpy.data.meshes.new(name);mesh.from_pydata(verts,[],faces);mesh.materials.append(MATS[mat]);uv=mesh.uv_layers.new()
    for f in mesh.polygons:
        f.use_smooth=True
        for li in f.loop_indices:uv.data[li].uv=uvs[mesh.loops[li].vertex_index]
    o=bpy.data.objects.new("pastoral_"+name,mesh);bpy.context.scene.collection.objects.link(o)
    mod=o.modifiers.new("woven thickness","SOLIDIFY");mod.thickness=.015;bpy.context.view_layer.objects.active=o;bpy.ops.object.modifier_apply(modifier=mod.name);return role(o)
def bowl(name,x,y,z,r=.09,mat="ceramic"):
    return lathe(name,(x,y,z),[(0,0),(r*.60,.008),(r,.06),(r*.95,.068),(r*.72,.024),(0,.02)],mat,20,"fine")
def kettle(name,x,y,z):
    lathe(name,(x,y,z),[(.03,0),(.12,.02),(.14,.13),(.09,.23),(.07,.24),(0,.255)],"brass",20,"fine")
    rod(name+"_lid",(x,y,z+.25),(x,y,z+.275),.035,"wood",10,"fine")
    rod(name+"_spout",(x+.09,y,z+.10),(x+.22,y,z+.23),.028,"brass",10,"fine")
    for i in range(9):
        a=i/9*math.pi;b=(i+1)/9*math.pi
        rod(name+"_handle",(x-.14*math.cos(a),y,z+.19+.13*math.sin(a)),(x-.14*math.cos(b),y,z+.19+.13*math.sin(b)),.014,"iron",6,"fine")
def table(name,x,y,r=.57):
    rod(name+"_top",(x,y,.38),(x,y,.43),r,"wood",32)
    for a in (0,2.094,4.188):rod(name+"_leg",(x+.37*math.cos(a),y+.37*math.sin(a),.035),(x+.30*math.cos(a),y+.30*math.sin(a),.38),.035,"wood")
    rod(name+"_tray",(x,y,.433),(x,y,.445),r*.62,"brass",24,"fine");kettle(name+"_tea",x+.12,y+.03,.448)
    for i,(dx,dy)in enumerate([(-.18,.12),(-.17,-.15),(.10,-.20)]):bowl(name+"_bowl"+str(i),x+dx,y+dy,.45)
def chest(name,x,y,w=1.15):
    cube(name+"_body",(x,y,.32),(w,.60,.58),"wood",.025);cube(name+"_lid",(x,y,.63),(w+.04,.63,.06),"pale",.018)
    for sx in (-.34,.34):
        cube(name+"_strap",(x+sx,y-.31,.34),(.06,.018,.53),"brass",.005,"fine")
    for i,mat in enumerate(["blue","gold","red","linen"]):
        cube(name+"_folded"+str(i),(x+.015*math.sin(i*4),y,.72+i*.105),(w-.06,.54,.095),mat,.035)
    cloth(name+"_topcover",(x,y,1.12),w+.04,.62,"red",1,.06)
def pegboard(name,x,y,z):
    cube(name+"_board",(x,y,z),(.72,.06,.10),"wood")
    for dx in (-.25,0,.25):rod(name+"_peg",(x+dx,y-.02,z),(x+dx,y-.16,z+.04),.018,"pale",8,"fine")
def house_lining():
    # A designed, reversible timber lining, not a surveyed historic household.
    # Inside faces are exactly x=+/-3.4 and y=+/-2.3: the declared clear floor
    # rectangle stays unchanged. The 22mm boards sit behind that surface and
    # ahead of the minimum measured inward log surface (3.410m / 2.307m).
    # Original log walls, roof beams and exterior mesh vertices remain intact.
    # Nonstructural finish boards use the near-interior bucket; low-cost sill
    # covers remain body. Close views still retain every finish and caster.
    base,top,thick=.045,2.22,.022
    def plank_part(label,axis,wall,u0,u1,z0,z1,seed):
        if u1-u0<.015 or z1-z0<.015:return
        u=(u0+u1)/2;z=(z0+z1)/2
        if axis=="x":p=(u,wall,z);size=(u1-u0,thick,z1-z0)
        else:p=(wall,u,z);size=(thick,u1-u0,z1-z0)
        o=cube("house_lining_"+label,p,size,"lining",.0015,"interior",1)
        o["designIntent"]="22mm timber boards; designed interior finish, no measured-house attribution"
        uv=o.data.uv_layers.active
        for f in o.data.polygons:
            for li in f.loop_indices:
                v=o.data.vertices[o.data.loops[li].vertex_index].co
                across=v.x if axis=="x" else v.y
                uv.data[li].uv=(v.z*.8+(seed*.173)%1,across*2.5+(seed*.317)%1)
        return o
    def wall(label,axis,coordinate,lo,hi,openings):
        # Use the actual opening boundaries as grid cuts, so a cut never merely
        # discards a whole overlapping board or spans across a window/door.
        n=math.ceil((hi-lo)/.22)
        cuts={lo,hi}
        cuts.update(lo+(hi-lo)*i/n for i in range(1,n))
        cuts.update(v for opening in openings for v in opening[:2] if lo<v<hi)
        cuts=sorted(cuts)
        for i,(a,b)in enumerate(zip(cuts[:-1],cuts[1:])):
            spans=[(base,top)]
            for oa,ob,za,zb in openings:
                if (a+b)/2<=oa or (a+b)/2>=ob:continue
                remaining=[]
                for p,q in spans:
                    if q<=za or p>=zb:remaining.append((p,q))
                    else:
                        if p<za:remaining.append((p,za))
                        if q>zb:remaining.append((zb,q))
                spans=remaining
            for j,(za,zb)in enumerate(spans):
                plank_part(label+"_board",axis,coordinate,a+.0015,b-.0015,za,zb,i)
        # Thin cap and base rails articulate the lining without hiding the upper
        # log course or the roof's exposed purlins.
        for z0,z1 in[(top-.025,top+.025),(base,base+.08)]:
            horizontal=[(lo,hi)]
            if z0<.1:
                for oa,ob,za,zb in openings:
                    if za>base:continue
                    horizontal=[piece for p,q in horizontal for piece in[(p,min(q,oa)),(max(p,ob),q)] if piece[1]-piece[0]>.02]
            for a,b in horizontal:
                rail=plank_part(label+"_rail",axis,coordinate,a,b,z0,z1,7)
                if rail:
                    # Stand 5mm proud of the board face.
                    rail.location.y-=math.copysign(.005,coordinate) if axis=="x" else 0
                    rail.location.x-=math.copysign(.005,coordinate) if axis=="y" else 0
    front=[(-2.70,-1.30,.78,2.12),(.29,1.71,0,2.16)]
    back=[(-.70,.70,.78,2.12)]
    wall("front","x",-2.311,-3.4,3.4,front)
    wall("back","x",2.311,-3.4,3.4,back)
    wall("left","y",-3.411,-2.3,2.3,[])
    wall("right","y",3.411,-2.3,2.3,[])
    # Legacy rubble footing rises up to 0.148m above the 0.035m floor and
    # intrudes at most 0.169m. A splayed timber sill cover encloses those INNER
    # protrusions; no exterior stone vertex or floor elevation is changed.
    def sill_cover(label,axis,coordinate,u0,u1):
        profile=[(0,.020),(.23,.020),(.23,.050),(.055,.225),(0,.225)]
        sign=1 if coordinate>0 else -1
        verts=[]
        for u in[u0,u1]:
            for inset,z in profile:
                verts.append((u,coordinate-sign*inset,z) if axis=="x" else(coordinate-sign*inset,u,z))
        n=len(profile);faces=[tuple(reversed(range(n))),tuple(range(n,n*2))]
        faces +=[(j,(j+1)%n,(j+1)%n+n,j+n)for j in range(n)]
        uvs=[[(verts[i][0] if axis=="x" else verts[i][1],verts[i][2]*2)for i in f]for f in faces]
        mb=lib.MeshBuilder();mb.add("lining",verts,faces,uvs)
        for o in mb.build("pastoral_house_lining_sill_"+label,{"lining":MATS["lining"]}):
            role(o,"body");o["designIntent"]="Interior timber sill cover over preserved legacy stone footing"
    sill_cover("front_left","x",-2.3,-3.4,.34)
    sill_cover("front_right","x",-2.3,1.66,3.4)
    sill_cover("back","x",2.3,-3.4,3.4)
    sill_cover("left","y",-3.4,-2.245,2.245)
    sill_cover("right","y",3.4,-2.245,2.245)
    cube("house_entry_threshold",(1,-2.30,.0325),(1.18,.42,.025),"pale",.001,"body",1)
    # Shallow reveal pieces meet the old window/door frames, staying entirely
    # outside their clear aperture. Original glass and mullions are untouched.
    for label,cx,yy,za,zb,half in[
      ("front_window",-2,-2.311,.78,2.12,.70),("back_window",0,2.311,.78,2.12,.70),
      ("entry",1,-2.311,.02,2.16,.71)]:
        for side in[-1,1]:
            cube("house_lining_"+label+"_reveal",(cx+side*half,yy,(za+zb)/2),(.045,.055,zb-za),"lining",.002,"interior",1)
        cube("house_lining_"+label+"_head",(cx,yy,zb),(half*2+.045,.055,.045),"lining",.002,"interior",1)
        if label!="entry":cube("house_lining_"+label+"_sill",(cx,yy,za),(half*2+.045,.07,.045),"lining",.002,"interior",1)

def house_interior(mb,x0,x1,y0,y1,chimney,roof_z,rnd,**kw):
    # Original cabin.interior is replaced, never layered underneath this furniture.
    house_lining()
    cube("house_sleep_platform",(-2.0,1.18,.23),(2.45,1.78,.42),"wood",.025)
    cube("house_felt_mattress",(-2,1.18,.49),(2.38,1.70,.13),"wool",.05)
    cloth("house_bed_quilt",(-2,1.12,.58),2.40,1.67,"blue",.4,.10)
    for x in (-2.65,-1.45):ellipsoid("house_pillow",(x,1.82,.65),(.42,.23,.12),"linen")
    cloth("house_bed_foot",(-2,.46,.62),2.43,.46,"red",1.2,.11)
    chest("house_chest",.95,1.98,.9)
    sx,sy=chimney or(x1-.8,y1-.8)
    cube("house_hearth",(sx,sy,.045),(1.15,.95,.09),"clay",.015)
    cube("house_clay_stove",(sx,sy,.48),(.92,.76,.86),"clay",.055)
    cube("house_fireplate",(sx,sy,.92),(.91,.74,.045),"iron",.01)
    cube("house_firedoor",(sx,sy-.391,.42),(.32,.025,.30),"iron",.018)
    rod("house_stovepipe",(sx-.20,sy+.15,.94),(sx-.20,sy+.15,roof_z(sy)+.05),.07,"iron",12,detail="body")
    kettle("house_stove_kettle",sx+.12,sy-.07,.95)
    cube("house_kitchen",(3.02,-.30,.46),(.55,1.30,.86),"wood",.025)
    cube("house_kitchen_counter",(3.02,-.30,.92),(.62,1.35,.06),"pale",.015)
    for yy in (-.65,-.05):
        cube("house_cabinet_door",(2.73,yy,.47),(.025,.54,.65),"pale",.01)
        rod("house_cabinet_handle",(2.70,yy,.48),(2.70,yy,.58),.012,"iron",8,"fine")
    for zz in(1.40,1.86):
        cube("house_shelf",(3.05,-.30,zz),(.43,1.40,.055),"wood",.01)
        for j in range(4):bowl("house_shelf_bowl",2.97,-.75+j*.28,zz+.03)
    lathe("house_milk_can",(2.95,-.60,.96),[(.11,0),(.14,.03),(.14,.25),(.08,.29),(.08,.36),(0,.36)],"ceramic",18,"fine")
    cloth("house_floor_rug",(-.5,-.55,.047),2.45,1.75,"red",0,0)
    table("house_low_table",-.72,-.60,.56)
    for i,(x,y)in enumerate([(-1.64,-.65),(-.65,-1.55),(.30,-.45)]):
        cube("house_floor_cushion",(x,y,.10),(.53,.52,.16),["blue","gold","linen"][i],.055)
    cube("house_window_bench",(-2.1,-2.08,.43),(1.40,.42,.10),"wood",.025)
    for xx in(-2.65,-1.55):cube("house_bench_leg",(xx,-2.08,.23),(.08,.35,.40),"wood",.012)
    cloth("house_bench_felt",(-2.1,-2.08,.51),1.4,.45,"wool",.6,.03)
    pegboard("house_entry_pegs",2.15,-2.28,1.65)
    cube("house_boot_tray",(1.92,-1.98,.04),(.58,.43,.055),"iron",.01,"fine")
    for xx in(1.77,2.0):
        ellipsoid("house_boot",(xx,-1.98,.12),(.085,.17,.075),"wood")
        rod("house_boot_upper",(xx,-1.92,.13),(xx,-1.92,.32),.07,"wood",10,"fine")
    # A wall-hung dry wood rack stays within the old exterior footprint.
    cube("house_entry_rack",(-2.55,-2.75,.22),(1.32,.34,.07),"wood",.01,"fine")
    for j in range(10):
        x=-3.1+(j%5)*.25;z=.32+(j//5)*.21
        rod("house_firewood",(x,-2.62,z),(x,-2.93,z),.105,"pale",7,"fine")
def yurt_interior(mb,R,hw,zc,r_top,roof,door_half,px,py,rnd):
    # Structural tradition is preserved: inward reed/felt, lattice and radial poles.
    gap=door_half+.03;rl=R-.07
    yurt.inner(mb,"chiy_in",[(R-.035,.02),(R-.035,hw)],seg=44,uv_u=14,theta0=gap,theta1=math.tau-gap,uvv=[1,0])
    t0=(roof[0][0]-(R-.04))/(roof[0][0]-roof[-1][0]);lin=[]
    for k in range(9):
        t=t0+(1-t0)*k/8;i=min(9,int(t*10));f=t*10-i
        lin.append((roof[i][0]+(roof[i+1][0]-roof[i][0])*f,roof[i][1]+(roof[i+1][1]-roof[i][1])*f-.045))
    yurt.inner(mb,"felt_in",[(R-.035,hw-.03)]+lin,seg=56,uv_u=7)
    n=int(math.tau*rl/.34);span=(hw-.1)/rl
    for k in range(n):
        for sign in(-1,1):
            pts=[(k/n*math.tau+sign*span*q/6,.06+(hw-.12)*q/6) for q in range(7)]
            for(aa,za),(ab,zb)in zip(pts[:-1],pts[1:]):
                am=((aa+ab)/2)%math.tau
                if am<gap or am>math.tau-gap:continue
                lib.log(mb,"orange",(rl*math.sin(aa),-rl*math.cos(aa),za),(rl*math.sin(ab),-rl*math.cos(ab),zb),.014,seg=4,wobble=0,caps=False)
    for k in range(56):
        a=(k+.5)/56*math.tau;pts=[Vector(((r-.01)*math.sin(a),-(r-.01)*math.cos(a),z-.035))for r,z in lin]
        pts[0]=Vector((rl*math.sin(a),-rl*math.cos(a),hw-.02))
        for a,b in zip(pts[:-1],pts[1:]):lib.log(mb,"orange",a,b,.022,seg=5,wobble=0,caps=False)
    yurt.inner(mb,"band_in",[(R-.1,hw-.3),(R-.1,hw-.06)],seg=44,uv_u=8,theta0=gap,theta1=math.tau-gap,uvv=[.9,.1])
    for a0,a1 in((math.pi-.62,math.pi-.05),(math.pi+.05,math.pi+.62)):
        yurt.inner(mb,"rug_in",[(R-.13,.55),(R-.13,1.6)],seg=10,uv_u=1.2,theta0=a0,theta1=a1,uvv=[0,1])
    yurt.disk(mb,"floorfelt",R-.03,.025)
    cloth("yurt_centre_rug",(-.25,.85,.047),2.7,2.05,"red",.4,0)
    cloth("yurt_entry_runner",(0,-1.58,.048),1.05,1.52,"blue",.6,0)
    chest("yurt_honour_chest",0,R-.64,1.25)
    cube("yurt_bedframe",(-2.15,.20,.23),(.92,1.95,.41),"wood",.025)
    cube("yurt_felt_bedding",(-2.15,.20,.48),(.88,1.9,.14),"wool",.05)
    cloth("yurt_sleep_quilt",(-2.15,.18,.57),.95,1.9,"blue",.7,.065)
    ellipsoid("yurt_bed_pillow",(-2.15,.87,.65),(.39,.23,.12),"linen")
    table("yurt_low_table",-.26,1.18,.55)
    for i,(x,y)in enumerate([(-1.12,1.35),(-.35,2.03),(.62,1.36)]):
        cube("yurt_seat_cushion",(x,y,.11),(.50,.5,.17),["gold","blue","linen"][i],.055)
    cube("yurt_hearth",(px,py,.06),(.74,.64,.10),"clay",.01)
    cube("yurt_iron_stove",(px,py,.35),(.56,.45,.50),"iron",.025)
    cube("yurt_stove_door",(px,py-.24,.32),(.27,.035,.24),"iron",.02)
    rod("yurt_stove_handle",(px+.11,py-.27,.29),(px+.11,py-.27,.39),.012,"brass",8,"fine")
    kettle("yurt_stove_kettle",px-.08,py,.61)
    cube("yurt_cupboard",(2.22,.25,.52),(.72,1.32,.92),"wood",.025)
    cube("yurt_counter",(2.22,.25,1.01),(.79,1.36,.07),"pale",.012)
    for yy in(-.06,.55):
        cube("yurt_cupboard_door",(1.845,yy,.55),(.03,.55,.73),"pale",.015)
        rod("yurt_cupboard_pull",(1.82,yy,.52),(1.82,yy,.61),.014,"brass",8,"fine")
    for i in range(3):bowl("yurt_kitchen_bowl",2.10,-.15+i*.30,1.055)
    lathe("yurt_water_pot",(2.30,.63,1.055),[(.07,0),(.14,.04),(.16,.22),(.09,.32),(.075,.35),(0,.35)],"ceramic",20,"fine")
    lathe("yurt_milk_pail",(1.98,-.72,.03),[(.11,0),(.15,.03),(.17,.32),(.16,.34),(.145,.05),(0,.04)],"brass",20,"fine")
    # Entrance gear is designed, not a named family's inventory.
    cube("yurt_saddle_rack",(1.05,-2.0,.54),(.65,.17,.07),"wood",.015)
    for xx in(.82,1.28):
        rod("yurt_rack_leg",(xx,-2.16,.03),(xx,-2,.54),.027,"wood")
        rod("yurt_rack_leg",(xx,-1.84,.03),(xx,-2,.54),.027,"wood")
    cloth("yurt_folded_saddlecloth",(1.05,-2,.64),.71,.61,"red",1.1,.16)
    for xx in(-.77,-.53):
        ellipsoid("yurt_entry_boot",(xx,-2.60,.11),(.09,.18,.075),"wood")
        rod("yurt_entry_bootleg",(xx,-2.52,.14),(xx,-2.52,.33),.07,"wood",10,"fine")
def preserve_legacy_shell():
    # Interior functions consume legacy random numbers before chimney creation.
    # Copy these explicitly known, already-published exterior meshes instead of
    # rerolling stones. They remain fully editable geometry in the new .blend.
    suffixes=["log","logend","plinth","stone","shingle","shutter"] if CURRENT=="house_a" else ["felt","chiy","band","rope","plinth","stone"]
    original={CURRENT+"_"+s:bpy.data.objects.get(CURRENT+"_"+s) for s in suffixes}
    before=set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=str(ROOT/"web/public/assets"/(CURRENT+".glb")))
    imported=set(bpy.data.objects)-before
    bpy.context.view_layer.update()
    keep=set()
    for name,old in original.items():
        matches=[o for o in imported if o.type=="MESH" and (o.name==name or o.name.startswith(name+"."))]
        if len(matches)!=1:raise RuntimeError("Expected exactly one published shell mesh "+name)
        o=matches[0];matrix=o.matrix_world.copy();o.parent=None;o.matrix_world=matrix
        if old:bpy.data.objects.remove(old,do_unlink=True)
        o.name=name;o.data.materials.clear();o.data.materials.append(MATS[name.removeprefix(CURRENT+"_")])
        o["sourcePrototype"]=CURRENT;o["shellProvenance"]="published legacy GLB geometry; origin and footprint unchanged"
        keep.add(o)
    for o in imported-keep:bpy.data.objects.remove(o,do_unlink=True)
    bpy.context.view_layer.update()

def bake_occlusion():
    meshes=[o for o in bpy.context.scene.objects if o.type=="MESH" and o.data.materials and o.data.materials[0].name!="glass"]
    bpy.context.view_layer.update();lib.bake_vertex_ao(meshes,samples=12,dist=2.0,sky=True,sky_minz=-.35)

def save_asset(name,objects):
    # Called instead of the legacy export, after both shell and replacement room exist.
    preserve_legacy_shell()
    for o in bpy.context.scene.objects:
        if o.type=="MESH" and "detailRole" not in o and o.name.endswith(("_felt_in","_chiy_in","_band_in","_rug_in","_floorfelt")):
            o["detailRole"]="interior"
        # Unknown legacy meshes keep their established name/spatial classification.
        # In particular yurt_orange contains BOTH interior poles and exterior crown/door.
    for o in bpy.context.scene.objects:
        if o.type=="EMPTY" and "_door" in o.name:
            o.rotation_euler.z=math.radians(-102 if CURRENT=="house_a" or "door0" in o.name else 102)
    bake_occlusion()
    for im in bpy.data.images:
        if im.source=="FILE":im.pack()
    scene=bpy.context.scene;scene.unit_settings.system="METRIC";scene.unit_settings.scale_length=1
    scene["reference"]=json.dumps(REFERENCES);scene["assetContract"]="metres; Blender Z up; Three x,z,-y; COLOR_0=(AO,AO,sky); object detailRole; same legacy pad"
    scene["designStatus"]="Traditional living-space interpretation; exact local household plan and motifs unverified; no specific year reconstruction"
    bpy.ops.wm.save_as_mainfile(filepath=str(SRC/(CURRENT+"-lived.blend")))
def export_current():
    selected=[o for o in bpy.context.scene.objects if o.type in("MESH","EMPTY") and not o.name.startswith("preview_")]
    bpy.ops.object.select_all(action="DESELECT")
    for o in selected:o.select_set(True)
    path=OUT/CONTRACTS[CURRENT]["file"]
    bpy.ops.export_scene.gltf(filepath=str(path),export_format="GLB",use_selection=True,export_apply=True,export_extras=True,
       export_vertex_color="ACTIVE",export_all_vertex_colors=False,export_animations=False,export_lights=False,export_cameras=False)
    meta={**CONTRACTS[CURRENT],"source":str((SRC/(CURRENT+"-lived.blend")).relative_to(ROOT)),"references":REFERENCES,
      "provenance":"Exterior shell meshes preserved from published legacy GLB in editable source; complete replacement interior and handcrafted textile patterns are design interpretations, not surveyed or photo-exact",
      "coordinates":"Three local x,y,z (metadata); Blender source is x,-z,y","doorState":"fixed open; no interaction",
      "materialContract":"PBR maps retained; COLOR_0 is AO/sky, not RGB; all new mesh nodes include extras.detailRole",
      "limitations":["same template reused across the historical mixed layout","no indoor plumbing or modern hotel bathroom invented for the pastoral dwellings","wall/furniture collision and light probes not supplied by this asset"],
      "interiorFinish":"22mm warm timber board lining with actual door/window cutouts and formed sill covers around interior stone protrusions; a design interpretation, not a surveyed historic finish" if CURRENT=="house_a" else "Existing reed, lattice and felt envelope retained",
      "bytes":path.stat().st_size}
    if bpy.context.scene.get("softGoodsVersion"):
        meta["softGoods"]={"version":bpy.context.scene["softGoodsVersion"],"objects":sum(o.get("softGoodsVersion")==bpy.context.scene["softGoodsVersion"] for o in selected),
          "scope":"four folded blankets and three seat cushions; sewn geometry, original placement and exact envelope; existing materials",
          "sourceRecipe":"tools/blender/v2_soft_goods.py"}
    if bpy.context.scene.get("teaServiceVersion"):
        meta["teaService"]={"version":bpy.context.scene["teaServiceVersion"],"objects":sum(o.get("teaServiceVersion")==bpy.context.scene["teaServiceVersion"] for o in selected),
          "scope":"existing kettles, ceramic bowls and tea trays; curved hollow spouts, continuous handles, foot rings and rolled rims; unchanged placement/materials",
          "sourceRecipe":"tools/blender/v2_tea_service.py"}
    if bpy.context.scene.get("beddingVersion"):
        meta["bedding"]={"version":bpy.context.scene["beddingVersion"],"objects":sum(o.get("beddingVersion")==bpy.context.scene["beddingVersion"] for o in selected),
          "scope":"existing filled quilts, compressed felt mattresses and fitted bed runner; unchanged objects, materials and placement",
          "sourceRecipe":"tools/blender/v2_bedding.py"}
    if bpy.context.scene.get("joineryVersion"):
        meta["joinery"]={"version":bpy.context.scene["joineryVersion"],"objects":sum(o.get("joineryVersion")==bpy.context.scene["joineryVersion"] for o in selected),
          "scope":"framed beds, frame-and-panel storage chests, breadboard lids; house wall-supported entrance cross beam with curved knees outside door swing, 2.06m passage clearance",
          "sourceRecipe":"tools/blender/v2_joinery.py"}
    if bpy.context.scene.get("porchVersion"):
        meta["porch"]={"version":bpy.context.scene["porchVersion"],"sourceRecipe":"tools/blender/v2_porch.py",
          "bounds":{"x0":-3.45,"x1":3.45,"z0":2.78,"z1":4.76},"deckY":-.115,"groundY":-.35,
          "scope":"complete covered timber platform, columns and braces, clear central entry, bench with wool cushion, dry fuel rack and open stave bucket; authored terrain cut, full mesh collision and relocated original plants",
          "minimumFrontClearance":2.06,"status":"shared prototype, household-specific possessions and ageing remain"}
    (SRC/(CURRENT+"-lived.metadata.json")).write_text(json.dumps(meta,ensure_ascii=False,indent=2))
    (OUT/(CURRENT+"_lived.metadata.json")).write_text(json.dumps(meta,ensure_ascii=False,indent=2))
    print(json.dumps({"asset":CURRENT,"file":str(path),"bytes":path.stat().st_size,"meshObjects":sum(o.type=="MESH"for o in selected)}),flush=True)
def preview():
    scene=bpy.context.scene;scene.world=bpy.data.worlds.new("preview_world");scene.world.use_nodes=True
    scene.world.node_tree.nodes["Background"].inputs["Color"].default_value=(.65,.75,.9,1);scene.world.node_tree.nodes["Background"].inputs["Strength"].default_value=.55
    sun=bpy.data.lights.new("preview_sun","SUN");sun.energy=2;sun.angle=.07;o=bpy.data.objects.new("preview_sun",sun);scene.collection.objects.link(o);o.rotation_euler=(.55,-.3,-.5)
    ld=bpy.data.lights.new("preview_entry_sky","AREA");ld.energy=95 if CURRENT=="house_a" else 110;ld.shape="DISK";ld.size=2
    o=bpy.data.objects.new("preview_entry_sky",ld);scene.collection.objects.link(o);o.location=(-2,-2.45,1.6)if CURRENT=="house_a"else(0,-3.15,1.6)
    o.rotation_euler=(Vector((-.4,.9,.9))-o.location).to_track_quat("-Z","Y").to_euler()
    cd=bpy.data.cameras.new("preview_camera");cam=bpy.data.objects.new("preview_camera",cd);scene.collection.objects.link(cam)
    cam.location=(1,-1.8,1.6)if CURRENT=="house_a"else(0,-2.2,1.55);target=(-1,1,.85)if CURRENT=="house_a"else(0,1.4,.82)
    cam.rotation_euler=(Vector(target)-cam.location).to_track_quat("-Z","Y").to_euler();cd.lens=18;scene.camera=cam
    scene.render.engine="CYCLES";scene.cycles.device="CPU";scene.cycles.samples=20;scene.cycles.use_denoising=True
    scene.render.resolution_x=1200;scene.render.resolution_y=800;scene.render.resolution_percentage=100;scene.view_settings.view_transform="AgX";scene.render.image_settings.file_format="PNG"
    scene.render.filepath=str(SRC/(CURRENT+"-interior.preview.png"));bpy.ops.render.render(write_still=True)
    cam.location=(8,-10,6)if CURRENT=="house_a"else(7,-8,5);cam.rotation_euler=(Vector((0,0,1.25))-cam.location).to_track_quat("-Z","Y").to_euler();cd.lens=40
    scene.render.filepath=str(SRC/(CURRENT+"-exterior.preview.png"));bpy.ops.render.render(write_still=True)
lib.material=cabin.material=yurt.material=compat_material
cabin.mats=yurt.mats=make_mats;cabin.interior=house_interior;yurt.interior=yurt_interior
cabin.bake_vertex_ao=yurt.bake_vertex_ao=lambda *a,**kw:None
cabin.export=yurt.export=save_asset
for CURRENT in(["house_a","yurt"]if args.asset=="all"else[args.asset]):
    if args.export_existing:
        bpy.ops.wm.open_mainfile(filepath=str(SRC/(CURRENT+"-lived.blend")))
        if args.rebake_occlusion:
            bake_occlusion()
            bpy.ops.wm.save_as_mainfile(filepath=str(SRC/(CURRENT+"-lived.blend")))
    elif CURRENT=="house_a":
        cabin.build("house_a",7.2,5.0,rows=8,pitch_deg=24,porch=0,front_windows=[-2.0],doors=[1.0],back_windows=[0],
          side_windows=False,lanterns=[1.9],seed=11)
    else:yurt.build("yurt",deck=False,seed=3)
    if args.refine_surfaces:
        from v2_interior_surfaces import refine_scene
        refine_scene(TEX)
        bpy.ops.wm.save_as_mainfile(filepath=str(SRC/(CURRENT+"-lived.blend")))
    export_current()
    if args.preview:preview()

