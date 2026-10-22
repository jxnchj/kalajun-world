"""Refine existing room textiles without rebuilding shells, furniture or lighting.
Run with tools/.bpy/bin/python tools/blender/v2_fabrics.py --asset all.
The caller must back up sources, their texture folders and published GLBs first.
Existing topology, UVs and material slots survive. No cloth simulation/GI claim.
"""
import argparse, hashlib, json, math, sys
from pathlib import Path
import bpy
import numpy as np
from v2_interior_surfaces import SURFACES, field, png, contact_ao

ROOT = Path(__file__).resolve().parents[2]
VERSION = "interior-fabrics-1"
SOURCES = {"house_a": "pastoral/house_a-lived.blend",
           "yurt": "pastoral/yurt-lived.blend",
           "lanchuan": "settlements/lanchuan-freedom.blend"}
# Position/extent authority is the existing authored cloth, in Blender metres.
CLOTH = {
 "pastoral_house_bed_quilt":(-2,1.12,.58,2.40,1.67,.4,.10,"quilt"),
 "pastoral_house_bed_foot":(-2,.46,.62,2.43,.46,1.2,.11,"runner"),
 "pastoral_house_chest_topcover":(.95,1.98,1.12,.94,.62,1,.06,"cover"),
 "pastoral_house_floor_rug":(-.5,-.55,.047,2.45,1.75,0,0,"rug"),
 "pastoral_house_bench_felt":(-2.1,-2.08,.51,1.4,.45,.6,.03,"cover"),
 "pastoral_yurt_centre_rug":(-.25,.85,.047,2.7,2.05,.4,0,"rug"),
 "pastoral_yurt_entry_runner":(0,-1.58,.048,1.05,1.52,.6,0,"rug"),
 "pastoral_yurt_honour_chest_topcover":(0,2.56,1.12,1.29,.62,1,.06,"cover"),
 "pastoral_yurt_sleep_quilt":(-2.15,.18,.57,.95,1.9,.7,.065,"quilt"),
 "pastoral_yurt_folded_saddlecloth":(1.05,-2,.64,.71,.61,1.1,.16,"cover"),
}

def smooth(a,b,v):
    t=max(0,min(1,(v-a)/(b-a)))
    return t*t*(3-2*t)

def gaussian(v,width):
    return math.exp(-(v/width)**2)

def bed_surface(x,y,cx,cy,z,w,d,phase,drop,modern):
    """Broad folded fabric; shared by the quilt and its overlying bed runner."""
    s=(x-cx)/w+.5;t=(y-cy)/d+.5
    xx=x-cx;yy=y-cy
    edge=max(0,(abs(s-.5)-(.39 if modern else .40))/(.11 if modern else .10))
    foot=max(0,((.12 if modern else .065)-t)/(.12 if modern else .065))
    side_drop=drop*edge**1.35
    foot_drop=(.10 if modern else .025)*min(1.25,foot)**1.3
    centre=max(0,1-(abs(s-.5)/.5)**4)
    head=1-smooth(.66,.92,t)
    loft=(.017 if modern else .013)*centre*math.sin(math.pi*max(0,min(1,t)))**2
    # Bent diagonal folds taper before the pillow, avoiding a uniform sine sheet.
    path1=-.24+.20*(yy+.25)+.075*math.sin(2.1*yy+phase)
    path2=.29-.24*(yy-.15)+.055*math.sin(3.4*yy-phase)
    ridge=(.035 if modern else .030)*gaussian(xx-path1,.105 if modern else .16)
    ridge+=(.023 if modern else .019)*gaussian(xx-path2,.13 if modern else .17)
    ridge-=.0045*gaussian(xx-path1-.13,.08 if modern else .14)
    ridge*=head*centre*(.48+.52*gaussian(yy+.12,.85))
    crease=.004*math.sin(xx*11+yy*4+phase)*math.sin(yy*7+.5)
    crease*=centre*head
    # 2–3 mm compressed sewn edge, resolved by existing outer grid strips.
    rim=min(max(0,s),max(0,1-s),max(0,t),max(0,1-t))
    hem=.0025*math.exp(-rim*rim/.0025)
    return z-side_drop-foot_drop+loft+ridge+crease+hem

