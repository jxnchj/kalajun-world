import {refreshPlantBounds,MEADOW} from './ecology.js';
import {getMeadowLandform} from './meadow-surface.js';
import {getShoreStoneField} from './shore-contact.js';
export const MEADOW_LAYOUT_PATCH42=Object.freeze({x:-1936,z:3376,half:32,fade:10,maxShift:2});
const smooth=x=>{x=Math.max(0,Math.min(1,x));return x*x*(3-2*x);};
// One fixed art patch, authored in contour-relative metres. Not a new habitat
// claim or distance LOD. Original IDs, sizes, leaf geometry and rotation survive.
export function createMeadowLayoutPatch42(ecology,{patch=MEADOW_LAYOUT_PATCH42,accept,landform}={}){
 const world=ecology.world,field=landform??getMeadowLandform(world),normal=world.surface.normalAt(patch.x,patch.z,2),length=Math.hypot(normal.x,normal.z);
 // At a level site there is no justified contour orientation: keep roots still.
 const ux=length>1e-5?-normal.z/length:0,uz=length>1e-5?normal.x/length:0,vx=-uz,vz=ux;
 const roots=new Map(),stats={sources:0,moved:0,rejected:0,protected:0,maxShift:0,enabled:false,scope:'64m ordinary-meadow art layout; not a 320m LOD repair'};
 const inside=root=>Math.abs(root.x-patch.x)<patch.half&&Math.abs(root.z-patch.z)<patch.half;
 function map(root){
  if(!inside(root)||root.brookAsset||root.brookShoulder||root.shoreMove||root.thresholdMove||root.boardwalkMove||root.pastureLifeMove||root.forestReachMove)return root;
  const old=roots.get(root.id);if(old){if(old.source.x!==root.x||old.source.z!==root.z||old.source.y!==root.y||old.source.s!==root.s||old.source.sy!==root.sy||old.source.rot!==root.rot)throw Error('Meadow patch source changed: '+root.id);return old.result;}
  stats.sources++;let result=root;
  if(length>1e-5){
   const dx=root.x-patch.x,dz=root.z-patch.z,a=dx*ux+dz*uz,b=dx*vx+dz*vz;
   const community=[0,0,0,0];field.response(root.x,root.z,{},[1,1,1,0],community);
   // Three unequal, interrupted lobes. No sinusoidal rows or independent noise.
   let da=0,db=0;for(const [cx,cz,rx,rz]of [[-15,-9,11,5],[9,8,14,7],[0,-21,8,4]]){
    const ax=a-cx,bz=b-cz,q=ax*ax/(rx*rx)+bz*bz/(rz*rz),weight=Math.exp(-q*.5);
    da-=ax/rx*weight;db-=bz/rz*weight;
   }
   const fade=smooth((patch.half-Math.max(Math.abs(dx),Math.abs(dz)))/patch.fade),strength=patch.maxShift*fade*(.65+.35*Math.min(1,community[1]+community[2])),scale=Math.max(1,Math.hypot(da,db));
   const x=root.x+(da*ux+db*vx)/scale*strength,z=root.z+(da*uz+db*vz)/scale*strength;
   const candidate={...root,x,z,y:world.surface.heightAt(x,z)+(root.y-world.surface.heightAt(root.x,root.z))};
   if(!Number.isFinite(candidate.y)||!inside(candidate)||accept&&!accept(candidate,root))stats.rejected++;
   else if(Math.hypot(x-root.x,z-root.z)>.001){result=candidate;stats.moved++;stats.maxShift=Math.max(stats.maxShift,Math.hypot(x-root.x,z-root.z));}
  }else stats.protected++;
  roots.set(root.id,{source:root,result});return result;
 }
 return {map,inside,stats,roots,patch};
}
export function installMeadowLayoutPatch42(app){
 const d=app.debug??app,e=d.ecology,cluster=d.meadowCluster,camera=d.camera;
 if(!e?.generateGrassTileRoots||!e.grassTiles||!camera||!d.environment)throw Error('Loaded meadow owners required');
 if(e.generateGrassTileRoots.meadowLayoutPatch42)throw Error('Meadow patch already installed');
 const envelope=e.shoreGrassEnvelope;
 if(!envelope||!e.thresholdPlants||!e.boardwalkPlantContact39||!e.pasturePlantContact41)throw Error('Complete existing plant contact owners required');
 const world=e.world,stones=getShoreStoneField(world),descriptor=Object.getOwnPropertyDescriptor(e,'generateGrassTileRoots'),original=e.generateGrassTileRoots;
 const accept=(p,source)=>{
  const radius=envelope.radius*p.s;
  if(!Number.isFinite(radius)||world.surface.normalAt(p.x,p.z,2).y<.72||e.excluded(p.x,p.z,radius)||world.hydrology.isExcluded(p.x,p.z,radius))return false;
  const cover=world.landcoverAt(p.x,p.z),oldCover=world.landcoverAt(source.x,source.z);if(cover.b>.12||Math.abs(cover.r-oldCover.r)>.25||Math.abs(cover.g-oldCover.g)>.35)return false;
  // Original route segments with the full swept footprint, not a new path.
  for(let z=Math.floor((p.z-radius)/64);z<=Math.floor((p.z+radius)/64);z++)for(let x=Math.floor((p.x-radius)/64);x<=Math.floor((p.x+radius)/64);x++)for(const route of e.routeBins.get(x+','+z)||[]){
   const dx=route.b[0]-route.a[0],dz=route.b[1]-route.a[1],len=dx*dx+dz*dz,t=len?Math.max(0,Math.min(1,((p.x-route.a[0])*dx+(p.z-route.a[1])*dz)/len)):0;
   if(Math.hypot(p.x-route.a[0]-t*dx,p.z-route.a[1]-t*dz)<radius+route.radius)return false;
  }
  return !stones.intersects(p,envelope)&&!e.thresholdPlants.intersects(p,envelope)&&!e.boardwalkPlantContact39.intersects(p,envelope)&&!e.pasturePlantContact41.intersects(p,e.pastureGrassEnvelope41);
 };
 const layout=createMeadowLayoutPatch42(e,{accept,landform:e.grassRootField?.landform}),p=layout.patch;let enabled=false,disposed=false;
 const overlaps=(tx,tz)=>tx*24<p.x+p.half&&(tx+1)*24>p.x-p.half&&tz*24<p.z+p.half&&(tz+1)*24>p.z-p.half;
 function generate(tx,tz){const list=original.call(this,tx,tz);return enabled&&overlaps(tx,tz)?list.map(layout.map):list;}
 generate.meadowLayoutPatch42=true;e.generateGrassTileRoots=generate;
 function rebuild(){
  // Restore temporary compact submission states before changing their sources.
  d.meadowViews?.restore();
  for(const tile of e.grassTiles.values())if(overlaps(tile.tx,tile.tz)){
   const originalList=tile.list.map(root=>layout.roots.get(root.id)?.result===root?layout.roots.get(root.id).source:root);
   const list=enabled?originalList.map(layout.map):originalList;
   tile.list=list;tile.regular=list.filter(r=>!r.brookAsset);tile.wet=list.filter(r=>r.brookAsset);
   for(const mesh of tile.meshes)if(mesh){
    d.meadowViews?.records.delete(mesh);
    if(mesh.instanceMatrix.count!==tile.regular.length)throw Error('Meadow patch source count changed');
    const a=mesh.geometry.attributes;
    tile.regular.forEach((root,i)=>{mesh.setMatrixAt(i,e.matrix(root));e.grassRootField.write(a.aMeadowRootField,i,root,a.aMeadowLandform,a.aMeadowCommunity);});
    mesh.count=tile.regular.length;mesh.instanceMatrix.needsUpdate=true;
    for(const field of[a.aMeadowRootField,a.aMeadowLandform,a.aMeadowCommunity]){field.clearUpdateRanges();field.addUpdateRange(0,tile.regular.length*4);field.needsUpdate=true;}
    if(mesh.castShadow)refreshPlantBounds(mesh,tile.regular,e.uniforms.uWorldViewer.value,MEADOW.nearEnd);
    else {mesh.computeBoundingSphere();mesh.boundingSphere.radius+=1;}
   }
  }
  if(cluster)for(const [key,tile]of [...cluster.tiles])if(overlaps(tile.tx,tile.tz)){cluster.drop(tile);cluster.tiles.delete(key);cluster.build(tile.tx,tile.tz);}
  e.syncPool(e.baseGrass,new Map());e.grassRootsChanged=true;e.baseGrassAnchor='';e.syncBasalGrass(camera);e.publishMeadowPools(camera);
  if(cluster){cluster.anchor='';if(cluster.submission.enabled&&cluster.lastViews)cluster.submission.update(cluster.lastViews);}
  d.environment.forceShadowUpdate=true;
 }
 return {stats:layout.stats,layout,setEnabled(value){if(disposed)throw Error('Meadow patch disposed');value=Boolean(value);if(value===enabled)return;enabled=value;layout.stats.enabled=value;try{rebuild();}catch(error){enabled=false;layout.stats.enabled=false;rebuild();throw error;}},dispose(){if(disposed)return;try{if(enabled){enabled=false;layout.stats.enabled=false;rebuild();}}finally{if(e.generateGrassTileRoots===generate){if(descriptor)Object.defineProperty(e,'generateGrassTileRoots',descriptor);else delete e.generateGrassTileRoots;}disposed=true;}}};
}
