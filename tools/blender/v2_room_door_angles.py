"""Derived tea-house door-angle transport; source Blend/GLB and endpoints read-only."""
import bpy,json,re,hashlib,time,math,sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parent))
from v2_room_bounce import ROOT,definitions,geometry,bake as sky_bake
from v2_room_second_bounce import bake as second_sky_bake
from v2_room_transport import bake as sun_bake
from v2_room_second_solar import bake as second_sun_bake
from v2_room_aperture_visibility import bake as aperture_bake
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
load=lambda p:json.loads(p.read_text().split('export default ',1)[1].rsplit(';',1)[0])
key='house_a-entry-tea-34';source=ROOT/'assets/src/v2/pastoral/house_a-lived.blend';glb=ROOT/'web/public/assets/v2/house_a_lived.glb'
base=load(ROOT/'web/src/v2/household-room-data'/f'{key}.js');original=json.loads((ROOT/'web/src/v2/room-bounce-data.js').read_text().split('export const ROOM_BOUNCE_DATA = ',1)[1].rsplit(';',1)[0])['house_a']
assert sha(source)==base['sky']['blendSHA256'] and sha(glb)==base['sky']['sourceSHA256']
protected={str(source):sha(source),str(glb):sha(glb)}
for ext in base['externalSources']:
 for path,wanted in [(ROOT/ext['sourceBlend'],ext['blendSHA256']),(ROOT/'web/public'/ext['sourceGLB'],ext['sourceSHA256'])]:assert sha(path)==wanted;protected[str(path)]=wanted
out=ROOT/'web/src/v2/room-door-angle-data';out.mkdir(exist_ok=True);report=[];start=time.monotonic()
for degrees in [30,60,90]:
 bpy.ops.wm.open_mainfile(filepath=str(source))
 for ext in base['externalSources']:
  prefix='household_0_' if 'household-living' in ext['sourceBlend'] else 'entry_'
  with bpy.data.libraries.load(str(ROOT/ext['sourceBlend']),link=False)as(src,dst):dst.objects=[n for n in src.objects if n.startswith(prefix)]
  for obj in dst.objects:bpy.context.scene.collection.objects.link(obj)
 leaves=[o for o in bpy.context.scene.objects if re.fullmatch(r'house_a_door\d+(_out)?',o.name)];assert len(leaves)==1
 leaf=leaves[0];initial=list(leaf.rotation_euler);leaf.rotation_euler[2]=math.copysign(math.radians(degrees),initial[2]);bpy.context.view_layer.update()
 bvh,colors,_=geometry();definition=definitions()['house_a'];first=sky_bake(key,definition,bvh,colors,source,glb,validity=original)
 result={'sky':first,'secondSky':second_sky_bake(key,definition,first,bvh,colors,source,glb),'solar':sun_bake(key,definition,first,bvh,colors,source,glb),'secondSolar':second_sun_bake(key,definition,first,bvh,colors,source,glb),'apertures':aperture_bake(key,first,bvh)}
 for field in result.values():field['externalSources']=base['externalSources'];field['householdStyle']=0
 result.update({'key':key,'entityId':base['entityId'],'degrees':degrees,'externalSources':base['externalSources'],'doorPoses':[{'name':leaf.name,'openEuler':initial,'bakedEuler':list(leaf.rotation_euler)}],'model':'fixed real leaf angle, original two diffuse bounce integrators; adjacent angle interpolation remains an approximation'})
 path=out/f'tea-{degrees}.js';path.write_text('export default '+json.dumps(result,separators=(',',':'))+';\n');report.append({'degrees':degrees,'bytes':path.stat().st_size,'seconds':time.monotonic()-start});print(json.dumps(report[-1]),flush=True)
assert all(sha(Path(p))==h for p,h in protected.items())
(ROOT/'tools/reports/room-door-angles-v38.json').write_text(json.dumps({'key':key,'protectedSources':protected,'sourcesUnchanged':True,'bakes':report,'seconds':time.monotonic()-start},indent=2))
