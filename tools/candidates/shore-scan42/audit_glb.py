from pathlib import Path
import json,struct,numpy as np,os
variant=os.environ.get("ROCK_VARIANT","01")
R=Path.cwd();b=(R/('web/public/assets/v2/shore-candidate42/rock'+variant+'.glb')).read_bytes();size=struct.unpack_from('<I',b,12)[0];j=json.loads(b[20:20+size]);blob=b[28+size:]
def arr(i):
 a=j['accessors'][i];v=j['bufferViews'][a['bufferView']];dim={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4}[a['type']];dtype={5126:'<f4',5123:'<u2',5125:'<u4'}[a['componentType']];return np.frombuffer(blob,dtype,count=a['count']*dim,offset=v.get('byteOffset',0)+a.get('byteOffset',0)).reshape(-1,dim)
p=j['meshes'][0]['primitives'][0];source=json.loads((R/('assets/src/v2/shore-candidate42/rock'+variant+'-shell.json')).read_text());a=arr(p['attributes']['POSITION']);q=np.array(source['position']).reshape(-1,3)
# Compare tuple correspondence independent of glTF exporter vertex ordering.
lookup={tuple(np.round(v,5)):i for i,v in enumerate(q)};ids=[lookup.get(tuple(round(float(v),5) for v in row)) for row in a];missing=sum(x is None for x in ids)
results={'nodes':j['nodes'],'scene':j['scenes'],'glbVertices':len(a),'jsonVertices':len(q),'unmatchedPosition5Decimals':missing,'glbBounds':[a.min(0).tolist(),a.max(0).tolist()],'jsonBounds':[q.min(0).tolist(),q.max(0).tolist()],'materials':j['materials']}
# Match full position/normal/UV attributes rather than only the positional shell.
gn=arr(p['attributes']['NORMAL']);gu=arr(p['attributes']['TEXCOORD_0']);qn=np.array(source['normal']).reshape(-1,3);qu=np.array(source['uv']).reshape(-1,2)
def key(pos,n,uv):return tuple(round(float(x),5) for x in np.r_[pos,n,uv])
keys={key(pos,n,uv) for pos,n,uv in zip(q,qn,qu)};results['unmatchedFullVertex5Decimals']=sum(key(pos,n,uv) not in keys for pos,n,uv in zip(a,gn,gu));print(json.dumps(results,indent=2));(R/('tools/candidates/shore-scan42/glb-coordinate-audit-rock'+variant+'.json')).write_text(json.dumps(results,indent=2))
maxp=0;maxn=0;maxuv=0;examples=[]
for start in range(0,len(a),128):
 d=((a[start:start+128,None,:]-q[None,:,:])**2).sum(2)
 for k,row in enumerate(d):
  i=start+k;near=np.where(row<1e-12)[0];maxp=max(maxp,float(np.sqrt(row.min())))
  if len(near):
   best=near[np.argmin(((qu[near]-gu[i])**2).sum(1))];ne=float(np.linalg.norm(qn[best]-gn[i]));ue=float(np.linalg.norm(qu[best]-gu[i]));maxn=max(maxn,ne);maxuv=max(maxuv,ue)
   if len(examples)<3:examples.append({'p':a[i].tolist(),'gn':gn[i].tolist(),'qn':qn[best].tolist(),'gu':gu[i].tolist(),'qu':qu[best].tolist()})
results.update(maxPositionError=maxp,maxNormalVectorError=maxn,maxUVError=maxuv,examples=examples);print(json.dumps({k:results[k] for k in ['maxPositionError','maxNormalVectorError','maxUVError','examples']},indent=2));(R/('tools/candidates/shore-scan42/glb-coordinate-audit-rock'+variant+'.json')).write_text(json.dumps(results,indent=2))
