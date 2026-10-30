import unittest,tempfile,json
from pathlib import Path
from phase_checkpoint import save,load
class Checkpoint(unittest.TestCase):
 def test_exact_identity_and_immutable_payload(self):
  with tempfile.TemporaryDirectory()as d:
   p=Path(d)/'p.json';save(p,{'shape':'a','helper':'b'},{'metric':1});self.assertEqual(load(p,{'shape':'a','helper':'b'}),{'metric':1})
   with self.assertRaises(AssertionError):load(p,{'shape':'changed','helper':'b'})
   with self.assertRaises(AssertionError):save(p,{'shape':'a','helper':'b'},{'metric':2})
 def test_tamper_and_nonfinite_rejected(self):
  with tempfile.TemporaryDirectory()as d:
   p=Path(d)/'p.json';save(p,{},1);v=json.loads(p.read_text());v['payload']=2;p.write_text(json.dumps(v))
   with self.assertRaises(AssertionError):load(p,{})
   with self.assertRaises(ValueError):save(Path(d)/'nan.json',{},float('nan'))
 def test_all_geometry_bindings_reject_independent_mutation(self):
  identity={key:'original'for key in ('source','helper','script','underside','support','zeroBlend','state')}
  with tempfile.TemporaryDirectory()as d:
   p=Path(d)/'p.json';save(p,identity,{'verified':True})
   for key in identity:
    altered=dict(identity);altered[key]='changed'
    with self.subTest(key=key),self.assertRaises(AssertionError):load(p,altered)
 def test_correction_is_from_pristine_zero_not_accumulated(self):
  from phase_checkpoint import apply_from_zero
  zero=[(0.,0.,1.),(1.,1.,2.)];shift=.0002
  once=apply_from_zero(zero,shift)
  self.assertEqual(once,apply_from_zero(zero,shift))
  self.assertNotEqual(once,apply_from_zero(once,shift))
  self.assertEqual(zero,[(0.,0.,1.),(1.,1.,2.)])
if __name__=='__main__':unittest.main()
