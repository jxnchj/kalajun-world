"""Terrain radiance -> aperture -> probe, with ZERO interior surface interactions.
Independent of existing terrain -> internal one/two bounce fields. Uniform upper
sky and unit directional sunlight are distinct source tables; original assets stay read-only.
"""
import bpy,json,re,math,time,base64,hashlib
import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree
from v2_room_bounce import ROOT,geometry,SKY
from v2_room_aperture_visibility import aperture_points
from v2_room_second_bounce import cosine_directions
from v2_room_transport import directions,encode_rle,AZIMUTHS,ELEVATIONS
load=lambda p:json.loads(p.read_text().split('export default ',1)[1].rsplit(';',1)[0]);sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
recipe=json.loads((ROOT/'tools/reports/room-exterior-terrain-v38.json').read_text());key=recipe['roomKey'];bundle=load(ROOT/'web/src/v2/household-room-data'/f'{key}.js');base=bundle['sky'];source=ROOT/base['sourceBlend'];glb=ROOT/'web/public'/base['sourceGLB']
assert sha(source)==base['blendSHA256'] and sha(glb)==base['sourceSHA256']
for s in recipe['sources']:assert sha(ROOT/s['path'])==s['sha256']
terrain=BVHTree.FromPolygons([Vector(v)for v in recipe['vertices']],recipe['triangles'],all_triangles=True,epsilon=0)
colors=np.asarray(recipe['colors']);albedo=np.array([colors[t].mean(axis=0)for t in recipe['triangles']])
valid=np.frombuffer(base64.b64decode(base['data']),dtype='<f2').reshape(4,-1,4)[0,:,3]>0
nx,ny,nz=base['size'];count=nx*ny*nz;lo=np.array(base['bounds'][0]);hi=np.array(base['bounds'][1]);states={};summaries=[];started=time.monotonic()
for closed in [False,True]:
 bpy.ops.wm.open_mainfile(filepath=str(source))
 for s in bundle['externalSources']:
  assert sha(ROOT/s['sourceBlend'])==s['blendSHA256']
  with bpy.data.libraries.load(str(ROOT/s['sourceBlend']),link=False)as(src,dst):dst.objects=[n for n in src.objects if n.startswith('household_2_')]
  for ob in dst.objects:bpy.context.scene.collection.objects.link(ob);ob.location.x-=20
 if closed:
  for ob in bpy.context.scene.objects:
   if re.fullmatch(r'house_a_door\d+(_out)?',ob.name):ob.rotation_euler=(0,0,0)
 own,_,_=geometry();hits=[];cache={};paths=[];opening_counts=[0,0,0];max_solid_angle=0.
 for iz in range(nz):
  for iy in range(ny):
   for ix in range(nx):
    index=(iz*ny+iy)*nx+ix
    if not valid[index]:continue
    p=Vector(lo+(hi-lo)*np.array([ix/(nx-1),iy/(ny-1),iz/(nz-1)]))
    for oi,o in enumerate(base['openings']):
     if closed and o['kind']=='door':continue
     normal=Vector(o['normal']);targets=aperture_points(o);area=o['width']*o['height']*o.get('skyWeight',1)/len(targets);solid=0.
     for target in targets:
      delta=target-p;distance=delta.length
      if distance<.003:continue
      d=delta/distance;weight=area*max(0,normal.dot(d))/distance**2;solid+=weight
      if weight<=0 or own.ray_cast(p,d,max(.001,distance-.002))[0]is not None:continue
      start=target+d*.025
      if own.ray_cast(start,d,12000)[0]is not None:continue
      hit,n,face,_=terrain.ray_cast(start,d,12000)
      if hit is None:continue
      if n.y<0:n=-n
      # Only identical terrain hit points share source visibility. No grouping
      # across different aperture/probe directions or coarse height bins.
      ck=(*[round(v,5)for v in hit],face)
      h=cache.get(ck)
      if h is None:h=len(hits);cache[ck]=h;hits.append((hit,n,albedo[face]))
      paths.append((index,h,weight,np.array([.25,.5*d.x,.5*d.y,.5*d.z])))
      opening_counts[oi]+=1
     max_solid_angle=max(max_solid_angle,solid)
 assert max_solid_angle<=2*math.pi*1.05
 rows=np.array([p[0]for p in paths],dtype=int);which=np.array([p[1]for p in paths],dtype=int)
 basis=np.array([p[2]*p[3]for p in paths]);rho=np.array([p[2]for p in hits])
 def pack(values):
  result=np.zeros((4,count,3),dtype=np.float32)
  for band in range(4):np.add.at(result[band],rows,values[which]*basis[:,band,None])
  assert np.isfinite(result).all();assert np.all(result[0]>=0)
  # Raw first-band directional projection: no separately nonlinear positivity
  # squeeze that would make sums/source interpolation cease to be linear.
  return result
 visibility=[]
 for point,n,r in hits:
  visible=0;start=point+n*.08
  for d in cosine_directions(n,64):
   if d.y>0 and terrain.ray_cast(start,d,12000)[0]is None and own.ray_cast(start,d,12000)[0]is None:visible+=1
  visibility.append(visible/64)
 sky=pack(rho*SKY*np.array(visibility)[:,None])
 solar=[];maxima=[];lit=[]
 for sun in directions():
  incoming=[]
  for point,n,r in hits:
   cosine=max(0,n.dot(sun));start=point+n*.08
   if cosine>0 and (terrain.ray_cast(start,sun,16000)[0]is not None or own.ray_cast(start,sun,16000)[0]is not None):cosine=0.
   incoming.append(cosine)
  values=rho*np.array(incoming)[:,None]/math.pi;field=pack(values)
  solar.append(encode_rle(field));maxima.append(float(field.max()));lit.append(sum(v>0 for v in incoming))
 metadata={k:base[k]for k in ['bounds','size','validProbes','sourceGLB','sourceSHA256','sourceBlend','blendSHA256','openings']}
 states['closed'if closed else'open']={'sky':base64.b64encode(sky.astype('<f2').tobytes()).decode(),'solar':{**metadata,'azimuths':AZIMUTHS,'elevations':ELEVATIONS,'zenithIndex':len(solar)-1,'encoding':'zero-run-f16-rgb-sh4-v1','directions':solar}}
 summaries.append({'closed':closed,'groundPathsByOpening':opening_counts,'groundHitCount':len(hits),'maxApertureSolidAngle':max_solid_angle,'skyFirstCoefficientMean':sky[0,valid].mean(axis=0).tolist(),'solarMax':max(maxima),'litGroundHitCounts':lit,'seconds':time.monotonic()-started})
 print(json.dumps(summaries[-1]),flush=True)
result={k:base[k]for k in ['bounds','size','validProbes','sourceGLB','sourceSHA256','sourceBlend','blendSHA256','openings']}
result.update(version='room-exterior-ground-direct-38',entityId=recipe['entityId'],roomKey=key,pose=recipe['pose'],terrainSources=recipe['sources'],externalSources=bundle['externalSources'],apertureSamples=36,groundSkySamples=64,interiorBounceOrder=0,states=states,summary=summaries,scope='Only paths terrain -> aperture -> receiver/probe. Sky unit radiance SKY*rho*visible cosine hemisphere; sun unit irradiance*rho*cos/pi including terrain/own-house shadow. First-band SH is directional low-frequency approximation; no direct sky or internal reflection is included.')
out=ROOT/'web/src/v2/room-exterior-ground-data.js';out.write_text('export default '+json.dumps(result,separators=(',',':'))+';\n')
assert sha(source)==base['blendSHA256'] and sha(glb)==base['sourceSHA256']
(ROOT/'tools/reports/room-exterior-ground-v38.json').write_text(json.dumps({k:v for k,v in result.items()if k!='states'},indent=2))
print('GROUND_DIRECT_DONE',out.stat().st_size,time.monotonic()-started,flush=True)
