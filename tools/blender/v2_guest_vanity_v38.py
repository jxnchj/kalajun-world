"""Independent three-room vanity geometry candidate; no runtime/default mutation."""
from pathlib import Path
import bpy, math, json, hashlib, time, random
from mathutils import Vector
from mathutils.bvhtree import BVHTree
ROOT=Path(__file__).resolve().parents[2]
SOURCE=ROOT/'assets/src/v2/settlements/lanchuan-freedom.blend'
D=ROOT/'assets/src/v2/settlements/guest-vanity-v38'
OUT=ROOT/'web/public/assets/v2/gh_lanchuan_rooms_vanity38.glb'
start=time.monotonic();D.mkdir(parents=True,exist_ok=True)
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
source_sha=sha(SOURCE);original_glb=ROOT/'web/public/assets/v2/gh_lanchuan_rooms.glb';original_sha=sha(original_glb)
bpy.ops.wm.open_mainfile(filepath=str(SOURCE))
def signature(o):
 h=hashlib.sha256();h.update(str(tuple(tuple(r)for r in o.matrix_world)).encode());h.update(str(o.parent.name if o.parent else None).encode())
 if o.type=='MESH':
  for v in o.data.vertices:h.update(str(tuple(v.co)).encode())
  for p in o.data.polygons:h.update(str((tuple(p.vertices),p.material_index)).encode())
  for u in o.data.uv_layers:
   for v in u.data:h.update(str(tuple(v.uv)).encode())
  for c in o.data.color_attributes:
   for v in c.data:h.update(str(tuple(v.color)).encode())
  h.update(str([m.name for m in o.data.materials]).encode())
 return h.hexdigest()
def tris(o):
 if o.type!='MESH':return 0
 o.data.calc_loop_triangles();return len(o.data.loop_triangles)
before={o.name:signature(o)for o in bpy.context.scene.objects};before_tri=sum(tris(o)for o in bpy.context.scene.objects)
new=[];removed=[];rooms=[];reposed=[]
def finish(o,name,mat,smooth=False):
 o.name=name;o.data.materials.append(bpy.data.materials[mat]);new.append(o)
 if not o.data.uv_layers:o.data.uv_layers.new(name='UVMap')
 for p in o.data.polygons:
  p.use_smooth=smooth;axis=max(range(3),key=lambda k:abs(p.normal[k]));axes=[k for k in range(3)if k!=axis]
  for li in p.loop_indices:
   co=o.data.vertices[o.data.loops[li].vertex_index].co;o.data.uv_layers.active.data[li].uv=(co[axes[0]]*.7,co[axes[1]]*.7)
 return o
def box(name,loc,dim,mat='v2_oak',bevel=.004):
 bpy.ops.mesh.primitive_cube_add(size=1,location=loc);o=bpy.context.object;o.dimensions=dim;bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
 if bevel:
  m=o.modifiers.new('manufactured edge radius','BEVEL');m.width=bevel;m.segments=3;bpy.ops.object.modifier_apply(modifier=m.name)
  m=o.modifiers.new('weighted panel normals','WEIGHTED_NORMAL');bpy.ops.object.modifier_apply(modifier=m.name)
 return finish(o,name,mat)
def mesh(name,verts,faces,mat,smooth=False):
 me=bpy.data.meshes.new(name);me.from_pydata(verts,[],faces);me.update();o=bpy.data.objects.new(name,me);bpy.context.scene.collection.objects.link(o);return finish(o,name,mat,smooth)
def ring_surface(name,rings,mat):
 # Each ring lists 64 corresponding points; continuous actual surface, no painted hole.
 n=len(rings[0]);verts=[p for r in rings for p in r];faces=[]
 for j in range(len(rings)-1):
  for k in range(n):a=j*n+k;b=j*n+(k+1)%n;faces.append((a,b,b+n,a+n))
 return mesh(name,verts,faces,mat,True)
