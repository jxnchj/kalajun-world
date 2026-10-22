import { ShaderChunk, TangentSpaceNormalMap } from "three";

// Public diagnostic switch. 0 samples as before; 1 skips the normal map only
// where the existing relief fade is exactly zero. It never changes coverage.
export const needleSurfaceSamplingGate={value:1};
// A/B changes lighting only. Every needle, alpha test and physical width stays.
export const needleOptics={value:new URLSearchParams(globalThis.location?.search||'').get('needleOptics')==='0'?0:1};

// The glTF owns alpha semantics. Bark and the small solid crown core never had
// transparent texels; adding MASK to them needlessly sampled maps in depth passes.
export function configureSpruceMaterial(material){
  material.vertexColors=false;material.transparent=false;
  if(material.alphaTest>0)material.alphaTest=.45;
  material.defines={...material.defines,ECO_ROOT_WIND:""};
  return material;
}
export function installNeedleSurface(material){
  if(!material.normalMap)return material;
  const previous=material.onBeforeCompile,key=material.customProgramCacheKey();
  const tangent=material.normalMapType===TangentSpaceNormalMap;
  material.userData.needleSurfaceSamplingGate=needleSurfaceSamplingGate;
  material.onBeforeCompile=(shader,renderer)=>{
    previous.call(material,shader,renderer);
    const solid=!!material.userData.solidNeedleStations&&tangent;
    if(solid){shader.uniforms.uNeedleOptics=needleOptics;shader.fragmentShader="uniform float uNeedleOptics;varying vec2 vNeedleSection;\n"+shader.fragmentShader;}
    shader.uniforms.uNeedleSurfaceSamplingGate=needleSurfaceSamplingGate;
    // Keep Three's packed-map decode, tangent basis and normalScale. Derivatives
    // are evaluated BEFORE the divergent distance branch; textureGrad remains
    // valid at the 38 m boundary. Object-space maps retain their original path.
    let maps="#include <normal_fragment_maps>";
    if(tangent){
      const chunk=ShaderChunk.normal_fragment_maps.replaceAll(
        "texture2D( normalMap, vNormalMapUv )",
        "textureGrad( normalMap, vNormalMapUv, needleUvDx, needleUvDy )");
      maps=["#ifdef USE_NORMALMAP_TANGENTSPACE",
        "vec2 needleUvDx=dFdx(vNormalMapUv),needleUvDy=dFdy(vNormalMapUv);",
        "if(uNeedleSurfaceSamplingGate<.5||vPlantDistance<38.){",chunk,"}",
        "#else","#include <normal_fragment_maps>","#endif"].join("\n");
      shader.fragmentShader="uniform float uNeedleSurfaceSamplingGate;\n"+shader.fragmentShader;
    }
    const ordinary=maps+"\nnormal=normalize(mix(nonPerturbedNormal,normal,1.-smoothstep(10.,38.,vPlantDistance)));";
    // Photo micro-relief is not the cross section of a real 2.3 mm needle.
    // Resolved needles have a rounded transverse normal; its variation is
    // integrated to the mean as the width falls below a pixel. No alpha fades.
    const rounded=`float needleSpan=fwidth(vNeedleSection.x)/max(.06,vNeedleSection.y);
float needleRoundness=1.-smoothstep(.35,1.2,needleSpan);
float needleQ=clamp(vNeedleSection.x/max(.06,vNeedleSection.y),-.92,.92)*.82*needleRoundness;
normal=normalize(nonPerturbedNormal*sqrt(max(.01,1.-needleQ*needleQ))+tbn[0]*needleQ);`;
    shader.fragmentShader=shader.fragmentShader.replace("#include <normal_fragment_maps>",solid?"if(uNeedleOptics>.5){\n"+rounded+"\n}else{\n"+ordinary+"\n}":ordinary);
    shader.fragmentShader=shader.fragmentShader.replace("#include <roughnessmap_fragment>",
      "#include <roughnessmap_fragment>\n#ifdef USE_MAP\nroughnessFactor*=mix(1.,mix(.96,1.04,clamp(dot(sampledDiffuseColor.rgb,vec3(.2126,.7152,.0722))*2.,0.,1.)),1.-smoothstep(10.,38.,vPlantDistance));\n#endif");
    if(solid)shader.fragmentShader=shader.fragmentShader.replace("#include <roughnessmap_fragment>","#include <roughnessmap_fragment>\nif(uNeedleOptics>.5){float footprint=fwidth(vNeedleSection.x)/max(.06,vNeedleSection.y);roughnessFactor=max(roughnessFactor,mix(.88,.97,smoothstep(.35,1.2,footprint)));}");
  };
  material.customProgramCacheKey=()=>key+"-needle-bundle-relief-v13-"+(tangent?"tangent-gated":"original");return material;
}
