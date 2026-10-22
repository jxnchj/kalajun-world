import math,unittest
import numpy as np
import bpy
from mathutils import Vector
from mathutils.bvhtree import BVHTree
from v2_room_second_bounce import cosine_directions,second_radiance,positive_half_sh,SKY
from v2_room_bounce import aperture_samples

class RoomSecondBounceTest(unittest.TestCase):
    def scene(self,blocked=False):
        v=[(-4,0,-4),(4,0,-4),(4,0,4),(-4,0,4)]
        f=[(0,1,2,3)];colors=[(.55,.32,.15)]
        if blocked:
            v.extend([(-4,-1,1),(4,-1,1),(4,4,1),(-4,4,1)]);f.append((4,5,6,7));colors.append((.55,.32,.15))
        return BVHTree.FromPolygons([Vector(p)for p in v],f),np.array(colors)
    def test_cosine_quadrature_stays_in_surface_hemisphere_and_retains_energy_weight(self):
        n=Vector((.2,.3,1)).normalized();directions=list(cosine_directions(n,2048))
        self.assertTrue(all(abs(d.length-1)<1e-6 and d.dot(n)>0 for d in directions))
        self.assertAlmostEqual(sum(d.dot(n)for d in directions)/len(directions),2/3,places=4)
    def test_second_reflection_uses_material_colour_and_actual_window_visibility(self):
        openings=aperture_samples({'openings':[{'kind':'window','center':[0,1.5,2],'normal':[0,0,1],'width':2,'height':2}]})
        p,n=Vector((0,1,-1)),Vector((0,0,1));bvh,albedos=self.scene();rho=np.array([.65,.65,.65])
        value=second_radiance(p,n,rho,bvh,albedos,openings,samples=256)
        self.assertTrue(np.all(value>0));self.assertGreater(value[0]/SKY[0],value[2]/SKY[2])
        self.assertTrue(np.all(value<=rho*np.max(albedos,axis=0)*SKY))
        np.testing.assert_allclose(second_radiance(p,n,rho,bvh,albedos*.5,openings,samples=256),value*.5,rtol=1e-6)
        np.testing.assert_allclose(second_radiance(p,n,rho*.5,bvh,albedos,openings,samples=256),value*.5,rtol=1e-6)
        np.testing.assert_array_equal(second_radiance(p,n,rho,bvh,albedos*0,openings,samples=256),np.zeros(3))
        blocked,colors=self.scene(True)
        np.testing.assert_array_equal(second_radiance(p,n,rho,blocked,colors,openings,samples=256),np.zeros(3))
    def test_half_float_projection_never_subtracts_old_light_through_negative_sh_ringing(self):
        data=np.zeros((4,1,1,1,4),np.float32);data[:,:,:,:,3]=1
        data[0,0,0,0,:3]=[.25,.05,.0000001];data[1,0,0,0,:3]=[.6,-.3,.0000003]
        half=positive_half_sh(data).astype(np.float32)
        np.testing.assert_array_equal(half[0],data.astype('<f2').astype(np.float32)[0])
        self.assertTrue(np.all(np.linalg.norm(half[1:,:,:,:,:3],axis=0)<=half[0,:,:,:,:3]))
        self.assertGreater(half[1,0,0,0,0],0);self.assertLess(half[1,0,0,0,1],0)
    def test_open_escape_is_not_recounted_as_direct_sky_or_first_bounce(self):
        bvh=BVHTree.FromPolygons([Vector((100,0,0)),Vector((100,1,0)),Vector((100,0,1))],[(0,1,2)])
        apertures=aperture_samples({'openings':[{'kind':'window','center':[0,1,2],'normal':[0,0,1],'width':2,'height':2}]})
        np.testing.assert_array_equal(second_radiance(Vector((0,0,0)),Vector((0,1,0)),np.ones(3)*.9,bvh,np.ones((1,3))*.9,apertures),np.zeros(3))

if __name__=='__main__':unittest.main()