def tube(name,path,r,mat='v2_black'):
 verts=[];n=16
 for j,p in enumerate(path):
  p=Vector(p);d=Vector(path[min(j+1,len(path)-1)])-Vector(path[max(0,j-1)]);d.normalize();u=d.cross(Vector((1,0,0))).normalized();v=d.cross(u).normalized()
  verts.extend(tuple(p+r*(u*math.cos(k*2*math.pi/n)+v*math.sin(k*2*math.pi/n)))for k in range(n))
 faces=[tuple(range(n-1,-1,-1))]
 for j in range(len(path)-1):
  for k in range(n):a=j*n+k;b=j*n+(k+1)%n;faces.append((a,b,b+n,a+n))
 faces.append(tuple(range((len(path)-1)*n,len(path)*n)));return mesh(name,verts,faces,mat,True)
for i in range(1,4):
 p=f'freedom{i}_';cab=bpy.data.objects[p+'vanity cabinet'];cx,cy,cz=cab.location;counter=bpy.data.objects[p+'basin counter'];top=counter.location.z+.03;countery=counter.location.y;basiny=bpy.data.objects[p+'basin bowl'].location.y
 front=cy-.25;back=cy+.25;prefix=p+'craft38_';rooms.append({'room':i,'cabinetCenter':list(cab.location),'originalCabinetSize':list(cab.dimensions),'counterTop':top})
 for o in list(bpy.context.scene.objects):
  if o.name.startswith(p)and any(o.name.startswith(p+s)for s in ['vanity cabinet','vanity drawer','basin counter','basin bowl','tap']):removed.append({'name':o.name,'triangles':tris(o)});bpy.data.objects.remove(o,do_unlink=True)
 # Carcass panels, face frame and two inset drawers retain original envelope and handles.
 for s in [-1,1]:box(prefix+'side'+str(s),(cx+s*.548,cy,.49),(.024,.50,.78))
 box(prefix+'back',(cx,back-.012,.49),(1.072,.024,.78));box(prefix+'bottom',(cx,cy,.112),(1.072,.452,.024))
 for s in [-1,1]:box(prefix+'front stile'+str(s),(cx+s*.529,front+.012,.49),(.038,.024,.732))
 for z,h in [(.1775,.105),(.505,.027),(.8275,.105)]:box(prefix+'front rail'+str(z),(cx,front+.012,z),(1.02,.024,h))
 for j,z in enumerate([.36,.65]):
  box(prefix+'drawer front'+str(j),(cx,front-.011,z),(1.012,.025,.25),bevel=.006)
  box(prefix+'drawer tray'+str(j),(cx,cy-.025,z-.085),(.96,.37,.02),bevel=.002)
 # Correct original circulation defect: the side screen left less than a capsule's width beside WC.
 # Authored static inward-open 35deg shower door, not an interactive runtime door.
 panel=bpy.data.objects[p+'shower glass'];hinge=Vector((cx-.08,2.56,0));angle=-math.radians(35)
 from mathutils import Matrix
 rotation=Matrix.Rotation(angle,4,'Z');panel.location=hinge+rotation@(panel.location-hinge);panel.rotation_euler.z+=angle
 reposed.append({'name':panel.name,'hingeBlender':list(hinge),'angleDegrees':-35,'reason':'original fixed side screen blocked bath passage next to WC; inward-open static authored door'})
 tube(prefix+'shower pivot post',[(hinge.x,hinge.y,.075),(hinge.x,hinge.y,2.09)],.012)
 for z in [.18,1.9]:box(prefix+'shower hinge'+str(z),(hinge.x,hinge.y,z),(.038,.032,.065),'v2_black',.004)
 # Rectangular counter outside → actual oval rolled lip → recessed ceramic bowl → drain.
 n=128
 def ellipse(rx,ry,z):return [(cx+rx*math.cos(k*2*math.pi/n),basiny+ry*math.sin(k*2*math.pi/n),z)for k in range(n)]
 # Exact ray intersection against a rectangle with 35mm corner radii.
 def rounded_outline(inset,z):
  result=[];w=.595-inset;h=.275-inset;r=.035
  for k in range(n):
   a=k*2*math.pi/n;dx,dy=math.cos(a),math.sin(a);sx=w/max(abs(dx),1e-9);sy=((countery+h-basiny)if dy>=0 else(basiny-countery+h))/max(abs(dy),1e-9);t=min(sx,sy);x,y=t*dx,basiny+t*dy-countery
   if abs(x)>w-r and abs(y)>h-r:
    ox=(w-r)*(1 if dx>=0 else -1);oy=countery+(h-r)*(1 if dy>=0 else -1)-basiny;dot=dx*ox+dy*oy;t=dot+math.sqrt(max(0,dot*dot-ox*ox-oy*oy+r*r))
   result.append((cx+t*dx,basiny+t*dy,z))
  return result
 # A real 6mm rolled outside edge, sampled at 15-degree increments.
 edge=[]
 for j in range(7):
  a=-math.pi/2+j*math.pi/12;edge.append(rounded_outline(.006*(1-math.cos(a)),top-.054+.006*math.sin(a)))
 for j in range(7):
  a=j*math.pi/12;edge.append(rounded_outline(.006*(1-math.cos(a)),top-.006+.006*math.sin(a)))
 edge_obj=ring_surface(prefix+'counter rolled edge',edge,'v2_ceramic')
 normals=[]
 for j,ring in enumerate(edge):
  angle=(-math.pi/2+j*math.pi/12)if j<7 else((j-7)*math.pi/12)
  for k,pt in enumerate(ring):
   tangent=Vector(ring[(k+1)%n])-Vector(ring[(k-1)%n]);radial=Vector((tangent.y,-tangent.x,0)).normalized();normal=radial*math.cos(angle)+Vector((0,0,math.sin(angle)));normals.append(tuple(normal))
 edge_obj.data.normals_split_custom_set_from_vertices(normals)
 counter_mesh=ring_surface(prefix+'counter and recessed basin',[edge[-1],ellipse(.284,.174,top),ellipse(.275,.165,top+.006),ellipse(.262,.152,top-.004),ellipse(.238,.132,top-.045),ellipse(.18,.09,top-.115),ellipse(.026,.026,top-.133)],'v2_ceramic')
 for poly in counter_mesh.data.polygons[:128]:poly.use_smooth=False
 ring_surface(prefix+'drain rim',[ellipse(.026,.026,top-.133),ellipse(.018,.018,top-.135)],'v2_black')
 mesh(prefix+'drain inner',ellipse(.018,.018,top-.139),[tuple(range(n))],'v2_black')
 # Bent spout stays within original upright/spout bounds (top1.164m).
 ty=back-.08;path=[(cx,ty,.95),(cx,ty,1.095)]
 for k in range(1,9):
  a=k/8*math.pi/2;path.append((cx,ty-.04+.04*math.cos(a),1.095+.04*math.sin(a)))
 path.extend([(cx,ty-.13,1.135),(cx,ty-.15,1.125)]);tube(prefix+'cast tap',path,.013)
 tube(prefix+'tap base',[(cx,ty,.944),(cx,ty,.958)],.025)
 box(prefix+'tap lever',(cx,ty-.025,1.102),(.012,.065,.008),'v2_black',.003)
 # Mirror face and light remain original; narrow structural surround is added inside original radius.
 mirror=bpy.data.objects[p+'round mirror'];mx,my,mz=mirror.location
 # Closed toroidal frame avoids open strip normals and discontinuous rear-face seams.
 verts=[];faces=[];segments=128;cross=12
 for j in range(segments):
  a=j*2*math.pi/segments
  for k in range(cross):
   t=k*2*math.pi/cross;r=.354+.006*math.cos(t);verts.append((mx+r*math.cos(a),my-.021+.006*math.sin(t),mz+r*math.sin(a)))
 for j in range(segments):
  for k in range(cross):faces.append((j*cross+k,((j+1)%segments)*cross+k,((j+1)%segments)*cross+(k+1)%cross,j*cross+(k+1)%cross))
 mirror_frame=mesh(prefix+'mirror frame',verts,[tuple(reversed(f)) for f in faces],'v2_black',True)

