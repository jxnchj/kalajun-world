"""Checkpointed original71 metrics; interfaces and cover are separate bounded jobs.
Every child envelope covers its FULL original support projection, never a receiver ROI.
"""
import sys,json,hashlib,time,argparse
from pathlib import Path
sys.dont_write_bytecode=True
H=Path(__file__).resolve().parent;S=H.parent;R=S.parents[1]
sys.path.insert(0,str(H))
from upper_envelope import prepare_envelope,gap_metrics,merge_envelopes
import bpy
SOURCE=R/'assets/src/v2/pastoral/textiles62/house-a-textiles62.blend'
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest();sourcehash=sha(SOURCE);helperhash=sha(H/'upper_envelope.py');gluehash=sha(Path(__file__));geometryhash=sha(R/'web/public/assets/v2/house-textiles62/geometry.glb')
p=argparse.ArgumentParser();p.add_argument('--phase',choices=['interfaces','cover'],required=True);args=p.parse_args(sys.argv[sys.argv.index('--')+1:])
started=time.monotonic();bpy.ops.wm.open_mainfile(filepath=str(SOURCE));bpy.context.view_layer.update()
modifier_rows={o.name:[{'name':m.name,'type':m.type,'show_viewport':m.show_viewport,'show_render':m.show_render}for m in o.modifiers]for o in bpy.context.scene.objects}
(H/'source-modifier-metadata.json').write_text(json.dumps({'sourceSHA256':sourcehash,'objects':modifier_rows,'objectsWithModifiers':sum(bool(v)for v in modifier_rows.values()),'scope':'read-only raw-source modifier metadata; modifiers not evaluated or changed'},indent=2)+'\n')
folds=['pastoral_house_chest_folded'+str(i)for i in range(4)];cover='pastoral_house_chest_topcover';chest=['pastoral_house_chest_body','pastoral_house_chest_lid','pastoral_house_chest_strap','pastoral_house_chest_strap.001']
meshes={}
for name in folds+[cover]+chest:
 o=bpy.data.objects[name];o.data.calc_loop_triangles();meshes[name]={'points':[list(o.matrix_world@v.co)for v in o.data.vertices],'triangles':[list(t.vertices)for t in o.data.loop_triangles]}
def triangles(name,lo=None,hi=None):
 m=meshes[name];return [[m['points'][i]for i in t]for t in m['triangles']if lo is None or all(lo<=i<hi for i in t)]
def digest_json(value):return hashlib.sha256(json.dumps(value,separators=(',',':'),sort_keys=True).encode()).hexdigest()
report={'source':str(SOURCE),'sourceSHA256':sourcehash,'helperSHA256':helperhash,'geometrySHA256':geometryhash,'glueSHA256':gluehash,'rows':{},'status':'started','phase':args.phase,'phaseEvents':[],'method':'upper envelope and planar gap extrema within declared area tolerances; all child support domains complete, never cropped to receiving triangles'}
inputs={};envelopes={}
CACHE=H/'checkpoints';CACHE.mkdir(exist_ok=True)
def phase_event(key,event):
 row={'metric':key,'elapsedJobSeconds':time.monotonic()-started,**event};report['phaseEvents'].append(row);print(json.dumps(row),flush=True)
def metadata(key,support,nodes):
 points=[p for t in support for p in t]
 ids=[[name,i]for name in nodes for i,tri in enumerate(meshes[name]['triangles'])if not key.startswith('internal-')or all(0<=v<551 for v in tri)]
 assert len(ids)==len(support),(key,'full source triangle identity mismatch')
 return {'key':key,'sourceSHA256':sourcehash,'helperSHA256':helperhash,'glueSHA256':gluehash,'geometrySHA256':geometryhash,'numericContract':{'cellSize':.06,'maxPairTests':2000000,'maxCells':100000,'maxFragments':2048,'areaEpsilon':1e-14,'planeTie':'exact plane coefficients only; globally ordered source IDs'},'originalSourceTriangleIds':ids,'supportTriangleDataSHA256':digest_json(support),'supportTriangleCount':len(support),'sourceIdRange':[0,len(support)],'sourceNodes':nodes,'validDomain':'FULL union of all original input support triangle projections; NOT clipped to receiver ROI','fullInputXYZBounds':[[min(p[k]for p in points)for k in range(3)],[max(p[k]for p in points)for k in range(3)]]}
def checkpoint(key,under,support,nodes,envelope,value=None):
 meta=metadata(key,support,nodes);payload={'metadata':meta,'underside':under,'support':support,'envelope':envelope,'metrics':value}
 payload['payloadSHA256']=digest_json(payload)
 temp=CACHE/(key+'.json.tmp');temp.write_text(json.dumps(payload,separators=(',',':')));temp.replace(CACHE/(key+'.json'))
 return payload
