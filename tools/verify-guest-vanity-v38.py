"""Verify complete candidate retains every untouched exported node and mesh payload."""
from pathlib import Path
import json,struct,hashlib
R=Path(__file__).resolve().parents[1];D=R/'assets/src/v2/settlements/guest-vanity-v38';meta=json.loads((D/'metadata.json').read_text())
def read(p):
 b=p.read_bytes();n=struct.unpack_from('<I',b,12)[0];return json.loads(b[20:20+n]),b[28+n:]
a,ab=read(R/'web/public/assets/v2/gh_lanchuan_rooms.glb');b,bb=read(R/meta['candidate'])
def accessor(d,raw,i):
 x=d['accessors'][i];v=d['bufferViews'][x['bufferView']];size={5121:1,5123:2,5125:4,5126:4}[x['componentType']]*{'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4}[x['type']];start=v.get('byteOffset',0)+x.get('byteOffset',0);stride=v.get('byteStride',size)
 return (x['componentType'],x['type'],x['count'],x.get('normalized',False),b''.join(raw[start+k*stride:start+k*stride+size]for k in range(x['count'])))
def payload(d,raw,n):
 if 'mesh'not in n:return None
 return [{ 'attributes':{k:accessor(d,raw,i)for k,i in p['attributes'].items()},'indices':accessor(d,raw,p['indices']),'material':d['materials'][p['material']]['name']}for p in d['meshes'][n['mesh']]['primitives']]
new={n['name']:n for n in b['nodes']};removed={x['name']for x in meta['removed']};count=0
for n in a['nodes']:
 if n['name']in removed or n['name']in {r['name']for r in meta.get('reposedShowerScreens',[])}:continue
 nn=new[n['name']];assert payload(a,ab,n)==payload(b,bb,nn),n['name']
 for k in ('translation','rotation','scale','matrix'):assert n.get(k)==nn.get(k),(n['name'],k)
 assert [a['nodes'][i]['name']for i in n.get('children',[])]==[b['nodes'][i]['name']for i in nn.get('children',[])],n['name']
 count+=1
assert len(a['images'])==len(b['images'])
def imagehashes(d,raw):
 return sorted(hashlib.sha256(raw[d['bufferViews'][im['bufferView']].get('byteOffset',0):d['bufferViews'][im['bufferView']].get('byteOffset',0)+d['bufferViews'][im['bufferView']]['byteLength']]).hexdigest()for im in d['images'])
assert imagehashes(a,ab)==imagehashes(b,bb)
print(json.dumps({'untouchedExportedNodesExact':count,'originalImagesExact':len(a['images']),'originalSourceSHAUnchanged':hashlib.sha256((R/meta['source']).read_bytes()).hexdigest()==meta['sourceSHA256'],'originalGLBSHAUnchanged':hashlib.sha256((R/'web/public/assets/v2/gh_lanchuan_rooms.glb').read_bytes()).hexdigest()==meta['originalGLBSHA256']},indent=2))
