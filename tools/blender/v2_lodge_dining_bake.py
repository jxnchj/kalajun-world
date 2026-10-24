"""Read-only original GLB -> editable derived Blend -> actual dining static two-order transfer.
Six exterior dining apertures only; east hall sources and movable-door paths are not claimed.
"""
import bpy,json,hashlib,time,subprocess,base64,struct
from mathutils import Matrix,Quaternion,Vector
import v2_room_bounce as bounce_module
import v2_room_contact as contact_module
import numpy as np
from pathlib import Path
from v2_room_bounce import ROOT,geometry,bake as sky_bake
from v2_room_second_bounce import bake as sky2_bake
from v2_room_transport import bake as sun_bake
from v2_room_second_solar import bake as sun2_bake
from v2_room_aperture_visibility import bake as aperture_bake
from v2_room_contact import geometry as contact_geometry,bake as contact_bake
GLB=ROOT/'web/public/assets/gh_lanchuan_lodge.glb'
SOURCE=ROOT/'assets/src/v2/settlements/lanchuan-lodge-dining-v38.blend'
OUT=ROOT/'web/src/v2/lodge-room-data.js'
KEY='gh_lanchuan_lodge-dining'
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
start=time.monotonic();original=sha(GLB)
a=json.loads(subprocess.check_output(['node','--input-type=module','-e',"import{LODGE_DINING_ASSET as a}from'./src/v2/lodge-opening.js';console.log(JSON.stringify(a))"],cwd=ROOT/'web',text=True));a['probeSize']=[17,5,13]
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(GLB),merge_vertices=False)
meshes=[o for o in bpy.context.scene.objects if o.type=='MESH'];triangles=0
for o in meshes:o.data.calc_loop_triangles();triangles+=len(o.data.loop_triangles)
assert triangles==40552,(triangles,'original complete GLB must be retained')
# Preserve the exact loaded geometry/materials as a new editable source; never rerun the old generator.
bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE),compress=True)
# Imported glTF materials contain vertex-AO Mix nodes. Recover PBR albedo from
# the original declared material and image, not the Mix socket's white default.
raw=GLB.read_bytes();json_size=struct.unpack_from('<I',raw,12)[0];gltf=json.loads(raw[20:20+json_size]);bin_start=20+json_size+8
materials={m['name']:m for m in gltf['materials']}
material_colors={}
def source_reflectance(m):
    if m is None:return np.array([.3,.3,.3]),False
    record=materials[m.name];pbr=record.get('pbrMetallicRoughness',{});factor=np.array(pbr.get('baseColorFactor',[1,1,1,1]),dtype=float);color=factor[:3].copy()
    if m.name=='glass':return np.zeros(3),True
    if 'baseColorTexture' in pbr:
        images=[n.image for n in m.node_tree.nodes if n.type=='TEX_IMAGE' and n.image]
        assert len(images)==1,(m.name,'ambiguous albedo image')
        im=images[0];pixels=np.array(im.pixels[:],dtype=np.float32).reshape(-1,4)[::16,:3]
        if im.colorspace_settings.name=='sRGB':pixels=np.where(pixels<=.04045,pixels/12.92,((pixels+.055)/1.055)**2.4)
        color*=pixels.mean(axis=0)
    color=np.clip(color*(1-pbr.get('metallicFactor',1)),0,.9)
    material_colors[m.name]=color.tolist();return color,False
bounce_module.material_reflectance=source_reflectance
contact_module.material_reflectance=source_reflectance
# Independent original accessor decode checks every triangle after axis/world
# transforms, including furniture and the untouched authored door pose.
def accessor(i):
    a=gltf['accessors'][i];v=gltf['bufferViews'][a['bufferView']];dtype={5126:'<f4',5125:'<u4',5123:'<u2',5121:'u1'}[a['componentType']];width={'SCALAR':1,'VEC3':3}[a['type']]
    stride=v.get('byteStride',np.dtype(dtype).itemsize*width)
    return np.ndarray((a['count'],width),dtype=dtype,buffer=raw,offset=bin_start+v.get('byteOffset',0)+a.get('byteOffset',0),strides=(stride,np.dtype(dtype).itemsize)).copy()
