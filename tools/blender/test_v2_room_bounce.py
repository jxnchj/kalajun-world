"""Geometry-level regressions for the offline one-bounce sky integrator."""
import unittest
import bpy  # initializes the bundled mathutils module
from mathutils import Vector
from mathutils.bvhtree import BVHTree
from v2_room_bounce import aperture_samples, irradiance_at

class ApertureVisibility(unittest.TestCase):
    def setUp(self):
        self.openings=aperture_samples({"openings":[{"kind":"window","center":[0,1,2],"normal":[0,0,1],"width":1.2,"height":1.2}]})
        # A remote face keeps the tree valid but cannot occlude the aperture.
        self.empty=BVHTree.FromPolygons([(-5,0,-5),(-4,0,-5),(-4,1,-5)],[(0,1,2)])
    def test_surface_orientation_and_partition_visibility(self):
        p=Vector((0,1,0));n=Vector((0,0,1))
        direct=irradiance_at(p,n,self.openings,self.empty)
        self.assertGreater(direct,.2)
        self.assertEqual(irradiance_at(p,-n,self.openings,self.empty),0)
        wall=BVHTree.FromPolygons([(-3,-1,1),(3,-1,1),(3,4,1),(-3,4,1)],[(0,1,2,3)])
        self.assertEqual(irradiance_at(p,n,self.openings,wall),0)
    def test_real_window_quadrants_do_not_assume_a_clear_centre(self):
        p=Vector((0,1,0));n=Vector((0,0,1))
        # One blocked quadrant lowers reflected energy but leaves the three
        # unobstructed sample paths, unlike a single centre-ray approximation.
        wall=BVHTree.FromPolygons([(-.7,.2,1.8),(0,.2,1.8),(0,1,1.8),(-.7,1,1.8)],[(0,1,2,3)])
        full=irradiance_at(p,n,self.openings,self.empty)
        partial=irradiance_at(p,n,self.openings,wall)
        self.assertGreater(partial,0);self.assertLess(partial,full*.85)
if __name__=="__main__":unittest.main()
