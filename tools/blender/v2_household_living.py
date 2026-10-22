"""Three authored outdoor-use sets, placed on the retained porch, not surveyed homes.
Shares existing house PBR materials at runtime; GLB carries geometry and AO only.
Source Blend retains the complete materials for editable authoring and preview.
"""
import bpy, math, json, sys
from pathlib import Path
from mathutils import Vector, Matrix
sys.path.insert(0,str(Path(__file__).resolve().parent))
import v2_porch as p
from v2_interior_surfaces import contact_ao
from v2_tea_service import count
ROOT=Path(__file__).resolve().parents[2]
SRC=ROOT/'assets/src/v2/pastoral/household-living-32.blend'
OUT=ROOT/'web/public/assets/v2/household_living.glb'
VERSION='household-living-32'

def move_copy(src,name,target=None,delta=None):
 o=src.copy();o.data=src.data.copy();bpy.context.collection.objects.link(o);o.name=name
 if delta is not None:o.location+=Vector(delta)
 if target is not None:
  bpy.context.view_layer.update();q=[o.matrix_world@Vector(v)for v in o.bound_box];lo=Vector([min(v[k]for v in q)for k in range(3)]);hi=Vector([max(v[k]for v in q)for k in range(3)])
  o.location+=Vector(target)-Vector(((lo.x+hi.x)/2,(lo.y+hi.y)/2,lo.z))
 return o

