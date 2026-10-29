
import {reach73Poses} from './reach-design73.js';
const next=()=>new Promise(r=>requestAnimationFrame(r));
function once(s,a,b){if(s.split(a).length!==2)throw Error('Water74 shader anchor '+a);return s.replace(a,b);}
export function patchWater74(shader,uniform){
 shader.uniforms.uWaterReview74=uniform;
 let s=shader.fragmentShader;
 s=once(s,'float riverFresnel=','uniform_placeholder74\nfloat riverFresnel=');
 s=s.replace('uniform_placeholder74','float reviewWeight74=0.,reviewAlpha74=0.;vec3 reviewGates74=vec3(0.);');
 s=once(s,'float reflectionWeight=uRiverReflectionValid*','reviewGates74.x=1.0-smoothstep(.045,.16,planeError);\nreviewGates74.y=smoothstep(.985,.998,dot(hydraulicNormal,uRiverReflectionPlane.xyz));\nfloat reflectionWeight=uRiverReflectionValid*');
 const uv='reflectionWeight*=smoothstep(.015+borderSupport,.08+borderSupport,min(reflectionBorder.x,reflectionBorder.y))*step(.0001,reflectedPosition.w);';
 s=once(s,uv,'reviewGates74.z=smoothstep(.015+borderSupport,.08+borderSupport,min(reflectionBorder.x,reflectionBorder.y))*step(.0001,reflectedPosition.w);\n'+uv);
 const alpha='reflectionWeight*=clamp(localReflection.a,0.0,1.0);';
 s=once(s,alpha,alpha+'\nreviewAlpha74=clamp(localReflection.a,0.0,1.0);reviewWeight74=reflectionWeight;');
 s=once(s,'#include <dithering_fragment>',`if(uWaterReview74>.5){vec3 v=vec3(riverFresnel,reviewWeight74,riverRefractionBlend);if(uWaterReview74>1.5)v=reviewGates74;if(uWaterReview74>2.5)v=vec3(uRiverReflectionValid,reviewAlpha74,1.);gl_FragColor=vec4(v,1.);}
#include <dithering_fragment>`);
 shader.fragmentShader='uniform float uWaterReview74;\n'+s;
}
function half(x){const sign=x&32768?-1:1,e=(x>>10)&31,m=x&1023;return sign*(e===0?m*2**-24:e===31?(m?NaN:Infinity):(1+m/1024)*2**(e-15));}
async function save(name,png,snapshot){const r=await fetch('/__review38/evidence',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name,png,snapshot})});if(!r.ok)throw Error('Water74 save '+r.status);}
const pixels={'pool-cross':[[640,500],[400,500],[850,500]],'root-mat':[[640,650],[400,650],[850,650]],'whole-bend':[[600,400],[400,500],[200,650]]};
async function settle(app){const until=performance.now()+240000;let stable=0;while(performance.now()<until){await next();const s=app.getSnapshot();if(document.hidden)throw Error('Hidden page');if(s.errors.length)throw Error(JSON.stringify(s.errors));if(!s.preparing&&s.terrain.queuedTiles===0&&app.debug.terrain.morphs.size===0){if(++stable===5)return;}else stable=0;}throw Error('Water74 settle timeout');}
export async function captureWaterOptics74(app,{prefix='water-optics74',poses=reach73Poses()}={}){
 if(!/^[a-zA-Z0-9_-]{1,32}$/.test(prefix))throw Error('prefix');
 const d=app.debug,s=app.getSnapshot();if(!d||s.viewport.width!==1280||s.viewport.height!==800||s.viewport.pixelRatio!==1||s.time!==870)throw Error('Desktop1280x800 DPR1 time870 required');
 const target=d.worldFrame?.target;if(!target||target.texture.type!==1016)throw Error('HalfFloat world target required');
 const mode={value:0},saved=[],records=[];let installed=0;
 const holdBefore=d.setReviewHold(false);
 try{
  for(const material of [d.water.nearMaterial,d.water.overviewMaterial]){
   const hook=material.onBeforeCompile,key=material.customProgramCacheKey;
   saved.push({material,hook,key});
   material.onBeforeCompile=function(shader,renderer){hook.call(this,shader,renderer);patchWater74(shader,mode);installed++;};
   material.customProgramCacheKey=function(){return key.call(this)+'-water-review74';};material.needsUpdate=true;
  }
  for(const pose of poses){
   d.controls.setPose(pose.position[0],pose.position[2],0,pose.yaw,pose.pitch,pose.position[1]);await settle(app);
   mode.value=0;await d.worldFrame.compileAsync(d.scene,d.camera);
   if(!installed)throw Error('Water74 hook not compiled');
   const captures=[];const prior=d.setReviewHold(true);
   try{
    d.camera.updateMatrixWorld();d.environment.update(0);
    for(const m of [0,1,2,3,0]){
     mode.value=m;d.renderFrozenWorld();
     const samples=pixels[pose.name].map(([x,y])=>{const raw=new Uint16Array(4);d.renderer.readRenderTargetPixels(target,x,target.height-1-y,1,1,raw);return{x,y,raw:Array.from(raw),linear:Array.from(raw,half)};});
     captures.push({mode:m,samples,png:d.renderer.domElement.toDataURL('image/png'),rawValid:d.water.uniforms.uRiverReflectionValid.value});
    }
   }finally{mode.value=0;try{d.renderFrozenWorld();}finally{d.setReviewHold(prior);}}
   for(let i=0;i<captures.length;i++){const c=captures[i],name=prefix+'-'+pose.name+'-'+(i===4?'restored':c.mode);const record={pose,mode:c.mode,samples:c.samples,rawValid:c.rawValid,scope:'linear HalfFloat world target; screen PNG output tone mapped; mode3 blue=1 identifies water',snapshot:app.getSnapshot()};await save(name,c.png,record);records.push({name,...record});}
  }
  await save(prefix+'-summary',null,{records});return records;
 }finally{
  mode.value=0;
  for(const {material,hook,key}of saved){material.onBeforeCompile=hook;material.customProgramCacheKey=key;material.needsUpdate=true;}
  d.setReviewHold(holdBefore);
 }
}
