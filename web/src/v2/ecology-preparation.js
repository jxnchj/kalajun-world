// Preserve the original 90 queue ticks and wind/water time. Only unrendered
// dynamic tree synchronization is coalesced; completeness is not weakened.
export async function prepareEcologyQueues({ecology,water,camera,isCurrent=()=>true,yieldToInput=()=>new Promise(r=>setTimeout(r,0)),staticPreparation=true,maxIterations=90}={}){
 const timings={};
 const measuredTick=work=>{const restores=[];
 // Scope wrappers to one synchronous tick, never across yields where a
 // destination change may begin a second preparation on the same ecology.
 for(const [owner,name,label] of [[ecology,'buildTile','farTiles'],[ecology,'rebuildNearTrees','nearTrees'],[ecology,'syncActiveTrees','activeTrees'],[ecology,'syncTreeDynamics','treeDynamics'],[ecology,'updateMeadow','meadow'],[ecology,'generateGrassTileRoots','grassRoots'],[ecology,'addGrassMesh','grassMeshes'],[ecology,'addBrookWetMeshes','wetMeshes'],[ecology,'addFlowers','flowers'],[ecology,'syncNearFlowers','nearFlowerPool'],[ecology,'syncBasalGrass','basalPool'],[ecology.windField,'update','windField'],[ecology.forestFloor,'update','forestFloor'],[water,'update','water']]){
  if(typeof owner?.[name]!=='function')continue;
  const original=owner[name],own=Object.hasOwn(owner,name),sample=timings[label]??={calls:0,totalMs:0,maxMs:0};
  const measured=function(...args){const start=performance.now();try{return original.apply(this,args);}finally{const elapsed=performance.now()-start;sample.calls++;sample.totalMs+=elapsed;sample.maxMs=Math.max(sample.maxMs,elapsed);}};
  owner[name]=measured;restores.push(()=>{if(owner[name]===measured){if(own)owner[name]=original;else delete owner[name];}});
 }
 try{return work();}finally{for(const restore of restores)restore();}
 };
 let iterations=0;
 for(let i=0;i<maxIterations;i++){
  if(!isCurrent())return null;
  measuredTick(()=>{ecology.update(camera,.016,{preparing:staticPreparation});water.update(camera,.016);});iterations++;
  if(i>12&&ecology.stats.pending===0&&water.stats.pending===0)break;
  if(i%4===3)await yieldToInput();
 }
 if(!isCurrent())return null;
 if(staticPreparation)measuredTick(()=>ecology.finishPreparation(camera));
 return {mode:staticPreparation?'static-queues':'frame-updates',iterations,pending:ecology.stats.pending,waterPending:water.stats.pending,timings};
}
