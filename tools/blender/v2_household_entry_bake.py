"""Bake only one entity's retained house + tea furniture + final Blender stones.
Never replace house_a or house_a-living-0 shared fields. Same integrators/grid.
Run after v2_household_entry.py and deterministic GLB transport generation.
"""
import bpy, json, re, base64, hashlib, time
import numpy as np
from pathlib import Path
import sys
sys.path.insert(0,str(Path(__file__).resolve().parent))
from v2_room_bounce import ROOT,definitions,geometry,bake as sky_bake
from v2_room_second_bounce import bake as second_sky_bake
from v2_room_transport import bake as sun_bake
from v2_room_second_solar import bake as second_sun_bake
from v2_room_aperture_visibility import bake as aperture_bake
from v2_room_contact import geometry as contact_geometry,bake as contact_bake
from v2_household_room_reuse import pack
SOURCE=ROOT/'assets/src/v2/pastoral/house_a-lived.blend';GLB=ROOT/'web/public/assets/v2/house_a_lived.glb'
EXTERNAL=ROOT/'assets/src/v2/pastoral/household-living-32.blend';EXTERNAL_GLB=ROOT/'web/public/assets/v2/household_living.glb'
ENTRY=ROOT/'assets/src/v2/pastoral/household-entry-tea-34.blend';ENTRY_GLB=ROOT/'web/public/assets/v2/household_entry_tea.glb';ENTRY_META=ROOT/'assets/src/v2/pastoral/household-entry-tea-34.metadata.json'
OUT=ROOT/'web/src/v2/household-room-data';OUT.mkdir(exist_ok=True)
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
external=[{'sourceGLB':str(EXTERNAL_GLB.relative_to(ROOT/'web/public')),'sourceSHA256':sha(EXTERNAL_GLB),'sourceBlend':str(EXTERNAL.relative_to(ROOT)),'blendSHA256':sha(EXTERNAL)},{'sourceGLB':str(ENTRY_GLB.relative_to(ROOT/'web/public')),'sourceSHA256':sha(ENTRY_GLB),'sourceBlend':str(ENTRY.relative_to(ROOT)),'blendSHA256':sha(ENTRY)}]
entry_meta=json.loads(ENTRY_META.read_text());entity_id=entry_meta['entityId']
assert entry_meta['sourceSHA256']==sha(ENTRY_GLB)and entry_meta['blendSHA256']==sha(ENTRY)and entry_meta['recipeSHA256']==sha(ROOT/entry_meta['recipe']),'Re-export the edited master and refresh metadata before baking transport'
def load_js(path,marker):return json.loads(path.read_text().split(marker,1)[1].rsplit(';',1)[0])
original=load_js(ROOT/'web/src/v2/room-bounce-data.js','export const ROOM_BOUNCE_DATA = ')['house_a']
shared_paths=[SOURCE,GLB,EXTERNAL,EXTERNAL_GLB]+[OUT/f'house_a-living-{i}.js'for i in range(3)];protected={str(p.relative_to(ROOT)):sha(p)for p in shared_paths}
definition=definitions()['house_a'];summary=[];control=None;started=time.monotonic()
for include_entry in [False,True]:
 style=0;external_for_variant=external if include_entry else external[:1]
 key='house_a-entry-tea-34'if include_entry else'house_a-living-0';bpy.ops.wm.open_mainfile(filepath=str(SOURCE))
 with bpy.data.libraries.load(str(EXTERNAL),link=False)as(src,dst):dst.objects=[name for name in src.objects if name.startswith(f'household_{style}_')]
 assert len(dst.objects)==5
 for obj in dst.objects:bpy.context.scene.collection.objects.link(obj);obj.location.x-=style*10
 if include_entry:
  with bpy.data.libraries.load(str(ENTRY),link=False)as(src,dst):dst.objects=[name for name in src.objects if name.startswith('entry_')]
  assert len(dst.objects)==len(entry_meta['stones'])
  for obj in dst.objects:bpy.context.scene.collection.objects.link(obj)
 bpy.context.view_layer.update();bvh,colors,_=geometry()
 first=sky_bake(key,definition,bvh,colors,SOURCE,GLB,validity=original)
 assert first['validProbes']==original['validProbes']
 old=np.frombuffer(base64.b64decode(original['data']),dtype='<f2').reshape(4,-1,4)
 current=np.frombuffer(base64.b64decode(first['data']),dtype='<f2').reshape(4,-1,4)
 assert np.array_equal(old[:,:,3],current[:,:,3]),'Outdoor furniture must not change indoor probe validity'
 result={'sky':first,'secondSky':second_sky_bake(key,definition,first,bvh,colors,SOURCE,GLB),'solar':sun_bake(key,definition,first,bvh,colors,SOURCE,GLB),'secondSolar':second_sun_bake(key,definition,first,bvh,colors,SOURCE,GLB),'apertures':aperture_bake(key,first,bvh),'contact':contact_bake(key,definition,SOURCE,GLB,contact_geometry())}
 poses=[]
 for obj in bpy.context.scene.objects:
  if re.fullmatch(r'house_a_door\d+(_out)?',obj.name):poses.append({'name':obj.name,'openEuler':list(obj.rotation_euler),'closedEuler':[0,0,0]});obj.rotation_euler=(0,0,0)
 assert len(poses)==1
 bvh,colors,_=geometry();closed_definition={**definition,'openings':[o for o in definition['openings']if o['kind']!='door']}
 closed_first=sky_bake(key,closed_definition,bvh,colors,SOURCE,GLB,validity=first)
 raw=np.frombuffer(base64.b64decode(closed_first['data']),dtype='<f2').copy().reshape(4,-1,4);raw[:,:,3]=current[:,:,3];raw[:,:,:3]*=(current[:,:,[3]]>0);closed_first['data']=base64.b64encode(raw.tobytes()).decode();closed_first['validProbes']=first['validProbes'];closed_first['openings']=first['openings']
 result['closed']={'sky':closed_first,'secondSky':second_sky_bake(key,closed_definition,first,bvh,colors,SOURCE,GLB),'solar':sun_bake(key,closed_definition,first,bvh,colors,SOURCE,GLB),'secondSolar':second_sun_bake(key,closed_definition,first,bvh,colors,SOURCE,GLB),'apertures':aperture_bake(key,first,bvh),'doorPoses':poses,'model':'same two static diffuse bounces, closed original door endpoint with tea set and entity-specific stone entry'}
 for name in ['sky','secondSky','solar','secondSolar','apertures','contact']:result[name]['externalSources']=external_for_variant;result[name]['householdStyle']=style
 for name in ['sky','secondSky','solar','secondSolar','apertures']:result['closed'][name]['externalSources']=external_for_variant;result['closed'][name]['householdStyle']=style
 result.update({'key':key,'entityId':entity_id,'householdStyle':style,'externalSources':external_for_variant,'model':'existing two-bounce static room transfer with complete original woodhouse, tea usage set and one entity-specific stone entry; unchanged sampling algorithms'})
 if include_entry:result['geometryRevision']=entry_meta.get('geometryRevision','initial-10mm')
 result=pack(result)
 if not include_entry:
  result.pop('entityId');existing=load_js(OUT/'house_a-living-0.js','export default ')
  payload=lambda f:f.get('data',f.get('directions',f.get('reusePayload')))
  comparisons={state+'.'+name:payload(a[name])==payload(b[name])for state,a,b,names in [('open',result,existing,['sky','secondSky','solar','secondSolar','apertures','contact']),('closed',result['closed'],existing['closed'],['sky','secondSky','solar','secondSolar','apertures'])]for name in names}
  control={'reference':'house_a-living-0','payloadsByteIdentical':comparisons,'allPayloadsByteIdentical':all(comparisons.values()),'elapsedSeconds':time.monotonic()-started,'blenderVersion':bpy.app.version_string}
  (ROOT/'tools/reports/household-entry-control-v34.json').write_text(json.dumps(control,indent=2)+'\n');print(json.dumps(control),flush=True)
  assert control['allPayloadsByteIdentical'],'Retained tea bundle must reproduce before attributing differences to new stones'
  continue
 path=OUT/f'{key}.js';path.write_text('// Generated by tools/blender/v2_household_entry_bake.py; only the named tea entity uses this bundle.\nexport default '+json.dumps(result,separators=(',',':'))+';\n')
 summary.append({'key':key,'householdStyle':style,'rawModuleBytes':path.stat().st_size,'validProbes':first['validProbes'],'changedFirstSkyWordsFromBase':int(np.count_nonzero(old.view('<u2')!=current.view('<u2'))),'firstSkyMaxDelta':float(np.max(abs(old.astype(float)-current.astype(float)))),'externalSources':external_for_variant,'elapsedSeconds':time.monotonic()-started})
 print(json.dumps(summary[-1]),flush=True)
(ROOT/'tools/reports/household-entry-room-v34.json').write_text(json.dumps({'version':'household-entry-tea-34','geometryRevision':entry_meta.get('geometryRevision','initial-10mm'),'entityId':entity_id,'seconds':time.monotonic()-started,'control':control,'blenderVersion':bpy.app.version_string,'unchangedSharedSources':protected,'sharedSourceHashesStillMatch':all(sha(ROOT/p)==h for p,h in protected.items()),'limits':['Existing static two-bounce room model only; outdoor terrain, other buildings and arbitrary dynamic geometry remain outside this model.'],'variants':summary,'sourceHouseUnchanged':sha(SOURCE)==original['blendSHA256'],'sourceGLBUnchanged':sha(GLB)==original['sourceSHA256']},indent=2))

assert all(sha(ROOT/p)==h for p,h in protected.items()),"A shared source or room variant changed"
