"""Read-only canopy/atlas analysis; writes a report only. No source assets change.
Conservative upper mip chain uses ceil of each RGBA8 2x2 box average.
Every retained grid cell includes every bilinear-support texel at every mip.
Convex envelope encloses this full multi-mip union inside each authored UV patch.
Actual driver mip audit is still required before production adoption.
"""
from pathlib import Path
import json,gzip,hashlib,time,io,struct
import numpy as np
from PIL import Image
ROOT=Path(__file__).resolve().parent.parent
START=time.perf_counter()
manifest=json.loads((ROOT/'web/public/assets/v2/spruce-canopy-v1.json').read_text())
raw=gzip.decompress((ROOT/'web/public/assets/v2'/manifest['payload']['file']).read_bytes())
atlas=np.asarray(Image.open(ROOT/'assets/tex/spruce_atlas.png').convert('RGBA'))
source_materials=[]
for lod in ['hi','mid']:
 blob=(ROOT/f'web/public/assets/v2/schrenk-spruce-{lod}.glb').read_bytes();length=struct.unpack_from('<I',blob,12)[0];gltf=json.loads(blob[20:20+length]);binary=blob[28+length:]
 for material in gltf['materials']:
  if material.get('alphaMode')!='MASK':continue
  assert abs(material['alphaCutoff']-.45)<1e-6
  mapref=material['pbrMetallicRoughness']['baseColorTexture'];assert not mapref.get('extensions');assert mapref.get('texCoord',0)==0
  texture=gltf['textures'][mapref['index']];image=gltf['images'][texture['source']];view=gltf['bufferViews'][image['bufferView']];start=view.get('byteOffset',0)
  pixels=np.asarray(Image.open(io.BytesIO(binary[start:start+view['byteLength']])).convert('RGBA'));assert np.array_equal(pixels,atlas),f'{lod} actual albedo differs from assessed atlas'
  source_materials.append({'lod':lod,'name':material['name'],'sampler':gltf.get('samplers',[{}])[texture.get('sampler',0)],'alphaCutoff':material['alphaCutoff'],'baseColorFactor':material['pbrMetallicRoughness'].get('baseColorFactor',[1,1,1,1])})
