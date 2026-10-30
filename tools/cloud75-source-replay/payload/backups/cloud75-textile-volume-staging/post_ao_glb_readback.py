"""Independent typed GLB channel-limited AO invariance, rejects reordered exports."""
import sys,json,argparse,time,traceback
from pathlib import Path
import numpy as np
H=Path(__file__).resolve().parent;sys.path.insert(0,str(H));sys.dont_write_bytecode=True
from post_ao_inputs import bind,sha
from ao_readback_contract import check_rgba
from readback75_v4 import read,CHANGED
p=argparse.ArgumentParser();p.add_argument('--ao',type=Path,required=True);p.add_argument('--receipt',type=Path,required=True);p.add_argument('--report',type=Path,required=True);args=p.parse_args()
pre,post,binding=bind(args.ao,args.receipt);started=time.monotonic();report={'status':'INCOMPLETE','binding':binding,'scriptSHA256':sha(__file__),'parserSHA256':sha(H/'readback75_v4.py'),'inputBinderSHA256':sha(H/'post_ao_inputs.py'),'colorContractSHA256':sha(H/'ao_readback_contract.py'),'rows':[]}
def exact(a,b):return a.shape==b.shape and a.dtype==b.dtype and a.tobytes()==b.tobytes()
def metadata(j):
 result={}
 for node in j['nodes']:
  if 'mesh'not in node:continue
  m=j['meshes'][node['mesh']];assert len(m['primitives'])==1
  p=m['primitives'][0];assert p.get('mode',4)==4 and not p.get('targets')and not p.get('extensions')
  desc={}
  for name,i in dict(p['attributes'],INDICES=p['indices']).items():
   a=j['accessors'][i];assert not a.get('sparse');assert a['bufferView']>=0
   desc[name]={k:a.get(k,False if k=='normalized'else None)for k in ('componentType','normalized','type','count')}
  result[node['name']]={'attributes':desc,'primitive':{k:v for k,v in p.items()if k not in ('attributes','indices')},'mesh':{k:v for k,v in m.items()if k!='primitives'}}
 return result
try:
 a,old=read(pre['geometry']);b,new=read(post['geometry']);assert set(old)==set(new)==set(binding['textileNames']);assert len(old)==9
 assert a['nodes']==b['nodes'],'Node hierarchy/transforms/ownership changed'
 for key in set(a)|set(b):
  if key not in ('buffers','bufferViews','accessors','meshes'):assert a.get(key)==b.get(key),('GLB metadata changed',key)
 am,bm=metadata(a),metadata(b);assert am==bm,'Accessor types/counts/normalization/material ownership changed'
 for name,v in old.items():
  w=new[name];assert v['node']==w['node']and exact(v['worldMatrix'],w['worldMatrix']);assert exact(v['index'],w['index']),(name,'indices')
  assert set(v['attributes'])==set(w['attributes']);row={'name':name,'nonAOAttributeBytesExact':True}
  for attr,x in v['attributes'].items():
   y=w['attributes'][attr];assert x.shape==y.shape and x.dtype==y.dtype
   if name not in CHANGED or attr!='COLOR_0':assert exact(x,y),(name,attr,'changed bytes')
   else:
    d=am[name]['attributes'][attr];assert d['type']=='VEC4'and d['componentType']==5123 and d['normalized']is True,('Unexpected AO encoding',d)
    row.update(check_rgba(x.tolist(),y.tolist(),scale=65535));row['encoding']=d
  assert np.isfinite(w['attributes']['POSITION']).all();report['rows'].append(row)
 report.update(status='PASS_POST_AO_GLB_TYPED_CHANNEL_LIMITED_INVARIANCE',changedAOObjects=5,unchangedTextileRGBAObjects=4,geometryRemeasured=False,scope='Actual typed accessor raw bytes compared. Only five COLOR_0 R/G may change; B exact, A65535. All positions/normals/UV/indices/material bindings unchanged. No GI/native/art acceptance.')
except Exception:
 report['status']='FAILED';report['error']=traceback.format_exc();raise
finally:
 report['wallSeconds']=time.monotonic()-started;report['boundInputsUnchanged']=all(sha(v['path'])==v['sha256']for field in ('preAO','postAO')for v in binding[field].values());args.report.parent.mkdir(parents=True,exist_ok=True);args.report.write_text(json.dumps(report,indent=2)+'\n');assert report['boundInputsUnchanged']
print(json.dumps({k:v for k,v in report.items()if k!='binding'}))
