"""Editable Schrenk spruce: shared hi/mid skeleton plus a separate near needle LOD.
Rebuild hi/mid: tools/.bpy/bin/python tools/blender/v2_spruce.py [--preview]
Create near source + recipe from editable hi: tools/.bpy/bin/python tools/blender/v2_spruce.py --needle-existing
Refresh compact controls only: tools/.bpy/bin/python tools/blender/v2_spruce.py --export-needle-recipe
Create v11 shared-GPU comparison sources: --gpu-existing [--preview --preview-variant pencil]
Export manual edits to that realised v11 source: --export-gpu-existing (source-only GLB)
Export arbitrary manual near mesh edits for explicit GLB loading: --export-needle-existing
The default runtime recipe uses hi control surfaces, not arbitrary realised-near edits.
Export manual edits to all existing sources: tools/.bpy/bin/python tools/blender/v2_spruce.py --export-existing
The export-existing path never rebuilds geometry or rewrites the skeleton.
Legacy spruce2 sources/textures are read only.
"""
import argparse, gzip, hashlib, json, math, random, struct, sys
from pathlib import Path
import bpy
from mathutils import Vector
sys.path.insert(0,str(Path(__file__).parent))
from lib import MeshBuilder, log, CARD_MATS

ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/"web/public/assets/v2"; SOURCE=ROOT/"assets/src/v2/spruce"
OUT.mkdir(parents=True,exist_ok=True);SOURCE.mkdir(parents=True,exist_ok=True)
SPEC=json.loads((ROOT/"web/src/v2/spruce-spec.json").read_text())
UV=json.loads((ROOT/"assets/tex/spruce_atlas.json").read_text())
H=SPEC["height"]
parser=argparse.ArgumentParser()
parser.add_argument("--canopy-existing",action="store_true",help="Create independent v13 hi/mid/near photo-volume sources from exact runtime derivation")
parser.add_argument("--branch-existing",action="store_true",help="Realise one v12 form from the exact runtime near-branch controls into a separate editable source")
parser.add_argument("--preview-branch-role",choices=["hanging","side"],help="Frame a remaining branch role rather than a terminal tip")
parser.add_argument("--export-gpu-existing",action="store_true",help="Export manually edited realised v11 Blender source to source-only GLB, never rebuild")
parser.add_argument("--gpu-existing",action="store_true",help="Derive separate v11 editable shell and realised needle sources from current hi/needle; never overwrite them")
parser.add_argument("--export-existing",action="store_true")
parser.add_argument("--export-needle-existing",action="store_true",help="Export only manually edited realised near mesh to the source comparison directory")
parser.add_argument("--export-needle-recipe",action="store_true",help="Export compact near-brush controls from the editable hi source, without rebuilding meshes")
parser.add_argument("--candidate-dir",help="Stage geometry and previews below the spruce source directory")
parser.add_argument("--volume-input",help="Explicit editable input .blend; used when refining a staged candidate")
parser.add_argument("--needle-existing",action="store_true",help="Create separate extreme-near needle LOD from current editable hi, never overwrite hi")
parser.add_argument("--prototype-needle",action="store_true",help="Render one edited variant without saving or exporting an asset")
parser.add_argument("--preview-lod",choices=["hi","needle"],default="hi")
parser.add_argument("--preview-variant",choices=["column","edge","old","pencil","young"],default="column")
parser.add_argument("--preview-detail-only",choices=["before","after"],help="Render current hi source without exporting or saving it")
parser.add_argument("--preview",action="store_true")
parser.add_argument("--preview-inner-only",action="store_true",help="Frame the same lower inner spray for before/after comparison")
parser.add_argument("--surface-existing",action="store_true",help="Add needle surface data to the current hi material without rebuilding geometry")
parser.add_argument("--trim-existing",action="store_true",help="Conservatively trim current editable sources without rebuilding their skeleton")
args=parser.parse_args()
if args.candidate_dir:
 import shutil
 stage=(SOURCE/args.candidate_dir).resolve()
 if not stage.is_relative_to(SOURCE.resolve()):raise ValueError("Candidate must remain inside the spruce source directory")
 stage.mkdir(parents=True,exist_ok=True)
 if not (stage/"export-report.json").exists():shutil.copy2(SOURCE/"export-report.json",stage/"export-report.json")
 SOURCE=stage;OUT=stage/"exports";OUT.mkdir(exist_ok=True)

def radius(f,y):
 t=max(0,min(1,(y-f["base"])/(H-f["base"])))
 return f["rmax"]*(1-t)**f["pw"]*(.88+.12*math.sin(t*7.3+f["seed"]))+.12

def skeleton(f):
 # Keep the original random sequence, primary branch identities and crown envelope.
 # A separate deterministic stream varies attachments, so adding leaf detail does not
 # reshuffle the other whorls or move a tree root in the world.
 rng=random.Random(f["seed"]);out=[];y=16.45;tier=0
 while y>f["base"]:
  n=f["branches"]+(tier%3==0);a0=rng.random()*math.tau
  for k in range(n):
   if rng.random()<f["gaps"]:continue
   a=a0+math.tau*k/n+rng.uniform(-.17,.17);t=(y-f["base"])/(H-f["base"])
   length=radius(f,y)*rng.uniform(.87,1.05)*(1+f["side"]*math.cos(a))
   if f["id"]=="old" and rng.random()<.12:length*=.55
   key=tier*10+k;detail=random.Random(f["seed"]*7919+key*47)
   attach=max(f["base"]+.08,y+detail.uniform(-.21,.21))
   pitch=math.radians(16-27*(1-t))+detail.uniform(-.075,.075)
   out.append(dict(y=attach,az=a,length=max(.28,length),pitch=pitch,droop=(.10+.23*(1-t))*detail.uniform(.85,1.2),tier=tier,key=key))
  y-=f["spacing"]*rng.uniform(.9,1.1);tier+=1
 return out

def branch_point(f,b,t):
 L=b["length"];a=b["az"]
 dz=math.tan(b["pitch"])*t-b["droop"]*t*t+.12*max(0,t-.65)**2/.1225
 return Vector((f["lean"]*b["y"]+math.cos(a)*(.1+L*t),math.sin(a)*(.1+L*t),b["y"]+L*dz))

