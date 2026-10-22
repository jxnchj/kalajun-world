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
  constructor(scene){
    this.scene=scene;this.owned=new Set();this.cache=new WeakMap();
    this.previous=scene.onBeforeRender;
    scene.onBeforeRender=(...args)=>{this.prepare();this.previous.apply(scene,args);};
  }
  prepare(){
    this.scene.traverse(object=>{
      if(!object.isMesh||!object.castShadow)return;
      if(object.customDepthMaterial){useProjectedShadowDepth(object.customDepthMaterial);return;}
      const source=Array.isArray(object.material)?object.material[0]:object.material;
      let depth=this.cache.get(source);
      if(!depth){depth=createStructureDepth(source);this.cache.set(source,depth);this.owned.add(depth);}
      object.customDepthMaterial=depth;
    });
  }
  dispose(){
    this.scene.onBeforeRender=this.previous;
    for(const depth of this.owned)depth.dispose();this.owned.clear();
  }
}
