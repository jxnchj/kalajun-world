import {reachSettledWaterSafe41} from './reach-rendered-seat41.js';
import source from './generated/forest-reach-cover41-source.json' with {type:'json'};
import {FOREST_REACH39_SOURCE} from './forest-reach39-source.js';
// Fixed identities come from the browser-accepted complete v2 community. A new
// bank must move conflicting roots, never silently discard failed candidates.
export const PRESERVED_REACH_COVER41=source;
export function* preservedReachCover41(world,pools,{seat,make,excluded}){
 const reach=world.hydrology.forestReach39;
 for(const record of source.records){
  const {seed,edge,...original}=record,pool=pools.find(p=>p.kind===record.kind),prototype=record.kind==='mat'?make(seed):pool.prototype;
  if(edge)prototype.geometry.scale(1.3,1.8,1.3);
  let accepted=null;
  const tryAt=(dx,dz)=>{
   const root={...original,x:original.x+dx,z:original.z+dz};root.y=world.surface.heightAt(root.x,root.z);
   const q=world.hydrology.sampleAt(root.x,root.z,{includeDepth:false}),p=reach.queryAt(root.x,root.z);
   if(!p||Math.abs(p.section.distance-reach.origin)>=17.7||q.insideWater||q.shoreDistance<.025||q.shoreDistance>1.8||excluded(root.x,root.z,.05)||FOREST_REACH39_SOURCE.trees.some(t=>Math.hypot(t.x-root.x,t.z-root.z)<.4))return false;
   const asset=seat(world,root,prototype,excluded);if(!asset)return false;if(!reachSettledWaterSafe41(world,root,asset)){asset.geometry.dispose();return false;}
   root.offset=p.section.distance-reach.origin;root.coverAsset=asset;root.brookAsset={geometries:[asset.geometry]};root.sourceMove41=Math.hypot(dx,dz);accepted=root;return true;
  };
  tryAt(0,0);
  // Search nearest rings in two dimensions, retaining the source orientation
  // and scale. Complete leaf feet and swept water/stone tests decide acceptance.
  for(let ring=1;ring<=20&&!accepted;ring++){const radius=ring*.08,steps=Math.max(12,Math.ceil(radius*2*Math.PI/.08));for(let j=0;j<steps&&!accepted;j++){const a=(j+.37)*Math.PI*2/steps;tryAt(Math.cos(a)*radius,Math.sin(a)*radius);}}
  if(record.kind==='mat')prototype.geometry.dispose();
  if(!accepted)throw Error('Reach41 cannot safely retain '+record.id);
  pool.records.push(accepted);yield {edge,moved:accepted.sourceMove41>0};
 }
}
