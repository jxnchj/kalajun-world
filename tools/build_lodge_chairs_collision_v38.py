"""Extract actual unchanged parent-source chair triangles, not bounding-box approximations."""
from pathlib import Path
import json,struct,hashlib
r=Path(__file__).resolve().parents[1];v=r/'web/src/v2'
s=json.loads((v/'generated/lodge-chairs-source-38.json').read_text())
b=(r/'web/public/assets/v2/gh_lanchuan_lodge_furniture38.glb').read_bytes();assert hashlib.sha256(b).hexdigest()==s['originalSHA256'];l=struct.unpack_from('<I',b,12)[0];d=json.loads(b[20:20+l]);raw=b[28+l:]
def acc(i):
 a=d['accessors'][i];bv=d['bufferViews'][a['bufferView']];w={'SCALAR':1,'VEC3':3}[a['type']];f={5126:'f',5125:'I',5123:'H'}[a['componentType']];n=struct.calcsize(f)*w;off=bv.get('byteOffset',0)+a.get('byteOffset',0)
 return [struct.unpack_from('<'+f*w,raw,off+j*bv.get('byteStride',n)) for j in range(a['count'])]
mi=next(i for i,m in enumerate(d['meshes'])if m['name']=='gh_lanchuan_lodge_rattan');ni=next(i for i,n in enumerate(d['nodes'])if n.get('mesh')==mi)
parent={c:i for i,n in enumerate(d['nodes']) for c in n.get('children',[])}
i=ni
while True:
 assert not any(k in d['nodes'][i] for k in ['matrix','translation','rotation','scale']),d['nodes'][i]
 if i not in parent:break
 i=parent[i]
p=d['meshes'][mi]['primitives'][0];pos=[x for row in acc(p['attributes']['POSITION']) for x in row];idx=[x[0]for x in acc(p['indices'])];assert len(idx)==1728*3
(v/'generated/lodge-chairs-collision-38.json').write_text(json.dumps({'sourceSHA256':s['originalSHA256'],'parts':[{'name':'gh_lanchuan_lodge_rattan','positions':pos,'indices':idx}]},separators=(',',':'))+'\n')
