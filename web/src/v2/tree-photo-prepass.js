import * as THREE from 'three';

// A depth-only prefix INSIDE the normal world render. A separate renderer.render
// would resolve/discard the World's MSAA attachments between depth and colour.
// Keep Standard's exact vertex program and all alpha/LOD rejection code. The
// fragment prefix ends before PBR work; no duplicate wind implementation.
export function photoDepthMaterial(source, shaderRegistry=null) {
  if (!source?.isMeshStandardMaterial || source.transparent || !(source.alphaTest>0) ||
      !source.depthWrite || !source.depthTest || source.depthFunc!==THREE.LessEqualDepth || source.transmission>0)
    throw new Error('Photo prepass requires opaque masked Standard depth-writing material.');
  const material=source.clone(), compile=source.onBeforeCompile, key=source.customProgramCacheKey();
  // MeshStandardMaterial.copy resets defines to STANDARD instead of copying
  // ECO_ROOT_WIND/CSM. Losing ECO_ROOT_WIND changes vertex wind positions.
  material.defines={...source.defines};
  material.name=source.name+'-main-photo-depth';material.colorWrite=false;
  material.onBeforeCompile=(shader,renderer)=>{
    // CSM registers its compile result under the source material. Preserve that
    // public registry entry: this depth-only shader must never replace its PBR shader.
    const had=shaderRegistry?.has(source), prior=shaderRegistry?.get(source);
    try{compile.call(source,shader,renderer);}
    finally{if(shaderRegistry){if(had)shaderRegistry.set(source,prior);else shaderRegistry.delete(source);}}
    const marker='#include <alphahash_fragment>',index=shader.fragmentShader.indexOf(marker);
    if(index<0 || shader.fragmentShader.indexOf(marker,index+marker.length)>=0)
      throw new Error('Photo depth shader requires one final alpha rejection marker.');
    shader.fragmentShader=shader.fragmentShader.slice(0,index+marker.length)+
      '\n#ifdef OPAQUE\ndiffuseColor.a=1.0;\n#endif\ngl_FragColor=vec4(0.,0.,0.,diffuseColor.a);\n}\n';
  };
  material.customProgramCacheKey=()=>key+'-main-photo-depth-prefix-38';
  return material;
}

