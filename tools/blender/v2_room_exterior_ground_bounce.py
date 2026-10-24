"""Unit sun -> external terrain -> aperture -> ONE/TWO interior diffuse bounces.
Reuses identical geometric paths for all 81 directions. No sky, direct solar or
zero-interior-bounce term. Original Blend/GLB and existing transport are read-only.
"""
import argparse,base64,hashlib,json,math,re,time
from pathlib import Path
import bpy
import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree
import v2_room_bounce as rb
from v2_room_second_bounce import cosine_directions,SURFACE_SAMPLES
from v2_room_transport import directions,encode_rle,AZIMUTHS,ELEVATIONS

parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('--plan-only',action='store_true')
parser.add_argument('--max-seconds',type=float,default=600)
args=parser.parse_args()
ROOT=rb.ROOT
load=lambda p:json.loads(p.read_text().split('export default ',1)[1].rsplit(';',1)[0])
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
started=time.monotonic()
def budget():
 if time.monotonic()-started>args.max_seconds:raise TimeoutError('Bounded bake budget exceeded; no runtime table written')
recipe_path=ROOT/'tools/reports/room-exterior-terrain-v38.json'
recipe=json.loads(recipe_path.read_text());key=recipe['roomKey']
bundle=load(ROOT/'web/src/v2/household-room-data'/f'{key}.js');base=bundle['sky']
source=ROOT/base['sourceBlend'];glb=ROOT/'web/public'/base['sourceGLB']
protected={str(source.relative_to(ROOT)):sha(source),str(glb.relative_to(ROOT)):sha(glb)}
assert protected[str(source.relative_to(ROOT))]==base['blendSHA256']
assert protected[str(glb.relative_to(ROOT))]==base['sourceSHA256']
for s in recipe['sources']:assert sha(ROOT/s['path'])==s['sha256'],s['path']
for s in bundle['externalSources']:
 for p,h in [(ROOT/s['sourceBlend'],s['blendSHA256']),(ROOT/'web/public'/s['sourceGLB'],s['sourceSHA256'])]:
  assert sha(p)==h;protected[str(p.relative_to(ROOT))]=h
terrain=BVHTree.FromPolygons([Vector(v)for v in recipe['vertices']],recipe['triangles'],all_triangles=True,epsilon=0)
terrain_colors=np.array(recipe['colors'])
terrain_rho=np.array([terrain_colors[t].mean(axis=0)for t in recipe['triangles']])
assert np.all((terrain_rho>=0)&(terrain_rho<=1))
valid=np.frombuffer(base64.b64decode(base['data']),dtype='<f2').reshape(4,-1,4)[0,:,3]>0
assert int(valid.sum())==base['validProbes']==239,'Original valid probe set changed'
nx,ny,nz=base['size'];count=nx*ny*nz;lo=np.array(base['bounds'][0]);hi=np.array(base['bounds'][1])
probe_dirs=[]
for k in range(rb.SAMPLES):
 y=1-2*(k+.5)/rb.SAMPLES;r=math.sqrt(1-y*y);phi=k*math.pi*(3-math.sqrt(5))
 probe_dirs.append(Vector((r*math.cos(phi),y,r*math.sin(phi))))
basis=np.array([[math.pi,*[2*math.pi*x for x in d]]for d in probe_dirs])/rb.SAMPLES
definition=rb.definitions()['house_a'];states={};summaries=[]

