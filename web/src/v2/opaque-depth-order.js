// Three r186 renderItem.z is clip Z BEFORE perspective division, sign-flipped
// for reversed depth in WebGLRenderList.push(). It is not an inverse distance.
export function viewDepthFromRenderZ(z,projection,reversedDepth){
  return (projection[14]-(reversedDepth?-z:z))/projection[10];
}
export function supportsOpaqueDepthOrder(renderer,camera,mainCamera){
  if(camera!==mainCamera||!camera?.isPerspectiveCamera||camera.reversedDepth!==true||
    !renderer.capabilities.reversedDepthBuffer||renderer.capabilities.logarithmicDepthBuffer)return false;
  const p=camera.projectionMatrix.elements;
  return camera.near>0&&Number.isFinite(camera.near)&&camera.far>camera.near&&Number.isFinite(camera.far)&&
    Number.isFinite(p[10])&&p[10]>0&&Number.isFinite(p[14])&&
    p[2]===0&&p[6]===0&&p[3]===0&&p[7]===0&&p[11]===-1&&p[15]===0;
}

// Coarse front-to-back opaque ordering preserves material batching within each
// fourfold distance band. The world owns this scoped sorter; default Three
// sorting resumes before reflection/PMREM or any later render.
export class OpaqueDepthOrder {
  constructor(renderer,mainCamera,{bucketsPerOctave=.5}={}){
    if(!Number.isFinite(bucketsPerOctave)||bucketsPerOctave<=0)throw new RangeError("Depth bucket rate must be positive and finite");
    this.renderer=renderer;this.mainCamera=mainCamera;this.bucketsPerOctave=bucketsPerOctave;
    this.cache=new WeakMap();this.epoch=0;this.near=.25;this.depthScale=1;this.depthBias=0;
    this.stats={enabled:false,epoch:0,cacheMisses:0,bucketsPerOctave};
    this.compare=(a,b)=>{
      if(a.groupOrder!==b.groupOrder)return a.groupOrder-b.groupOrder;
      if(a.renderOrder!==b.renderOrder)return a.renderOrder-b.renderOrder;
      const aa=this._bucket(a),bb=this._bucket(b);
      if(aa!==bb)return aa<bb?-1:1;
      if(a.material.id!==b.material.id)return a.material.id-b.material.id;
      if(a.materialVariant!==b.materialVariant)return a.materialVariant-b.materialVariant;
      // Keep Three's existing normalized Z tie-breaker inside each material.
      const az=Number.isFinite(a.z)?a.z:0,bz=Number.isFinite(b.z)?b.z:0;
      return az!==bz?az-bz:a.id-b.id;
    };
  }
  _bucket(item){
    let cached=this.cache.get(item);
    if(cached?.epoch===this.epoch)return cached.bucket;
    // Only eligible reversed perspective frames reach this path. Capture the
    // matrix coefficients once per run; no matrix/log work per sort comparison.
    const depth=(item.z+this.depthBias)/this.depthScale;
    const bucket=Number.isFinite(depth)?Math.floor(Math.log2(Math.max(this.near,depth))*this.bucketsPerOctave):Infinity;
    if(cached){cached.epoch=this.epoch;cached.bucket=bucket;}
    else {cached={epoch:this.epoch,bucket};this.cache.set(item,cached);}
    this.stats.cacheMisses++;return bucket;
  }
  run(camera,draw){
    const enabled=supportsOpaqueDepthOrder(this.renderer,camera,this.mainCamera);
    this.stats.enabled=enabled;this.stats.cacheMisses=0;this.stats.epoch=++this.epoch;
    if(enabled){
      const p=camera.projectionMatrix.elements;
      this.near=camera.near;this.depthScale=p[10];this.depthBias=p[14];
    }
    this.renderer.setOpaqueSort(enabled?this.compare:null);
    try{return draw();}
    finally{this.renderer.setOpaqueSort(null);}
  }
}
