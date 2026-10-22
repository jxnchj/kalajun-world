"""Complete modest covered porch and outdoor living group. Metres / Blender Z up.
Derived design, not a measured household. Existing meshes/materials stay intact.
"""
import json, math
from pathlib import Path
import bpy
from mathutils import Vector
from v2_tea_service import digest,count
from v2_interior_surfaces import contact_ao
ROOT=Path(__file__).resolve().parents[2];VERSION='pastoral-porch-31';groups={}
def register(o,mat):
 o.data.materials.clear();o.data.materials.append(bpy.data.materials[mat]);groups.setdefault(mat,[]).append(o);return o
def box(name,lo,hi,mat='v2_pastoral_wood',grain=0,bevel=.004):
 lo,hi=Vector(lo),Vector(hi);bpy.ops.mesh.primitive_cube_add(size=1,location=(lo+hi)/2);o=bpy.context.object;o.name=name;o.dimensions=hi-lo;bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
 if bevel:
  m=o.modifiers.new('soft hand-planed edge','BEVEL');m.width=min(bevel,min(hi-lo)*.16);m.segments=2;bpy.ops.object.modifier_apply(modifier=m.name)
 uv=o.data.uv_layers.active
 for f in o.data.polygons:
  axis=max(range(3),key=lambda k:abs(f.normal[k]));across=next((k for k in range(3)if k!=grain and k!=axis),(grain+1)%3)
  for li in f.loop_indices:
   v=o.data.vertices[o.data.loops[li].vertex_index].co+o.location;uv.data[li].uv=(v[grain]*.8,v[across]*2.5)
 return register(o,mat)
def beam(name,a,b,width,depth=None,mat='v2_pastoral_wood'):
 a,b=Vector(a),Vector(b);d=b-a;o=box(name,(-width/2,-(depth or width)/2,-d.length/2),(width/2,(depth or width)/2,d.length/2),mat,2);o.location=(a+b)/2;o.rotation_euler=d.to_track_quat('Z','Y').to_euler();return o
def rod(name,a,b,r,mat='log',n=12):
 a,b=Vector(a),Vector(b);d=b-a;bpy.ops.mesh.primitive_cylinder_add(vertices=n,radius=r,depth=d.length,location=(a+b)/2);o=bpy.context.object;o.name=name;o.rotation_euler=d.to_track_quat('Z','Y').to_euler();return register(o,mat)
def bucket(x,y,z):
 # Open stave bucket, bottom, binding hoops and a bowed carrying bail.
 for i in range(16):
  a=i*math.tau/16;b=(i+.93)*math.tau/16
  verts=[(x+r*math.cos(t),y+r*math.sin(t),z+h) for h,r in [(0,.135),(.32,.17),(0,.119),(.32,.154)]for t in [a,b]]
  faces=[(0,1,3,2),(4,6,7,5),(2,3,7,6),(0,4,5,1),(0,2,6,4),(1,5,7,3)]
  m=bpy.data.meshes.new('bucket stave');m.from_pydata(verts,[],faces);m.update();o=bpy.data.objects.new('bucket stave',m);bpy.context.collection.objects.link(o);uv=m.uv_layers.new(name='UVMap')
  for f in m.polygons:
   for li in f.loop_indices:
    p=m.vertices[m.loops[li].vertex_index].co;uv.data[li].uv=(p.z*2,(p.x+p.y)*3)
  register(o,'v2_pastoral_pale')
 rod('bucket bottom',(x,y,z+.008),(x,y,z+.025),.126,'v2_pastoral_pale',24)
 for h in [.05,.25]:
  r=.135+h/.32*.035+.005
  for i in range(24):
   a=i*math.tau/24;b=(i+1)*math.tau/24;beam('bucket binding',(x+r*math.cos(a),y+r*math.sin(a),z+h),(x+r*math.cos(b),y+r*math.sin(b),z+h),.012,.02,'v2_pastoral_iron')
 for i in range(20):
  a=i*math.pi/20;b=(i+1)*math.pi/20
  rod('bucket bail',(x+.18*math.cos(a),y,z+.27+.22*math.sin(a)),(x+.18*math.cos(b),y,z+.27+.22*math.sin(b)),.009,'v2_pastoral_iron',8)
