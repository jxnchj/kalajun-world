"""Lightweight staged GI artifact checks, no Blender and no production mutation.
Not runtime/visual acceptance. Compare against original quality and ownership.
"""
import argparse,base64,json,math,struct
from pathlib import Path
from pipeline import ROOT,KEYS,sha,require,receipt_check,read_module
FIELDS=['sky','secondSky','solar','secondSolar','apertures']
META=['bounds','size','samples','surfaceSamples','validProbes','sourceGLB','sourceSHA256','sourceBlend','blendSHA256','openings','bounceOrder','skyOnly','model','azimuths','elevations','zenithIndex','encoding','calibration','apertureSamples','crownSamples','heightRange','spacing','radius']
def check(state,old,derived):
 require(set(state)==set(old),'Missing/extra state fields')
 for key in ['key','doorPoses','degrees','householdStyle','entityId','geometryRevision','externalSources']:
  require(state.get(key)==old.get(key),f'Ownership mismatch: {key}')
 require(state['derivedGeometry']==derived,'Bundle geometry binding mismatch')
 for field in FIELDS+(['contact'] if 'contact' in old else []):
  f=state[field];o=old[field];require(f['derivedGeometry']==derived,f'{field}: geometry mismatch')
  for k in META+['externalSources','householdStyle']:require(f.get(k)==o.get(k),f'{field}: quality/source/grid changed: {k}')
  require('reusePayload' not in f,f'{field}: forbidden payload reuse')
  if 'data' in f:require(len(base64.b64decode(f['data'],validate=True))>0,f'{field}: empty data')
  if field in ['sky','secondSky']:
   raw=base64.b64decode(f['data']);require(len(raw)==math.prod(f['size'])*4*4*2,'SH length')
   require(all(math.isfinite(v[0]) for v in struct.iter_unpack('<e',raw)),'Nonfinite SH')
  if field=='sky':
   original=base64.b64decode(o['data']);require(raw[6::8]==original[6::8] and raw[7::8]==original[7::8],'Receiver validity changed')
  if 'directions' in f:
   require(len(f['directions'])==len(o['directions']),'Solar table count')
   # Exact decoder/finiteness and runtime owner tests remain mandatory before promotion.
 if 'closed' in old:check(state['closed'],old['closed'],derived)
def main():
 p=argparse.ArgumentParser();p.add_argument('--receipt',required=True,type=Path);p.add_argument('--out',required=True,type=Path);p.add_argument('--key',choices=['all',*KEYS],required=True);a=p.parse_args()
 r,paths,m=receipt_check(a.receipt,'gi');run=json.loads((a.out/'run.json').read_text())
 require(run['status']=='BAKED_NOT_VALIDATED' and run['protectedUnchanged'],'Incomplete/rejected bake')
 require(run['receiptSHA256']==sha(a.receipt),'Wrong release receipt')
 require(run.get('stage')=='gi','Wrong bake stage')
 for n,h in run['outputs'].items():
  require(Path(n).name==n and not (a.out/n).is_symlink(),'Unsafe output path')
  require(sha(a.out/n)==h,f'Output changed: {n}')
 for path,h in json.loads((a.out/'protected-inputs.json').read_text()).items():require(sha(Path(path))==h,f'Protected input changed since bake: {path}')
 derived={'kind':'house-textiles62','sourceSHA256':m['sourceSHA256'],'geometrySHA256':sha(paths['geometry']),'manifestSHA256':sha(paths['manifest']),'nodes':[n['name'] for n in m['nodes']]}
 expected=[]
 for key in KEYS if a.key=='all' else [a.key]:
  for suffix in ['', '-30','-60','-90']:
   name=key+suffix+'.js';expected.append(name);require(name in run['outputs'],'Module not bound in run output receipt');check(read_module(a.out/name),read_module(ROOT/'web/src/v2/house-textiles-gi73-data'/name),derived)
 require(sorted(x.name for x in a.out.glob('*.js'))==sorted(expected),'Mixed/missing family modules')
 print(json.dumps({'staticQualityOwnershipBinding':'PASS','modules':len(expected),'states':len(expected)//4*5,'runtimeAndVisualAcceptance':False}))
if __name__=='__main__':main()
