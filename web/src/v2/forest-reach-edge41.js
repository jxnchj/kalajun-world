import {REACH_SURFACE41_PATCHES} from './forest-reach-surface41.js';
const rand=(a,b)=>{let h=Math.imul(a+913,1597334677)^Math.imul(b+717,3812015801);h=Math.imul(h^(h>>>16),2246822519);return((h^(h>>>13))>>>0)/4294967296;};
// Additional low rooting growth on authored banks, not a shoreline-wide row.
// Existing vegetation is retained. Each leaf's two feet and complete swept
// surface are accepted by the same contact checks as the original bank cover.
export function* reachEdgeRoots41(world,pool,{make,seat,excluded}){
 const reach=world.hydrology.forestReach39;if(!reach?.stats.form41)return;
 const segments=world.hydrology.segments.filter(reach.activeSegment);
 for(const [patchIndex,patch]of REACH_SURFACE41_PATCHES.entries()){
  if(patch.kind!=='root')continue;
  for(let row=-9;row<=9;row++)for(let col=0;col<4;col++){
   const along=(row+(rand(row,col+patchIndex*71)-.5)*.8)*.17;
   if(Math.abs(along)>patch.along*.9)continue;
   // Different sides and lobes retain uneven length and ragged inland edges.
   const fraction=Math.abs(along)/patch.along,spread=.40*(1-fraction*fraction);
   const outward=.11+(col+rand(col,row+patchIndex*57)*.85)*.13;
   if(outward>spread||rand(row+37,col+patchIndex*11)>.83)continue;
   const distance=reach.origin+patch.offset+along,s=segments.find(s=>s.a.distance<=distance&&s.b.distance>=distance);if(!s)continue;
   const t=(distance-s.a.distance)/(s.b.distance-s.a.distance),q=reach.waterSectionAt(s,t),half=patch.side<0?q.left:q.right,x=q.x-q.fz*patch.side*(half+outward),z=q.z+q.fx*patch.side*(half+outward),hydro=world.hydrology.sampleAt(x,z,{includeDepth:false});
   if(hydro.insideWater||hydro.shoreDistance<.025||excluded(x,z,.02)||world.surface.normalAt(x,z,.12).y<.88)continue;
   const root={id:'reach41:edge:'+patchIndex+':'+row+':'+col,x,y:world.surface.heightAt(x,z),z,s:1.0+.25*rand(row+51,col+patchIndex*13),rot:rand(row+21,col)*Math.PI*2,kind:'mat',offset:patch.offset+along};root.sy=root.s;
   const variant=make(Math.imul(row+53,31)^col^patchIndex*711);
   // These low leaves stay 3–6cm high, unlike the upright sedges behind them.
   variant.geometry.scale(1.3,1.8,1.3);
   const asset=seat(world,root,variant,excluded);variant.geometry.dispose();if(!asset)continue;
   root.coverAsset=asset;root.brookAsset={geometries:[asset.geometry]};yield root;
  }
 }
}
