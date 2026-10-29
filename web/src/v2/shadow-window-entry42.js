export {executableWindowBudget42,serializableWindowBudget42} from './shadow-window-budget42.js';
export {ShadowWindowCoverage42} from './shadow-window-coverage42.js';
export {compareFullCoverage42} from './shadow-window-reference42.js';
export {visibleGroundAnchor42} from './shadow-window-anchor42.js';

export {ShadowWindowSubmissions42} from './shadow-window-submissions42.js';

export {ShadowWindowController42} from "./shadow-window-controller42.js";

import {ShadowWindowSubmissions42 as SubmissionProbe42} from './shadow-window-submissions42.js';
import {executableWindowBudget42 as budgetProbe42} from './shadow-window-budget42.js';
import {visibleGroundAnchor42 as anchorProbe42} from './shadow-window-anchor42.js';
// One scoped read-only geometry probe for an already-held real world. No mask,
// receiver material, density, or default scene option is installed by this call.
export async function profileWindowBudget42(api,{samples=3}={}){
 if(!Number.isInteger(samples)||samples<1||samples>5)throw Error('Expected 1–5 budget samples');
 const d=api.debug,shadow=d.environment.csm.lights[0].shadow,oldLight=shadow.needsUpdate,oldMap=d.renderer.shadowMap.needsUpdate,probe=new SubmissionProbe42(d.renderer,shadow);
 try{shadow.needsUpdate=true;d.renderer.shadowMap.needsUpdate=true;d.renderFrozenWorld();const hit=anchorProbe42(d.camera,api.world.surface);if(!hit)throw Error('No visible nearby terrain');const results=[];
  for(let i=0;i<samples;i++){const b=await budgetProbe42(d,{anchor:hit.point,sizes:[4.5],yieldEvery:Infinity,submissions:probe});results.push({timing:b.timing,total:b.total,sourceCount:b.sourceCount,unsupported:b.unsupported,top:b.rows.slice().sort((a,b)=>b.queryMs-a.queryMs).slice(0,12).map(({id,name,queryMs,sourceInstances,sourceVertices,sourceIndexCount,sourceDrawRange,sourceWind,projectionCache,sourceTriangles,submitted})=>({id,name,queryMs,sourceInstances,sourceVertices,sourceIndexCount,sourceDrawRange,sourceWind,projectionCache,sourceTriangles,submitted}))});}
  return {anchor:hit,submissions:{...probe.stats},viewport:[d.renderer.domElement.width,d.renderer.domElement.height],results};
 }finally{probe.dispose();shadow.needsUpdate=oldLight;d.renderer.shadowMap.needsUpdate=oldMap;}
}

// Use only in a held review scene. Normal animation invokes the same original
// shadow hook itself; this helper advances actual CSM camera placement as well.
export async function settleWindowCoverage42(api,controller,{maxPasses=10}={}){
 const d=api.debug,frames=[];for(let i=0;i<maxPasses;i++){if(controller.pending)await controller.pending;d.camera.updateMatrixWorld();d.environment.csm.update();d.environment.csm.lights[0].shadow.needsUpdate=true;d.renderer.shadowMap.needsUpdate=true;const start=performance.now();d.renderFrozenWorld();frames.push(performance.now()-start);if(controller.pending)await controller.pending;if(controller.owner?.stats.ready&&!controller.owner.valid()&&!controller.pending)return{frames,controller:{...controller.stats},index:{...controller.index.stats},submissions:{...controller.submissions.stats},owner:{...controller.owner.stats},anchor:controller.owner.anchor.slice(),selectedAnchor:controller.owner.budget.anchor.slice(),budgetTiming:controller.owner.budget.timing,nativeMapUnchanged:controller.owner.nativeShadow.map===controller.owner.nativeMap,viewport:[d.renderer.domElement.width,d.renderer.domElement.height]};}
 throw Error('Coverage did not settle: '+JSON.stringify(controller.stats));
}
export {captureWholeSourceBudget42} from './shadow-whole-source-budget42.js';

export {ShadowWindowRuntime42} from './shadow-window-runtime42.js';
