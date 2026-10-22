"""Visibility/units tests for a static single solar-bounce transport bake."""
import unittest
import bpy
from mathutils import Vector
from mathutils.bvhtree import BVHTree
from v2_room_transport import aperture_path,solar_irradiance,directions

class SolarTransport(unittest.TestCase):
    def setUp(self):
        self.openings=[{'kind':'window','center':[0,1,2],'normal':[0,0,1],'width':2,'height':1.8,'skyWeight':.55}]
        self.empty=BVHTree.FromPolygons([(-10,-10,-10),(-9,-10,-10),(-10,-9,-10)],[(0,1,2)])
    def test_exact_aperture_exit_and_transmission(self):
        d=Vector((0,.5,1)).normalized();p=Vector((0,0,0));n=Vector((0,1,0))
        self.assertAlmostEqual(solar_irradiance(p,n,d,self.openings,self.empty),n.dot(d)*.55)
        self.assertEqual(solar_irradiance(p,n,Vector((0,.5,-1)).normalized(),self.openings,self.empty),0)
        self.assertEqual(solar_irradiance(p,n,Vector((0,-.5,1)).normalized(),self.openings,self.empty),0)
        self.assertEqual(aperture_path(Vector((4,0,0)),d,self.openings),0)
    def test_actual_partition_and_roof_block_energy(self):
        wall=BVHTree.FromPolygons([(-4,0,1),(4,0,1),(4,4,1),(-4,4,1)],[(0,1,2,3)])
        self.assertEqual(solar_irradiance(Vector((0,0,0)),Vector((0,1,0)),Vector((0,.5,1)).normalized(),self.openings,wall),0)
        crown=[{'kind':'roof-crown','center':[0,3,0],'normal':[0,1,0],'radius':.62}]
        p=Vector((0,0,0));up=Vector((0,1,0))
        self.assertEqual(solar_irradiance(p,up,up,crown,self.empty),1)
        cap=BVHTree.FromPolygons([(-2,2,-2),(2,2,-2),(2,2,2),(-2,2,2)],[(0,1,2,3)])
        self.assertEqual(solar_irradiance(p,up,up,crown,cap),0)
        self.assertEqual(aperture_path(Vector((1,0,0)),up,crown),0)
    def test_direction_grid_covers_only_the_upper_hemisphere(self):
        values=directions();self.assertEqual(len(values),81)
        for d in values:self.assertAlmostEqual(d.length,1,places=6);self.assertGreaterEqual(d.y,0)
        self.assertEqual(tuple(values[-1]),(0,1,0))
if __name__=='__main__':unittest.main()