export class TreePhotoPrepass {
  constructor(scene,ecology,camera,{enabled=false,getShaderRegistry=()=>null}={}) {
    this.getShaderRegistry=getShaderRegistry;this.scene=scene;this.ecology=ecology;this.camera=camera;this._enabled=enabled;this.invariantSources=new Map();
    this.group=new THREE.Group();this.group.name='main-photo-depth-prefix';
    this.group.renderOrder=-Number.MAX_VALUE;this.group.visible=false;scene.add(this.group);
    this.entries=new Map();this.materials=new Map();this.revision=-1;this.disposed=false;
    this.stats={enabled,active:false,batches:0,instances:0,syncs:0,frames:0,error:null};
  }
  get enabled(){return this._enabled;}
  set enabled(value){
    const next=Boolean(value);if(next===this._enabled)return;
    this._enabled=next;this.revision=-1;
    if(!next)this._restoreSourcePrograms();
  }
  _invariantSource(source){
    if(this.invariantSources.has(source))return;
    const compile=source.onBeforeCompile,key=source.customProgramCacheKey;
    const registry=this.getShaderRegistry(),had=registry?.has(source),shader=registry?.get(source);
    const wrapped=(s,r)=>{compile.call(source,s,r);s.vertexShader='invariant gl_Position;\n'+s.vertexShader;};
    const wrappedKey=()=>key.call(source)+'-photo-depth-invariant-38';
    this.invariantSources.set(source,{compile,key,registry,had,shader,wrapped,wrappedKey});
    source.onBeforeCompile=wrapped;source.customProgramCacheKey=wrappedKey;source.needsUpdate=true;
  }
  _restoreSourcePrograms(){
    for(const [source,state]of this.invariantSources){
      if(source.onBeforeCompile===state.wrapped)source.onBeforeCompile=state.compile;
      if(source.customProgramCacheKey===state.wrappedKey)source.customProgramCacheKey=state.key;
      if(state.registry){if(state.had)state.registry.set(source,state.shader);else state.registry.delete(source);}
      source.needsUpdate=true;
    }
    this.invariantSources.clear();
  }
  _sync() {
    const e=this.ecology;
    if(e.treeViewCull?.value || e.middleBatched || e.treeWorldFrustum || e.crownRootMask)throw new Error('Photo prepass is incompatible with experimental tree view/batched/world-frustum/root-mask modes.');
    if(this.revision!==e.treeBatchRevision){
      const wanted=new Set();
      for(const batch of e.nearTreeBatches.values()){
        const source=batch.mesh;
        if(![1,5].includes(batch.mode)||!(source.material.alphaTest>0))continue;
        wanted.add(source);this._invariantSource(source.material);
        let entry=this.entries.get(source);
        let cached=this.materials.get(source.material);
        if(!cached || cached.version!==source.material.version){
          cached?.material.dispose();cached={version:source.material.version,material:photoDepthMaterial(source.material,this.getShaderRegistry())};
          this.materials.set(source.material,cached);
        }
        if(!entry){
          // Public InstancedMesh, zero-sized initial attribute; share the real
          // GPU instance buffer instead of allocating/copying each frame.
          const proxy=new THREE.InstancedMesh(source.geometry,cached.material,0);
          proxy.name=source.name+'-depth-prefix';proxy.matrixAutoUpdate=false;proxy.matrixWorldAutoUpdate=false;
          proxy.renderOrder=-Number.MAX_VALUE;proxy.castShadow=false;proxy.receiveShadow=source.receiveShadow;
          entry={source,proxy};this.entries.set(source,entry);this.group.add(proxy);
        }
        entry.proxy.material=cached.material;
      }
      for(const [source,{proxy}]of this.entries)if(!wanted.has(source)){
        this.group.remove(proxy);releaseProxy(proxy);this.entries.delete(source);
      }
      this.revision=e.treeBatchRevision;this.stats.syncs++;
    }
    this.stats.instances=0;
    // Only the registered photo batches, never a scene traversal. Count and
    // visibility track active prefixes even when a same-page switch follows a
    // stream/unload. Wind attributes, bounds, geometry and instance data alias.
    for(const {source,proxy}of this.entries.values()){
      proxy.geometry=source.geometry;proxy.instanceMatrix=source.instanceMatrix;proxy.instanceColor=source.instanceColor;
      proxy.count=source.count;proxy.visible=source.visible&&this.ecology.group?.visible!==false&&this.ecology.nearGroup?.visible!==false;proxy.layers.mask=source.layers.mask;
      proxy.frustumCulled=source.frustumCulled;proxy.boundingSphere=source.boundingSphere;proxy.boundingBox=source.boundingBox;
      proxy.matrixWorld.copy(source.matrixWorld);this.stats.instances+=source.visible?source.count:0;
    }
    this.stats.batches=this.entries.size;
  }
  run(camera,draw,{compile=false}={}) {
    if(this.disposed)throw new Error('Photo prepass has been disposed.');
    this.stats.enabled=this.enabled;
    if(!this.enabled||camera!==this.camera)return draw();
    try {
      this._sync();this.group.visible=true;this.stats.active=true;
      const result=draw();if(!compile)this.stats.frames++;return result;
    } catch(error){this.stats.error=error.message;throw error;}
    finally{this.group.visible=false;this.stats.active=false;}
  }
  dispose(){
    if(this.disposed)return;this._restoreSourcePrograms();this.disposed=true;this.group.visible=false;this.scene.remove(this.group);
    for(const {proxy}of this.entries.values())releaseProxy(proxy);
    for(const {material}of this.materials.values())material.dispose();
    this.entries.clear();this.materials.clear();
  }
}

function releaseProxy(proxy){
  // Three removes instance buffers on mesh disposal. Detach aliases first so
  // disposal cannot delete a still-live original tree buffer.
  proxy.instanceMatrix=new THREE.InstancedBufferAttribute(new Float32Array(0),16);
  proxy.instanceColor=null;proxy.dispose();
}