for closed in [False,True]:
 state_started=time.monotonic();bpy.ops.wm.open_mainfile(filepath=str(source))
 for s in bundle['externalSources']:
  with bpy.data.libraries.load(str(ROOT/s['sourceBlend']),link=False)as(src,dst):dst.objects=[n for n in src.objects if n.startswith('household_2_')]
  for ob in dst.objects:bpy.context.scene.collection.objects.link(ob);ob.location.x-=20
 if closed:
  for ob in bpy.context.scene.objects:
   if re.fullmatch(r'house_a_door\d+(_out)?',ob.name):ob.rotation_euler=(0,0,0)
 own,rho,_=rb.geometry()
 current={**definition,'openings':[o for o in definition['openings']if not closed or o['kind']!='door']}
 openings=rb.aperture_samples(current)
 opening_ids=[definition['openings'].index(o)for o in current['openings']]
 # First surfaces retain actual probe-ray positions. Second-hit direct-source
 # sharing uses the existing second-bounce bake's 3.5cm / 0.10 normal convention.
 surfaces=[];a_cache={};b_cache={};probe_rows=[];first_count=0
 for iz in range(nz):
  for iy in range(ny):
   for ix in range(nx):
    pi=(iz*ny+iy)*nx+ix
    if not valid[pi]:continue
    p=Vector(lo+(hi-lo)*np.array([ix/(nx-1),iy/(ny-1),iz/(nz-1)]))
    for di,d in enumerate(probe_dirs):
     hit,n,face,_=own.ray_cast(p,d,30)
     if hit is None:continue
     if n.dot(d)>0:n=-n
     ck=(*[round(v,5)for v in hit],*[round(v,5)for v in n],face)
     ai=a_cache.get(ck)
     if ai is None:ai=len(surfaces);a_cache[ck]=ai;surfaces.append((hit,n,rho[face]))
     probe_rows.append((pi,di,ai))
  budget()
 first_count=len(surfaces);links=[]
 print(json.dumps({'closed':closed,'stage':'probe-surfaces','surfaces':first_count,'seconds':time.monotonic()-state_started}),flush=True)
 for ai in range(first_count):
  point,n,reflectance=surfaces[ai]
  if not np.any(reflectance):continue
  for d in cosine_directions(n,SURFACE_SAMPLES):
   hit,bn,face,_=own.ray_cast(point+n*.012,d,30)
   if hit is None or not np.any(rho[face]):continue
   if bn.dot(d)>0:bn=-bn
   ck=(*[round(v/.035)for v in hit],*[round(v/.10)for v in bn],face)
   bi=b_cache.get(ck)
   if bi is None:bi=len(surfaces);b_cache[ck]=bi;surfaces.append((hit,bn,rho[face]))
   links.append((ai,bi))
  if ai%256==0:budget()
 print(json.dumps({'closed':closed,'stage':'secondary-surfaces','surfaces':len(surfaces)-first_count,'links':len(links),'seconds':time.monotonic()-state_started}),flush=True)
 ground=[];ground_cache={};paths=[];opening_counts=[0]*len(definition['openings']);limited=0
 for si,(point,n,reflectance)in enumerate(surfaces):
  start=point+n*.012;local=[];total=0.
  for oi,(targets,on,area)in enumerate(openings):
   for target in targets:
    delta=target-start;dist=delta.length
    if dist<.025:continue
    d=delta/dist;weight=area*max(0,n.dot(d))*max(0,on.dot(d))/max(dist*dist,.0025)
    if weight<=0 or own.ray_cast(start,d,max(.001,dist-.024))[0]is not None:continue
    escape=target+d*.04
    if own.ray_cast(escape,d,12000)[0]is not None:continue
    total+=weight
    hit,gn,face,_=terrain.ray_cast(escape,d,12000)
    if hit is None:continue
    if gn.y<0:gn=-gn
    ck=(*[round(v,5)for v in hit],face)
    gi=ground_cache.get(ck)
    if gi is None:gi=len(ground);ground_cache[ck]=gi;ground.append((hit,gn,terrain_rho[face]))
    local.append((si,gi,weight));opening_counts[opening_ids[oi]]+=1
  # Geometry-only normalization prevents near-aperture point quadrature from
  # collecting >pi solid angle, preserving linear source mixing thereafter.
  limiter=min(1,math.pi/total)if total>0 else 1
  limited+=limiter<1
  paths.extend((s,g,w*limiter)for s,g,w in local)
  if si%256==0:budget()
 print(json.dumps({'closed':closed,'stage':'ground-paths','groundHits':len(ground),'paths':len(paths),'seconds':time.monotonic()-state_started}),flush=True)
 probe_rows=np.array(probe_rows,dtype=np.int32);links=np.array(links,dtype=np.int32)
 rows=np.array([p[0]for p in paths],dtype=np.int32)
 which=np.array([p[1]for p in paths],dtype=np.int32)
 weights=np.array([p[2]for p in paths])
 reflectances=np.array([s[2]for s in surfaces]);ground_albedo=np.array([g[2]for g in ground])
 first_tables=[];second_tables=[];direction_stats=[]
 def project(radiance):
  result=np.zeros((4,count,3),np.float32)
  for band in range(4):np.add.at(result[band],probe_rows[:,0],radiance[probe_rows[:,2]]*basis[probe_rows[:,1],band,None])
  assert np.isfinite(result).all() and np.all(result[0]>=0)
  assert np.all(result[:,~valid]==0)
  return result
 chosen=list(enumerate(directions()))
 if args.plan_only:chosen=[chosen[-1]]
 for di,sun in chosen:
  ds=time.monotonic();incoming=[]
  for gi,(point,n,reflectance)in enumerate(ground):
   cosine=max(0,n.dot(sun));start=point+n*.08
   if cosine>0 and (terrain.ray_cast(start,sun,16000)[0]is not None or own.ray_cast(start,sun,16000)[0]is not None):cosine=0.
   incoming.append(cosine)
   if gi%4096==0:budget()
  radiance=ground_albedo*np.array(incoming)[:,None]/math.pi
  irradiance=np.zeros((len(surfaces),3));np.add.at(irradiance,rows,radiance[which]*weights[:,None])
  local_radiance=reflectances*irradiance/math.pi
  first=project(local_radiance[:first_count])
  second_radiance=np.zeros((first_count,3))
  np.add.at(second_radiance,links[:,0],local_radiance[links[:,1]])
  second_radiance*=reflectances[:first_count]/SURFACE_SAMPLES
  second=project(second_radiance)
  assert np.all(first[0]<=float(ground_albedo.max())*.9+1e-5),'First reflection energy bound'
  assert np.all(second[0]<=float(ground_albedo.max())*.9*.9+1e-5),'Second reflection energy bound'
  first_tables.append(encode_rle(first));second_tables.append(encode_rle(second))
  direction_stats.append({'index':di,'seconds':time.monotonic()-ds,'litGround':sum(v>0 for v in incoming),'firstMean':first[0,valid].mean(axis=0).tolist(),'secondMean':second[0,valid].mean(axis=0).tolist()})
  if di%16==0 or args.plan_only:print(json.dumps({'closed':closed,**direction_stats[-1]}),flush=True)
  budget()
 metadata={k:base[k]for k in ['bounds','size','validProbes','sourceGLB','sourceSHA256','sourceBlend','blendSHA256','openings']}
 def table(encoded):return {**metadata,'azimuths':AZIMUTHS,'elevations':ELEVATIONS,'zenithIndex':80,'encoding':'zero-run-f16-rgb-sh4-v1','directions':encoded}
 states['closed'if closed else'open']={'first':table(first_tables),'second':table(second_tables)}
 summary={'closed':closed,'probeRayCount':len(probe_rows),'firstSurfaces':first_count,'secondSurfaces':len(surfaces)-first_count,'secondLinks':len(links),'groundHits':len(ground),'groundPaths':len(paths),'pathsByOpening':opening_counts,'limitedApertureSamples':limited,'geometrySeconds':time.monotonic()-state_started-sum(d['seconds']for d in direction_stats),'directions':direction_stats,'stateSeconds':time.monotonic()-state_started}
 summaries.append(summary);print(json.dumps({k:v for k,v in summary.items()if k!='directions'}),flush=True)
 if args.plan_only:break
