import {csmBacklitSkipEligible,installCSMBacklitSkip} from './csm-backlit-skip.js';
import {installCSMZeroFadeSkip} from './csm-zero-fade.js';
import {createCloseSolarShadow,installCloseSolarShadow} from './close-solar-shadow.js';
import {visualDelta} from './visual-time.js';
import {installShadowReceiverFootprint} from "./shadow-receiver-footprint.js";
import {installCloseShadowOverlap,installCloseShadowOverlapShader} from "./close-shadow-overlap.js";
import { installSharedOrmSampler, sharedOrmSamplerEligible } from './shared-orm-sampler.js';
import {createNearShadowDetail,configureNearShadowDetail} from './near-shadow-detail.js';
import * as THREE from "three";
import { Sky } from "three/addons/objects/Sky.js";
import { CSM } from "three/addons/csm/CSM.js";
import { configureCSMDepth, skyFarDepth, shadowDepthBias } from "./depth-mode.js";
import { CloudShadowCache } from "./cloud-cache.js";
import { SunShadowScheduler } from "./sun-shadow-scheduler.js";
import { SunShadowCasters } from "./sun-shadow-casters.js";
import { SunShadowReceiverCulling } from "./sun-shadow-receivers.js";
import { installCSMPhysicalLighting } from "./csm-physical.js";
import { createCloudUniforms, installSkyCloudField, installCloudShadows } from "./cloud-field.js";
import { createAerialUniforms, installAerialPerspective } from "./aerial-perspective.js";
import { sunPosition, sunDirection, beijingTime } from "../sun.js";
// Shared outdoor lighting calibration. Keep exposure and albedo unchanged:
// improve incident sunlight/sky fill and use the same cloud field in sky and shadows.
export const WORLD_LIGHTING = Object.freeze({
  v14: Object.freeze({sun:3.25, bounce:.3, environment:.85, cloudCoverage:.48, cloudDensity:.6}),
  v15: Object.freeze({sun:4.8, bounce:.48, environment:1, cloudCoverage:.36, cloudDensity:.5}),
});
// The analytic sky uses relative radiance units. Apply one calibration to both
// the displayed sky and the PMREM source; do not compensate individual materials.
function calibratedSky() {
  const sky = new Sky();
  sky.material.uniforms.radianceScale = {value: .16};
  sky.material.fragmentShader = "uniform float radianceScale;\n" + sky.material.fragmentShader.replace("vec4( texColor, 1.0 )", "vec4( texColor * radianceScale, 1.0 )");
  // Sky pins its vertices to the far clip plane; reversed depth uses z=0.
  sky.material.vertexShader=skyFarDepth(sky.material.vertexShader);
  return sky;
}
export class WorldEnvironment {
  constructor(renderer,scene,camera,meta) {
    Object.assign(this,{renderer,scene,camera,meta});
    this.lightingProfile=new URLSearchParams(globalThis.location?.search||"").get("daylight")==="v14"?"v14":"v15";
    this.sun = new THREE.Vector3();
    this.aerial=createAerialUniforms(this.sun);
    this.lastEnvironmentOrigin=new THREE.Vector3(Infinity,Infinity,Infinity);this.lastEnvironmentTime=-Infinity;
    this.clouds=createCloudUniforms();this.cloudCache=new CloudShadowCache(renderer,this.clouds);this.cloudOrigin=new THREE.Vector3();
    this.sky=calibratedSky();this.sky.scale.setScalar(180000);this.sky.frustumCulled=false;
    this.sky.material.uniforms.turbidity.value=2.2;this.sky.material.uniforms.rayleigh.value=1.8;
    this.sky.material.uniforms.mieCoefficient.value=.004;this.sky.material.uniforms.mieDirectionalG.value=.82;
    installSkyCloudField(this.sky,this.clouds,this.cloudOrigin);
    scene.add(this.sky);
    // Coarse diffuse bounce until the outdoor/indoor probe volumes are authored.
    this.bounce=new THREE.HemisphereLight(0xb9cee0,0x4e5138,.3);scene.add(this.bounce);
    scene.fog=new THREE.FogExp2(0xb6cbd2,.000032);
    this.envScene=new THREE.Scene();this.envSky=calibratedSky();this.envSky.scale.setScalar(1000);this.envScene.add(this.envSky);
    installSkyCloudField(this.envSky,this.clouds,this.cloudOrigin);
    this.pmrem=new THREE.PMREMGenerator(renderer);this.pmrem.compileCubemapShader();
    this.nearShadowDetail=createNearShadowDetail({...renderer.capabilities,sharedOrmSampler:true},new URLSearchParams(globalThis.location?.search||"").get("nearShadowDetail")||"auto");
    this.csm=new CSM({camera,parent:scene,cascades:this.nearShadowDetail.cascades,maxFar:500,mode:"custom",customSplitsCallback:this.nearShadowDetail.customSplitsCallback,shadowMapSize:this.nearShadowDetail.shadowMapSize,shadowBias:shadowDepthBias(.000002,camera.reversedDepth),lightIntensity:3,lightDirection:new THREE.Vector3(-1,-1,0).normalize(),lightNear:1,lightFar:8000,lightMargin:2000});
    this.csmBacklitSkip=new URLSearchParams(globalThis.location?.search||'').get('csmBacklitSkip')==='1'?{value:1}:null;
    this.csmZeroFadeSkip={value:new URLSearchParams(globalThis.location?.search||'').get('csmZeroFadeSkip')==='1'?1:0};
    this.csm.fade=true;configureCSMDepth(this.csm,camera);this.restoreShadowSnap=configureNearShadowDetail(this.csm,this.nearShadowDetail,{reversedDepth:camera.reversedDepth});
    this.closeShadowOverlap=installCloseShadowOverlap(this.csm,{enabled:this.nearShadowDetail.mode==="close"&&new URLSearchParams(globalThis.location?.search||"").get("closeShadowOverlap")==="1"});
    this.closeSolarShadow=createCloseSolarShadow(this.csm,{enabled:this.nearShadowDetail.mode==="close"&&new URLSearchParams(globalThis.location?.search||"").get("closeSolarShadow")==="1"});
    this.closeShadowFootprint=new URLSearchParams(globalThis.location?.search||"").get("closeShadowFootprint")==="1"?{value:1}:null;
    this.cascadeDebug=new URLSearchParams(globalThis.location?.search||"").get("shadowDiagnostics")==="1"?{value:0}:null;
    this.shadowScheduler=new SunShadowScheduler(this.csm.lights);
    this.shadowDueScan=new URLSearchParams(globalThis.location?.search||"").get("shadowDueScan")!=="0";
    this.shadowCasters=new SunShadowCasters(scene,this.csm.lights);
    this.shadowReceivers=new SunShadowReceiverCulling(this.csm.lights,{csm:this.csm});
    this.shadowReceiverCameras=[];
    this.registered=new Set();this.elapsed=0;
    this.setTime(870);
  }
  register(materials) {
    for(const material of materials){
      if(!material||this.registered.has(material)||!(material.isMeshStandardMaterial||material.isMeshPhongMaterial||material.isMeshLambertMaterial))continue;
      const sharedOrm=this.nearShadowDetail?.mode==='close'&&sharedOrmSamplerEligible(material);
      const backlitSkip=csmBacklitSkipEligible(material)?this.csmBacklitSkip:null;
      if(backlitSkip)material.userData.csmBacklitSkip=backlitSkip;
      const previous=material.onBeforeCompile;
      const previousKey=material.customProgramCacheKey();
      this.csm.setupMaterial(material);
      const csmCompile=material.onBeforeCompile;
      material.onBeforeCompile=(shader,r)=>{
        csmCompile(shader,r);previous.call(material,shader,r);
        if(sharedOrm)installSharedOrmSampler(shader);
        installCloudShadows(shader,this.clouds);installCSMPhysicalLighting(shader);
        installCSMZeroFadeSkip(shader,this.csmZeroFadeSkip);
        installCloseShadowOverlapShader(shader,this.closeShadowOverlap,this.cascadeDebug);
        if(this.closeSolarShadow)installCloseSolarShadow(shader,this.closeSolarShadow);else installShadowReceiverFootprint(shader,this.closeShadowFootprint);
        if(backlitSkip)installCSMBacklitSkip(shader,backlitSkip);
        // The shadow maps belong to the viewer, also when a reflected camera
        // shades the same world. Do not choose cascades in mirror-camera space.
        shader.uniforms.uWorldCSMView={value:(this.camera||this.csm.camera).matrixWorldInverse};
        shader.fragmentShader="uniform mat4 uWorldCSMView;\n"+shader.fragmentShader.replace(
          "float linearDepth = (vViewPosition.z) / (shadowFar - cameraNear);",
          "float linearDepth = -(uWorldCSMView * vec4(vCloudWorld, 1.0)).z / (shadowFar - cameraNear);");
        if(material.fog!==false)installAerialPerspective(shader,this.aerial);
      };
      material.customProgramCacheKey=()=>previousKey+"-world-aerial-physical-v3-zero-fade-v1"+(sharedOrm?"-shared-orm-v1":"")+(backlitSkip?"-backlit-skip-v1":"")+(this.closeShadowOverlap?.state.enabled?"-close-overlap-v1":"")+(this.cascadeDebug?"-cascade-debug-v1":"")+(this.closeShadowFootprint?"-receiver-footprint-v1":"")+(this.closeSolarShadow?"-close-solar-v1"+(this.closeSolarShadow.reuseDepth?"-reuse":""):"");
      material.needsUpdate=true;this.registered.add(material);
    }
  }
  async exportShadowDepth(options={}) {
    const {exportShadowDepth}=await import("./shadow-depth-diagnostic.js");return exportShadowDepth(this.renderer,this.csm,options);
  }
  setLightingProfile(name) {
    if(!Object.hasOwn(WORLD_LIGHTING,name))throw new RangeError("Unknown world lighting profile");
    this.lightingProfile=name;return this.setTime(this.minutes??870);
  }
  setTime(minutes) {
    this.minutes=minutes;
    const lighting=WORLD_LIGHTING[this.lightingProfile??"v15"];
    this.clouds.uCloudCoverage.value=lighting.cloudCoverage;
    this.clouds.uCloudDensity.value=lighting.cloudDensity;
    const hh=String(Math.floor(minutes/60)).padStart(2,"0"),mm=String(minutes%60).padStart(2,"0");
    const s=sunPosition(this.meta.lat,this.meta.lon,beijingTime("2026-07-25 "+hh+":"+mm+":00"));
    sunDirection(s.azimuth,s.elevation,this.sun);
    this.elevation=s.elevation;this.clouds.uCloudSun.value.copy(this.sun);
    this.sky.material.uniforms.sunPosition.value.copy(this.sun).multiplyScalar(100000);
    const day=THREE.MathUtils.smoothstep(this.sun.y,0,.4);
    this.csm.lightDirection.copy(this.sun).negate().normalize();
    const warm=new THREE.Color(0xffbb7c).lerp(new THREE.Color(0xfff3de),day);
    const intensity=THREE.MathUtils.lerp(.8,lighting.sun,THREE.MathUtils.smoothstep(this.sun.y,-.02,.3));
    for(const l of this.csm.lights){l.color.copy(warm);l.intensity=intensity;}
    this.scene.fog.color.copy(new THREE.Color(0xb7aaa1).lerp(new THREE.Color(0xb0c6cf),day));
    this.scene.fog.density=THREE.MathUtils.lerp(.000041,.000028,day);
    const sunlight=THREE.MathUtils.smoothstep(this.sun.y,-.06,.12);
    this.aerial.uAerialDaylight.value=sunlight;
    this.aerial.uAerialHorizon.value.set("#b5a3a0").lerp(new THREE.Color("#b0c1d1"),day).multiplyScalar(.12+.88*sunlight);
    this.aerial.uAerialZenith.value.set("#626e98").lerp(new THREE.Color("#739ac5"),day).multiplyScalar(.15+.85*sunlight);
    this.aerial.uAerialSunColor.value.copy(warm);
    // Exposure does not brighten the noon sky and every material independently.
    this.renderer.toneMappingExposure=THREE.MathUtils.lerp(1.3,.85,day);
    // Keep the sky's diffuse fill readable at low sun angles. This is an
    // outdoor irradiance approximation; exposure and direct sun stay separate.
    this.bounce.intensity=THREE.MathUtils.lerp(1.05,lighting.bounce,day);
    this.scene.environmentIntensity=THREE.MathUtils.lerp(1.05,lighting.environment,day);
    this.pendingEnv=true;this.envWait=.12;
    return {text:hh+":"+mm+" 北京时间",elevation:s.elevation};
  }
  update(dt) {
    dt=visualDelta(dt);this.elapsed+=dt;
    this.sky.position.copy(this.camera.position);this.cloudOrigin.copy(this.camera.position);
    this.clouds.uCloudTime.value=this.elapsed;this.cloudCache.update(this.camera);
    this.sky.material.uniforms.time.value=this.elapsed;
    this.csm.update();
    this.camera.updateMatrixWorld();
    this.shadowReceivers.update(this.camera,this.sun,{additionalCameras:this.shadowReceiverCameras,shadowType:this.renderer.shadowMap.type});
    const forceShadowUpdate=Boolean(this.forceShadowUpdate);
    const skipCascades=this.shadowDueScan?this.shadowScheduler.dueCascades(dt,this.camera,{force:forceShadowUpdate}):[];
    const casters=this.shadowCasters.update(this.camera,{skipCascades});
    this.shadowScheduler.setSceneState(casters.revisions,forceShadowUpdate);
    this.forceShadowUpdate=false;this.shadowScheduler.update(dt,this.camera);
    // Low-frequency probe refresh follows broad cloud motion and cross-valley
    // travel without rebuilding PMREM on every animation frame.
    if(!this.pendingEnv && (this.elapsed-this.lastEnvironmentTime>30 || this.camera.position.distanceToSquared(this.lastEnvironmentOrigin)>900*900)){
      this.pendingEnv=true;this.envWait=.2;
    }
    if(this.pendingEnv && (this.envWait-=dt)<=0){
      for(const key in this.sky.material.uniforms){
        const dst=this.envSky.material.uniforms[key],src=this.sky.material.uniforms[key];
        if(dst.value?.copy)dst.value.copy(src.value);else dst.value=src.value;
      }
      this.envSky.material.uniforms.sunPosition.value.copy(this.sun).multiplyScalar(100000);
      this.envSky.material.uniforms.showSunDisc.value=false;
      const next=this.pmrem.fromScene(this.envScene,.04,.1,2000,{size:128});
      this.scene.environment=next.texture;this.environmentTarget?.dispose();this.environmentTarget=next;this.pendingEnv=false;
      this.lastEnvironmentOrigin.copy(this.camera.position);this.lastEnvironmentTime=this.elapsed;
    }
  }
  dispose(){this.closeSolarShadow?.dispose();this.closeShadowOverlap?.dispose();this.restoreShadowSnap?.();this.cloudCache.dispose();this.shadowReceivers.dispose();this.shadowCasters.dispose();this.shadowScheduler.dispose();this.csm.dispose();this.csm.remove();this.bounce.removeFromParent();this.pmrem.dispose();this.environmentTarget?.dispose();this.sky.geometry.dispose();this.sky.material.dispose();this.envSky.geometry.dispose();this.envSky.material.dispose();}
}
