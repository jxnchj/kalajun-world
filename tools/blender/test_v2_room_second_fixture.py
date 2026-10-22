import unittest
import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree
from v2_room_second_fixture import second_fixture_radiance

class SecondFixtureTest(unittest.TestCase):
    def setUp(self):
        self.floor=BVHTree.FromPolygons([(-10,0,-10),(10,0,-10),(10,0,10),(-10,0,10)],[(0,1,2,3)])
        self.point=Vector((0,1,0));self.normal=Vector((1,0,0))
        self.fixture={'position':[2,2,0],'target':[2,0,0],'angle':1.2,'penumbra':.65,'distance':4.2,'decay':2}
    def result(self,rho1,rho2,fixture=None):
        return second_fixture_radiance(self.point,self.normal,np.array(rho1),fixture or self.fixture,self.floor,np.array([rho2]),samples=192)
    def test_two_material_reflections_multiply_and_do_not_invent_direct_light(self):
        full=self.result([1,1,1],[1,1,1]);self.assertTrue(np.all(full>0))
        np.testing.assert_allclose(self.result([.6,.4,.2],[.3,.5,.8]),full*np.array([.18,.2,.16]))
        np.testing.assert_equal(self.result([0,0,0],[1,1,1]),[0,0,0])
        np.testing.assert_equal(self.result([1,1,1],[0,0,0]),[0,0,0])
    def test_absent_second_surface_and_unlit_second_surface_return_zero(self):
        value=second_fixture_radiance(self.point,Vector((0,1,0)),np.ones(3),self.fixture,self.floor,np.ones((1,3)),samples=192)
        np.testing.assert_equal(value,[0,0,0])
        below={**self.fixture,'position':[2,-2,0],'target':[2,0,0]}
        np.testing.assert_equal(self.result([1,1,1],[1,1,1],below),[0,0,0])

if __name__=='__main__':unittest.main()
