import * as T from 'three';
import {createForestFloorGeometry} from './forest-floor.js';
import {createPlantEnvelope,getShoreStoneField} from './shore-contact.js';
import {brookGrassIntersectsWater} from './brook-shoulder-grass.js';
import {createBrookWetBatch,installBrookWetBatchMaterial} from './brook-wetgrass.js';
import {FOREST_REACH39_SOURCE} from './forest-reach39-source.js';
const random=(x,z,k)=>{let h=Math.imul(x^k,1597334677)^Math.imul(z,3812015801);h=Math.imul(h^(h>>>16),2246822519);return((h^(h>>>13))>>>0)/4294967296;};
export function createReachRootMat39(seed=0){
 const p=[],c=[],w=[],indices=[],groups=[];
 // Irregular creeping shoots, with closed curved laminae rather than upright
 // cones. The 24 shoots retain real thickness, individual roots and wind.
 for(let i=0;i<24;i++){const a=random(i,2,7^seed)*Math.PI*2,r=.09*Math.sqrt(random(i,3,8^seed)),x=Math.cos(a)*r,z=Math.sin(a)*r,start=p.length/3;
  const heading=a+(random(i,4,9)-.5)*2.6,length=.025+.035*random(i,5,10),width=.004+.004*random(i,6,11),rise=.012+.022*random(i,7,12);
  for(let j=0;j<4;j++){const t=j/3,half=width*(.18+.82*Math.sin(Math.PI*t)),cx=x+Math.cos(heading)*length*t,cz=z+Math.sin(heading)*length*t,cy=rise*Math.sin(t*Math.PI*.72),shade=.78+.22*random(i,8,13);
   for(const [side,thickness] of [[-1,0],[1,0],[-1,.0015],[1,.0015]]){p.push(cx-Math.sin(heading)*half*side,cy+thickness,cz+Math.cos(heading)*half*side);c.push(.055*shade,.105*shade,.023*shade);w.push(cy*.5,0,random(i,9,14));}
  }
  for(let j=0;j<3;j++){const k=start+j*4,n=k+4;indices.push(k,n,k+1,k+1,n,n+1,k+2,k+3,n+2,k+3,n+3,n+2,k,k+2,n,k+2,n+2,n,k+1,n+1,k+3,k+3,n+1,n+3);}
  indices.push(start,start+1,start+2,start+1,start+3,start+2,start+12,start+14,start+13,start+13,start+14,start+15);
  groups.push({start,count:16,feet:[start,start+1]});
 }
 const g=new T.BufferGeometry();for(const[n,a]of[['position',p],['color',c],['aPlantWind',w]])g.setAttribute(n,new T.Float32BufferAttribute(a,3));g.setIndex(indices);g.computeVertexNormals();return{geometry:g,groups};
}
export function reachCoverPrototype39(kind){if(kind==='mat')return createReachRootMat39();return{geometry:createForestFloorGeometry('sedge'),groups:Array.from({length:17},(_,i)=>({start:i*10,count:10,feet:[i*10,i*10+1]}))};}
export function seatReachCover39(world,root,prototype,excluded=()=>false){
 const g=prototype.geometry.clone(),p=g.attributes.position,c=Math.cos(root.rot),s=Math.sin(root.rot),seats=[];
 for(const group of prototype.groups){const points=group.feet.map(i=>({x:root.x+(c*p.getX(i)+s*p.getZ(i))*root.s,z:root.z+(-s*p.getX(i)+c*p.getZ(i))*root.s}));
  if(points.some(v=>{const q=world.hydrology.sampleAt(v.x,v.z,{includeDepth:false});return q.insideWater||q.shoreDistance<.014||excluded(v.x,v.z,.02);})) {g.dispose();return null;}
  const levels=points.map(v=>world.surface.heightAt(v.x,v.z));if(Math.max(...levels)-Math.min(...levels)>.025){g.dispose();return null;}
  const level=Math.min(...levels)-.002,delta=(level-root.y)/root.s;
  for(let i=group.start;i<group.start+group.count;i++)p.setY(i,p.getY(i)+delta);
  seats.push({...group,points,level});
 }
 p.needsUpdate=true;const envelope=createPlantEnvelope([g]);
 if(brookGrassIntersectsWater(world,root,envelope)||getShoreStoneField(world).intersects(root,envelope)){g.dispose();return null;}
 return{geometry:g,envelope,seats};
}
export class ReachBankCover39{
 constructor(world,{wind,depth,rootField,excluded=()=>false,enabled=!!world.hydrology?.forestReach39&&new URLSearchParams(globalThis.location?.search||'').get('forestReachCommunity39')!=='0'}={}){
  this.world=world;this.enabled=enabled;this.rootField=rootField;this.excluded=excluded;this.group=new T.Group();this.group.name='reach39-rooted-bank-community';this.materials=[];this.pools=[];this.stats={enabled,built:false,pending:0,sedges:0,mats:0,triangles:0};
  if(!enabled)return;
  for(const kind of ['sedge','mat']){const material=wind(new T.MeshStandardMaterial({vertexColors:true,roughness:.96,side:T.DoubleSide}),9,true),dm=depth(material,9,true);installBrookWetBatchMaterial(material);installBrookWetBatchMaterial(dm);this.materials.push(material);this.pools.push({kind,material,depth:dm,prototype:reachCoverPrototype39(kind),records:[]});}
 }
 *generate(){
  const started=performance.now(),world=this.world,reach=world.hydrology.forestReach39,segments=world.hydrology.segments.filter(reach.activeSegment),xs=segments.flatMap(s=>[s.a.x,s.b.x]),zs=segments.flatMap(s=>[s.a.z,s.b.z]),step=.36;
  for(let iz=Math.floor((Math.min(...zs)-2.2)/step);iz<=Math.ceil((Math.max(...zs)+2.2)/step);iz++)for(let ix=Math.floor((Math.min(...xs)-2.2)/step);ix<=Math.ceil((Math.max(...xs)+2.2)/step);ix++){
   if((ix&7)===0)yield;
   const x=(ix+.16+.68*random(ix,iz,31))*step,z=(iz+.16+.68*random(ix,iz,41))*step,p=reach.queryAt(x,z);if(!p||p.segment.lineId!==reach.lineId)continue;
   const offset=p.section.distance-reach.origin;if(Math.abs(offset)>=17.7)continue;
   const q=world.hydrology.sampleAt(x,z,{includeDepth:false}),height=world.surface.heightAt(x,z),normal=world.surface.normalAt(x,z,.15);
   if(q.insideWater||q.shoreDistance<.05||q.shoreDistance>1.25||normal.y<.91||height-q.surfaceLevel<.003||q.wetness<.025||this.excluded(x,z,.05))continue;
   if(FOREST_REACH39_SOURCE.trees.some(t=>Math.hypot(t.x-x,t.z-z)<.4))continue;
   // Actual low dry bank eligibility defines the patch, a 2D jittered source
   // lattice avoids shoreline rows. Sparse openings keep sediment visible.
   const kind=random(ix,iz,53)<.43?'sedge':'mat',pool=this.pools.find(p=>p.kind===kind),s=kind==='sedge'?.36+.25*random(ix,iz,61):.7+.5*random(ix,iz,61);
   if(random(ix,iz,71)>.82*(Math.min(1,(18-Math.abs(offset))/2)))continue;
   const root={id:'reach39:'+kind+':'+ix+':'+iz,x,y:height,z,s,sy:s,rot:random(ix,iz,81)*Math.PI*2,kind,offset},asset=seatReachCover39(world,root,pool.prototype,this.excluded);if(!asset)continue;
   // Preserve every accepted tuft, but draw low growth into irregular soil
   // pockets in two dimensions instead of displaying one identical disk per
   // lattice cell. Failed moves retain the valid source location and geometry.
   let selected=asset;
   if(kind==='mat'){
    const px=Math.floor(x/1.3),pz=Math.floor(z/1.3),cx=(px+random(px,pz,111))*1.3,cz=(pz+random(px,pz,112))*1.3,dx=cx-x,dz=cz-z,f=Math.min(.6,.35/(Math.hypot(dx,dz)||1));
    const moved={...root,x:x+dx*f,z:z+dz*f},mq=world.hydrology.sampleAt(moved.x,moved.z,{includeDepth:false}),mp=reach.queryAt(moved.x,moved.z);
    moved.y=world.surface.heightAt(moved.x,moved.z);
    const variant=createReachRootMat39(Math.imul(ix,31)^iz);
    if(mp&&Math.abs(mp.section.distance-reach.origin)<17.7&&!mq.insideWater&&mq.shoreDistance>=.05&&mq.shoreDistance<=1.25&&mq.wetness>=.025&&moved.y-mq.surfaceLevel>=.003&&world.surface.normalAt(moved.x,moved.z,.15).y>=.91&&!this.excluded(moved.x,moved.z,.05)&&!FOREST_REACH39_SOURCE.trees.some(t=>Math.hypot(t.x-moved.x,t.z-moved.z)<.4)){
     const placed=seatReachCover39(world,moved,variant,this.excluded);if(placed){selected.geometry.dispose();selected=placed;Object.assign(root,moved,{offset:mp.section.distance-reach.origin});}
    }
    variant.geometry.dispose();
   }
   root.coverAsset=selected;root.brookAsset={geometries:[selected.geometry]};pool.records.push(root);
  }
  const fieldCache=new WeakMap(),fields=r=>{let f=fieldCache.get(r);if(!f){f=[this.rootField.sample(r),this.rootField.sampleLandform(r),this.rootField.sampleCommunity(r)];fieldCache.set(r,f);}return f;},cachedField={sample:r=>fields(r)[0],sampleLandform:r=>fields(r)[1],sampleCommunity:r=>fields(r)[2]};
  for(const pool of this.pools){if(!pool.records.length)continue;pool.geometry=createBrookWetBatch(pool.records,0,cachedField);for(const name of ['aMeadowRootField','aMeadowLandform','aMeadowCommunity'])pool.geometry.deleteAttribute(name);pool.mesh=new T.Mesh(pool.geometry,pool.material);pool.mesh.customDepthMaterial=pool.depth;pool.mesh.castShadow=pool.mesh.receiveShadow=true;pool.mesh.frustumCulled=true;this.group.add(pool.mesh);this.stats[pool.kind==='sedge'?'sedges':'mats']=pool.records.length;this.stats.triangles+=pool.geometry.index.count/3;}
  this.stats.geometryBytes=this.pools.reduce((n,p)=>n+(p.geometry?Object.values(p.geometry.attributes).reduce((m,a)=>m+a.array.byteLength,0)+p.geometry.index.array.byteLength:0),0);this.stats.built=true;this.stats.buildMs=performance.now()-started;
 }
 build(){if(!this.stats.built)for(const _ of this.generate()){} }
 update(camera,contact){if(!this.enabled)return;const distance=Math.hypot(camera.position.x+3611.9813305250705,camera.position.z-4805.371282289286);if(distance>120){this.group.visible=false;this.stats.pending=0;return;}this.group.visible=true;if(!this.stats.built){this.generation??=this.generate();const start=performance.now();let done=false;do{done=this.generation.next().done;}while(!done&&performance.now()-start<4);this.stats.buildWorkMs=(this.stats.buildWorkMs??0)+performance.now()-start;if(!done){this.stats.pending=1;return;}this.generation=null;}
  let pending=0;
  for(const pool of this.pools){if(!pool.mesh)continue;let offset=0,dirty=false;const seat=pool.geometry.attributes.aBrookSeat,show=pool.geometry.attributes.aBrookReady;
   for(const root of pool.records){const asset=root.coverAsset;if(!root.binding&&contact)root.binding=contact.bind(asset.seats.flatMap(s=>s.points));
    if(!root.binding){pending++;show.array.fill(0,offset,offset+asset.geometry.attributes.position.count);dirty=true;}
    else if(root.binding.changed()){const samples=root.binding.samples();let cursor=0,ready=samples.every(s=>s&&s.spacing<=.625&&!s.morphing),minDelta=0;
     for(const group of asset.seats){let level=Infinity;for(const point of group.points){const v=samples[cursor++];if(v)level=Math.min(level,v.height-.002);}const delta=Number.isFinite(level)?level-group.level:0;minDelta=Math.min(minDelta,delta);seat.array.fill(delta,offset+group.start,offset+group.start+group.count);}
     // Validate the actual independently seated leaves, not a fictitious whole
     // tuft lowered by the most negative foot. That conservative surrogate
     // falsely rejected two settled roots indefinitely at 15.625 cm terrain.
     if(ready){const actual=asset.geometry.clone(),positions=actual.attributes.position;
      for(const group of asset.seats){const delta=seat.array[offset+group.start]/root.s;for(let i=group.start;i<group.start+group.count;i++)positions.setY(i,positions.getY(i)+delta);}
      const envelope=createPlantEnvelope([actual]);
      root.contactFailure=brookGrassIntersectsWater(this.world,root,envelope)?'water-envelope':getShoreStoneField(this.world).intersects(root,envelope)?'stone-envelope':null;
      ready=!root.contactFailure;actual.dispose();
     }else root.contactFailure='terrain-not-ready';
     root.contactReady=ready;show.array.fill(ready?1:0,offset,offset+asset.geometry.attributes.position.count);dirty=true;
    }
    if(root.binding&&!root.contactReady)pending++;offset+=asset.geometry.attributes.position.count;
   }
   if(dirty){seat.needsUpdate=true;show.needsUpdate=true;}
  }
  this.stats.pending=pending;
 }
 dispose(){this.generation?.return();this.generation=null;for(const p of this.pools){p.geometry?.dispose();p.prototype.geometry.dispose();p.material.dispose();p.depth.dispose();for(const r of p.records)r.coverAsset.geometry.dispose();}this.group.clear();}
}
