from pathlib import Path
import json,struct,io
import numpy as np
from PIL import Image
R=Path(__file__).resolve().parents[1];D=R/'assets/src/v2/settlements/lodge-chairs-v38';p=D/'lodge-chairs-complete.glb';raw=p.read_bytes();n=struct.unpack_from('<I',raw,12)[0];j=json.loads(raw[20:20+n]);b=raw[28+n:];meta=json.loads((D/'complete-metadata.json').read_text())
for m in j['materials']:
 if m['name'] not in meta['newMaterials']:continue
 pbr=m.get('pbrMetallicRoughness',{});factor=np.array(pbr.get('baseColorFactor',[1,1,1,1])[:3]);mean=np.ones(3)
 if 'baseColorTexture' in pbr:
  tex=j['textures'][pbr['baseColorTexture']['index']];image=j['images'][tex['source']];view=j['bufferViews'][image['bufferView']];pixels=np.asarray(Image.open(io.BytesIO(b[view.get('byteOffset',0):view.get('byteOffset',0)+view['byteLength']])).convert('RGB'),dtype=float)/255;mean=np.where(pixels<=.04045,pixels/12.92,((pixels+.055)/1.055)**2.4).mean(axis=(0,1))
 effective=(mean*factor*(1-pbr.get('metallicFactor',1))).tolist();meta['newMaterials'][m['name']]['diffuseReflectance']=effective;meta['newMaterials'][m['name']]['measurement']='Actual embedded baseColor image decoded sRGB to linear, times exported factor*(1-metallic); not factor alone';meta['materialReflectance'][m['name']]=effective
(D/'complete-metadata.json').write_text(json.dumps(meta,indent=2)+'\n');print(json.dumps(meta['newMaterials'],indent=2))
