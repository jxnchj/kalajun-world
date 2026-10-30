import unittest,copy
from ao_readback_contract import check_rgba
class AO(unittest.TestCase):
 def test_float_and_uint16_typed_channels(self):
  r=check_rgba([[.8,.9,.7,1.]],[[.25,.25,.7,1.]]);self.assertEqual(r['changedAOValues'],1);self.assertTrue(r['skyBExact'])
  self.assertTrue(check_rgba([[50000,51000,12345,65535]],[[16384,16384,12345,65535]],65535)['alphaOne'])
 def test_mutations_rejected(self):
  old=[[.8,.8,.7,1.]]
  for row in [[.25,.3,.7,1.],[.24,.24,.7,1.],[1.01,1.01,.7,1.],[.5,.5,.71,1.],[.5,.5,.7,.9],[float('nan')]*4]:
   with self.subTest(row=row),self.assertRaises(AssertionError):check_rgba(old,[row])
 def test_encoding_boundary_not_hidden(self):
  with self.assertRaises(AssertionError):check_rgba([[50000,50000,3,65535]],[[16383,16383,3,65535]],65535)
 def test_density_and_shape_rejected(self):
  with self.assertRaises(AssertionError):check_rgba([[1.,1.,1.,1.]],[])
  with self.assertRaises(AssertionError):check_rgba([[1.,1.,1.,1.]],[[1.,1.,1.]])
if __name__=='__main__':unittest.main()
