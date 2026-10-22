import * as THREE from "three";
const noise=(x,y)=>{const n=Math.sin(x*127.1+y*311.7)*43758.5453;return n-Math.floor(n);};
function texture(width,height,sample) {
  const bytes=new Uint8Array(width*height*4);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const v=sample(x,y);const k=(y*width+x)*4;
    bytes[k]=v[0];bytes[k+1]=v[1];bytes[k+2]=v[2];bytes[k+3]=255;
  }
  const t=new THREE.DataTexture(bytes,width,height,THREE.RGBAFormat);
  t.colorSpace=THREE.SRGBColorSpace;t.wrapS=t.wrapT=THREE.RepeatWrapping;
  t.magFilter=THREE.LinearFilter;t.minFilter=THREE.LinearMipmapLinearFilter;t.generateMipmaps=true;t.needsUpdate=true;
  return t;
}
export function createPathMaterials(){
  const dirtMap=texture(128,128,(x,y)=>{
    const grain=noise(x,y),coarse=noise(Math.floor(x/4),Math.floor(y/4));
    const fleck=grain>.97?25:grain<.06?-22:0;
    const c=grain*12+coarse*13+fleck;return [116+c,107+c,84+c*.8];
  });
  dirtMap.repeat.set(2,2);
  const woodMap=texture(256,64,(x,y)=>{
    // Fibres run along each plank. Irregular annual rings and small checks.
    const wave=y*.82+Math.sin(x*.025)*1.5+Math.sin(x*.074+y*.08)*.32;
    const grain=Math.pow(Math.abs(Math.sin(wave)),10);
    const pores=noise(x,y),split=pores<.04?16:0;
    const c=18*grain+pores*10-split;
    return [137+c,123+c,101+c*.85];
  });
  const dirt=new THREE.MeshStandardMaterial({map:dirtMap,roughness:1,polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-1});
  dirt.onBeforeCompile=shader=>{
    shader.vertexShader="varying vec2 vPathUv;\n"+shader.vertexShader;
    shader.vertexShader=shader.vertexShader.replace("#include <begin_vertex>","#include <begin_vertex>\nvPathUv=uv;");
    shader.fragmentShader="varying vec2 vPathUv;\n"+shader.fragmentShader;
    shader.fragmentShader=shader.fragmentShader.replace("#include <alphatest_fragment>",`#include <alphatest_fragment>
float pathEdge=min(vPathUv.x,1.0-vPathUv.x);
float pathNoise=fract(sin(dot(floor(vPathUv*vec2(73.0,119.0)),vec2(12.9898,78.233)))*43758.5453);
float coverage=smoothstep(.005,.13,pathEdge+(pathNoise-.5)*.055);
float screenNoise=fract(52.9829189*fract(dot(gl_FragCoord.xy,vec2(.06711056,.00583715))));
if(coverage<=screenNoise)discard;`);
  };
  dirt.customProgramCacheKey=()=>"world-path-soil-v1";
  const wood=new THREE.MeshStandardMaterial({map:woodMap,bumpMap:woodMap,bumpScale:.006,roughness:.91});
  return {dirt,wood,dispose:()=>{dirtMap.dispose();woodMap.dispose();}};
}
