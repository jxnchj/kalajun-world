import unittest
import bpy
from mathutils import Vector
from mathutils.bvhtree import BVHTree
from v2_room_aperture_visibility import aperture_visibility,aperture_points
class ApertureVisibility(unittest.TestCase):
    def setUp(self):
        self.opening={'kind':'window','center':[0,1,2],'normal':[0,0,1],'width':2,'height':2,'skyWeight':.55}
        self.empty=BVHTree.FromPolygons([(-10,-10,-10),(-9,-10,-10),(-10,-9,-10)],[(0,1,2)])
        self.p=Vector((0,1,0))
    def wall(self,x0=-2,x1=2,z=1):
        return BVHTree.FromPolygons([(x0,-2,z),(x1,-2,z),(x1,4,z),(x0,4,z)],[(0,1,2,3)])
    def test_empty_partition_and_half_aperture(self):
        self.assertEqual(aperture_visibility(self.p,self.opening,self.empty),1)
        self.assertEqual(aperture_visibility(self.p,self.opening,self.wall()),0)
        self.assertAlmostEqual(aperture_visibility(self.p,self.opening,self.wall(0,2)),.5,places=6)
    def test_occluders_behind_window_do_not_block(self):
        self.assertEqual(aperture_visibility(self.p,self.opening,self.wall(z=3)),1)
        # Crossbar just inside the aperture plane still occludes; only 2mm is excluded.
        self.assertLess(aperture_visibility(self.p,self.opening,self.wall(-.2,.2,z=1.98)),1)
    def test_transmission_and_albedo_are_not_applied_twice(self):
        a=aperture_visibility(self.p,self.opening,self.wall(0,2))
        self.assertEqual(aperture_visibility(self.p,{**self.opening,'skyWeight':.1},self.wall(0,2)),a)
        self.assertEqual(aperture_visibility(Vector((0,1,3)),self.opening,self.empty),0)
    def test_crown_samples_cover_disk_without_rectangular_corners(self):
        crown={'kind':'roof-crown','center':[0,3,0],'normal':[0,1,0],'radius':.62}
        pts=aperture_points(crown);self.assertEqual(len(pts),32)
        self.assertTrue(all((p-Vector(crown['center'])).length<.62 for p in pts))
        self.assertEqual(aperture_visibility(Vector((0,1,0)),crown,self.empty),1)
if __name__=='__main__':unittest.main()