def clusters(f,branches):
 out=[]
 for b in branches:
  rng=random.Random(f["seed"]*10000+b["key"]);L=b["length"]
  stations=[.30] if L<.9 else ([.20,.48,.73] if L>2.05 else [.22,.58])
  for station,t in enumerate(stations):
   for side in [-1,1]:
    at=max(.12,min(.82,t+rng.uniform(-.045,.045)))
    origin=branch_point(f,b,at)
    length=min(.74,max(.28,L*(.41 if L<1.3 else .34)))*rng.uniform(.87,1.1)
    out.append(dict(id=str(b["key"])+":"+str(station)+":"+str(side),branch=b["key"],origin=list(origin),
       az=b["az"]+side*rng.uniform(.56,.96),length=length,width=length*rng.uniform(.74,.93),
       pitch=b["pitch"]-rng.uniform(.08,.27),droop=rng.uniform(.18,.40),
       roll=side*rng.uniform(.15,.52),seed=f["seed"]*10000+b["key"]*17+station*2+(side+1)//2))
  # Short overlapping inner sprays preserve the continuous branch body at distance.
  # They are still twig-scale; no 2 m needle image is stretched across a primary branch.
  for station,t in enumerate([.04,.36] if L>1.2 else [.03]):
   length=min(.85,max(.34,L*.47));origin=branch_point(f,b,t)
   out.append(dict(id=str(b["key"])+":inner:"+str(station),branch=b["key"],role="inner",origin=list(origin),
       az=b["az"]+rng.uniform(-.10,.10),length=length,width=length*rng.uniform(.86,1.05),
       pitch=b["pitch"]-.04,droop=b["droop"]*.55,roll=rng.uniform(-.26,.26),
       seed=f["seed"]*10000+b["key"]*17+30+station))
  # Hanging secondary shoots span the whorl gaps while retaining light through the crown.
  length=min(.55,max(.30,L*.27+.12));origin=branch_point(f,b,.38)
  out.append(dict(id=str(b["key"])+":hanging",branch=b["key"],role="hanging",origin=list(origin),
      az=b["az"]+(-.45 if b["key"]%2 else .45),length=length,width=length*rng.uniform(.72,.90),
      pitch=-.94+rng.uniform(-.12,.14),droop=.16,roll=rng.uniform(-.35,.35),
      seed=f["seed"]*10000+b["key"]*17+39))
  # A smaller terminal spray continues the woody tip rather than a long needle-like card.
  at=.72;length=max(.20,min(.68,L*.40));origin=branch_point(f,b,at)
  out.append(dict(id=str(b["key"])+":tip",branch=b["key"],origin=list(origin),az=b["az"]+rng.uniform(-.13,.13),
      length=length,width=length*rng.uniform(.72,.88),pitch=b["pitch"]+.06,droop=.16,
      roll=rng.uniform(-.4,.4),seed=f["seed"]*10000+b["key"]*17+11))
 # A compact irregular leader carries the foliage almost to 18 m without a bare spike.
 for i in range(14):
  y=16.25+i*.115;length=max(.10,(18.08-y)*.25);a=i*2.39996+f["seed"]*.09
  out.append(dict(id="leader:"+str(i),branch=-1,origin=[f["lean"]*y,0,y],az=a,length=length,
      width=max(.075,length*.68),pitch=.45,droop=.08,roll=math.sin(i*1.7)*.3,seed=f["seed"]*10000+9000+i))
 return out

SKELETONS={f["id"]:skeleton(f) for f in SPEC["variants"]}
CLUSTERS={f["id"]:clusters(f,SKELETONS[f["id"]]) for f in SPEC["variants"]}
if not (args.export_existing or args.trim_existing or args.surface_existing or args.needle_existing or args.preview_detail_only or args.prototype_needle or args.export_needle_recipe or args.export_needle_existing or args.gpu_existing or args.export_gpu_existing or args.branch_existing or args.canopy_existing):
 (SOURCE/"shared-skeleton.json").write_text(json.dumps(dict(spec=SPEC,branches=SKELETONS,clusters=CLUSTERS),indent=2))

def material(name,path=None,color=(1,1,1,1),alpha=False):
 m=bpy.data.materials.new(name);m.use_nodes=True;m.use_backface_culling=False
 bs=m.node_tree.nodes.get("Principled BSDF");bs.inputs["Base Color"].default_value=color
 bs.inputs["Roughness"].default_value=.88 if alpha else .93
 if path:
  tex=m.node_tree.nodes.new("ShaderNodeTexImage");tex.image=bpy.data.images.load(str(path),check_existing=True)
  if alpha:
   # A supported glTF multiply factor warms the blue-green source without baking light
   # or changing the archived texture. The exported factor is checked after generation.
   tint=m.node_tree.nodes.new("ShaderNodeMix");tint.data_type="RGBA";tint.blend_type="MULTIPLY";tint.inputs[0].default_value=1
   tint.inputs[7].default_value=(.96,1,.74,1)
   m.node_tree.links.new(tex.outputs["Color"],tint.inputs[6])
   m.node_tree.links.new(tint.outputs[2],bs.inputs["Base Color"])
   alpha=m.node_tree.nodes.new("ShaderNodeMath");alpha.operation="GREATER_THAN";alpha.inputs[1].default_value=.45
   m.node_tree.links.new(tex.outputs["Alpha"],alpha.inputs[0])
   m.node_tree.links.new(alpha.outputs[0],bs.inputs["Alpha"])
   if hasattr(m,"surface_render_method"):m.surface_render_method="DITHERED"
   if hasattr(m,"blend_method"):m.blend_method="CLIP"
   if hasattr(m,"alpha_threshold"):m.alpha_threshold=.45
   CARD_MATS.add(name)
  else:m.node_tree.links.new(tex.outputs["Color"],bs.inputs["Base Color"])
 return m

def needle_surface_texture():
 # Derive a shallow, mip-filterable relief from the EXISTING needle coverage and
 # local luminance. Albedo/alpha stay byte-identical; no procedural pixel noise.
 import numpy as np
 from PIL import Image,ImageFilter
 image=Image.open(ROOT/"assets/tex/spruce_atlas.png").convert("RGBA").resize((1024,512),Image.Resampling.LANCZOS)
 rgba=np.asarray(image,dtype=np.float32)/255
 alpha=np.asarray(image.getchannel("A").filter(ImageFilter.GaussianBlur(.65)),dtype=np.float32)/255
 rgb=rgba[:,:,:3];luma=rgb[:,:,0]*.2126+rgb[:,:,1]*.7152+rgb[:,:,2]*.0722
 luma=np.asarray(Image.fromarray(np.round(luma*255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(.8)),dtype=np.float32)/255
 height=(alpha*.70+luma*.30)*.60
 dy,dx=np.gradient(height)
 # Texture rows run down while tangent-space V runs up.
 slopes=np.stack((-dx*1.9,dy*1.9),axis=-1)
 lengths=np.linalg.norm(slopes,axis=-1)
 slopes*=np.minimum(1.,.18/np.maximum(lengths,1.e-8))[:,:,None]
 normals=np.dstack((slopes,np.ones_like(alpha)))
 normals/=np.linalg.norm(normals,axis=-1)[:,:,None]
 encoded=np.clip(np.rint((normals*.5+.5)*255),0,255).astype(np.uint8)
 path=SOURCE/"needle-surface-normal.png";Image.fromarray(encoded).save(path)
 angles=np.degrees(np.arctan(np.linalg.norm(slopes,axis=-1)))
 report=dict(revision="needle-bundle-surface-v1",source="assets/tex/spruce_atlas.png",
  width=1024,height=512,normalStrength=.65,maxEncodedSlope=.18,
  maxAngleDegrees=float(angles.max()),coveredP95AngleDegrees=float(np.percentile(angles[rgba[:,:,3]>.45],95)),
  albedoAndAlpha="unchanged",geometry="unchanged",lod="hi only; runtime fade 10-38 m")
 (SOURCE/"needle-surface-report.json").write_text(json.dumps(report,indent=2))
 return path

def apply_needle_surface():
 path=needle_surface_texture()
 for mat in bpy.data.materials:
  if mat.name!="frond":continue
  nodes=mat.node_tree.nodes;links=mat.node_tree.links;bs=nodes.get("Principled BSDF")
  tex=nodes.get("Needle surface relief") or nodes.new("ShaderNodeTexImage");tex.name="Needle surface relief"
  tex.image=bpy.data.images.load(str(path),check_existing=True);tex.image.colorspace_settings.name="Non-Color";tex.image.pack()
  normal=nodes.get("Needle bundle normal") or nodes.new("ShaderNodeNormalMap");normal.name="Needle bundle normal"
  normal.inputs["Strength"].default_value=.65
  links.new(tex.outputs["Color"],normal.inputs["Color"]);links.new(normal.outputs["Normal"],bs.inputs["Normal"])
  mat["surfaceRevision"]="needle-bundle-surface-v1"
 bpy.context.scene["needleSurface"]="needle-bundle-surface-v1"

def spray(mb,c,hi):
 base=Vector(c["origin"]);a=c["az"];L=c["length"];width=c["width"]
 d=Vector((math.cos(a),math.sin(a),0));side=Vector((-d.y,d.x,0))
 up=Vector((0,0,1));roll=c["roll"]
 lateral=side*math.cos(roll)+up*math.sin(roll)
 vertical=up*math.cos(roll)-side*math.sin(roll)
 rng=random.Random(c["seed"]);flip=-1 if rng.random()<.5 else 1
 u0,v0,u1,v1=UV["branch"];uc=(u0+u1)/2;hu=(u1-u0)/2
 def point(t):
  dz=math.tan(c["pitch"])*t-c["droop"]*t*t+.10*max(0,t-.65)**2/.1225
  return base+d*(L*t)+up*(L*dz)
 if hi:
  # Curved, folded needle fans have parallax instead of one long sheet per main branch.
  fold=.22+rng.random()*.22;segments=1 if c.get("role")=="inner" else 2
  for sign in [-1,1]:
   P=[]
   for k in range(segments+1):
    t=k/segments;p=point(t)
    e=lateral*sign*math.cos(fold)*width*.5-vertical*math.sin(fold)*width*.5
    P.append([p,p+e])
   mb.quad_strip_grid("frond",P,lambda i,j,sign=sign:(uc+hu*j*sign*flip,v0+(v1-v0)*i/segments))
 else:
  # Every cluster remains. Only its interior fold/tessellation simplifies.
  P=[[point(t)-lateral*width*.5,point(t)+lateral*width*.5] for t in [0,1]]
  mb.quad_strip_grid("frond",P,lambda i,j:(uc+hu*(j*2-1)*flip,v0+(v1-v0)*i))
 # Retain the same orthogonal hanging spray and its root/tip silhouette in both LODs.
 h=width*.48
 P=[[point(t)+vertical*h*.52,point(t)-vertical*h] for t in [0,1]]
 mb.quad_strip_grid("frond",P,lambda i,j:(uc+hu*(1-j*2)*flip,v0+(v1-v0)*i))


# These two shallow corner cuts fit the EXISTING 2-row folded fan topology.
# The orthogonal side cards, inner 1-row fans and all mid-LOD geometry stay intact:
# full convex-hull clipping would multiply their triangles and vertex wind work.
# Insets are fractions of the branch atlas rectangle (not world crown dimensions).
ALPHA_TRIM_REVISION="conservative-fixed-topology-v1"
ALPHA_END_INSETS={"bottom_left":.38,"bottom_right":0.,"top_left":0.,"top_right":.05}

def trim_alpha(ob):
 me=ob.data
 if not ob.name.endswith("_frond") or ob.get("lod")!="hi":return None
 if ob.get("alphaTrim")==ALPHA_TRIM_REVISION:return None
 if ob.get("alphaTrim"):raise ValueError("Restore the untrimmed editable source before changing the trim envelope")
 me.calc_loop_triangles()
 before_area=sum(t.area for t in me.loop_triangles);before_tri=len(me.loop_triangles)
 # Retain the ORIGINAL per-corner lighting normals; changing a transparent corner
 # must not change the smoothing weights on neighbouring visible needles.
 normals=[n.vector.copy() for n in me.corner_normals]
 positions=[v.co.copy() for v in me.vertices]
 wind=me.attributes["_PLANT_WIND"];ao=me.attributes["_CROWN_OCCLUSION"]
 old_wind=[x.vector.copy() for x in wind.data];old_ao=[x.value for x in ao.data]
 uv=me.uv_layers.active;u0,v0,u1,v1=UV["branch"];uc=(u0+u1)/2
 by_vertex=[[] for v in me.vertices];polys_by_vertex=[[] for v in me.vertices]
 for p in me.polygons:
  for li in p.loop_indices:
   vi=me.loops[li].vertex_index;by_vertex[vi].append(li);polys_by_vertex[vi].append(p.index)
 moved=0
 # A 2-quad strip is an isolated connected component with 6 vertices. Existing
 # standalone rectangles remain untouched rather than gaining extra triangles.
 visited=set()
 for p in me.polygons:
  if p.index in visited:continue
  todo=[p.index];component=set();vertices=set()
  while todo:
   pi=todo.pop()
   if pi in component:continue
   component.add(pi);visited.add(pi)
   for vi in me.polygons[pi].vertices:
    vertices.add(vi);todo.extend(q for q in polys_by_vertex[vi] if q not in component)
  if len(component)!=2 or len(vertices)!=6:continue
  coords={vi:uv.data[by_vertex[vi][0]].uv.copy() for vi in vertices}
  for vi,t in coords.items():
   at_bottom=abs(t.y-v0)<1e-6;at_top=abs(t.y-v1)<1e-6
   if not (at_bottom or at_top):continue
   left=abs(t.x-u0)<1e-6;right=abs(t.x-u1)<1e-6
   if not (left or right):continue
   inset=ALPHA_END_INSETS[("bottom" if at_bottom else "top")+("_left" if left else "_right")]
   if inset<=0:continue
   centre=next(k for k,s in coords.items() if abs(s.y-t.y)<1e-6 and abs(s.x-uc)<1e-6)
   ratio=1-2*inset
   me.vertices[vi].co=positions[centre].lerp(positions[vi],ratio)
   wind.data[vi].vector=old_wind[centre].lerp(old_wind[vi],ratio)
   ao.data[vi].value=old_ao[centre]*(1-ratio)+old_ao[vi]*ratio
   for li in by_vertex[vi]:
    uv.data[li].uv=(uc+(t.x-uc)*ratio,t.y)
    poly=next(me.polygons[pi] for pi in component if li in me.polygons[pi].loop_indices)
    cli=next(k for k in poly.loop_indices if me.loops[k].vertex_index==centre)
    normals[li]=normals[cli].lerp(normals[li],ratio).normalized()
   moved+=1
 me.update();me.normals_split_custom_set(normals);me.calc_loop_triangles()
 after_area=sum(t.area for t in me.loop_triangles)
 assert len(me.loop_triangles)==before_tri
 ob["alphaTrim"]=ALPHA_TRIM_REVISION
 return dict(verticesMoved=moved,vertices=len(me.vertices),triangles=before_tri,
             areaBefore=before_area,areaAfter=after_area,areaRemovedFraction=1-after_area/before_area)


def trunk(mb,f,hi):
 # Spend the existing trunk rings on the root collar instead of a straight pole.
 # The root origin, mature height and upper trunk radius are unchanged.
 heights=[-.25,0,.30,.70,1.25,2.4,4.4,7.2,10.5,13.5,16,17.75] if hi else [-.25,0,.4,1.2,3.5,8,13,17.75]
 sides=8 if hi else 6;base_radius=.23 if f["id"]=="young" else .28;P=[]
 for y in heights:
  height=max(0,y);flare=1+.65*math.exp(-height/.45)
  r=base_radius*(1-.96*(y+.25)/18)
  row=[]
  for k in range(sides+1):
   a=k/sides*math.tau
   lobe=1+(.13*math.cos(a*3+f["seed"])+.07*math.sin(a*5-f["seed"]))*math.exp(-height/.5)
   row.append(Vector((f["lean"]*(y+.25)+math.cos(a)*r*flare*lobe,math.sin(a)*r*flare*lobe,y)))
  P.append(row)
 mb.quad_strip_grid("bark",P,lambda i,j:((heights[i]+.25)/1.3,j/sides))
 for ring in [0,len(P)-1]:
  center=Vector((f["lean"]*(heights[ring]+.25),0,heights[ring]))
  verts=[center]+P[ring][:-1]
  faces=[(0,1+k,1+(k+1)%sides) for k in range(sides)]
  uvs=[[(.5,.5),(.5+.45*math.cos(k/sides*math.tau),.5+.45*math.sin(k/sides*math.tau)),(.5+.45*math.cos((k+1)/sides*math.tau),.5+.45*math.sin((k+1)/sides*math.tau))] for k in range(sides)]
  mb.add("bark",verts,faces,uvs)

def build(lod):
 bpy.ops.wm.read_factory_settings(use_empty=True)
 mats={"frond":material("frond",ROOT/"assets/tex/spruce_atlas.png",alpha=True),
       "bark":material("bark",ROOT/"assets/tex/bark.png"),
       "core":material("core",color=(.032,.059,.025,1))}
 for f in SPEC["variants"]:
  mb=MeshBuilder();hi=lod=="hi"
  trunk(mb,f,hi)
  for b in SKELETONS[f["id"]]:
   count=3 if hi else 1;L=b["length"]
   for j in range(count):
    pa=branch_point(f,b,j/count);pb=branch_point(f,b,(j+1)/count)
    log(mb,"bark",pa,pb,max(.008,.035*(1-j/count)*(L/2)),seg=4 if hi else 3,rings=2,taper=.50,wobble=0,seed=b["key"]+j,caps=False)
  for c in CLUSTERS[f["id"]]:spray(mb,c,hi)
  if f["base"]>2:
   for i in range(10):
    y=.6+i*.26;a=i*2.4;L=.35+(i%3)*.16
    log(mb,"bark",(f["lean"]*y,0,y),(f["lean"]*y+math.cos(a)*L,math.sin(a)*L,y-.2),.024,seg=4,rings=2,taper=.85,wobble=0,seed=i,caps=False)
  rings=10;sides=6;P=[]
  for j in range(rings+1):
   y=f["base"]+.15+(17-f["base"])*j/rings;r=radius(f,y)*.16
   P.append([Vector((f["lean"]*y+r*math.cos(k/sides*math.tau),r*math.sin(k/sides*math.tau),y)) for k in range(sides+1)])
  mb.quad_strip_grid("core",P,lambda i,j:(j/sides,i/rings))
  for ob in mb.build(f["id"],mats):
   ob["variant"]=f["id"];ob["lod"]=lod;ob["height"]=H;ob["foliageClusters"]=len(CLUSTERS[f["id"]])
   me=ob.data;wind=me.attributes.new("_PLANT_WIND","FLOAT_VECTOR","POINT");ao=me.attributes.new("_CROWN_OCCLUSION","FLOAT","POINT")
   for i,v in enumerate(me.vertices):
    y=v.co.z;r=math.hypot(v.co.x-f["lean"]*y,v.co.y);fraction=min(1,r/max(.2,radius(f,y)))
    wind.data[i].vector=(max(0,y/H),fraction*fraction*.55,((round(y/.55)*.37+math.atan2(v.co.y,v.co.x-f["lean"]*y))%math.tau))
    ao.data[i].value=.48+.50*fraction
   for p in me.polygons:p.use_smooth=True
   me.update()
   trim_alpha(ob)
 scene=bpy.context.scene;scene.unit_settings.system="METRIC";scene["source"]=str(Path(__file__).relative_to(ROOT))
 scene["skeleton"]="assets/src/v2/spruce/shared-skeleton.json";scene["sourceReference"]=SPEC["sourceURL"]
 scene["assetRevision"]="cluster-canopy-v4"
 if lod=="hi":apply_needle_surface()
 for img in bpy.data.images:
  if img.source=="FILE":img.pack()
 bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE/f"schrenk-spruce-{lod}.blend"))

def export(lod):
 objs=[o for o in bpy.context.scene.objects if o.type=="MESH" and "variant" in o]
 bpy.ops.object.select_all(action="DESELECT")
 for o in objs:o.select_set(True)
 bpy.context.view_layer.objects.active=objs[0]
 destination=OUT/f"schrenk-spruce-{lod}.glb";pending=OUT/f"schrenk-spruce-{lod}.pending.glb"
 bpy.ops.export_scene.gltf(filepath=str(pending),export_format="GLB",use_selection=True,export_yup=True,export_apply=False,
  export_animations=False,export_attributes=True,export_extras=True,export_materials="EXPORT",export_cameras=False,export_lights=False)
 if lod=="needle":
  from meshopt_lossless import compress_glb
  compressed=SOURCE/"schrenk-spruce-needle.meshopt.glb"
  report=compress_glb(pending,compressed)
  payload=gzip.compress(compressed.read_bytes(),compresslevel=9,mtime=0)
  archive=SOURCE/"exports";archive.mkdir(exist_ok=True)
  zipped=archive/"schrenk-spruce-needle.glb.gz";stage=zipped.with_suffix(".pending.gz")
  stage.write_bytes(payload);stage.replace(zipped)
  report.update(transport="gzip + EXT_meshopt_compression, no quantization",transportBytes=len(payload),comparisonPath=str(zipped.relative_to(ROOT)),defaultRuntimeURL="./assets/v2/schrenk-spruce-needle.recipe.json.gz")
  (SOURCE/"needle-compression-report.json").write_text(json.dumps(report,indent=2))
  pending.unlink()
 else:pending.replace(destination)
 stats={}
 for o in objs:
  o.data.calc_loop_triangles();stats[o["variant"]]=stats.get(o["variant"],0)+len(o.data.loop_triangles)
 print(lod,json.dumps(stats),flush=True)
 return stats

def preview(lod):
 scene=bpy.context.scene;scene.render.engine="CYCLES";scene.cycles.samples=24;scene.cycles.use_denoising=True
 scene.render.resolution_x=1600;scene.render.resolution_y=900;scene.render.resolution_percentage=100
 if scene.world is None:scene.world=bpy.data.worlds.new("Canopy preview world")
 scene.world.use_nodes=True;scene.world.node_tree.nodes["Background"].inputs[0].default_value=(.60,.68,.76,1)
 scene.world.node_tree.nodes["Background"].inputs[1].default_value=.7
 objects=[o for o in scene.objects if o.type=="MESH" and "variant" in o]
 for ob in objects:ob.location.x=(next(i for i,f in enumerate(SPEC["variants"]) if f["id"]==ob["variant"])-2)*6.2
 bpy.ops.mesh.primitive_plane_add(size=200,location=(0,0,-.3))
 ground=material("preview-ground",color=(.13,.16,.085,1));bpy.context.object.data.materials.append(ground)
 bpy.ops.object.light_add(type="SUN",location=(4,-8,20));sun=bpy.context.object;sun.data.energy=3;sun.data.angle=.15;sun.rotation_euler=(.45,-.35,-.35)
 bpy.ops.object.camera_add();camera=bpy.context.object;scene.camera=camera;camera.data.type="ORTHO"
 def take(name,location,target,scale):
  camera.location=location;camera.rotation_euler=(Vector(target)-camera.location).to_track_quat("-Z","Y").to_euler();camera.data.ortho_scale=scale
  scene.render.filepath=str(SOURCE/f"preview-clusters-{lod}-{name}.png");bpy.ops.render.render(write_still=True)
 for name,location in [("front",(16,-42,20)),("rear",(-18,42,20))]:take(name,location,(0,0,8.7),40)
 # Isolate the mature column for a side view, and the lower crown for material/parallax review.
 for ob in objects:ob.hide_render=ob["variant"]!="column"
 take("side",(-12.4+30,1,13),(-12.4,0,9),36)
 take("branches",(-12.4+5,-8,8),(-12.4,0,6.6),5.2)
 take("root",(-12.4+2,-4,1.4),(-12.4,0,.7),3.8)


VOLUME_REVISION="inner-brushes-v7"
# One editable brush recipe is applied to distinct source control surfaces.
# Existing terminal needles keep their per-cluster RNG, topology and wind.
BRUSH_TEMPLATE=dict(sideShootPairs=6,sideNeedleStations=22,centralNeedleStations=24,
 needlesPerStation=5,needleTriangles=1440,woodTriangles=156,innerHeightMetres=8)

def volume_frond(ob,f):
 """Replace lower terminal and inner sprays with true radial short-needle brushes.
 Current hand-edited control positions, wind/AO, bark and upper crown are preserved.
 Near-only output is separate from hi/mid; do not extend it to the 62 m hi range.
 """
 if not ob.name.endswith("_frond") or ob.get("lod")!="hi":return None
 if ob.get("needleVolume")==VOLUME_REVISION:return None
 if ob.get("needleVolume"):raise ValueError("Restore the backed-up source before applying a different volume conversion")
 old=ob.data;old.calc_loop_triangles();before=len(old.loop_triangles)
 uv=old.uv_layers.active
 wind=old.attributes["_PLANT_WIND"];ao=old.attributes["_CROWN_OCCLUSION"]
 verts=[];faces=[];uvs=[];winds=[];aos=[];normals=[]
 def emit(points,coords,weights,occlusion,face_normals=None):
  offset=len(verts);verts.extend(points);winds.extend(weights);aos.extend(occlusion)
  faces.append(tuple(range(offset,offset+len(points))));uvs.append(coords)
  normals.append(face_normals)
 def unchanged(poly):
  ids=list(poly.vertices)
  emit([old.vertices[i].co.copy() for i in ids],[uv.data[li].uv.copy() for li in poly.loop_indices],
   [wind.data[i].vector.copy() for i in ids],[ao.data[i].value for i in ids],
   [old.corner_normals[li].vector.copy() for li in poly.loop_indices])
 def sample(poly,t,r):
  # MeshBuilder ordering is lower centre/edge, upper edge/centre.
  ids=list(poly.vertices);w=[(1-t)*(1-r),(1-t)*r,t*r,t*(1-r)]
  point=sum((old.vertices[i].co*s for i,s in zip(ids,w)),Vector())
  tex=sum((uv.data[li].uv*s for li,s in zip(poly.loop_indices,w)),Vector((0,0)))
  weights=sum((wind.data[i].vector*s for i,s in zip(ids,w)),Vector())
  angles=[wind.data[i].vector.z for i in ids]
  weights.z=math.atan2(sum(math.sin(a)*s for a,s in zip(angles,w)),sum(math.cos(a)*s for a,s in zip(angles,w)))%math.tau
  return point,tex,weights,sum(ao.data[i].value*s for i,s in zip(ids,w))
 def uv_patch(tex,count):
  # A subtexel patch inside the original atlas's opaque interior. Nonzero UV
  # area is required by tangent normal mapping even when sampling one colour.
  du=.30/2048;dv=.30/1024
  if count==3:return [tex+Vector((-du,-dv)),tex+Vector((du,-dv)),tex+Vector((0,dv))]
  return [tex+Vector((-du,-dv)),tex+Vector((du,-dv)),tex+Vector((du,dv)),tex+Vector((-du,dv))]
 def needle(base,tip,axis,tex,weights,occlusion):
  direction=(tip-base).normalized();side=direction.cross(axis).normalized()
  if side.length<.1:side=direction.cross(Vector((1,0,0))).normalized()
  # One two-sided, radially oriented needle triangle spends the same triangle
  # budget on three times as many needles, not invisible microscopic side faces.
  r=.00115
  emit([base-side*r,base+side*r,tip],uv_patch(tex,3),[weights.copy()]*3,[occlusion]*3)
 cursor=0;shaped=0;inner_shaped=0;needles=0;max_shift=0.;tri_by_cluster=[];selected=None;instances=[]
 for ci,c in enumerate(CLUSTERS[f["id"]]):
  segments=1 if c.get("role")=="inner" else 2
  cluster_start=len(faces);start=cursor
  polys=[old.polygons[i] for i in range(cursor,cursor+segments*2+1)]
  cursor+=segments*2+1

  terminal=c["id"].endswith(":tip") and c["origin"][2]<10
  inner=c.get("role")=="inner" and c["origin"][2]<BRUSH_TEMPLATE["innerHeightMetres"]
  if terminal or inner:
   shaped+=int(terminal);inner_shaped+=int(inner)
   instances.append(dict(cluster=ci,id=c["id"],template="radial-brush-1440",sourceSegments=segments,seed=c["seed"]+60821,role="inner" if inner else "terminal"))
   root=sample(polys[0],0,0)[0];tip=sample(polys[segments-1],1,0)[0]
   along=(tip-root).normalized()
   left=sample(polys[0],.5,1)[0]-sample(polys[0],.5,0)[0]
   normal=along.cross(left).normalized()
   rng=random.Random(c["seed"]+60821)

   # One continuous central shoot carries six left/right pairs of short
   # needle-covered side shoots. The same 1440 needle triangles are redistributed across
   # the original fan footprint instead of being stretched over three long rods.
   def source(t,r,half):
    row=min(segments-1,int(t*segments));return sample(polys[half*segments+row],t*segments-row,r)
   def central(t):
    p,tex,w,a=source(t,0,0)
    p+=normal*(.022*c["width"]*(1-abs(2*t-1)))
    return p,tex,w,a
   def woody(point,radius):
    rings=[]
    for s in [0,.5,1]:
     p,tex,w,a=point(s)
     tangent=(point(min(1,s+.015))[0]-point(max(0,s-.015))[0]).normalized()
     lateral=tangent.cross(normal).normalized();up=lateral.cross(tangent).normalized()
     r=radius*(1-.70*s)
     rings.append([(p+(lateral*math.cos(k*math.tau/3)+up*math.sin(k*math.tau/3))*r,w,a) for k in range(3)])
    for j in range(2):
     for k in range(3):
      parts=[rings[j][k],rings[j][(k+1)%3],rings[j+1][(k+1)%3],rings[j+1][k]]
      emit([q[0] for q in parts],uv_patch(Vector((558.5/2048,1-393.5/1024)),4),[q[1] for q in parts],[q[2] for q in parts])
   woody(central,.0032)
   for pair in range(6):
    for arm in [-1,1]:
     half=0 if arm<0 else 1
     begin=.095+pair*.13+(arm*.008)
     end=min(.97,begin+.19)
     reach=[.78,1.,.96,.80,.56,.28][pair]
     def point(s):
      t=begin+(end-begin)*s
      p,tex,w,a=source(t,reach*s,half)
      # Alternating branches lift above/below the original fan; the attachment
      # equals the actual central stem position, so it cannot float off in wind.
      p+=normal*(c["width"]*(.022*(1-abs(2*t-1))+arm*((-1)**pair)*.085*math.sin(math.pi*s)))
      return p,tex,w,a
     woody(point,.00165)
     for station in range(22):
      s=.025+station*(.92/21)+rng.uniform(-.006,.006)
      p,tex,w,a=point(s)
      tangent=(point(min(1,s+.01))[0]-point(max(0,s-.01))[0]).normalized()
      lateral=tangent.cross(normal).normalized();up=lateral.cross(tangent).normalized()
      for ni in range(5):
       angle=ni*math.tau/5+station*2.39996+arm*.77+pair*.53+rng.uniform(-.18,.18)
       radial=up*math.cos(angle)+lateral*math.sin(angle)
       length=.024+rng.random()*.011
       needle(p,p+radial*length+tangent*length*.36,tangent,Vector([(557.5/2048,1-376.5/1024),(381.5/2048,1-607.5/1024),(563.5/2048,1-679.5/1024),(563.5/2048,1-442.5/1024)][(station+ni+pair)%4]),w,a)
       needles+=1
   # Spend the remaining 120 needles on the central terminal shoot. Total
   # needle triangles remain 1440, with no naked rod beyond the last side pair.
   for station in range(24):
    t=.25+station*(.74/23)
    p,tex,w,a=central(t)
    tangent=(central(min(1,t+.01))[0]-central(max(0,t-.01))[0]).normalized()
    lateral=tangent.cross(normal).normalized();up=lateral.cross(tangent).normalized()
    for ni in range(5):
     angle=ni*math.tau/5+station*2.39996+rng.uniform(-.18,.18)
     radial=up*math.cos(angle)+lateral*math.sin(angle);length=.024+rng.random()*.011
     needle(p,p+radial*length+tangent*length*.36,tangent,Vector([(557.5/2048,1-376.5/1024),(381.5/2048,1-607.5/1024),(563.5/2048,1-679.5/1024),(563.5/2048,1-442.5/1024)][(station+ni)%4]),w,a)
     needles+=1
   max_shift=max(max_shift,.107*c["width"])
  else:
   for p in polys:unchanged(p)
  tri_by_cluster.append(sum(len(face)-2 for face in faces[cluster_start:]))
  if c["id"].endswith(":tip") and 4.5<c["origin"][2]<6.5 and selected is None:
   selected=dict(index=ci,id=c["id"],polygons=[cluster_start,len(faces)],origin=c["origin"],length=c["length"])
 assert cursor==len(old.polygons),"Unexpected hand-edited topology; refusing to discard unrecognised faces"
 # Preserve shared vertices: splitting every source polygon would increase
 # VBO size even on the untouched inner canopy. UVs/normals remain per-corner.
 unique={};compact=[];cw=[];ca=[];remap=[]
 for p,w,a in zip(verts,winds,aos):
  key=tuple(p)+tuple(w)+(a,)
  if key not in unique:
   unique[key]=len(compact);compact.append(p);cw.append(w);ca.append(a)
  remap.append(unique[key])
 verts=compact;winds=cw;aos=ca;faces=[tuple(remap[i] for i in face) for face in faces]
 me=bpy.data.meshes.new(old.name+"-forked");me.from_pydata(verts,[],faces);me.materials.clear()
 for mat in old.materials:me.materials.append(mat)
 layer=me.uv_layers.new(name="UVMap");wind_new=me.attributes.new("_PLANT_WIND","FLOAT_VECTOR","POINT");ao_new=me.attributes.new("_CROWN_OCCLUSION","FLOAT","POINT")
 for i,(w,a) in enumerate(zip(winds,aos)):wind_new.data[i].vector=w;ao_new.data[i].value=a
 for p,coords in zip(me.polygons,uvs):
  p.use_smooth=True
  for li,t in zip(p.loop_indices,coords):layer.data[li].uv=t
 me.update()
 # Smooth across adjacent micro-facets by coincident position only inside a
 # cluster, keeping the actual fork cross-section. Untouched fan normals survive.
 by_point={}
 for p,explicit in zip(me.polygons,normals):
  if explicit is not None:continue
  for vi in p.vertices:
   key=tuple(round(v,6) for v in me.vertices[vi].co)
   by_point.setdefault(key,Vector());by_point[key]+=p.normal
 split=[]
 for p,explicit in zip(me.polygons,normals):
  if explicit is not None:split.extend(explicit);continue
  for vi in p.vertices:split.append(by_point[tuple(round(v,6) for v in me.vertices[vi].co)].normalized())
 me.normals_split_custom_set(split);me.calc_loop_triangles();ob.data=me
 ob["needleVolume"]=VOLUME_REVISION;ob["sourceAlphaTrim"]=ob.get("alphaTrim","")
 bpy.data.meshes.remove(old);me.name=ob.name
 return dict(beforeTriangles=before,afterTriangles=len(me.loop_triangles),shapedClusters=shaped,innerShapedClusters=inner_shaped,brushInstances=instances,
  totalClusters=len(CLUSTERS[f["id"]]),solidNeedles=needles,needleLengthMetres=[.024,.035],
  needleRootWidthMetres=.0023,terminalReplacementHeightMetres=10,
  needleFaces=1,sideNeedleStations=22,centralNeedleStations=24,needlesPerStation=5,sideShootPairs=6,maxArmDisplacementMetres=max_shift,
  trianglesByCluster=tri_by_cluster,previewCluster=selected)

def apply_needle_volume():
 reports={}
 for f in SPEC["variants"]:
  ob=bpy.data.objects.get(f["id"]+"_frond")
  if ob:
   result=volume_frond(ob,f)
   if result:reports[f["id"]]=result
 if reports:
  bpy.context.scene["needleVolume"]=VOLUME_REVISION
  (SOURCE/"needle-volume-report.json").write_text(json.dumps(dict(revision=VOLUME_REVISION,variants=reports,
   input="current editable hi .blend; old bark/core and mid are unchanged",
   materials=3,images=3,extraTextureSamples=0,brushTemplate=BRUSH_TEMPLATE),indent=2))
 return reports

def preview_detail(label,variant="column",only_needles=False):
 scene=bpy.context.scene;scene.render.engine="CYCLES";scene.cycles.samples=32;scene.cycles.use_denoising=True
 scene.render.resolution_x=1000 if only_needles else 1400;scene.render.resolution_y=720 if only_needles else 1000;scene.render.resolution_percentage=100
 if scene.world is None:scene.world=bpy.data.worlds.new("Needle volume comparison")
 scene.world.use_nodes=True;scene.world.node_tree.nodes["Background"].inputs[0].default_value=(.60,.68,.76,1)
 scene.world.node_tree.nodes["Background"].inputs[1].default_value=.7
 for ob in list(scene.objects):
  if ob.type=="MESH" and "variant" in ob:ob.hide_render=ob["variant"]!=variant
 bpy.ops.object.light_add(type="SUN",location=(4,-8,20));sun=bpy.context.object;sun.data.energy=3;sun.data.angle=.15;sun.rotation_euler=(.45,-.35,-.35)
 bpy.ops.object.camera_add();camera=bpy.context.object;scene.camera=camera;camera.data.type="ORTHO"
 def take(name,location,target,scale):
  camera.location=location;camera.rotation_euler=(Vector(target)-camera.location).to_track_quat("-Z","Y").to_euler();camera.data.ortho_scale=scale
  scene.render.filepath=str(SOURCE/f"preview-volume-{label}-{variant}-{name}.png");bpy.ops.render.render(write_still=True)
 if not only_needles:take("branches",(5,-8,8),(0,0,6.6),5.2)
 # Close-up uses the exact same reference branch/camera in the archived and new source.
 c=next(c for c in CLUSTERS[variant] if (c.get("role")=="hanging" if args.preview_branch_role=="hanging" else c.get("role") is None and not c["id"].endswith(":tip") if args.preview_branch_role=="side" else c.get("role")=="inner" if args.preview_inner_only else c["id"].endswith(":tip")) and 4.5<c["origin"][2]<6.5)
 origin=Vector(c["origin"]);d=Vector((math.cos(c["az"]),math.sin(c["az"]),0));target=origin+d*c["length"]*.60
 take("inner" if args.preview_inner_only else "needles",target+Vector((.6,-1.2,.65)),target,1.15 if args.preview_inner_only else .85)

def export_needle_recipe():
 """The controls are extracted from the hand-editable hi mesh, not resynthesized.
 Direct edits to a realised needle mesh require the full GLB export path; they
 cannot silently be represented by this parametric control-surface recipe.
 """
 bpy.ops.wm.open_mainfile(filepath=str(Path(args.volume_input) if args.volume_input else SOURCE/"schrenk-spruce-hi.blend"))
 forms={}
 for f in SPEC["variants"]:
  ob=bpy.data.objects[f["id"]+"_frond"];me=ob.data;wind=me.attributes["_PLANT_WIND"];ao=me.attributes["_CROWN_OCCLUSION"]
  cursor=0;records=[];triangles=[]
  for ci,c in enumerate(CLUSTERS[f["id"]]):
   segments=1 if c.get("role")=="inner" else 2
   selected=(c["id"].endswith(":tip") and c["origin"][2]<10) or (c.get("role")=="inner" and c["origin"][2]<BRUSH_TEMPLATE["innerHeightMetres"])
   if selected:
    controls=[]
    for pi in range(cursor,cursor+2*segments):
     controls.append([[*me.vertices[i].co,*wind.data[i].vector,ao.data[i].value] for i in me.polygons[pi].vertices])
    records.append(dict(cluster=ci,id=c["id"],segments=segments,width=c["width"],seed=c["seed"]+60821,controls=controls))
   triangles.append(1596 if selected else segments*4+2);cursor+=segments*2+1
  assert cursor==len(me.polygons)
  forms[f["id"]]=dict(instances=records,sourceTriangles=[6 if c.get("role")=="inner" else 10 for c in CLUSTERS[f["id"]]],trianglesByCluster=triangles)
 # Bind controls to the exact hi geometry actually loaded by Three. A matching
 # topology alone must never accept stale positions, normals, UVs or wind/AO.
 hi_bytes=(ROOT/"web/public/assets/v2/schrenk-spruce-hi.glb").read_bytes()
 json_size=struct.unpack_from("<I",hi_bytes,12)[0];document=json.loads(hi_bytes[20:20+json_size]);binary=hi_bytes[28+json_size:]
 source_digests={}
 for mesh in document["meshes"]:
  if not mesh["name"].endswith("_frond"):continue
  primitive=mesh["primitives"][0];accessors={**primitive["attributes"],"indices":primitive["indices"]};digests={}
  for name,ai in accessors.items():
   a=document["accessors"][ai];v=document["bufferViews"][a["bufferView"]]
   width={5126:4,5125:4,5123:2}[a["componentType"]]*{"SCALAR":1,"VEC2":2,"VEC3":3}[a["type"]]
   start=v.get("byteOffset",0)+a.get("byteOffset",0);stride=v.get("byteStride",width)
   raw=b"".join(binary[start+i*stride:start+i*stride+width] for i in range(a["count"]))
   digests[name]=hashlib.sha256(raw).hexdigest()
  source_digests[mesh["name"]]=digests
 recipe=dict(revision="spruce-brush-recipe-v1",geometryRevision=VOLUME_REVISION,template=BRUSH_TEMPLATE,forms=forms,sourceDigests=source_digests,
  sourceGLBSha256=hashlib.sha256(hi_bytes).hexdigest(),
  coordinates="Blender source metres; output x,z,-y",editableSource="assets/src/v2/spruce/schrenk-spruce-hi.blend",manualRealisedEdits="Export the full near GLB explicitly; regenerate and verify a recipe after editing its hi control surfaces.")
 raw=json.dumps(recipe,separators=(",",":"),ensure_ascii=False).encode()
 (SOURCE/"needle-brush-recipe.json").write_bytes(raw)
 payload=gzip.compress(raw,compresslevel=9,mtime=0);dest=OUT/"schrenk-spruce-needle.recipe.json.gz";pending=dest.with_suffix(".pending.gz");pending.write_bytes(payload);pending.replace(dest)
 print(json.dumps(dict(recipeBytes=len(raw),transportBytes=len(payload),instances=sum(len(f["instances"]) for f in forms.values()))),flush=True)

def export_gpu_source():
 """Runtime controls remain the original hi source plus recipe. This separate
 realised Blender source makes the exact new shell and unchanged brushes editable
 for inspection/export; arbitrary manual edits are not silently put in a recipe.
 """
 import subprocess, numpy as np
 global SOURCE
 base=SOURCE;target=base/"gpu-v11";target.mkdir(exist_ok=True)
 subprocess.run(["node",str(ROOT/"tools/blender/spruce_gpu_snapshot.mjs")],check=True)
 snapshot=json.loads(gzip.decompress((target/"near-shell.snapshot.json.gz").read_bytes()))
 def arrays(record):
  a={k:np.asarray(v,dtype=np.float32) for k,v in record["attributes"].items()}
  for key in ("position","normal"):
   v=a[key].reshape(-1,3).copy();a[key]=np.stack((v[:,0],-v[:,2],v[:,1]),axis=1).reshape(-1)
  uv=a["uv"].reshape(-1,2).copy();uv[:,1]=1-uv[:,1];a["uv"]=uv.reshape(-1)
  return a
 def replace(ob,record,keep_brushes=None):
  a=arrays(record);old=ob.data;totals=np.full(len(a["position"])//9,3,dtype=np.int32)
  if keep_brushes is not None:
   selected=set(keep_brushes["brushClusters"]);cursor=0;polys=[]
   for ci,n in enumerate(keep_brushes["sourceTriangles"]):
    count=1518 if ci in selected else n//2
    if ci in selected:polys.extend(range(cursor,cursor+count))
    cursor+=count
   assert cursor==len(old.polygons),(ob.name,cursor,len(old.polygons))
   starts=np.empty(len(old.polygons),dtype=np.int32);sizes=starts.copy();old.polygons.foreach_get("loop_start",starts);old.polygons.foreach_get("loop_total",sizes)
   loops=np.concatenate([np.arange(starts[i],starts[i]+sizes[i],dtype=np.int32) for i in polys]);ids=np.empty(len(old.loops),dtype=np.int32);old.loops.foreach_get("vertex_index",ids);ids=ids[loops]
   co=np.empty(len(old.vertices)*3,dtype=np.float32);old.vertices.foreach_get("co",co)
   normal=np.empty(len(old.loops)*3,dtype=np.float32);old.corner_normals.foreach_get("vector",normal)
   tex=np.empty(len(old.loops)*2,dtype=np.float32);old.uv_layers.active.data.foreach_get("uv",tex)
   wind=np.empty(len(old.vertices)*3,dtype=np.float32);old.attributes["_PLANT_WIND"].data.foreach_get("vector",wind)
   ao=np.empty(len(old.vertices),dtype=np.float32);old.attributes["_CROWN_OCCLUSION"].data.foreach_get("value",ao)
   prev={"position":co.reshape(-1,3)[ids].reshape(-1),"normal":normal.reshape(-1,3)[loops].reshape(-1),"uv":tex.reshape(-1,2)[loops].reshape(-1),"_plant_wind":wind.reshape(-1,3)[ids].reshape(-1),"_crown_occlusion":ao[ids]}
   a={k:np.concatenate((prev[k],v)) for k,v in a.items()};totals=np.concatenate((sizes[polys],totals))
  count=len(a["position"])//3;me=bpy.data.meshes.new(ob.name+"-gpu-v11")
  me.vertices.add(count);me.vertices.foreach_set("co",a["position"])
  me.loops.add(count);me.loops.foreach_set("vertex_index",np.arange(count,dtype=np.int32))
  me.polygons.add(len(totals));me.polygons.foreach_set("loop_start",np.cumsum(np.concatenate(([0],totals[:-1]))).astype(np.int32));me.polygons.foreach_set("loop_total",totals);me.polygons.foreach_set("use_smooth",np.ones(len(totals),dtype=bool))
  me.uv_layers.new(name="UVMap");me.uv_layers.active.data.foreach_set("uv",a["uv"])
  me.attributes.new("_PLANT_WIND","FLOAT_VECTOR","POINT").data.foreach_set("vector",a["_plant_wind"])
  me.attributes.new("_CROWN_OCCLUSION","FLOAT","POINT").data.foreach_set("value",a["_crown_occlusion"])
  for mat in old.materials:me.materials.append(mat)
  me.update();me.normals_split_custom_set(a["normal"].reshape(-1,3));ob.data=me;bpy.data.meshes.remove(old);me.name=ob.name
  ob["gpuCrownRevision"]="curved-open-crown-v1";ob["gpuRepresentation"]="shared five-needle station + 156-triangle twig geometry; 288 stations per brush"
 # Compact, independently inspectable shell GLB. Default runtime derives these
 # same floats from hi; this GLB is a source comparison, not an extra download.
 bpy.ops.wm.open_mainfile(filepath=str(base/"schrenk-spruce-hi.blend"))
 for name,f in snapshot["forms"].items():
  replace(bpy.data.objects[name+"_frond"],f["frond"]);replace(bpy.data.objects[name+"_core"],f["core"])
 bpy.ops.wm.save_as_mainfile(filepath=str(target/"schrenk-spruce-near-shell.blend"))
 bpy.ops.object.select_all(action="DESELECT")
 for ob in bpy.context.scene.objects:
  if ob.type=="MESH" and "variant" in ob:ob.select_set(True)
 bpy.ops.export_scene.gltf(filepath=str(target/"schrenk-spruce-near-shell.glb"),export_format="GLB",use_selection=True,export_yup=True,export_apply=False,export_animations=False,export_attributes=True,export_extras=True,export_cameras=False,export_lights=False)
 bpy.ops.wm.open_mainfile(filepath=str(base/"schrenk-spruce-needle.blend"))
 for name,f in snapshot["forms"].items():
  replace(bpy.data.objects[name+"_frond"],f["frond"],f);replace(bpy.data.objects[name+"_core"],f["core"])
  print("GPU source realised",name,flush=True)
 bpy.context.scene["gpuRecipeSource"]="schrenk-spruce-hi.blend + schrenk-spruce-needle.recipe.json.gz"
 bpy.context.scene["manualEdits"]="Manual realised edits require explicit GLB export; default browser recipe reads the hi controls, not these expanded vertices."
 bpy.ops.wm.save_as_mainfile(filepath=str(target/"schrenk-spruce-needle-gpu.blend"))
 report={"revision":snapshot["revision"],"sourceHiSHA256":snapshot["sourceHiSHA256"],"recipeSHA256":snapshot["recipeSHA256"],"forms":{}}
 for ob in bpy.context.scene.objects:
  if ob.type=="MESH" and "variant" in ob:
   ob.data.calc_loop_triangles();report["forms"][ob.name]={"triangles":len(ob.data.loop_triangles),"vertices":len(ob.data.vertices)}
 (target/"gpu-source-report.json").write_text(json.dumps(report,indent=2));SOURCE=target
 if args.preview:preview_detail("gpu-v11",args.preview_variant)

def export_branch_source():
 import subprocess, numpy as np
 global SOURCE
 base=SOURCE;target=base/"gpu-v12";target.mkdir(exist_ok=True);name=args.preview_variant
 subprocess.run(["node",str(ROOT/"tools/blender/spruce_branch_snapshot.mjs"),name],check=True)
 metadata=json.loads((target/(name+".arrays.json")).read_text());raw=np.memmap(target/(name+".arrays.bin"),dtype=np.float32,mode="r")
 bpy.ops.wm.open_mainfile(filepath=str(base/"schrenk-spruce-hi.blend"))
 for ob in list(bpy.context.scene.objects):
  if ob.type=="MESH" and "variant" in ob and ob["variant"]!=name:bpy.data.objects.remove(ob,do_unlink=True)
 for part,attrs in metadata["parts"].items():
  a={k:np.asarray(raw[v["offset"]//4:v["offset"]//4+v["length"]]) for k,v in attrs.items()};ob=bpy.data.objects[name+"_"+part];old=ob.data;me=bpy.data.meshes.new(ob.name+"-v12");count=len(a["position"])//3
  def coords(v):
   q=v.reshape(-1,3);return np.stack((q[:,0],-q[:,2],q[:,1]),axis=1).reshape(-1)
  me.vertices.add(count);me.vertices.foreach_set("co",coords(a["position"]));me.loops.add(count);me.loops.foreach_set("vertex_index",np.arange(count,dtype=np.int32));me.polygons.add(count//3);me.polygons.foreach_set("loop_start",np.arange(0,count,3,dtype=np.int32));me.polygons.foreach_set("loop_total",np.full(count//3,3,dtype=np.int32));me.polygons.foreach_set("use_smooth",np.ones(count//3,dtype=bool))
  uv=a["uv"].reshape(-1,2).copy();uv[:,1]=1-uv[:,1];me.uv_layers.new(name="UVMap");me.uv_layers.active.data.foreach_set("uv",uv.reshape(-1))
  me.attributes.new("_PLANT_WIND","FLOAT_VECTOR","POINT").data.foreach_set("vector",a["_plant_wind"]);me.attributes.new("_CROWN_OCCLUSION","FLOAT","POINT").data.foreach_set("value",a["_crown_occlusion"])
  for mat in old.materials:me.materials.append(mat)
  me.update();me.normals_split_custom_set(coords(a["normal"]).reshape(-1,3));ob.data=me;bpy.data.meshes.remove(old);ob["v12BranchSource"]=True
 bpy.context.scene["runtimeRepresentation"]="Shared five-needle station VBO, branch-centre 4.5-7m complementary LOD; this source realises maximum local detail."
 bpy.context.scene["editingContract"]="Modify source hi controls/template to update GPU; arbitrary realised mesh edits require explicit GLB export and are not silently reflected in the recipe."
 bpy.ops.wm.save_as_mainfile(filepath=str(target/("schrenk-spruce-branches-"+name+".blend")))
 SOURCE=target
 if args.preview:preview_detail("v12-"+(args.preview_branch_role or "tip"),name)

def export_canopy_source():
 import subprocess,numpy as np
 global SOURCE
 base=SOURCE;target=base/"gpu-v13";target.mkdir(exist_ok=True);exports=target/"exports";exports.mkdir(exist_ok=True)
 subprocess.run(["node",str(ROOT/"tools/blender/spruce_volume_snapshot.mjs")],check=True)
 if args.preview:
  bpy.ops.wm.open_mainfile(filepath=str(base/"schrenk-spruce-hi.blend"));SOURCE=target;preview_detail("v12-photo",args.preview_variant,True);SOURCE=base
 for lod in ["hi","mid","near"]:
  bpy.ops.wm.open_mainfile(filepath=str(base/("schrenk-spruce-"+("mid" if lod=="mid" else "hi")+".blend")))
  metadata=json.loads((target/("canopy-"+lod+".arrays.json")).read_text());raw=np.memmap(target/("canopy-"+lod+".arrays.bin"),dtype=np.float32,mode="r")
  for name,record in metadata["parts"].items():
   if name=="far_shared":continue
   a={k:np.asarray(raw[v["offset"]//4:v["offset"]//4+v["length"]]) for k,v in record["attributes"].items()};ob=bpy.data.objects[name];old=ob.data;me=bpy.data.meshes.new(name+"-v13");count=len(a["position"])//3
   def coords(v):
    q=v.reshape(-1,3);return np.stack((q[:,0],-q[:,2],q[:,1]),axis=1).reshape(-1)
   me.vertices.add(count);me.vertices.foreach_set("co",coords(a["position"]));me.loops.add(count);me.loops.foreach_set("vertex_index",np.arange(count,dtype=np.int32));me.polygons.add(count//3);me.polygons.foreach_set("loop_start",np.arange(0,count,3,dtype=np.int32));me.polygons.foreach_set("loop_total",np.full(count//3,3,dtype=np.int32));me.polygons.foreach_set("use_smooth",np.ones(count//3,dtype=bool))
   uv=a["uv"].reshape(-1,2).copy();uv[:,1]=1-uv[:,1];me.uv_layers.new(name="UVMap");me.uv_layers.active.data.foreach_set("uv",uv.reshape(-1))
   me.attributes.new("_PLANT_WIND","FLOAT_VECTOR","POINT").data.foreach_set("vector",a["_plant_wind"]);me.attributes.new("_CROWN_OCCLUSION","FLOAT","POINT").data.foreach_set("value",a["_crown_occlusion"])
   if "aSprayLod" in a:
    q=a["aSprayLod"].reshape(-1,4);me.attributes.new("_SPRAY_CENTRE","FLOAT_VECTOR","POINT").data.foreach_set("vector",q[:,:3].reshape(-1));me.attributes.new("_SPRAY_READY","FLOAT","POINT").data.foreach_set("value",q[:,3])
   for mat in old.materials:me.materials.append(mat)
   me.update();me.normals_split_custom_set(coords(a["normal"]).reshape(-1,3));ob.data=me;bpy.data.meshes.remove(old);ob["canopyRevision"]="twisted-branch-volume-v13"
  bpy.context.scene["sourceContract"]="Exact spruce-volume.js runtime positions/UV/wind/AO. Real needles retain all v12 geometry and editable gpu-v12 sources; their v13 lighting is analytic GLSL, not baked into photos."
  bpy.context.scene["editingContract"]="This is an editable derived source; browser derives from verified hi controls. Manual mesh edits require explicit source GLB use and do not silently update recipe."
  bpy.ops.wm.save_as_mainfile(filepath=str(target/("schrenk-spruce-canopy-"+lod+".blend")))
  bpy.ops.object.select_all(action="DESELECT")
  for ob in bpy.context.scene.objects:
   if ob.type=="MESH" and "variant" in ob:ob.select_set(True)
  bpy.ops.export_scene.gltf(filepath=str(exports/("schrenk-spruce-canopy-"+lod+".glb")),export_format="GLB",use_selection=True,export_yup=True,export_apply=False,export_animations=False,export_attributes=True,export_extras=True,export_cameras=False,export_lights=False)
  if lod=="hi" and args.preview:SOURCE=target;preview_detail("v13-photo",args.preview_variant,True);SOURCE=base
 # The same 104-triangle shared far template, with shader-shaped variants baked
 # as editable comparison meshes. No renderer-dependent view geometry here.
 bpy.ops.wm.read_factory_settings(use_empty=True);metadata=json.loads((target/"canopy-hi.arrays.json").read_text());raw=np.memmap(target/"canopy-hi.arrays.bin",dtype=np.float32,mode="r");record=metadata["parts"]["far_shared"];a={k:np.asarray(raw[v["offset"]//4:v["offset"]//4+v["length"]]) for k,v in record["attributes"].items()};points=a["position"].reshape(-1,3);faces=a["index"].reshape(-1,3).astype(int).tolist()
 mat=bpy.data.materials.new("far-foliage");mat.use_nodes=True;nodes=mat.node_tree.nodes;vertex=nodes.new("ShaderNodeVertexColor");vertex.layer_name="Color";mat.node_tree.links.new(vertex.outputs["Color"],nodes["Principled BSDF"].inputs["Base Color"]);nodes["Principled BSDF"].inputs["Roughness"].default_value=.92
 for f in SPEC["variants"]:
  p=points.copy()
  for i,q in enumerate(p):
   if a["aCrownMask"][i]>.5:
    t=q[1]/18;y=f["base"]+(18-f["base"])*t;r=radius(f,y)*(1+f["side"]*q[0]/max(1e-8,math.hypot(q[0],q[2])));q[0]=q[0]*r+f["lean"]*y;q[1]=y;q[2]*=r
  me=bpy.data.meshes.new(f["id"]+"-far-v13");me.from_pydata([(q[0],-q[2],q[1]) for q in p],[],faces);me.materials.append(mat);colors=me.color_attributes.new(name="Color",type="FLOAT_COLOR",domain="POINT");colors.data.foreach_set("color",np.column_stack((a["color"].reshape(-1,3),np.ones(len(points)))).reshape(-1));ob=bpy.data.objects.new(f["id"]+"_far",me);bpy.context.collection.objects.link(ob);ob["variant"]=f["id"];ob["triangles"]=104
 bpy.ops.wm.save_as_mainfile(filepath=str(target/"schrenk-spruce-far-volume.blend"));print("v13 canopy sources complete",flush=True)

if args.canopy_existing:
 export_canopy_source();sys.exit(0)

if args.branch_existing:
 export_branch_source();sys.exit(0)

if args.export_gpu_existing:
 target=SOURCE/"gpu-v11"
 bpy.ops.wm.open_mainfile(filepath=str(target/"schrenk-spruce-needle-gpu.blend"))
 bpy.ops.object.select_all(action="DESELECT")
 for ob in bpy.context.scene.objects:
  if ob.type=="MESH" and "variant" in ob:ob.select_set(True)
 bpy.ops.export_scene.gltf(filepath=str(target/"schrenk-spruce-needle-gpu.glb"),export_format="GLB",use_selection=True,export_yup=True,export_apply=False,export_animations=False,export_attributes=True,export_extras=True,export_cameras=False,export_lights=False)
 print("Manual realised v11 edits exported only; default runtime still reads verified hi controls and the compact recipe.",flush=True)
 sys.exit(0)

if args.gpu_existing:
 export_gpu_source();sys.exit(0)

if args.export_needle_recipe:
 export_needle_recipe();sys.exit(0)

if args.export_needle_existing:
 bpy.ops.wm.open_mainfile(filepath=str(SOURCE/"schrenk-spruce-needle.blend"))
 (SOURCE/"needle-export-report.json").write_text(json.dumps(export("needle"),indent=2))
 print("Manual realised edits exported to source comparison GLB. The default recipe is not changed; edit its hi control source and regenerate to update that path.",flush=True)
 sys.exit(0)

if args.prototype_needle:
 bpy.ops.wm.open_mainfile(filepath=str(Path(args.volume_input) if args.volume_input else SOURCE/"schrenk-spruce-hi.blend"))
 f=next(f for f in SPEC["variants"] if f["id"]==args.preview_variant)
 report=volume_frond(bpy.data.objects[f["id"]+"_frond"],f)
 print({k:v for k,v in report.items() if k not in ["trianglesByCluster","previewCluster","brushInstances"]},flush=True)
 preview_detail("prototype",f["id"],True)
 sys.exit(0)

if args.needle_existing:
 bpy.ops.wm.open_mainfile(filepath=str(Path(args.volume_input) if args.volume_input else SOURCE/"schrenk-spruce-hi.blend"))
 apply_needle_volume()
 for ob in bpy.context.scene.objects:
  if ob.type=="MESH" and "variant" in ob:ob["lod"]="needle"
 bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE/"schrenk-spruce-needle.blend"))
 counts=export("needle")
 (SOURCE/"needle-export-report.json").write_text(json.dumps(counts,indent=2))
 if args.preview:preview_detail("after",args.preview_variant)
 export_needle_recipe()
 sys.exit(0)

if args.preview_detail_only:
 bpy.ops.wm.open_mainfile(filepath=str(SOURCE/f"schrenk-spruce-{args.preview_lod}.blend"))
 preview_detail(args.preview_detail_only,args.preview_variant)
 sys.exit(0)

counts={};trim_report={}
for lod in ("hi","mid"):
 if (args.surface_existing or args.needle_existing) and lod=="mid":
  counts[lod]=json.loads((SOURCE/"export-report.json").read_text())[lod];continue
 if args.export_existing or args.trim_existing or args.surface_existing or args.needle_existing:bpy.ops.wm.open_mainfile(filepath=str(Path(args.volume_input) if args.volume_input and lod=="hi" else SOURCE/f"schrenk-spruce-{lod}.blend"))
 else:build(lod)
 if args.surface_existing:
  apply_needle_surface()
  bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE/f"schrenk-spruce-{lod}.blend"))
 if args.trim_existing:
  trimmed={}
  for ob in bpy.context.scene.objects:
   if ob.type=="MESH":
    result=trim_alpha(ob)
    if result:trimmed[ob.name]=result
  if trimmed:
   trim_report[lod]=trimmed
   bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE/f"schrenk-spruce-{lod}.blend"))
 counts[lod]=export(lod)
 if args.preview:preview(lod)
(SOURCE/"export-report.json").write_text(json.dumps(counts,indent=2))

if trim_report:
 (SOURCE/"alpha-trim-report.json").write_text(json.dumps(dict(revision=ALPHA_TRIM_REVISION,endInsets=ALPHA_END_INSETS,lods=trim_report),indent=2))

# Export manual edits to the separately editable near source in the same pass.
if args.export_existing and (SOURCE/"schrenk-spruce-needle.blend").exists():
 bpy.ops.wm.open_mainfile(filepath=str(SOURCE/"schrenk-spruce-needle.blend"))
 (SOURCE/"needle-export-report.json").write_text(json.dumps(export("needle"),indent=2))
