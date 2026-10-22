// Preserve the original 90 queue ticks and wind/water time. Only unrendered
// dynamic tree synchronization is coalesced; completeness is not weakened.
export async function prepareEcologyQueues({ecology,water,camera,isCurrent=()=>true,yieldToInput=()=>new Promise(r=>setTimeout(r,0)),staticPreparation=true,maxIterations=90}={}){
 let iterations=0;
 for(let i=0;i<maxIterations;i++){
  if(!isCurrent())return null;
  ecology.update(camera,.016,{preparing:staticPreparation});water.update(camera,.016);iterations++;
  if(i>12&&ecology.stats.pending===0&&water.stats.pending===0)break;
  if(i%4===3)await yieldToInput();
 }
 if(!isCurrent())return null;
 if(staticPreparation)ecology.finishPreparation(camera);
 return {mode:staticPreparation?'static-queues':'frame-updates',iterations,pending:ecology.stats.pending,waterPending:water.stats.pending};
}
