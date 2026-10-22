"""Exact existing payload references only; never quantizes generated coefficients."""
import json
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2];FOLDER=ROOT/'web/src/v2'
BASES={'sky':('room-bounce-data.js','ROOM_BOUNCE_DATA'),'secondSky':('room-second-bounce-data.js','ROOM_SECOND_BOUNCE_DATA'),'solar':('room-transport-data.js','ROOM_TRANSPORT_DATA'),'contact':('room-contact-data.js','ROOM_CONTACT_DATA'),'apertures':('room-aperture-data.js','ROOM_APERTURE_DATA')}
def pack(result):
 for key,(name,const)in BASES.items():
  base=json.loads((FOLDER/name).read_text().split('export const '+const+' = ',1)[1].rsplit(';',1)[0])['house_a'];field=result[key];payload='directions'if 'directions'in field else'data'
  if payload not in field:continue
  if field[payload]==base[payload]:
   field.pop(payload);field['reusePayload']='house_a'
 return result
if __name__=='__main__':
 report_path=ROOT/'tools/reports/household-room-v32.json';report=json.loads(report_path.read_text())
 for item in report['variants']:
  p=FOLDER/'household-room-data'/(item['key']+'.js');raw=json.loads(p.read_text().split('export default ',1)[1].rsplit(';',1)[0]);packed=pack(raw)
  p.write_text('// Generated room variant; exact unchanged static payloads reuse the existing room data.\nexport default '+json.dumps(packed,separators=(',',':'))+';\n')
  item['rawModuleBytes']=p.stat().st_size;item['reusedPayloads']=[k for k in BASES if packed[k].get('reusePayload')];print(item['key'],item['rawModuleBytes'],item['reusedPayloads'])
 report_path.write_text(json.dumps(report,indent=2))
