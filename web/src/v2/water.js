import {RIVER_BED_GLSL} from "./river-bed-profile.js";
import {visualDelta} from './visual-time.js';
import * as THREE from "three";
import { shoreMaterialVariation, SHORE_MATERIAL_GLSL } from "./shore-material.js";
import { createShoreStones, createShoreRockGeometry, createRiverPebbleGeometry, shoreStoneMatrix } from "./shore-stones.js";
export { createShoreStones, createShoreRockGeometry } from "./shore-stones.js";
import { riverSectionAt, riverCrossPoint } from "./river-section.js";
import { createWaterReflectionUniforms, LocalWaterReflection } from "./water-reflection.js";
import { bindWaterSlopeField, WATER_SURFACE_GLSL } from "./water-surface.js";
import { createWaterRefractionUniforms, WaterRefractionCapture, WATER_REFRACTION_GLSL } from "./water-refraction.js";
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v)),mix=(a,b,t)=>a+(b-a)*t;
const CHUNK=128,NEAR=980,STONE_RANGE=260;
const distanceBox=(p,b)=>Math.hypot(Math.max(b.minX-p.x,0,p.x-b.maxX),Math.max(b.minZ-p.z,0,p.z-b.maxZ));
function random(id,seed=0){let h=2166136261^seed;for(const c of id)h=Math.imul(h^c.charCodeAt(0),16777619);return (h>>>0)/4294967296;}
const at=riverSectionAt;
// A single immutable-node lookup serves every chunk and both water representations.
// Integrate travel time once: time * a per-segment speed would split the phase at
// every slope change and stretch those seams further the longer the world runs.
export const RIVER_PHASE_SPEED=.85;
export function createRiverPhaseData(lines){
  const values=new WeakMap();
  for(const {nodes} of lines){
    const rates=nodes.map((n,i)=>{
      const a=nodes[Math.max(0,i-1)],b=nodes[Math.min(nodes.length-1,i+1)];
      const span=b.distance-a.distance,slope=span>0?Math.max(0,(a.level-b.level)/span):0;
      const speed=.38+Math.min(2.8,slope*10)+Math.sqrt(n.width)*.12;
      if(![n.distance,slope,speed].every(Number.isFinite)||speed<=0)throw new TypeError("Invalid river phase profile");
      return {slope,speed};
    });
    let phase=0;
    for(let i=0;i<nodes.length;i++){
      if(i)phase+=Math.max(0,nodes[i].distance-nodes[i-1].distance)*.5*(1/rates[i-1].speed+1/rates[i].speed)*RIVER_PHASE_SPEED;
      values.set(nodes[i],{phase,...rates[i]});
    }
  }
  return values;
}
// Both representations use the same cross-sections, level profile and channel positions.
export function createWaterGeometry(segments,{detail=false,phaseData=null,reach=null}={}){
  const positions=[],flow=[],hydro=[],phase=[],profile=[],bedShape=[],across=[],indices=[],reachDepth=[],baseCross=detail?[-1,-.55,0,.55,1]:[-1,1];
  for(const s of segments){
    const physical=Boolean(reach?.activeSegment(s)),cross=physical?Array.from({length:65},(_,i)=>-1+i/32):baseCross;
    const pa=phaseData?.get(s.a),pb=phaseData?.get(s.b);
    if(phaseData&&(!pa||!pb))throw new Error("Missing shared river phase for "+s.id);
    const times=physical?reach.waterSamples(s):null,steps=physical?times.length-1:detail?Math.max(1,Math.ceil(s.length/1.7)):1,start=positions.length/3;
    for(let j=0;j<=steps;j++){
      const t=physical?times[j]:j/steps,n=physical?reach.waterSectionAt(s,t):at(s,t),length=Math.hypot(n.fx,n.fz)||1,fx=n.fx/length,fz=n.fz/length;
      const travelPhase=mix(pa?.phase??s.a.distance,pb?.phase??s.b.distance,t),slope=mix(pa?.slope??s.slope,pb?.slope??s.slope,t);
      const fallbackSpeed=.38+Math.min(2.8,slope*10)+Math.sqrt(n.width)*.12,speed=mix(pa?.speed??fallbackSpeed,pb?.speed??fallbackSpeed,t);
      for(const side of cross){const point=riverCrossPoint(n,side);positions.push(point.x,n.level+.006,point.z);
        flow.push(fx,fz);hydro.push(n.depth,n.width,s.slope,n.distance);phase.push(travelPhase,slope,speed);profile.push(n.weight,n.barLeft,n.barRight,n.left/n.width);bedShape.push(n.bedWeight,n.bedDepositLeft,n.bedDepositRight);across.push(side);if(reach)reachDepth.push(physical?reach.depthAt(point.x,point.z,n.level):0,physical?1:0);}
    }
    for(let j=0;j<steps;j++)for(let k=0;k<cross.length-1;k++){
      const a=start+j*cross.length+k,b=a+1,c=a+cross.length,d=c+1;
      indices.push(a,b,c,b,d,c);
    }
  }
  const g=new THREE.BufferGeometry();g.setAttribute("position",new THREE.Float32BufferAttribute(positions,3));
  g.setAttribute("aRiverFlow",new THREE.Float32BufferAttribute(flow,2));g.setAttribute("aRiver",new THREE.Float32BufferAttribute(hydro,4));g.setAttribute("aAcross",new THREE.Float32BufferAttribute(across,1));
  g.setAttribute("aRiverPhase",new THREE.Float32BufferAttribute(phase,3));g.setAttribute("aRiverProfile",new THREE.Float32BufferAttribute(profile,4));
  g.setAttribute("aRiverBedShape",new THREE.Float32BufferAttribute(bedShape,3));
  if(reach)g.setAttribute("aReachDepth",new THREE.Float32BufferAttribute(reachDepth,2));
  g.setIndex(indices);g.computeVertexNormals();g.computeBoundingBox();g.computeBoundingSphere();return g;
}
export function createWaterMaterial(uniforms,{overview=false,reachEnabled=false}={}){
  // PBR reflection plus an optional opaque scene snapshot, without a second scene pass.
  const m=new THREE.MeshPhysicalMaterial({color:0xffffff,roughness:.21,metalness:0,ior:1.333,
    transparent:true,opacity:1,depthWrite:false,side:THREE.DoubleSide,envMapIntensity:.85,specularIntensity:1});
  m.name=overview?"river-overview-pbr":"river-near-pbr";m.userData.waterReflectionSurface=true;
  const reflectionDefaults=createWaterReflectionUniforms(),surfaceDefaults={...bindWaterSlopeField(m),uWaterSurfaceDetail:{value:1},uWaterOpticsDetail:{value:1}};
  m.onBeforeCompile=shader=>{
    Object.assign(shader.uniforms,reflectionDefaults,surfaceDefaults,createWaterRefractionUniforms(),uniforms);
    if(reachEnabled){
      shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nattribute vec2 aReachDepth; varying vec2 vReachDepth;').replace('#include <begin_vertex>','#include <begin_vertex>\nvReachDepth=aReachDepth;');
      shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nvarying vec2 vReachDepth;');
    }
    shader.vertexShader=shader.vertexShader.replace("#include <common>",`#include <common>
attribute vec2 aRiverFlow;
attribute vec3 aRiverPhase;
attribute vec4 aRiverProfile;
attribute vec3 aRiverBedShape;
attribute vec4 aRiver;
attribute float aAcross;
varying vec2 vRiverFlow;
varying vec3 vRiverPhase;
varying vec4 vRiverProfile;
varying vec3 vRiverBedShape;
varying vec4 vRiver;
varying float vAcross;
varying vec3 vRiverWorld;`).replace("#include <begin_vertex>",`#include <begin_vertex>
vRiverBedShape=aRiverBedShape;vRiverFlow=aRiverFlow;vRiverPhase=aRiverPhase;vRiverProfile=aRiverProfile;vRiver=aRiver;vAcross=aAcross;vRiverWorld=(modelMatrix*vec4(transformed,1.0)).xyz;`);
    shader.fragmentShader=shader.fragmentShader.replace("#include <common>",`#include <common>
${RIVER_BED_GLSL}
${WATER_SURFACE_GLSL}
${WATER_REFRACTION_GLSL}
uniform float uWaterTime;
uniform vec3 uWaterViewer;
uniform float uWaterNearCoverage;
uniform sampler2D uRiverReflectionMap;
uniform vec2 uRiverReflectionSize;
uniform mat4 uRiverReflectionMatrix;
uniform vec4 uRiverReflectionPlane;
uniform vec3 uRiverReflectionPatch;
uniform float uRiverReflectionValid;
varying vec2 vRiverFlow;
varying vec3 vRiverPhase;
varying vec4 vRiverProfile;
varying vec3 vRiverBedShape;
varying vec4 vRiver;
varying float vAcross;
varying vec3 vRiverWorld;
float riverHash(vec2 p){return fract(sin(dot(p,vec2(12.9898,78.233)))*43758.5453);}
// One two-channel, four-corner field. No texture, trigonometric hash, 3D noise
// or octave loop. It varies packet strength/phase without bending every crest
// into the same repeating sine curve.
vec2 riverPacketHash(vec2 p){
  vec3 q=fract(vec3(p.xyx)*vec3(.1031,.1030,.0973));
  q+=dot(q,q.yzx+33.33);
  return fract((q.xx+q.yz)*q.zy);
}
vec2 riverPacketField(vec2 p){
  vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);
  return mix(mix(riverPacketHash(i),riverPacketHash(i+vec2(1.0,0.0)),f.x),
             mix(riverPacketHash(i+vec2(0.0,1.0)),riverPacketHash(i+vec2(1.0)),f.x),f.y);
}
`).replace("#include <color_fragment>",`#include <color_fragment>
float riverDistance=length(vRiverWorld.xz-uWaterViewer.xz);
float riverU=clamp(abs(vAcross),0.0,1.0);
float riverShelf=mix(vRiverProfile.y,vRiverProfile.z,step(0.0,vAcross));
float riverDeposit=mix(vRiverBedShape.y,vRiverBedShape.z,step(0.0,vAcross));
float riverDepth=riverBedDepth(vRiver.x,vRiverProfile.x,vAcross,riverShelf,vRiverBedShape.x,riverDeposit);
${reachEnabled?'if(vReachDepth.y>.5)riverDepth=max(0.,vReachDepth.x);':''}
float riverEdge=1.0-smoothstep(.84,1.0,abs(vAcross));
// Shared cumulative travel time, scaled to reference metres, increases downstream.
// dot(worldXZ,changingFlow) is NOT a streamline coordinate: it creates large
// phase gradients at bends merely because the river is far from world origin.
float along=vRiverPhase.x;
float lateral=vAcross*vRiver.y*mix(vRiverProfile.w,1.0-vRiverProfile.w,step(0.0,vAcross));
vec2 riverFlow=normalize(vRiverFlow+vec2(.0000001,0.0));
float drift=along-uWaterTime*${RIVER_PHASE_SPEED};
vec2 riverPacket;
float riverRiffle;
vec3 riverPhase,waveFilter,waveSlope;
float riverUnresolved;
vec2 localGradient;
float riverWaveResolved=1.0;
float riverPixelFootprint=length(fwidth(vRiverWorld.xz));
float riverAcrossFootprint=fwidth(vAcross);
float riverNormalDamping=smoothstep(.02,.12,riverDepth);
if(uWaterOpticsDetail>.5){
  // Millimetre-scale film coverage plus pixel antialiasing, independent of the
  // river width. Retain the real shallow bed instead of a fixed coloured film.
  float halfWidth=vRiver.y*mix(vRiverProfile.w,1.0-vRiverProfile.w,step(0.0,vAcross));
  float edgeWidth=max(.006/max(.05,halfWidth),riverAcrossFootprint*1.5);
  riverEdge=(1.0-smoothstep(1.0-edgeWidth,1.0,riverU))*smoothstep(.0005,.006,riverDepth);
  riverNormalDamping=smoothstep(.003,.055,riverDepth);
}
if(uWaterSurfaceDetail>.5){
  // All bands travel in the immutable integrated streamline phase. Neither
  // changing local speed nor a chunk boundary restarts the animation clock.
  float speed=max(.25,vRiverPhase.z);
  float froude=speed/sqrt(9.81*max(.045,riverDepth));
  riverRiffle=clamp(vRiverPhase.y*4.5+smoothstep(.35,1.25,froude)*.58,0.0,1.0);
  if(uWaterOpticsDetail>.5)riverRiffle=riverFlowResponse(riverDepth,vRiver.x,vAcross,speed,vRiverPhase.y).y;
  vec2 coarseUV=vec2(drift,lateral)/14.0+vRiverWorld.xz*.00031;
  mat2 turn=mat2(.8,.6,-.6,.8);
  vec2 fineUV=turn*vec2(drift*1.09,lateral)/3.9+vec2(.37,.13);
  vec2 bandFootprint=vec2(max(fwidth(coarseUV).x,fwidth(coarseUV).y)*12.0,
                          max(fwidth(fineUV).x,fwidth(fineUV).y)*27.0);
  vec2 bandResolved=1.0-smoothstep(vec2(.24),vec2(.85),bandFootprint);
  // Only two filtered taps, shared by both near/far representations. The
  // fields contain 16/24 differently oriented modes instead of long sine rows.
  vec2 coarseSlope=texture2D(uRiverSlopeMap,coarseUV).rg*2.0-1.0;
  vec2 fineSlope=texture2D(uRiverSlopeMap,fineUV).ba*2.0-1.0;
  vec2 strength=vec2(.055+.075*riverRiffle,.070+.170*riverRiffle);
  if(uWaterOpticsDetail>.5)strength=vec2(.060+.065*riverRiffle,.040+.190*riverRiffle);
  vec2 fineGradient=mat2(.8,-.6,.6,.8)*fineSlope;
  fineGradient.x*=1.09;
  localGradient=coarseSlope*strength.x*bandResolved.x+fineGradient*strength.y*bandResolved.y;
  localGradient.x*=clamp(.85/speed,.3,1.8);
  riverUnresolved=dot(strength*strength*(vec2(1.0)-bandResolved*bandResolved),uRiverSlopeVariance);
  riverWaveResolved=dot(bandResolved,vec2(.35,.65));
  riverPacket=clamp(vec2(.5)+vec2(coarseSlope.x,fineSlope.y)*.5,0.0,1.0);
}else{
vec2 packetCoord=vec2(drift*.43,lateral*.77)+vRiverWorld.xz*.0037;
vec2 packetFootprint=fwidth(packetCoord);
float packetResolved=1.0-smoothstep(.4,1.4,max(packetFootprint.x,packetFootprint.y));
riverPacket=mix(vec2(.5),riverPacketField(packetCoord),packetResolved);
riverRiffle=clamp(vRiverPhase.y*6.0+(1.0-smoothstep(.06,.42,riverDepth))*.22,0.0,1.0);
riverPhase=vec3(drift*5.3+lateral*1.9,
                    drift*13.7-lateral*6.1,
                    drift*29.1+lateral*13.3)
  +vec3(riverPacket.y*2.1,riverPacket.x*3.7+1.7,(riverPacket.x+riverPacket.y)*5.4+4.1);
waveFilter=1.0-smoothstep(vec3(.55),vec3(2.3),fwidth(riverPhase));
waveSlope=vec3(.022,.021,.017)*
  vec3(.32+.68*riverPacket.x,.20+.80*riverPacket.y,.18+.82*(1.0-riverPacket.x))*(.8+riverRiffle*.65);
riverUnresolved=dot(waveSlope*waveSlope,vec3(1.0)-waveFilter*waveFilter);

vec3 ripple=cos(riverPhase)*waveSlope*waveFilter;
localGradient=normalize(vec2(5.3,1.9))*ripple.x
  +normalize(vec2(13.7,-6.1))*ripple.y+normalize(vec2(29.1,13.3))*ripple.z;
}
// Derivatives of the actual distorted reflection coordinates must be evaluated
// before the near/far coverage discards. Filter only undersampled texels, rather
// than adding a constant broad blur to all reflected banks and water waves.
vec4 riverOpticsProjected=vec4(0.0);
float riverReflectionFootprintLod=0.0;
if(uWaterOpticsDetail>.5&&uRiverReflectionValid>.001){
  vec2 opticsGradient=(riverFlow*localGradient.x+vec2(-riverFlow.y,riverFlow.x)*localGradient.y)*riverEdge*riverNormalDamping;
  vec3 opticsNormal=normalize(normalize(vec3(riverFlow.x*vRiverPhase.y,1.0,riverFlow.y*vRiverPhase.y))+vec3(-opticsGradient.x,0.0,-opticsGradient.y));
  float cosView=clamp(abs(dot(opticsNormal,normalize(cameraPosition-vRiverWorld))),0.0,1.0);
  vec2 offset=opticsGradient*(.8+2.4*(1.0-cosView))*riverWaveResolved;
  float patchRoom=max(0.0,uRiverReflectionPatch.z-length(vRiverWorld.xz-uRiverReflectionPatch.xy));
  float bankRoom=max(0.0,1.0-riverU)*vRiver.y*.18;
  float limit=min(.22,min(bankRoom,patchRoom*.1));
  offset*=min(1.0,limit/max(.0001,length(offset)));
  offset*=1.0-smoothstep(.12,.5,riverPixelFootprint);
  riverOpticsProjected=uRiverReflectionMatrix*vec4(vRiverWorld+vec3(offset.x,0.0,offset.y),1.0);
  vec2 uv=riverOpticsProjected.xy/max(.0001,riverOpticsProjected.w);
  vec2 dx=dFdx(uv)*uRiverReflectionSize,dy=dFdy(uv)*uRiverReflectionSize;
  riverReflectionFootprintLod=.5*log2(max(1.0,max(dot(dx,dx),dot(dy,dy))));
}
// Evaluate derivatives before the coverage discard; divergent LOD fragments
// must not make adjacent helper fragments lose their filtering footprint.
float riverNear=1.0-smoothstep(max(0.0,uWaterNearCoverage-70.0),max(1.0,uWaterNearCoverage+70.0),riverDistance);
if(uWaterNearCoverage<1.0)riverNear=0.0;
float riverDither=riverHash(floor(gl_FragCoord.xy));
float riverLimit=250.0+vRiver.y*170.0;
if(riverHash(floor(gl_FragCoord.xy)+vec2(19.0,71.0))<smoothstep(riverLimit*.75,riverLimit,riverDistance))discard;
${overview?"if(riverDither<riverNear)discard;":"if(riverDither>=riverNear)discard;"}
float riverAbsorption=1.0-exp(-riverDepth*1.6);
vec3 shallow=vec3(.045,.074,.050),deep=vec3(.012,.038,.036);
diffuseColor.rgb=mix(shallow,deep,riverAbsorption);
diffuseColor.a=(.045+.39*riverAbsorption)*riverEdge;
if(uWaterSurfaceDetail>.5){
  vec3 hydraulicNormal=normalize(vec3(riverFlow.x*vRiverPhase.y,1.0,riverFlow.y*vRiverPhase.y));
  float cosView=clamp(abs(dot(hydraulicNormal,normalize(cameraPosition-vRiverWorld))),0.0,1.0);
  float opticalPath=riverOpticalPath(riverDepth,cosView);
  vec3 waterTransmission=exp(-vec3(.52,.18,.11)*opticalPath);
  // Scalar transparency preserves the real visible bed. Spectral tint is a
  // bounded body-colour approximation; no screen texture is sampled/offset.
  float bodyAbsorption=1.0-dot(waterTransmission,vec3(.2126,.7152,.0722));
  float waterEdgeWidth=max(.015,riverAcrossFootprint*1.5);
  if(uWaterOpticsDetail<.5)riverEdge=(1.0-smoothstep(1.0-waterEdgeWidth,1.0,abs(vAcross)))*smoothstep(0.0,.012,riverDepth);
  diffuseColor.rgb=vec3(.034,.066,.052)*mix(vec3(1.0),waterTransmission,.75);
  diffuseColor.a=(.018+.68*bodyAbsorption)*riverEdge;
  if(uWaterOpticsDetail>.5){
    // No fixed opacity at zero depth. Actual coloured bed and submerged stones
    // remain visible; only the growing optical path adds this bounded body tint.
    diffuseColor.a=.90*bodyAbsorption*riverEdge;
    diffuseColor.rgb=vec3(.028,.060,.047)*mix(vec3(1.0),waterTransmission,.65);
  }
}

// Quiet shallows stay clear. Sparse shallow riffle flecks supplement only the
// already validated, exposed-obstacle wakes; no permanent white bank ribbon.
float riverShore=(1.0-smoothstep(.025,.09,riverDepth))*.07*riverRiffle;
float riverBroken=smoothstep(.62,.90,riverPacket.x)*smoothstep(.50,.85,riverPacket.y);
float riverFoam=riverShore*riverBroken;
diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.65,.72,.68),riverFoam);
diffuseColor.a=clamp(diffuseColor.a+riverFoam*.35,0.0,.82);
`).replace("#include <roughnessmap_fragment>",`#include <roughnessmap_fragment>
// Unresolved slope variance broadens the PBR lobe instead of vanishing into
// an aliased mirror. Resolved packets keep small, irregular moving highlights.
if(uWaterSurfaceDetail>.5)roughnessFactor=clamp(.11+riverRiffle*.075+(riverPacket.y-.5)*.015+sqrt(riverUnresolved)*1.8+riverFoam*.5,.10,.34);
else roughnessFactor=clamp(.175+riverRiffle*.075+riverPacket.y*.025+sqrt(riverUnresolved)*1.8+riverFoam*.5,.17,.40);
`).replace("#include <normal_fragment_begin>",`#include <normal_fragment_begin>
vec2 gradient=(riverFlow*localGradient.x+vec2(-riverFlow.y,riverFlow.x)*localGradient.y)
  *riverEdge*riverNormalDamping;
normal=normalize(normal+(viewMatrix*vec4(-gradient.x,0.0,-gradient.y,0.0)).xyz);
`).replace("vec3 outgoingLight = totalDiffuse + totalSpecular + totalEmissiveRadiance;",`
// Alpha represents light transmitted to the visible bed. Do not multiply the
// already Fresnel-weighted PBR reflection by that absorption a second time.
float riverFresnel=.02037+.97963*pow(1.0-clamp(dot(normal,geometryViewDir),0.0,1.0),5.0);
// Reuse Three's already sampled DFG. A planar local source must use the same
// rough dielectric response as the environment that it replaces, including
// grazing-angle masking. The former smooth Schlick shortcut inflated that lobe.
vec3 riverSingleScattering=material.specularColor*material.dfg.x+vec3(material.specularF90*material.dfg.y);
if(uWaterOpticsDetail>.5){
  float lost=1.0-material.dfg.x-material.dfg.y;
  vec3 averageF=material.specularColor+(vec3(1.0)-material.specularColor)*.047619;
  vec3 multiple=riverSingleScattering*averageF/(vec3(1.0)-lost*averageF)*lost;
  riverFresnel=clamp(dot(riverSingleScattering+multiple,vec3(.2126,.7152,.0722)),0.0,1.0);
}
vec3 riverRefractedBed=vec3(0.0),riverRefractedTransmission=vec3(1.0);
float riverRefractedPath=0.0,riverRefractionBlend=0.0;
if(uWaterRefraction>.001&&uRiverRefractionValid>.5&&riverDistance<80.0){
  // Depth belongs to the rendered mesh. Use its unperturbed view-space normal,
  // not the node-smoothed hydraulic slope used to drive the wave spectrum.
  vec3 hydraulicView=normalize(nonPerturbedNormal);
  riverSceneRefraction(-vViewPosition,normal,hydraulicView,max(.4,vRiver.x*3.0),riverRefractedBed,riverRefractedPath,riverRefractionBlend);
  riverRefractionBlend*=clamp(uWaterRefraction,0.0,1.0)*(1.0-smoothstep(48.0,80.0,riverDistance))
    *(1.0-smoothstep(15.0,26.0,cameraPosition.y-vRiverWorld.y));
  riverRefractedTransmission=exp(-vec3(.52,.18,.11)*riverRefractedPath);
}
float riverBodyCoverage=diffuseColor.a;
if(riverRefractionBlend>0.0){
  float measuredAbsorption=1.0-dot(riverRefractedTransmission,vec3(.2126,.7152,.0722));
  riverBodyCoverage=mix(riverBodyCoverage,measuredAbsorption*riverEdge,riverRefractionBlend);
}
float riverCoverage=min(.98,riverBodyCoverage+(1.0-riverBodyCoverage)*riverFresnel*riverEdge);
// The cached image and projection matrix are captured together. The domain
// rejects other slopes/levels, invalid texture edges and old camera poses.
vec3 riverSpecular=totalSpecular;
if(uRiverReflectionValid>.001){
  float planeError=abs(dot(uRiverReflectionPlane,vec4(vRiverWorld,1.0)));
  float patchDistance=length(vRiverWorld.xz-uRiverReflectionPatch.xy);
  vec3 hydraulicNormal=normalize(vec3(riverFlow.x*vRiver.z,1.0,riverFlow.y*vRiver.z));
  float reflectionWeight=uRiverReflectionValid*(1.0-smoothstep(.045,.16,planeError))
    *(1.0-smoothstep(uRiverReflectionPatch.z*.55,uRiverReflectionPatch.z,patchDistance))
    *smoothstep(.985,.998,dot(hydraulicNormal,uRiverReflectionPlane.xyz));
  vec4 reflectedPosition=riverOpticsProjected;
  if(uWaterOpticsDetail<.5){
  vec2 reflectionOffset=gradient*.75;
  if(uWaterSurfaceDetail>.5){
    float grazing=1.0-clamp(dot(normal,geometryViewDir),0.0,1.0);
    reflectionOffset=gradient*(.8+2.4*grazing)*riverWaveResolved;
    // Keep distortion below 22 cm and away from a bank/patch edge. At coarse
    // pixel footprints it becomes roughness, rather than stretching silhouettes.
    float bankRoom=max(0.0,1.0-abs(vAcross))*vRiver.y*.18;
    float offsetLimit=min(.22,min(bankRoom,max(0.0,uRiverReflectionPatch.z-patchDistance)*.1));
    reflectionOffset*=min(1.0,offsetLimit/max(.0001,length(reflectionOffset)));
    reflectionOffset*=1.0-smoothstep(.12,.5,riverPixelFootprint);
  }
  reflectedPosition=uRiverReflectionMatrix*vec4(vRiverWorld+vec3(reflectionOffset.x,0.0,reflectionOffset.y),1.0);
  }
  vec2 reflectionUV=reflectedPosition.xy/max(.0001,reflectedPosition.w);
  vec2 reflectionBorder=min(reflectionUV,vec2(1.0)-reflectionUV);
  float reflectionLod=roughnessFactor*5.0;
  if(uWaterSurfaceDetail>.5)reflectionLod+=riverRiffle*.55;
  float borderSupport=0.0;
  if(uWaterOpticsDetail>.5){
    float maxLod=log2(max(1.0,max(uRiverReflectionSize.x,uRiverReflectionSize.y)));
    reflectionLod=min(maxLod,max(reflectionLod,riverReflectionFootprintLod));
    borderSupport=exp2(reflectionLod)/max(1.0,min(uRiverReflectionSize.x,uRiverReflectionSize.y));
  }
  reflectionWeight*=smoothstep(.015+borderSupport,.08+borderSupport,min(reflectionBorder.x,reflectionBorder.y))*step(.0001,reflectedPosition.w);
  if(reflectionWeight>.001){
    // A prefiltered mip keeps tree/stone silhouettes while the resolved normal
    // adds small moving distortion. Empty pixels retain the environment probe.
    vec4 localReflection=textureLod(uRiverReflectionMap,reflectionUV,reflectionLod);
    reflectionWeight*=clamp(localReflection.a,0.0,1.0);
    if(uWaterOpticsDetail>.5){
      // Replace only the directional IBL lobe. The sun/real lights and the
      // environment's multiple-scattered energy remain untouched.
      riverSpecular+=reflectionWeight*(localReflection.rgb-radiance)*riverSingleScattering;
    }else riverSpecular+=reflectionWeight*(localReflection.rgb*riverFresnel-reflectedLight.indirectSpecular);
  }
}
vec3 outgoingLight=(totalDiffuse*riverBodyCoverage+max(vec3(0.0),riverSpecular)*riverEdge)/max(.0001,riverCoverage)+totalEmissiveRadiance;
diffuseColor.a=riverCoverage;
`).replace("#include <tonemapping_fragment>",`
// The bed snapshot already contains linear-HDR aerial scattering. Composite
// AFTER the water surface's aerial hook and BEFORE the single OutputPass.
// Keep the true sun/DFG reflection intact; only the transmitted term is replaced.
if(riverRefractionBlend>0.0){
  float compositeCoverage=mix(riverCoverage,riverEdge,riverRefractionBlend);
  vec3 transmittedBed=riverRefractedBed*riverRefractedTransmission*(1.0-riverFresnel)*riverEdge;
  gl_FragColor.rgb=(gl_FragColor.rgb*riverCoverage+transmittedBed*riverRefractionBlend)/max(.0001,compositeCoverage);
  gl_FragColor.a=compositeCoverage;
}
#include <tonemapping_fragment>`);
  };
  m.customProgramCacheKey=()=>(overview?"river-overview-v38-section":"river-near-v38-section")+(reachEnabled?"-reach39-physical":"");return m;
}
function foamMaterial(uniforms){
  const m=new THREE.MeshStandardMaterial({color:0xc4ccc1,roughness:.88,transparent:true,opacity:.55,depthWrite:false,side:THREE.DoubleSide});
  m.name="obstacle-wake-pbr";
  m.onBeforeCompile=shader=>{
    Object.assign(shader.uniforms,uniforms);shader.vertexShader=shader.vertexShader.replace("#include <common>","#include <common>\nvarying vec2 vWake;").replace("#include <begin_vertex>","#include <begin_vertex>\nvWake=uv;");
    shader.fragmentShader=shader.fragmentShader.replace("#include <common>","#include <common>\nuniform float uWaterTime; varying vec2 vWake;").replace("#include <color_fragment>",`#include <color_fragment>
float wakeEdge=pow(max(0.0,1.0-abs(vWake.x*2.0-1.0)),1.3);
float wakeEnd=1.0-smoothstep(.15,1.0,vWake.y);
float wakeNoise=.5+.5*sin(vWake.y*57.0-uWaterTime*4.0+sin(vWake.x*34.0));
diffuseColor.a*=wakeEdge*wakeEnd*smoothstep(.25,.65,wakeNoise);
if(diffuseColor.a<.015)discard;`);
  };m.customProgramCacheKey=()=>"obstacle-wake-v1";return m;
}
export const RIVER_GRAVEL={range:60,capacity:1400,stationSpacing:1.05,maxAcross:7};
function gravelRandom(id,seed=0){
  let h=(random(id,seed)*4294967296)>>>0;
  h=Math.imul(h^(h>>>16),2246822507);h=Math.imul(h^(h>>>13),3266489909);
  return ((h^(h>>>16))>>>0)/4294967296;
}
// Deposition is a local, one-sided patch, never a pair of continuous bank rows.
// Independent along-flow samples also remove the old cross-channel rung pattern.
export function createRiverGravel(world,segments,{x,z,radius=RIVER_GRAVEL.range,limit=RIVER_GRAVEL.capacity}){
  const records=[],spacing=RIVER_GRAVEL.stationSpacing,seen=new Set();
  for(const s of segments){
    const length=s.b.distance-s.a.distance;if(length<=0)continue;
    for(let k=Math.floor(s.a.distance/spacing);k<=Math.floor(s.b.distance/spacing);k++){
      const station=s.lineId+":gravel:"+k;
      for(let j=0;j<RIVER_GRAVEL.maxAcross+3;j++){
        const candidateBar=j>=RIVER_GRAVEL.maxAcross,id=station+":"+j;
        const distance=(k+.02+.96*gravelRandom(id,1))*spacing;
        if(distance<s.a.distance||distance>=s.b.distance||seen.has(id))continue;
        seen.add(id);
        const n=at(s,(distance-s.a.distance)/length);
        const cell=Math.floor(distance/9.5),patch=s.lineId+":deposit:"+cell;
        const center=(cell+.18+.64*gravelRandom(patch,2))*9.5;
        const patchWidth=.7+1.5*gravelRandom(patch,3);
        const deposit=Math.max(0,1-Math.abs(distance-center)/patchWidth);
        let side;
        if(candidateBar){
          if(!s.naturalBanks||gravelRandom(patch,4)>.64||gravelRandom(id,5)>deposit*deposit)continue;
          // Each patch chooses one shoulder; bare erosional shoulders stay empty.
          const left=gravelRandom(patch,6)<.5;
          if((left?n.barLeft:n.barRight)<.12)continue;
          side=(left?-1:1)*(.91+.27*gravelRandom(id,8));
        }else{
          if(j>=Math.min(RIVER_GRAVEL.maxAcross,Math.max(3,Math.ceil(n.width*4))))continue;
          side=(gravelRandom(id,9)*2-1)*.96;
        }
        const point=riverCrossPoint(n,side),px=point.x,pz=point.z,range=Math.hypot(px-x,pz-z);
        if(range>radius)continue;
        const h=world.hydrology.sampleAt(px,pz);
        if(candidateBar?(h.riverBed<.2||h.wetness<.12):!h.insideWater)continue;
        const ground=world.surface.heightAt(px,pz);
        const diameter=candidateBar?.045+.115*Math.pow(gravelRandom(id,10),1.8):.025+.105*Math.pow(gravelRandom(id,10),2);
        const scale=diameter/2.34,burial=.08+.14*gravelRandom(id,11);
        records.push({id,x:px,z:pz,y:ground-scale*burial,scale,diameter,burial,depositPatch:candidateBar?patch:null,bankSide:candidateBar?Math.sign(side):0,chainage:distance,
          sx:.88+.3*gravelRandom(id,12),sy:.28+.27*gravelRandom(id,13),sz:.72+.38*gravelRandom(id,14),rot:gravelRandom(id,15)*Math.PI*2,
          ground,waterLevel:h.waterLevel??n.level,wetness:h.wetness,inWater:h.insideWater,onBar:candidateBar,wake:false,range});
      }
    }
  }
  return records.sort((a,b)=>a.range-b.range||a.id.localeCompare(b.id)).slice(0,limit);
}

