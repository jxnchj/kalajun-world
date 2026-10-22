import {withPreparedWorldMatrices} from "./prepared-world-matrices.js";
import * as THREE from "three";
import { ReflectionDepthOrder } from "./reflection-depth-order.js";

const clamp=THREE.MathUtils.clamp,smooth=THREE.MathUtils.smoothstep;
export const WATER_REFLECTION_LIMITS=Object.freeze({range:58,height:18,patchRadius:26,sceneRadius:220,maxSize:512,minInterval:1/20,idleInterval:.18,releaseAfter:20});
const COUNTERS=["calls","triangles","points","lines"];
export function createWaterReflectionUniforms(){
  return {uRiverReflectionMap:{value:null},uRiverReflectionSize:{value:new THREE.Vector2(1,1)},uRiverReflectionMatrix:{value:new THREE.Matrix4()},
    uRiverReflectionPlane:{value:new THREE.Vector4(0,1,0,0)},uRiverReflectionPatch:{value:new THREE.Vector3()},uRiverReflectionValid:{value:0}};
}

// Three r186 Reflector assumes WebGL's -1..1 clip depth. EXT_clip_control uses
// reversed 0..1: the new near plane is rowW-rowZ instead of rowW+rowZ.
// q is an original far corner in camera space, obtained through the actual P^-1.
export function applyWaterObliqueClip(camera,worldPlane){
  const plane=worldPlane.clone().applyMatrix4(camera.matrixWorldInverse);
  const c=new THREE.Vector4(plane.normal.x,plane.normal.y,plane.normal.z,plane.constant);
  const inverse=camera.projectionMatrix.clone().invert(),reverse=camera.reversedDepth;
  const zeroToOne=reverse||camera.coordinateSystem===THREE.WebGPUCoordinateSystem;
  const q=new THREE.Vector4(Math.sign(c.x)||1,Math.sign(c.y)||1,reverse?0:1,1).applyMatrix4(inverse);
  const denominator=c.dot(q);
  if(!Number.isFinite(denominator)||denominator<=1e-8)return false;
  c.multiplyScalar((zeroToOne?1:2)/denominator);
  const e=camera.projectionMatrix.elements,rowW=[e[3],e[7],e[11],e[15]];
  for(let i=0;i<4;i++)e[i*4+2]=reverse?rowW[i]-c.getComponent(i):c.getComponent(i)-(zeroToOne?0:rowW[i]);
  camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
  return camera.projectionMatrix.elements.every(Number.isFinite);
}

export function createWaterReflectionCamera(camera,plane,{far=WATER_REFLECTION_LIMITS.sceneRadius,clipAllowance=.02}={}){
  camera.updateMatrixWorld();
  const mirror=camera.clone();mirror.parent=null;mirror.matrixAutoUpdate=true;mirror.matrixWorldAutoUpdate=true;
  mirror._reversedDepth=camera.reversedDepth;
  mirror.position.setFromMatrixPosition(camera.matrixWorld);
  mirror.position.addScaledVector(plane.normal,-2*plane.distanceToPoint(mirror.position));
  const direction=camera.getWorldDirection(new THREE.Vector3()).reflect(plane.normal);
  mirror.up.set(0,1,0).transformDirection(camera.matrixWorld).reflect(plane.normal);
  mirror.lookAt(mirror.position.clone().add(direction));
  mirror.far=Math.min(camera.far,far);mirror.updateProjectionMatrix();mirror.updateMatrixWorld();
  // Keep a narrow strip below the mathematical plane so exposed pebbles are
  // not detached by a round-off sized waterline gap. Submerged terrain is clipped.
  const clip=plane.clone();clip.constant+=clipAllowance;
  if(!applyWaterObliqueClip(mirror,clip))return null;
  return mirror;
}

