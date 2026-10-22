import { GLBufferAttribute } from 'three';

const renderers = new WeakMap();
const instanced = a => a.isInstancedBufferAttribute || a.data?.isInstancedInterleavedBuffer;
function fieldsOf(geometry) {
  if (!geometry.index || geometry.index.isGLBufferAttribute || Object.keys(geometry.morphAttributes).length)
    throw new Error('Shadow index requires immutable indexed, unmorphed geometry.');
  const count = geometry.attributes.position?.count;
  return Object.entries(geometry.attributes).filter(([name,a]) => name !== 'normal' && !instanced(a)).map(([name,a]) => {
    const array = a.isInterleavedBufferAttribute ? a.data.array : a.array;
    if (!ArrayBuffer.isView(array) || a.count !== count) throw new Error('Unsupported shadow attribute: '+name);
    const bytes = array.BYTES_PER_ELEMENT;
    return {name, attribute:a, array, version:(a.data||a).version, width:a.itemSize*bytes,
      stride:(a.isInterleavedBufferAttribute?a.data.stride:a.itemSize)*bytes,
      offset:(a.isInterleavedBufferAttribute?a.offset:0)*bytes,
      data:new Uint8Array(array.buffer,array.byteOffset,array.byteLength)};
  });
}

// Only the normal seam is ignored. Every other vertex input is compared by its
// underlying bytes, including signed zero, UV/wind/AO and optional coefficients.
// Index order, triangle count and winding remain unchanged.
export function createTreeShadowIndex(geometry) {
  const started=performance.now(),fields=fieldsOf(geometry),sourceIndex=geometry.index,sourceVersion=sourceIndex.version;
  const count=geometry.attributes.position.count,canonical=new Uint32Array(count),heads=new Map(),next=new Int32Array(count).fill(-1);
  const equal=(a,b)=>fields.every(f=>{for(let k=0;k<f.width;k++)if(f.data[a*f.stride+f.offset+k]!==f.data[b*f.stride+f.offset+k])return false;return true;});
  for(let i=0;i<count;i++) {
    let hash=2166136261;
    for(const f of fields)for(let k=0;k<f.width;k++)hash=Math.imul(hash^f.data[i*f.stride+f.offset+k],16777619)>>>0;
    let j=heads.get(hash)??-1;while(j>=0&&!equal(i,j))j=next[j];
    if(j<0){j=i;next[i]=heads.get(hash)??-1;heads.set(hash,i);}canonical[i]=j;
  }
  const index=new sourceIndex.array.constructor(sourceIndex.count);let changedCorners=0;
  for(let i=0;i<index.length;i++){const value=sourceIndex.array[i];if(value>=count)throw new Error('Shadow source index outside vertex array.');index[i]=canonical[value];changedCorners+=index[i]!==value;}
  const stats={beforeVertices:new Set(sourceIndex.array).size,afterVertices:new Set(index).size,triangles:index.length/3,changedCorners,indexBytes:changedCorners?index.byteLength:0,buildMs:performance.now()-started,uploads:0,liveBuffers:0,draws:0,remappedVertices:new Set(sourceIndex.array).size-new Set(index).size,bytes:changedCorners?index.byteLength:0};
  if(!changedCorners)return {sourceIndex,index:null,stats,dispose(){}};
  const contexts=new Map(),bindings=new Set();let disposed=false;
  const record={sourceIndex,sourceVersion,index,stats,validate(target){
    if(disposed)throw new Error('Shadow index owner disposed.');
    if(target.index!==sourceIndex||sourceIndex.version!==sourceVersion)throw new Error('Shadow index source changed.');
    const current=fieldsOf(target);
    if(current.length!==fields.length||current.some((f,i)=>f.name!==fields[i].name||f.attribute!==fields[i].attribute||f.array!==fields[i].array||f.version!==fields[i].version))throw new Error('Shadow vertex attributes changed.');
  },attribute(renderer){
    if(disposed)throw new Error('Shadow index owner disposed.');
    if(!renderers.has(renderer))throw new Error('Install shadow index renderer restoration before rendering.');
    let entry=contexts.get(renderer);
    if(!entry){
      const gl=renderer.getContext(),canvas=renderer.domElement;
      entry={gl,canvas,attribute:null,lost:()=>{if(entry.attribute){entry.attribute=null;stats.liveBuffers--;}}};
      canvas.addEventListener('webglcontextlost',entry.lost);contexts.set(renderer,entry);
      renderers.get(renderer).owners.add(record);
    }
    if(!entry.attribute){
      const {gl}=entry,previous=gl.getParameter(gl.ELEMENT_ARRAY_BUFFER_BINDING),buffer=gl.createBuffer();
      if(!buffer)throw new Error('Cannot allocate shadow index buffer.');
      try{gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,buffer);gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,index,gl.STATIC_DRAW);
        entry.attribute=new GLBufferAttribute(buffer,index instanceof Uint32Array?gl.UNSIGNED_INT:gl.UNSIGNED_SHORT,1,index.BYTES_PER_ELEMENT,index.length);
        stats.uploads++;stats.liveBuffers++;
      }catch(error){gl.deleteBuffer(buffer);throw error;}finally{gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,previous);}
    }
    return entry.attribute;
  },releaseRenderer(renderer){
    const entry=contexts.get(renderer);if(!entry)return;
    entry.canvas.removeEventListener('webglcontextlost',entry.lost);
    if(entry.attribute){entry.gl.deleteBuffer(entry.attribute.buffer);stats.liveBuffers--;}
    contexts.delete(renderer);renderers.get(renderer)?.owners.delete(record);
  },dispose(){
    if(disposed)return;disposed=true;
    for(const detach of [...bindings])detach();
    for(const renderer of [...contexts.keys()])record.releaseRenderer(renderer);
    geometry.removeEventListener('dispose',record.dispose);
  },bindings};
  geometry.addEventListener('dispose',record.dispose);
  return record;
}

