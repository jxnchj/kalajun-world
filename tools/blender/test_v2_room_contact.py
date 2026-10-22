"""Targeted regressions of the same BVH visibility integral used by the contact bake."""
import unittest
import bpy
from mathutils import Vector
from mathutils.bvhtree import BVHTree
from v2_room_contact import visibility,barycentric

class ContactVisibility(unittest.TestCase):
    def scene(self,leg=False):
        vertices=[(-2,0,-2),(-2,0,2),(2,0,2),(2,0,-2)];faces=[(0,1,2),(0,2,3)]
        if leg:
            vertices +=[(x,y,z)for y in [0,.6]for z in [-.04,.04]for x in [-.04,.04]]
            faces +=[tuple(4+i for i in f)for f in [(0,1,3,2),(4,6,7,5),(0,4,5,1),(2,3,7,6),(0,2,6,4),(1,5,7,3)]]
        return BVHTree.FromPolygons(vertices,faces)
    def test_bare_plane_does_not_shadow_itself(self):
        self.assertEqual(visibility(Vector((0,0,0)),self.scene()),1)
    def test_real_leg_local_contact_and_finite_support(self):
        scene=self.scene(True)
        self.assertLess(visibility(Vector((.045,0,0)),scene),.8)
        self.assertEqual(visibility(Vector((.7,0,0)),scene),1)
        self.assertEqual(visibility(Vector((0,.7,0)),scene),1)
    def test_receiver_interpolation_matches_vertices_and_preserves_linear_fields(self):
        a,b,c=Vector((0,0,0)),Vector((2,0,0)),Vector((0,0,2))
        self.assertEqual(barycentric(a,a,b,c),(1.,0.,0.))
        for weight in barycentric((a+b+c)/3,a,b,c):self.assertAlmostEqual(weight,1/3,places=7)
if __name__=='__main__':unittest.main()
