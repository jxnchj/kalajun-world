"""Capture current editable hi, without altering it: tools/.bpy/bin/python tools/blender/spruce_far_capture.py [--prototype].
Unlit diffuse colour + alpha and world normals, 5 forms x 8 yaw x 3 elevation.
Root-relative projection is stored, so varying crop rectangles cannot move roots.
"""
from pathlib import Path
import argparse, gzip, hashlib, json, math, time
import bpy
import numpy as np
from PIL import Image
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[2];SRC=ROOT/'assets/src/v2/spruce/schrenk-spruce-hi.blend';D=ROOT/'assets/src/v2/spruce/far-v14';PUB=ROOT/'web/public/assets/v2/spruce/far-v14'
args=argparse.ArgumentParser();args.add_argument('--prototype',action='store_true');args.add_argument('--source',type=Path,default=SRC);args=args.parse_args();SRC=args.source.resolve()
D.mkdir(exist_ok=True);TMP=D/'capture-temp';TMP.mkdir(exist_ok=True)
W,H=128,384;RW,RH=256,768;ELEV=[0,22.5,45];FORMS=['column','edge','old','pencil','young']
bpy.ops.wm.open_mainfile(filepath=str(SRC));s=bpy.context.scene;s.render.engine='CYCLES';s.cycles.device='CPU';s.cycles.samples=8;s.cycles.use_denoising=False;s.cycles.transparent_max_bounces=24;s.render.film_transparent=True;s.render.resolution_x=RW;s.render.resolution_y=RH;s.render.resolution_percentage=100;s.render.threads_mode='FIXED';s.render.threads=4;s.view_settings.view_transform='Standard';s.render.image_settings.file_format='OPEN_EXR';s.render.image_settings.color_mode='RGBA';s.render.image_settings.color_depth='32'
# The diffuse colour pass is independent of lights. Transparent film gives the actual cutout coverage.
s.view_layers[0].use_pass_diffuse_color=True;s.view_layers[0].use_pass_normal=True
ng=bpy.data.node_groups.new('Far spruce unlit capture','CompositorNodeTree');s.compositing_node_group=ng;rl=ng.nodes.new('CompositorNodeRLayers')
for name in ['albedo','normal']:
 sa=ng.nodes.new('CompositorNodeSetAlpha');ng.links.new(rl.outputs['Diffuse Color' if name=='albedo' else 'Normal'],sa.inputs['Image']);ng.links.new(rl.outputs['Alpha'],sa.inputs['Alpha'])
 out=ng.nodes.new('CompositorNodeOutputFile');out.directory=str(TMP);out.file_name=name;out.format.media_type="IMAGE";out.format.file_format='OPEN_EXR';out.format.color_mode='RGBA';out.format.color_depth='32';out.save_as_render=False;out.file_output_items.new('RGBA','pass');ng.links.new(sa.outputs[0],out.inputs[0])
for ob in list(s.objects):
 if ob.type!='MESH':bpy.data.objects.remove(ob,do_unlink=True)
bpy.ops.object.camera_add();cam=bpy.context.object;cam.name='Far capture root-relative camera';cam.data.type='ORTHO';s.camera=cam
meshes=[o for o in s.objects if o.type=='MESH'];allframes=[];arrays=[[],[]];t0=time.perf_counter()
def pixels(name):
 files=sorted(TMP.glob(name+'*.exr'));assert files,name
 im=bpy.data.images.load(str(files[-1]),check_existing=False);p=np.empty(RW*RH*4,dtype=np.float32);im.pixels.foreach_get(p);bpy.data.images.remove(im);return p.reshape(RH,RW,4)
def srgb(x):return np.where(x<=.0031308,x*12.92,1.055*np.maximum(x,0)**(1/2.4)-.055)
def resize_float(p):
 return np.stack([np.asarray(Image.fromarray(p[:,:,i],mode='F').resize((W,H),Image.Resampling.LANCZOS)) for i in range(p.shape[2])],axis=2)
