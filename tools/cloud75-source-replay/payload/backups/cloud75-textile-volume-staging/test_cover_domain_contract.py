import unittest
from cover_domain_contract import verify_exact_patch,domain_accounting
from exact_patch_domain import Limit
class Contract(unittest.TestCase):
 def runproof(self,old,new,changed,**kw):
  support=[[(0,0,0),(2,0,0),(0,2,0)]]
  return domain_accounting(old,new,{'cells':[]},{'cells':[]},changed,old_support_triangles=support,new_support_triangles=kw.pop('new_support',support),**kw)
 def test_named_patch_and_frozen_outside(self):
  old=[(0,0,0),(1,1,0)];expected=[(0,-.007,0),(1,1,0)]
  self.assertTrue(verify_exact_patch(old,expected,expected,[0]))
  with self.assertRaises(AssertionError):verify_exact_patch(old,[(0,-.007,0),(1,.999,0)],expected,[0])
  with self.assertRaises(AssertionError):verify_exact_patch(old,[(.001,-.007,0),(1,1,0)],expected,[0])
 def test_exact_subset_removed_region_and_theorem(self):
  old=[[(0,0,0),(1,0,0),(0,1,0)]];new=[[(0,0,0),(1,0,0),(0,.99,0)]]
  r=self.runproof(old,new,[0]);self.assertTrue(r['passed']);self.assertGreater(r['removedDomain']['area'],0);self.assertEqual(r['newDomain']['exactArea'],'0');self.assertTrue(r['newlyUnsupported']['exactEmpty'])
 def test_unapproved_triangle_change_rejected(self):
  old=[[(0,0,0),(1,0,0),(0,1,0)]];new=[[(0,0,0),(1,0,0),(0,.99,0)]]
  with self.assertRaises(AssertionError):self.runproof(old,new,[])
 def test_support_xy_drift_rejected_even_tiny(self):
  tri=[[(0,0,0),(1,0,0),(0,1,0)]]
  with self.assertRaises(AssertionError):self.runproof(tri,tri,[],new_support=[[(0,0,0),(2,0,0),(0,2+1e-14,0)]])
 def test_tiny_new_domain_never_dropped(self):
  old=[[(0,0,0),(1,0,0),(0,1,0)]];new=[[(0,0,0),(1,0,0),(0,1+1e-14,0)]]
  r=self.runproof(old,new,[0]);self.assertFalse(r['passed']);self.assertGreater(r['newDomain']['areaUpperBound'],0);self.assertFalse(r['newlyUnsupported']['exactEmpty'])
 def test_support_holes_remain_safe_only_under_subset(self):
  old=[[(0,0,0),(1,0,0),(0,1,0)]];new=[[(0,0,0),(.5,0,0),(0,.5,0)]]
  support=[[(2,2,0),(3,2,0),(2,3,0)]]
  r=domain_accounting(old,new,{}, {},[0],old_support_triangles=support,new_support_triangles=support)
  self.assertTrue(r['passed']);self.assertTrue(r['newlyUnsupported']['exactEmpty'])
 def test_operation_cap(self):
  tri=[[(0,0,0),(1,0,0),(0,1,0)]]
  with self.assertRaises(Limit):self.runproof(tri,tri,[0],max_operations=1)
 def test_degenerate_and_nonfinite_rejected(self):
  for triangle in [[(0,0,0),(1,0,0),(2,0,0)],[(0,0,0),(1,0,0),(0,float('nan'),0)]]:
   with self.assertRaises(AssertionError):self.runproof([triangle],[triangle],[])
if __name__=='__main__':unittest.main()
