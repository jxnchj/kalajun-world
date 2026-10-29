import {DataTexture,FloatType,NearestFilter,NoColorSpace,RGBAFormat} from 'three';

// Optional, owned by SpruceRootWind. Root IDs survive source-tile eviction;
// source active-prefix indices do not. No render hook changes this table.
export class TreeWindAtlas44 {
 constructor({capacity=2048,width=128}={}){
  if(!Number.isInteger(capacity)||capacity<1||capacity>=2**24||!Number.isInteger(width)||width<2||width%2)throw new RangeError('Invalid tree wind atlas capacity');
  this.capacity=capacity;this.slots=new Map();this.free=Array.from({length:capacity},(_,i)=>capacity-i-1);this.bindings=new Map();this.layoutRevision=0;this.disposed=false;this.ready=false;
  this.data=new Float32Array(width*Math.ceil(capacity*2/width)*4);
  this.texture=new DataTexture(this.data,width,this.data.length/(width*4),RGBAFormat,FloatType);
  this.texture.name='tree-root-wind-atlas44';this.texture.minFilter=this.texture.magFilter=NearestFilter;this.texture.generateMipmaps=false;this.texture.colorSpace=NoColorSpace;
  this.uniform={value:this.texture};
  this.stats={enabled:true,capacity,roots:0,bindings:0,layoutRevision:0,bytes:this.data.byteLength,publications:0,requestedUploadBytes:0,gpuUploads:0,gpuUploadBytes:0,slotWrites:0,cpuMs:0,layoutCPUms:0,disposed:false};
  this.texture.onUpdate=()=>{this.stats.gpuUploads++;this.stats.gpuUploadBytes+=this.data.byteLength;};
 }
 bind(source){
  if(this.disposed||this.bindings.has(source))throw new Error('Tree wind atlas source already bound or disposed');
  const binding={owner:this,source,slots:new Float32Array(source.instanceMatrix.count),count:0,revision:0,matrixVersion:-1,windVersion:-1,released:false};
  binding.assertReady=()=>{
   if(this.disposed||binding.released||binding.count!==source.count||(source.count>0&&(!this.ready||binding.matrixVersion!==source.instanceMatrix.version||binding.windVersion!==source.geometry.attributes.aTreeRootWind.data.version)))throw new Error('Tree wind atlas must be published before every render pass');
  };
  binding.release=()=>{if(binding.released)return;binding.released=true;this.bindings.delete(source);this.stats.bindings=this.bindings.size;};
  this.bindings.set(source,binding);this.stats.bindings=this.bindings.size;return binding;
 }
 syncLayout(batches,groups){
  if(this.disposed)throw new Error('Tree wind atlas disposed');
  const start=performance.now(),wanted=new Set(),sources=new Map();
  for(const {records}of groups)for(const root of records){if(typeof root.id!=='string'||!root.id)throw new TypeError('Tree wind atlas requires stable root IDs');wanted.add(root.id);}
  // Validate before changing ANY slot. Overflow is an explicit candidate failure,
  // never a root drop, texture growth or an implicit lower-quality fallback.
  if(wanted.size>this.capacity)throw new RangeError('Tree wind atlas capacity exceeded: '+wanted.size);
  for(const batch of batches.values())sources.set(batch.mesh,batch.activeRecords);
  for(const [source,binding]of this.bindings){const roots=sources.get(source);if(!roots||roots.length!==source.count||roots.length>binding.slots.length)throw new Error('Tree wind atlas source prefix is not finalized');}
  this.ready=false;
  let changed=false;
  for(const [id,slot]of this.slots)if(!wanted.has(id)){this.slots.delete(id);this.free.push(slot);changed=true;}
  for(const id of wanted)if(!this.slots.has(id)){this.slots.set(id,this.free.pop());changed=true;}
  if(changed)this.layoutRevision++;
  for(const [source,binding]of this.bindings){
   const roots=sources.get(source);let dirty=binding.count!==roots.length;
   for(let i=0;i<roots.length;i++){const slot=this.slots.get(roots[i].id);if(slot===undefined)throw new Error('Tree wind atlas missing root');if(binding.slots[i]!==slot){binding.slots[i]=slot;this.stats.slotWrites++;dirty=true;}}
   if(dirty||binding.matrixVersion!==source.instanceMatrix.version)binding.revision++;
   binding.count=roots.length;binding.matrixVersion=source.instanceMatrix.version;
  }
  Object.assign(this.stats,{roots:this.slots.size,layoutRevision:this.layoutRevision,layoutCPUms:performance.now()-start});
 }
 publish(forces){
  if(this.disposed)throw new Error('Tree wind atlas disposed');
  const start=performance.now();
  if(forces.size!==this.slots.size)throw new Error('Tree wind atlas force membership changed without a layout boundary');
  for(const [id,slot]of this.slots){const force=forces.get(id);if(!(force instanceof Float32Array)||force.length!==5)throw new Error('Tree wind atlas requires original five Float32 values');this.data.set(force,slot*8);}
  // One full, bounded texture update. Actual GPU upload counters come from
  // Texture.onUpdate, not from this request; native source VBOs remain intact.
  if(this.slots.size){this.texture.needsUpdate=true;this.stats.publications++;this.stats.requestedUploadBytes+=this.data.byteLength;}
  for(const [source,binding]of this.bindings)binding.windVersion=source.geometry.attributes.aTreeRootWind.data.version;
  this.ready=true;
  this.stats.cpuMs=performance.now()-start;
 }
 dispose(){
  if(this.disposed)return;
  if(this.bindings.size)throw new Error('Release tree wind atlas views before their owner');
  this.disposed=true;this.texture.dispose();this.slots.clear();this.free.length=0;this.stats.disposed=true;this.stats.roots=0;
 }
}

export function patchTreeWindAtlas44(shader,atlas){
 const attributes='attribute vec4 aTreeRootWind;attribute float aTreeRootEddy;',marker='vec3 ecoWeights=vec3(clamp(position.y,0.,1.),0.,0.);';
 if(!shader.vertexShader.includes(attributes)||!shader.vertexShader.includes(marker))throw new Error('Tree wind atlas requires the original ecology wind shader chain');
 shader.uniforms.uTreeRootWindAtlas44=atlas.uniform;
 shader.vertexShader='uniform highp sampler2D uTreeRootWindAtlas44;\nattribute float aTreeRootSlot44;\nvec4 aTreeRootWind;float aTreeRootEddy;\n'+shader.vertexShader.replace(attributes,'');
 // Both existing LOD and frustum rejects precede ecoWeights. Do not fetch wind
 // for rejected vertices or alter any displacement/normal/shadow arithmetic.
 shader.vertexShader=shader.vertexShader.replace(marker,`int treeWindWidth44=textureSize(uTreeRootWindAtlas44,0).x;
int treeWindIndex44=int(aTreeRootSlot44)*2;
ivec2 treeWindUV44=ivec2(treeWindIndex44%treeWindWidth44,treeWindIndex44/treeWindWidth44);
aTreeRootWind=texelFetch(uTreeRootWindAtlas44,treeWindUV44,0);
aTreeRootEddy=texelFetch(uTreeRootWindAtlas44,treeWindUV44+ivec2(1,0),0).x;
`+marker);
}
