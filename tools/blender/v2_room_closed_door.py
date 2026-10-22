"""Bake closed original door endpoints in memory; never save or replace sources.
The existing open-pose probe grid remains authoritative. Closed leaves participate
in all BVH occlusion and material reflection. No artificial ambient multiplier.
"""
import base64,json,re
import bpy
import numpy as np
from v2_room_bounce import ROOT,FILES,definitions,geometry,bake as sky_bake
from v2_room_second_bounce import bake as second_sky_bake
from v2_room_transport import bake as sun_bake
from v2_room_second_solar import bake as second_sun_bake
from v2_room_aperture_visibility import bake as aperture_bake
if __name__=='__main__':
 defs=definitions();base=json.loads((ROOT/'web/src/v2/room-bounce-data.js').read_text().split('export const ROOM_BOUNCE_DATA = ',1)[1].rsplit(';',1)[0]);folder=ROOT/'web/src/v2/room-closed-door-data';folder.mkdir(exist_ok=True);summary={}
 for asset in ['house_a','yurt']:
  rel,pub=FILES[asset];source=ROOT/'assets/src/v2'/rel;glb=ROOT/'web/public/assets/v2'/pub
  bpy.ops.wm.open_mainfile(filepath=str(source));poses=[]
  for obj in bpy.context.scene.objects:
   if re.fullmatch(asset+r'_door\d+(_out)?',obj.name):
    poses.append({'name':obj.name,'openEuler':list(obj.rotation_euler),'closedEuler':[0,0,0]});obj.rotation_euler=(0,0,0)
  assert len(poses)==(1 if asset=='house_a'else 2)
  bvh,colors,_=geometry();definition={**defs[asset],'openings':[o for o in defs[asset]['openings']if o['kind']!='door']}
  first=sky_bake(asset,definition,bvh,colors,source,glb)
  raw=np.frombuffer(base64.b64decode(first['data']),dtype='<f2').copy().reshape(4,-1,4);original=np.frombuffer(base64.b64decode(base[asset]['data']),dtype='<f2').reshape(4,-1,4)
  raw[:,:,3]=original[:,:,3];raw[:,:,:3]*=(original[:,:,[3]]>0)
  first['data']=base64.b64encode(raw.tobytes()).decode();first['validProbes']=base[asset]['validProbes'];first['openings']=base[asset]['openings']
  result={'sky':first,'secondSky':second_sky_bake(asset,definition,base[asset],bvh,colors,source,glb),'solar':sun_bake(asset,definition,base[asset],bvh,colors,source,glb),'secondSolar':second_sun_bake(asset,definition,base[asset],bvh,colors,source,glb),'apertures':aperture_bake(asset,base[asset],bvh),'doorPoses':poses,'model':'closed original door endpoint, unchanged source files; 2 static diffuse bounces'}
  (folder/(asset+'.js')).write_text('// Generated closed-door endpoint; original source files remain untouched.\nexport default '+json.dumps(result,separators=(',',':'))+';\n')
  summary[asset]={'doorPoses':poses,'sourceSHA256':first['sourceSHA256'],'blendSHA256':first['blendSHA256'],'firstSkyValid':first['validProbes'],'firstSkyMean':raw[0,:,:3].astype(float).mean(axis=0).tolist(),'secondSkyMean':result['secondSky']['meanSecondCoefficient'],'secondSolarSeconds':result['secondSolar']['seconds']}
 (ROOT/'tools/reports/room-closed-door-v25.json').write_text(json.dumps(summary,indent=2)+'\n')