function wakeGeometry(world,rocks){
  const pos=[],uv=[],indices=[];
  for(const rock of rocks.filter(r=>r.wake)){
    const length=rock.scale*(3.1+rock.sy),steps=5,base=pos.length/3;let valid=true,local=[];
    for(let j=0;j<=steps;j++){
      const t=j/steps,x=rock.x+rock.flowX*(rock.scale*.5+t*length),z=rock.z+rock.flowZ*(rock.scale*.5+t*length),width=rock.scale*(.65+t*.45);
      const h=world.hydrology.sampleAt(x,z);if(!h.insideWater){valid=false;break;}
      for(const side of [-1,1]){const px=x-rock.flowZ*width*side,pz=z+rock.flowX*width*side,q=world.hydrology.sampleAt(px,pz);
        if(!q.insideWater){valid=false;break;}local.push([px,q.waterLevel+.014,pz,(side+1)/2,t]);}
      if(!valid)break;
    }
    if(!valid)continue;
    for(const p of local){pos.push(...p.slice(0,3));uv.push(...p.slice(3));}
    for(let j=0;j<steps;j++){const a=base+j*2;indices.push(a,a+1,a+2,a+1,a+3,a+2);}
  }
  const g=new THREE.BufferGeometry();g.setAttribute("position",new THREE.Float32BufferAttribute(pos,3));g.setAttribute("uv",new THREE.Float32BufferAttribute(uv,2));g.setIndex(indices);g.computeVertexNormals();g.computeBoundingSphere();return g;
}
export function createShoreRockMaterial({scanned=false}={}){
  const m=new THREE.MeshStandardMaterial({color:0xffffff,roughness:.86,metalness:0});
  m.name="river-stone-mineral-and-wet-edge";
  m.userData.shoreMaterialVariation=shoreMaterialVariation;
  m.onBeforeCompile=shader=>{
    shader.uniforms.uShoreMaterialVariation=shoreMaterialVariation;
    shader.vertexShader=shader.vertexShader.replace("#include <common>",`#include <common>
attribute vec3 aShoreHydro;
varying vec3 vShoreHydro;
varying vec3 vShoreWorld;
varying float vShoreUp;`).replace("#include <begin_vertex>",`#include <begin_vertex>
vec4 shoreWorld=vec4(transformed,1.0);
#ifdef USE_INSTANCING
shoreWorld=instanceMatrix*shoreWorld;
#endif
vShoreWorld=(modelMatrix*shoreWorld).xyz;
vShoreHydro=aShoreHydro;
vShoreUp=max(0.0,inverseTransformDirection(transformedNormal,viewMatrix).y);`);
    shader.fragmentShader=SHORE_MATERIAL_GLSL+shader.fragmentShader.replace("#include <common>",`#include <common>
varying vec3 vShoreHydro;
varying vec3 vShoreWorld;
varying float vShoreUp;
// Four independent corners per z plane. Keep the original hash arithmetic
// and scalar interpolation order while avoiding eight expanded vec3 hash calls.
vec4 shoreHash4(vec3 a){
  vec4 x=fract((a.x+vec4(0.,1.,0.,1.))*.1031);
  vec4 y=fract((a.y+vec4(0.,0.,1.,1.))*.1031);
  vec4 z=fract(vec4(a.z)*.1031);
  vec4 d=x*(y+33.33)+y*(z+33.33)+z*(x+33.33);
  x+=d;y+=d;z+=d;
  return fract((x+y)*z);
}
float shoreNoise(vec3 p){
  vec3 a=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);
  vec4 lo=shoreHash4(a),hi=shoreHash4(a+vec3(0.,0.,1.));
  return mix(mix(mix(lo.x,lo.y,f.x),mix(lo.z,lo.w,f.x),f.y),
             mix(mix(hi.x,hi.y,f.x),mix(hi.z,hi.w,f.x),f.y),f.z);
}
`).replace("#include <color_fragment>",`#include <color_fragment>
float stoneDistance=length(cameraPosition-vShoreWorld);
float stoneDetail=1.0-smoothstep(10.0,35.0,stoneDistance);
// Modest anisotropy suggests a bedding direction without repeated level sets.
float stoneBroad=shoreNoise(vShoreWorld*vec3(3.4,7.5,3.4));
// Millimetre grains fade by their actual pixel footprint, not distance alone.
float grainFilter=1.0-smoothstep(.35,1.2,length(fwidth(vShoreWorld*110.0)));
float stoneGrain=mix(.5,shoreNoise(vShoreWorld*110.0),stoneDetail*grainFilter);
// Sparse mineral/weathering patches use the two existing fields. There is no
// periodic scalar contour: that painted closed map-like rings over each stone.
// Fine grains break the elongated broad patches into short, irregular traces.
float stoneFracture=smoothstep(.66,.82,stoneBroad)*(1.0-smoothstep(.30,.48,stoneGrain))*grainFilter;
float stoneMineral=smoothstep(.66,.84,stoneGrain)*stoneDetail*grainFilter;
float waterWet=1.0-smoothstep(vShoreHydro.x-.025,vShoreHydro.x+.085+stoneBroad*.025,vShoreWorld.y);
float groundDamp=(1.0-smoothstep(vShoreHydro.y+.02,vShoreHydro.y+.19,vShoreWorld.y))*vShoreHydro.z*.5;
float stoneWet=clamp(max(waterWet,groundDamp),0.0,1.0);
diffuseColor.rgb*=.78+stoneBroad*.24+stoneGrain*.12;
diffuseColor.rgb*=1.0-stoneFracture*.045*stoneDetail;
diffuseColor.rgb=mix(diffuseColor.rgb,diffuseColor.rgb*vec3(1.22,1.18,1.08),stoneMineral*.48);
diffuseColor.rgb*=mix(mix(1.0,.58,stoneWet),shoreWetAlbedo(stoneWet,stoneBroad),uShoreMaterialVariation);
// A thin local sediment stain connects a boulder to its real ground contact;
// it follows the existing mineral detail instead of repeating a painted band.
float stoneSilt=(1.-smoothstep(vShoreHydro.y+.015,vShoreHydro.y+.13+stoneBroad*.045,vShoreWorld.y))
  *vShoreHydro.z*(1.-waterWet*.65)*(.25+.35*stoneBroad)*uShoreMaterialVariation;
diffuseColor.rgb=mix(diffuseColor.rgb,diffuseColor.rgb*vec3(1.08,1.01,.88),stoneSilt);
// Sparse biological staining follows humid exposed upper facets. It does not
// paint every rock green or replace the mineral color below the true waterline.
float stoneMoss=smoothstep(.61,.79,stoneBroad)*smoothstep(.25,.8,vShoreUp)*(1.0-waterWet)*vShoreHydro.z;
diffuseColor.rgb=mix(diffuseColor.rgb,diffuseColor.rgb*vec3(.68,.90,.43),stoneMoss*.7);
`).replace("#include <roughnessmap_fragment>",`#include <roughnessmap_fragment>
roughnessFactor=mix(mix(.76+stoneGrain*.14,.46+stoneGrain*.14,stoneWet),shoreWetRoughness(.76+stoneGrain*.14,stoneWet,stoneBroad),uShoreMaterialVariation);
roughnessFactor=mix(roughnessFactor,.94,stoneMoss*.65);
`).replace("#include <normal_fragment_begin>",`#include <normal_fragment_begin>
vec3 stoneGrainNormal=vec3(
 cos(dot(vShoreWorld,vec3(179.0,63.0,0.0))),
 cos(dot(vShoreWorld,vec3(0.0,157.0,83.0))),
 cos(dot(vShoreWorld,vec3(41.0,0.0,203.0))));
// Reuse the already sampled mineral field as centimetre-scale surface relief;
// derivatives perturb the actual view-space surface, without extra noise taps.
float stoneRelief=(stoneBroad*.0035-stoneFracture*.00035+stoneGrain*.0018)*stoneDetail;
vec2 stoneBump=vec2(dFdx(stoneRelief),dFdy(stoneRelief));
vec3 stoneDx=dFdx(-vViewPosition),stoneDy=dFdy(-vViewPosition);
vec3 stoneR1=cross(stoneDy,normal),stoneR2=cross(normal,stoneDx);
float stoneDet=dot(stoneDx,stoneR1)*faceDirection;
if(abs(stoneDet)>1e-10)normal=normalize(abs(stoneDet)*normal-sign(stoneDet)*(stoneBump.x*stoneR1+stoneBump.y*stoneR2));
normal=normalize(normal+(viewMatrix*vec4(stoneGrainNormal,0.0)).xyz*.025*stoneDetail*grainFilter*(1.0-stoneWet*.5));
`).replace("#include <aomap_fragment>",`#include <aomap_fragment>
// Approximate local contact occlusion only attenuates indirect illumination.
// The sun still uses the actual instanced rock geometry in the CSM shadow pass.
float stoneContact=mix(.62,1.0,smoothstep(vShoreHydro.y-.02,vShoreHydro.y+.20,vShoreWorld.y));
reflectedLight.indirectDiffuse*=stoneContact;
reflectedLight.indirectSpecular*=mix(.82,1.0,stoneContact);
`);
  };
  if(scanned){
    const compile=m.onBeforeCompile;
    m.normalScale.set(.72,.72);m.aoMapIntensity=.55;
    m.onBeforeCompile=shader=>{
      compile(shader);
      shader.fragmentShader=shader.fragmentShader.replace(
        "float stoneBroad=shoreNoise(vShoreWorld*vec3(3.4,7.5,3.4));",
        "float stoneBroad=clamp(dot(diffuseColor.rgb,vec3(.2126,.7152,.0722))*3.2,0.0,1.0);"
      ).replace("float stoneGrain=mix(.5,shoreNoise(vShoreWorld*110.0),stoneDetail*grainFilter);","float stoneGrain=.5;");
      // The scan already contains mineral color and micro normals. Avoid adding
      // another painted procedural relief over its physically aligned UV maps.
      const start=shader.fragmentShader.indexOf("vec3 stoneGrainNormal=");
      const end=shader.fragmentShader.indexOf("#include <normal_fragment_maps>",start);
      shader.fragmentShader=shader.fragmentShader.slice(0,start)+shader.fragmentShader.slice(end);
      shader.fragmentShader=shader.fragmentShader.replace("roughnessFactor=mix(mix(.76+stoneGrain*.14,.46+stoneGrain*.14,stoneWet),shoreWetRoughness(.76+stoneGrain*.14,stoneWet,stoneBroad),uShoreMaterialVariation);",
        "roughnessFactor=mix(mix(clamp(roughnessFactor,.62,.96),max(.28,roughnessFactor*.66),stoneWet),shoreWetRoughness(clamp(roughnessFactor,.62,.96),stoneWet,stoneBroad),uShoreMaterialVariation);");
    };
  }
  m.customProgramCacheKey=()=>scanned?"river-scan-stone-shore-v2":"river-stone-mineral-shore-v7-lane-hash";return m;
}

