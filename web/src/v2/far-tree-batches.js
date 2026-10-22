import {WorldBoundsCache,worldBoundsCacheControl} from "./world-bounds-cache.js";
import * as THREE from "three";
import {setFarSpruceAttributes} from "./spruce-geometry.js";

// Toggle only the bound used by Three's main/reflection frustum queries. This
// never changes roots, matrices, material, LOD acceptance or shadow eligibility.
export const farTreeBoundsControl={enabled:true};
export function setFarTreeBounds(enabled){
  if(typeof enabled!=="boolean")throw new TypeError("Far-tree bounds expects a boolean");
  farTreeBoundsControl.enabled=enabled;
}
const sourceReferences=new WeakMap();
function markRendered(){
  const allocation=this.geometry.userData.farTreeAllocation;
  if(allocation&&!allocation.owner)allocation.owner=this.geometry;
}
function privateDispose(geometry){
  const shared=geometry.userData.farTreeAllocation.shared;
  for(const [name,a]of Object.entries(geometry.attributes))if(shared.has(a))geometry.deleteAttribute(name);
  geometry.setIndex(null);geometry.morphAttributes={};geometry.dispose();
}
function releaseGeometry(geometry){
  if(geometry.userData.farTreeReleased)return;
  geometry.userData.farTreeReleased=true;
  const {farTreeAllocation:allocation,farTreeSource:source}=geometry.userData;
  allocation.references--;
  if(allocation.references){
    // Keep ONE previously submitted owner until the last wrapper retires. A
    // never-submitted final tile has no WebGLGeometries disposal listener.
    if(allocation.owner!==geometry)privateDispose(geometry);
    return;
  }
  sourceReferences.delete(source);
  if(allocation.owner&&allocation.owner!==geometry){privateDispose(geometry);allocation.owner.dispose();}
  else geometry.dispose();
  allocation.owner=null;
}

// source.boundingBox must cover every static shader-shaped form, not only the
// unshaped template. The immutable template's vertex/index buffers are shared;
// each tile owns its injected per-instance fields and instanceMatrix allocation.
// Billboards must supply an envelope covering ALL camera-facing orientations.
export function createFarTreeBatch(source,material,records,matrixFor,{control=farTreeBoundsControl,windMargin=1,setAttributes=setFarSpruceAttributes}={}){
  if(!source.boundingBox||!source.boundingSphere||source.boundingBox.isEmpty())throw new TypeError("Far-tree source needs a complete shaped envelope");
  if(!(windMargin>=0&&Number.isFinite(windMargin)))throw new RangeError("Invalid far-tree wind margin");
  if(typeof setAttributes!=="function")throw new TypeError("Far-tree instance setter must be a function");
  if(Object.values(source.attributes).some(a=>a.isInstancedBufferAttribute||a.data?.isInstancedInterleavedBuffer))throw new TypeError("Far-tree source must be an uninstanced template");
  const geometry=new THREE.BufferGeometry();
  for(const [name,a]of Object.entries(source.attributes))geometry.setAttribute(name,a);
  geometry.setIndex(source.index);geometry.groups=source.groups.map(g=>({...g}));geometry.drawRange={...source.drawRange};
  geometry.boundingBox=source.boundingBox.clone();geometry.boundingSphere=source.boundingSphere.clone();
  setAttributes(geometry,records);
  let allocation=sourceReferences.get(source);
  if(!allocation){allocation={references:0,owner:null,shared:new Set(Object.values(source.attributes))};sourceReferences.set(source,allocation);}
  allocation.references++;
  geometry.userData={...source.userData,farTreeSource:source,farTreeAllocation:allocation};
  const mesh=new THREE.InstancedMesh(geometry,material,records.length);
  for(let i=0;i<records.length;i++)mesh.setMatrixAt(i,matrixFor(records[i]));
  mesh.instanceMatrix.needsUpdate=true;mesh.receiveShadow=true;
  mesh.onBeforeRender=mesh.onBeforeShadow=markRendered;
  // Use the uploaded Float32 matrices, including their actual root/rotation and
  // scale, rather than recomputing bounds from higher-precision input records.
  mesh.boundingBox=new THREE.Box3();const matrix=new THREE.Matrix4(),box=new THREE.Box3();let maxScale=0;
  for(let i=0;i<mesh.count;i++){
    mesh.getMatrixAt(i,matrix);box.copy(source.boundingBox).applyMatrix4(matrix);mesh.boundingBox.union(box);
    maxScale=Math.max(maxScale,matrix.getMaxScaleOnAxis());
  }
  // Far wind has no branch term: |current + .32*(current-previous)| <= 1.32,
  // h<=20. The normal tree scale range needs <1m, while larger scales stay safe.
  const height=Math.min(20,Math.max(0,source.boundingBox.max.y));
  const margin=Math.max(windMargin,1.32*.0014*height*height*maxScale);
  if(!mesh.boundingBox.isEmpty())mesh.boundingBox.expandByScalar(margin);
  mesh.computeBoundingSphere();mesh.boundingSphere.radius+=margin;
  mesh.userData.farTreeBounds=control;material.userData.farTreeBounds=control;
  const worldBounds=new WorldBoundsCache();
  mesh.userData.worldBoundsCache=worldBounds;mesh.userData.worldBoundsCacheControl=worldBoundsCacheControl;
  mesh.intersectsFrustum=function(frustum){
    if(this.count===0)return false;
    if(!control.enabled||!frustum.intersectsBox)return THREE.Mesh.prototype.intersectsFrustum.call(this,frustum);
    return frustum.intersectsBox(worldBounds.get(this.boundingBox,this.matrixWorld));
  };
  return mesh;
}
export function disposeFarTreeBatch(mesh){
  if(!mesh?.geometry.userData.farTreeAllocation||mesh.userData.farTreeReleased)return;
  mesh.userData.farTreeReleased=true;releaseGeometry(mesh.geometry);mesh.dispose();
}