def canonical(a):
    a=np.asarray(a).reshape(-1,3,3);a=np.array([row[np.lexsort((row[:,2],row[:,1],row[:,0]))].reshape(9)for row in a]);return a[np.lexsort(tuple(a[:,i]for i in range(8,-1,-1)))]
max_error=0.;checked=0
parents={child:i for i,n in enumerate(gltf['nodes'])for child in n.get('children',[])}
def matrix(i):
    n=gltf['nodes'][i]
    if 'matrix'in n:m=Matrix(np.array(n['matrix']).reshape(4,4).T.tolist())
    else:
        q=n.get('rotation',[0,0,0,1]);m=Matrix.LocRotScale(Vector(n.get('translation',[0,0,0])),Quaternion((q[3],*q[:3])),Vector(n.get('scale',[1,1,1])))
    return matrix(parents[i])@m if i in parents else m
for i,n in enumerate(gltf['nodes']):
    if 'mesh'not in n:continue
    obj=bpy.data.objects[n['name']];expected=[]
    for primitive in gltf['meshes'][n['mesh']]['primitives']:
        positions=accessor(primitive['attributes']['POSITION']);indices=accessor(primitive['indices']).reshape(-1)
        expected.extend([tuple(matrix(i)@Vector(p))for p in positions[indices]])
    actual=[]
    for tri in obj.data.loop_triangles:
        for index in tri.vertices:
            p=obj.matrix_world@obj.data.vertices[index].co;actual.append((p.x,p.z,-p.y))
    assert len(actual)==len(expected),(n['name'],'triangle count')
    e=canonical(expected);a2=canonical(actual)
    error=float(np.max(abs(e-a2)));assert error<2e-5,(n['name'],error)
    max_error=max(max_error,error);checked+=len(actual)//3
assert checked==triangles

bvh,colors,names=geometry();assert len(colors)>0
print(json.dumps({'stage':'import','triangles':triangles,'meshes':len(meshes),'seconds':time.monotonic()-start}),flush=True)
first=sky_bake(KEY,a,bvh,colors,SOURCE,GLB)
result={'key':KEY,'model':'six dining external openings; source furniture; static diffuse sky/solar orders 1 and 2; not complete building GI','sky':first}
result['secondSky']=sky2_bake(KEY,a,first,bvh,colors,SOURCE,GLB)
result['solar']=sun_bake(KEY,a,first,bvh,colors,SOURCE,GLB)
result['secondSolar']=sun2_bake(KEY,a,first,bvh,colors,SOURCE,GLB)
result['apertures']=aperture_bake(KEY,first,bvh)
result['contact']=contact_bake(KEY,a,SOURCE,GLB,contact_geometry())
assert sha(GLB)==original
OUT.write_text('// Generated by v2_lodge_dining_bake.py from untouched original GLB.\nexport default '+json.dumps(result,separators=(',',':'))+';\n')
report={'key':KEY,'sourceSHA256':original,'blendSHA256':sha(SOURCE),'sourceGLBUnchanged':True,'triangles':triangles,'geometryCheckedTriangles':checked,'maximumCoordinateError':max_error,'materialReflectance':material_colors,'meshes':len(meshes),'probeSize':first['size'],'validProbes':first['validProbes'],'moduleBytes':OUT.stat().st_size,'seconds':time.monotonic()-start,'apertures':result['apertures']['summary'],'contact':{k:v for k,v in result['contact'].items()if k!='data'},'sunOrders':[{k:r[k]for k in ('bounceOrder','directionMax','seconds')if k in r}for r in (result['solar'],result['secondSolar'])]}
(ROOT/'tools/reports/lodge-dining-gi-v38.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps(report),flush=True)