export class WorldWater {
  constructor(world){
    this.world=world;this.hydrology=world.hydrology;if(!this.hydrology)throw new Error("WorldWater needs world.hydrology");
    this.phaseData=createRiverPhaseData(this.hydrology.lines);
    this.group=new THREE.Group();this.group.name="world-water";this.viewpoints=this.hydrology.viewpoints;
    this.uniforms={...createWaterReflectionUniforms(),...createWaterRefractionUniforms(),uWaterTime:{value:0},uWaterViewer:{value:new THREE.Vector3()},uWaterNearCoverage:{value:0},uWaterSurfaceDetail:{value:1},uWaterOpticsDetail:{value:1}};
    this.nearMaterial=createWaterMaterial(this.uniforms,{reachEnabled:Boolean(this.hydrology.forestReach39)});this.overviewMaterial=createWaterMaterial(this.uniforms,{overview:true,reachEnabled:Boolean(this.hydrology.forestReach39)});this.foamMaterial=foamMaterial(this.uniforms);
    this.rockMaterial=createShoreRockMaterial({scanned:true});this.gravelMaterial=createShoreRockMaterial();this.rockTextures=[];
    this.materials=[this.nearMaterial,this.overviewMaterial,this.foamMaterial,this.rockMaterial,this.gravelMaterial];
    this.reflection=new LocalWaterReflection(this.hydrology,this.uniforms,{waterMaterials:[this.nearMaterial,this.overviewMaterial,this.foamMaterial]});
    this.refraction=new WaterRefractionCapture(this.uniforms);this.group.add(this.refraction.marker);
    this.rockGeometry=createShoreRockGeometry();
    const gravelGeometry=createRiverPebbleGeometry();
    gravelGeometry.setAttribute("aShoreHydro",new THREE.InstancedBufferAttribute(new Float32Array(RIVER_GRAVEL.capacity*3),3).setUsage(THREE.DynamicDrawUsage));
    const gravelMesh=new THREE.InstancedMesh(gravelGeometry,this.gravelMaterial,RIVER_GRAVEL.capacity);
    gravelMesh.name="near-river-bed-gravel";gravelMesh.count=0;gravelMesh.castShadow=true;gravelMesh.receiveShadow=true;
    gravelMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);this.group.add(gravelMesh);
    this.gravel={mesh:gravelMesh,records:[],slots:new Map()};this.gravelAnchor=new THREE.Vector2(Infinity,Infinity);this.gravelAirborne=false;
    this.buckets=new Map();for(const s of this.hydrology.segments){
      const x=Math.floor((s.a.x+s.b.x)/2/CHUNK),z=Math.floor((s.a.z+s.b.z)/2/CHUNK),id=x+","+z;
      if(!this.buckets.has(id))this.buckets.set(id,{id,x,z,segments:[],bounds:{minX:x*CHUNK-20,maxX:(x+1)*CHUNK+20,minZ:z*CHUNK-20,maxZ:(z+1)*CHUNK+20}});
      this.buckets.get(id).segments.push(s);
    }
    this.active=new Map();this.queue=[];this.anchor=new THREE.Vector2(Infinity,Infinity);this.transform=new THREE.Object3D();this.loaded=false;
    this.stats={...this.hydrology.stats,waterChunks:0,shoreStones:0,gravelPebbles:0,gravelTriangles:0,gravelCapacity:RIVER_GRAVEL.capacity,wakePatches:0,pending:0,nearCoverage:0,overviewTriangles:0,nearTriangles:0,buildMilliseconds:0,
      reflection:"PBR and local tangent-plane reflection, with bounded opaque color/depth refraction",localReflection:this.reflection.stats,refraction:this.refraction.stats};
  }
  async load({textures=typeof document!=="undefined"}={}){
    if(this.loaded)return this;
    if(textures){
      const loader=new THREE.TextureLoader(),maps=await Promise.all(["diff","nor_gl","arm"].map(n=>loader.loadAsync("./assets/v2/shore/"+n+".jpg")));
      const [color,normal,arm]=maps;color.colorSpace=THREE.SRGBColorSpace;
      for(const map of maps){map.anisotropy=4;map.flipY=false;}
      Object.assign(this.rockMaterial,{map:color,normalMap:normal,roughnessMap:arm,aoMap:arm,needsUpdate:true});
      this.rockTextures=maps;
    }
    const geometry=createWaterGeometry(this.hydrology.segments,{phaseData:this.phaseData,reach:this.hydrology.forestReach39}),mesh=new THREE.Mesh(geometry,this.overviewMaterial);
    mesh.name="all-rivers-overview";mesh.receiveShadow=true;mesh.renderOrder=2;this.group.add(mesh);this.overview=mesh;
    this.stats.overviewTriangles=geometry.index.count/3;this.loaded=true;return this;
  }
  buildBucket(bucket){
    const group=new THREE.Group();group.name="river-"+bucket.id;
    const mesh=new THREE.Mesh(createWaterGeometry(bucket.segments,{detail:true,phaseData:this.phaseData,reach:this.hydrology.forestReach39}),this.nearMaterial);
    mesh.receiveShadow=true;mesh.renderOrder=2;group.add(mesh);
    this.group.add(group);const item={...bucket,group,mesh,rocks:null,wakes:null,stoneCount:0};this.active.set(bucket.id,item);return item;
  }
  buildStones(item){
    const records=createShoreStones(this.world,item.segments);item.stoneCount=records.length;
    if(records.length){
      const geometry=this.rockGeometry.clone();
      geometry.setAttribute("aShoreHydro",new THREE.InstancedBufferAttribute(new Float32Array(records.flatMap(r=>[r.waterLevel,r.ground,r.wetness])),3));
      const mesh=new THREE.InstancedMesh(geometry,this.rockMaterial,records.length),color=new THREE.Color(),palette=[new THREE.Color("#ece9df"),new THREE.Color("#e3e9df"),new THREE.Color("#ede7d9")];mesh.castShadow=true;mesh.receiveShadow=true;
      records.forEach((r,i)=>{mesh.setMatrixAt(i,shoreStoneMatrix(r,this.transform.matrix));
        color.copy(palette[Math.floor(random(r.id,14)*palette.length)]).multiplyScalar(.90+.10*random(r.id,15));mesh.setColorAt(i,color);});
      mesh.instanceMatrix.needsUpdate=true;mesh.computeBoundingBox();mesh.computeBoundingSphere();item.rocks=mesh;item.group.add(mesh);
      const wakeGeo=wakeGeometry(this.world,records);if(wakeGeo.index.count){const wake=new THREE.Mesh(wakeGeo,this.foamMaterial);wake.renderOrder=3;wake.receiveShadow=true;item.wakes=wake;item.group.add(wake);}else wakeGeo.dispose();
    }
    item.stonesReady=true;
  }
  removeBucket(item){item.mesh.geometry.dispose();if(item.rocks){item.rocks.geometry.dispose();item.rocks.dispose();}if(item.wakes)item.wakes.geometry.dispose();this.group.remove(item.group);this.active.delete(item.id);}
  updateGravel(p){
    const anchorX=Math.floor(p.x/8)*8+4,anchorZ=Math.floor(p.z/8)*8+4;
    const airborne=p.y-this.world.surface.heightAt(p.x,p.z)>100;
    if(this.gravelAnchor.x===anchorX&&this.gravelAnchor.y===anchorZ&&this.gravelAirborne===airborne)return;
    this.gravelAnchor.set(anchorX,anchorZ);this.gravelAirborne=airborne;
    const records=airborne?[]:createRiverGravel(this.world,this.hydrology.nearSegments(anchorX,anchorZ,RIVER_GRAVEL.range+8),{x:anchorX,z:anchorZ});
    const wanted=new Set(records.map(r=>r.id)),pool=this.gravel,hydro=pool.mesh.geometry.attributes.aShoreHydro,color=new THREE.Color();
    const palette=[new THREE.Color("#686458"),new THREE.Color("#66695f"),new THREE.Color("#78705e")];
    let changed=false;
    const write=(r,i)=>{
      const t=this.transform;t.position.set(r.x,r.y,r.z);t.scale.set(r.scale*r.sx,r.scale*r.sy,r.scale*r.sz);
      t.rotation.set((random(r.id,7)-.5)*.22,r.rot,(random(r.id,8)-.5)*.22);t.updateMatrix();pool.mesh.setMatrixAt(i,t.matrix);
      color.copy(palette[Math.floor(random(r.id,14)*palette.length)]).multiplyScalar(.78+.22*random(r.id,15));pool.mesh.setColorAt(i,color);
      hydro.setXYZ(i,r.waterLevel,r.ground,r.wetness);changed=true;
    };
    // Retain resident instance slots; only remove departed roots or append new ones.
    for(let i=pool.records.length-1;i>=0;i--){
      const old=pool.records[i];if(wanted.has(old.id))continue;
      pool.slots.delete(old.id);const last=pool.records.pop();changed=true;
      if(i<pool.records.length){pool.records[i]=last;pool.slots.set(last.id,i);write(last,i);}
    }
    for(const r of records)if(!pool.slots.has(r.id)){const i=pool.records.length;pool.records.push(r);pool.slots.set(r.id,i);write(r,i);}
    pool.mesh.count=pool.records.length;
    if(changed){pool.mesh.instanceMatrix.needsUpdate=true;if(pool.mesh.instanceColor)pool.mesh.instanceColor.needsUpdate=true;hydro.needsUpdate=true;pool.mesh.computeBoundingBox();pool.mesh.computeBoundingSphere();}
    this.stats.gravelPebbles=pool.mesh.count;this.stats.gravelTriangles=pool.mesh.count*pool.mesh.geometry.index.count/3;
  }
  update(camera,dt=0){
    if(!this.loaded)return;
    this.reflection.prepare(camera);
    const p=camera.position;this.uniforms.uWaterTime.value+=visualDelta(dt);this.uniforms.uWaterViewer.value.copy(p);
    if(this.anchor.distanceToSquared(new THREE.Vector2(p.x,p.z))>32**2){
      const desired=[...this.buckets.values()].filter(b=>distanceBox(p,b.bounds)<NEAR+190);
      const wanted=new Set(desired.map(b=>b.id));this.queue=desired.filter(b=>!this.active.has(b.id)).sort((a,b)=>distanceBox(p,a.bounds)-distanceBox(p,b.bounds));
      for(const item of this.active.values())if(!wanted.has(item.id))this.removeBucket(item);
      this.anchor.set(p.x,p.z);
    }
    const start=performance.now();this.updateGravel(p);let built=0;
    while(this.queue.length&&built<3&&performance.now()-start<3.5){this.buildBucket(this.queue.shift());built++;}
    let nearestPending=Infinity;
    for(const b of this.queue)nearestPending=Math.min(nearestPending,distanceBox(p,b.bounds));
    const coverage=Math.min(NEAR-80,Math.max(0,nearestPending-80));
    this.uniforms.uWaterNearCoverage.value=coverage;
    let stoneBuilt=0,stones=0,wakes=0,triangles=0;
    for(const item of this.active.values()){
      const distance=distanceBox(p,item.bounds),nearStones=distance<STONE_RANGE;
      if(nearStones&&!item.stonesReady&&stoneBuilt<1&&performance.now()-start<5){this.buildStones(item);stoneBuilt++;}
      if(item.rocks){item.rocks.visible=distance<STONE_RANGE+90;item.rocks.castShadow=distance<200;stones+=item.rocks.visible?item.stoneCount:0;}
      if(item.wakes){item.wakes.visible=distance<STONE_RANGE+90;wakes+=item.wakes.visible?item.wakes.geometry.index.count/30:0;}
      triangles+=item.mesh.geometry.index.count/3;
    }
    Object.assign(this.stats,{waterChunks:this.active.size,shoreStones:stones,wakePatches:wakes,pending:this.queue.length,nearCoverage:coverage,nearTriangles:triangles,buildMilliseconds:performance.now()-start});
  }
  // Call after the main render: reuse its completed sun shadows, write the next frame's reflection.
  prepareRefraction(renderer,camera,source){
    const p=camera.position;
    const nearWater=this.loaded&&Boolean(source)&&this.hydrology.nearSegments(p.x,p.z,90).some(s=>{
      const height=p.y-Math.max(s.a.level,s.b.level);return height>.03&&height<30;
    });
    return this.refraction.prepare(renderer,camera,source,{nearWater});
  }
  renderReflection(renderer,scene,camera,options){if(!this.loaded)return false;return this.reflection.render(renderer,scene,camera,options);}
  dispose(){
    this.reflection.dispose();this.refraction.dispose();
    for(const item of [...this.active.values()])this.removeBucket(item);this.overview?.geometry.dispose();
    this.gravel.mesh.geometry.dispose();this.gravel.mesh.dispose();this.gravel.records=[];this.gravel.slots.clear();
    this.rockGeometry.dispose();this.rockTextures.forEach(t=>t.dispose());this.materials.forEach(m=>m.dispose());this.group.clear();this.queue=[];this.loaded=false;
  }
}
