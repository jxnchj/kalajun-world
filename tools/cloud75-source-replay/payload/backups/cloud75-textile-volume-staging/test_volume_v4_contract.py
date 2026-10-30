import unittest
from volume_v4_contract import edge_field,displacement
class Field(unittest.TestCase):
 def test_boundary_arc_not_E3_flat_perimeter(self):
  lo=(-1,-1);hi=(1,1)
  self.assertEqual(edge_field(0,0,lo,hi),0)
  self.assertEqual(edge_field(1,0,lo,hi),.5)
  self.assertEqual(edge_field(1,1,lo,hi),1)
  self.assertEqual(displacement(7,True,1),-.016)
 def test_all_shared_interfaces_match(self):
  for j in range(7):
   for e in (0,.1,.5,.9,1):self.assertEqual(displacement(j,True,e),displacement(j+1,False,e))
 def test_per_leaf_thickness_and_budget(self):
  for j in range(8):
   for e in (0,.1,.5,.9,1):
    loss=displacement(j,False,e)-displacement(j,True,e)
    self.assertLessEqual(loss,.002+1e-15);self.assertGreaterEqual(loss,0)
 def test_outside_boundary_extension_and_bad_bounds(self):
  self.assertEqual(edge_field(2,2,(-1,-1),(1,1)),1)
  with self.assertRaises(AssertionError):edge_field(0,0,(0,0),(0,1))
if __name__=='__main__':unittest.main()
