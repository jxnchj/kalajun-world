import {SpruceMiddleBatched} from './spruce-middle-batched.js';
export {SpruceMiddleBatched};
// Review only: installs the original candidate into its existing ecology owner.
// No main/worker flags, alternative algorithm, source deletion or density changes.
export function installMiddleBatchedReview42(app,{Candidate=SpruceMiddleBatched}={}){
 const d=app.debug??app,e=d.ecology;
 if(!e?.nearParts?.length||!e.nearGroup||!e.nearTreeBatches||!e.stats)throw Error('Loaded original spruce owners required');
 if(e.middleBatched!=null)throw Error('Existing middle batched owner must not be replaced');
 if(e.treeViewCull?.value||e.treeWorldFrustum||e.treeFrustumCull?.value||d.treePhotoPrepass?.enabled||e.treeWindCoefficientsStatic||e.treeWindCoefficients?.value)throw Error('Disable conflicting tree visibility/prepass/coefficient experiments first');
 if(!d.renderer?.extensions?.has('WEBGL_multi_draw'))throw Error('WEBGL_multi_draw required for this review');
 const previous=Object.getOwnPropertyDescriptor(e,'middleBatched'),previousStats=Object.getOwnPropertyDescriptor(e.stats,'middleTreeBatched');
 let candidate=null,disposed=false;
 const restore=(object,key,descriptor)=>{if(descriptor)Object.defineProperty(object,key,descriptor);else delete object[key];};
 const cleanup=()=>{
  if(disposed)return;disposed=true;
  try{candidate?.dispose();}finally{
   if(e.middleBatched===candidate)restore(e,'middleBatched',previous);
   if(e.stats.middleTreeBatched===candidate?.stats)restore(e.stats,'middleTreeBatched',previousStats);
   e.treeBatchRevision++;
  }
 };
 try{
  candidate=new Candidate(e.nearParts,e.nearGroup,{onChange:()=>{e.treeBatchRevision++;}});
  e.middleBatched=candidate;e.stats.middleTreeBatched=candidate.stats;
  candidate.sync(e.nearTreeBatches,e.treeBatchRevision);
  // Start restored/OFF; caller warms both modes before timed normal RAF blocks.
  candidate.enabled.value=0;
 }catch(error){cleanup();throw error;}
 return {candidate,stats:candidate.stats,setEnabled(value){if(disposed)throw Error('Review owner disposed');candidate.enabled.value=Boolean(value);},snapshot(){return {...candidate.stats,disposed};},dispose:cleanup};
}
