import unittest
from execution_budget import budget
class Budget(unittest.TestCase):
 def test_default_never_extended(self):
  for phase in ('zero-cover','corrected-cover','generate-zero','export',None):self.assertEqual(budget('geometry',phase,False,0)[0],300)
 def test_explicit_cover_only_and_memory(self):
  for phase in ('zero-cover','corrected-cover'):self.assertEqual(budget('geometry',phase,True,6_000_000_000)[0],900)
  for mode,phase,mem in [('geometry','generate-zero',9e9),('preview','zero-cover',9e9),('geometry','zero-cover',5_999_999_999)]:
   with self.assertRaises(AssertionError):budget(mode,phase,True,mem)
 def test_zero_snapshot_never_overwritten(self):
  import tempfile
  from pathlib import Path
  from execution_budget import refuse_snapshot_overwrite
  for name in ('zero-state.json','zero-settlement-unvalidated.blend'):
   with tempfile.TemporaryDirectory()as d:
    p=Path(d)/name;p.write_text('immutable')
    with self.assertRaises(AssertionError):refuse_snapshot_overwrite(d,'generate-zero')
    self.assertEqual(p.read_text(),'immutable')
 def test_corrected_snapshot_never_overwritten(self):
  import tempfile
  from pathlib import Path
  from execution_budget import refuse_snapshot_overwrite
  for name in ('corrected-state.json','corrected-settlement-unvalidated.blend'):
   with tempfile.TemporaryDirectory()as d:
    p=Path(d)/name;p.write_text('immutable')
    with self.assertRaises(AssertionError):refuse_snapshot_overwrite(d,'solve')
    self.assertEqual(p.read_text(),'immutable')
if __name__=='__main__':unittest.main()
