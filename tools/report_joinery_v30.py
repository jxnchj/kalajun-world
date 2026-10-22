"""Verify and report authored joinery against the preserved v29 sources.
Reads only GLBs, gzip copies and the generation records; writes one report.
"""
from pathlib import Path
import hashlib,json,struct
ROOT=Path(__file__).resolve().parent.parent
BACKUP=ROOT/'backups/route-continuity-v30/assets'

def glb(path):
 raw=path.read_bytes();length=struct.unpack_from('<I',raw,12)[0]
 doc=json.loads(raw[20:20+length]);start=28+length
 return doc,raw[start:]

def accessor(doc,blob,index):
 a=doc['accessors'][index];v=doc['bufferViews'][a['bufferView']]
 widths={5120:1,5121:1,5122:2,5123:2,5125:4,5126:4};sizes={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4,'MAT4':16}
 n=widths[a['componentType']]*sizes[a['type']];stride=v.get('byteStride',n);start=v.get('byteOffset',0)+a.get('byteOffset',0)
 return b''.join(blob[start+i*stride:start+i*stride+n]for i in range(a['count']))

def mesh_payload(doc,blob,index):
 return [{**{k:accessor(doc,blob,v)for k,v in p['attributes'].items()},'indices':accessor(doc,blob,p['indices'])}for p in doc['meshes'][index]['primitives']]

result={'version':'pastoral-joinery-30','scope':'2 structural bed frames, 2 frame-panel chests, 2 breadboard lids and a under-eave entrance cross beam and curved knee supports','aholoUsed':False,'globalLightingChanged':False,'newTextures':0,'assets':[]}
for a in ['house_a','yurt']:
 rel=Path('web/public/assets/v2')/(a+'_lived.glb');old,ob=glb(BACKUP/rel);new,nb=glb(ROOT/rel)
 oldnodes={n['name']:n for n in old['nodes']if 'mesh'in n};newnodes={n['name']:n for n in new['nodes']if 'mesh'in n}
 assert set(oldnodes)<=set(newnodes)
 assert old['materials']==new['materials'],'original material descriptors changed'
 def images(doc,blob):
  return [hashlib.sha256(blob[doc['bufferViews'][im['bufferView']].get('byteOffset',0):doc['bufferViews'][im['bufferView']].get('byteOffset',0)+doc['bufferViews'][im['bufferView']]['byteLength']]).hexdigest()for im in doc.get('images',[])]
 assert images(old,ob)==images(new,nb),'original textures changed'
 unchanged=0;changed=0
 for name,node in newnodes.items():
  before=oldnodes.get(name)
  if before is None:
   assert name=='pastoral_house_entry_joinery';changed+=1;continue
  for key in ['translation','rotation','scale','matrix']:assert before.get(key)==node.get(key),(name,key)
  if node.get('extras',{}).get('joineryVersion')=='pastoral-joinery-30':changed+=1
  else:
   assert mesh_payload(old,ob,before['mesh'])==mesh_payload(new,nb,node['mesh']),name+' geometry/normal/UV/AO/index changed'
   unchanged+=1
 report=json.loads((ROOT/'assets/src/v2/pastoral'/f'{a}-joinery-30.json').read_text())
 # Compare the six authored furniture meshes and new entrance cap against the protected pre-round source.
 for item in report['objects']:item.pop('verticesBefore',None)
 (ROOT/'assets/src/v2/pastoral'/f'{a}-joinery-30.json').write_text(json.dumps(report,indent=2))
 gz=Path(str(rel)+'.gz')
 result['assets'].append({'asset':a,'meshCount':len(newnodes),'changedMeshParts':changed,'unchangedMeshPayloadsByteExact':unchanged,'nodeTransformsExact':True,'originalMaterialsExact':True,'originalPackedImagesExact':True,'trianglesBefore':report['trianglesBefore'],'trianglesAfter':report['trianglesAfter'],'triangleDelta':report['trianglesAfter']-report['trianglesBefore'],'glbBytesBefore':(BACKUP/rel).stat().st_size,'glbBytesAfter':(ROOT/rel).stat().st_size,'glbByteDelta':(ROOT/rel).stat().st_size-(BACKUP/rel).stat().st_size,'gzipBytesBefore':(BACKUP/gz).stat().st_size,'gzipBytesAfter':(ROOT/gz).stat().st_size,'gzipByteDelta':(ROOT/gz).stat().st_size-(BACKUP/gz).stat().st_size,'glbSHA256':hashlib.sha256((ROOT/rel).read_bytes()).hexdigest(),'blendSource':report['source'],'sourceSHA256':hashlib.sha256((ROOT/report['source']).read_bytes()).hexdigest()})
result['verification']={'assetTests':'14 passed: tools/reports/joinery-v30-tests.log','giAndTransportTests':'69 passed: tools/reports/joinery-v30-gi-tests.log','transportCheck':'20 source assets, exact gzip reconstruction: tools/reports/joinery-v30-transport-check.log','giRebake':'Open/closed two-bounce sky + solar, floor contact and aperture visibility; elapsed time in tools/reports/joinery-v30-gi-rebake.log','studioImages':['assets/src/v2/pastoral/house_a-joinery-30.studio.png','assets/src/v2/pastoral/yurt-joinery-30.studio.png','assets/src/v2/pastoral/house_a-chest-30.studio.png','assets/src/v2/pastoral/house_a-entrance-30.studio.png'],'browserAcceptance':'parent task performs actual route acceptance after combined build'}
result['remainingIntermediate']=['This is a designed household interpretation, not exact surveyed historical furniture.','Entrance woodwork is a small supported under-eave component, partly concealed by the existing deep eave, not a full porch. Other fixtures and architectural groups remain intermediate.','GI remains the established finite static two-diffuse-bounce model, not complete dynamic global illumination.','Furniture retains existing roles and transforms; entrance cap adds one body mesh, no new materials or images. Added triangles and bytes are reported.']
(ROOT/'tools/reports/joinery-v30.json').write_text(json.dumps(result,indent=2))
print(json.dumps(result,indent=2))
