// Shared local bank/bed shape for water meshes, terrain and ecological masks.
// These bounded designed shallows are not a claim of surveyed bank geometry.
// Reload keeps physical terrain and every material query on the same bank.
const requestedBankProfile=new URLSearchParams(globalThis.location?.search||"").get("bankProfile");
// Independent contour A/B; earlier bankProfile modes stay available.
const requestedContour=new URLSearchParams(globalThis.location?.search||"").get("bankContour");
export const RIVER_BANK_CONTOUR=["v22","v23"].includes(requestedContour)?requestedContour:"v24";
export const RIVER_BANK_PROFILE=["v19","v20","v21"].includes(requestedBankProfile)?requestedBankProfile:(RIVER_BANK_CONTOUR==="v22"?"v21":RIVER_BANK_CONTOUR);
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
  const u=clamp(Math.abs(across),0,1),legacy=.025+section.depth*Math.max(0,1-u*u),bar=across<0?section.barLeft:section.barRight;
  const shallow=.025*(1-smooth(.45,1,u))+section.depth*(1-smooth(.08,1,u))*(1-.70*bar*smooth(.2,.62,u));
  return mix(legacy,shallow,section.weight);
}
// Cut-only outer-bank rise, normalised from the water edge (0) to unchanged
// DEM (1). A depositional side has a continuous gentle shoulder; the opposite
// bank rejoins the ground sooner. Both profiles are monotone and C1 at their
// endpoints, and use the very same bar strength as the water/bed profile.
export function riverBankRise(section,side,u,profile=RIVER_BANK_PROFILE){
  const extent=side<0?(section.shoulderLeft??1):(section.shoulderRight??1);
  const rawQ=clamp(u/extent,0,1),bar=side<0?section.barLeft:section.barRight;
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