def new_cloth_top(name,top,nx,ny):
    out=top.copy()
    modern=name.startswith("freedom")
    if modern:
        room=int(name[len("freedom")])-1
        cx=(.6,5.9,12)[room]
        is_runner=name.endswith("runner")
        for k,(x,y,z) in enumerate(top):
            # Runner follows the same duvet, including its front drape. This
            # removes the previous independent foot fold that cut into the quilt.
            h=bed_surface(x,y,cx,2.37,.65,2.02,1.88,room*.7,.16,True)
            if is_runner:
                h+=.028+.002*math.sin((x-cx)*6+room)*math.sin((y-1.42)*6)
            out[k,2]=h
        return out,"runner" if is_runner else "quilt"
    cx,cy,z0,w,d,phase,drop,kind=CLOTH[name]
    for k,(x,y,z) in enumerate(top):
        s=k%(nx+1)/nx;t=(k//(nx+1))/ny
        xx=x-cx;yy=y-cy
        if kind=="quilt":
            h=bed_surface(x,y,cx,cy,z0,w,d,phase,drop,False)
        elif kind=="runner":
            h=bed_surface(x,y,-2,1.12,.58,2.40,1.67,.4,.10,False)+.021
            h+=.0018*math.sin(xx*7+yy*8)
        elif kind=="rug":
            # No loose rug vertices below the .03 m floor. Restrained rolled
            # corners retain contact, instead of broad unsupported wave humps.
            edge=min(s,1-s,t,1-t)
            h=.048+.0015*math.sin(xx*4+phase)*math.sin(yy*3)
            h+=.004*gaussian(edge,.09)*(.55+.45*math.sin(xx*3+yy*4+phase))
        else:
            e=max(0,(abs(s-.5)-.40)/.10)
            h=z0-drop*e**1.25
            h+=.008*gaussian(xx+.15-.25*yy,.15)*math.sin(math.pi*t)**2
            h+=.004*math.sin(xx*7+yy*3+phase)*math.sin(math.pi*t)
            h+=.002*gaussian(min(s,1-s,t,1-t),.06)
        out[k,2]=h
    return out,kind

def curtain_top(name,top,nx,ny):
    out=top.copy();room=int(name[len("freedom")]);side=int(name[-1])
    base=float(np.mean(top[:nx+1,1]));phase=room*.37+side*.8
    for k,(x,y,z) in enumerate(top):
        u=(k%(nx+1))/nx;v=(k//(nx+1))/ny;release=1-v
        # Keep the upper rail attachment exactly. The lower pleats vary in
        # spacing, depth and lean without changing the opening's horizontal mask.
        warping=release*(.16*math.sin(math.tau*u+phase)+.09*math.sin(math.pi*v))
        theta=math.tau*4*u+warping
        amplitude=(.045+.024*release)*(1+.14*release*math.sin(math.tau*u+phase))
        h=base+amplitude*math.sin(theta)
        h+=.014*math.sin(math.pi*v)*math.sin(math.pi*u+phase)
        out[k,1]=y+(h-y)*release
        out[k,2]=z+.006*release**3*math.sin(math.tau*u+phase)
    return out

def deform(o):
    if o.get("textileRefinement")==VERSION:return False
    curtain="curtain" in o.name
    nx,ny=(24,12) if curtain else ((32,32) if o.name.startswith("freedom") else (14,12))
    count=(nx+1)*(ny+1);me=o.data
    assert len(me.vertices)==count*2,(o.name,len(me.vertices),count*2)
    old=np.array([tuple(v.co)for v in me.vertices]);top=old[:count]
    # Solidify's top/bottom correspondence is an explicit precondition, not a
    # nearest-point guess; stop if the source is hand-edited to another topology.
    assert all(tuple(me.polygons[j*nx+i].vertices)==(j*(nx+1)+i,j*(nx+1)+i+1,(j+1)*(nx+1)+i+1,(j+1)*(nx+1)+i) for j in range(ny) for i in range(nx))
    old_thickness=np.linalg.norm(old[count:]-top,axis=1)
    assert np.max(old_thickness)<.025 and np.min(old_thickness)>.008
    if curtain:new=curtain_top(o.name,top,nx,ny);kind="curtain"
    else:new,kind=new_cloth_top(o.name,top,nx,ny)
    grid=new.reshape(ny+1,nx+1,3)
    dy,dx=np.gradient(grid,axis=(0,1));norm=np.cross(dx,dy).reshape(count,3)
    norm/=np.linalg.norm(norm,axis=1,keepdims=True)
    if not curtain:assert np.min(norm[:,2])>0
    thickness=np.full(count,.018 if o.name.startswith("freedom") else .015)
    for k in range(count):
        u=k%(nx+1)/nx;v=k//(nx+1)/ny;rim=min(u,1-u,v,1-v)
        if curtain:
            thickness[k]=.003+.006*gaussian(v,.06)+.003*gaussian(min(u,1-u),.045)
            if v==1:thickness[k]=old_thickness[k]
        elif kind=="quilt":
            thickness[k]+=.007*math.sin(math.pi*u)**2*math.sin(math.pi*v)**2
    bottom=new-norm*thickness[:,None]
    # Preserve source top anchors and their original underside at curtain rail.
    if curtain:bottom[-nx-1:]=old[count:][-nx-1:]
    for k,p in enumerate(np.concatenate((new,bottom))):me.vertices[k].co=p
    for p in me.polygons:p.use_smooth=p.index<nx*ny*2
    me.update()
    o["textileRefinement"]=VERSION
    o["textileKind"]=kind
    o["textileDetail"]="existing topology: asymmetric drape, compressed edges and resolved thickness"
    return True

def weave_maps(rough,kind,seed):
    n=512;y,x=np.mgrid[:n,:n]/n
    broad=field(x,y,seed);slub=field(x,y,seed+91,5)
    # 64/76 threads per image, with existing 3x UV detail repeat. Lower amplitude
    # than the previous 96/112 checker; mipmapping can average distant fibres.
    warp=np.sin(math.tau*(x*64+.025*broad))
    weft=np.sin(math.tau*(y*76+.032*broad))
    height=.11*warp+.10*weft+.025*slub+.018*broad
    if kind=="wool":height+=.025*field(x,y,seed+3,11)
    dy=(np.roll(height,-1,0)-np.roll(height,1,0))*.5
    dx=(np.roll(height,-1,1)-np.roll(height,1,1))*.5
    normal=np.stack([-dx,-dy,np.ones_like(dx)],axis=-1)
    normal/=np.linalg.norm(normal,axis=2,keepdims=True)
    rr=np.clip(rough+.018*broad+.012*slub+.009*warp*weft,.88,.985)
    return {"normal":normal*.5+.5,"roughness":np.repeat(rr[:,:,None],3,axis=2)}

def refine_weave():
    changed=[]
    for m in bpy.data.materials:
        if m.name not in SURFACES or not m.users:continue
        _,rough,kind=SURFACES[m.name]
        if kind not in ("cloth","wool","pattern"):continue
        seed=int(hashlib.sha256(m.name.encode()).hexdigest()[:8],16)
        maps=weave_maps(rough,kind,seed)
        nodes=m.node_tree.nodes
        for key,data in maps.items():
            matches=[n for n in nodes if n.type=="TEX_IMAGE" and n.image and n.image.name.startswith(m.name+"-refined-"+key)]
            assert len(matches)==1,(m.name,key,len(matches))
            image=matches[0].image
            path=Path(bpy.path.abspath(image.filepath))
            assert path.exists(),path
            png(path,data);image.reload();image.colorspace_settings.name="Non-Color";image.pack()
        for n in nodes:
            if n.type=="NORMAL_MAP" and n.get("interiorSurfaceNode"):
                n.inputs["Strength"].default_value=.52 if kind=="wool" else .48
        m["textileRefinement"]=VERSION;changed.append(m.name)
    return changed

def refine(asset):
    path=ROOT/"assets/src/v2"/SOURCES[asset]
    bpy.ops.wm.open_mainfile(filepath=str(path))
    targets=[o for o in bpy.context.scene.objects if o.type=="MESH" and
        (o.name in CLOTH or (o.name.startswith("freedom") and
        (o.name.endswith(("_duvet","_runner")) or "_curtain"in o.name and not "track"in o.name)))]
    changed=[o for o in targets if deform(o)]
    materials=refine_weave()
    if changed:contact_ao(changed)
    bpy.context.scene["textileRefinement"]=VERSION
    bpy.ops.wm.save_as_mainfile(filepath=str(path))
    result={"asset":asset,"changedMeshes":[o.name for o in changed],
            "materials":materials,"triangles":sum(len(p.vertices)-2 for o in bpy.context.scene.objects if o.type=="MESH" for p in o.data.polygons),
            "source":str(path)}
    print(json.dumps(result),flush=True)

if __name__=="__main__":
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--asset",choices=["all",*SOURCES],default="all")
    args=parser.parse_args()
    for asset in SOURCES if args.asset=="all" else [args.asset]:refine(asset)
