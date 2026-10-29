// Offline source-driven reach study. No production module imports this file.
import {writeFileSync,mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {actualForestWorld} from '../../benchmark_forest_exclusion_v38.mjs';
import {WorldEcology,MEADOW} from '../../../web/src/v2/ecology.js';
import {projectSegment} from '../../../web/src/v2/hydrology.js';
import {riverSectionAt,projectRiverSection} from '../../../web/src/v2/river-section.js';
const out='tools/candidates/forest-reach39';mkdirSync(out,{recursive:true});
const w=actualForestWorld(undefined,'rgba'),h=w.hydrology,eco=new WorldEcology(w),anchor=h.segments.find(s=>s.id===h.viewpoints.find(v=>v.id==='river-forest').segmentId),origin=anchor.a.distance;
const line=h.segments.filter(s=>s.lineId===anchor.lineId),clamp=(x,a=0,b=1)=>Math.max(a,Math.min(b,x)),smooth=x=>{x=clamp(x);return x*x*(3-2*x);};
const at=s=>{const d=origin+s,g=line.find(g=>g.a.distance<=d&&g.b.distance>=d);return riverSectionAt(g,(d-g.a.distance)/(g.b.distance-g.a.distance));};
const xy=(q,side,d)=>({x:q.x-q.fz*side*d,z:q.z+q.fx*side*d});
const sections=[];for(let i=0;i<=144;i++)sections.push({...at(-18+i*.25),offset:-18+i*.25});
const cx=at(0).x,cz=at(0).z,trees=[];
for(let iz=Math.floor((cz-32)/12);iz<=Math.ceil((cz+32)/12);iz++)for(let ix=Math.floor((cx-32)/12);ix<=Math.ceil((cx+32)/12);ix++){const t=eco.treeAt(ix,iz);if(t)trees.push(t);}
const hash=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');const rootsBefore=hash(trees),sourceBefore=hash(h.segments);
const samples=sections.map(q=>{const a=at(Math.max(-18,q.offset-1)),b=at(Math.min(18,q.offset+1)),turn=Math.atan2(a.fx*b.fz-a.fz*b.fx,a.fx*b.fx+a.fz*b.fz);return{offset:q.offset,turn,sides:[-1,1].map(side=>{const half=side<0?q.left:q.right,p=xy(q,side,q.outer),raw=w.surface.uncarvedHeightAt(p.x,p.z),near=Math.min(...trees.map(t=>Math.hypot(t.x-p.x,t.z-p.z)));return{side,freeboard:raw-q.level,rootDistance:near};})};});
const selected=new Map([[-18,new Set(['endpoint'])],[18,new Set(['endpoint'])]]),add=(s,reason)=>{if(!selected.has(s))selected.set(s,new Set());selected.get(s).add(reason);};
for(let i=2;i<samples.length-2;i++){
 const a=samples[i-1],b=samples[i],c=samples[i+1];
 if(Math.abs(b.turn)>.06&&Math.abs(b.turn)>=Math.max(...samples.slice(Math.max(0,i-12),Math.min(samples.length,i+13)).map(v=>Math.abs(v.turn))))add(b.offset,'bend apex');
 if(a.turn*c.turn<0)add(b.offset,'bend inflection');
 for(let j=0;j<2;j++){
  if(b.sides[j].freeboard<a.sides[j].freeboard&&b.sides[j].freeboard<=c.sides[j].freeboard)add(b.offset,'source low bank '+b.sides[j].side);
  if(b.sides[j].rootDistance<2.5&&b.sides[j].rootDistance<a.sides[j].rootDistance&&b.sides[j].rootDistance<=c.sides[j].rootDistance)add(b.offset,'existing root anchor '+b.sides[j].side);
 }
}
const controls=[...selected].sort((a,b)=>a[0]-b[0]).map(([s,reasons])=>{const b=samples[Math.round((s+18)*4)],q=at(s);return{offset:s,reasons:[...reasons],turn:b.turn,sides:b.sides.map(v=>{
 const deposition=.5+.5*Math.tanh(v.side*b.turn/.25),free=clamp(v.freeboard/.6),root=1-smooth(v.rootDistance/2.5);
 // Independent toe and crest: deposition extends the lower shoulder; an
 // anchored, deeply incised outer bank retains a short face, not a full reach wall.
 const crest=clamp(.38+.38*deposition+.14*(1-free)-.10*root,.28,.9);
 const toe=crest*clamp(.14+.55*deposition*(1-root),.12,.7);
 const toeRise=clamp(.08+.16*(1-deposition)*(1-free),.06,.26);
 return{...v,deposition,crest,toe,toeRise,poolDepth:.07+.22*clamp(Math.abs(b.turn)/.2),axis:-Math.tanh(b.turn/.20)*.42};})};});
function parameters(s,side){let k=controls.findIndex(c=>c.offset>=s);if(k<=0)return controls[0].sides[side<0?0:1];const a=controls[k-1],b=controls[k],u=smooth((s-a.offset)/(b.offset-a.offset)),j=side<0?0:1;return Object.fromEntries(['crest','toe','toeRise','poolDepth','axis','deposition'].map(key=>[key,a.sides[j][key]+(b.sides[j][key]-a.sides[j][key])*u]));}
function project(x,z){const id=h.sampleAt(x,z,{includeDepth:false}).id,g=line.find(g=>g.id===id);if(!g||g.b.distance<origin-22||g.a.distance>origin+22)return null;return {...projectRiverSection(x,z,g,projectSegment(x,z,g.a,g.b).t),segment:g};}
const hermite=(t,y0,y1,m0,m1,span)=>(2*t**3-3*t*t+1)*y0+(t**3-2*t*t+t)*span*m0+(-2*t**3+3*t*t)*y1+(t**3-t*t)*span*m1;
function contact(q,s,side,a){const half=side<0?q.left:q.right,margin=q.outer-half,p=xy(q,side,half+a.toe*margin),raw=w.surface.uncarvedHeightAt(p.x,p.z),axis=a.axis*(a.axis<0?q.left:q.right),span=half-side*axis,wet=a.poolDepth/span,dry=Math.max(.0001,(raw-q.level)*a.toeRise/(a.toe*margin));return {axis,span,slope:2*wet*dry/(wet+dry)};}
function innerSlope(q,s,p,old,raw){
 const a0=parameters(s,p.signed<0?-1:1),axis=a0.axis*(a0.axis<0?q.left:q.right),side=p.signed<axis?-1:1,a=parameters(s,side),strength=smooth((a.deposition-.5)/.35);
 if(!strength)return old;
 const edge=xy(q,side,q.outer),edgeRaw=w.surface.uncarvedHeightAt(edge.x,edge.z),span=q.outer-side*axis,t=clamp(Math.abs(p.signed-axis)/span);
 // One broad inner-bank surface, with no water-edge or toe breakpoint.
 // The deep trough decays close to the OUTER-bend axis, leaving a shallow
 // inner bench that rises continuously into original low grassland.
 const broad=smooth(t),shallow=.018,free=Math.max(.001,edgeRaw-q.level),sigma=.22*span;
 const y=q.level-shallow+(free+shallow)*broad-(a.poolDepth-shallow)*Math.exp(-(((t*span)/sigma)**2))*(1-broad);
 const reach=smooth((18-Math.abs(s))/4),rootDistance=Math.min(...trees.map(r=>Math.hypot(r.x-p.wx,r.z-p.wz))),rootRelease=smooth((rootDistance-.8)/1.2);
 const support=smooth((q.outer-p.distance)/.25);
 return old+(Math.min(raw,y)-old)*strength*reach*rootRelease*support;
}
function value(x,z){const old=w.surface.heightAt(x,z),p=project(x,z);if(p){p.wx=x;p.wz=z;}if(!p)return{old,y:old,zone:0};const q=riverSectionAt(p.segment,p.t),s=q.distance-origin,side=p.signed<0?-1:1,half=side<0?q.left:q.right,d=p.distance,raw=w.surface.uncarvedHeightAt(x,z);
 if(Math.abs(s)>=18||d>=q.outer)return{old,y:old,zone:d<=half?3:0,water:q.level};
 if(d<=half){const a=parameters(s,side),axis=a.axis*(a.axis<0?q.left:q.right),bankSide=p.signed<axis?-1:1,ba=parameters(s,bankSide),edge=contact(q,s,bankSide,ba),t=clamp(Math.abs(p.signed-axis)/edge.span),proposed=hermite(t,q.level-a.poolDepth,q.level,0,edge.slope,edge.span),weight=smooth((18-Math.abs(s))/4),y=old+(proposed-old)*weight;const final=innerSlope(q,s,p,y,raw);return{old,y:final,zone:final<q.level?3:0,water:q.level,raw,s,side,u:d/half};}
 if(parameters(s,side).deposition<=.5||raw<=q.level)return{old,y:old,zone:old<q.level?3:0,water:q.level};
 const u=(d-half)/(q.outer-half),a=parameters(s,side);let r;
 const slope0=a.toeRise/a.toe,slope1=(1-a.toeRise)/(a.crest-a.toe),tangent=2*slope0*slope1/(slope0+slope1);

 if(u<a.toe)r=hermite(u/a.toe,0,a.toeRise,Math.min(3*slope0,contact(q,s,side,a).slope*(q.outer-half)/(raw-q.level)),tangent,a.toe);else if(u<a.crest)r=hermite((u-a.toe)/(a.crest-a.toe),a.toeRise,1,tangent,0,a.crest-a.toe);else r=1;
 let proposed=q.level+(raw-q.level)*r;
 // Original trunk support retained exactly within 0.8 m, smoothly released to
 // 2 m. This changes no tree record, size, orientation or placement.
 const rootDistance=Math.min(...trees.map(t=>Math.hypot(t.x-x,t.z-z))),rootRelease=smooth((rootDistance-.8)/1.2);
 const weight=smooth((18-Math.abs(s))/4)*rootRelease;
 const y=old+(proposed-old)*weight;
 const final=innerSlope(q,s,p,y,raw);return{old,y:final,zone:final<q.level?3:r<.25?1:r<.98?2:0,water:q.level,raw,s,side,u};}
// Existing facility protection checked conservatively against enclosing circles
// (stronger than the production oriented boxes); roads use exact source segments.
function protectedPoint(x,z){for(const e of w.entities){const a=w.manifest.assetMetadata[e.assetId],p=a?.pad,b=a?.bounds,scale=e.scale||{x:1,z:1};const hx=(p?.hx??(b?(b.max[0]-b.min[0])/2:2))*scale.x,hz=(p?.hz??(b?(b.max[2]-b.min[2])/2:2))*scale.z,ox=(p?.cx??0)*scale.x,oz=(p?.cz??0)*scale.z;if(Math.hypot(x-e.x,z-e.z)<Math.hypot(hx+12,hz+12)+Math.hypot(ox,oz))return true;}
 for(const rs of [w.objects.tracks,w.objects.paths,w.objects.boardwalks])for(const r of rs||[])for(let i=1;i<(r.pts?.length||0);i++){const a=r.pts[i-1],b=r.pts[i],dx=b[0]-a[0],dz=b[1]-a[1],t=clamp(((x-a[0])*dx+(z-a[1])*dz)/(dx*dx+dz*dz||1));if(Math.hypot(x-a[0]-dx*t,z-a[1]-dz*t)<(r.width||1.5)/2+1.5)return true;}return false;}
const grid=[],faces=[],step=.125,minX=Math.floor(Math.min(...sections.map(q=>q.x-q.outer))-3),maxX=Math.ceil(Math.max(...sections.map(q=>q.x+q.outer))+3),minZ=Math.floor(Math.min(...sections.map(q=>q.z-q.outer))-3),maxZ=Math.ceil(Math.max(...sections.map(q=>q.z+q.outer))+3),nx=Math.round((maxX-minX)/step)+1,nz=Math.round((maxZ-minZ)/step)+1,y0=at(0).level;
let changed=0,maxDelta=0,protectedChanged=0,waterChanged=0;
for(let j=0;j<nz;j++)for(let i=0;i<nx;i++){const x=minX+i*step,z=minZ+j*step,v=value(x,z),delta=Math.abs(v.y-v.old);if(delta>1e-9){changed++;maxDelta=Math.max(maxDelta,delta);if(protectedPoint(x,z))protectedChanged++;if(v.zone===3)waterChanged++;if(v.zone===3)assert.ok(v.y<v.water,'positive connected flow depth');else {assert.ok(v.y<=v.raw+1e-8);assert.ok(v.y>=v.water-1e-8);}}grid.push([x-cx,z-cz,v.old-y0,v.y-y0,v.zone,(v.water??y0)-y0]);if(i&&j){const k=j*nx+i;faces.push([k-nx-1,k-nx,k],[k-nx-1,k,k-1]);}}
assert.equal(protectedChanged,0);assert.ok(waterChanged>0);assert.equal(hash(trees),rootsBefore);assert.equal(hash(h.segments),sourceBefore);
const profiles=sections.map(q=>({offset:q.offset,level:q.level,centerBed:w.surface.heightAt(q.x,q.z)-q.level,candidateCenterBed:value(q.x,q.z).y-q.level,sourceFreeboard:w.surface.uncarvedHeightAt(q.x,q.z)-q.level,sides:[-1,1].map(side=>{const half=side<0?q.left:q.right,a=parameters(q.offset,side);return{side,...a,points:Array.from({length:65},(_,i)=>{const d=half+(q.outer-half)*i/64,p=xy(q,side,d),v=value(p.x,p.z);return[d,v.old-q.level,v.y-q.level];})};})}));
// Boundary and finite-neighbour continuity checks on both ends, not just samples.
let endpointError=0,endpointNearDifference=0;for(const s of [-18,18])for(const side of [-1,1])for(let k=0;k<=64;k++){const q=at(s),half=side<0?q.left:q.right,p=xy(q,side,half+(q.outer-half)*k/64),v=value(p.x,p.z);endpointError=Math.max(endpointError,Math.abs(v.y-v.old));const qi=at(s-Math.sign(s)*.0001),pi=xy(qi,side,half+(q.outer-half)*k/64),vi=value(pi.x,pi.z);endpointNearDifference=Math.max(endpointNearDifference,Math.abs(vi.y-vi.old));}assert.ok(endpointError<1e-7);assert.ok(endpointNearDifference<1e-6);
const grass=[];for(let iz=Math.floor(minZ/MEADOW.cell);iz<=Math.ceil(maxZ/MEADOW.cell);iz++)for(let ix=Math.floor(minX/MEADOW.cell);ix<=Math.ceil(maxX/MEADOW.cell);ix++){const r=eco._grassAt(ix,iz);if(r){const{brookAsset,...plain}=r;grass.push(plain);brookAsset?.dispose();}}
const waterSections=sections.map(q=>{if(Math.abs(q.offset)>=18)return {...q};const sides=[-1,1].map(side=>{
 const original=side<0?q.left:q.right,distances=[...Array.from({length:257},(_,j)=>q.outer*j/256),original].sort((a,b)=>a-b);let last=0;
 for(const d of distances){const p=xy(q,side,d),v=value(p.x,p.z);if(v.y-q.level>=-1e-8){let lo=last,hi=d;for(let k=0;k<24;k++){const m=(lo+hi)/2,p=xy(q,side,m);if(value(p.x,p.z).y-q.level>=-1e-8)hi=m;else lo=m;}return(lo+hi)/2;}last=d;}
 throw new Error('No connected dry bank intersection at '+q.offset+'/'+side+'; never use section.outer as a fabricated water edge');
 });return{...q,left:sides[0],right:sides[1]};});
let newlySubmergedGrass=0;for(const r of grass){const v=value(r.x,r.z);if(Number.isFinite(v.water)&&v.old>=v.water&&v.y<v.water)newlySubmergedGrass++;}
assert.equal(newlySubmergedGrass,0,'no originally dry grass root is flooded');
const eyeQ=at(0),eyeP=xy(eyeQ,-1,eyeQ.left+1.4),eyeV=value(eyeP.x,eyeP.z),eye={x:eyeP.x-cx,z:eyeP.z-cz,sourceY:eyeV.old-y0+1.7,candidateY:eyeV.y-y0+1.7,target:[eyeQ.x-cx+eyeQ.fx*5,eyeQ.z-cz+eyeQ.fz*5,eyeQ.level-y0]};
const waterlineMovement=Math.max(...waterSections.flatMap((q,i)=>[Math.abs(q.left-sections[i].left),Math.abs(q.right-sections[i].right)]));
for(const i of [0,sections.length-1]){assert.equal(waterSections[i].left,sections[i].left);assert.equal(waterSections[i].right,sections[i].right);}
const treeProjection=trees.map(t=>({x:t.x-cx,z:t.z-cz,y:t.y-y0,scale:t.s??t.scale??1}));
let rootHeightDelta=0;for(const t of trees){const v=value(t.x,t.z);rootHeightDelta=Math.max(rootHeightDelta,Math.abs(v.y-v.old));}assert.ok(rootHeightDelta<1e-8,'all original trunk support unchanged');
let minDepth=Infinity,maxDepth=0;for(const v of grid)if(v[4]===3){const dep=v[5]-v[3];minDepth=Math.min(minDepth,dep);maxDepth=Math.max(maxDepth,dep);}assert.ok(minDepth>0);
const crestToeWidths=profiles.flatMap(p=>p.sides.map(side=>({offset:p.offset,side:side.side,width:(side.crest-side.toe)*(side.points.at(-1)[0]-side.points[0][0])})));
const widthRange=[Math.min(...crestToeWidths.map(v=>v.width)),Math.max(...crestToeWidths.map(v=>v.width))];assert.ok(widthRange[1]-widthRange[0]>.1,'longitudinal crest/toe separation is not a constant template');
const checks={waterlineMovement,newlySubmergedGrass,rootHeightDelta,minDepth,maxDepth,crestToeWidthRange:widthRange,changedVertices:changed,maxDelta,protectedChanged,waterChanged,endpointError,endpointNearDifference,trees:trees.length,treeSourceHash:rootsBefore,grass:grass.length,grassSourceHash:hash(grass),sourceSegmentsHash:sourceBefore,note:'Offline immutable source roots. Production seating/wind acceptance not performed; no root geometry changed.'};
writeFileSync(out+'/data.json',JSON.stringify({scope:'Offline geometry study, not production materials/GI or adoption',origin:[cx,y0,cz],eye,controls,samples,sections,waterSections,profiles,checks,grid,faces,nx,nz,trees:treeProjection}));writeFileSync(out+'/source-roots.json',JSON.stringify({trees,grass}));console.log(JSON.stringify({controls:controls.map(c=>({offset:c.offset,reasons:c.reasons})),checks,vertices:grid.length},null,2));eco.dispose();
