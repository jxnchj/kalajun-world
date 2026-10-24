from PIL import Image,ImageDraw
import numpy as np,json
from pathlib import Path
base=Path('docs/previews/v2-route-craft-38');a=np.array(Image.open(base/'hdr-fixed-forest-packed-baseline.png'))[:,:,:3];b=np.array(Image.open(base/'hdr-fixed-forest-packed-candidate.png'))[:,:,:3];delta=b.astype(int)-a.astype(int);d=np.abs(delta);m=d.max(2);h,w=m.shape
# Approximate manually identified image regions, not object-ID masks.
regions={'all':(0,0,w,h),'upper_tree_sky':(0,0,w,340),'water_near_interior':(30,600,130,650),'water_mid_interior':(320,490,350,515),'dry_right_meadow':(780,400,1100,650),'foreground_rock':(460,680,670,780),'sky_gap':(420,20,480,65)}
summary={'scope':'offline actual PNG pair; region labels are rectangular image ROIs, not object-ID masks','channelHistogram':np.bincount(d.ravel(),minlength=22).tolist(),'channelSignedMean':delta.mean((0,1)).tolist(),'channelAbsMean':d.mean((0,1)).tolist(),'channelMax':d.max((0,1)).tolist(),'pixelMaxPercentiles':{str(q):float(np.percentile(m,q))for q in[50,90,95,99,99.9,100]},'regions':{}}
for name,(x0,y0,x1,y1)in regions.items():
 q=d[y0:y1,x0:x1];summary['regions'][name]={'rect':[x0,y0,x1,y1],'pixels':int(q.shape[0]*q.shape[1]),'mean':float(q.mean()),'max':int(q.max()),'channelsAbove1':int((q>1).sum()),'pixelsAbove4':int((q.max(2)>4).sum())}
y,x,c=np.unravel_index(d.argmax(),d.shape);summary['maxPixel']={'xy':[int(x),int(y)],'baseline':a[y,x].tolist(),'candidate':b[y,x].tolist()}
# Nonoverlapping largest-error crop windows.
work=m.copy();boxes=[]
for i in range(4):
 y,x=np.unravel_index(work.argmax(),work.shape);x0=max(0,min(w-128,x-64));y0=max(0,min(h-96,y-48));boxes.append((x0,y0,x0+128,y0+96));work[max(0,y0-48):min(h,y0+144),max(0,x0-64):min(w,x0+192)]=0
summary['cropBoxes']=boxes
sheet=Image.new('RGB',(768,4*218),(26,30,27));draw=ImageDraw.Draw(sheet)
for i,box in enumerate(boxes):
 x0,y0,x1,y1=box;panels=[Image.fromarray(a).crop(box),Image.fromarray(b).crop(box),Image.fromarray(np.minimum(d*12,255).astype('uint8')).crop(box)]
 for j,img in enumerate(panels):sheet.paste(img.resize((256,192),Image.Resampling.NEAREST),(j*256,i*218+26));draw.text((j*256+4,i*218+5),['RGBA16F','R11G11B10','abs error x12'][j]+f' ({x0},{y0})',fill='white')
sheet.save(base/'hdr-fixed-forest-error-crops.png')
heat=np.zeros((h,w,3),dtype=np.uint8);heat[:,:,0]=np.minimum(m*20,255);heat[:,:,1]=np.minimum(m*3,255);Image.fromarray(heat).save(base/'hdr-fixed-forest-error-map.png')
controla=np.array(Image.open(base/'hdr-fixed-forest-rgba-baseline.png'));controlb=np.array(Image.open(base/'hdr-fixed-forest-rgba-candidate.png'));summary['rgbaControlMax']=int(np.abs(controla.astype(int)-controlb.astype(int)).max())
(base/'hdr-fixed-forest-error-analysis.json').write_text(json.dumps(summary,indent=2,default=int));print(json.dumps(summary,indent=2,default=int))
