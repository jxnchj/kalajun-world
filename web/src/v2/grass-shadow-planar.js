import {Vector3} from 'three';
// Isolated planar receiver experiment, never installed in the main world.
// Run AFTER the original ecology wind hook; each original triangle is retained.
export function projectGrassPoint(point,sun,height=0){
 if(sun.y<=0)throw Error('Planar grass shadow requires the sun above the horizon');
 const t=(point.y-height)/sun.y;return new Vector3(point.x-sun.x*t,height,point.z-sun.z*t);
}
export function installPlanarGrassProjection(material,{sun,height}){
 const previous=material.onBeforeCompile,key=material.customProgramCacheKey();
 material.onBeforeCompile=(shader,renderer)=>{
  previous.call(material,shader,renderer);
  shader.uniforms.uGrassProjectionSun=sun;shader.uniforms.uGrassProjectionHeight=height;
  shader.vertexShader='uniform vec3 uGrassProjectionSun;uniform float uGrassProjectionHeight;\n'+shader.vertexShader;
  const marker='#include <project_vertex>';if(!shader.vertexShader.includes(marker))throw Error('Grass projection vertex contract changed');
  shader.vertexShader=shader.vertexShader.replace(marker,`vec4 projectedGrass=vec4(transformed,1.);
#ifdef USE_INSTANCING
projectedGrass=instanceMatrix*projectedGrass;
#endif
projectedGrass=modelMatrix*projectedGrass;
float shadowTravel=(projectedGrass.y-uGrassProjectionHeight)/uGrassProjectionSun.y;
projectedGrass.xyz-=uGrassProjectionSun*shadowTravel;
vec4 mvPosition=viewMatrix*projectedGrass;
gl_Position=projectionMatrix*mvPosition;`);
 };
 material.customProgramCacheKey=()=>key+'-planar-grass-projection-experiment-v38';return material;
}
