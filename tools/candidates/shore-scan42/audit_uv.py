from pathlib import Path
import bpy,json,numpy as np
from PIL import Image,ImageDraw
R=Path.cwd();j=json.loads((R/'assets/src/polyhaven/rock_07/rock_07_1k.gltf').read_text());b=(R/'assets/src/polyhaven/rock_07/rock_07.bin').read_bytes();p=j['meshes'][0]['primitives'][0]
def arr(i):
 a=j['accessors'][i];v=j['bufferViews'][a['bufferView']];n={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4}[a['type']];d={5126:'<f4',5123:'<u2',5125:'<u4'}[a['componentType']];return np.frombuffer(b,d,count=a['count']*n,offset=v.get('byteOffset',0)+a.get('byteOffset',0)).reshape(-1,n)
srcUV=arr(p['attributes']['TEXCOORD_0']);srcP=arr(p['attributes']['POSITION']);srcI=arr(p['indices']).reshape(-1,3)
r=json.loads((R/'web/src/v2/shore-rock-data.js').read_text().split('export const shoreScan=')[1].rstrip(';\n'));uv=np.array(r['uv']).reshape(-1,2);idx=np.array(r['index']).reshape(-1,3)
def mask(uv,idx):
 im=Image.new('1',(1024,1024));d=ImageDraw.Draw(im)
 for tri in idx:d.polygon([tuple(x) for x in uv[tri]*1023],fill=1)
 return np.array(im)
s=mask(srcUV,srcI);t=mask(uv,idx);flipped=uv.copy();flipped[:,1]=1-flipped[:,1];f=mask(flipped,idx)
bpy.ops.wm.read_factory_settings(use_empty=True);bpy.ops.import_scene.gltf(filepath=str(R/'assets/src/polyhaven/rock_07/rock_07_1k.gltf'));o=[o for o in bpy.context.scene.objects if o.type=='MESH'][0];m=o.data
# Original position/UV pairs are quantized only for matching import vertex order.
source=set(tuple(round(float(x),5) for x in np.r_[srcP[i],srcUV[i]]) for i in range(len(srcP)))
miss=0;total=0
for l in m.loops:
 v=m.vertices[l.vertex_index].co;u=m.uv_layers.active.data[l.index].uv;k=tuple(round(float(x),5) for x in [v.x,v.z,-v.y,u.x,1-u.y]);total+=1;miss+=k not in source
res={'sourceTriangles':len(srcI),'runtimeTriangles':len(idx),'originalGltfBlenderPositionUVPairMismatch':miss,'originalLoops':total,'runtimeUVRasterPixels':int(t.sum()),'outsideSourcePixels':int((t&~s).sum()),'flippedRuntimeUVRasterPixels':int(f.sum()),'flippedOutsideSourcePixels':int((f&~s).sum()),'sourceUVRasterPixels':int(s.sum())};print(json.dumps(res,indent=2));(R/'tools/candidates/shore-scan42/uv-audit.json').write_text(json.dumps(res,indent=2))
l=m.loops[0];v=m.vertices[l.vertex_index].co;u=m.uv_layers.active.data[l.index].uv
print('first imported',list(v),list(u),'first source',srcP[:3].tolist(),srcUV[:3].tolist(),'object',list(o.matrix_world))
