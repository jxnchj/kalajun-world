import {REACH_DESIGN69_UNITS,REACH_DESIGN69_REVISION,REACH_DESIGN69_STONES} from './reach-design69.js';
import {projectRiverSection} from './river-section.js';
import {loadReachBedFacies66Assets,installReachBedFacies66,REACH_BED_FACIES66_GLSL,REACH_BED_FACIES66_MIX_GLSL} from './reach-bed-facies66.js';
export {loadReachBedFacies66Assets as loadReachDesign69Assets};
const smooth=(a,b,x)=>{const t=Math.max(0,Math.min(1,(x-a)/(b-a)));return t*t*(3-2*t);};
const bell=x=>Math.abs(x)>=1?0:(1-x*x)**3;
const n=x=>'('+Number(x).toFixed(10)+')',v=(x,z)=>'vec2('+n(x)+','+n(z)+')';
export function reachDesign69MaterialSource(world){const reach=world.hydrology.forestReach39;if(!reach?.stats.design69)throw Error('Reach69 material requires the same candidate world');return {origin:reach.origin,segments:world.hydrology.segments.filter(reach.activeSegment)};}
export function projectReachDesign69(source,x,z){let best=null,score=Infinity;for(const s of source.segments){const dx=s.b.x-s.a.x,dz=s.b.z-s.a.z,t=Math.max(0,Math.min(1,((x-s.a.x)*dx+(z-s.a.z)*dz)/(dx*dx+dz*dz))),p=projectRiverSection(x,z,s,t),rank=p.distance*p.distance;if(rank<score){score=rank;best=[p.section.distance-source.origin,p.signed];}}return best;}
export function reachDesign69Inner(offset,signed){let inner=0,total=0;for(const u of REACH_DESIGN69_UNITS){const w=bell((offset-u.offset)/u.reach);inner+=w*u.inner;total+=w;}return Math.max(0,Math.min(1,Math.sign(signed)*inner/Math.max(1,total)));}
export function reachDesign69MineralFine(offset,signed,clearance,slope){const inner=reachDesign69Inner(offset,signed),flat=1-smooth(.035,.22,slope),shallow=1-smooth(.10,.27,-clearance);return Math.max(.08,Math.min(.94,.22+.60*inner+.20*flat*shallow-.12*(1-flat)*(1-inner)));}
// A damp exposed film and a submerged grain surface are distinct. The dry scan
// roughness is the input, so a later scan hook cannot overwrite this response.
export function reachDesign69Roughness(dry,wetness,clearance,grain){const film=wetness*(1-smooth(-.01,.035,clearance)),wet=Math.max(.34,dry*(.60+.10*grain));return dry+(wet-dry)*film;}
function replaceOnce(s,a,b){if(s.split(a).length!==2)throw Error('Reach69 shader contract changed: '+a);return s.replace(a,b);}
function glsl(source){
 const seg=source.segments.map(s=>{
  const a=s.a,b=s.b,dx=b.x-a.x,dz=b.z-a.z,nx=-a.flowZ,nz=a.flowX,dnx=-b.flowZ-nx,dnz=b.flowX-nz,A=-(dx*dnz-dz*dnx);
  return `{vec2 d=world-${v(a.x,a.z)},delta=${v(dx,dz)};float t=clamp(dot(d,delta)/dot(delta,delta),0.,1.);float A=${n(A)},B=d.x*${n(dnz)}-d.y*${n(dnx)}-${n(dx*nz-dz*nx)},C=d.x*${n(nz)}-d.y*${n(nx)};for(int k=0;k<2;k++){float derivative=2.*A*t+B;if(abs(derivative)>1e-8)t=clamp(t-(A*t*t+B*t+C)/derivative,0.,1.);}vec2 rel=d-delta*t,flow=normalize(mix(${v(a.flowX,a.flowZ)},${v(b.flowX,b.flowZ)},t));float rank=dot(rel,rel);if(rank<best){best=rank;result=vec2(mix(${n(a.distance-source.origin)},${n(b.distance-source.origin)},t),dot(rel,vec2(-flow.y,flow.x)));}}`;
 }).join('\n');
 return `uniform float uReachBedFacies66;uniform float uReachBedDiagnostic66;uniform float uReachFineLayer66;
${REACH_BED_FACIES66_MIX_GLSL}
float reachBell69(float x){if(abs(x)>=1.)return 0.;float y=1.-x*x;return y*y*y;}
vec2 reachCoordinates69(vec2 world){if(distance(world,vec2(-3611.98133053,4805.37128229))>23.)return vec2(100.,0.);float best=1e20;vec2 result=vec2(100.,0.);${seg}return result;}
float reachInner69(vec2 q){float inner=0.,total=0.,w;${REACH_DESIGN69_UNITS.map(u=>`w=reachBell69((q.x-${n(u.offset)})/${n(u.reach)});inner+=w*${n(u.inner)};total+=w;`).join('')}return clamp(sign(q.y)*inner/max(1.,total),0.,1.);}
vec2 reachBedWeights66(vec2 world,float clearance,float shore,float wetness,float meso,float snow,vec2 q,float slope){
 float extent=1.-smoothstep(14.,18.,abs(q.x));float domain=extent*(1.-smoothstep(.025,.085,clearance))*(1.-smoothstep(.18,.42,shore))*(1.-clamp(snow,0.,1.));
 float inner=reachInner69(q),flatness69=1.-smoothstep(.035,.22,slope),shallow=1.-smoothstep(.10,.27,-clearance);
 float fine=clamp(.22+.60*inner+.20*flatness69*shallow-.12*(1.-flatness69)*(1.-inner),.08,.94);
 ${REACH_DESIGN69_STONES.map(([x,z,rx,rz,rot])=>`{vec2 d=world-${v(x,z)};float radius=length(vec2(dot(d,${v(Math.cos(rot),-Math.sin(rot))})/${n(rx+.1)},dot(d,${v(Math.sin(rot),Math.cos(rot))})/${n(rz+.1)}));fine*=smoothstep(1.,1.45,radius);}`).join('\n')}
 return reachFaciesMix66(1.-fine,domain);
}
float reachWetRough69(float dry,float wetness,float clearance,float grain){float film=wetness*(1.-smoothstep(-.01,.035,clearance));return mix(dry,max(.34,dry*(.60+.10*grain)),film);}
`;
}
export function installReachDesign69Material(material,{world,assets,enabled=false}={}){
 const source=reachDesign69MaterialSource(world),base=installReachBedFacies66(material,{assets,enabled:false});let installed=false,inner,key,hook,cache,disposed=false;
 const stats={revision:REACH_DESIGN69_REVISION,shapeUnits:3,projectionSegments:source.segments.length,extraSamplers:0,scan:base.stats};
 function activate(){if(installed)return;base.setEnabled(true);inner=material.onBeforeCompile;key=material.customProgramCacheKey;
  hook=function(shader,...args){inner.call(this,shader,...args);let s=shader.fragmentShader;s=replaceOnce(s,REACH_BED_FACIES66_GLSL,glsl(source));
   const anchor='float reachExtent41=';const start=s.indexOf(anchor);if(start<0)throw Error('Reach69 extent anchor');s=s.slice(0,start)+'vec2 reachLandform69=uReachBedFacies66>0.?reachCoordinates69(terrainXZ):vec2(100.,0.);\n '+s.slice(start);
   const dry='reachBed41=max(reachBed41,reachDryDeposit41);';s=replaceOnce(s,dry,`if(uReachBedFacies66>0.)reachDryDeposit41=max(reachDryDeposit41,uReachBedFacies66*reachExtent41*reachInner69(reachLandform69)*(1.-smoothstep(.025,.085,vTerrainHydrology.w))*(1.-smoothstep(.18,.42,vTerrainShoreDistance))*(1.-terrainSnow));\n${dry}`);
   s=replaceOnce(s,'terrainWetness,terrainMeso,terrainSnow),uReachBedFacies66)','terrainWetness,terrainMeso,terrainSnow,reachLandform69,terrainSlope),uReachBedFacies66)');
   const rough='roughnessFactor=mix(roughnessFactor,mix(reachBedRough66,.96,reachRoots41),reachTotal41*.7);';
   s=replaceOnce(s,rough,`float reachFinalRough69=mix(reachBedRough66,reachWetRough69(reachBedRough66,terrainWetness,vTerrainHydrology.w,terrainShoreGrain),uReachBedFacies66);\nroughnessFactor=mix(roughnessFactor,mix(reachFinalRough69,.96,reachRoots41),reachTotal41*.7);`);
   // Water retains its own Fresnel/refraction. Do not add opaque body tint or
   // flatten the actual photographed mineral normal to manufacture wetness.
   shader.fragmentShader=s;
  };
  cache=function(){return key.call(this)+'-'+REACH_DESIGN69_REVISION;};material.onBeforeCompile=hook;material.customProgramCacheKey=cache;material.needsUpdate=true;installed=true;
 }
 const owner={stats,uniform:base.uniform,setEnabled(value){if(disposed||typeof value!=='boolean')throw Error('Expected live Reach69 boolean');if(value)activate();base.setEnabled(value);},setDiagnostic:v=>base.setDiagnostic(v),dispose(){if(disposed)return;disposed=true;if(installed){if(material.onBeforeCompile===hook)material.onBeforeCompile=inner;if(material.customProgramCacheKey===cache)material.customProgramCacheKey=key;}base.dispose();}};
 try{owner.setEnabled(enabled);}catch(e){owner.dispose();throw e;}return owner;
}