bpy.context.view_layer.update()
# Real contextual AO only on new surfaces. Original object AO/UV/geometry remain unchanged.
vs=[];fs=[]
for o in bpy.context.scene.objects:
 if o.type!='MESH'or any(m.name=='glass'for m in o.data.materials):continue
 base=len(vs);vs.extend(o.matrix_world@v.co for v in o.data.vertices);fs.extend(tuple(base+k for k in p.vertices)for p in o.data.polygons)
bvh=BVHTree.FromPolygons(vs,fs);rng=random.Random(38);dirs=[]
while len(dirs)<48:
 v=Vector([rng.uniform(-1,1)for _ in range(3)])
 if .05<v.length<=1:dirs.append(v.normalized())
values=[]
for o in new:
 me=o.data;attr=me.color_attributes.new('Color','FLOAT_COLOR','POINT')
 for i,v in enumerate(me.vertices):
  p=o.matrix_world@v.co;n=(o.matrix_world.to_3x3()@v.normal).normalized();occ=0;up=0;esc=0
  for d in dirs:
   d=d if d.dot(n)>0 else -d;hit=bvh.ray_cast(p+n*.003,d,2.)
   if hit[0]is not None:occ+=(1-hit[3]/2.)**1.5
   if d.z>=-.35:
    up+=1
    if bvh.ray_cast(p+n*.003,d,40.)[0]is None:esc+=1
  ao=max(.3,min(1.,(1-occ/48)*1.08));sky=esc/max(1,up);attr.data[i].color=(ao,ao,sky,1);values.append(ao)
