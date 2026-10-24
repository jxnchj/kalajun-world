// Opt-in closest-CSM screen-pixel integration. This is not solar penumbra or
// caster coverage reconstruction. Four bilinear hardware comparisons sample
// the four pixel quadrants; no map resolution, blade geometry or bias changes.
export const RECEIVER_PIXEL_OFFSETS=Object.freeze([[-.25,-.25],[.25,-.25],[-.25,.25],[.25,.25]].map(Object.freeze));
const guard='defined(USE_SHADOWMAP) && defined(USE_CSM) && defined(SHADOWMAP_TYPE_PCF) && NUM_DIR_LIGHT_SHADOWS > 0';
const directionalCall='getShadow( directionalShadowMap[ i ], directionalLightShadow.shadowMapSize, directionalLightShadow.shadowIntensity, directionalLightShadow.shadowBias, directionalLightShadow.shadowRadius, vDirectionalShadowCoord[ i ] )';
const sampleTerms=RECEIVER_PIXEL_OFFSETS.map(([x,y])=>`texture(shadowMap, p + dx * ${x} + dy * ${y})`).join(' +\n    ');
export const receiverFootprintHelper=`
#if ${guard}
uniform float uCloseShadowFootprint;
float worldReceiverPixelShadow(sampler2DShadow shadowMap, float intensity, float bias, vec3 p, vec3 dx, vec3 dy){
 p.z += bias;
 bool inFrustum=p.x>=0.0 && p.x<=1.0 && p.y>=0.0 && p.y<=1.0 && p.z<=1.0;
 float visibility=1.0;
 if(inFrustum){
  // 4 texture calls with sampler2DShadow + LinearFilter = 16 weighted compares.
  // Each offset moves UV AND compare depth along the same receiver plane.
  visibility=(
    ${sampleTerms}
  ) * .25;
 }
 return mix(1.0,visibility,intensity);
}
#endif
`;
export function installShadowReceiverFootprint(shader,uniform){
 if(!uniform)return false;
 if(shader.uniforms.uCloseShadowFootprint)return false;
 const include='#include <shadowmap_pars_fragment>',main=/void\s+main\s*\(\s*\)\s*\{/;
 if(!shader.fragmentShader.includes(include)||!main.test(shader.fragmentShader))throw Error('Receiver footprint requires ordinary material main/shadow chunk');
 const boundary='#if ( NUM_DIR_LIGHTS > 0 ) && defined( RE_Direct ) && !defined( USE_CSM )';
 const at=shader.fragmentShader.indexOf(boundary);if(at<0)throw Error('Receiver footprint requires installed CSM lighting');
 let csm=shader.fragmentShader.slice(0,at),tail=shader.fragmentShader.slice(at);
 if(csm.split(directionalCall).length!==3)throw Error('Expected exactly fade and nonfade CSM directional calls');
 const replacement=`worldClosestReceiverShadow( directionalShadowMap[ i ], directionalLightShadow.shadowMapSize, directionalLightShadow.shadowIntensity, directionalLightShadow.shadowBias, directionalLightShadow.shadowRadius, vDirectionalShadowCoord[ i ], UNROLLED_LOOP_INDEX )`;
 csm=csm.split(directionalCall).join(replacement);
 const macro=`
#if ${guard}
#define worldClosestReceiverShadow(map,size,intensity,bias,radius,coord,index) ((index == 0 && uCloseShadowFootprint > .5) ? worldReceiverPixelShadow(map,intensity,bias,worldReceiverCoord,worldReceiverDx,worldReceiverDy) : getShadow(map,size,intensity,bias,radius,coord))
#else
#define worldClosestReceiverShadow(map,size,intensity,bias,radius,coord,index) getShadow(map,size,intensity,bias,radius,coord)
#endif
`;
 // Derivatives execute before clipping/alpha discard, cascade branches, and
 // receiver/lighting branches. Never take dFdx/dFdy inside a selected cascade.
 const start=`
#if ${guard}
 vec3 worldReceiverCoord=vDirectionalShadowCoord[0].xyz/vDirectionalShadowCoord[0].w;
 vec3 worldReceiverDx=dFdx(worldReceiverCoord);
 vec3 worldReceiverDy=dFdy(worldReceiverCoord);
#endif
`;
 shader.fragmentShader=(csm+tail).replace(include,include+receiverFootprintHelper+macro).replace(main,match=>match+start);
 shader.uniforms.uCloseShadowFootprint=uniform;return true;
}