assert all(sha(ROOT/p)==h for p,h in protected.items())
result={'version':'room-exterior-ground-bounce-38','entityId':recipe['entityId'],'roomKey':key,'pose':recipe['pose'],'terrainSources':recipe['sources'],'externalSources':bundle['externalSources'],'recipeSHA256':sha(recipe_path),'samples':rb.SAMPLES,'surfaceSamples':SURFACE_SAMPLES,'apertureSamples':4,'interiorBounceOrders':[1,2],'states':states,'summary':summaries,'scope':'Only unit directional sun -> terrain Lambert reflection -> aperture -> exactly one/two indoor Lambert reflections -> probe. No sky, zero-indoor-bounce ground return or direct-aperture solar path. Raw linear cosine-convolved SH, original 239 valid probes, 96 probe directions and 32 secondary cosine rays. Four aperture quadrants as existing internal bounce bake; exact hit ground shadow, existing 3.5cm secondary source cache.'}
report={k:v for k,v in result.items()if k!='states'}
report.update(planOnly=args.plan_only,seconds=time.monotonic()-started,protected=protected,sourcesUnchanged=True)
if not args.plan_only:
 out=ROOT/'web/src/v2/room-exterior-ground-bounce-data.js'
 out.write_text('export default '+json.dumps(result,separators=(',',':'))+';\n')
 report['bytes']=out.stat().st_size
(ROOT/'tools/reports'/('room-exterior-ground-bounce-plan-v38.json'if args.plan_only else'room-exterior-ground-bounce-v38.json')).write_text(json.dumps(report,indent=2))
print('GROUND_BOUNCE_PLAN_DONE'if args.plan_only else'GROUND_BOUNCE_DONE',report['seconds'],flush=True)