retained=[o for o in bpy.context.scene.objects if o.name in before and o.name not in {r['name']for r in reposed}];assert all(signature(o)==before[o.name]for o in retained)
scene=bpy.context.scene;scene['candidate']='Guest vanity38; original shell, placements, mirror face/light retained; GI rebake required before runtime adoption'
bpy.ops.wm.save_as_mainfile(filepath=str(D/'lanchuan-vanity.blend'))
bpy.ops.object.select_all(action='DESELECT')
for o in scene.objects:
 if o.type in ('MESH','EMPTY')and not o.name.startswith('preview_'):o.select_set(True)
bpy.ops.export_scene.gltf(filepath=str(OUT),export_format='GLB',use_selection=True,export_apply=True,export_vertex_color='ACTIVE',export_all_vertex_colors=False,export_extras=True,export_animations=False,export_lights=False,export_cameras=False)
assert sha(SOURCE)==source_sha and sha(original_glb)==original_sha
report={'source':str(SOURCE.relative_to(ROOT)),'sourceSHA256':source_sha,'originalGLBSHA256':original_sha,'candidate':str(OUT.relative_to(ROOT)),'candidateSHA256':sha(OUT),'candidateBytes':OUT.stat().st_size,'blendSHA256':sha(D/'lanchuan-vanity.blend'),'originalTriangles':before_tri,'removed':removed,'removedTriangles':sum(o['triangles']for o in removed),'newTriangles':sum(tris(o)for o in new),'candidateTriangles':sum(tris(o)for o in scene.objects),'retainedObjectsExact':len(retained),'reposedShowerScreens':reposed,'newObjects':len(new),'rooms':rooms,'ao':{'samples':48,'vertices':len(values),'min':min(values),'max':max(values),'mean':sum(values)/len(values)},'elapsedSeconds':time.monotonic()-start,'provenance':'Original existing room configuration; designed construction details, not newly measured reference; original materials/textures reused; no Aholo','collision':'Candidate vanity preserves original cabinet and counter plan envelope; corrected shower poses have matching real collision. Original vanity collision geometry must remain separate on integration; only the three incorrect fixed shower screens are reposed inward 35 degrees with visible pivot hardware.','GI':'All 3 guest rooms source-bound sky 1/2, solar 1/2, fixtures 1/2, aperture, contact must be rebaked before adoption; mirror light positions unchanged.'}
(D/'metadata.json').write_text(json.dumps(report,ensure_ascii=False,indent=2));print(json.dumps(report,ensure_ascii=False))