def run():
 path=ROOT/'assets/src/v2/pastoral/house_a-lived.blend';bpy.ops.wm.open_mainfile(filepath=str(path));bpy.context.view_layer.update();assert not bpy.context.scene.get('porchVersion'),'Restore v30 source before reauthoring'
 old=[o for o in bpy.context.scene.objects if o.type=='MESH'];protected={o.name:digest(o)for o in old};before=sum(count(o)for o in old)
 # 6.5 x 1.65 m platform, 14 cm below house floor. Original stairs remain
 # beneath the platform; new geometry neither removes nor substitutes them.
 for j in range(10):
  y=-2.80-j*.165
  for x0,x1 in [(-3.25,-.65),(-.65,1.55),(1.55,3.25)]:box('deck board',(x0+.004,y-.158,-.19),(x1-.004,y,-.115),'v2_pastoral_wood',0)
 for x in [-3.08,-1.55,0,1.55,3.08]:box('deck bearer',(x-.06,-4.45,-.34),(x+.06,-2.78,-.19),grain=1)
 for y in [-2.98,-4.28]:box('platform cross sill',(-3.2,y-.075,-.47),(3.2,y+.075,-.34))
 for x in [-3.08,0,3.08]:
  for y in [-2.98,-4.28]:box('support on foundation',(x-.08,y-.08,-1.6),(x+.08,y+.08,-.17),grain=2)
 # Original eave ends y=-3.193, z~2.235. The new boards begin just outside
 # it and slope down; no second roof through the existing sod/fascia.
 roof=lambda y:2.225+(y+3.20)*.115
 for i in range(22):
  x=-3.42+i*(6.84/22);beam('awning roof board',(x+.151,-3.205,roof(-3.205)),(x+.151,-4.60,roof(-4.60)),.301,.045,'plank')
 for i in range(21):
  x=-3.42+(i+1)*(6.84/22);beam('roof joint cover batten',(x,-3.205,roof(-3.205)+.031),(x,-4.60,roof(-4.60)+.031),.045,.018,'plank')
 for x in [-3.12,-1.56,0,1.56,3.12]:beam('awning rafter',(x,-3.22,roof(-3.22)-.07),(x,-4.52,roof(-4.52)-.07),.065,.095)
 for y,z in [(-3.25,2.05),(-4.36,1.945)]:box('awning transverse bearer',(-3.3,y-.065,z),(3.3,y+.065,z+.10))
 for x in [-3.1,-.2,2.15,3.1]:
  box('porch column',(x-.065,-4.425,-.115),(x+.065,-4.295,1.945),grain=2)
  # Braces stay beside the central 1.1m door path, not across it.
  side=(1 if x<0 else -1) if abs(x)>3 else (-1 if x<1 else 1)
  beam('column shoulder brace',(x,-4.36,1.54),(x+side*.36,-4.36,1.94),.055,.065)
 # Side guardrails, no front barrier across entry. Deck is only one low step
 # above cut terrain; the existing descending steps are retained under deck.
 for x in [-3.12,3.12]:
  box('side rail',(x-.04,-4.28,.64),(x+.04,-2.99,.72),grain=1)
  for y in [-4.12,-3.77,-3.42,-3.07]:box('side baluster',(x-.024,y-.024,-.10),(x+.024,y+.024,.64),grain=2)
 # Low broad landing step directly aligned to the existing door.
 box('entry tread',(.23,-4.76,-.32),(1.77,-4.40,-.19),grain=0)
 # Long bench to the left, with real under-seat space and a relaxed back.
 for x in [-2.87,-1.12]:
  for y in [-3.92,-3.52]:box('bench leg',(x-.045,y-.045,-.115),(x+.045,y+.045,.31),grain=2)
 for j in range(3):box('bench seat',(-3.02,-3.98+j*.18,.30),(-.97,-3.82+j*.18,.355),grain=0)
 for x in [-2.87,-1.12]:beam('bench back upright',(x,-3.48,.31),(x,-3.39,.93),.055,.06)
 for z in [.60,.80]:box('bench back board',(-3.03,-3.42,z),(-.96,-3.36,z+.14),grain=0)
 box('bench stretcher',(-2.87,-3.77,.065),(-1.12,-3.69,.12),grain=0)
 # Right-side slatted storage, dry fuel above ground, open front.
 for x in [2.40,2.98]:
  for y in [-3.88,-3.26]:box('fuel rack foot',(x-.035,y-.035,-.115),(x+.035,y+.035,.63),grain=2)
 for i in range(5):box('fuel shelf',(2.36,-3.93+i*.145,.04),(3.02,-3.815+i*.145,.085),grain=0)
 for z in [.25,.48]:box('fuel rack side',(2.975,-3.91,z),(3.025,-3.23,z+.055),grain=1)
 for row in range(3):
  for i in range(3-row):
   x=2.48+i*.18+row*.09;z=.17+row*.15;rod('stacked split fuel',(x,-3.83,z),(x+.013,-3.30+(i%2)*.035,z+.01),.085,'log',10)
   rod('fuel cut end',(x,-3.837,z),(x,-3.825,z),.082,'logend',10)
 bucket(2.57,-4.17,-.115)
 # Two folded, reused wool cushions preserve a quiet lived-in porch rather
 # than adding ornamental clutter. Existing cloth source uses real seams.
 candidates=[o for o in old if 'cushion' in o.name and 'house' in o.name]
 if candidates:
  src=candidates[0];o=src.copy();o.data=src.data.copy();bpy.context.collection.objects.link(o);o.name='pastoral_house_porch_wool_cushion';bpy.context.view_layer.update()
  b=[o.matrix_world@Vector(p)for p in o.bound_box];lo=Vector(tuple(min(v[k]for v in b)for k in range(3)));hi=Vector(tuple(max(v[k]for v in b)for k in range(3)))
  o.location+=Vector((-2.48,-3.72,.36))-Vector(((lo.x+hi.x)/2,(lo.y+hi.y)/2,lo.z));o['detailRole']='body';o['porchVersion']=VERSION
  for key in ['softGoodsVersion','softGoodsOriginalTriangles','textileRefinement']:
   if key in o:del o[key]
 new=[o for o in bpy.context.scene.objects if o.type=='MESH' and o.get('porchVersion')==VERSION]
 for mat,parts in groups.items():
  bpy.ops.object.select_all(action='DESELECT')
  for o in parts:o.select_set(True)
  bpy.context.view_layer.objects.active=parts[0];bpy.ops.object.join();o=bpy.context.object;o.name='pastoral_house_porch_'+mat;o['detailRole']='body';o['sourcePrototype']='house_a';o['porchVersion']=VERSION;new.append(o)
 contact_ao(new)
 for name,h in protected.items():assert digest(bpy.data.objects[name])==h,name
 bpy.context.scene['porchVersion']=VERSION;bpy.ops.wm.save_as_mainfile(filepath=str(path));after=[o for o in bpy.context.scene.objects if o.type=='MESH']
 report={'version':VERSION,'asset':'house_a','trianglesBefore':before,'trianglesAfter':sum(count(o)for o in after),'meshCountBefore':len(old),'meshCountAfter':len(after),'protectedMeshesUnchanged':len(protected),'newTextures':0,'porchBoundsThree':{'x0':-3.45,'x1':3.45,'z0':2.78,'z1':4.76},'deckTop':-.115,'frontBeamBottom':1.945,'frontClearance':2.06,'doorPath':{'x0':.45,'x1':1.55,'z0':2.5,'z1':4.76},'limitations':['Designed porch, not a surveyed historic household.','Shared woodhouse prototype, not yet household-specific weathering and possessions.','Existing deep eave retained; new lean-to meets its front edge.']}
 (ROOT/'assets/src/v2/pastoral/house_a-porch-31.json').write_text(json.dumps(report,indent=2));print(json.dumps(report),flush=True)
if __name__=='__main__':run()
