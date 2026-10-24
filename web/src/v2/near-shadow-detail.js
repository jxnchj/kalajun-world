import { Box3, Matrix4, Vector3 } from 'three';
import { CSMFrustum } from 'three/addons/csm/CSMFrustum.js';
import { directionalReceiverBias, receiverBiasMode } from './shadow-receiver-bias.js';
// Actual maximum occupied-room material: base/normal/roughness/metalness (4),
// cloud cache (2), PMREM + DFG (2), room field + contact (2), portal shadows (3).
// Roughness and metalness share an image but remain separate shader samplers.
export const NEAR_SHADOW_SAMPLERS=Object.freeze({surface:4,cloud:2,pbr:2,indirect:2,spotShadow:3,withoutCSM:13});
export function createNearShadowDetail(capabilities={},requested='auto'){
  if(!['auto','close','cascade','resolution','legacy'].includes(requested))throw new RangeError('Unknown near-shadow detail mode');
  const maxTextures=Number(capabilities.maxTextures)||16,maxTextureSize=Number(capabilities.maxTextureSize)||2048;
  let mode=requested,reason=null;
  if(mode==='auto')mode=maxTextures>=17?'cascade':maxTextureSize>=4096?'resolution':'legacy';
  if(mode==='close'&&(maxTextures<16||maxTextureSize<4096||!capabilities.sharedOrmSampler)){mode=maxTextureSize>=4096?'resolution':'legacy';reason='Close cascade requires 4096 maps and verified shared ORM sampler support';}
  if(mode==='cascade'&&maxTextures<17){mode=maxTextureSize>=4096?'resolution':'legacy';reason='Four CSM + occupied-room material needs 17 fragment samplers; hardware limit is '+maxTextures;}
  if(mode==='resolution'&&maxTextureSize<4096){mode='legacy';reason='4096 shadow map exceeds hardware texture-size limit';}
  const splits=Object.freeze(mode==='close'?[8,60,180,500]:mode==='cascade'?[20,60,180,500]:[60,180,500]);
  const mapSizes=Object.freeze(splits.map((_,i)=>mode==='close'&&i<2||mode==='resolution'&&i===0?4096:2048));
  const shadowPixels=mapSizes.reduce((n,s)=>n+s*s,0),baselinePixels=3*2048*2048;
  return Object.freeze({mode,requested,reason,splits,mapSizes,cascades:splits.length,maxFar:500,shadowMapSize:2048,
    fragmentSamplers:(mode==='close'?12:13)+splits.length,maxTextures,maxTextureSize,shadowPixels,extraShadowPixels:shadowPixels-baselinePixels,
    // Lower bound for UInt depth alone; driver storage and render-target colour
    // attachments are additional. This is not a measured VRAM claim.
    extraDepthBytesLowerBound:(shadowPixels-baselinePixels)*4,
    customSplitsCallback:(n,near,far,out)=>{if(n!==splits.length)throw new RangeError('Near shadow cascade count mismatch');for(const d of splits)out.push(d/far);}});
}
// r186 CSM.update snaps all cascades using one global resolution. When only
// the original near map grows, resnap ONLY that light from its exact frustum
// at its own finer texel pitch; the other lights retain Three's original path.
export function installPerMapShadowSnap(csm){
  const previous=csm.update,orientation=new Matrix4(),inverse=new Matrix4(),cameraToLight=new Matrix4(),frustum=new CSMFrustum(),box=new Box3(),center=new Vector3(),origin=new Vector3(),up=new Vector3(0,1,0);
  const update=function(...args){
    previous.apply(this,args);orientation.lookAt(origin,this.lightDirection,up);inverse.copy(orientation).invert();cameraToLight.multiplyMatrices(inverse,this.camera.matrixWorld);
    for(let i=0;i<this.lights.length;i++){
      const light=this.lights[i],shadow=light.shadow,c=shadow.camera;
      if(shadow.mapSize.x===this.shadowMapSize&&shadow.mapSize.y===this.shadowMapSize)continue;
      this.frustums[i].toSpace(cameraToLight,frustum);box.makeEmpty();
      for(let j=0;j<4;j++){box.expandByPoint(frustum.vertices.near[j]);box.expandByPoint(frustum.vertices.far[j]);}
      box.getCenter(center);center.z=box.max.z+this.lightMargin;
      const tx=(c.right-c.left)/shadow.mapSize.x,ty=(c.top-c.bottom)/shadow.mapSize.y;
      center.x=Math.floor(center.x/tx)*tx;center.y=Math.floor(center.y/ty)*ty;center.applyMatrix4(orientation);
      light.position.copy(center);light.target.position.copy(center).add(this.lightDirection);
    }
  };
  csm.update=update;return()=>{if(csm.update===update)csm.update=previous;};
}
export function configureNearShadowDetail(csm,detail,{reversedDepth=false,receiverBias=receiverBiasMode()}={}){
  if(csm.lights.length!==detail.cascades)throw new RangeError('Create CSM with matching near-shadow configuration first');
  for(let i=0;i<csm.lights.length;i++){
    const s=csm.lights[i].shadow;s.mapSize.set(detail.mapSizes[i],detail.mapSizes[i]);
    s.radius=(detail.mode==='close'?i<2:detail.mode!=='legacy'&&i===0)?.5:2;s.normalBias=(detail.mode==='close'?i<2:detail.mode!=='legacy'&&i===0)?.008:.04;
    s.bias=directionalReceiverBias(.000002*((detail.mode==='close'?i<2:detail.mode!=='legacy'&&i===0)?.25:1),reversedDepth,receiverBias);
  }
  return ['resolution','close'].includes(detail.mode)?installPerMapShadowSnap(csm):()=>{};
}