def restored(key,under,support,nodes):
 path=CACHE/(key+'.json')
 if not path.exists():return None
 payload=json.loads(path.read_text());unsigned=dict(payload);checksum=unsigned.pop('payloadSHA256');assert digest_json(unsigned)==checksum,('checkpoint payload checksum mismatch',key)
 assert digest_json(payload['support'])==payload['metadata']['supportTriangleDataSHA256'],('checkpoint support data checksum mismatch',key)
 assert payload['metadata']==metadata(key,support,nodes),('checkpoint provenance/domain mismatch',key)
 assert digest_json(payload['underside'])==digest_json(under),('receiver changed',key)
 assert payload['envelope']['stats']['supportUnionCheck']['passed'];return payload
def measure(key,under,support,nodes):
 cache=restored(key,under,support,nodes)
 if cache:
  value=cache['metrics'];env=cache['envelope'];phase_event(key,{'phase':'restored-full-domain-checkpoint'})
 else:
  phase_event(key,{'phase':'prepare','undersideTriangles':len(under),'supportTriangles':len(support)})
  env=prepare_envelope(support,phase_callback=lambda event:phase_event(key,event));value=None
  checkpoint(key,under,support,nodes,env,None)
 if value is None:
  t=time.monotonic();value=gap_metrics(under,env)
  phase_event(key,{'phase':'gap-metrics-finished','seconds':time.monotonic()-t});checkpoint(key,under,support,nodes,env,value)
 inputs[key]={'underside':under,'support':support};envelopes[key]=env;report['rows'][key]=value
 print(json.dumps({'metric':key,'value':value}),flush=True)
 return env
try:
 for k,name in enumerate(folds):
  nodes=[name];key='internal-'+str(k);under=triangles(name,2021,2572);support=triangles(name,0,551)
  if args.phase=='cover':assert (CACHE/(key+'.json')).exists(),('interfaces checkpoint missing',key)
  measure(key,under,support,nodes)
  nodes=chest if k==0 else [folds[k-1]];support=[t for nn in nodes for t in triangles(nn)];key='support-'+str(k);under=triangles(name,551,1102)
  if args.phase=='cover':assert (CACHE/(key+'.json')).exists(),('interfaces checkpoint missing',key)
  measure(key,under,support,nodes)
 if args.phase=='cover':
  key='fold3-full-envelope';support=triangles(folds[3]);cache=restored(key,[],support,[folds[3]])
  if cache:env3=cache['envelope'];phase_event(key,{'phase':'restored-full-domain-checkpoint'})
  else:
   env3=prepare_envelope(support,phase_callback=lambda event:phase_event(key,event));checkpoint(key,[],support,[folds[3]],env3)
  sources=[(envelopes['support-0'],0)];offset=len(inputs['support-0']['support'])
  for k in range(4):
   env=envelopes['support-'+str(k+1)]if k<3 else env3;sources.append((env,offset));offset+=len(triangles(folds[k]))
  key='cover-support';support=[t for nn in chest+folds for t in triangles(nn)];under=triangles(cover,651,1302)
  assert offset==len(support)
  cache=restored(key,under,support,chest+folds)
  if cache:env=cache['envelope'];value=cache['metrics'];phase_event(key,{'phase':'restored-full-domain-checkpoint'})
  else:
   phase_event(key,{'phase':'hierarchical-merge','rawSupportTriangles':len(support),'childCellCounts':[len(e['cells'])for e,_ in sources]})
   env=merge_envelopes([e for e,_ in sources],source_id_offsets=[offset for _,offset in sources],phase_callback=lambda event:phase_event(key,event));value=None
   checkpoint(key,under,support,chest+folds,env,None)
  if value is None:
   t=time.monotonic();value=gap_metrics(under,env)
   phase_event(key,{'phase':'gap-metrics-finished','seconds':time.monotonic()-t});checkpoint(key,under,support,chest+folds,env,value)
  inputs[key]={'underside':under,'support':support};envelopes[key]=env;report['rows'][key]=value;print(json.dumps({'metric':key,'value':value}),flush=True)
  report['status']='baseline metrics measured'
 else:report['status']='baseline interfaces measured; cover pending'
 (H/'baseline-inputs.json').write_text(json.dumps(inputs,separators=(',',':')));(H/'baseline-envelopes.json').write_text(json.dumps(envelopes,separators=(',',':')))
 report['aggregateFilesSHA256']={name:sha(H/name)for name in ['baseline-inputs.json','baseline-envelopes.json']}
 report['checkpointPayloadSHA256']={key:json.loads((CACHE/(key+'.json')).read_text())['payloadSHA256']for key in report['rows']}
except Exception as e:
 import traceback
 report.update(status='INCOMPLETE',error=repr(e),traceback=traceback.format_exc());raise
finally:
 report['wallSeconds']=time.monotonic()-started;report['sourceUnchanged']=sha(SOURCE)==sourcehash;(H/('baseline-'+args.phase+'.json')).write_text(json.dumps(report,indent=2)+'\n');(H/'baseline.json').write_text(json.dumps(report,indent=2)+'\n');assert report['sourceUnchanged']
