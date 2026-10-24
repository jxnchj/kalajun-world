import {riverBedDepth,bendDeposits} from "./river-bed-profile.js";
// Shared local bank/bed shape for water meshes, terrain and ecological masks.
// These bounded designed shallows are not a claim of surveyed bank geometry.
// Reload keeps physical terrain and every material query on the same bank.
const requestedBankProfile=new URLSearchParams(globalThis.location?.search||"").get("bankProfile");
// Independent contour A/B; earlier bankProfile modes stay available.
const requestedContour=new URLSearchParams(globalThis.location?.search||"").get("bankContour");
export const RIVER_BANK_CONTOUR=["v22","v23"].includes(requestedContour)?requestedContour:"v24";
export const RIVER_BANK_PROFILE=["v19","v20","v21","v38"].includes(requestedBankProfile)?requestedBankProfile:(RIVER_BANK_CONTOUR==="v22"?"v21":RIVER_BANK_CONTOUR);
export const RIVER_BANK_SHOULDERS=new URLSearchParams(globalThis.location?.search||"").get("bankShoulders")==="v16"?"v16":"variable";
export const RIVER_BANK_LOBES=new URLSearchParams(globalThis.location?.search||"").get("shoreLobes")==="v26"?"v26":"v27";
const mix=(a,b,t)=>a+(b-a)*t,clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const smooth=(a,b,x)=>{const t=clamp((x-a)/(b-a),0,1);return t*t*(3-2*t);};
export const riverBankMargin=width=>.75+width*.38;
const hash=(n,seed)=>{let h=Math.imul(n^seed,1597334677);h=Math.imul(h^(h>>>16),2246822519);return ((h^(h>>>13))>>>0)/4294967296;};
function field(distance,scale,seed){const n=Math.floor(distance/scale),f=smooth(0,1,distance/scale-n);return mix(hash(n,seed),hash(n+1,seed),f);}
// Rooted depositional noses belong to the bank geometry, not a stripe painted
// on a straight shore. Only the already-authored forest reach receives these
// bounded 6–18 m lobes; water, terrain, material and ecology share each node.
// Sparse crests leave intervening reaches intact. They are designed details,
// not a claim of remotely measured sub-metre banks.
export function riverRootLobe(distance,bar,weight,side,width){
  const deposition=smooth(.52,.90,bar),patch=field(distance+(side<0?19:47),9,side<0?3083:2017)*.72
    +field(distance+(side<0?11:31),23,side<0?1123:2131)*.28;
  return Math.min(.24,width*.16)*weight*deposition*smooth(.38,.78,patch);
}
export function applyRepresentativeBanks(lines,segments,viewpoints){
  const byId=new Map(segments.map(s=>[s.id,s])),reaches=new Map();
  for(const view of viewpoints){const s=byId.get(view.segmentId);if(!s)continue;if(!reaches.has(s.lineId))reaches.set(s.lineId,[]);reaches.get(s.lineId).push(s.a.distance);}
  for(const line of lines){
    const anchors=reaches.get(line.id);if(!anchors)continue;
    const seed=parseInt(line.id.split("-")[1],16)|0;
    line.nodes.forEach((n,i)=>{
      const weight=Math.max(...anchors.map(d=>1-smooth(96,180,Math.abs(n.distance-d))));if(weight<=0)return;
      const a=line.nodes[Math.max(0,i-1)],b=line.nodes[Math.min(line.nodes.length-1,i+1)],bend=clamp((a.flowX*b.flowZ-a.flowZ*b.flowX)*8,-1,1);
      // Broad, aperiodic deposition alternates sides. The same side strength
      // drives the shallow bed and outer bank, instead of two parallel shelves.
      // Small intermediate variation softens long straight source reaches; no
      // centre point, water level, or protected outer envelope moves.
      const broad=field(n.distance,47,seed^1583),local=field(n.distance+11,19,seed^337);
      const drive=(broad-.5)*1.35+(local-.5)*.45-bend*.32;
      const left=smooth(-.36,.36,drive),right=smooth(-.36,.36,-drive);
      const neck=.025+.09*field(n.distance+23,31,seed^991),pinch=.16+.24*field(n.distance+17,23,seed^2027);
      n.bankShape={weight,left:.5*n.width*(1-weight*(neck+pinch*left)),right:.5*n.width*(1-weight*(neck+pinch*right)),
        barLeft:.08+.86*left,barRight:.08+.86*right,
        // The protection envelope remains fixed; this is where the actual
        // cut shoulder returns to untouched terrain within that envelope.
        shoulderLeft:RIVER_BANK_SHOULDERS==="v16"?1:mix(1,.38+.54*left+.08*local,weight),
        shoulderRight:RIVER_BANK_SHOULDERS==="v16"?1:mix(1,.38+.54*right+.08*(1-local),weight)};
      if(RIVER_BANK_LOBES!=="v26"&&line.id==="river-41711e76-99c57ca2"){
        const q=n.bankShape;
        q.rootLobeLeft=riverRootLobe(n.distance,q.barLeft,weight,-1,n.width);
        q.rootLobeRight=riverRootLobe(n.distance,q.barRight,weight,1,n.width);
        q.left-=q.rootLobeLeft;q.right-=q.rootLobeRight;
      }
    });
  }
  let count=0,length=0;
  for(const s of segments){s.naturalBanks=Boolean(s.a.bankShape||s.b.bankShape);if(s.naturalBanks){count++;length+=s.length;}}
  return {reaches:reaches.size,segments:count,length,reachRadius:180,policy:"designed representative shallows inside the existing protected envelope; source centreline and water levels preserved"};
}
export function riverSectionAt(s,t){
  const a=s.a,b=s.b,sourceWidth=mix(a.width,b.width,t),fx=mix(a.flowX,b.flowX,t),fz=mix(a.flowZ,b.flowZ,t),len=Math.hypot(fx,fz)||1;
  const left=mix(a.bankShape?.left??a.width*.5,b.bankShape?.left??b.width*.5,t),right=mix(a.bankShape?.right??a.width*.5,b.bankShape?.right??b.width*.5,t);
  return {x:mix(a.x,b.x,t),z:mix(a.z,b.z,t),level:mix(a.level,b.level,t),sourceWidth,width:left+right,left,right,
    depth:mix(a.depth,b.depth,t),distance:mix(a.distance,b.distance,t),fx:fx/len,fz:fz/len,
    weight:mix(a.bankShape?.weight??0,b.bankShape?.weight??0,t),
    bendWeight:mix(a.bankShape?.bendWeight??0,b.bankShape?.bendWeight??0,t),
    valleyWeight:mix(a.bankShape?.valleyWeight??0,b.bankShape?.valleyWeight??0,t),
    bedWeight:mix(a.bankShape?.bedWeight??0,b.bankShape?.bedWeight??0,t),
    bedDepositLeft:mix(a.bankShape?.bedDepositLeft??0,b.bankShape?.bedDepositLeft??0,t),
    bedDepositRight:mix(a.bankShape?.bedDepositRight??0,b.bankShape?.bedDepositRight??0,t),
    valleyRootMat:mix(a.bankShape?.valleyRootMat??0,b.bankShape?.valleyRootMat??0,t),
    legacyLeft:mix(a.bankShape?.legacyLeft??a.bankShape?.left??a.width*.5,b.bankShape?.legacyLeft??b.bankShape?.left??b.width*.5,t),
    legacyRight:mix(a.bankShape?.legacyRight??a.bankShape?.right??a.width*.5,b.bankShape?.legacyRight??b.bankShape?.right??b.width*.5,t),
    valleyBarLeft:mix(a.bankShape?.valleyBarLeft??0,b.bankShape?.valleyBarLeft??0,t),
    valleyBarRight:mix(a.bankShape?.valleyBarRight??0,b.bankShape?.valleyBarRight??0,t),
    barLeft:mix(a.bankShape?.barLeft??.5,b.bankShape?.barLeft??.5,t),barRight:mix(a.bankShape?.barRight??.5,b.bankShape?.barRight??.5,t),
    shoulderLeft:mix(a.bankShape?.shoulderLeft??1,b.bankShape?.shoulderLeft??1,t),
    shoulderRight:mix(a.bankShape?.shoulderRight??1,b.bankShape?.shoulderRight??1,t),
    outer:sourceWidth*.5+riverBankMargin(sourceWidth)};
}
export function riverCrossPoint(section,across){
  const offset=across*(across<0?section.left:section.right);
  return {x:section.x-section.fz*offset,z:section.z+section.fx*offset,level:section.level};
}
export function riverSectionDepth(section,across){
  return riverBedDepth(section.depth,section.weight,across,across<0?section.barLeft:section.barRight,
    section.bedWeight??0,across<0?(section.bedDepositLeft??0):(section.bedDepositRight??0));
}
// Cut-only outer-bank rise, normalised from the water edge (0) to unchanged
// DEM (1). A depositional side has a continuous gentle shoulder; the opposite
// bank rejoins the ground sooner. Both profiles are monotone and C1 at their
// endpoints, and use the very same bar strength as the water/bed profile.
export function riverBankRise(section,side,u,profile=RIVER_BANK_PROFILE){
  const extent=side<0?(section.shoulderLeft??1):(section.shoulderRight??1);
  const rawQ=clamp(u/extent,0,1),bar=side<0?section.barLeft:section.barRight;
  if(section.valleyWeight>0){
    const half=side<0?section.left:section.right,oldHalf=side<0?section.legacyLeft:section.legacyRight;
    const distance=half+u*(section.outer-half),old={...section,left:section.legacyLeft,right:section.legacyRight,valleyWeight:0};
    const boundary=oldHalf+.45,oldU=(distance-oldHalf)/(section.outer-oldHalf);
    const existing=distance<=oldHalf?0:riverBankRise(old,side,oldU,profile);
    if(distance>=boundary)return existing;
    const q=clamp((distance-half)/(boundary-half),0,1),deposit=side<0?section.valleyBarLeft:section.valleyBarRight;
    // Remap the existing monotone cross-section, rather than blend a raised
    // shelf back down into it. The endpoint derivative equals the old profile,
    // keeping the original rooted exterior exactly C1 and avoiding a swale.
    const stretch=(boundary-half)/.45,base=Math.pow(q,stretch);
    const shaped=base*(1+.8*(1-deposit)*(1-q)*(1-q));
    const legacyDesigned=riverBankRise(old,side,.45/(section.outer-oldHalf)*shaped,profile);
    const atBoundary=riverBankRise(old,side,.45/(section.outer-oldHalf),profile);
    // The eroding face must not acquire a second horizontal foot above water.
    const cutFace=atBoundary*(1-Math.pow(1-q,2));
    const designed=mix(legacyDesigned,mix(cutFace,legacyDesigned,deposit),section.bedWeight??0);
    return mix(existing,designed,section.valleyWeight);
  }
  if(section.bendWeight>0){
    // The outer bend erodes a compact turf face and retains a rooted shoulder;
    // its inner bend has a shallow depositional bench. These physical terraces
    // follow signed curvature, not independent dots or a painted shoreline.
    const deposition=clamp((bar-.08)/.86,0,1),q=rawQ;
    const rootedCut=.62*smooth(0,.32,q)+.38*smooth(.46,.85,q);
    const pointBar=.22*smooth(0,.42,q)+.78*smooth(.50,1,q);
    return mix(riverBankRise({...section,bendWeight:0},side,u,profile),mix(rootedCut,pointBar,deposition),section.bendWeight);
  }
  if(profile==="v38"){
    // The former smoothstep imposed a horizontal foot at every water edge,
    // including cut banks. A nonzero contact slope prevents that artificial
    // continuous shelf. Deposition retains a gentle broad shoulder; eroding
    // faces rise quickly. Both return C1 to the unchanged outer ground.
    const deposition=clamp((bar-.08)/.86,0,1),q=rawQ;
    const contactSlope=mix(3.,.65,deposition);
    const rise=(contactSlope-2)*q*q*q+(3-2*contactSlope)*q*q+contactSlope*q;
    return mix(smooth(0,1,q),rise,section.weight);
  }

  // Continuous river-distance fields form unequal short cut reaches and long
  // deposition pockets. Neither water-edge nor bed/source width moves. The
  // old shoulder envelope still protects roads and foundations. Both endpoints
  // remain C1 and no new bank cut is deeper than the accepted v20 profile.
  let compactness=1,contourCompactness=1;
  if((profile==="v21"||profile==="v23"||profile==="v24")&&section.weight>0){
    const distance=section.distance??0;
    const patch=field(distance+(side<0?17:53),23,side<0?4051:3253)*.72
      +field(distance+(side<0?5:11),7,side<0?1709:991)*.28;
    compactness=1-.52*section.weight*smooth(.28,.73,patch);
    if(profile==="v23"||profile==="v24"){
      // Broad deposition strength already alternates the physical shallow bed.
      // Use it to retain genuinely wide low shelves, with independent 37 m
      // side context; other reaches return to the original DEM sooner. The
      // two banks never acquire a uniform narrow wall or paired parallel shelf.
      const deposition=clamp((bar-.08)/.86,0,1);
      const pocket=smooth(.28,.72,deposition*.65+field(distance+(side<0?29:71),37,side<0?2447:1831)*.35);
      contourCompactness=mix(1,.42+.58*pocket,section.weight);
    }
  }
  // Keep the accepted tangent at the water lip. Reach compression grows over
  // the first 4% of the shoulder, avoiding a new sharp fold at the water edge.
  const q=clamp(rawQ/(compactness*mix(1,contourCompactness,smooth(0,.04,rawQ))),0,1);
  const deposition=clamp((bar-.08)/.86,0,1);
  const compact=smooth(0,.66,q),earlyShoulder=smooth(0,.72,q),lateShoulder=smooth(.50,1,q);
  const lowShelf=.36*earlyShoulder+.64*lateShoulder;
  // A point bar keeps its full outer width and smooth shoulder, but no longer
  // puts 64% of its vertical rise in the outer half. That long low foot exposed
  // the same broad mud lip along successive bays. Move part of the rise toward
  // the water, keeping the edge tangent, full deposition width and gentle top.
  // Partial bars transition to one continuous rise using the SAME deposition
  // strength; no shoreline noise or narrowing of both banks is introduced.
  const raisedShelf=.58*earlyShoulder+.42*lateShoulder;
  const shoulder=profile==="v24"?mix(raisedShelf,smooth(0,1,q),
    .86*(1-smooth(.62,.94,deposition))*section.weight):lowShelf;
  // Cut banks rise near the water edge, depositional pockets retain a low
  // shoulder. Previously even the "compact" side began with a broad shallow
  // quadratic foot, leaving a grey wet ribbon on almost every cross-section.
  // Both pieces are monotone C1 and reach the same unchanged DEM; the water
  // edge, bed depth, plant exclusion and protection footprint do not move.
  const cut=profile==="v19"?compact:compact+.78*smooth(0,.25,q)*(1-compact);
  return mix(smooth(0,1,q),mix(cut,shoulder,deposition),section.weight);
}
// A deposited bank is added sediment, not another cut into the source DEM.
// The low bench starts at the actual water edge, continues through the rooted
// shoulder, and rejoins the original floodplain over metres. Its sediment side
// is the same reach-scale field that narrows the channel; no independent noise.
export function riverValleySedimentRise(section,side,distance){
  if(!(section.valleyWeight>0))return 0;
  const half=side<0?section.left:section.right,oldHalf=side<0?section.legacyLeft:section.legacyRight;
  const deposit=side<0?section.valleyBarLeft:section.valleyBarRight;
  const inner=smooth(0,.58,distance-half),outer=1-smooth(oldHalf+.35,oldHalf+2.1,distance);
  // New outer cut banks expose the coherent rooted sod layer above their
  // mineral face. Its 9cm thickness runs with the reach, not individual plants;
  // coarse DEM ground alone lies within millimetres of the temporary water.
  const sod=.09*(section.valleyRootMat??0)*(1-deposit)*smooth(0,.45,distance-half)*(1-smooth(half+.7,half+2.1,distance));
  return .14*section.valleyWeight*deposit*inner*outer+sod;
}
// Soil moisture retains the established bank footprint and gradual shoulder.
// Physical exposure is evaluated separately from the actual terrain height.
export function riverBankMaterialDistance(section,side,distance){
  const half=side<0?section.left:section.right;
  if(distance<=half)return distance;
  const margin=section.outer-half,u=clamp((distance-half)/margin,0,1);
  const extent=side<0?(section.shoulderLeft??1):(section.shoulderRight??1);
  // Soil/moisture finish at the same physical return-to-DEM point. Keeping
  // the old full-width material coordinate would repaint a detached grey band.
  const q=clamp(u/extent,0,1);
  // Keep the established soil-moisture field used by vegetation selection.
  // A sharper exposed cut face does not imply instant dry soil below it. The
  // existing height-aware shore material separately limits exposed riverbed;
  // that follows the actual new terrain height, not this root-layout field.
  return half+margin*mix(q,riverBankRise(section,side,u,"v19"),.60*section.weight);
}
// Invert the same smoothly turning cross-sections used by the water vertices.
// Two scalar Newton steps are used only on the three modified reaches. Clamped
// endpoints retain the former round-end influence for unresolved source gaps.
export function projectRiverSection(x,z,s,initial){
  const ax=x-s.a.x,az=z-s.a.z,dx=s.b.x-s.a.x,dz=s.b.z-s.a.z;
  const nx=-s.a.flowZ,nz=s.a.flowX,dnx=-s.b.flowZ-nx,dnz=s.b.flowX-nz;
  const A=-(dx*dnz-dz*dnx),B=ax*dnz-az*dnx-(dx*nz-dz*nx),C=ax*nz-az*nx;
  let t=initial;
  for(let k=0;k<2;k++){const derivative=2*A*t+B;if(Math.abs(derivative)>1e-8)t=clamp(t-(A*t*t+B*t+C)/derivative,0,1);}
  const section=riverSectionAt(s,t),px=x-section.x,pz=z-section.z;
  const signed=-section.fz*px+section.fx*pz,distance=Math.hypot(px,pz);
  return {t,x:section.x,z:section.z,distance,signed,section};
}

