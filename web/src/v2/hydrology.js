import {createForestReach39} from './forest-reach39.js';
import {createForestBankCurvature38,forestBankCurvatureHeight38} from "./forest-bank-curvature-v38.js";
import {FOREST_BANK_LINE,forestBankRootCover,forestRootedShoulderHeight} from "./forest-bank-shoulder.js";
import {sampleMeadowField} from "./meadow-surface.js";
import { applyBrookIncision } from "./river-incision.js";
import { applyRepresentativeMeanders, applyBrookMeander, applyValleyMeander } from "./river-meander.js";
import { riverBankMargin, riverSectionDepth, riverBankRise, riverValleySedimentRise, riverBankMaterialDistance, projectRiverSection, applyRepresentativeBanks, applyBrookBendBanks, applyValleyDeposits } from "./river-section.js";
// Shared, cut-only channel geometry derived from the preserved DEM drainage lines.
// This is a bounded visual/physical channel model, not a surveyed river or fluid solver.
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const mix=(a,b,t)=>a+(b-a)*t;
const smooth=(a,b,x)=>{const t=clamp((x-a)/(b-a),0,1);return t*t*(3-2*t);};
const EMPTY=Object.freeze({wetness:0,riverBed:0,bank:0,depth:0,waterLevel:null,surfaceLevel:null,width:0,flowX:0,flowZ:0,insideWater:false,shoreDistance:Infinity,distance:Infinity,id:null});
const CELL=32;
const key=(x,z)=>Math.floor(x/CELL)+","+Math.floor(z/CELL);
const overlap=(a,b)=>a.minX<=b.maxX&&a.maxX>=b.minX&&a.minZ<=b.maxZ&&a.maxZ>=b.minZ;
export function riverLineId(points){
  let h=2166136261,g=2246822519;
  for(const c of JSON.stringify(points)){h=Math.imul(h^c.charCodeAt(0),16777619);g=Math.imul(g^c.charCodeAt(0),3266489917);}
  return "river-"+(h>>>0).toString(16)+"-"+(g>>>0).toString(16);
}
export function projectSegment(x,z,a,b){
  const dx=b.x-a.x,dz=b.z-a.z,d2=dx*dx+dz*dz,t=d2?clamp(((x-a.x)*dx+(z-a.z)*dz)/d2,0,1):0;
  return {t,x:mix(a.x,b.x,t),z:mix(a.z,b.z,t),distance:Math.hypot(x-mix(a.x,b.x,t),z-mix(a.z,b.z,t))};
}
function insert(bins,item,bounds){
  for(let ix=Math.floor(bounds.minX/CELL);ix<=Math.floor(bounds.maxX/CELL);ix++)
    for(let iz=Math.floor(bounds.minZ/CELL);iz<=Math.floor(bounds.maxZ/CELL);iz++){
      const k=ix+","+iz;if(!bins.has(k))bins.set(k,[]);bins.get(k).push(item);
    }
}
function boundsOf(nodes,margin=0){return {minX:Math.min(...nodes.map(n=>n.x))-margin,maxX:Math.max(...nodes.map(n=>n.x))+margin,minZ:Math.min(...nodes.map(n=>n.z))-margin,maxZ:Math.max(...nodes.map(n=>n.z))+margin};}
const bankMargin=riverBankMargin;
function makeProtection(entities,assets,objects){
  const bins=new Map();
  for(const e of entities){
    const asset=assets[e.assetId],p=asset?.pad,b=asset?.bounds,scale=e.scale||{x:1,z:1};
    const cx=(p?.cx??(b?(b.min[0]+b.max[0])/2:0))*scale.x,cz=(p?.cz??(b?(b.min[2]+b.max[2])/2:0))*scale.z;
    const hx=(p?.hx??(b?(b.max[0]-b.min[0])/2:2))*scale.x,hz=(p?.hz??(b?(b.max[2]-b.min[2])/2:2))*scale.z;
    // Pad banks extend 6 m; the extra margin also covers legacy separation moves.
    const c=Math.cos(e.rot||0),s=Math.sin(e.rot||0),radius=Math.hypot(cx,cz)+Math.hypot(hx,hz)+12;
    insert(bins,{kind:"building",id:e.id,x:e.x,z:e.z,c,s,cx,cz,hx:hx+12,hz:hz+12},
      {minX:e.x-radius-14,maxX:e.x+radius+14,minZ:e.z-radius-14,maxZ:e.z+radius+14});
  }
  for(const [kind,routes] of [["road",objects.tracks||[]],["path",objects.paths||[]],["boardwalk",objects.boardwalks||[]]])
    for(const route of routes)for(let j=0;j<(route.pts?.length||0)-1;j++){
      const a={x:route.pts[j][0],z:route.pts[j][1]},b={x:route.pts[j+1][0],z:route.pts[j+1][1]},radius=(route.width||1.5)/2+1.5;
      insert(bins,{kind,a,b,radius},boundsOf([a,b],radius+12));
    }
  return (x,z,padding=0)=>{
    for(const p of bins.get(key(x,z))||[]){
      if(p.a){if(projectSegment(x,z,p.a,p.b).distance<p.radius+padding)return p.kind;}
      else{const dx=x-p.x,dz=z-p.z;if(Math.abs(dx*p.c-dz*p.s-p.cx)<p.hx+padding&&Math.abs(dx*p.s+dz*p.c-p.cz)<p.hz+padding)return p.kind;}
    }
    return null;
  };
}
export function createHydrology({streamData={lines:[]},heightAt,entities=[],assetMetadata={},objects={},naturalBanks=true,forestRootedShoulder38=false,forestBankCurvature38=false,forestReach39=false,landcoverAt,riverMeanders=new URLSearchParams(globalThis.location?.search??"").get("riverMeanders")!=="0",valleyLandform=naturalBanks&&new URLSearchParams(globalThis.location?.search??"").get("valleyLandform")!=="0",valleyMeanders=valleyLandform&&riverMeanders!==false&&new URLSearchParams(globalThis.location?.search??"").get("valleyMeanders")!=="0",valleySection=valleyMeanders&&new URLSearchParams(globalThis.location?.search??"").get("valleySection")!=="0"}){
  if(typeof heightAt!=="function")throw new TypeError("Hydrology requires the uncarved physical height function");
  const valleySource=valleyMeanders?createHydrology({streamData,heightAt,entities,assetMetadata,objects,naturalBanks,riverMeanders,valleyLandform,valleyMeanders:false,valleySection:false}):null;
  const protectedAt=makeProtection(entities,assetMetadata,objects),sourceIndex=new Map(),seen=new Set();
  const lines=(streamData.lines||[]).map((points,sourceIndex)=>{
    const id=riverLineId(points);if(seen.has(id))throw new Error("Duplicate river source: "+id);seen.add(id);
    const nodes=points.map(p=>{if(!p.slice(0,3).every(Number.isFinite))throw new TypeError("Invalid river point");return{x:p[0],z:p[1],width:clamp(p[2],.5,14)};});
    return{id,sourceIndex,nodes,join:null};
  }).filter(l=>l.nodes.length>1).sort((a,b)=>a.id.localeCompare(b.id));
  for(const line of lines)for(let i=0;i<line.nodes.length-1;i++){
    const a=line.nodes[i],b=line.nodes[i+1];insert(sourceIndex,{line,i,a,b},boundsOf([a,b],8));
  }
  // D8 traces share junctions, but independent resampling/smoothing can shift them a few metres.
  // Snap only a downstream endpoint to an equal/larger channel, never an arbitrary nearby head.
  for(const line of lines){
    const tail=line.nodes.at(-1);let best=null;
    for(const candidate of sourceIndex.get(key(tail.x,tail.z))||[]){
      if(candidate.line===line)continue;
      const p=projectSegment(tail.x,tail.z,candidate.a,candidate.b),width=mix(candidate.a.width,candidate.b.width,p.t);
      if(p.distance>7||width<tail.width*.9)continue;
      if(!best||p.distance<best.distance)best={...p,line:candidate.line,index:candidate.i};
    }
    if(best){line.join=best;tail.x=best.x;tail.z=best.z;}
  }
  const unresolved=[],segments=[],bins=new Map();let sampled=0,sourceLength=0,enabledLength=0;
  function profile(line,visiting=new Set()){
    if(line.ready)return;
    if(visiting.has(line.id)){line.join=null;return;}
    visiting.add(line.id);
    if(line.join)profile(line.join.line,visiting);
    const nodes=line.nodes;let previous=Infinity,distance=0;
    for(let i=0;i<nodes.length;i++){
      const n=nodes[i],prev=nodes[Math.max(0,i-1)],next=nodes[Math.min(nodes.length-1,i+1)];
      const len=Math.hypot(next.x-prev.x,next.z-prev.z)||1;n.flowX=(next.x-prev.x)/len;n.flowZ=(next.z-prev.z)/len;
      if(i)distance+=Math.hypot(n.x-prev.x,n.z-prev.z);n.distance=distance;
      n.base=heightAt(n.x,n.z);n.depth=.18+Math.min(.65,n.width*.055);
      let shore=Infinity;
      for(const s of [-.56,-.28,0,.28,.56])shore=Math.min(shore,heightAt(n.x-n.flowZ*n.width*s,n.z+n.flowX*n.width*s));
      n.level=Math.min(shore-.035,previous);previous=n.level;sampled++;
    }
    if(line.join?.line.ready){
      const j=line.join,a=j.line.nodes[j.index],b=j.line.nodes[j.index+1],target=mix(a.level,b.level,j.t),tail=nodes.at(-1);
      if(target<=tail.level+.02){
        const end=tail.distance,start=Math.max(0,end-32);
        // Lower the tail into its receiving channel, preserving the previous downhill profile.
        for(const n of nodes)if(n.distance>start)n.level=Math.min(n.level,mix(nodes.find(v=>v.distance>=start)?.level??n.level,target,smooth(start,end,n.distance)));
        tail.level=target;
      }else{
        line.joinConflict=true;
      }
    }
    let prevLevel=Infinity;
    for(const n of nodes){n.level=Math.min(n.level,prevLevel);prevLevel=n.level;}
    line.maxWidth=Math.max(...nodes.map(n=>n.width));
    line.bounds=boundsOf(nodes,Math.max(...nodes.map(n=>n.width*.5+bankMargin(n.width))));
    line.ready=true;visiting.delete(line.id);
  }
  for(const line of lines)profile(line);
  for(const line of lines){
    for(let i=0;i<line.nodes.length-1;i++){
      const a=line.nodes[i],b=line.nodes[i+1],length=Math.hypot(b.x-a.x,b.z-a.z);if(length<.001)continue;
      sourceLength+=length;
      const width=Math.max(a.width,b.width),radius=width*.5+bankMargin(width),s={id:line.id+":"+i,lineId:line.id,index:i,a,b,length,bounds:boundsOf([a,b],radius)};
      let reason=null,maxCut=0;
      for(const t of [0,.5,1]){
        const x=mix(a.x,b.x,t),z=mix(a.z,b.z,t),w=mix(a.width,b.width,t),level=mix(a.level,b.level,t);
        const conflict=protectedAt(x,z,w*.5+bankMargin(w));
        if(conflict)reason="protected-"+conflict;
        const depth=mix(a.depth,b.depth,t),cut=heightAt(x,z)-level+depth;maxCut=Math.max(maxCut,cut);
        if(cut>2.2+Math.min(2.3,w*.25)&&!reason)reason="excessive-cut";
        // Also check both banks between source nodes: a water ribbon may not bridge a low bank.
        const fx=(b.x-a.x)/length,fz=(b.z-a.z)/length;
        for(const side of [-.56,.56])if(heightAt(x-fz*w*side,z+fx*w*side)<level-.06&&!reason)reason="low-bank";
      }
      if(line.joinConflict&&i>line.nodes.length-10)reason="junction-level";
      if(reason){unresolved.push({...s,reason,requiredCut:maxCut});continue;}
      s.maxCut=maxCut;s.flowX=(b.x-a.x)/length;s.flowZ=(b.z-a.z)/length;s.slope=Math.max(0,(a.level-b.level)/length);
      segments.push(s);insert(bins,s,s.bounds);enabledLength+=length;
    }
  }
  const activeIds=new Set(segments.map(s=>s.lineId)),activeLines=lines.filter(l=>activeIds.has(l.id));
  let physicalHeight=null,forestReach=null;
  function query(x,z,source=false){
    let best=null,score=Infinity,stripBest=null,stripScore=Infinity,naturalStrip=false;
    for(const current of bins.get(key(x,z))||[]){
      const s=source?(current.valleySource??current):current;
      let p=projectSegment(x,z,s.a,s.b),section=null;
      if(s.naturalBanks){p=projectRiverSection(x,z,s,p.t);section=p.section;}
      const width=section?.width??mix(s.a.width,s.b.width,p.t),half=section?(p.signed<0?section.left:section.right):width/2;
      const margin=section?section.outer-half:bankMargin(width);
      if(p.distance>=half+margin)continue;
      const q=p.distance/half;
      // Prefer the nearest normalised channel, stable id breaks exact junction ties.
      const normalBest=q<score||(q===score&&s.id<(best?.segment.id??"~"));
      // A segment's round end can overlap the next segment's actual ribbon.
      // On modified reaches, prefer an actual cross-section over that cap;
      // keep the same nearest-width rule, level and depth within the ribbon.
      // 1 mm only tolerates Float32 endpoint roundoff, not another wet area.
      const along=(x-p.x)*(section?.fx??s.flowX)+(z-p.z)*(section?.fz??s.flowZ);
      const inStrip=Math.abs(along)<.001;
      if(inStrip&&s.naturalBanks)naturalStrip=true;
      const stripWins=inStrip&&(q<stripScore||(q===stripScore&&s.id<(stripBest?.segment.id??"~")));
      if(normalBest||stripWins){
        const candidate={...p,segment:s,width,half,margin,section,level:mix(s.a.level,s.b.level,p.t),channelDepth:mix(s.a.depth,s.b.depth,p.t)};
        if(normalBest){score=q;best=candidate;}
        if(stripWins){stripScore=q;stripBest=candidate;}
      }
    }
    // The new wide-bank section owns its whole physical shoulder. Selecting a
    // neighbouring round end here creates an artificial step in hydraulic
    // level across a dry bank, despite a continuous longitudinal water level.
    const stripLimit=stripBest?.section?.valleyWeight>0?stripBest.section.outer:stripBest?.half;
    return naturalStrip&&stripBest.distance<=stripLimit+.001?stripBest:best;
  }
  function bedFor(q,base){
    const d=q.distance,inside=d<=q.half;
    if(q.section){
      const across=d/q.half*(q.signed<0?-1:1),weight=q.section.weight;
      if(inside)return Math.min(base,q.level-riverSectionDepth(q.section,across));
      const u=clamp((d-q.half)/q.margin,0,1),edge=q.level-.025*(1-weight);
      // A shallow depositional shoulder and a compact opposite bank share
      // the water's side strengths, inside the unchanged protection footprint.
      const rise=riverBankRise(q.section,q.signed<0?-1:1,u);
      const cut=Math.min(base,mix(edge,base,rise));
      // This opt-in deposited material can rise above a coarse DEM. The old
      // generic cut-only minimum flattened the entire new point bar to water.
      return cut+riverValleySedimentRise(q.section,q.signed<0?-1:1,d);
    }
    const bowl=q.level-.025-q.channelDepth*Math.max(0,1-(d/q.half)**2);
    const edge=q.level-.025,blend=1-smooth(0,q.margin,Math.max(0,d-q.half));
    return Math.min(base,inside?bowl:mix(base,edge,blend));
  }
  function baselineBedHeightAt(x,z,base=heightAt(x,z)){const q=query(x,z);return q?bedFor(q,base):base;}
  function currentBedHeightAt(x,z,base=heightAt(x,z)){
    const q=query(x,z);let height=q?bedFor(q,base):base;
    if(forestBankCurvature38)height=forestBankCurvatureHeight38({field:forestCurvatureField,query:q,rawHeight:base,baseline:height,protectedGround:Boolean(q&&Math.abs((q.section?.distance??Infinity)-(forestShoulderAnchor?.a.distance??0))<18&&protectedAt(x,z))});
    if(!forestRootedShoulder38||!q?.section||q.segment.lineId!==FOREST_BANK_LINE||!forestShoulderAnchor)return height;
    if(Math.abs(q.section.distance-forestShoulderAnchor.a.distance)>=60||q.distance<=q.half||q.distance>=q.section.outer||base<=q.section.level)return height;
    return forestRootedShoulderHeight({lineId:q.segment.lineId,section:q.section,side:q.signed<0?-1:1,distance:q.distance,height,rawHeight:base,
      rootCover:forestBankRootCover(landcoverAt(x,z),sampleMeadowField(x,z)),offset:q.section.distance-forestShoulderAnchor.a.distance,protectedGround:Boolean(protectedAt(x,z))});
  }
  function bedHeightAt(x,z,base=heightAt(x,z)){return forestReach?forestReach.heightAt(x,z):currentBedHeightAt(x,z,base);}
  function sampleBaseAt(x,z,{includeDepth=true}={},surface=physicalHeight){
    const q=query(x,z);if(!q)return EMPTY;
    const inside=q.distance<=q.half;
    const materialDistance=q.section?riverBankMaterialDistance(q.section,q.signed<0?-1:1,q.distance):q.distance;
    const wetness=1-smooth(q.half*.65,q.half+q.margin,materialDistance);
    const actual=includeDepth?(surface?surface(x,z):bedFor(q,heightAt(x,z))):q.level-(q.section?riverSectionDepth(q.section,q.distance/q.half*(q.signed<0?-1:1)):q.channelDepth),depth=Math.max(0,q.level-actual);
    return {wetness,riverBed:1-smooth(q.half*.8,q.half+q.margin*.85,materialDistance),
      bank:Math.exp(-(((materialDistance-q.half)/Math.max(.25,q.margin*.48))**2))*wetness,
      depth:inside?depth:0,waterLevel:inside?q.level:null,surfaceLevel:q.level,width:q.width,flowX:q.segment.meander?q.section.fx:q.segment.flowX,flowZ:q.segment.meander?q.section.fz:q.segment.flowZ,
      insideWater:inside&&depth>.008,shoreDistance:q.distance-q.half,distance:q.distance,id:q.segment.id};
  }
  function sampleAt(x,z,options={}){
    const original=sampleBaseAt(x,z,options);if(!forestReach)return original;
    const q=forestReach.queryAt(x,z);if(!q||!forestReach.activeSegment(q.segment)||Math.abs(q.section.distance-forestReach.origin)>=18)return original;
    const section=forestReach.waterSectionAt(q.segment,q.t),half=q.signed<0?section.left:section.right,inside=q.distance<=half;
    const level=section.level,depth=Math.max(0,level-(physicalHeight?physicalHeight(x,z):bedHeightAt(x,z)));
    const margin=section.outer-half,wetness=1-smooth(half*.65,section.outer,q.distance),riverBed=1-smooth(half*.8,half+margin*.85,q.distance),bank=Math.exp(-(((q.distance-half)/Math.max(.25,margin*.48))**2))*wetness;
    return {...original,wetness,riverBed,bank,depth:inside?depth:0,waterLevel:inside?level:null,insideWater:inside&&depth>.008,shoreDistance:q.distance-half,width:section.width};
  }
  function intersectsBounds(rect,{minWidth=0}={}){
    if(![rect.minX,rect.maxX,rect.minZ,rect.maxZ,minWidth].every(Number.isFinite)||rect.minX>rect.maxX||rect.minZ>rect.maxZ)throw new RangeError("River bounds must be finite and ordered");
    if(!Object.values(rect).every(v=>Number.isSafeInteger(Math.floor(v/CELL))))throw new RangeError("River bounds exceed finite grid coordinates");
    if(rect.maxX-rect.minX>256||rect.maxZ-rect.minZ>256)return activeLines.some(l=>l.maxWidth>=minWidth&&overlap(l.bounds,rect));
    for(let ix=Math.floor(rect.minX/CELL);ix<=Math.floor(rect.maxX/CELL);ix++)for(let iz=Math.floor(rect.minZ/CELL);iz<=Math.floor(rect.maxZ/CELL);iz++)
      if((bins.get(ix+","+iz)||[]).some(s=>Math.max(s.a.width,s.b.width)>=minWidth&&overlap(s.bounds,rect)))return true;
    return false;
  }
  function nearSegments(x,z,radius){
    if(![x,z,radius].every(Number.isFinite)||radius<0)throw new RangeError("River query coordinates and radius must be finite; radius must be nonnegative");
    const rect={minX:x-radius,maxX:x+radius,minZ:z-radius,maxZ:z+radius},result=[],used=new Set();
    if(!Object.values(rect).every(v=>Number.isFinite(v)&&Number.isSafeInteger(Math.floor(v/CELL))))throw new RangeError("River query exceeds finite grid coordinates");
    for(let ix=Math.floor(rect.minX/CELL);ix<=Math.floor(rect.maxX/CELL);ix++)for(let iz=Math.floor(rect.minZ/CELL);iz<=Math.floor(rect.maxZ/CELL);iz++)
      for(const s of bins.get(ix+","+iz)||[])if(!used.has(s.id)){used.add(s.id);if(projectSegment(x,z,s.a,s.b).distance<=radius)result.push(s);}
    return result;
  }
  const reasons={};for(const s of unresolved)reasons[s.reason]=(reasons[s.reason]||0)+1;
  const originalLength=(streamData.lines||[]).reduce((sum,line)=>sum+line.slice(1).reduce((n,p,i)=>n+Math.hypot(p[0]-line[i][0],p[1]-line[i][1]),0),0);
  const stats={sourceLines:lines.length,sourcePoints:sampled,sourceLength:originalLength,profileLength:sourceLength,enabledSegments:segments.length,enabledLength,unresolvedSegments:unresolved.length,unresolvedLength:sourceLength-enabledLength,reasons,
    connectedJunctions:lines.filter(l=>l.join&&!l.joinConflict).length,policy:"cut-only bed; downhill profile; protected roads/buildings; excessive cuts omitted; source network is not surveyed"};
  
  for(const line of lines)line.points=line.nodes;
  const viewpoints=[];
  for(const [id,name,x,z,minWidth] of [["brook-lanchuan","岚川溪岸",-2180,3380,.8],["river-valley","草原河谷",-1500,3050,2.5],["river-forest","林缘流水",-3000,4900,1.2]]){
    let selected=null,score=Infinity;
    for(const s of segments){
      if(s.a.width<minWidth||s.slope>.22||s.index<12)continue;
      const d=Math.hypot(s.a.x-x,s.a.z-z)+s.slope*500;
      if(d<score){score=d;selected=s;}
    }
    if(!selected)continue;
    const s=selected,n=s.a,side=n.width/2+3.6,px=n.x-s.flowZ*side,pz=n.z+s.flowX*side;
    const tx=n.x+s.flowX*8,tz=n.z+s.flowZ*8;
    viewpoints.push({id,name,x:px,z:pz,above:1.8,yaw:Math.atan2(tx-px,-(tz-pz))*180/Math.PI,pitch:-10,segmentId:s.id});
  }
  function refreshMeanderIndex(){
    let delta=0;
    for(const line of lines)delta+=line.meanderResult?.lengthDelta??0;
    for(const s of segments){
      if(!s.meander)continue;
      // Remove obsolete cell membership as well as any previous refresh, then
      // index the new geometry. Old bounds remain provenance for fixed stones.
      const keys=new Set();
      for(const b of [s.meanderSource.bounds,s.bounds])for(let ix=Math.floor(b.minX/CELL);ix<=Math.floor(b.maxX/CELL);ix++)for(let iz=Math.floor(b.minZ/CELL);iz<=Math.floor(b.maxZ/CELL);iz++)keys.add(ix+","+iz);
      for(const k of keys){const entries=bins.get(k);if(!entries)continue;const kept=entries.filter(v=>v!==s);if(kept.length)bins.set(k,kept);else bins.delete(k);}
      insert(bins,s,s.bounds);
    }
    stats.profileLength=sourceLength+delta;stats.enabledLength=enabledLength+delta;
    if(stats.naturalBanks?.reaches)stats.naturalBanks.length=segments.filter(s=>s.naturalBanks).reduce((sum,s)=>sum+s.length,0);
    // The named entrance keeps the original bank-offset/look-ahead convention,
    // but it must follow the changed physical section, not the retired bed.
    const view=viewpoints.find(v=>v.id==="river-forest"),s=segments.find(s=>s.id===view?.segmentId);
    if(s?.meander){
      const n=s.a,side=n.width/2+3.6,x=n.x-s.flowZ*side,z=n.z+s.flowX*side;
      const tx=n.x+s.flowX*8,tz=n.z+s.flowZ*8;
      Object.assign(view,{x,z,yaw:Math.atan2(tx-x,-(tz-z))*180/Math.PI});
    }
  }
  stats.naturalBanks=naturalBanks?applyRepresentativeBanks(lines,segments,viewpoints):{reaches:0,segments:0,length:0,reachRadius:180};
  const brookLandform=new URLSearchParams(globalThis.location?.search??"").get("brookLandform")==="1";
  stats.brookIncision=naturalBanks&&(brookLandform||new URLSearchParams(globalThis.location?.search??"").get("brookIncision")==="1")?applyBrookIncision(lines,segments,viewpoints,{heightAt,protectedAt}):{nodes:0,segments:0,reason:"disabled"};
  stats.meanders=naturalBanks&&riverMeanders?applyRepresentativeMeanders(lines,segments,viewpoints,{heightAt,protectedAt,profile:riverMeanders==="v19"||new URLSearchParams(globalThis.location?.search??"").get("riverMeanders")==="v19"?"v19":"v22"}):{segments:0,nodes:0,maxOffset:0,reason:"disabled"};
  const brookRequested=brookLandform||new URLSearchParams(globalThis.location?.search??"").get("brookMeanders")==="1";
  stats.brookMeanders=naturalBanks&&brookRequested?applyBrookMeander(lines,segments,viewpoints,{heightAt,protectedAt,profile:brookLandform?"v38-landform":"v38-brook"}):{nodes:0,segments:0,reason:"disabled"};
  stats.brookBendBanks=brookLandform&&stats.brookIncision.nodes&&stats.brookMeanders.nodes?applyBrookBendBanks(lines,segments,viewpoints,{heightAt,protectedAt}):{nodes:0,reason:"disabled-or-no-safe-structure"};
  stats.valleyMeanders=valleyMeanders?applyValleyMeander(lines,segments,viewpoints,{heightAt,protectedAt}):{nodes:0,reason:'disabled'};
  stats.valleyDeposits=valleyLandform?applyValleyDeposits(lines,segments,viewpoints,{heightAt,protectedAt,sectionProfile:valleySection}):{nodes:0,reason:'disabled'};
  if(stats.meanders.nodes||stats.brookMeanders.nodes||stats.valleyMeanders.nodes){
    refreshMeanderIndex();
    stats.naturalBanks.policy="designed representative shallows; forest reach footprint follows the physically validated bend; water levels and facilities retained";
  }
  if(stats.brookIncision.nodes)stats.naturalBanks.policy="designed representative shallows; opt-in brook incision lowers shared water and bed with monotone hydraulic grade; geographic anchors, source interfaces and facilities retained";
  const forestShoulderAnchor=segments.find(s=>s.id===viewpoints.find(v=>v.id==="river-forest")?.segmentId);
  if(forestRootedShoulder38&&typeof landcoverAt!=="function")throw new TypeError("Forest shoulder requires authoritative land cover");
  stats.forestRootedShoulder38=Boolean(forestRootedShoulder38);
  const forestCurvatureField=forestBankCurvature38?createForestBankCurvature38(segments,forestShoulderAnchor):null;
  stats.forestBankCurvature38=Boolean(forestBankCurvature38);
  if(forestReach39)forestReach=createForestReach39({segments,queryAt:query,rawHeight:heightAt,baseHeightAt:currentBedHeightAt,protectedAt});
  stats.forestReach39=Boolean(forestReach);if(forestReach)stats.forestReach39Source=forestReach.stats;
  const result={lines,segments,unresolved,stats,viewpoints,valleySource,baselineBedHeightAt,bedHeightAt,sampleAt,intersectsBounds,nearSegments,refreshMeanderIndex,forestReach39:forestReach,
    bindSurface(fn){physicalHeight=fn;},isExcludedSource(x,z,padding=0){
      const q=query(x,z,true);if(!q)return false;const extent=q.segment.meander?(q.signed<0?q.section.shoulderLeft:q.section.shoulderRight):1;
      return q.distance<q.half+Math.min(q.margin*extent,.45+padding);
    },isExcluded(x,z,padding=0){
      const q=query(x,z);if(!q)return false;
      const extent=q.segment.meander?(q.signed<0?q.section.shoulderLeft:q.section.shoulderRight):1;
      return q.distance<q.half+Math.min(q.margin*extent,.45+padding);
    }};
  if(forestReach)result.reachSource={...result,forestReach39:null,stats:{...stats,forestReach39:false},bedHeightAt:currentBedHeightAt,sampleAt:(x,z,options)=>sampleBaseAt(x,z,options,currentBedHeightAt)};
  return result;
}