function station(line,distance){
  const nodes=line.nodes;let lo=0,hi=nodes.length-1;
  while(hi-lo>1){const mid=(lo+hi)>>1;if(nodes[mid].distance<distance)lo=mid;else hi=mid;}
  const a=nodes[lo],b=nodes[hi],t=clamp((distance-a.distance)/Math.max(.0001,b.distance-a.distance),0,1);
  return new THREE.Vector3(THREE.MathUtils.lerp(a.x,b.x,t),THREE.MathUtils.lerp(a.level,b.level,t)+.006,THREE.MathUtils.lerp(a.z,b.z,t));
}
// This is one local tangent-plane approximation, never a plane for the full
// sloped river network. Per-fragment height/normal/radius gates enforce its domain.
export function selectWaterReflectionPatch(hydrology,camera,previous=null){
  if(!camera.isPerspectiveCamera)return null;
  camera.updateMatrixWorld();
  const p=camera.getWorldPosition(new THREE.Vector3()),direction=camera.getWorldDirection(new THREE.Vector3());
  const candidates=hydrology.nearSegments(p.x,p.z,WATER_REFLECTION_LIMITS.range);
  let best=null,score=Infinity;
  for(const s of candidates){
    const dx=s.b.x-s.a.x,dz=s.b.z-s.a.z,den=dx*dx+dz*dz;
    const t=clamp(((p.x+direction.x*12-s.a.x)*dx+(p.z+direction.z*12-s.a.z)*dz)/Math.max(.0001,den),0,1);
    const point=new THREE.Vector3(s.a.x+dx*t,THREE.MathUtils.lerp(s.a.level,s.b.level,t)+.006,s.a.z+dz*t);
    const height=p.y-point.y,distance=Math.hypot(p.x-point.x,p.z-point.z),ndc=point.clone().project(camera);
    if(height<.12||height>WATER_REFLECTION_LIMITS.height||distance>WATER_REFLECTION_LIMITS.range||Math.abs(ndc.x)>1.15||Math.abs(ndc.y)>1.15||point.clone().sub(p).dot(direction)<=0)continue;
    const rank=distance+Math.hypot(ndc.x,ndc.y)*8;
    if(rank<score){score=rank;best={s,t,point};}
  }
  if(!best)return null;
  if(previous&&previous.lineId===best.s.lineId&&previous.center.distanceTo(best.point)<8&&previous.plane.distanceToPoint(p)>.12)return previous;
  const line=hydrology.lines.find(l=>l.id===best.s.lineId);
  const distance=THREE.MathUtils.lerp(best.s.a.distance,best.s.b.distance,best.t),a=station(line,distance-7),b=station(line,distance+7);
  const tangent=b.clone().sub(a),horizontal=Math.hypot(tangent.x,tangent.z);
  const normal=new THREE.Vector3(-tangent.y*tangent.x/Math.max(.001,horizontal),horizontal,-tangent.y*tangent.z/Math.max(.001,horizontal)).normalize();
  const plane=new THREE.Plane().setFromNormalAndCoplanarPoint(normal,best.point);
  if(plane.distanceToPoint(p)<.12||plane.distanceToPoint(p)>WATER_REFLECTION_LIMITS.height)return null;
  return {id:best.s.id,lineId:best.s.lineId,center:best.point,plane,radius:WATER_REFLECTION_LIMITS.patchRadius,width:THREE.MathUtils.lerp(best.s.a.width,best.s.b.width,best.t)};
}

function targetSize(renderer){
  const size=renderer.getDrawingBufferSize(new THREE.Vector2()),scale=Math.min(1,WATER_REFLECTION_LIMITS.maxSize/Math.max(1,size.x,size.y));
  return [Math.max(1,Math.round(size.x*scale)),Math.max(1,Math.round(size.y*scale))];
}
function textureMatrix(camera){
  return new THREE.Matrix4().set(.5,0,0,.5,0,.5,0,.5,0,0,1,0,0,0,0,1).multiply(camera.projectionMatrix).multiply(camera.matrixWorldInverse);
}

