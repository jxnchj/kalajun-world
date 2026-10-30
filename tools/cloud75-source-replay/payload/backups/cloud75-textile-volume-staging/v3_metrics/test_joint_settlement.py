import unittest
from joint_settlement import solve_joint
class Joint(unittest.TestCase):
 def test_zero(self):self.assertEqual(solve_joint([(-.001,.001)]*4)['shifts'],[0.]*4)
 def test_positive(self):
  x=solve_joint([(-1e-6,.001),(.00005,.001),(.00001,.001),(.00006,.001)])
  self.assertEqual(x['shifts'][0],0.);self.assertAlmostEqual(x['maxAbsoluteShift'],.00012)
 def test_cap(self):
  with self.assertRaises(ValueError):solve_joint([(0,0),(.0002,.001),(.0002,.001),(.0002,.001)])
 def test_bottom_required(self):
  x=solve_joint([(.00002,.00003),(-.001,.001),(-.001,.001),(-.001,.001)])
  self.assertFalse(x['bottomFixedZero']);self.assertAlmostEqual(x['shifts'][0],.00002)
 def test_mixed(self):
  x=solve_joint([(0,0),(-.0002,.0002),(.0002,.0002),(0,0)])
  self.assertAlmostEqual(x['maxAbsoluteShift'],.0001);self.assertAlmostEqual(x['shifts'][1],-.0001)
if __name__=='__main__':unittest.main()