def cloth(name,center,width,length,height,mat='v2_pastoral_blue'):
 # A hanging woven cloth bends continuously across a rounded support, with
 # small non-uniform folds. Two surfaces and hem strips retain edge thickness.
 x,y=center;nx,ny=24,32;verts=[];faces=[]
 for side in [-.0025,.0025]:
  for j in range(ny+1):
   t=j/ny;u=(t-.5)*math.pi
   for i in range(nx+1):
    a=i/nx;yy=y+.095*math.sin(u);zz=height-length*(1-math.cos(u))+.009*math.sin(a*12+u*2)+side
    verts.append((x+(a-.5)*width,yy,zz))
 n=(nx+1)*(ny+1)
 for s in range(2):
  for j in range(ny):
   for i in range(nx):
    a=s*n+j*(nx+1)+i;f=(a,a+1,a+nx+2,a+nx+1);faces.append(f if s else f[::-1])
 boundary=[i for i in range(nx+1)]+[j*(nx+1)+nx for j in range(1,ny+1)]+[ny*(nx+1)+i for i in range(nx-1,-1,-1)]+[j*(nx+1)for j in range(ny-1,0,-1)]
 for k,a in enumerate(boundary):b=boundary[(k+1)%len(boundary)];faces.append((a,b,b+n,a+n))
 m=bpy.data.meshes.new(name);m.from_pydata(verts,[],faces);m.update();o=bpy.data.objects.new(name,m);bpy.context.collection.objects.link(o);uv=m.uv_layers.new()
 for f in m.polygons:
  for li in f.loop_indices:
   v=m.loops[li].vertex_index%n;uv.data[li].uv=(v%(nx+1)/nx,v//(nx+1)/ny)
 p.register(o,mat)
 return o

def table(cx=-2.2):
 for x in [cx-.42,cx+.42]:
  for y in [-4.17,-4.37]:p.box('table leg',(x-.025,y-.025,-.115),(x+.025,y+.025,.49),grain=2)
 for j in range(3):p.box('table plank',(cx-.52,-4.43+j*.12,.49),(cx+.52,-4.315+j*.12,.535),grain=0)
 p.box('table front apron',(cx-.46,-4.395,.41),(cx+.46,-4.37,.49),grain=0)

def crate(cx,cy):
 for x in [cx-.23,cx+.23]:
  for y in [cy-.16,cy+.16]:p.box('crate corner',(x-.018,y-.018,-.115),(x+.018,y+.018,.20),grain=2)
 for z in [-.08,.025,.13]:
  for y in [cy-.18,cy+.18]:p.box('open crate slat',(cx-.25,y-.012,z),(cx+.25,y+.012,z+.065),grain=0)
  for x in [cx-.25,cx+.25]:p.box('open crate end',(x-.012,cy-.16,z),(x+.012,cy+.16,z+.065),grain=1)
 for j in range(3):p.box('crate base',(cx-.23,cy-.16+j*.11,-.11),(cx+.23,cy-.055+j*.11,-.085),grain=0)

bpy.ops.wm.open_mainfile(filepath=str(ROOT/'assets/src/v2/pastoral/house_a-lived.blend'))
old=[o for o in bpy.context.scene.objects if o.type=='MESH'];all_new=[];report=[]
for style in range(3):
 before=set(bpy.context.scene.objects);p.groups={}
 if style==0:
  table(-2.2);crate(-.68,-3.20)
  # Complete existing crafted teapot (body/lid/spout/bail), translated as a unit.
  sources=[o for o in old if o.name.startswith('pastoral_house_low_table_tea')]
  bpy.context.view_layer.update();bottom=min((o.matrix_world@v.co).z for o in sources for v in o.data.vertices)
  delta=Vector((-2.34,-4.27,.535))-Vector((-.6,-.57,bottom))
  for src in sources:move_copy(src,'porch_tea_'+src.name,delta=delta)
  for i in range(2):move_copy(next(o for o in old if o.name=='pastoral_house_low_table_bowl'+str(i)),'porch_tea_bowl_'+str(i),target=(-1.93+i*.19,-4.23,.535))
  o=cloth('woven cloth over rail',(-3.12,-3.73),.58,.27,.733)
  o.data.transform(Matrix.Translation((-3.12,-3.73,0))@Matrix.Rotation(math.pi/2,4,'Z')@Matrix.Translation((3.12,3.73,0)))
 elif style==1:
  table(-1.75);crate(-2.80,-3.02)
  # Work surface: two carved spindles, a shallow reused bowl and folded cloth.
  move_copy(next(o for o in old if o.name=='pastoral_house_low_table_bowl0'),'work bowl',target=(-2.02,-4.22,.535))
  for i in range(2):
   p.rod('hand spindle',(-1.55,-4.23+i*.09,.554),(-1.21,-4.27+i*.09,.558),.012,'v2_pastoral_pale',12)
   p.rod('spindle whorl',(-1.49,-4.235+i*.09,.552),(-1.49,-4.235+i*.09,.566),.039,'v2_pastoral_pale',20)
  # Reuse the sewn cushion geometry as an explicitly folded work textile.
  o=move_copy(next(o for o in old if o.name=='pastoral_house_porch_wool_cushion'),'folded work textile',target=(-.76,-3.32,-.115));o.scale*=.55;bpy.context.view_layer.update();o.location.z+=-.115-min((o.matrix_world@v.co).z for v in o.data.vertices)
  cloth('linen drying on back wall rail',(-.53,-3.12),.45,.30,.79,'v2_pastoral_linen')
  p.rod('short textile rail',(-.83,-3.12,.79),(-.23,-3.12,.79),.021,'v2_pastoral_wood',12)
  for x in [-.78,-.28]:p.box('textile frame upright',(x-.025,-3.145,-.115),(x+.025,-3.095,.79),grain=2)
 else:
  # Low freestanding drying frame stays below window sill and keeps door clear.
  for x in [-2.82,-1.78]:
   for y in [-4.08,-4.42]:p.beam('drying trestle',(x,y,-.115),(x,-4.25,.81),.035,.045)
  for y in [-4.21,-4.29]:p.rod('drying rail',(-2.92,y,.82),(-1.68,y,.82),.024,'v2_pastoral_pale',12)
  cloth('airing wool throw',(-2.42,-4.25),.70,.40,.852,'v2_pastoral_red')
  cloth('airing linen towel',(-1.88,-4.25),.26,.30,.85,'v2_pastoral_linen')
  crate(-.63,-3.22)
  # Covered storage remains on the deck, not floating beside a sloped house.
  o=move_copy(next(o for o in old if o.name=='pastoral_house_porch_wool_cushion'),'folded storage textile',target=(-.64,-3.22,.21));o.scale*=.48;bpy.context.view_layer.update();o.location.z+=.21-min((o.matrix_world@v.co).z for v in o.data.vertices)
 new=[o for o in bpy.context.scene.objects if o not in before and o.type=='MESH'];bpy.context.view_layer.update()
 # Remove inherited old AO to bake these particular outdoor placements.
 for o in new:
  for c in list(o.data.color_attributes):o.data.color_attributes.remove(c)
 contact_ao(new)
 # Merge only same material within this complete usage set. All source faces remain.
 by_mat={}
 for o in new:
  assert len(o.data.materials)==1,o.name
  by_mat.setdefault(o.data.materials[0].name,[]).append(o)
 merged=[]
 for mat,parts in by_mat.items():
  bpy.ops.object.select_all(action='DESELECT')
  for o in parts:o.select_set(True)
  bpy.context.view_layer.objects.active=parts[0];bpy.ops.object.join();o=bpy.context.object;o.name=f'household_{style}_{mat}';o['householdStyle']=style;o['sourceMaterial']=mat;o['householdOrigin']=[style*10,0,0];o['detailRole']='body';o.location.x+=style*10;merged.append(o)
 report.append({'style':style,'name':['porch-tea','handwork','airing-and-storage'][style],'triangles':sum(count(o)for o in merged),'meshes':len(merged),'materials':list(by_mat)})
 for o in merged:
  for c in list(o.users_collection):c.objects.unlink(o)
 all_new+=merged
for o in list(bpy.context.scene.objects):bpy.data.objects.remove(o,do_unlink=True)
for o in all_new:bpy.context.collection.objects.link(o)
bpy.context.scene['householdVersion']=VERSION;bpy.context.scene['designStatus']='Three original outdoor-use interpretations, not measured individual households';bpy.context.scene['materialContract']='GLB material names resolve to already loaded house PBR materials. Source Blend retains complete maps.'
bpy.ops.wm.save_as_mainfile(filepath=str(SRC))
# Export geometry without duplicating existing embedded maps. Runtime rejects a
# missing canonical material instead of silently using these stripped fallbacks.
for m in bpy.data.materials:
 if m.use_nodes:
  for n in list(m.node_tree.nodes):
   if n.type=='TEX_IMAGE':m.node_tree.nodes.remove(n)
bpy.ops.object.select_all(action='SELECT')
bpy.ops.export_scene.gltf(filepath=str(OUT),export_format='GLB',use_selection=True,export_apply=True,export_extras=True,export_vertex_color='ACTIVE',export_all_vertex_colors=False,export_animations=False,export_lights=False,export_cameras=False)
result={'version':VERSION,'variants':report,'source':str(SRC.relative_to(ROOT)),'glb':str(OUT.relative_to(ROOT)),'newTextures':0,'originalHouseAssetModified':False,'limits':['Outdoor usage sets only; not surveyed household reconstruction.','Companion household-room bake supplies matching two-bounce and closed-door fields; re-run it after changing these outdoor groups.','Indoor furniture and household-specific shell variation remain later.']}
(ROOT/'tools/reports/household-living-v32.json').write_text(json.dumps(result,indent=2));print(json.dumps(result),flush=True)
