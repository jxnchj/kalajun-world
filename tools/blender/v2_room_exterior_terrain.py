"""Opt-in one-entity external terrain sky transport. Source assets stay read-only."""
import bpy,json,re,math,time,base64,hashlib,sys
import numpy as np
from pathlib import Path
from mathutils import Vector
from mathutils.bvhtree import BVHTree
sys.path.insert(0,str(Path(__file__).resolve().parent))
import v2_room_bounce as rb
import v2_room_second_bounce as rs
ROOT=rb.ROOT;load=lambda p:json.loads(p.read_text().split('export default ',1)[1].rsplit(';',1)[0]);sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
recipe_path=ROOT/'tools/reports/room-exterior-terrain-v38.json';recipe=json.loads(recipe_path.read_text());key=recipe['roomKey'];base=load(ROOT/'web/src/v2/household-room-data'/f'{key}.js');original=json.loads((ROOT/'web/src/v2/room-bounce-data.js').read_text().split('export const ROOM_BOUNCE_DATA = ',1)[1].rsplit(';',1)[0])['house_a']
source=ROOT/'assets/src/v2/pastoral/house_a-lived.blend';glb=ROOT/'web/public/assets/v2/house_a_lived.glb';protected={str(source.relative_to(ROOT)):sha(source),str(glb.relative_to(ROOT)):sha(glb)}
for ext in base['externalSources']:
 for p,h in [(ROOT/ext['sourceBlend'],ext['blendSHA256']),(ROOT/'web/public'/ext['sourceGLB'],ext['sourceSHA256'])]:assert sha(p)==h;protected[str(p.relative_to(ROOT))]=h
for s in recipe['sources']:assert sha(ROOT/s['path'])==s['sha256']
assert all(abs(recipe['pose']['scale'][axis]-1)<1e-9 for axis in ['x','y','z'])
terrain=BVHTree.FromPolygons([Vector(v)for v in recipe['vertices']],recipe['triangles'],all_triangles=True,epsilon=0)
vertex_colors=np.array(recipe['colors']);albedo=np.array([vertex_colors[t].mean(axis=0)for t in recipe['triangles']]);cache={};mode='sky';metrics={'escapeSky':0,'groundHits':0,'belowHorizonMisses':0,'groundVisibilitySamples':0}
def ground_visibility(point,normal,own):
 if normal.y<0:normal=-normal
 ck=(*[round(v/8)for v in point],*[round(v/.1)for v in normal]);value=cache.get(ck)
 if value is not None:return value
 visible=0
 for d in rs.cosine_directions(normal,64):
  metrics['groundVisibilitySamples']+=1
  if d.y<=0:continue
  start=point+normal*.08
  if terrain.ray_cast(start,d,12000)[0]is not None:continue
  if own.ray_cast(start,d,12000)[0]is not None:continue
  visible+=1
 value=visible/64;cache[ck]=value;return value

def external_irradiance(point,normal,openings,own):
 start=point+normal*.012;value=np.zeros(3)
 for points,n,area in openings:
  for target in points:
   delta=target-start;distance=delta.length
   if distance<.025:continue
   direction=delta/distance;cosine=max(0,normal.dot(direction))*max(0,n.dot(direction))
   if cosine<=0 or own.ray_cast(start,direction,max(.001,distance-.024))[0]is not None:continue
   # Continue the actual aperture ray. No scalar sky-visibility multiplier.
   escape=target+direction*.04
   if own.ray_cast(escape,direction,12000)[0]is not None:continue
   hit,tn,face,_=terrain.ray_cast(escape,direction,12000)
   if hit is None:
    if direction.y<=0:metrics['belowHorizonMisses']+=1;continue
    metrics['escapeSky']+=1
    if mode=='sky':value+=area*cosine/max(distance*distance,.0025)
   else:
    metrics['groundHits']+=1
    if mode=='groundSky':value+=area*cosine/max(distance*distance,.0025)*albedo[face]*ground_visibility(hit,tn,own)
 return np.minimum(math.pi,value)
rb.irradiance_at=external_irradiance;rs.irradiance_at=external_irradiance
started=time.monotonic();states={};definitions=rb.definitions();definition=definitions['house_a']
for closed in [False,True]:
 bpy.ops.wm.open_mainfile(filepath=str(source))
 ext=base['externalSources'][0]
 with bpy.data.libraries.load(str(ROOT/ext['sourceBlend']),link=False)as(src,dst):dst.objects=[n for n in src.objects if n.startswith('household_2_')]
 for obj in dst.objects:bpy.context.scene.collection.objects.link(obj);obj.location.x-=20
 if closed:
  for obj in bpy.context.scene.objects:
   if re.fullmatch(r'house_a_door\d+(_out)?',obj.name):obj.rotation_euler=(0,0,0)
 bvh,colors,_=rb.geometry();definition_now={**definition,'openings':[o for o in definition['openings']if not closed or o['kind']!='door']}
 state={}
 for mode in ['sky','groundSky']:
  cache.clear();first=rb.bake(key,definition_now,bvh,colors,source,glb,validity=original);first['openings']=original['openings']
  second=rs.bake(key,definition_now,first,bvh,colors,source,glb)
  state[mode]={'first':first,'second':second};print(json.dumps({'closed':closed,'component':mode,'seconds':time.monotonic()-started}),flush=True)
 states['closed'if closed else'open']=state
result={'entityId':recipe['entityId'],'roomKey':key,'pose':recipe['pose'],'terrainSources':recipe['sources'],'recipeSHA256':sha(recipe_path),'externalSources':base['externalSources'],'states':states,'model':'actual external terrain visibility plus one terrain reflection of uniform upper sky, then existing one/two internal diffuse bounces','limits':['Terrain 4m near/32m far, 4096m square radius; low-frequency source vertex albedo excludes GPU detail modulation.','No ground reflection of sunlight, unchanged existing direct-source solar transport.','No neighbouring building/tree occlusion; ground sky visibility 64 cosine rays cached at 8m/0.1 normal bins.','Direct aperture sky shader is unchanged; this candidate corrects indirect transport only.','Door intermediate states still interpolate two endpoints for this entity.']}
out=ROOT/'web/src/v2/room-exterior-terrain-data.js';out.write_text('export default '+json.dumps(result,separators=(',',':'))+';\n')
assert all(sha(ROOT/p)==h for p,h in protected.items())
(ROOT/'tools/reports/room-exterior-gi-v38.json').write_text(json.dumps({'entityId':result['entityId'],'seconds':time.monotonic()-started,'bytes':out.stat().st_size,'protected':protected,'sourcesUnchanged':True,'metrics':metrics,'limits':result['limits']},indent=2));print('EXTERIOR_GI_DONE',flush=True)
