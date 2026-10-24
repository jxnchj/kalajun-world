"""Independent room joinery candidate; accepted vanity and all bedding retained."""
from pathlib import Path
import bpy,math,json,hashlib,time,random
from mathutils import Vector
from mathutils.bvhtree import BVHTree
R=Path(__file__).resolve().parents[2];D=R/'assets/src/v2/settlements/guest-living39';D.mkdir(parents=True,exist_ok=True)
S=R/'assets/src/v2/settlements/guest-vanity-v38/lanchuan-vanity.blend';start=time.monotonic();sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest();ss=sha(S)
bpy.ops.wm.open_mainfile(filepath=str(S))
def sig(o):
 h=hashlib.sha256();h.update(str((tuple(map(tuple,o.matrix_world)),o.parent.name if o.parent else None)).encode())
 if o.type=='MESH':
  for seq in ([tuple(v.co)for v in o.data.vertices],[(tuple(p.vertices),p.material_index,p.use_smooth)for p in o.data.polygons],[[tuple(v.uv)for v in u.data]for u in o.data.uv_layers],[[tuple(v.color)for v in a.data]for a in o.data.color_attributes],[m.name for m in o.data.materials]):h.update(str(seq).encode())
 return h.hexdigest()
def tri(o):
 if o.type!='MESH':return 0
 o.data.calc_loop_triangles();return len(o.data.loop_triangles)
before={o.name:sig(o)for o in bpy.context.scene.objects};nt=sum(tri(o)for o in bpy.context.scene.objects);new=[];removed=[];ranges=[]
def remove(o):
 removed.append({'name':o.name,'triangles':tri(o)});bpy.data.objects.remove(o,do_unlink=True)
def box(n,c,d,mat='v2_oak',r=.003):
 bpy.ops.mesh.primitive_cube_add(size=1,location=c);o=bpy.context.object;o.name=n;o.dimensions=d;bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);o.data.materials.append(bpy.data.materials[mat])
 if r:
  m=o.modifiers.new('real edge radius','BEVEL');m.width=r;m.segments=3;bpy.ops.object.modifier_apply(modifier=m.name)
  m=o.modifiers.new('joinery weighted normals','WEIGHTED_NORMAL');bpy.ops.object.modifier_apply(modifier=m.name)
 uv=o.data.uv_layers.active or o.data.uv_layers.new(name='UVMap')
 for p in o.data.polygons:
  a=max(range(3),key=lambda k:abs(p.normal[k]));ax=[k for k in range(3)if k!=a]
  for li in p.loop_indices:
   co=o.data.vertices[o.data.loops[li].vertex_index].co;uv.data[li].uv=(co[ax[0]]*.7,co[ax[1]]*.7)
 new.append(o);return o
for i in range(1,4):
 p=f'freedom{i}_';q=p+'living39_';o=bpy.data.objects[p+'wardrobe'];x,y,z=o.location;remove(o)
 # Original exterior envelope; front faces +X. Existing handles stay untouched.
 for sy in [-1,1]:box(q+'wardrobe side'+str(sy),(x,y+sy*.513,1),(.55,.024,1.93))
 box(q+'wardrobe back',(x-.263,y,1),(.024,1.002,1.93))
 for zz in [.047,1.953]:box(q+'wardrobe cap'+str(zz),(x,y,zz),(.502,1.002,.024))
 box(q+'wardrobe plinth',(x+.015,y,.086),(.46,.95,.078),'v2_darkwood')
 # Two genuine frame-and-panel doors, 4 mm central clearance. Variation in rail height only.
 for j,cy in enumerate([y-.253,y+.253]):
  for sy in [-1,1]:box(q+f'door{j} stile{sy}',(x+.263,cy+sy*.226,1.015),(.024,.048,1.824))
  for zz in [.127,1.903]:box(q+f'door{j} rail{zz}',(x+.263,cy,zz),(.024,.404,.048))
  split=[.76,.88,1.0][i-1];box(q+f'door{j} middle rail',(x+.263,cy,split),(.024,.404,.032))
  for k,(lo,hi)in enumerate([(.151,split-.016),(split+.016,1.879)]):box(q+f'door{j} recessed panel{k}',(x+.254,cy,(lo+hi)/2),(.018,.404,hi-lo),r=.0015)
 # Bed support replaces only frame, preserving mattress and cloth exactly.
 o=bpy.data.objects[p+'bed frame'];bx,by,bz=o.location;remove(o)
 for sx in [-1,1]:box(q+'bed side rail'+str(sx),(bx+sx*.936,by,.275),(.048,2.16,.24),'v2_darkwood',.007)
 for sy in [-1,1]:box(q+'bed end rail'+str(sy),(bx,by+sy*1.056,.275),(1.824,.048,.24),'v2_darkwood',.007)
 for sx in [-1,1]:
  for sy in [-1,1]:box(q+f'bed corner foot{sx}{sy}',(bx+sx*.90,by+sy*1.02,.120),(.09,.09,.17),'v2_darkwood',.005)
 box(q+'bed support under mattress',(bx,by,.373),(1.824,2.064,.044),'v2_darkwood')
 for k,o in enumerate([o for o in list(bpy.context.scene.objects)if o.name.startswith(p+'nightstand')]):
  cx,cy,cz=o.location;remove(o);n=q+f'nightstand{k}_'
  box(n+'top',(cx,cy,.718),(.42,.43,.024),r=.004)
  for sx in [-1,1]:box(n+'side'+str(sx),(cx+sx*.198,cy,.448),(.024,.43,.516))
  box(n+'back',(cx,cy+.203,.448),(.372,.024,.516))
  box(n+'bottom',(cx,cy,.202),(.372,.382,.024))
  for j,(lo,hi)in enumerate([(.226,.473),(.487,.694)]):
   box(n+'drawer front'+str(j),(cx,cy-.203,(lo+hi)/2),(.366,.024,hi-lo),r=.003)
   # Small routed handhold is an actual recessed rail gap, not a black stripe.
   box(n+'drawer lip'+str(j),(cx,cy-.209,hi-.009),(.29,.012,.012),r=.002)
 for o in list(bpy.context.scene.objects):
  if o.name.startswith(p+'drawer gap'):remove(o)
 # Original curtain meshes and their silhouette/AO remain intact. Real sewn top
 # heading and small carriers sit within original cloth depth, no fake printed seam.
 for k in range(2):
  o=bpy.data.objects[p+'curtain'+str(k)];vs=[o.matrix_world@v.co for v in o.data.vertices];xmin=min(v.x for v in vs);xmax=max(v.x for v in vs);ym=sum(v.y for v in vs)/len(vs)
  for j in range(6):
   xx=xmin+.045+(xmax-xmin-.09)*j/5
   near=sorted([v for v in vs if v.z>2.44],key=lambda v:abs(v.x-xx))[:4];attach_y=sum(v.y for v in near)/len(near)
   track_y=bpy.data.objects[p+'curtain track'].location.y;dy=track_y-attach_y
   tab=box(q+f'curtain{k} suspension tab{j}',(xx,(track_y+attach_y)/2,2.49),(.022,.012,math.hypot(.062,dy)),'v2_curtain',.003);tab.rotation_euler.x=-math.atan2(dy,.062)
  # Folded side hems follow the original corrugated edge instead of flat strips.
  for edge in [xmin,xmax]:
   ev=[v for v in vs if abs(v.x-edge)<.015];ey=sum(v.y for v in ev)/len(ev)
   box(q+f'curtain{k} folded edge{edge}',(edge,ey,1.30),(.008,.014,2.33),'v2_curtain',.003)
 ranges.append({'room':i,'wardrobeCenter':[x,y,z],'bedCenter':[bx,by,bz],'doorRailHeight':[.76,.88,1.0][i-1]})
