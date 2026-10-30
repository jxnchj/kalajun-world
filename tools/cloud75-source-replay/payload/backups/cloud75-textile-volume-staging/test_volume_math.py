import unittest
from volume_math import overlap_gaps,clip_triangle,height
class ExactOverlap(unittest.TestCase):
 def test_parallel(self):
  t=[(0,0,0),(1,0,0),(0,1,0)];u=[(x,y,z+.0007)for x,y,z in t]
  r=overlap_gaps([u],[t]);self.assertAlmostEqual(r['minGap'],.0007);self.assertAlmostEqual(r['maxDifferenceAcrossAllSupportSurfaces'],.0007)
 def test_crossing_inside(self):
  low=[(0,0,0),(1,0,0),(0,1,0)];up=[(.2,.2,.01),(.7,.2,-.01),(.2,.7,.01)]
  self.assertAlmostEqual(overlap_gaps([up],[low])['minGap'],-.01)
 def test_opposite_winding(self):
  t=[(0,0,0),(1,0,0),(0,1,0)];u=[(x,y,2)for x,y,z in t[::-1]]
  self.assertAlmostEqual(overlap_gaps([u],[t])['minGap'],2)
 def test_no_overlap(self):
  with self.assertRaises(ValueError):overlap_gaps([[(2,2,0),(3,2,0),(2,3,0)]],[[(0,0,0),(1,0,0),(0,1,0)]])
 def test_partial_union_coverage(self):
  up=[(0,0,1),(1,0,1),(0,1,1)];low=[(0,0,0),(.5,0,0),(0,.5,0)]
  r=overlap_gaps([up],[low,low]);self.assertEqual(r['partiallyCoveredTriangles'],1);self.assertAlmostEqual(r['uncoveredProjectedArea'],.375)
 def test_height(self):self.assertAlmostEqual(height([(0,0,0),(1,0,1),(0,1,2)],(.25,.25)),.75)
if __name__=='__main__':unittest.main()
