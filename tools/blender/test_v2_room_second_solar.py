import math,unittest
import bpy
import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree
from v2_room_second_solar import second_solar_radiance,solar_many
from v2_room_transport import solar_irradiance,directions

class RoomSecondSolarTest(unittest.TestCase):
    def setUp(self):
        self.openings=[{'kind':'window','center':[0,1.5,2],'normal':[0,0,1],'width':3,'height':2,'skyWeight':.7}]
        self.sun=Vector((0,.5,1)).normalized();self.point=Vector((0,1,-1));self.normal=Vector((0,0,1));self.rho=np.array([.65,.6,.55])
    def scene(self,blocked=False):
        verts=[(-5,0,-5),(5,0,-5),(5,0,5),(-5,0,5)];faces=[(0,1,2,3)];colors=[(.55,.32,.15)]
        if blocked:
            verts.extend([(-6,-1,1),(6,-1,1),(6,6,1),(-6,6,1)]);faces.append((4,5,6,7));colors.append((.55,.32,.15))
        return BVHTree.FromPolygons(verts,faces),np.array(colors)
    def test_two_materials_and_real_visibility_bound_the_second_reflection(self):
        bvh,albedos=self.scene()
        value=second_solar_radiance(self.point,self.normal,self.rho,bvh,albedos,self.openings,self.sun,samples=512)
        self.assertTrue(np.all(value>0));self.assertGreater(value[0],value[2])
        self.assertTrue(np.all(value<=self.rho*np.max(albedos,axis=0)/math.pi))
        np.testing.assert_allclose(second_solar_radiance(self.point,self.normal,self.rho*.5,bvh,albedos,self.openings,self.sun,samples=512),value*.5)
        np.testing.assert_allclose(second_solar_radiance(self.point,self.normal,self.rho,bvh,albedos*.5,self.openings,self.sun,samples=512),value*.5)
        np.testing.assert_array_equal(second_solar_radiance(self.point,self.normal,self.rho,bvh,albedos,[],self.sun),np.zeros(3))
        blocked,colors=self.scene(True)
        np.testing.assert_array_equal(second_solar_radiance(self.point,self.normal,self.rho,blocked,colors,self.openings,self.sun,samples=512),np.zeros(3))
    def test_batch_rejection_matches_original_scalar_solar_occlusion(self):
        bvh,_=self.scene(True);rng=np.random.default_rng(27)
        points=rng.uniform([-2,.05,-2],[2,3,1.8],(300,3));normals=rng.normal(size=(300,3));normals/=np.linalg.norm(normals,axis=1)[:,None]
        openings=self.openings+[{'kind':'roof-crown','center':[0,3,0],'normal':[0,1,0],'radius':.62}]
        for sun in directions()[::9]:
            batch=solar_many(points,normals,sun,openings,bvh)
            scalar=np.array([solar_irradiance(Vector(p),Vector(n),sun,openings,bvh)for p,n in zip(points,normals)])
            np.testing.assert_allclose(batch,scalar,atol=2e-7)
    def test_escape_rays_do_not_count_the_first_reflection_or_direct_sun(self):
        bvh=BVHTree.FromPolygons([(100,0,0),(100,1,0),(100,0,1)],[(0,1,2)])
        np.testing.assert_array_equal(second_solar_radiance(self.point,self.normal,self.rho,bvh,np.ones((1,3))*.9,self.openings,self.sun),np.zeros(3))
        floor,colors=self.scene()
        np.testing.assert_array_equal(second_solar_radiance(self.point,self.normal,self.rho,floor,colors,self.openings,Vector((0,-1,0))),np.zeros(3))

if __name__=='__main__':unittest.main()
