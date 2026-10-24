import {ShaderChunk,Vector4,NearestFilter}from 'three';
export const SOLAR_ANGULAR_RADIUS=.266*Math.PI/180;
export const SOLAR_DISK=Object.freeze(Array.from({length:12},(_,i)=>{const r=Math.sqrt((i+.5)/12),a=i*2.399963229728653;return Object.freeze([Math.cos(a)*r,Math.sin(a)*r]);}));
export function shadowAxisGap(receiver,blocker,near,far,reversed=false){return Math.max(0,(receiver-blocker)*(reversed?-1:1)*(far-near));}
export function solarPenumbraRadius(gap){return Math.max(0,gap)*Math.tan(SOLAR_ANGULAR_RADIUS);}
const guard='defined(USE_SHADOWMAP) && defined(USE_CSM) && defined(SHADOWMAP_TYPE_PCF) && NUM_DIR_LIGHT_SHADOWS > 1';
const call='getShadow( directionalShadowMap[ i ], directionalLightShadow.shadowMapSize, directionalLightShadow.shadowIntensity, directionalLightShadow.shadowBias, directionalLightShadow.shadowRadius, vDirectionalShadowCoord[ i ] )';
// Local blocker estimate, not a complete PCSS search cone. Dense grass within
// ~1 texel penumbrae is the intended case; missed blockers remain a limitation.
const quadrants=[[-.25,-.25],[.25,-.25],[-.25,.25],[.25,.25]];
const integration=SOLAR_DISK.map(([x,y],i)=>{const [a,b]=quadrants[i%4];return `visibility+=worldSolarCompare(p+dx*${a}+dy*${b},vec2(${x.toFixed(12)},${y.toFixed(12)})*uvRadius,gradient,bias,size);`;}).join('\n');
export const closeSolarHelper=`
#if ${guard}
uniform sampler2D uCloseSolarDepth;
uniform sampler2DShadow uCloseSolarFar[NUM_DIR_LIGHT_SHADOWS-1];
// x/y: shadow world width/height, z: signed depth span, w: tan(solar angular radius).
uniform vec4 uCloseSolarMetric;
float worldSolarRaw(ivec2 cell,ivec2 size){return texelFetch(uCloseSolarDepth,clamp(cell,ivec2(0),size-1),0).r;}
float worldSolarLit(float receiver,float blocker){
 #ifdef USE_REVERSED_DEPTH_BUFFER
 return step(blocker,receiver);
 #else
 return step(receiver,blocker);
 #endif
}
float worldSolarCompare(vec3 p,vec2 offset,vec2 gradient,float bias,vec2 size){
 vec2 uv=p.xy+offset,grid=uv*size-.5,f=fract(grid);ivec2 cell=ivec2(floor(grid)),isize=ivec2(size);float sum=0.;
 for(int y=0;y<2;y++)for(int x=0;x<2;x++){
  ivec2 c=cell+ivec2(x,y);vec2 center=(vec2(c)+.5)/size;
  float z=p.z+dot(center-p.xy,gradient)+bias;
  float w=(x==0?1.-f.x:f.x)*(y==0?1.-f.y:f.y);
  sum+=w*worldSolarLit(z,worldSolarRaw(c,isize));
 }
 return sum;
}
float worldSolarShadow(vec2 size,float intensity,float bias,vec3 p,vec3 dx,vec3 dy){
 if(p.x<0.||p.x>1.||p.y<0.||p.y>1.||p.z>1.||p.z<0.)return 1.;
 float determinant=dx.x*dy.y-dx.y*dy.x;vec2 gradient=vec2(0.);
 if(abs(determinant)>1e-18)gradient=vec2(dx.z*dy.y-dy.z*dx.y,dx.x*dy.z-dy.x*dx.z)/determinant;
 ivec2 cell=ivec2(floor(p.xy*size)),isize=ivec2(size);float count=0.,totalGap=0.;
 // Exactly nine neighboring raw texels; no invented fixed blur radius.
 for(int y=-1;y<=1;y++)for(int x=-1;x<=1;x++){
  ivec2 c=cell+ivec2(x,y);vec2 uv=(vec2(c)+.5)/size;
  float receiver=p.z+dot(uv-p.xy,gradient),depth=worldSolarRaw(c,isize);
  float gap=(receiver-depth)*uCloseSolarMetric.z;
  if(gap>abs(bias*uCloseSolarMetric.z)) {totalGap+=gap;count+=1.;}
 }
 float radius=count>0.?totalGap/count*uCloseSolarMetric.w:0.;
 vec2 uvRadius=vec2(radius)/uCloseSolarMetric.xy;float visibility=0.;
 ${integration}
 return mix(1.,visibility/12.,intensity);
}
#endif
`;
// Reuse only the exact texels already read by blocker search. No approximation,
// threshold, disk position or filtering weight changes; out-of-window taps still
// fetch their original depth. Register pressure/branching must be GPU-tested.
export function solarDepthCellIndex(cell,base){const x=cell[0]-base[0],y=cell[1]-base[1];return Math.abs(x)<=1&&Math.abs(y)<=1?(y+1)*3+x+1:-1;}
export function closeSolarShaderHelper(reuse=false){
 if(!reuse)return closeSolarHelper;
 return closeSolarHelper
  .replace('float worldSolarCompare(vec3 p,vec2 offset,vec2 gradient,float bias,vec2 size){',`float worldSolarCached(ivec2 cell,ivec2 size,ivec2 base,in float depths[9]){
 ivec2 d=cell-base;
 if(all(greaterThanEqual(d,ivec2(-1)))&&all(lessThanEqual(d,ivec2(1))))return depths[(d.y+1)*3+d.x+1];
 return worldSolarRaw(cell,size);
}
float worldSolarCompare(vec3 p,vec2 offset,vec2 gradient,float bias,vec2 size,ivec2 base,in float depths[9]){`)
  .replace('worldSolarLit(z,worldSolarRaw(c,isize))','worldSolarLit(z,worldSolarCached(c,isize,base,depths))')
  .replace('float count=0.,totalGap=0.;','float count=0.,totalGap=0.;float depths[9];')
  .replace('float gap=(receiver-depth)*uCloseSolarMetric.z;','depths[(y+1)*3+x+1]=depth;\n  float gap=(receiver-depth)*uCloseSolarMetric.z;')
  .replaceAll('*uvRadius,gradient,bias,size);','*uvRadius,gradient,bias,size,cell,depths);');
}
export function createCloseSolarShadow(csm,{enabled=false,reuseDepth=new URLSearchParams(globalThis.location?.search||'').get('closeSolarReuse')==='1'}={}){
 if(!enabled)return null;
 if(csm.lights.length!==4)throw Error('Solar closest filtering requires four-cascade close mode');
 const shadow=csm.lights[0].shadow,original=shadow.updateMatrices,metric={value:new Vector4()},farTextures=Array(3).fill(null);
 const refresh=()=>{const c=shadow.camera;metric.value.set(c.right-c.left,c.top-c.bottom,(c.far-c.near)*(c.reversedDepth?-1:1),Math.tan(SOLAR_ANGULAR_RADIUS));};
 const wrapped=function(...args){original.apply(this,args);const t=this.map?.depthTexture;if(t&&(t.compareFunction!==null||t.minFilter!==NearestFilter||t.magFilter!==NearestFilter)){t.compareFunction=null;t.minFilter=t.magFilter=NearestFilter;t.needsUpdate=true;}refresh();};
 shadow.updateMatrices=wrapped;refresh();
 return {reuseDepth,metric,depth:{get value(){return shadow.map?.depthTexture??null;}},far:{get value(){for(let i=0;i<3;i++)farTextures[i]=csm.lights[i+1].shadow.map?.depthTexture??null;return farTextures;}},stats:{enabled:true,angularRadiusDegrees:.266,depthFetches:reuseDepth?null:57,depthFetchRange:reuseDepth?[9,57]:[57,57],localDepthFloats:reuseDepth?9:0,samplers:4,blockerSearch:'nearest 3x3 only',completeSolarVisibility:false},dispose(){if(shadow.updateMatrices===wrapped)shadow.updateMatrices=original;}};
}
export function installCloseSolarShadow(shader,state){
 if(!state)return false;if(shader.uniforms.uCloseSolarDepth)return false;
 const include='#include <shadowmap_pars_fragment>',main=/void\s+main\s*\(\s*\)\s*\{/;
 if(!shader.fragmentShader.includes(include)||!main.test(shader.fragmentShader))throw Error('Solar shadow needs ordinary material shadow chunk');
 const boundary='#if ( NUM_DIR_LIGHTS > 0 ) && defined( RE_Direct ) && !defined( USE_CSM )',at=shader.fragmentShader.indexOf(boundary);
 if(at<0)throw Error('Solar shadow requires CSM lighting');
 let csm=shader.fragmentShader.slice(0,at),tail=shader.fragmentShader.slice(at);
 if(csm.split(call).length!==3)throw Error('Expected original fade/nonfade CSM calls');
 // Unrolled constant expression keeps sampler indices statically addressable.
 const replacement='worldSolarCascade(directionalLightShadow.shadowMapSize,directionalLightShadow.shadowIntensity,directionalLightShadow.shadowBias,directionalLightShadow.shadowRadius,vDirectionalShadowCoord[i],UNROLLED_LOOP_INDEX)';
 csm=csm.split(call).join(replacement);
 const decl='uniform sampler2DShadow directionalShadowMap[ NUM_DIR_LIGHT_SHADOWS ];';
 if(!ShaderChunk.shadowmap_pars_fragment.includes(decl))throw Error('Unsupported directional shadow sampler declaration');
 const chunk=ShaderChunk.shadowmap_pars_fragment.replace(decl,`#if !defined(USE_CSM)\n${decl}\n#endif`);
 const macro=`\n#if ${guard}\n#define worldSolarCascade(size,intensity,bias,radius,coord,index) ((index==0)?worldSolarShadow(size,intensity,bias,worldSolarCoord,worldSolarDx,worldSolarDy):getShadow(uCloseSolarFar[(index==0)?0:index-1],size,intensity,bias,radius,coord))\n#endif\n`;
 const start=`\n#if ${guard}\n vec3 worldSolarCoord=vDirectionalShadowCoord[0].xyz/vDirectionalShadowCoord[0].w;\n vec3 worldSolarDx=dFdx(worldSolarCoord),worldSolarDy=dFdy(worldSolarCoord);\n#endif\n`;
 shader.fragmentShader=(csm+tail).replace(include,chunk+closeSolarShaderHelper(state.reuseDepth)+macro).replace(main,m=>m+start);
 shader.uniforms.uCloseSolarDepth=state.depth;shader.uniforms.uCloseSolarFar=state.far;shader.uniforms.uCloseSolarMetric=state.metric;return true;
}
