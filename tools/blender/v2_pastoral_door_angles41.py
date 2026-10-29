"""Source-bound real intermediate door poses; read-only Blender/GLB sources."""
import bpy,json,re,hashlib,time,math,sys,itertools
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parent))
from v2_room_bounce import ROOT,FILES,definitions,geometry,bake as sky_bake
from v2_room_second_bounce import bake as second_sky_bake
from v2_room_transport import bake as sun_bake
from v2_room_second_solar import bake as second_sun_bake
from v2_room_aperture_visibility import bake as aperture_bake
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
load=lambda p:json.loads(p.read_text().split('export default ',1)[1].rsplit(';',1)[0])
original=json.loads((ROOT/'web/src/v2/room-bounce-data.js').read_text().split('export const ROOM_BOUNCE_DATA = ',1)[1].rsplit(';',1)[0])
configs=[('house_a',None)]+[(f'house_a-living-{i}',i)for i in range(3)]+[('yurt',None)]
out=ROOT/'web/src/v2/room-pastoral-door-data41';out.mkdir(exist_ok=True);summary=[];protected={};start=time.monotonic();defs=definitions()
for key,style in configs:
 asset='yurt'if key=='yurt'else'house_a';rel,pub=FILES[asset];source=ROOT/'assets/src/v2'/rel;glb=ROOT/'web/public/assets/v2'/pub
 base=load(ROOT/'web/src/v2/household-room-data'/f'{key}.js')if style is not None else {'sky':original[asset]}
 assert sha(source)==base['sky']['blendSHA256']and sha(glb)==base['sky']['sourceSHA256'];protected[str(source)]=sha(source);protected[str(glb)]=sha(glb)
 poses=[(d,)for d in [30,60,90]]if asset=='house_a'else[p for p in itertools.product([0,51,102],repeat=2)if p not in [(0,0),(102,102)]]
 for angles in poses:
  bpy.ops.wm.open_mainfile(filepath=str(source))
  for ext in base.get('externalSources',[]):
   extpath=ROOT/ext['sourceBlend'];assert sha(extpath)==ext['blendSHA256'];assert sha(ROOT/'web/public'/ext['sourceGLB'])==ext['sourceSHA256'];protected[str(extpath)]=sha(extpath);protected[str(ROOT/'web/public'/ext['sourceGLB'])]=ext['sourceSHA256']
   with bpy.data.libraries.load(str(extpath),link=False)as(src,dst):dst.objects=[n for n in src.objects if n.startswith(f'household_{style}_')]
   for obj in dst.objects:bpy.context.scene.collection.objects.link(obj);obj.location.x-=style*10
  leaves=sorted([o for o in bpy.context.scene.objects if re.fullmatch(asset+r'_door\d+(_out)?',o.name)],key=lambda o:o.name);assert len(leaves)==len(angles)
  metadata=[]
  for leaf,degree in zip(leaves,angles):
   initial=list(leaf.rotation_euler);leaf.rotation_euler[2]=math.copysign(math.radians(degree),initial[2]);metadata.append({'name':leaf.name,'openEuler':initial,'bakedEuler':list(leaf.rotation_euler)})
  bpy.context.view_layer.update();bvh,colors,_=geometry();definition=defs[asset];first=sky_bake(key,definition,bvh,colors,source,glb,validity=original[asset])
  result={'sky':first,'secondSky':second_sky_bake(key,definition,first,bvh,colors,source,glb),'solar':sun_bake(key,definition,first,bvh,colors,source,glb),'secondSolar':second_sun_bake(key,definition,first,bvh,colors,source,glb),'apertures':aperture_bake(key,first,bvh)}
  for field in result.values():
   if style is not None:field['externalSources']=base['externalSources'];field['householdStyle']=style
  result.update({'key':key,'degrees':list(angles),'doorPoses':metadata,'model':'source-bound real individual door poses; two static diffuse orders, adjacent pose interpolation'})
  path=out/(key+'-'+ '-'.join(map(str,angles))+'.js');path.write_text('export default '+json.dumps(result,separators=(',',':'))+';\n');row={'key':key,'degrees':angles,'bytes':path.stat().st_size,'seconds':time.monotonic()-start};summary.append(row);print(json.dumps(row),flush=True)
assert all(sha(Path(p))==h for p,h in protected.items())
(ROOT/'tools/reports/pastoral-door-angles41-bake.json').write_text(json.dumps({'protectedSources':protected,'sourcesUnchanged':True,'bakes':summary,'seconds':time.monotonic()-start},indent=2))
