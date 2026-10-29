import {REACH_DESIGN73_STATIONS,REACH_DESIGN73_REVISION,reachDesign73Roles} from './reach-design73.js';
import {REACH_DESIGN69_STONES} from './reach-design69.js';
import {projectReachDesign69} from './reach-design69-material.js';
import {loadReachBedFacies66Assets,installReachBedFacies66,REACH_BED_FACIES66_GLSL,REACH_BED_FACIES66_MIX_GLSL} from './reach-bed-facies66.js';
export {loadReachBedFacies66Assets as loadReachDesign73Assets,reachDesign73Roles};
const n=x=>'('+Number(x).toFixed(10)+')',v=(x,z)=>'vec2('+n(x)+','+n(z)+')';
export function reachDesign73MaterialSource(world){const r=world.hydrology.forestReach39;if(!r?.stats.design73)throw Error('Reach73 material requires candidate73 geometry');return{origin:r.origin,segments:world.hydrology.segments.filter(r.activeSegment)};}
export const projectReachDesign73=projectReachDesign69;
function once(s,a,b){if(s.split(a).length!==2)throw Error('Reach73 shader source contract: '+a);return s.replace(a,b);}
function glsl(source){
 const segments=source.segments.map(s=>{const a=s.a,b=s.b,dx=b.x-a.x,dz=b.z-a.z,nx=-a.flowZ,nz=a.flowX,dnx=-b.flowZ-nx,dnz=b.flowX-nz,A=-(dx*dnz-dz*dnx);return `{vec2 d=world-${v(a.x,a.z)},delta=${v(dx,dz)};float t=clamp(dot(d,delta)/dot(delta,delta),0.,1.);float A=${n(A)},B=d.x*${n(dnz)}-d.y*${n(dnx)}-${n(dx*nz-dz*nx)},C=d.x*${n(nz)}-d.y*${n(nx)};for(int k=0;k<2;k++){float derivative=2.*A*t+B;if(abs(derivative)>1e-8)t=clamp(t-(A*t*t+B*t+C)/derivative,0.,1.);}vec2 rel=d-delta*t,flow=normalize(mix(${v(a.flowX,a.flowZ)},${v(b.flowX,b.flowZ)},t));float rank=dot(rel,rel);if(rank<best){best=rank;result=vec2(mix(${n(a.distance-source.origin)},${n(b.distance-source.origin)},t),dot(rel,vec2(-flow.y,flow.x)));}}`;}).join('\n');
 const stations=REACH_DESIGN73_STATIONS.slice(1).map((b,k)=>{const a=REACH_DESIGN73_STATIONS[k];return `if(offset<=${n(b[0])}){float t=smoothstep(${n(a[0])},${n(b[0])},offset);shape=mix(vec4(${a.slice(1,5).map(n)}),vec4(${b.slice(1,5).map(n)}),t);cuts=mix(${v(a[5],a[6])},${v(b[5],b[6])},t);return;}`;}).join('\n');
 return `uniform float uReachBedFacies66;uniform float uReachBedDiagnostic66;uniform float uReachFineLayer66;
${REACH_BED_FACIES66_MIX_GLSL}
float reachBell73(float x){float a=max(0.,1.-x*x);return a*a*a;}
vec2 reachCoordinates73(vec2 world){if(distance(world,vec2(-3611.98133053,4805.37128229))>23.)return vec2(100.,0.);float best=1e20;vec2 result=vec2(100.,0.);${segments}return result;}
void reachShape73(float offset,out vec4 shape,out vec2 cuts){${stations}shape=vec4(.68,.32,0.,.18);cuts=vec2(0.);}
vec4 reachRoles73(vec2 q,float clearance,vec2 world){
 float extent=(1.-smoothstep(15.,18.,abs(q.x)))*(1.-smoothstep(1.8052,2.1052,abs(q.y)));if(extent<=0.)return vec4(0.);
 vec4 shape;vec2 cuts;reachShape73(q.x,shape,cuts);float halfWidth=q.y<0.?shape.x:shape.y,gap=abs(q.y)-halfWidth;
 float bank=smoothstep(-.19,.18,gap)*smoothstep(-.13,.02,clearance);
 float cut=(q.y<0.?cuts.x:cuts.y)*smoothstep(-.03,.09,gap)*(1.-smoothstep(.45,.80,gap));
 float thread=exp(-pow((q.y-shape.z)/.43,2.));
 float lenses=max(max(reachBell73((q.x+14.4)/2.3)*.85,reachBell73((q.x-5.)/1.8)),reachBell73((q.x-14.8)/2.4)*.8);
 float coarse=clamp(.08+.88*lenses*thread,0.,1.);
 ${REACH_DESIGN69_STONES.map(([x,z,rx,rz,rot])=>`{vec2 d=world-${v(x,z)};float r=length(vec2(dot(d,${v(Math.cos(rot),-Math.sin(rot))})/${n(rx+.10)},dot(d,${v(Math.sin(rot),Math.cos(rot))})/${n(rz+.10)}));coarse=max(coarse,1.-smoothstep(1.,1.40,r));}`).join('\n')}
 return vec4(bank,cut,coarse,extent);
}
vec2 reachBedWeights66(vec2 world,float clearance,float shore,float wetness,float meso,float snow){vec2 q=reachCoordinates73(world);vec4 roles=reachRoles73(q,clearance,world);return reachFaciesMix66(roles.z,roles.w*(1.-snow));}
`;
}
export function installReachDesign73Material(material,{world,assets,enabled=false}={}){
 const source=reachDesign73MaterialSource(world),base=installReachBedFacies66(material,{assets,enabled:false});let installed=false,inner,key,hook,cache,disposed=false;
 const stats={revision:REACH_DESIGN73_REVISION,roles:['mineral-bed','fine-toe','cohesive-cut','rooted-low-bank'],projectionSegments:source.segments.length,extraSamplers:0,scan:base.stats};
 function activate(){if(installed)return;base.setEnabled(true);inner=material.onBeforeCompile;key=material.customProgramCacheKey;
  hook=function(shader,...args){inner.call(this,shader,...args);let s=once(shader.fragmentShader,REACH_BED_FACIES66_GLSL,glsl(source));
   s=once(s,'float reachExtent41=',`vec4 reachLandform73=vec4(0.);if(uReachBedFacies66>0.)reachLandform73=reachRoles73(reachCoordinates73(terrainXZ),vTerrainHydrology.w,terrainXZ);\nfloat reachExtent41=`);
   // Write the final role after facies44 recovery, before any of the three
   // material channels. The same bank control owns colour/normal/roughness.
   s=once(s,'float reachTotal41=max(reachBed41,reachRoots41);',`float reachActive73=uReachBedFacies66*reachLandform73.w*(1.-terrainSnow);
reachRoots41=mix(reachRoots41,reachLandform73.x,reachActive73);
reachBed41=mix(reachBed41,1.-reachLandform73.x,reachActive73);
vec3 reachSoilCut73=terrainOrganicSoil*(.84+.32*terrainSoilValue.r);
reachOrganic41=mix(reachOrganic41,reachSoilCut73,reachActive73*reachLandform73.y);
float reachTotal41=max(reachBed41,reachRoots41);`);
   s=once(s,'terrainGradient=mix(terrainGradient,terrainForestGradient+terrainReferenceGradient,reachRoots41);',`vec3 reachBankGradient73=mix(terrainForestGradient+terrainReferenceGradient,vec3(terrainSoilValue.g,0.,terrainSoilValue.b)*.35,reachActive73*reachLandform73.y);
terrainGradient=mix(terrainGradient,reachBankGradient73,reachRoots41);`);
   const rough='roughnessFactor=mix(roughnessFactor,mix(reachBedRough66,.96,reachRoots41),reachTotal41*.7);';
   s=once(s,rough,`float reachWet73=terrainWetness*(1.-smoothstep(-.01,.035,vTerrainHydrology.w))*reachActive73;
float reachMineralRough73=mix(reachBedRough66,max(.34,reachBedRough66*.65),reachWet73);
float reachBankRough73=mix(.96,.88+.08*terrainSoilValue.a,reachActive73*reachLandform73.y);
roughnessFactor=mix(roughnessFactor,mix(reachMineralRough73,reachBankRough73,reachRoots41),reachTotal41*.7);`);
   shader.fragmentShader=s;
  };
  cache=function(){return key.call(this)+'-'+REACH_DESIGN73_REVISION;};material.onBeforeCompile=hook;material.customProgramCacheKey=cache;material.needsUpdate=true;installed=true;
 }
 const owner={stats,uniform:base.uniform,setEnabled(value){if(disposed||typeof value!=='boolean')throw Error('Expected live Reach73 boolean');if(value)activate();base.setEnabled(value);},setDiagnostic:v=>base.setDiagnostic(v),dispose(){if(disposed)return;disposed=true;if(installed){if(material.onBeforeCompile===hook)material.onBeforeCompile=inner;if(material.customProgramCacheKey===cache)material.customProgramCacheKey=key;}base.dispose();}};
 try{owner.setEnabled(enabled);}catch(e){owner.dispose();throw e;}return owner;
}
