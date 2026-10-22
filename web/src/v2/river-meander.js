import {riverBankMargin,riverSectionAt} from "./river-section.js";
// A designed metre-scale correction to the representative forest brook only.
// Original source data, junctions and node water levels remain authoritative.
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v)),mix=(a,b,t)=>a+(b-a)*t;
const smooth=(a,b,x)=>{const t=clamp((x-a)/(b-a),0,1);return t*t*(3-2*t);};
const outer=n=>n.width*.5+riverBankMargin(n.width);
const random=(i,seed)=>{let h=Math.imul(i^seed,1597334677);h=Math.imul(h^(h>>>16),2246822519);return ((h^(h>>>13))>>>0)/4294967296;};
function lateralControls(nodes,anchor,seed){
  const controls=[];let distance=anchor-145;
  for(let i=0;distance<anchor+190;i++){
    const nearby=nodes.filter(n=>Math.abs(n.distance-distance)<12&&n.bankShape);
    const width=nearby.length?nearby.reduce((sum,n)=>sum+n.width,0)/nearby.length:1.5;
    const deposition=nearby.length?nearby.reduce((sum,n)=>sum+(n.bankShape.barLeft-n.bankShape.barRight)/.86,0)/nearby.length:0;
    // The deeper path favours the side opposite the existing depositional bar;
    // irregular metric spans avoid an arbitrary repeated sine/scallop pattern.
    controls.push({distance,value:.55*deposition+.45*(random(i,seed^941)-.5)*2});
    distance+=(14+width*12)*(.75+.75*random(i,seed^1889));
  }
  // Keep the authored drainage trace as the reach's mean position. Remove
  // a constant lateral bias rather than translating the whole brook sideways.
  const core=controls.filter(p=>Math.abs(p.distance-anchor)<100),mean=core.reduce((sum,p)=>sum+p.value,0)/Math.max(1,core.length);
  const spread=Math.max(.25,...core.map(p=>Math.abs(p.value-mean)));
  // Dimensionless shape controls retain broad deposition-driven turns; a floor
  // prevents tiny local noise from being amplified into an accidental kink.
  for(const p of controls)p.value=clamp((p.value-mean)/spread,-1,1);
  const slopes=controls.slice(1).map((p,i)=>(p.value-controls[i].value)/(p.distance-controls[i].distance));
  controls.forEach((p,i)=>{const a=slopes[Math.max(0,i-1)],b=slopes[Math.min(slopes.length-1,i)];p.tangent=a*b<=0?0:2*a*b/(a+b);});
  return controls;
}
function lateralAt(controls,distance){
  let i=0;while(i<controls.length-2&&distance>controls[i+1].distance)i++;
  const a=controls[i],b=controls[i+1],span=b.distance-a.distance,t=clamp((distance-a.distance)/span,0,1),t2=t*t,t3=t2*t;
  const value=(2*t3-3*t2+1)*a.value+(t3-2*t2+t)*span*a.tangent+(-2*t3+3*t2)*b.value+(t3-t2)*span*b.tangent;
  return clamp(value,Math.min(a.value,b.value),Math.max(a.value,b.value));
}
export function bendRepresentativeReach(line,segments,anchor,{heightAt,protectedAt=()=>null,lockedDistances=[],profile="v22"}={}){
  // Nodes are shared with query, terrain, water and vegetation. A second call
  // must never treat the already bent nodes as a fresh source drainage trace.
  if(line.meanderResult)return line.meanderResult;
  if(typeof heightAt!=="function")throw new TypeError("A river bend requires actual uncarved terrain");
  const original=line.nodes.map(n=>({...n,bankShape:n.bankShape?{...n.bankShape}:undefined}));
  const active=new Map(segments.filter(s=>s.lineId===line.id).map(s=>[s.index,s]));
  const locks=[0,original.at(-1).distance,...lockedDistances];
  for(let i=1;i<original.length-1;i++)if(!active.has(i-1)||!active.has(i))locks.push(original[i].distance);
  const seed=parseInt(line.id.split("-")[1],16)||37,controls=lateralControls(original,anchor,seed);
  const shape=original.map((n,i)=>{
    if(!i||i===original.length-1||!n.bankShape||n.bankShape.weight<1-1e-9)return 0;
    const d=n.distance-anchor,window=1-smooth(52,88,Math.abs(d));if(!window)return 0;
    const clearance=Math.min(...locks.map(v=>Math.abs(n.distance-v))),taper=smooth(8,28,clearance);
    return window*taper*lateralAt(controls,n.distance);
  });
  // The original drainage route anchors the design, not an invisible fixed
  // bank-width envelope. Real terrain, levels and protected facilities below
  // decide whether a wider 6.4 m bend can occupy its new footprint. The v19
  // comparison retains the exact accepted 2.8 m curve and original controls.
  const amplitude=profile==="v19"?2.8:6.4;
  // Keep the original entrance spruce group and downstream bank tree rooted.
  // These are existing source landmarks, not extra density or synthetic rocks.
  const landmarks=profile!=="v19"&&line.id==="river-41711e76-99c57ca2"?[
    {id:"spruce:-302:395",x:-3616.909952510242,z:4747.011684474349},
    {id:"spruce:-302:400",x:-3618.5326095035302,z:4802.713376227766},
    {id:"spruce:-302:401",x:-3620.7247097116897,z:4819.061206700373}
  ]:[];
  const landmarkDistances=landmarks.map(p=>{
    let best=Infinity,distance=0;
    for(let i=0;i<original.length-1;i++){const a=original[i],b=original[i+1],dx=b.x-a.x,dz=b.z-a.z,t=clamp(((p.x-a.x)*dx+(p.z-a.z)*dz)/(dx*dx+dz*dz),0,1),d=Math.hypot(p.x-a.x-t*dx,p.z-a.z-t*dz);if(d<best){best=d;distance=mix(a.distance,b.distance,t);}}
    return distance;
  });
  const peak=Math.max(1e-9,...shape.map(Math.abs)),offsets=shape.map((v,i)=>{
    const room=landmarkDistances.reduce((weight,d)=>Math.min(weight,smooth(8,18,Math.abs(original[i].distance-d))),1);
    return mix(2.8,amplitude,room)*v/peak;
  });
  const errors=[];
  for(const scale of [1,.9,.8,.7,.6]){
    const nodes=original.map((n,i)=>({...n,bankShape:n.bankShape?{...n.bankShape}:undefined,
      x:n.x-n.flowZ*offsets[i]*scale,z:n.z+n.flowX*offsets[i]*scale}));
    let distance=0,failed=null;
    for(let i=0;i<nodes.length;i++){
      const n=nodes[i],a=nodes[Math.max(0,i-1)],b=nodes[Math.min(nodes.length-1,i+1)],length=Math.hypot(b.x-a.x,b.z-a.z)||1;
      n.flowX=(b.x-a.x)/length;n.flowZ=(b.z-a.z)/length;
      if(offsets[i])n.base=heightAt(n.x,n.z);
      if(i)distance+=Math.hypot(n.x-a.x,n.z-a.z);n.distance=distance;

    }
    const affected=[];
    if(!failed)for(const[index,s]of active){
      const a=nodes[index],b=nodes[index+1];
      const changed=[index-1,index,index+1,index+2].some(i=>offsets[i]);if(!changed)continue;
      const length=Math.hypot(b.x-a.x,b.z-a.z),candidate={...s,a,b,length,maxCut:0,flowX:(b.x-a.x)/length,flowZ:(b.z-a.z)/length};
      if(length<.75*s.length||length>1.35*s.length||candidate.flowX*s.flowX+candidate.flowZ*s.flowZ<Math.cos(Math.PI/6)){failed="excessive-local-turn";break;}
      for(let sample=0;sample<=8&&!failed;sample++){
        const t=sample/8,section=riverSectionAt(candidate,t),maxCut=heightAt(section.x,section.z)-section.level+section.depth;
        candidate.maxCut=Math.max(candidate.maxCut,maxCut);
        if(maxCut>2.2+Math.min(2.3,section.sourceWidth*.25)){failed="excessive-cut";break;}
        for(const side of [-1,1]){
          const half=side<0?section.left:section.right,extent=side<0?section.shoulderLeft:section.shoulderRight;
          const support=half+(section.outer-half)*extent;
          for(const radius of [0,half*.5,half,support]){
            const x=section.x-section.fz*side*radius,z=section.z+section.fx*side*radius;
            if(protectedAt(x,z,.025)){failed="protected-ground";break;}
            const ground=heightAt(x,z);
            if(radius<=half&&ground<section.level-.025){failed="low-water-edge";break;}
            if(radius<=half&&ground-section.level+section.depth>2.2+Math.min(2.3,section.sourceWidth*.25)){failed="excessive-cut";break;}
          }
          if(failed)break;
        }
      }
      if(failed)break;affected.push([s,candidate]);
    }
    if(failed){errors.push({scale,reason:failed});continue;}
    const moved=offsets.filter(v=>Math.abs(v*scale)>1e-7).length,maxOffset=Math.max(...offsets.map(v=>Math.abs(v*scale)));
    if(!moved)return {segments:0,nodes:0,maxOffset:0,reason:"no-clear-core"};
    for(let i=0;i<nodes.length;i++)Object.assign(line.nodes[i],nodes[i]);
    let lengthDelta=0,minLengthRatio=1,maxLengthRatio=1,maxHeadingDelta=0;
    for(const[s,c]of affected){
      // Retained landscape landmarks stay on their original roots. This compact
      // source section is provenance only; all live physical queries use a/b.
      s.meanderSource={a:original[s.index],b:original[s.index+1],flowX:s.flowX,flowZ:s.flowZ,bounds:{...s.bounds}};
      const radius=Math.max(outer(c.a),outer(c.b));
      s.bounds={minX:Math.min(c.a.x,c.b.x)-radius,maxX:Math.max(c.a.x,c.b.x)+radius,minZ:Math.min(c.a.z,c.b.z)-radius,maxZ:Math.max(c.a.z,c.b.z)+radius};
      lengthDelta+=c.length-s.length;minLengthRatio=Math.min(minLengthRatio,c.length/s.length);maxLengthRatio=Math.max(maxLengthRatio,c.length/s.length);maxHeadingDelta=Math.max(maxHeadingDelta,Math.acos(clamp(c.flowX*s.flowX+c.flowZ*s.flowZ,-1,1)));s.length=c.length;s.maxCut=c.maxCut;s.flowX=c.flowX;s.flowZ=c.flowZ;s.slope=Math.max(0,(s.a.level-s.b.level)/s.length);s.meander=true;}
    const radius=Math.max(...nodes.map(outer));
    line.bounds={minX:Math.min(...nodes.map(n=>n.x))-radius,maxX:Math.max(...nodes.map(n=>n.x))+radius,minZ:Math.min(...nodes.map(n=>n.z))-radius,maxZ:Math.max(...nodes.map(n=>n.z))+radius};
    return line.meanderResult={lineId:line.id,segments:affected.length,nodes:moved,maxOffset,offsetRange:[Math.min(...offsets)*scale,Math.max(...offsets)*scale],scale,lengthDelta,minLengthRatio,maxLengthRatio,maxHeadingDeltaDegrees:maxHeadingDelta*180/Math.PI,profile,retainedLandmarks:landmarks.map(p=>p.id),requestedAmplitude:amplitude,reachRadius:88,controlSpans:controls.slice(1).map((p,i)=>p.distance-controls[i].distance),checksPerSegment:9,rejected:errors,
      policy:"representative metre-scale bend on actual terrain; shared new footprint; old bed restored; node levels, endpoints, junctions and facilities retained"};
  }
  return {lineId:line.id,segments:0,nodes:0,maxOffset:0,reason:"no-safe-amplitude",rejected:errors};
}
export function applyRepresentativeMeanders(lines,segments,viewpoints,options){
  const view=viewpoints.find(v=>v.id==="river-forest"),anchor=segments.find(s=>s.id===view?.segmentId);
  // An authored change to this known reach, not a worldwide procedural warp.
  if(!anchor||anchor.lineId!=="river-41711e76-99c57ca2")return {segments:0,nodes:0,maxOffset:0,reason:"outside-representative-reach"};
  const line=lines.find(l=>l.id===anchor.lineId),locks=[];
  for(const source of lines)if(source.join?.line===line){
    locks.push(line.nodes[source.join.index].distance,line.nodes[source.join.index+1].distance);
  }
  return bendRepresentativeReach(line,segments,anchor.a.distance,{...options,lockedDistances:locks});
}
