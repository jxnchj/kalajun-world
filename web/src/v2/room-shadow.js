import {terrainShadowDepthAssigned} from './terrain-shadow-domain.js';
import { MeshDepthMaterial, BasicDepthPacking } from "three";

const patched=new WeakSet(), standardProjected=new WeakMap();
// Only our unmodified standard depth shader may use the terrain-only state contract.
export function isStandardProjectedDepth(depth){
 const record=standardProjected.get(depth);
 return !!record && depth.onBeforeCompile===record.compile && depth.customProgramCacheKey===record.key
   && Object.keys(depth.defines||{}).length===0;
}
export function useProjectedShadowDepth(depth){
  if(patched.has(depth))return depth;
  const previous=depth.onBeforeCompile,previousKey=depth.customProgramCacheKey();
  depth.onBeforeCompile=(shader,renderer)=>{
    previous.call(depth,shader,renderer);
    // Shadow coordinates and PCF depth textures must share projected depth.
    // Preserve plant wind, native morphs and alpha cutouts; only the camera's
    // logarithmic depth transform is excluded from the shadow pass.
    for(const stage of ["vertexShader","fragmentShader"])
      shader[stage]=shader[stage].replace(/#include <logdepthbuf_(?:pars_)?(?:vertex|fragment)>/g,"");
  };
  depth.customProgramCacheKey=()=>previousKey+"-projected-shadow-v1";
  depth.needsUpdate=true;patched.add(depth);return depth;
}
export function createStructureDepth(material){
  const depth=useProjectedShadowDepth(new MeshDepthMaterial({depthPacking:BasicDepthPacking,
    map:material.map,alphaMap:material.alphaMap,alphaTest:material.alphaTest,side:material.side}));
  standardProjected.set(depth,{compile:depth.onBeforeCompile,key:depth.customProgramCacheKey});return depth;
}

// Covers newly streamed terrain/plants as well as static rooms. This Three
// version does not filter shadow casters by shadow.camera.layers.
export class WorldShadowDepth{
  constructor(scene,{sharedTraversal=false,profile=new URLSearchParams(globalThis.location?.search||"").get("shadowDepthProfile39")==="1"}={}){
    this.sharedTraversal=sharedTraversal;this.sharedScope=null;this.sharedStats={visits:0,reusedMain:0,fallbacks:0};
    this.profile=profile?{calls:0,totalMs:0,last:null}:null;
    if(this.profile){
      // Opt-in local review only. Nonenumerable owner avoids circular snapshots.
      Object.defineProperty(this.profile,"owner",{value:this});
      scene.userData.shadowDepthProfile39=this.profile;
    }
    this.scene=scene;this.owned=new Set();this.cache=new WeakMap();
    this.previous=scene.onBeforeRender;
    scene.onBeforeRender=(...args)=>{
      const scope=this.sharedScope;
      if(scope?.drawing&&scope.ready){scope.ready=false;this.sharedStats.reusedMain++;}
      else{this.sharedStats.fallbacks++;this.prepare();}
      this.previous.apply(scene,args);
    };
  }
  // Only this synchronous update -> first draw scope grants a single reuse.
  // Subsequent mirror draws, compile calls and ordinary draws always prepare.
  runPreparedMain(update,draw){
    if(!this.sharedTraversal||this.sharedScope){update();return draw();}
    const scope={ready:false,drawing:false};this.sharedScope=scope;
    try{const prepared=update();if(prepared?.then)throw new TypeError("Shadow preparation reuse requires a synchronous update");scope.drawing=true;return draw();}
    finally{this.sharedScope=null;}
  }
  beginCasterVisit(){
    const scope=this.sharedScope;
    if(!this.sharedTraversal||!scope||scope.drawing)return null;
    scope.ready=false;return scope;
  }
  finishCasterVisit(scope){if(scope&&scope===this.sharedScope&&!scope.drawing)scope.ready=true;}
  prepareObject(object,sample=null){
    if(sample)sample.visited++;
    if(!object.isMesh||!object.castShadow)return;
    if(sample)sample.casters++;
    if(object.customDepthMaterial){
      if(sample)sample[patched.has(object.customDepthMaterial)?"alreadyPrepared":"patched"]++;
      useProjectedShadowDepth(object.customDepthMaterial);return;
    }
    const source=Array.isArray(object.material)?object.material[0]:object.material;
    let depth=this.cache.get(source);
    if(!depth){if(sample)sample.created++;depth=createStructureDepth(source);this.cache.set(source,depth);this.owned.add(depth);}
    if(sample)sample.assigned++;
    object.customDepthMaterial=depth;terrainShadowDepthAssigned(object);
  }
  prepare(){
    if(this.sharedScope)this.sharedScope.ready=false;
    const sample=this.profile?{visited:0,casters:0,alreadyPrepared:0,patched:0,assigned:0,created:0,ms:0}:null,start=sample?performance.now():0;
    this.scene.traverse(object=>{
      this.prepareObject(object,sample);
    });
    if(sample){sample.ms=performance.now()-start;this.profile.calls++;this.profile.totalMs+=sample.ms;this.profile.last=sample;}
  }
  dispose(){
    if(this.scene.userData.shadowDepthProfile39===this.profile)delete this.scene.userData.shadowDepthProfile39;
    this.scene.onBeforeRender=this.previous;
    for(const depth of this.owned)depth.dispose();this.owned.clear();
  }
}
