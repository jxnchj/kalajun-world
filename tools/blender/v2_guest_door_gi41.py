"""Read-only original living39 source; independent door poses, unchanged probe grid."""
import bpy,json,hashlib,math,time
import sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parent))
import v2_guest_living_gi39 as g
from v2_room_bounce import ROOT
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
load=lambda p:json.loads(p.read_text().split('export default ',1)[1].rsplit(';',1)[0])
start=time.monotonic();report=[];protected={str(g.SOURCE):sha(g.SOURCE),str(g.GLB):sha(g.GLB)}
assert protected[str(g.SOURCE)]=='a1d99484eb8c35864e4517f912d51baa1f90197de3becf78a69aea3a3577920b'
assert protected[str(g.GLB)]=='9c1c5e5e2dc464fe61adfa6b3f5ee55f90a180bf9bebc097586b9b9f579e35c1'
out=ROOT/'web/src/v2/guest-door-data41';out.mkdir(exist_ok=True)
for room in [1,2,3]:
 old='lanchuan-freedom-'+str(room);key=old+'-living39';base=load(ROOT/'web/src/v2/guest-living-gi-data'/f'{room}.js');a=base['definition'];lamps=g.fixture.fixtures()[old]
 for degree in [0,51]:
  bpy.ops.wm.open_mainfile(filepath=str(g.SOURCE));leaf=bpy.data.objects['gh_lanchuan_door'+str(room)];initial=list(leaf.rotation_euler);assert abs(initial[2]+math.radians(102))<1e-6;leaf.rotation_euler[2]=-math.radians(degree);bpy.context.view_layer.update()
  bvh,colors,_=g.sky.geometry();first=g.sky.bake(key,a,bvh,colors,g.SOURCE,g.GLB,validity=base['sky'])
  result={'key':key,'degrees':degree,'doorName':leaf.name,'openEuler':initial,'bakedEuler':list(leaf.rotation_euler),'sky':first}
  for name,fn in [('secondSky',lambda:g.sky2.bake(key,a,first,bvh,colors,g.SOURCE,g.GLB)),('solar',lambda:g.sun.bake(key,a,first,bvh,colors,g.SOURCE,g.GLB)),('secondSolar',lambda:g.sun2.bake(key,a,first,bvh,colors,g.SOURCE,g.GLB)),('fixtures',lambda:g.fixture.bake(key,first,lamps,bvh,colors,g.SOURCE,g.GLB)),('secondFixtures',lambda:g.fixture2.bake(key,first,lamps,bvh,colors,g.SOURCE,g.GLB)),('apertures',lambda:g.aperture.bake(key,first,bvh))]:result[name]=fn()
  path=out/f'{room}-{degree}.js';path.write_text('export default '+json.dumps(result,separators=(',',':'))+';\n');row={'room':room,'degrees':degree,'bytes':path.stat().st_size,'seconds':time.monotonic()-start};report.append(row);print(json.dumps(row),flush=True)
assert all(sha(__import__('pathlib').Path(p))==h for p,h in protected.items())
(ROOT/'tools/reports/guest-door-gi41.json').write_text(json.dumps({'protectedSources':protected,'sourcesUnchanged':True,'bakes':report,'seconds':time.monotonic()-start},indent=2))