bpy.context.view_layer.update();vs=[];fs=[]
for o in bpy.context.scene.objects:
 if o.type!='MESH'or any(m.name=='glass'for m in o.data.materials):continue
 b=len(vs);vs.extend(o.matrix_world@v.co for v in o.data.vertices);fs.extend(tuple(b+k for k in p.vertices)for p in o.data.polygons)
bvh=BVHTree.FromPolygons(vs,fs);rng=random.Random(38);dirs=[]
while len(dirs)<48:
 v=Vector([rng.uniform(-1,1)for _ in range(3)])
 if .05<v.length<=1:dirs.append(v.normalized())
values=[]
for o in new:
 a=o.data.color_attributes.new('Color','FLOAT_COLOR','POINT')
 for k,v in enumerate(o.data.vertices):
  p=o.matrix_world@v.co;n=(o.matrix_world.to_3x3()@v.normal).normalized();occ=up=esc=0
  for d in dirs:
   d=d if d.dot(n)>0 else -d;hit=bvh.ray_cast(p+n*.003,d,2)
   if hit[0]is not None:occ+=(1-hit[3]/2)**1.5
   if d.z>=-.35:
    up+=1;esc+=bvh.ray_cast(p+n*.003,d,40)[0]is None
  ao=max(.3,min(1,(1-occ/48)*1.08));a.data[k].color=(ao,ao,esc/max(1,up),1);values.append(ao)
retained=[o for o in bpy.context.scene.objects if o.name in before];assert all(sig(o)==before[o.name]for o in retained)
blend=D/'lanchuan-living39.blend';glb=D/'lanchuan-living39.glb';bpy.ops.wm.save_as_mainfile(filepath=str(blend));bpy.ops.object.select_all(action='DESELECT')
for o in bpy.context.scene.objects:
 if o.type in ('MESH','EMPTY'):o.select_set(True)
bpy.ops.export_scene.gltf(filepath=str(glb),export_format='GLB',use_selection=True,export_apply=True,export_vertex_color='ACTIVE',export_extras=True,export_animations=False,export_lights=False,export_cameras=False)
assert sha(S)==ss
report={'source':str(S.relative_to(R)),'sourceSHA256':ss,'blendSHA256':sha(blend),'glbSHA256':sha(glb),'glbBytes':glb.stat().st_size,'originalTriangles':nt,'candidateTriangles':sum(tri(o)for o in bpy.context.scene.objects),'newTriangles':sum(tri(o)for o in new),'retainedObjectsExact':len(retained),'removed':removed,'rooms':ranges,'ao':{'directions':48,'vertices':len(values),'min':min(values),'mean':sum(values)/len(values)},'seconds':time.monotonic()-start,'status':'offline candidate only; no runtime/GI binding changes','GI':'All three complete source-bound GI and contact fields must be genuinely rebaked after approval; original upper-contact package not reusable by source identity','collision':'Keep furniture envelopes and circulation; new shell furniture needs collision verification. New corner feet extend to actual original wood floor top .0355m; no footprint expansion.','provenance':'Original authored layouts and existing PBR materials reused; designed joinery, not surveyed reconstruction; no Aholo'}
(D/'metadata.json').write_text(json.dumps(report,indent=2,ensure_ascii=False));print(json.dumps(report))
