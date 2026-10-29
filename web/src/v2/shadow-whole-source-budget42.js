// Read-only budget: all static source geometry retained, complete instanced roots/brushes.
import {ShadowWindowSubmissions42} from './shadow-window-submissions42.js';
import {actualBrushPlans42} from './shadow-window-budget42.js';
import {countColumnMesh42,shadowColumnBasis42} from './shadow-column-audit42.js';
import {visibleGroundAnchor42} from './shadow-window-anchor42.js';
export function wholeSourceTriangles42(source){const g=source.geometry,total=g.index?.count??g.attributes.position.count,start=Math.max(0,g.drawRange.start),end=Math.min(total,Number.isFinite(g.drawRange.count)?start+g.drawRange.count:total),instances=source.isInstancedMesh?source.count:g.isInstancedBufferGeometry?g.instanceCount:1;if(!Number.isFinite(instances)||instances<0)throw Error('Unknown finite instance count: '+source.name);return Math.max(0,Math.floor((end-start)/3))*instances;}
export async function captureWholeSourceBudget42(api,{sizes=[4,4.5,6],anchor=null}={}){
 if(!sizes.length||sizes.some(s=>!Number.isFinite(s)||s<=0))throw Error('Invalid sizes');
 const d=api.debug,shadow=d.environment.csm.lights[0].shadow,oldLight=shadow.needsUpdate,oldMap=d.renderer.shadowMap.needsUpdate,probe=new ShadowWindowSubmissions42(d.renderer,shadow),started=performance.now();
 try{
  shadow.needsUpdate=true;d.renderer.shadowMap.needsUpdate=true;d.renderFrozenWorld();
  const sources=probe.sources(),revision=probe.revision,hit=anchor?{point:anchor}:visibleGroundAnchor42(d.camera,api.world.surface);if(!hit)throw Error('No visible nearby ground');
  const basis=shadowColumnBasis42(d.environment.sun.toArray()),brushes=actualBrushPlans42(d.ecology,{basis,anchor:hit.point,sizes,sources}),station=new Set(brushes.flatMap(b=>[b.needle,b.twig])),cache=new WeakMap(),terrain=new Set(d.terrain.materials||[d.terrain.material]),rows=[];
  for(const source of sources){if(station.has(source))continue;if(source.name.startsWith('gpu-'))throw Error('Unmapped GPU source '+source.name);
   const t=terrain.has(source.material),whole=wholeSourceTriangles42(source);let selected=sizes.map(()=>whole),method='all-static-source';
   if(source.isInstancedMesh&&!source.isSkinnedMesh){selected=countColumnMesh42(source,{basis,anchor:hit.point,sizes,wholeRoots:true,boundsCache:cache}).wholeRootKept;method='complete-root-wind-bounds';}
   if(source.isSkinnedMesh)method='all-skinned-source';
   rows.push({id:source.id,name:source.name,method,terrain:t,whole,submitted:selected.map(n=>n*(t?2:1))});
  }
  if(probe.revision!==revision)throw Error('Native source changed during budget');
  return {scope:'Actual nearest submissions; all static source geometry, full skinned sources, full wind-bounded roots and brush runs. No triangle filtering, mask creation, or performance claim.',sizes,anchor:hit,basis,submissions:{...probe.stats},viewport:api.getSnapshot().viewport,total:sizes.map((_,k)=>brushes.reduce((n,b)=>n+b.wholeBrushKept[k],0)+rows.reduce((n,r)=>n+r.submitted[k],0)),staticTotal:rows.filter(r=>r.method!=='complete-root-wind-bounds').reduce((n,r)=>n+r.submitted[0],0),brushes:brushes.map(({key,wholeBrushKept,sourceTriangles})=>({key,wholeBrushKept,sourceTriangles})),rows,cpuMs:performance.now()-started};
 }finally{probe.dispose();shadow.needsUpdate=oldLight;d.renderer.shadowMap.needsUpdate=oldMap;}
}
