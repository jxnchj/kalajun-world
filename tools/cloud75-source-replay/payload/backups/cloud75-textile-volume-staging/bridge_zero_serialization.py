"""Explicit workflow-approved ZERO measurement reuse, never a measurement rerun.
Only two exact comparison-only source edits are permitted. Old evidence immutable.
No corrected-state or joint solution is created. General load guards stay strict.
"""
import argparse,copy,hashlib,json,re
from pathlib import Path
from phase_checkpoint import digest,load
H=Path(__file__).resolve().parent;R=H.parents[1]
PREFIX='backups/cloud75-textile-volume-staging/'
EDITS={
 'stage_volume75_v4.py':("assert load_checkpoint(OUT/'joint-solution.json',common_identity)==report['jointSettlement'],'Joint solution changed'","assert json_digest(load_checkpoint(OUT/'joint-solution.json',common_identity))==json_digest(report['jointSettlement']),'Joint solution changed'"),
 'phase_checkpoint.py':("assert load(path,identity)==payload,('Existing checkpoint differs',str(path));return","assert digest(load(path,identity))==digest(payload),('Existing checkpoint differs',str(path));return")}
OLD_HASHES={'stage_volume75_v4.py':'f75feb6ab4233cf0d6cd9d0dadacf9904bc9a30ace10988a45240c7b2d4a4e6e','phase_checkpoint.py':'269056ca14617ce18e83aa846da01cee881b659e1aa9fe8e70e799128393560f'}
METRICS=[f'{kind}-{k}'for k in range(4)for kind in ('internal','support')]+['cover-support']
EXPECTED={key+'-metric.json':(key,True)for key in METRICS}|{key+'-envelope.json':(key,False)for key in METRICS+['top-fold-full']}
def sha(p):return hashlib.sha256(Path(p).read_bytes()).hexdigest()
def read_checked(path):
 value=json.loads(Path(path).read_text());stored=value.pop('sha256');assert digest(value)==stored,('Checksum mismatch',str(path))
 assert set(value)=={'identity','payload'},('Unexpected origin record schema',str(path))
 assert digest(load(path,value['identity']))==digest(value['payload']);return value

def prove_source_edits():
 result={}
 for name,(before,after)in EDITS.items():
  old=H/'serialization-before-v11'/name;new=H/name
  assert sha(old)==OLD_HASHES[name],('Old source changed',name)
  source=old.read_text();assert source.count(before)==1 and new.read_text()==source.replace(before,after),('Source diff exceeds approved comparison',name)
  result[PREFIX+name]={'old':sha(old),'new':sha(new)}
 return result

def prove_identity_change(old,new,changes):
 expected=copy.deepcopy(old)
 for key,value in changes.items():
  assert old['dependencies'][key]==value['old'] and new['dependencies'][key]==value['new']
  expected['dependencies'][key]=value['new']
 assert expected==new,'Identity changed beyond two source dependencies'

def rewrite_cache(value,old_base,new_base,key,is_metric):
 identity=value['identity'];expected_keys=set(old_base)|{'metric','supportSHA256'}|({'undersideSHA256'}if is_metric else set())
 assert set(identity)==expected_keys,'Unexpected cache identity fields'
 assert {k:identity[k]for k in old_base}==old_base,'Original cache not bound to original zero state'
 assert identity['metric']==key and identity['state']=='zero','Wrong metric/state'
 for k in ('supportSHA256',)+(('undersideSHA256',)if is_metric else ()):
  assert isinstance(identity[k],str)and re.fullmatch('[0-9a-f]{64}',identity[k]),'Invalid shape array hash'
 new_identity={**new_base,**{k:identity[k]for k in identity if k not in old_base}}
 return {'identity':new_identity,'payload':value['payload']}

def execution_attribution(candidate,phase,stagehash):
 matches=[]
 for p in (H/'v4-jobs').glob('*/execution.json'):
  v=json.loads(p.read_text())
  if v.get('phase')==phase and str(candidate)in v.get('command',[])and v.get('returncode')==0 and not v.get('timedOut'):
   assert v['scriptSHA256']==stagehash and v['protectedUnchanged'];matches.append(p)
 assert len(matches)==1,('Expected one attributable successful original execution',phase,len(matches))
 return {'record':str(matches[0].relative_to(H)),'sha256':sha(matches[0])}

