from pathlib import Path
from PIL import Image
import numpy as np,json,hashlib,shutil
root=Path(__file__).resolve().parents[1];src=root/'assets/src/polyhaven/oak_veneer_01';out=root/'web/public/assets/v2/lodge-wood';out.mkdir(parents=True,exist_ok=True)
target=json.loads((root/'tools/reports/lodge-dining-gi-v38.json').read_text())['materialReflectance']['plank']
result={'source':'https://polyhaven.com/a/oak_veneer_01','license':'https://polyhaven.com/license','licenseId':'CC0-1.0','author':'Jenelle van Heerden','metres':1.8300000429153442,'giTargetLinear':target,'maps':{}}
for channel,suffix in [('color','diff'),('normal','nor_gl'),('roughness','rough')]:
 p=src/f'oak_veneer_01_{suffix}_2k.jpg';dest=out/p.name;shutil.copy2(p,dest);b=p.read_bytes();result['maps'][channel]={'file':dest.name,'bytes':len(b),'sha256':hashlib.sha256(b).hexdigest()}
 if channel=='color':
  rgb=np.array(Image.open(p).convert('RGB'),dtype=np.float64)/255;linear=np.where(rgb<=.04045,rgb/12.92,((rgb+.055)/1.055)**2.4);mean=linear.mean(axis=(0,1));result['sourceLinearMean']=mean.tolist();result['factor']=(np.array(target)/mean).tolist();result['calibratedLinearMean']=(mean*np.array(result['factor'])).tolist()
p=root/'assets/tex/wood_end.png';dest=out/'wood_end.png';shutil.copy2(p,dest);a=np.array(Image.open(p).convert('RGB'),dtype=np.float64)/255;a=np.where(a<=.04045,a/12.92,((a+.055)/1.055)**2.4);mean=a.mean(axis=(0,1));result['endMean']=mean.tolist();result['endFactor']=(np.array(target)/mean).tolist();result['maps']['end']={'file':dest.name,'bytes':dest.stat().st_size,'sha256':hashlib.sha256(dest.read_bytes()).hexdigest(),'source':'original project tools/paint_textures.py wood_end'}
(root/'web/src/v2/generated/lodge-wood-surfaces-38.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps(result,indent=2))