export class LocalWaterReflection {
  constructor(hydrology,uniforms,{waterMaterials=[],preparedMatrices=new URLSearchParams(globalThis.location?.search||"").get("reflectionPreparedMatrices")!=="0"}={}){
    this.depthOrder=new ReflectionDepthOrder();this.preparedMatrices=preparedMatrices;
    this.hydrology=hydrology;this.uniforms=uniforms;this.waterMaterials=new Set(waterMaterials);
    this.target=null;this.patch=null;this.lastCapture=-Infinity;this.lastEligible=-Infinity;this.disposed=false;this.rendering=false;
    this.capturePosition=new THREE.Vector3(Infinity,Infinity,Infinity);this.captureQuaternion=new THREE.Quaternion();this.captureProjection=new THREE.Matrix4();
    this.stats={supported:null,active:false,captures:0,skipped:0,width:0,height:0,estimatedAttachmentBytes:0,lastCalls:0,lastTriangles:0,lastCPUms:0,reason:"not-rendered",patch:null,preparedMatrices,depthOrder:this.depthOrder.stats};
  }
  // Called by WorldWater.update before the main render. A cached image always
  // keeps its own capture matrix; a newer matrix must never sample an older image.
  prepare(camera){
    if(!this.target||!this.patch){this.uniforms.uRiverReflectionValid.value=0;return;}
    const position=camera.getWorldPosition(new THREE.Vector3()),rotation=camera.getWorldQuaternion(new THREE.Quaternion());
    const translation=position.distanceTo(this.capturePosition),angle=rotation.angleTo(this.captureQuaternion);
    const distance=Math.hypot(position.x-this.patch.center.x,position.z-this.patch.center.z),height=this.patch.plane.distanceToPoint(position);
    const sameProjection=camera.projectionMatrix.equals(this.captureProjection);
    this.uniforms.uRiverReflectionValid.value=sameProjection&&height>.1&&height<WATER_REFLECTION_LIMITS.height&&distance<WATER_REFLECTION_LIMITS.range?
      (1-smooth(translation,.15,.8))*(1-smooth(angle,.006,.045)):0;
  }
  _release(){
    if(this.target){const depth=this.target.depthTexture;this.target.depthTexture=null;this.target.dispose();depth.dispose();}
    this.target=null;this.patch=null;this.uniforms.uRiverReflectionMap.value=null;this.uniforms.uRiverReflectionSize.value.set(1,1);this.uniforms.uRiverReflectionValid.value=0;
    this.stats.active=false;this.stats.estimatedAttachmentBytes=0;
  }
  _allocate(renderer){
    const [width,height]=targetSize(renderer);
    if(this.target?.width===width&&this.target?.height===height)return false;
    this._release();
    const depth=new THREE.DepthTexture(width,height,THREE.FloatType);depth.name="local-water-float32-depth";
    this.target=new THREE.WebGLRenderTarget(width,height,{type:THREE.HalfFloatType,colorSpace:THREE.LinearSRGBColorSpace,
      minFilter:THREE.LinearMipmapLinearFilter,magFilter:THREE.LinearFilter,generateMipmaps:true,
      depthBuffer:true,stencilBuffer:false,depthTexture:depth,samples:0});
    this.target.texture.name="local-water-linear-hdr-reflection";
    this.uniforms.uRiverReflectionMap.value=this.target.texture;
    this.uniforms.uRiverReflectionSize.value.set(width,height);
    Object.assign(this.stats,{width,height,estimatedAttachmentBytes:Math.ceil(width*height*(8*4/3+4))});
    return true;
  }
  render(renderer,scene,camera,{now=performance.now()/1000,lightingRevision=0}={}){
    if(this.disposed)throw new Error("LocalWaterReflection has been disposed");
    if(this.rendering)return false;
    if(!Number.isFinite(now))throw new TypeError("Reflection clock must be finite seconds");
    const supported=!renderer.capabilities.logarithmicDepthBuffer&&renderer.extensions.has("EXT_color_buffer_float");
    this.stats.supported=supported;
    if(!supported){this._release();this.stats.reason="needs-standard-or-reversed-float-depth";return false;}
    const patch=selectWaterReflectionPatch(this.hydrology,camera,this.patch);
    if(!patch){
      this.uniforms.uRiverReflectionValid.value=0;this.stats.active=false;this.stats.reason="no-visible-near-water";this.stats.skipped++;
      if(now-this.lastEligible>WATER_REFLECTION_LIMITS.releaseAfter)this._release();return false;
    }
    this.lastEligible=now;
    const resized=this._allocate(renderer),position=camera.getWorldPosition(new THREE.Vector3()),rotation=camera.getWorldQuaternion(new THREE.Quaternion());
    const moved=position.distanceToSquared(this.capturePosition)>.025**2||rotation.angleTo(this.captureQuaternion)>.0015||!camera.projectionMatrix.equals(this.captureProjection);
    const changed=resized||patch!==this.patch||lightingRevision!==this.lightingRevision,age=now-this.lastCapture;
    if(!changed&&(age<WATER_REFLECTION_LIMITS.minInterval||(!moved&&age<WATER_REFLECTION_LIMITS.idleInterval))){this.stats.skipped++;this.stats.reason="cached";return false;}
    const mirror=createWaterReflectionCamera(camera,patch.plane);
    if(!mirror){this.uniforms.uRiverReflectionValid.value=0;this.stats.reason="unstable-oblique-plane";return false;}
    const r=renderer,start=performance.now(),hidden=[];
    const state={target:r.getRenderTarget(),face:r.getActiveCubeFace(),level:r.getActiveMipmapLevel(),viewport:r.getViewport(new THREE.Vector4()),currentViewport:r.getCurrentViewport?.(new THREE.Vector4()),scissor:r.getScissor(new THREE.Vector4()),scissorTest:r.getScissorTest(),
      color:r.getClearColor(new THREE.Color()),alpha:r.getClearAlpha(),autoClear:r.autoClear,autoClearColor:r.autoClearColor,autoClearDepth:r.autoClearDepth,autoClearStencil:r.autoClearStencil,
      xr:r.xr.enabled,shadowAuto:r.shadowMap.autoUpdate,shadowNeeds:r.shadowMap.needsUpdate,autoReset:r.info.autoReset,counters:Object.fromEntries(COUNTERS.map(k=>[k,r.info.render[k]]))};
    this.rendering=true;
    try{
      // Do not update world LODs, wind, environment or CSM with the mirror camera.
      // Its bounded frustum sees the real currently resident scene and cached sun maps.
      scene.updateMatrixWorld();
      const sphere=new THREE.Sphere();
      scene.traverseVisible(object=>{
        if(!object.isMesh&&!object.isLine&&!object.isPoints)return;
        const materials=Array.isArray(object.material)?object.material:[object.material];
        let hide=materials.some(m=>this.waterMaterials.has(m)||m?.userData?.waterReflectionSurface);
        if(!hide&&!object.isSky&&object.geometry){
          if(object.isInstancedMesh&&object.boundingSphere===null)object.computeBoundingSphere();
          if(!object.geometry.boundingSphere)object.geometry.computeBoundingSphere();
          const bounds=object.boundingSphere||object.geometry.boundingSphere;
          if(bounds){sphere.copy(bounds).applyMatrix4(object.matrixWorld);hide=sphere.center.distanceTo(patch.center)-sphere.radius>WATER_REFLECTION_LIMITS.sceneRadius;}
        }
        if(hide){hidden.push(object);object.visible=false;}
      });
      r.xr.enabled=false;r.shadowMap.autoUpdate=false;r.shadowMap.needsUpdate=false;r.info.autoReset=false;
      r.autoClear=false;r.setRenderTarget(this.target);r.setScissorTest(false);r.setClearColor(0,0);
      // Clear explicitly: the caller may have disabled an individual autoClear flag.
      r.clear(true,true,true);
      // Only visibility was changed since the propagation above. Keep that
      // propagation (main draw hooks may have moved objects), but avoid doing
      // it a second time inside this immediate mirror draw.
      this.stats.preparedMatrices=this.preparedMatrices;
      withPreparedWorldMatrices(scene,()=>this.depthOrder.run(r,scene,mirror,()=>r.render(scene,mirror)),this.preparedMatrices);
      this.stats.lastCalls=r.info.render.calls-state.counters.calls;this.stats.lastTriangles=r.info.render.triangles-state.counters.triangles;
      this.uniforms.uRiverReflectionMatrix.value.copy(textureMatrix(mirror));
      this.uniforms.uRiverReflectionPlane.value.set(patch.plane.normal.x,patch.plane.normal.y,patch.plane.normal.z,patch.plane.constant);
      this.uniforms.uRiverReflectionPatch.value.set(patch.center.x,patch.center.z,patch.radius);
      this.uniforms.uRiverReflectionValid.value=1;
      this.patch=patch;this.capturePosition.copy(position);this.captureQuaternion.copy(rotation);this.captureProjection.copy(camera.projectionMatrix);
      this.lastCapture=now;this.lightingRevision=lightingRevision;
      Object.assign(this.stats,{active:true,captures:this.stats.captures+1,reason:"captured",patch:patch.id,lastCPUms:performance.now()-start});
      return true;
    }catch(error){this.uniforms.uRiverReflectionValid.value=0;this.stats.active=false;this.stats.reason="capture-failed";throw error;
    }finally{
      hidden.forEach(o=>{o.visible=true;});
      r.xr.enabled=state.xr;r.shadowMap.autoUpdate=state.shadowAuto;r.shadowMap.needsUpdate=state.shadowNeeds;
      r.setClearColor(state.color,state.alpha);
      // Restore logical canvas policy first; binding the caller target then
      // reinstates its physical viewport/scissor (which can differ from canvas).
      r.setViewport(state.viewport);r.setScissor(state.scissor);r.setScissorTest(state.scissorTest);r.setRenderTarget(state.target,state.face,state.level);
      if(state.currentViewport)r.state.viewport(state.currentViewport);
      r.autoClear=state.autoClear;r.autoClearColor=state.autoClearColor;r.autoClearDepth=state.autoClearDepth;r.autoClearStencil=state.autoClearStencil;
      r.info.autoReset=state.autoReset;Object.assign(r.info.render,state.counters);
      // Keep info.render.frame monotonic: Three uses it as its GPU upload epoch.
      this.rendering=false;
    }
  }
  dispose(){if(this.disposed)return;this._release();this.waterMaterials.clear();this.disposed=true;}
}
