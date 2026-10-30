import unittest
from triangle_intersection import triangle_intersection as hit
A=[(0,0,0),(1,0,0),(0,1,0)]
class TriangleNarrowphase(unittest.TestCase):
 def test_separated_planes(self):self.assertEqual(hit(A,[(0,0,.001),(1,0,.001),(0,1,.001)])['kind'],'separated')
 def test_separated_coplanar(self):self.assertEqual(hit(A,[(2,0,0),(3,0,0),(2,1,0)])['kind'],'separated')
 def test_broadphase_overlap_without_triangle_hit(self):self.assertEqual(hit(A,[(.8,.8,0),(1.2,.8,0),(.8,1.2,0)])['kind'],'separated')
 def test_proper_crossing(self):
  r=hit(A,[(.2,.2,-1),(.2,.2,1),(.2,.8,0)]);self.assertEqual(r['kind'],'proper_crossing');self.assertGreater(r['segmentLength'],.5)
 def test_shared_edge_touch(self):
  r=hit(A,[(0,0,0),(1,0,0),(0,0,1)]);self.assertEqual(r['kind'],'touch');self.assertAlmostEqual(r['segmentLength'],1)
 def test_shared_vertex_touch(self):self.assertEqual(hit(A,[(0,0,0),(0,-1,1),(-1,0,1)])['kind'],'touch')
 def test_coplanar_area(self):
  r=hit(A,[(.1,.1,0),(.3,.1,0),(.1,.3,0)]);self.assertEqual(r['kind'],'coplanar_overlap');self.assertAlmostEqual(r['overlapArea'],.02)
 def test_coplanar_shared_edge(self):self.assertEqual(hit(A,[(1,0,0),(0,1,0),(1,1,0)])['kind'],'touch')
 def test_reversed_winding(self):self.assertEqual(hit(A[::-1],[(.2,.2,-1),(.2,.2,1),(.2,.8,0)][::-1])['kind'],'proper_crossing')
 def test_degenerate(self):self.assertEqual(hit(A,[(0,0,0),(0,0,0),(0,0,0)])['kind'],'uncertain_degenerate')
 def test_thin_clearance(self):self.assertEqual(hit(A,[(0,0,.0005),(1,0,.0005),(0,1,.0005)])['kind'],'separated')
 def test_symmetry(self):
  b=[(.2,.2,-1),(.2,.2,1),(.2,.8,0)];self.assertEqual(hit(A,b)['kind'],hit(b,A)['kind']);self.assertAlmostEqual(hit(A,b)['segmentLength'],hit(b,A)['segmentLength'])
if __name__=='__main__':unittest.main()
