import {riverSectionAt} from './river-section.js';
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const smooth=(a,b,x)=>{const t=clamp((x-a)/(b-a),0,1);return t*t*(3-2*t);};
// Designed bank relief, not a surveyed water-level correction. The coarse DEM
// gives this brook only 3.5 cm of freeboard; lower the shared water/bed locally
// so the real bank face can exist. No colour stripe or decorative cover is added.
export function applyBrookIncision(lines,segments,viewpoints,{heightAt,protectedAt=()=>null}={}){
  const view=viewpoints.find(v=>v.id==='brook-lanchuan'),anchor=segments.find(s=>s.id===view?.segmentId);
  if(!anchor)return {nodes:0,segments:0,reason:'no-brook-anchor'};
  const line=lines.find(l=>l.id===anchor.lineId);if(line.incisionResult)return line.incisionResult;
  const nodes=line.nodes,active=new Map(segments.filter(s=>s.lineId===line.id).map(s=>[s.index,s]));
  const locks=[0,nodes.at(-1).distance];
  for(let i=1;i<nodes.length-1;i++)if(!active.has(i-1)||!active.has(i))locks.push(nodes[i].distance);
  for(const l of lines)if(l.join?.line===line)for(const j of [l.join.index,l.join.index+1])locks.push(nodes[j].distance);
  const origin=anchor.a.distance,levels=nodes.map(n=>n.level),cuts=nodes.map(n=>{
    const envelope=1-smooth(42,104,Math.abs(n.distance-origin));
    const clearance=Math.min(...locks.map(d=>Math.abs(n.distance-d)));
    return .22*envelope*smooth(8,28,clearance);
  });
  // A bounded change in grade, retaining >=65% of the old downhill drop.
  // Backward propagation prevents the downstream release from making water
  // flow uphill across coarse DEM plateaux; forward propagation bounds entry.
  // This only reduces the proposed cut; it never extends its footprint.
  for(let i=1;i<nodes.length;i++)cuts[i]=Math.min(cuts[i],cuts[i-1]+.004*(nodes[i].distance-nodes[i-1].distance));
  for(let i=nodes.length-2;i>=0;i--){
    const span=nodes[i+1].distance-nodes[i].distance,drop=Math.max(0,levels[i]-levels[i+1]);
    cuts[i]=Math.min(cuts[i],cuts[i+1]+Math.min(.004*span,.35*drop));
  }
  const affected=[];let maxCut=0,maxGradeChange=0;
  for(const [i,s] of active){
    if(cuts[i]<1e-10&&cuts[i+1]<1e-10)continue;
    const candidate={...s,a:{...s.a,level:levels[i]-cuts[i]},b:{...s.b,level:levels[i+1]-cuts[i+1]}};let excavation=0;
    for(let sample=0;sample<=8;sample++){
      const q=riverSectionAt(candidate,sample/8);
      for(const side of [-1,1]){
        const half=side<0?q.left:q.right,extent=side<0?q.shoulderLeft:q.shoulderRight;
        for(const radius of [0,half*.5,half,half+(q.outer-half)*extent]){
          const x=q.x-q.fz*side*radius,z=q.z+q.fx*side*radius;
          if(protectedAt(x,z,.025))return {nodes:0,segments:0,reason:'protected-ground'};
          const ground=heightAt(x,z);excavation=Math.max(excavation,ground-q.level+q.depth);
          if(radius<=half&&ground<q.level-.025)return {nodes:0,segments:0,reason:'low-water-edge'};
        }
      }
      if(excavation>2.2+Math.min(2.3,q.sourceWidth*.25))return {nodes:0,segments:0,reason:'excessive-cut'};
    }
    const slope=(candidate.a.level-candidate.b.level)/s.length;
    if(slope< -1e-10)throw new Error('Brook incision must retain a downhill hydraulic grade');
    maxGradeChange=Math.max(maxGradeChange,Math.abs(slope-s.slope));maxCut=Math.max(maxCut,excavation);affected.push({s,slope,excavation});
  }
  if(Math.max(...cuts)<.12)return {nodes:0,segments:0,reason:'insufficient-hydraulic-room'};
  nodes.forEach((n,i)=>{if(cuts[i]>0){n.incisionSourceLevel=levels[i];n.level=levels[i]-cuts[i];}});
  for(const {s,slope,excavation} of affected){s.slope=slope;s.maxCut=excavation;s.incision=true;}
  return line.incisionResult={lineId:line.id,nodes:cuts.filter(d=>d>1e-10).length,segments:affected.length,maxLowering:Math.max(...cuts),anchorLowering:cuts[anchor.index],maxGradeChange,maxCut,reachRadius:104,
    policy:'shared bed and water lowered inside unchanged bank footprint; monotone hydraulic grade; exact geographic anchors, junction levels, protected facilities and source endpoints'};
}
