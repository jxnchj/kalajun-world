"""Same 36-sample direct aperture quadrature, continued through exterior terrain.
Preserves original probe grid/opening order; produces joint visibility, not a
room-average sky brightness multiplier. Original GI/source assets stay untouched.
"""
import bpy,json,re,base64,hashlib,time
import numpy as np
from pathlib import Path
from mathutils import Vector
from mathutils.bvhtree import BVHTree
from v2_room_bounce import ROOT,geometry
from v2_room_aperture_visibility import aperture_points
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
load=lambda p:json.loads(p.read_text().split('export default ',1)[1].rsplit(';',1)[0])
recipe=load(ROOT/'web/src/v2/room-exterior-terrain-data.js')
terrain_recipe=json.loads((ROOT/'tools/reports/room-exterior-terrain-v38.json').read_text())
key=recipe['roomKey'];bundle=load(ROOT/'web/src/v2/household-room-data'/f'{key}.js')
base=bundle['sky'];source=ROOT/base['sourceBlend'];glb=ROOT/'web/public'/base['sourceGLB']
for p,h in [(source,base['blendSHA256']),(glb,base['sourceSHA256'])]:assert sha(p)==h
for s in terrain_recipe['sources']:assert sha(ROOT/s['path'])==s['sha256']
terrain=BVHTree.FromPolygons([Vector(v)for v in terrain_recipe['vertices']],terrain_recipe['triangles'],all_triangles=True,epsilon=0)
bpy.ops.wm.open_mainfile(filepath=str(source))
for s in recipe['externalSources']:
 path=ROOT/s['sourceBlend'];assert sha(path)==s['blendSHA256']
 with bpy.data.libraries.load(str(path),link=False)as(src,dst):dst.objects=[n for n in src.objects if n.startswith('household_2_')]
 for ob in dst.objects:bpy.context.scene.collection.objects.link(ob);ob.location.x-=20
def trace(point,opening,own):
 normal=Vector(opening['normal']);total=visible=sky=blocked=down=0.
 for target in aperture_points(opening):
  delta=target-point;distance=delta.length
  if distance<.003:continue
  direction=delta/distance;weight=max(0,normal.dot(direction))/(distance*distance)
  if weight<=0:continue
  total+=weight
  if own.ray_cast(point,direction,max(.001,distance-.002))[0]is not None:continue
  visible+=weight
  # Continue the identical probe -> aperture direction, retaining window identity.
  origin=target+direction*.025
  if own.ray_cast(origin,direction,40.)[0]is not None:blocked+=weight;continue
  hit=terrain.ray_cast(origin,direction,16000.)
  if hit[0]is not None:blocked+=weight;continue
  if direction.y<=0:down+=weight;continue
  sky+=weight
 return (np.array([visible,sky,blocked,down])/total if total else np.zeros(4))
nx,ny,nz=base['size'];lo=np.array(base['bounds'][0]);hi=np.array(base['bounds'][1]);states={};summary=[];started=time.monotonic()
for state in ['open','closed']:
 if state=='closed':
  for ob in bpy.context.scene.objects:
   if re.fullmatch(r'house_a_door\d+(_out)?',ob.name):ob.rotation_euler=(0,0,0)
 bpy.context.view_layer.update();own,_,_=geometry()
 raw=np.zeros((4,3,nz,ny,nx),dtype=np.uint8)
 for i,opening in enumerate(base['openings']):
  for z in range(nz):
   for y in range(ny):
    for x in range(nx):
     p=Vector(lo+(hi-lo)*np.array([x/(nx-1),y/(ny-1),z/(nz-1)]))
     raw[:,i,z,y,x]=np.rint(np.clip(trace(p,opening,own),0,1)*255).astype(np.uint8)
 expected=bundle['apertures'] if state=='open'else bundle['closed']['apertures']
 if 'reusePayload'in expected:
  doc=json.loads((ROOT/'web/src/v2/room-aperture-data.js').read_text().split('export const ROOM_APERTURE_DATA = ',1)[1].rsplit(';',1)[0]);expected=doc[expected['reusePayload']]
 old=np.frombuffer(base64.b64decode(expected['data']),dtype=np.uint8).reshape(raw[0].shape)
 error=int(np.max(np.abs(old.astype(int)-raw[0].astype(int))));assert error<=1,('own-only quadrature regression',state,error)
 states[state]={'ownOnly':base64.b64encode(raw[0].tobytes()).decode(),'upperSky':base64.b64encode(raw[1].tobytes()).decode()}
 summary.append({'state':state,'ownOnlyMaxByteError':error,'openings':[{'index':i,'kind':o['kind'],'center':o['center'],'normal':o['normal'],'ownMean':float(raw[0,i].mean()/255),'skyMean':float(raw[1,i].mean()/255),'exteriorBlockedMean':float(raw[2,i].mean()/255),'downwardMissMean':float(raw[3,i].mean()/255)}for i,o in enumerate(base['openings'])]})
result={k:base[k]for k in ['bounds','size','validProbes','sourceGLB','sourceSHA256','sourceBlend','blendSHA256','openings']}
result.update(version='room-exterior-aperture-38',entityId=recipe['entityId'],roomKey=key,pose=recipe['pose'],externalSources=recipe['externalSources'],terrainSources=recipe['terrainSources'],encoding='u8-opening-slabs',apertureSamples=36,states=states,summary=summary,scope='Direct diffuse upper sky only; identical original aperture quadrature extended along each probe ray. Retains opening identity and grid. No direct terrain reflected radiance or specular correction; not full dynamic GI.')
out=ROOT/'web/src/v2/room-exterior-aperture-data.js';out.write_text('export default '+json.dumps(result,separators=(',',':'))+';\n')
report={k:v for k,v in result.items()if k!='states'};report.update(bytes=out.stat().st_size,elapsedSeconds=time.monotonic()-started)
(ROOT/'tools/reports/room-exterior-aperture-v38.json').write_text(json.dumps(report,indent=2))
print(json.dumps(report),flush=True)
