"""Guard-unit fixtures only: these do NOT certify a generated candidate."""
import copy,json,tempfile,unittest,subprocess,sys
from pathlib import Path
from unittest.mock import patch
import pipeline as p

class ImportGuards(unittest.TestCase):
 def test_pipeline_helper_import_from_foreign_cwd(self):
  script=Path(p.__file__).resolve()
  code="import runpy,sys; ns=runpy.run_path(sys.argv[1],run_name='guard_import_only'); import material_fingerprint; assert material_fingerprint.__file__ == str(ns['HERE']/'material_fingerprint.py')"
  with tempfile.TemporaryDirectory() as cwd:
   result=subprocess.run([sys.executable,'-I','-c',code,str(script)],cwd=cwd,capture_output=True,text=True)
  self.assertEqual(result.returncode,0,result.stderr)

class SceneGuards(unittest.TestCase):
 def setUp(self):
  self.textiles=p.CHANGED+[f'unchanged_textile_{i}' for i in range(4)]
  names=self.textiles+[f'other_{i}' for i in range(258)]
  self.source={n:{'type':'MESH','fingerprint':'original','matrix':[1]} for n in names}
  self.source.update({f'empty_{i}':{'type':'EMPTY','fingerprint':None,'matrix':[1]} for i in range(2)})
 def test_valid_original_counts_and_five_changed(self):
  candidate=copy.deepcopy(self.source)
  for n in p.CHANGED:candidate[n]['fingerprint']='new geometry'
  self.assertEqual(p.scene_guard(self.source,candidate,self.textiles)['frozenMeshes'],262)
 def test_wrong_source_counts_rejected(self):
  source=copy.deepcopy(self.source);source['extra']={'type':'MESH'}
  with self.assertRaises(ValueError):p.scene_guard(source,source,self.textiles)
 def test_frozen_textile_change_rejected(self):
  candidate=copy.deepcopy(self.source);candidate[self.textiles[-1]]['fingerprint']='changed'
  with self.assertRaises(ValueError):p.scene_guard(self.source,candidate,self.textiles)
 def test_frozen_nontextile_change_rejected(self):
  candidate=copy.deepcopy(self.source);candidate['other_0']['matrix']=[2]
  with self.assertRaises(ValueError):p.scene_guard(self.source,candidate,self.textiles)
 def test_empty_change_rejected(self):
  candidate=copy.deepcopy(self.source);candidate['empty_0']['matrix']=[2]
  with self.assertRaises(ValueError):p.scene_guard(self.source,candidate,self.textiles)
 def test_name_substitution_rejected(self):
  candidate=copy.deepcopy(self.source);candidate['renamed']=candidate.pop('other_0')
  with self.assertRaises(ValueError):p.scene_guard(self.source,candidate,self.textiles)
 def test_changed_node_type_rejected(self):
  candidate=copy.deepcopy(self.source);candidate[p.CHANGED[0]]['type']='EMPTY'
  with self.assertRaises(ValueError):p.scene_guard(self.source,candidate,self.textiles)

class ReceiptGuards(unittest.TestCase):
 def setUp(self):
  self.tmp=tempfile.TemporaryDirectory();self.addCleanup(self.tmp.cleanup)
  self.root=Path(self.tmp.name);stage=self.root/'backups/candidate-v4';stage.mkdir(parents=True)
  original=self.root/'web/public/assets/v2/house-textiles62';original.mkdir(parents=True)
  source=self.root/'source.blend';source.write_bytes(b'fixture source')
  (original.parent/'house_a_lived.glb').write_bytes(b'fixture house')
  (stage/'candidate.blend').write_bytes(b'fixture candidate');(stage/'geometry.glb').write_bytes(b'fixture geometry')
  manifest={'geometrySHA256':p.sha(stage/'geometry.glb'),'sourceSHA256':p.sha(original.parent/'house_a_lived.glb'),'nodes':[{'name':n} for n in p.CHANGED+[f'unchanged_textile_{i}' for i in range(4)]]}
  (stage/'manifest.json').write_text(json.dumps(manifest));(original/'manifest.json').write_text(json.dumps(manifest))
  self.r={'schemaVersion':1,'approvedBy':'root','stage':'ao','candidateVersion':4,'approvedForStaging':True,'gates':{'geometry3D':True,'sameConditionGeometryVisual':True,'aoReadback':False},'inputs':{k:{'path':str(stage/n),'sha256':p.sha(stage/n)} for k,n in [('blend','candidate.blend'),('geometry','geometry.glb'),('manifest','manifest.json')]},'evidence':[]}
  self.receipt=stage/'receipt.json'
  for key,value in [('ROOT',self.root),('SOURCE_BLEND',source),('SOURCE_BLEND_SHA',p.sha(source))]:
   patcher=patch.object(p,key,value);patcher.start();self.addCleanup(patcher.stop)
  self.evidence()
 def evidence(self):
  self.r['evidence']=[]
  for role in ['geometry3D','sameConditionGeometryVisual']+(['aoReadback'] if self.r['stage']=='gi' else []):
   path=self.receipt.with_name(role+'.json');path.write_text(json.dumps({'status':'PASS','approvedBy':'root','role':role,'inputs':self.r['inputs']}))
   self.r['evidence'].append({'role':role,'path':str(path),'sha256':p.sha(path)})
 def run_receipt(self):
  self.receipt.write_text(json.dumps(self.r));return p.receipt_check(self.receipt,self.r['stage'])
 def test_valid_ao(self):self.run_receipt()
 def test_valid_gi(self):
  self.r['stage']='gi';self.r['gates']['aoReadback']=True;self.evidence();self.run_receipt()
 def test_no_root_release(self):
  self.r['approvedBy']='agent'
  with self.assertRaises(ValueError):self.run_receipt()
 def test_old_candidate_rejected(self):
  self.r['candidateVersion']=3
  with self.assertRaises(ValueError):self.run_receipt()
 def test_evidence_changed(self):
  Path(self.r['evidence'][0]['path']).write_text('{}')
  with self.assertRaises(ValueError):self.run_receipt()
 def test_stale_evidence_rebinding_rejected(self):
  item=self.r['evidence'][0];path=Path(item['path']);e=json.loads(path.read_text());e['inputs']['blend']['sha256']='old';path.write_text(json.dumps(e));item['sha256']=p.sha(path)
  with self.assertRaises(ValueError):self.run_receipt()
 def test_gi_requires_readback(self):
  self.r['stage']='gi';self.evidence()
  with self.assertRaises(ValueError):self.run_receipt()
 def test_duplicate_evidence_role(self):
  self.r['evidence'][1]=self.r['evidence'][0]
  with self.assertRaises(ValueError):self.run_receipt()
 def test_input_changed(self):
  Path(self.r['inputs']['geometry']['path']).write_bytes(b'changed')
  with self.assertRaises(ValueError):self.run_receipt()
if __name__=='__main__':unittest.main()