for fi,form in enumerate(FORMS):
 if args.prototype and form!='pencil':continue
 obs=[o for o in meshes if o.get('variant')==form]
 for o in meshes:o.hide_render=o not in obs
 xyz=np.array([list(o.matrix_world@v.co) for o in obs for v in o.data.vertices])
 for ei,edeg in enumerate(ELEV):
  if args.prototype and ei!=1:continue
  e=math.radians(edeg)
  for yi in range(8):
   if args.prototype and yi!=0:continue
   theta=yi*math.tau/8;right=Vector((math.cos(theta),math.sin(theta),0));up=Vector((-math.sin(theta)*math.sin(e),math.cos(theta)*math.sin(e),math.cos(e)));direction=Vector((math.sin(theta)*math.cos(e),-math.cos(theta)*math.cos(e),math.sin(e)))
   xx=xyz@np.array(right);yy=xyz@np.array(up);cx=(xx.min()+xx.max())/2;cy=(yy.min()+yy.max())/2;cam.location=right*cx+up*cy+direction*55;cam.rotation_euler=(-direction).to_track_quat('-Z','Y').to_euler();cam.data.ortho_scale=1;s.view_layers[0].update();corners=cam.data.view_frame(scene=s);fw=max(v.x for v in corners)-min(v.x for v in corners);fh=max(v.y for v in corners)-min(v.y for v in corners);cam.data.ortho_scale=max((xx.max()-xx.min())/fw,(yy.max()-yy.min())/fh)*1.05;fw*=cam.data.ortho_scale;fh*=cam.data.ortho_scale
   s.frame_set(1);bpy.ops.render.render();col=pixels('albedo');norm=pixels('normal');alpha=np.clip(col[:,:,3],0,1);coords=np.argwhere(alpha>.005);assert len(coords)>10
   y0,x0=coords.min(axis=0);y1,x1=coords.max(axis=0)+1;x0=max(0,x0-5);x1=min(RW,x1+5);y0=max(0,y0-5);y1=min(RH,y1+5)
   # Pixels are bottom-up; keep that orientation through raw DataArrayTexture upload.
   crop=col[y0:y1,x0:x1];a=np.clip(resize_float(crop[:,:,3:4]),0,1);rgb=resize_float(crop[:,:,:3]);rgb=rgb/np.maximum(a,.0001)
   # Diffuse Color is premultiplied at AA edges. Clamp only numerical filter ringing.
   rgb=srgb(np.clip(rgb,0,1));rgba=np.concatenate([rgb,a],axis=2);rgba=np.uint8(np.clip(rgba*255+.5,0,255))
   n=resize_float(norm[y0:y1,x0:x1,:3]);n=n/np.maximum(np.linalg.norm(n,axis=2,keepdims=True),.00001);n=n[:,:,[0,2,1]];n[:,:,2]*=-1;nrgba=np.concatenate([n*.5+.5,a],axis=2);nrgba=np.uint8(np.clip(nrgba*255+.5,0,255))
   rect=[cx-fw/2+x0/RW*fw,(cy-fh/2+y0/RH*fh)/math.cos(e),cx-fw/2+x1/RW*fw,(cy-fh/2+y1/RH*fh)/math.cos(e)]
   frame=dict(layer=fi*24+ei*8+yi,form=form,formIndex=fi,yaw=yi*45,elevation=edeg,rect=rect,coverage=float(a.mean()),rootUv=[-rect[0]/(rect[2]-rect[0]),-rect[1]/(rect[3]-rect[1])]);allframes.append(frame);arrays[0].append(rgba);arrays[1].append(nrgba)
   if yi==0 and ei==1 or args.prototype:
    Image.fromarray(np.flipud(rgba)).save(D/f'preview-impostor-{form}-albedo.png');Image.fromarray(np.flipud(nrgba)).save(D/f'preview-impostor-{form}-normal.png')
   print('CAPTURE',form,ei,yi,'coverage',round(float(a.mean()),3),'elapsed',round(time.perf_counter()-t0,1),flush=True)
if args.prototype:
 (D/'prototype-frame.json').write_text(json.dumps(allframes,indent=2));print('PROTOTYPE_COMPLETE',flush=True)
else:
 PUB.mkdir(parents=True,exist_ok=True);files=[]
 for name,data in zip(['albedo','normal'],arrays):
  packed=np.stack(data);alpha=packed[:,:,:,3:4].astype(np.float32)/255.;rgb=packed[:,:,:,:3].astype(np.float32)/255.
  if name=='albedo':
   linear=np.where(rgb<=.04045,rgb/12.92,((rgb+.055)/1.055)**2.4);packed[:,:,:,:3]=np.uint8(np.clip(srgb(linear*alpha)*255+.5,0,255))
  else:packed[:,:,:,:3]=np.uint8(np.clip(((rgb*2-1)*alpha*.5+.5)*255+.5,0,255))
  raw=packed.tobytes();compressed=gzip.compress(raw,compresslevel=9,mtime=0);filename=f'schrenk-far-{name}.rgba.gz';pending=PUB/(filename+'.pending');pending.write_bytes(compressed);pending.replace(PUB/filename);files.append(dict(kind=name,url=filename,bytes=len(compressed),decodedBytes=len(raw),sha256=hashlib.sha256(raw).hexdigest()))
 bounds=[]
 for fi,form in enumerate(FORMS):
  rs=[f['rect'] for f in allframes if f['formIndex']==fi];bounds.append([min(r[0] for r in rs),min(r[1] for r in rs),max(r[2] for r in rs),max(r[3] for r in rs)])
 meta=dict(version=1,source=str(SRC.relative_to(ROOT)),sourceSha256=hashlib.sha256(SRC.read_bytes()).hexdigest(),generator='tools/blender/spruce_far_capture.py',width=W,height=H,layers=120,forms=FORMS,elevations=ELEV,yawCount=8,frames=allframes,formRects=bounds,files=files,encoding='bottom-up RGBA8; albedo sRGB encoded premultiplied linear colour; normals object-local Three x/y/z multiplied by alpha before 0.5 encoding',projection='upright root-relative plane; projected up divided by cos(capture elevation); planar depth approximation',renderSeconds=time.perf_counter()-t0)
 text=json.dumps(meta,indent=2);(D/'impostor-manifest.json').write_text(text);pending=PUB/'impostor-manifest.json.pending';pending.write_text(text);pending.replace(PUB/'impostor-manifest.json');s['captureContract']=meta['projection'];s['captureGenerator']=meta['generator'];bpy.ops.wm.save_as_mainfile(filepath=str(D/'schrenk-spruce-far-capture.blend'));print('ALL_COMPLETE',json.dumps({'seconds':meta['renderSeconds'],'files':files}),flush=True)