// Re-evaluate sediment sides AFTER the centreline is bent. The previous field
// was assigned before meandering and could put a point bar on an outer bend.
export function applyBrookBendBanks(lines,segments,viewpoints,{heightAt,protectedAt=()=>null}={}){
 const view=viewpoints.find(v=>v.id==='brook-lanchuan'),anchor=segments.find(s=>s.id===view?.segmentId);
 if(!anchor)return {nodes:0,reason:'missing-anchor'};
 const line=lines.find(l=>l.id===anchor.lineId),original=line.nodes,origin=anchor.a.distance;
 const nodes=original.map((n,i)=>{
  const a=original[Math.max(0,i-3)],b=original[Math.min(original.length-1,i+3)];
  const ax=n.x-a.x,az=n.z-a.z,bx=b.x-n.x,bz=b.z-n.z;
  const turn=Math.atan2(ax*bz-az*bx,ax*bx+az*bz),drive=Math.tanh(turn/.24);
  const weight=(1-smooth(58,92,Math.abs(n.distance-origin)))*Math.min(1,Math.max(0,(n.incisionSourceLevel-n.level)/.12)||0);
  if(!weight||!n.bankShape)return {...n};
  const left=(1+drive)*.5,right=(1-drive)*.5,base=n.bankShape;
  const shallow=side=>.5*n.width*(.97+.16*Math.abs(drive)-.38*side),shoulder=side=>.40+.58*side;
  return {...n,depth:mix(n.depth,.18+.09*Math.abs(drive),weight),bankShape:{...base,bendWeight:weight,
   left:mix(base.left,shallow(left),weight),right:mix(base.right,shallow(right),weight),
   barLeft:mix(base.barLeft,.08+.86*left,weight),barRight:mix(base.barRight,.08+.86*right,weight),
   shoulderLeft:mix(base.shoulderLeft,shoulder(left),weight),shoulderRight:mix(base.shoulderRight,shoulder(right),weight)}};
 });
 const affected=[];let minWidth=Infinity,maxWidth=0;
 for(const s of segments.filter(s=>s.lineId===line.id)){
  if(!nodes[s.index].bankShape?.bendWeight&&!nodes[s.index+1].bankShape?.bendWeight)continue;
  const candidate={...s,a:nodes[s.index],b:nodes[s.index+1]};let maxCut=0;
  for(let i=0;i<=8;i++){
   const q=riverSectionAt(candidate,i/8);minWidth=Math.min(minWidth,q.width);maxWidth=Math.max(maxWidth,q.width);
   for(const side of [-1,1]){const half=side<0?q.left:q.right,extent=side<0?q.shoulderLeft:q.shoulderRight;
    for(const radius of [0,half*.5,half,half+(q.outer-half)*extent]){
     const x=q.x-q.fz*side*radius,z=q.z+q.fx*side*radius,ground=heightAt(x,z);
     if(protectedAt(x,z,.025))return {nodes:0,reason:'protected-ground'};
     if(radius<=half&&ground<q.level-.025)return {nodes:0,reason:'low-water-edge'};
     maxCut=Math.max(maxCut,ground-q.level+q.depth);
    }
   }
   if(maxCut>2.2+Math.min(2.3,q.sourceWidth*.25))return {nodes:0,reason:'excessive-cut'};
  }
  affected.push([s,maxCut]);
 }
 nodes.forEach((n,i)=>Object.assign(original[i],n));for(const [s,maxCut]of affected)s.maxCut=maxCut;
 return {nodes:nodes.filter(n=>n.bankShape?.bendWeight>0).length,segments:affected.length,minWidth,maxWidth,policy:'signed actual bend curvature assigns inner depositional bar, outer rooted cut and shallow crossing; shared physical section, no added decor'};
}

