import {localShadowWindow72Enabled} from './local-shadow-policy72.js';
import {createBankBoundsAccumulator45} from './shadow-column-audit42.js';
import{applyPreparedContact42}from'./reach-contact-prepared42.js';
import {ReachCoverPrepared42,restoreReachCover42,reachCoverPrepared42Enabled,reachEnvelopeLazy46Enabled} from './reach-cover-prepared42.js';
import {preservedReachCover41,PRESERVED_REACH_COVER41} from './forest-reach-preserved-cover41.js';
import {recoverReachLeafBurial41} from './forest-reach-seating41.js';
import {reachEdgeRoots41} from './forest-reach-edge41.js';
import * as T from 'three';
import {createForestFloorGeometry} from './forest-floor.js';
import {createPlantEnvelope,getShoreStoneField} from './shore-contact.js';
import {brookGrassIntersectsWater} from './brook-shoulder-grass.js';
import {createBrookWetBatch,createBrookWetBatchSteps45,installBrookWetBatchMaterial} from './brook-wetgrass.js';
import {reachPlantIntersectsWater40} from './reach-water-contact40.js';
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
 const waterBroadPhase=brookGrassIntersectsWater(world,root,envelope);
 if(reachPlantIntersectsWater40(world,root,[g])||getShoreStoneField(world).intersects(root,envelope)){g.dispose();return null;}
 return{geometry:g,envelope,seats,waterBroadPhaseFalsePositive:waterBroadPhase};
}
export class ReachBankCover39{
 constructor(world,{wind,depth,rootField,excluded=()=>false,preparedEnabled=reachCoverPrepared42Enabled(world),enabled=!!world.hydrology?.forestReach39&&new URLSearchParams(globalThis.location?.search||'').get('forestReachCommunity39')!=='0'}={}){
  this.world=world;this.enabled=enabled;this.rootField=rootField;this.excluded=excluded;this.group=new T.Group();this.group.name='reach39-rooted-bank-community';this.materials=[];this.pools=[];this.stats={enabled,built:false,pending:0,sedges:0,mats:0,triangles:0};
  if(!enabled)return;
  this.prepared42=new ReachCoverPrepared42(world,{enabled:preparedEnabled});this.stats.prepared42=this.prepared42.stats;this.prepared42.prepare();
  for(const kind of ['sedge','mat']){const material=wind(new T.MeshStandardMaterial({vertexColors:true,roughness:.96,side:T.DoubleSide}),9,true),dm=depth(material,9,true);installBrookWetBatchMaterial(material);installBrookWetBatchMaterial(dm);this.materials.push(material);this.pools.push({kind,material,depth:dm,prototype:reachCoverPrototype39(kind),records:[]});}
 }
 *generate(){
  if(this.world.hydrology.forestReach39?.stats.design73&&!this.prepared42?.data)throw Error('Reach73 requires its validated relocated-root preparation: '+(this.prepared42?.stats.reason??'not loaded'));
  if(this.world.hydrology.forestReach39?.stats.design69&&!this.prepared42?.data)throw Error('Reach69 requires its validated fixed-root preparation: '+(this.prepared42?.stats.reason??'not loaded'));
  const started=performance.now(),world=this.world,reach=world.hydrology.forestReach39,segments=world.hydrology.segments.filter(reach.activeSegment),xs=segments.flatMap(s=>[s.a.x,s.b.x]),zs=segments.flatMap(s=>[s.a.z,s.b.z]),step=.36;
  if(reach.stats.form41Revision==='asymmetric-root-banks-v3'){this.stats.edgeMats41=0;this.stats.preservedMoved41=0;for(const result of (this.prepared42?.data?restoreReachCover42(this.prepared42.data,this.pools,{make:createReachRootMat39,source:PRESERVED_REACH_COVER41,lazyEnvelope46:reachEnvelopeLazy46Enabled(),profile46:reachEnvelopeLazy46Enabled()?(this.stats.envelopeLazy46??={}):null}):preservedReachCover41(world,this.pools,{seat:seatReachCover39,make:createReachRootMat39,excluded:this.excluded}))){if(result.edge)this.stats.edgeMats41++;if(result.moved)this.stats.preservedMoved41++;yield;}}else{
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
   if(selected.waterBroadPhaseFalsePositive)this.stats.waterBroadPhaseFalsePositives=(this.stats.waterBroadPhaseFalsePositives??0)+1;
   root.coverAsset=selected;root.brookAsset={geometries:[selected.geometry]};pool.records.push(root);
  }
  if(reach.stats.form41){const pool=this.pools.find(p=>p.kind==='mat');this.stats.edgeMats41=0;for(const root of reachEdgeRoots41(world,pool,{make:createReachRootMat39,seat:seatReachCover39,excluded:this.excluded})){pool.records.push(root);this.stats.edgeMats41++;yield;}}
  }
  const fieldCache=new WeakMap(),fields=r=>{let f=fieldCache.get(r);if(!f){f=[this.rootField.sample(r),this.rootField.sampleLandform(r),this.rootField.sampleCommunity(r)];fieldCache.set(r,f);}return f;},cachedField={sample:r=>fields(r)[0],sampleLandform:r=>fields(r)[1],sampleCommunity:r=>fields(r)[2]};
  for(const pool of this.pools){if(!pool.records.length)continue;const bounds45=localShadowWindow72Enabled()?createBankBoundsAccumulator45():null;pool.geometry=bounds45?yield* createBrookWetBatchSteps45(pool.records,0,cachedField,{bounds:bounds45}):createBrookWetBatch(pool.records,0,cachedField);for(const name of ['aMeadowRootField','aMeadowLandform','aMeadowCommunity'])pool.geometry.deleteAttribute(name);if(bounds45){const vertices=bounds45.publish(pool.geometry);this.stats.shadowBounds45??={pools:0,vertices:0};this.stats.shadowBounds45.pools++;this.stats.shadowBounds45.vertices+=vertices;}pool.mesh=new T.Mesh(pool.geometry,pool.material);pool.mesh.customDepthMaterial=pool.depth;pool.mesh.castShadow=pool.mesh.receiveShadow=true;pool.mesh.frustumCulled=true;this.group.add(pool.mesh);this.stats[pool.kind==='sedge'?'sedges':'mats']=pool.records.length;this.stats.triangles+=pool.geometry.index.count/3;}
  this.stats.geometryBytes=this.pools.reduce((n,p)=>n+(p.geometry?Object.values(p.geometry.attributes).reduce((m,a)=>m+a.array.byteLength,0)+p.geometry.index.array.byteLength:0),0);this.stats.built=true;this.stats.buildMs=performance.now()-started;
 }
 build(){if(!this.stats.built)for(const _ of this.generate()){} }
 update(camera,contact){if(!this.enabled)return;const distance=Math.hypot(camera.position.x+3611.9813305250705,camera.position.z-4805.371282289286);if(distance>120){this.group.visible=false;this.stats.pending=0;return;}this.group.visible=true;if(!this.stats.built&&this.prepared42?.stats.status==='pending'){this.stats.pending=1;return;}if(!this.stats.built){this.generation??=this.generate();const start=performance.now();let done=false;do{done=this.generation.next().done;}while(!done&&performance.now()-start<4);this.stats.buildWorkMs=(this.stats.buildWorkMs??0)+performance.now()-start;if(!done){this.stats.pending=1;return;}this.generation=null;}
  const started=performance.now(),budget=this.contactBudgetMs42??2.5;
  let ordinal=0,pending=0,processed=0,validated=0,reused=0,preparedHits=0,validationMs=0,maxRootMs=0;
  for(const pool of this.pools){if(!pool.mesh)continue;let offset=0,dirty=false;const seat=pool.geometry.attributes.aBrookSeat,show=pool.geometry.attributes.aBrookReady;
   for(const root of pool.records){const asset=root.coverAsset,count=asset.geometry.attributes.position.count,rootOrdinal=ordinal++;
    if(!root.binding&&contact)root.binding=contact.bind(asset.seats.flatMap(s=>s.points));
    if(root.binding?.changed())root.contactQueued42=true;
    if(!root.binding||root.contactQueued42){
     // Never show the old placement against changed terrain while verification
     // is pending. Roots and source leaves remain resident, not discarded.
     if(root.contactReady||show.array[offset]!==0){show.array.fill(0,offset,offset+count);dirty=true;}
     root.contactReady=false;
     if(root.binding&&rootOrdinal>=(this.contactCursor42??0)&&(processed===0||performance.now()-started<budget)){
      processed++;this.contactCursor42=rootOrdinal+1;const sampleStart=performance.now(),samples=root.binding.samples();let cursor=0;
      const ready=samples.every(s=>s&&s.spacing<=.625&&!s.morphing),values=new Float32Array(count);
      for(const group of asset.seats){let level=Infinity;for(const point of group.points){const v=samples[cursor++];if(v)level=Math.min(level,v.height-.002);}values.fill(Number.isFinite(level)?level-group.level:0,group.start,group.start+group.count);}
      const cache=root.contactCache42;
      // Exact Float32 inputs are what the shader and original oracle consume.
      // The root/source/world are immutable for this owner's lifetime.
      const same=ready&&cache&&cache.input.length===values.length&&values.every((v,i)=>Object.is(v,cache.input[i]));
      if(same){values.set(cache.output);root.contactFailure=cache.failure;root.contactBurialRecovery41=cache.recovery;root.contactReady=cache.ready;reused++;}
      else if(ready){const input=values.slice();root.contactBurialRecovery41=0;const prepared=asset.preparedContact42;if(applyPreparedContact42(prepared,asset.seats,values,{ready,rootId:root.id})){root.contactReady=prepared.ready;root.contactFailure=prepared.failure;root.contactBurialRecovery41=prepared.recovery;preparedHits++;}else{root.contactReady=this.validateContact42(root,values);validated++;}root.contactCache42={input,output:values.slice(),failure:root.contactFailure,recovery:root.contactBurialRecovery41,ready:root.contactReady};}
      else root.contactFailure='terrain-not-ready';
      root.contactQueued42=false;seat.array.set(values,offset);show.array.fill(root.contactReady?1:0,offset,offset+count);dirty=true;
      const elapsed=performance.now()-sampleStart;validationMs+=elapsed;maxRootMs=Math.max(maxRootMs,elapsed);
     }
    }
    if(!root.contactReady)pending++;offset+=count;
   }
   if(dirty){seat.needsUpdate=true;show.needsUpdate=true;}
  }
  if(!processed||this.contactCursor42>=ordinal)this.contactCursor42=0;
  const totals=this.stats.contactTotals42??={validated:0,reused:0,preparedHits:0,validationMs:0,maxRootMs:0,maxUpdateMs:0};totals.validated+=validated;totals.reused+=reused;totals.preparedHits+=preparedHits;totals.validationMs+=validationMs;totals.maxRootMs=Math.max(totals.maxRootMs,maxRootMs);totals.maxUpdateMs=Math.max(totals.maxUpdateMs,performance.now()-started);
  this.stats.pending=pending;this.stats.contact42={validated,reused,preparedHits,validationMs,maxRootMs,queued:this.pools.reduce((n,p)=>n+p.records.filter(r=>r.contactQueued42).length,0),budgetMs:budget};
 }
 validateContact42(root,seatValues){const asset=root.coverAsset,context=new Map(),phases=this.stats.contactPhases42??={};
  const timed=(name,fn)=>{const start=performance.now();try{return fn();}finally{const ms=performance.now()-start,row=phases[name]??={calls:0,ms:0,maxMs:0};row.calls++;row.ms+=ms;row.maxMs=Math.max(row.maxMs,ms);}};
  // Only Y positions are mutated. Index, wind, normals and pigments remain the
  // same immutable buffers; no GPU object ever owns this temporary geometry.
  const actual=timed('cloneSeat',()=>{const g=new T.BufferGeometry();for(const [name,attr]of Object.entries(asset.geometry.attributes))g.setAttribute(name,name==='position'?attr.clone():attr);g.setIndex(asset.geometry.index);const positions=g.attributes.position;for(const group of asset.seats){const delta=seatValues[group.start]/root.s;for(let i=group.start;i<group.start+group.count;i++)positions.setY(i,positions.getY(i)+delta);}return g;});
  try{
   const envelope=timed('envelope',()=>createPlantEnvelope([actual]));
   root.contactFailure=timed('water',()=>reachPlantIntersectsWater40(this.world,root,[actual],context))?'water-envelope':timed('stone',()=>getShoreStoneField(this.world).intersects(root,envelope))?'stone-envelope':null;
   if(root.contactFailure==='water-envelope'&&this.world.hydrology.forestReach39?.stats.form41){
    const recovered=timed('recovery',()=>recoverReachLeafBurial41(this.world,root,actual,asset.seats,context));
    if(recovered.length&&!timed('water',()=>reachPlantIntersectsWater40(this.world,root,[actual],context))&&!timed('stone',()=>getShoreStoneField(this.world).intersects(root,timed('envelope',()=>createPlantEnvelope([actual]))))){
     for(const leaf of recovered)for(let i=leaf.start;i<leaf.start+leaf.count;i++)seatValues[i]+=.001;
     root.contactFailure=null;root.contactBurialRecovery41=recovered.length;
    }
   }
  }finally{actual.dispose();}
  return !root.contactFailure;
 }

 dispose(){this.prepared42?.dispose();this.generation?.return();this.generation=null;for(const p of this.pools){p.geometry?.dispose();p.prototype.geometry.dispose();p.material.dispose();p.depth.dispose();for(const r of p.records)r.coverAsset.geometry.dispose();}this.group.clear();}
}
