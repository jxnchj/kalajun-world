import {Box3,DataTexture,Frustum,InstancedBufferAttribute,Matrix4,NearestFilter,RedFormat,UnsignedByteType,Vector3} from 'three';
import {treeCullSphere,TREE_CULL_WIND} from './tree-frustum-cull.js';
const installed=new WeakMap(),WIDTH=256;
const DECLARATIONS=`
attribute float aCrownMaskBase;
uniform sampler2D uCrownRootMask;
uniform float uCrownRootMaskEnabled;
bool crownRootOutsideView(){
 int slot=int(aCrownMaskBase)+gl_InstanceID;
 return texelFetch(uCrownRootMask,ivec2(slot % 256,slot / 256),0).r<.5;
}
`;
function installMaterial(material,owner){
 const prior=installed.get(material);if(prior){if(prior!==owner)throw Error('Crown mask material has a different owner');return;}
 const previous=material.onBeforeCompile,key=material.customProgramCacheKey();
 material.onBeforeCompile=(shader,renderer)=>{
  previous.call(material,shader,renderer);
  if(!shader.vertexShader.includes('// ECO_LOD_EARLY_BEGIN'))throw Error('Crown mask requires tree ecology vertex hook');
  shader.uniforms.uCrownRootMask={value:owner.texture};shader.uniforms.uCrownRootMaskEnabled=owner.enabled;
  shader.vertexShader=DECLARATIONS+shader.vertexShader.replace('// ECO_LOD_EARLY_BEGIN',`// ECO_LOD_EARLY_BEGIN
if(uCrownRootMaskEnabled>.5 && aCrownMaskBase>=0. && crownRootOutsideView()){gl_Position=vec4(2.,2.,2.,1.);return;}`);
 };
 material.customProgramCacheKey=()=>key+'-crown-root-mask-v1';material.needsUpdate=true;installed.set(material,owner);
}
// Only colour materials use the table. The original shadow geometry/material,
// including its root set and receiver-culling rules, remains unchanged. Scene's
// before-render hook runs AFTER native world/camera matrix updates and BEFORE
// traversal/upload. It receives the real main or oblique reflection camera.
export class CrownRootMask {
 constructor({enabled={value:1},capacity=32768}={}){
  if(!Number.isInteger(capacity)||capacity<WIDTH||capacity%WIDTH)throw Error('Crown mask capacity must be a multiple of 256');
  this.enabled=enabled;this.capacity=capacity;this.data=new Uint8Array(capacity).fill(255);
  this.texture=new DataTexture(this.data,WIDTH,capacity/WIDTH,RedFormat,UnsignedByteType);this.texture.name='crown-root-visibility';this.texture.minFilter=this.texture.magFilter=NearestFilter;this.texture.generateMipmaps=false;this.texture.unpackAlignment=1;this.texture.needsUpdate=true;
  this.records=new Set();this.free=[{start:0,count:capacity}];this.scene=null;this.disposed=false;this.frustum=new Frustum();this.projectionView=new Matrix4();
  this.stats={capacity,bytes:capacity,records:0,fallbacks:0,passes:0,roots:0,rejected:0,lastRoots:0,lastRejected:0,boundsBuilds:0,tableUploads:0,cpuMs:0};
 }
 attachScene(scene){
  if(this.scene===scene)return;if(this.scene)this.detachScene();if(!scene?.isScene)throw Error('Crown mask needs the actual world scene');
  const owner=this,previous=scene.onBeforeRender;
  const hook=function(renderer,renderScene,camera,...rest){previous.call(this,renderer,renderScene,camera,...rest);owner.update(camera);};
  scene.onBeforeRender=hook;this.scene=scene;this.detachScene=()=>{if(scene.onBeforeRender===hook)scene.onBeforeRender=previous;this.scene=null;};
 }
 add(mesh){
  if(this.disposed)throw Error('Crown mask owner disposed');
  if(!mesh.isInstancedMesh||Array.isArray(mesh.material)||!mesh.material.alphaTest||mesh.geometry.hasAttribute('aCrownMaskBase'))throw Error('Crown mask requires unmodified instanced photo foliage');
  const geometry=mesh.geometry,source=geometry.userData.treeWindSource||geometry;
  const supported=!!treeCullSphere(geometry);if(supported&&!source.boundingBox)source.computeBoundingBox();
  const local=source.boundingBox?.clone().expandByVector(new Vector3(...TREE_CULL_WIND));
  const count=mesh.instanceMatrix.count,slot=this.free.find(s=>s.count>=count),base=supported&&slot?slot.start:-1;
  if(base>=0){slot.start+=count;slot.count-=count;if(!slot.count)this.free.splice(this.free.indexOf(slot),1);}else this.stats.fallbacks++;
  const attribute=new InstancedBufferAttribute(new Float32Array([base]),1,false,count);geometry.setAttribute('aCrownMaskBase',attribute);
  const record={mesh,geometry,sourceMatrix:mesh.instanceMatrix,base,capacity:count,local,centre:new Vector3(),half:new Vector3(),bounds:new Float64Array(count*6),world:new Matrix4(),matrix:new Matrix4(),combined:new Matrix4(),matrixVersion:-1,count:-1,ready:false};
  if(local){local.getCenter(record.centre);local.getSize(record.half).multiplyScalar(.5);}
  installMaterial(mesh.material,this);this.records.add(record);this.stats.records=this.records.size;
  record.dispose=()=>{if(!this.records.delete(record))return;geometry.removeEventListener('dispose',record.dispose);if(base>=0){this.free.push({start:base,count});this.free.sort((a,b)=>a.start-b.start);for(let i=0;i<this.free.length-1;){const a=this.free[i],b=this.free[i+1];if(a.start+a.count===b.start){a.count+=b.count;this.free.splice(i+1,1);}else i++;}}this.stats.records=this.records.size;};
  geometry.addEventListener('dispose',record.dispose);return record;
 }
 update(camera){
  if(this.disposed||!this.enabled.value)return;
  const started=performance.now();this.projectionView.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse);this.frustum.setFromProjectionMatrix(this.projectionView,camera.coordinateSystem,camera.reversedDepth);
  let dirty=false,roots=0,rejected=0;
  for(const r of this.records){
   const m=r.mesh;if(r.base<0||!m.visible||!m.count)continue;
   if(m.instanceMatrix!==r.sourceMatrix||m.geometry!==r.geometry||m.count>r.capacity)throw Error('Crown mask source allocation changed');
   if(!r.ready||r.matrixVersion!==m.instanceMatrix.version||r.count!==m.count||!r.world.equals(m.matrixWorld)){
    r.world.copy(m.matrixWorld);
    for(let i=0;i<m.count;i++){
     r.matrix.fromArray(m.instanceMatrix.array,i*16);r.combined.multiplyMatrices(m.matrixWorld,r.matrix);const e=r.combined.elements,c=r.centre,h=r.half;
     const x=e[0]*c.x+e[4]*c.y+e[8]*c.z+e[12],y=e[1]*c.x+e[5]*c.y+e[9]*c.z+e[13],z=e[2]*c.x+e[6]*c.y+e[10]*c.z+e[14];
     const guard=.03+Math.max(Math.abs(x),Math.abs(y),Math.abs(z))*.000002;
     const hx=Math.abs(e[0])*h.x+Math.abs(e[4])*h.y+Math.abs(e[8])*h.z+guard,hy=Math.abs(e[1])*h.x+Math.abs(e[5])*h.y+Math.abs(e[9])*h.z+guard,hz=Math.abs(e[2])*h.x+Math.abs(e[6])*h.y+Math.abs(e[10])*h.z+guard,o=i*6;
     r.bounds[o]=x-hx;r.bounds[o+1]=y-hy;r.bounds[o+2]=z-hz;r.bounds[o+3]=x+hx;r.bounds[o+4]=y+hy;r.bounds[o+5]=z+hz;
    }
    r.ready=true;r.count=m.count;r.matrixVersion=m.instanceMatrix.version;this.stats.boundsBuilds++;
   }
   for(let i=0;i<m.count;i++){
    const o=i*6,b=r.bounds;let visible=true;
    // Positive AABB support vertex: never reject an intersecting branch or its
    // full authored wind envelope. Nonfinite data fails open (keeps the root).
    if(Number.isFinite(b[o])&&Number.isFinite(b[o+3]))for(const p of this.frustum.planes){const n=p.normal;if(n.x*b[o+(n.x>0?3:0)]+n.y*b[o+(n.y>0?4:1)]+n.z*b[o+(n.z>0?5:2)]+p.constant<0){visible=false;break;}}
    const value=visible?255:0,index=r.base+i;if(this.data[index]!==value){this.data[index]=value;dirty=true;}roots++;if(!visible)rejected++;
   }
  }
  if(dirty){this.texture.needsUpdate=true;this.stats.tableUploads++;}
  this.stats.passes++;this.stats.roots+=roots;this.stats.rejected+=rejected;this.stats.lastRoots=roots;this.stats.lastRejected=rejected;this.stats.cpuMs+=performance.now()-started;
 }
 dispose(){if(this.disposed)return;this.disposed=true;this.detachScene?.();for(const r of [...this.records])r.dispose();this.texture.dispose();}
}