alpha=atlas[:,:,3].astype(np.float64)
levels=[];a=alpha
while True:
 levels.append(a)
 h,w=a.shape
 if h==1 and w==1:break
 # Repeated ceil bounds ideal and each-stage round-to-nearest chains.
 a=np.ceil(a.reshape(max(1,h//2),min(2,h),max(1,w//2),min(2,w)).mean(axis=(1,3)))
patches=json.loads((ROOT/'assets/tex/spruce_atlas.json').read_text())
def array(d):return np.frombuffer(raw,dtype={'Float32Array':'<f4','Uint16Array':'<u2','Uint32Array':'<u4'}[d['type']],count=d['length'],offset=d['byteOffset']).reshape(-1,d['itemSize'])
def cross(a,b,c):return (b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0])
def hull(points):
 points=sorted(set(tuple(map(float,p)) for p in points));lower=[];upper=[]
 for p in points:
  while len(lower)>=2 and cross(lower[-2],lower[-1],p)<=1e-15:lower.pop()
  lower.append(p)
 for p in points[::-1]:
  while len(upper)>=2 and cross(upper[-2],upper[-1],p)<=1e-15:upper.pop()
  upper.append(p)
 return lower[:-1]+upper[:-1]
def clip(poly,domain):
 for q in range(len(domain)):
  a,b=domain[q],domain[(q+1)%len(domain)];out=[]
  for j in range(len(poly)):
   p,n=poly[j],poly[(j+1)%len(poly)];dp,dn=cross(a,b,p),cross(a,b,n)
   if dp>=-1e-13:out.append(p)
   if (dp<0)!=(dn<0):out.append(p+(n-p)*(dp/(dp-dn)))
  poly=out
  if len(poly)<3:return []
 # Adjacent duplicate corners otherwise inflate the fan triangle estimate.
 clean=[]
 for p in poly:
  if not clean or np.linalg.norm(p-clean[-1])>1e-10:clean.append(p)
 if len(clean)>1 and np.linalg.norm(clean[0]-clean[-1])<=1e-10:clean.pop()
 return clean if len(clean)>=3 else []
def area(poly):return abs(sum(cross(poly[0],poly[i],poly[i+1]) for i in range(1,len(poly)-1)))/2 if len(poly)>=3 else 0
def domain_for(patch,res,nonconvex=False):
 u0,v0,u1,v1=patch;nx=res;ny=res*2
 xs=np.linspace(u0,u1,nx+1);ys=np.linspace(v0,v1,ny+1);upper=np.zeros((ny,nx));maxima=[]
 for level in levels:
  h,w=level.shape;row=np.empty((h,nx))
  for x in range(nx):
   ix=np.arange(int(np.floor(xs[x]*w-.5)),int(np.floor(xs[x+1]*w-.5))+2)%w;row[:,x]=level[:,ix].max(axis=1)
  bound=np.empty((ny,nx))
  for y in range(ny):
   iy=np.arange(int(np.floor(ys[y]*h-.5)),int(np.floor(ys[y+1]*h-.5))+2)%h;bound[y]=row[iy].max(axis=0)
  upper=np.maximum(upper,bound);maxima.append(float(level.max()/255))
 valid=upper>=.45*255;yy,xx=np.nonzero(valid);pts=[]
 for y,x in zip(yy,xx):pts.extend([(xs[x],ys[y]),(xs[x+1],ys[y]),(xs[x],ys[y+1]),(xs[x+1],ys[y+1])])
 domain=hull(pts)
 # Exact union of retained grid cells, merging only identical horizontal runs
 # across adjacent rows. This keeps every island without filling interior gaps.
 rectangles=[];active={}
 for y in range(ny+1):
  runs=[]
  if y<ny:
   x=0
   while x<nx:
    if not valid[y,x]:x+=1;continue
    start=x
    while x<nx and valid[y,x]:x+=1
    runs.append((start,x))
  now=set(runs)
  for run in list(active):
   if run not in now:
    start=active.pop(run);x0,x1=run;rectangles.append([(xs[x0],ys[start]),(xs[x1],ys[start]),(xs[x1],ys[y]),(xs[x0],ys[y])])
  for run in runs:active.setdefault(run,y)
 return (rectangles if nonconvex else [domain]),{'grid':[nx,ny],'retainedCells':int(valid.sum()),'cellFraction':float(valid.mean()),'hullVertices':len(domain),'hullAreaFraction':area(domain)/((u1-u0)*(v1-v0)),'mipMaxAlpha':maxima,'rectangles':len(rectangles)}
def coeff(position,wind):
 H=np.clip(position[:,1],0,20)**2*.0014;wx,wy,wz=wind.T;a=.48*wx;b=1-a
 return np.column_stack((b*(1.32*H-.12*wy),(1.32*a-.32)*H+b*.12*wy,.018*wy*np.cos(wz),.018*wy*np.sin(wz),.018*wy))
report={'atlas':{'width':int(alpha.shape[1]),'height':int(alpha.shape[0]),'mips':len(levels),'sha256':hashlib.sha256((ROOT/'assets/tex/spruce_atlas.png').read_bytes()).hexdigest()},'sourceMaterials':source_materials,'canopyPayload':manifest['payload'],'alphaCutoff':.45,'mipContract':'ceil upper bound of each RGBA8 2x2 box-average mip; all bilinear supports; trilinear is convex mixture; actual GPU-generated mip chain must be audited before adoption','interpretation':'Strict whole-triangle rejection preserves every original vertex. Split-envelope clipping preserves static affine interpolation but recomputes nonlinear vertex wind/normal; displacement upper bound is reported separately. Convex envelope preserves all islands and interior transparent gaps; it is not a hole triangulation.','variants':[]}
parts={}
for name,p in manifest['parts'].items():
 uv=array(p['attributes']['uv']);ix=array(p['index']).reshape(-1,3);pos=array(p['attributes']['position']);wind=array(p['attributes']['_plant_wind']);tris=uv[ix].astype(float)
 uv_unique,inverse=np.unique(tris.reshape(-1,6),axis=0,return_inverse=True)
 world_area=np.linalg.norm(np.cross(pos[ix[:,1]]-pos[ix[:,0]],pos[ix[:,2]]-pos[ix[:,0]]),axis=1)/2
 parts[name]=(uv_unique.reshape(-1,3,2),inverse,world_area,pos,wind,ix)
for res,nonconvex in [(8,False),(16,False),(32,False),(64,False),(64,True)]:
 domains={};descriptions={}
 for kind in ['branch','top']:domains[kind],descriptions[kind]=domain_for(patches[kind],res,nonconvex)
 variant={'resolution':res,'domainMode':'all-islands-grid-union' if nonconvex else 'convex-envelope','domains':domains,'domainStats':descriptions,'parts':[],'trianglesBefore':0,'trianglesAfter':0,'wholeTrianglesRemovable':0,'areaBefore':0.,'areaAfter':0.,'maxLocalWindErrorBoundM':0.}
 for name,(uni,inv,world_area,pos,wind,ix) in parts.items():
  ratios=[];counts=[];barys=[]
  for uv in uni:
   kind='branch' if uv[:,0].mean()<.5 else 'top';polys=[clip([v.copy() for v in uv],domain) for domain in domains[kind]];polys=[poly for poly in polys if area(poly)>1e-14];old=area(uv);new=sum(area(poly) for poly in polys)
   if old<1e-15:polys=[[v.copy() for v in uv]];new=old;ratio=1.
   else:ratio=min(1.,new/old)
   if new<1e-14 and old>=1e-15:polys=[];ratio=0.
   ratios.append(ratio);counts.append(sum(max(0,len(poly)-2) for poly in polys));bary=[]
   if polys and old>=1e-15:
    basis=np.column_stack((uv[1]-uv[0],uv[2]-uv[0]));uvInv=np.linalg.inv(basis)
    for poly in polys:
     for p in poly:
      v=uvInv@(p-uv[0]);weights=np.array([1-v.sum(),*v]);
      if np.max(weights)<1-1e-8:bary.append(weights)
   barys.append(bary)
  ratios=np.asarray(ratios);counts=np.asarray(counts);before=len(inv);after=int(counts[inv].sum());removed=int((counts[inv]==0).sum());beforeArea=float(world_area.sum());afterArea=float((world_area*ratios[inv]).sum())
  maximum=0.;newVertices=0
  for index,bary in enumerate(barys):
   if not bary:continue
   selected=np.nonzero(inv==index)[0];corners=ix[selected];P=pos[corners].astype(float);W=wind[corners].astype(float);C=coeff(P.reshape(-1,3),W.reshape(-1,3)).reshape(-1,3,5)
   for b in bary:
    p=(P*b[None,:,None]).sum(axis=1);w=(W*b[None,:,None]).sum(axis=1);old=(C*b[None,:,None]).sum(axis=1);delta=coeff(p,w)-old
    # Fields r/g independently [0,1], arbitrary sin/cos phase, eddy [-.5,.5].
    along=np.maximum.reduce([np.abs(delta[:,0]),np.abs(delta[:,1]),np.abs(delta[:,0]+delta[:,1])])+np.hypot(delta[:,2],delta[:,3]);across=.5*np.abs(delta[:,4]);maximum=max(maximum,float(np.hypot(along,across).max()));newVertices+=len(selected)
  row={'part':name,'uniqueUVTriangles':len(uni),'trianglesBefore':before,'trianglesAfter':after,'wholeTrianglesRemovable':removed,'areaBefore':beforeArea,'areaAfter':afterArea,'areaRemovedFraction':1-afterArea/beforeArea,'triangleRatio':after/before,'newClipVerticesBeforeWeld':newVertices,'maxLocalWindErrorBoundM':maximum}
  variant['parts'].append(row)
  for k in ['trianglesBefore','trianglesAfter','wholeTrianglesRemovable','areaBefore','areaAfter']:variant[k]+=row[k]
  variant['maxLocalWindErrorBoundM']=max(variant['maxLocalWindErrorBoundM'],maximum)
 variant['areaRemovedFraction']=1-variant['areaAfter']/variant['areaBefore'];variant['triangleRatio']=variant['trianglesAfter']/variant['trianglesBefore'];report['variants'].append(variant)
 print(json.dumps({k:v for k,v in variant.items() if k not in ['domains','domainStats','parts']}),flush=True)
report['elapsedSeconds']=time.perf_counter()-START
out=ROOT/'tools/reports/crown-alpha-domain-v38.json';out.write_text(json.dumps(report,indent=2));print(str(out),flush=True)