// Reuse the existing wide-channel sediment field over a whole representative
// reach. Bars grow inward into the old water footprint; rooted outer ground
// outside the bounded 2.1m depositional shoulder retains its earlier section.
export function applyValleyDeposits(lines,segments,viewpoints,{heightAt,protectedAt=()=>null,sectionProfile=false}={}){
 const view=viewpoints.find(v=>v.id==='river-valley'),anchor=segments.find(s=>s.id===view?.segmentId);
 if(!anchor||anchor.lineId!=='river-32d9cab5-5bea75bb')return {nodes:0,reason:'outside-adopted-valley-reach'};
 const line=lines.find(l=>l.id===anchor.lineId),origin=anchor.a.distance,original=line.nodes;
 const nodes=original.map((n,i)=>{
  const weight=1-smooth(52,94,Math.abs(n.distance-origin)),base=n.bankShape;if(!base||weight<=0)return {...n};
  const a=original[Math.max(0,i-5)],b=original[Math.min(original.length-1,i+5)],turn=Math.atan2(a.flowX*b.flowZ-a.flowZ*b.flowX,a.flowX*b.flowX+a.flowZ*b.flowZ);
  // Existing 47m sediment succession supplies straight reaches; measured
  // centreline turning chooses the inside bank where a real bend is present.
  const side=clamp((base.barLeft-.08)/.86+Math.tanh(turn/.16)*.35,0,1),legacyLeft=smooth(.32,.82,side),legacyRight=smooth(.32,.82,1-side);
  const deposition=bendDeposits(turn),left=sectionProfile?deposition.left:legacyLeft,right=sectionProfile?deposition.right:legacyRight;
  const pinch=Math.min(1.15,n.width*.105)*weight;
  return {...n,bankShape:{...base,valleyWeight:weight,bedWeight:sectionProfile?weight:0,bedDepositLeft:left,bedDepositRight:right,valleyRootMat:line.meanderResult?.profile==='v38-valley'?weight:0,legacyLeft:base.left,legacyRight:base.right,legacyShoulderLeft:base.shoulderLeft,legacyShoulderRight:base.shoulderRight,
   left:base.left-pinch*left,right:base.right-pinch*right,valleyBarLeft:left,valleyBarRight:right}};
 });
 let count=0,minWidth=Infinity,maxWidth=0;
 for(const s of segments.filter(s=>s.lineId===line.id)){
  if(!nodes[s.index].bankShape?.valleyWeight&&!nodes[s.index+1].bankShape?.valleyWeight)continue;
  const candidate={...s,a:nodes[s.index],b:nodes[s.index+1]};
  for(let i=0;i<=8;i++){const q=riverSectionAt(candidate,i/8);minWidth=Math.min(minWidth,q.width);maxWidth=Math.max(maxWidth,q.width);
   for(const side of [-1,1]){const half=side<0?q.left:q.right;for(const d of [half,half+.45,(side<0?q.legacyLeft:q.legacyRight)+2.1]){const x=q.x-q.fz*side*d,z=q.z+q.fx*side*d;if(protectedAt(x,z,.025))return {nodes:0,reason:'protected-ground'};if(d===half&&heightAt(x,z)<q.level-.025)return {nodes:0,reason:'low-water-edge'};}}
  }s.valleySource={...s,a:{...s.a,bankShape:{...s.a.bankShape}},b:{...s.b,bankShape:{...s.b.bankShape}}};count++;
 }
 nodes.forEach((n,i)=>Object.assign(original[i],n));return {nodes:nodes.filter(n=>n.bankShape?.valleyWeight>0).length,segments:count,minWidth,maxWidth,sectionProfile,policy:'existing wide reach sediment succession; inward bars with low physical sediment benches, bounded cut changes; centreline/levels and protected infrastructure retained'};
}
