import copy,unittest,tempfile,shutil
from pathlib import Path
from unittest.mock import patch
import bridge_zero_serialization as b
class Bridge(unittest.TestCase):
 def identities(self):
  old={'dependencies':{'stage':'a','phase':'b','math':'m'},'state':'zero','world':'same','runtime':'same'};new=copy.deepcopy(old);new['dependencies'].update(stage='c',phase='d');changes={'stage':{'old':'a','new':'c'},'phase':{'old':'b','new':'d'}};return old,new,changes
 def test_only_two_explicit_identity_changes(self):
  old,new,changes=self.identities();b.prove_identity_change(old,new,changes)
  for field in ('state','world','runtime'):
   wrong=copy.deepcopy(new);wrong[field]='different'
   with self.assertRaises(AssertionError):b.prove_identity_change(old,wrong,changes)
  wrong=copy.deepcopy(new);wrong['dependencies']['math']='changed'
  with self.assertRaises(AssertionError):b.prove_identity_change(old,wrong,changes)
 def test_metric_shape_hashes_payload_preserved_and_wrong_state_rejected(self):
  old,new,_=self.identities();old['blendSHA256']='old';new['blendSHA256']='new'
  value={'identity':{**old,'metric':'internal-0','supportSHA256':'a'*64,'undersideSHA256':'b'*64},'payload':{'value':.001}}
  result=b.rewrite_cache(value,old,new,'internal-0',True);self.assertEqual(result['payload'],value['payload']);self.assertEqual(result['identity']['supportSHA256'],'a'*64)
  for field,value2 in [('state','corrected'),('metric','cover-support'),('supportSHA256','malformed')]:
   bad=copy.deepcopy(value);bad['identity'][field]=value2
   with self.assertRaises(AssertionError):b.rewrite_cache(bad,old,new,'internal-0',True)
  bad=copy.deepcopy(value);bad['identity']['extra']='unexpected'
  with self.assertRaises(AssertionError):b.rewrite_cache(bad,old,new,'internal-0',True)
 def test_exact_source_diff_allowlist_rejects_extra_edit(self):
  self.assertEqual(len(b.prove_source_edits()),2)
  with tempfile.TemporaryDirectory()as d:
   root=Path(d);(root/'serialization-before-v11').mkdir()
   for name in b.EDITS:
    shutil.copyfile(b.H/name,root/name);shutil.copyfile(b.H/'serialization-before-v11'/name,root/'serialization-before-v11'/name)
   with patch.object(b,'H',root):
    b.prove_source_edits();p=root/'stage_volume75_v4.py';p.write_text(p.read_text()+'\n# unrelated edit\n')
    with self.assertRaises(AssertionError):b.prove_source_edits()
 def test_exact_zero_filename_allowlist(self):
  self.assertEqual(len(b.EXPECTED),19);self.assertEqual(sum(v[1]for v in b.EXPECTED.values()),9);self.assertNotIn('joint-solution.json',b.EXPECTED);self.assertNotIn('corrected-state.json',b.EXPECTED)
if __name__=='__main__':unittest.main()
