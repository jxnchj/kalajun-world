import * as THREE from "three";
import { Sky } from "three/addons/objects/Sky.js";
// One world-space cloud field drives sky appearance and direct-light attenuation.
// This is a thin cloud layer, not volumetric transport or baked global illumination.
const skyNoise = Sky.SkyShader.fragmentShader.slice(
  Sky.SkyShader.fragmentShader.indexOf("// gradient at"),
  Sky.SkyShader.fragmentShader.indexOf("// constants for atmospheric")
).replace(/\bgradient\b/g,"cloudGradient").replace(/\bnoise\b/g,"cloudNoise2").replace(/\bfbm\b/g,"cloudFbm");
export const cloudUniformGLSL = `
uniform float uCloudTime;
uniform float uCloudAltitude;
uniform float uCloudCoverage;
uniform float uCloudDensity;
uniform vec3 uCloudSun;
`;
export const cloudFieldGLSL = skyNoise + `
float cloudDepthAt(vec2 worldXZ) {
  vec2 uv = worldXZ * .000001 + uCloudTime * vec2(.0000012,.00000045);
  float n = clamp(cloudFbm(uv*1000.0,uCloudTime*.0003)*.7+.5,0.0,1.0);
  float region = cloudNoise2(uv*300.0)*.37+.5;
  float coverage = clamp(uCloudCoverage+(region-.5)*.6,0.0,1.0);
  return max(0.0,n-(1.0-coverage));
}
float cloudTransmittance(vec3 worldPosition) {
  float dy=uCloudAltitude-worldPosition.y;
  vec2 sampleXZ=worldPosition.xz+uCloudSun.xz*max(dy,0.0)/max(uCloudSun.y,.008);
  float depth=cloudDepthAt(sampleXZ);
  float sunlight=smoothstep(0.0,.12,uCloudSun.y);
  float belowLayer=smoothstep(0.0,200.0,dy);
  return mix(1.0,exp(-depth*uCloudDensity*12.0),sunlight*belowLayer);
}
`;
export function createCloudUniforms({array=new URLSearchParams(globalThis.location?.search||"").get("cloudCacheArray39")!=="0"}={}) {
  return {
    uCloudTime:{value:0},uCloudAltitude:{value:4400},
    uCloudCoverage:{value:.48},uCloudDensity:{value:.6},
    uCloudSun:{value:new THREE.Vector3(0,1,0)},
    ...(array?{uCloudCacheArray:{value:null},uCloudCacheLayers:{value:new THREE.Vector2(0,1)}}:{uCloudCacheA:{value:null},uCloudCacheB:{value:null}}),
    uCloudCacheOrigin:{value:new THREE.Vector2()},uCloudCacheSpan:{value:8192},
    uCloudCacheBlend:{value:0},uCloudCacheReady:{value:0}
  };
}
export function installSkyCloudField(sky,uniforms,origin) {
  Object.assign(sky.material.uniforms,uniforms,{uCloudOrigin:{value:origin}});
  let source=sky.material.fragmentShader;
  source=source.replace("direction.y > 0.0 && cloudCoverage > 0.0", "direction.y > 0.0 && uCloudCoverage > 0.0 && uCloudOrigin.y < uCloudAltitude");
  source=cloudUniformGLSL+"uniform vec3 uCloudOrigin;\n"+source;
  source=source.replace(
    /float elevation = mix\( 1\.0, 0\.1, cloudElevation \);[\s\S]*?float cloudNoise = clamp\( fbm\( cloudUV \* 1000\.0, evolve \) \* 0\.7 \+ 0\.5, 0\.0, 1\.0 \);/,
    `float cloudTravel = max(0.0,uCloudAltitude-uCloudOrigin.y)/max(direction.y,.008);
    vec2 cloudUV = (uCloudOrigin.xz+direction.xz*cloudTravel)*.000001;
    cloudUV += uCloudTime*vec2(.0000012,.00000045);
    float evolve = uCloudTime*.0003;
    float cloudNoise = clamp(fbm(cloudUV*1000.0,evolve)*.7+.5,0.0,1.0);`
  ).replace("cloudCoverage + ( region", "uCloudCoverage + ( region")
   .replace("depth * cloudDensity * -12.0", "depth * uCloudDensity * -12.0");
  sky.material.fragmentShader=source;
}
export function installCloudShadows(shader,uniforms) {
  Object.assign(shader.uniforms,uniforms);
  shader.vertexShader="varying vec3 vCloudWorld;\n"+shader.vertexShader;
  shader.vertexShader=shader.vertexShader.replace("#include <worldpos_vertex>",`#include <worldpos_vertex>
vec4 cloudWorld = vec4(transformed,1.0);
#ifdef USE_BATCHING
cloudWorld = batchingMatrix * cloudWorld;
#endif
#ifdef USE_INSTANCING
cloudWorld = instanceMatrix * cloudWorld;
#endif
vCloudWorld = (modelMatrix * cloudWorld).xyz;`);
  const cachedField=cloudFieldGLSL.replace("float cloudTransmittance",`
${uniforms.uCloudCacheArray?"uniform highp sampler2DArray uCloudCacheArray;uniform vec2 uCloudCacheLayers;":"uniform sampler2D uCloudCacheA;uniform sampler2D uCloudCacheB;"}
uniform vec2 uCloudCacheOrigin;uniform float uCloudCacheSpan;
uniform float uCloudCacheBlend;uniform float uCloudCacheReady;
float cachedCloudDepthAt(vec2 p) {
  vec2 uv=(p-uCloudCacheOrigin)/uCloudCacheSpan;
  float edge=min(min(uv.x,uv.y),min(1.-uv.x,1.-uv.y));
  if(uCloudCacheReady<.5||edge<=0.)return cloudDepthAt(p);
  float d=${uniforms.uCloudCacheArray?"mix(texture(uCloudCacheArray,vec3(uv,uCloudCacheLayers.x)).r,texture(uCloudCacheArray,vec3(uv,uCloudCacheLayers.y)).r,uCloudCacheBlend)":"mix(texture2D(uCloudCacheA,uv).r,texture2D(uCloudCacheB,uv).r,uCloudCacheBlend)"};
  if(edge>=.02)return d;
  return mix(cloudDepthAt(p),d,smoothstep(0.,.02,edge));
}
float cloudTransmittance`).replace("float depth=cloudDepthAt(sampleXZ);","float depth=cachedCloudDepthAt(sampleXZ);");
  shader.fragmentShader=cloudUniformGLSL+"varying vec3 vCloudWorld;\n"+cachedField+shader.fragmentShader;
  // Attenuate the sun, including every CSM cascade, before its BRDF evaluation.
  // Point / spot lamps, emissive surfaces and sky irradiance stay independent.
  const directional = THREE.ShaderChunk.lights_pars_begin.replace(
    "light.color = directionalLight.color;", "light.color = directionalLight.color * cloudDirectAttenuation;"
  );
  shader.fragmentShader="float cloudDirectAttenuation;\n"+shader.fragmentShader;
  shader.fragmentShader=shader.fragmentShader
    .replace("#include <lights_pars_begin>",directional)
    .replace("#include <lights_fragment_begin>",`cloudDirectAttenuation = cloudTransmittance(vCloudWorld);
#include <lights_fragment_begin>`);
}
