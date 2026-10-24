import {projectRiverSection} from './river-section.js';
import {FOREST_REACH39_SOURCE} from './forest-reach39-source.js';
const smooth=x=>{x=Math.max(0,Math.min(1,x));return x*x*(3-2*x);};
function deposition(offset,side){const cs=FOREST_REACH39_SOURCE.controls,j=side<0?0:1,k=cs.findIndex(c=>c.offset>=offset);if(k<=0)return cs[0].sides[j].deposition;const a=cs[k-1],b=cs[k],u=smooth((offset-a.offset)/(b.offset-a.offset));return a.sides[j].deposition*(1-u)+b.sides[j].deposition*u;}
// One bounded, source-owned assignment; all donor records remain present.
// Spatial variation comes from original roots and actual bend/ground, not rows.
export function createForestReachCommunity39(world,roots,{accept}={}){
 const reach=world.hydrology?.forestReach39,placed=new Map(),records=roots.map(r=>({...r})).sort((a,b)=>a.id.localeCompare(b.id)),stats={roots:roots.length,moved:0,maxShift:0,eligible:0,crowded:0,wetOrSlope:0,footprint:0};
 if(!reach)return{placed,stats};
 const local=world.hydrology.segments.filter(reach.activeSegment);
 const locate=(x,z)=>{let best=null;for(const segment of local){const dx=segment.b.x-segment.a.x,dz=segment.b.z-segment.a.z,t=Math.max(0,Math.min(1,((x-segment.a.x)*dx+(z-segment.a.z)*dz)/(dx*dx+dz*dz))),p=projectRiverSection(x,z,segment,t);if(!best||p.distance<best.distance)best={...p,segment};}return best;};
 const eligible=[];
 for(const root of records){const p=locate(root.x,root.z);if(!p)continue;const offset=p.section.distance-reach.origin;if(Math.abs(offset)>=18)continue;
  const side=p.signed<0?-1:1,deposit=deposition(offset,side),q=reach.waterSectionAt(p.segment,p.t),half=side<0?q.left:q.right,gap=p.distance-half;
  if(gap<.35||gap>4)continue;
  const treeDistance=Math.min(...FOREST_REACH39_SOURCE.trees.map(t=>Math.hypot(t.x-root.x,t.z-root.z)));
  if(treeDistance<1.1)continue;
  eligible.push({root,p,q,side,gap,offset,deposit,treeDistance});
 }
 stats.eligible=eligible.length;
 // The pre-existing inner edge is measured from complete source populations,
 // not a fixed strip measured from water. Move a community together so its
 // source irregularity survives and no new uniformly spaced shoreline row forms.
 for(const e of eligible){const neighbours=eligible.filter(n=>n.side===e.side&&Math.abs(n.offset-e.offset)<4).map(n=>n.gap).sort((a,b)=>a-b);
  const inner=neighbours[Math.floor((neighbours.length-1)*.25)]??e.gap;
  const strength=.45+.55*smooth((e.deposit-.5)/.35);
  const translation=Math.min(1.6,Math.max(0,inner-.42))*strength;
  const outerRelease=1-smooth((e.gap-Math.max(inner,1.8))/(4-Math.max(inner,1.8)+.0001));
  const endpoint=smooth((18-Math.abs(e.offset))/4),treeRelease=smooth((e.treeDistance-1.1)/1.1);
  const shift=translation*outerRelease*endpoint*treeRelease;
  for(const fraction of [1,.8,.6,.4]){const distance=shift*fraction;if(distance<.08)continue;
   const x=e.root.x+e.q.fz*e.side*distance,z=e.root.z-e.q.fx*e.side*distance;
   const water=world.hydrology.sampleAt(x,z,{includeDepth:false});if(water.insideWater||water.shoreDistance<.08||world.surface.normalAt(x,z,.25).y<.86){stats.wetOrSlope++;continue;}
   const candidate={...e.root,x,z,y:world.surface.heightAt(x,z)-.035};
   if(accept&&!accept(candidate)){stats.footprint++;continue;}
   placed.set(e.root.id,candidate);break;
  }
 }
 // Resolve the final simultaneous layout, not each move against neighbours
 // that are about to move too. Existing close pairs may remain equally close;
 // no new root-centre overlap is accepted. Rejections retain original records.
 let changed=true;while(changed){changed=false;for(let i=0;i<records.length;i++)for(let j=i+1;j<records.length;j++){
  const a=records[i],b=records[j],pa=placed.get(a.id),pb=placed.get(b.id);if(!pa&&!pb)continue;
  const old=Math.hypot(a.x-b.x,a.z-b.z),minimum=Math.min(.48*(a.s+b.s),old),x=pa??a,y=pb??b;
  if(Math.hypot(x.x-y.x,x.z-y.z)>=minimum-1e-6)continue;
  const remove=pa&&pb?(Math.hypot(pa.x-a.x,pa.z-a.z)>Math.hypot(pb.x-b.x,pb.z-b.z)?a.id:b.id):pa?a.id:b.id;
  placed.delete(remove);stats.crowded++;changed=true;
 }}
 stats.moved=placed.size;for(const r of records){const p=placed.get(r.id);if(p)stats.maxShift=Math.max(stats.maxShift,Math.hypot(p.x-r.x,p.z-r.z));}
 stats.bands=Array.from({length:6},(_,i)=>{const selected=eligible.filter(e=>e.offset>=-18+i*6&&e.offset< -12+i*6),moved=selected.filter(e=>placed.has(e.root.id));return{from:-18+i*6,to:-12+i*6,sources:selected.length,moved:moved.length,beforeWithin80cm:selected.filter(e=>e.gap<.8).length,afterWithin80cm:selected.filter(e=>{const root=placed.get(e.root.id)??e.root,p=locate(root.x,root.z),q=reach.waterSectionAt(p.segment,p.t);return p.distance-(p.signed<0?q.left:q.right)<.8;}).length};});
 return{placed,stats};
}