// A Three draw exception can skip onAfterShadow. Restore all outstanding swaps
// at the shadow-pass boundary, before any later colour/reflection draw starts.
export function installShadowIndexRenderer(renderer) {
  const existing=renderers.get(renderer);if(existing)return existing;
  const previous=renderer.shadowMap.render,state={active:new Set(),owners:new Set()};
  const wrapped=function(...args){try{return previous.apply(this,args);}finally{for(const restore of [...state.active])restore();}};
  renderer.shadowMap.render=wrapped;
  state.dispose=()=>{for(const restore of [...state.active])restore();for(const owner of [...state.owners])owner.releaseRenderer(renderer);if(renderer.shadowMap.render===wrapped)renderer.shadowMap.render=previous;renderers.delete(renderer);};
  renderers.set(renderer,state);return state;
}

export function installTreeShadowIndex(mesh,record,{enabled={value:true}}={}) {
  if(!record.index)return {dispose(){},stats:record.stats};
  record.validate(mesh.geometry);
  const before=mesh.onBeforeShadow,after=mesh.onAfterShadow,geometry=mesh.geometry;let restore=null;
  const beforeHook=function(...args){
    before.apply(this,args);if(!enabled.value)return;
    if(restore)throw new Error('Reentrant shadow index draw.');
    const [renderer,,,,drawGeometry]=args;
    if(drawGeometry!==geometry)throw new Error('Shadow draw geometry changed.');
    const state=renderers.get(renderer);if(!state)throw new Error('Shadow renderer restoration missing.');
    const original=geometry.index;
    if(original!==record.sourceIndex||original.version!==record.sourceVersion)throw new Error('Shadow source index changed before draw.');
    const shadow=record.attribute(renderer);
    restore=()=>{geometry.setIndex(original);state.active.delete(restore);restore=null;};
    state.active.add(restore);geometry.setIndex(shadow);record.stats.draws++;
  };
  const afterHook=function(...args){try{restore?.();}finally{after.apply(this,args);}};
  mesh.onBeforeShadow=beforeHook;mesh.onAfterShadow=afterHook;
  const dispose=()=>{restore?.();if(mesh.onBeforeShadow===beforeHook)mesh.onBeforeShadow=before;if(mesh.onAfterShadow===afterHook)mesh.onAfterShadow=after;geometry.removeEventListener('dispose',dispose);record.bindings.delete(dispose);};
  geometry.addEventListener('dispose',dispose);record.bindings.add(dispose);
  return {dispose,stats:record.stats};
}
