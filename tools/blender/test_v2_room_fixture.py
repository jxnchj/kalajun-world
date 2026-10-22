import math,unittest
import bpy
from mathutils import Vector
from mathutils.bvhtree import BVHTree
from v2_room_fixture import unit_spot_irradiance

class FixtureTransferTest(unittest.TestCase):
    def setUp(self):
        self.light={'position':[0,2.012,0],'target':[0,1.012,0],'angle':math.pi*.38,'penumbra':.65,'distance':4.2,'decay':2}
        self.empty=BVHTree.FromPolygons([(20,0,0),(20,1,0),(20,0,1)],[(0,1,2)])
    def test_existing_three_units_cosine_range_and_spot_cone(self):
        p=Vector((0,0,0));n=Vector((0,1,0));actual=unit_spot_irradiance(p,n,self.light,self.empty)
        self.assertAlmostEqual(actual,(1-(2/4.2)**4)**2/4,places=7)
        self.assertEqual(unit_spot_irradiance(p,-n,self.light,self.empty),0)
        self.assertEqual(unit_spot_irradiance(Vector((0,-3,0)),n,self.light,self.empty),0)
        self.assertEqual(unit_spot_irradiance(Vector((5,1,0)),n,self.light,self.empty),0)
    def test_actual_opaque_segment_blocks_fixture_flux(self):
        wall=BVHTree.FromPolygons([(-2,1,-2),(2,1,-2),(2,1,2),(-2,1,2)],[(0,1,2,3)])
        self.assertGreater(unit_spot_irradiance(Vector((0,0,0)),Vector((0,1,0)),self.light,self.empty),0)
        self.assertEqual(unit_spot_irradiance(Vector((0,0,0)),Vector((0,1,0)),self.light,wall),0)

if __name__=='__main__':unittest.main()
