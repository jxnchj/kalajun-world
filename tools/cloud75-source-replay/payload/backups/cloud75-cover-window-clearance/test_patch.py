import unittest
from clearance_patch import repair,BOUNDARY
class PatchTests(unittest.TestCase):
 def fixture(self):
  p=[(.51+.03*i,1.67+.031*j,1.03)for j in range(21)for i in range(31)]
  p += [(x,y,z-.004)for x,y,z in p]
  for i in BOUNDARY:p += [(p[i][0],p[i][1]-.0002,p[i][2]-.002)]*6
  return p,[(.6775,2.2835,.78),(.7225,2.3385,2.12)]
 def test_pair_welt_inner_and_z(self):
  p,w=self.fixture();q,r=repair(p,w)
  self.assertAlmostEqual(r['amountMeters'],.0072)
  for i in range(651):self.assertAlmostEqual(q[i][1]-p[i][1],q[i+651][1]-p[i+651][1])
  for ring,i in enumerate(BOUNDARY):
   for k in range(6):self.assertAlmostEqual(q[1302+6*ring+k][1]-p[1302+6*ring+k][1],q[i][1]-p[i][1])
  self.assertEqual(q[589:620],p[589:620]);self.assertTrue(all(a[0]==b[0]and a[2]==b[2]for a,b in zip(p,q)))
  for col in range(5,9):self.assertAlmostEqual(q[620+col][1],2.2828)
 def test_repeat_and_wrong_source_blocked(self):
  p,w=self.fixture();q,_=repair(p,w)
  with self.assertRaises(AssertionError):repair(q,w)
  p[620]=(p[620][0],2.3,p[620][2])
  with self.assertRaises(AssertionError):repair(p,w)
  with self.assertRaises(AssertionError):repair(q,[(.6,2.28,.78),(.8,2.33,2.12)])
if __name__=='__main__':unittest.main()