def prepare(old,new):
 old=old.resolve();new=new.resolve();assert old.parent==new.parent==H and old!=new
 assert not old.is_symlink()and not new.is_symlink()
 assert not (new/'checkpoints').exists()and not (new/'joint-solution.json').exists()and not (new/'corrected-state.json').exists()and not (new/'corrected-settlement-unvalidated.blend').exists(),'New namespace already has measurements/correction'
 changes=prove_source_edits();a=read_checked(old/'zero-state.json');b=read_checked(new/'zero-state.json');prove_identity_change(a['identity'],b['identity'],changes)
 for namespace,state in ((old,a),(new,b)):
  assert state['identity']['state']=='zero'
  assert sha(namespace/'zero-settlement-unvalidated.blend')==state['payload']['blendSHA256']
  for key,h in state['identity']['protectedInputs'].items():assert sha(R/key)==h,('Protected input changed',key)
  for key,h in state['identity']['dependencies'].items():
   if namespace==old and key in changes:assert h==changes[key]['old']
   else:assert sha(R/key)==h,('Dependency changed',key)
  assert sha(H/'runtime-provenance.json')==state['identity']['runtimeProvenanceSHA256']
  assert sha(H/'v3_metrics/baseline.json')==state['identity']['baselineSHA256']
  assert sha(json.loads((H/'runtime-provenance.json').read_text())['binaryPath'])==state['identity']['runtimeBinarySHA256']
 audits=[json.loads((p/'generate-zero-audit.json').read_text())for p in (old,new)]
 for audit in audits:assert audit['status']=='PARTIAL zero geometry persisted; metrics pending'and audit['protectedInputsUnchanged']
 for key in ('rawVertexReadback','materialFingerprintBefore','rows','sharedField','sceneObjectTypes','frozenMeshFingerprints'):assert audits[0][key]==audits[1][key],('Fresh zero scene mismatch',key)
 assert len(audits[0]['frozenMeshFingerprints'])==len(audits[1]['frozenMeshFingerprints'])==262
 for key in ('rows','sharedField'):assert a['payload'][key]==b['payload'][key]
 original_executions={phase:execution_attribution(old,phase,changes[PREFIX+'stage_volume75_v4.py']['old'])for phase in ('generate-zero','zero-interfaces','zero-cover')}
 fresh_execution=execution_attribution(new,'generate-zero',changes[PREFIX+'stage_volume75_v4.py']['new'])
 proposal=json.loads((old/'zero-metrics-review-and-proposal.json').read_text());assert proposal['status']=='FULL_ZERO_MEASURED_CORRECTION_PROPOSAL_NOT_APPLIED'and not proposal['correctionApplied']
 assert set(proposal['verifiedCacheFilesSHA256'])==set(EXPECTED)
 assert sha(old/'zero-cover-audit.json')==proposal['zeroAuditSHA256']
 assert set(p.name for p in (old/'checkpoints/zero').iterdir())==set(EXPECTED)
 old_base={**a['identity'],'blendSHA256':a['payload']['blendSHA256']};new_base={**b['identity'],'blendSHA256':b['payload']['blendSHA256']};records={};origins={}
 for filename,(key,is_metric)in EXPECTED.items():
  path=old/'checkpoints/zero'/filename;assert sha(path)==proposal['verifiedCacheFilesSHA256'][filename]
  value=read_checked(path);updated=rewrite_cache(value,old_base,new_base,key,is_metric)
  assert digest(updated['payload'])==digest(value['payload'])
  origins[filename]={'originalFileSHA256':sha(path),'originalIdentitySHA256':digest(value['identity']),'originalPayloadSHA256':digest(value['payload']),'newIdentitySHA256':digest(updated['identity']),'originalMetric':key,'originalStageSHA256':changes[PREFIX+'stage_volume75_v4.py']['old']}
  records[filename]=updated
 plan={'schemaVersion':1,'bridgeScriptSHA256':sha(Path(__file__)),'oldGenerateZeroAuditSHA256':sha(old/'generate-zero-audit.json'),'newGenerateZeroAuditSHA256':sha(new/'generate-zero-audit.json'),'frozenMeshFingerprintsSHA256':digest(audits[1]['frozenMeshFingerprints']),'status':'EXPLICIT_ZERO_MEASUREMENT_REUSE_NOT_RERUN','oldNamespace':str(old),'newNamespace':str(new),'sourceComparisonProof':changes,'oldZeroStateSHA256':sha(old/'zero-state.json'),'newZeroStateSHA256':sha(new/'zero-state.json'),'oldBlendSHA256':a['payload']['blendSHA256'],'newBlendSHA256':b['payload']['blendSHA256'],'exactGeometrySHA256':b['identity']['worldVerticesSHA256'],'exactMaterialsSHA256':b['identity']['materialsSHA256'],'frozenSceneProof':'Both successful fresh generation executions compare all262 frozen mesh snapshots to same protected original; scene type map and raw changed geometry/material/rows equal','originalProposalSHA256':sha(old/'zero-metrics-review-and-proposal.json'),'originalExecutions':original_executions,'freshZeroExecution':fresh_execution,'files':origins,'fileCount':19,'scope':'Only two canonical comparison source hashes may change; payloads/under-support hashes unchanged; optional blend byte hash comes only from fresh identical-geometry zero. No corrected metrics or joint state created.'}
 return plan,records

def apply_bridge(old,new,approved):
 plan,records=prepare(old,new);planhash=digest(plan);assert approved==planhash,'Root-approved plan hash required'
 temp=new/'zero-bridge-pending';assert not temp.exists();temp.mkdir()
 outputs={}
 for filename,value in records.items():
  value['reuseProvenance']={'bridgePlanSHA256':planhash,**plan['files'][filename],'originalExecutions':plan['originalExecutions'],'measurementRerun':False}
  value['sha256']=digest(value);p=temp/filename;p.write_text(json.dumps(value,separators=(',',':'),allow_nan=False))
  assert digest(load(p,value['identity']))==plan['files'][filename]['originalPayloadSHA256'];outputs[filename]=sha(p)
 root=new/'checkpoints';assert not root.exists();root.mkdir();temp.rename(root/'zero')
 receipt={'plan':plan,'approvedPlanSHA256':planhash,'outputFileSHA256':outputs,'authorization':'Explicit root/workflow-reviewed plan hash; SHA checksum receipt, not a cryptographic identity signature','measurementRerun':False}
 (new/'zero-reuse-bridge-receipt.json').write_text(json.dumps(receipt,indent=2)+'\n');return receipt

if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('--old',type=Path,required=True);p.add_argument('--new',type=Path,required=True);p.add_argument('--approved-plan-sha');a=p.parse_args()
 if a.approved_plan_sha:
  result=apply_bridge(a.old.resolve(),a.new.resolve(),a.approved_plan_sha);print(json.dumps({'status':'REUSED_NOT_RERUN','files':len(result['outputFileSHA256']),'approvedPlanSHA256':result['approvedPlanSHA256']}))
 else:
  plan,_=prepare(a.old,a.new);print(json.dumps({'planSHA256':digest(plan),'plan':plan},indent=2))
