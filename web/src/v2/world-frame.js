import * as THREE from "three";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { compilePreparedWorld } from "./shader-readiness.js";
import { compileVisibleWorld } from "./compile-visible-world.js";

export function supportsWorldFrame(renderer) {
  return Boolean(renderer.capabilities.reversedDepthBuffer &&
    renderer.extensions.has("EXT_color_buffer_float"));
}

function sampleCount(renderer, requested) {
  const cap = Math.min(4, Math.max(0, Math.floor(requested)), renderer.capabilities.maxSamples);
  if (cap < 1) return 0;
  const gl = renderer.getContext();
  // MAX_SAMPLES alone does not promise this count for both attachment formats.
  const color = gl.getInternalformatParameter(gl.RENDERBUFFER, gl.RGBA16F, gl.SAMPLES);
  const depth = new Set(gl.getInternalformatParameter(gl.RENDERBUFFER, gl.DEPTH_COMPONENT32F, gl.SAMPLES));
  return Math.max(0, ...Array.from(color).filter(n => n <= cap && depth.has(n)));
}

function difference(after, before) {
  return Object.fromEntries(["calls", "triangles", "points", "lines"].map(k => [k, after[k] - before[k]]));
}

// Keep the complete geographic camera range in a real Float32 depth attachment.
// OutputPass performs the renderer's existing tone mapping and output conversion.
export class WorldFrame {
  constructor(renderer, { samples = 4 } = {}) {
    if (!supportsWorldFrame(renderer)) throw new Error("WorldFrame requires reversed depth and float color rendering.");
    this.renderer = renderer;
    const size = renderer.getDrawingBufferSize(new THREE.Vector2());
    const depth = new THREE.DepthTexture(size.x, size.y, THREE.FloatType);
    depth.name = "world-float32-depth";
    this.target = new THREE.WebGLRenderTarget(size.x, size.y, {
      type: THREE.HalfFloatType, format: THREE.RGBAFormat, colorSpace: THREE.LinearSRGBColorSpace,
      minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, generateMipmaps: false,
      depthBuffer: true, stencilBuffer: false, depthTexture: depth,
      samples: sampleCount(renderer, samples),
      // No pass samples depth: avoid a redundant depth resolve, while the MSAA
      // depth renderbuffer still derives DEPTH_COMPONENT32F from depth.type.
      resolveDepthBuffer: false, resolveStencilBuffer: false,
      storeMultisampledDepthBuffer: false, storeMultisampledStencilBuffer: false
    });
    this.target.texture.name = "world-linear-hdr-color";
    this.output = new OutputPass();
    this.output.renderToScreen = true;
    this.output.material.depthTest = false;
    this.output.material.depthWrite = false;
    this.output.material.blending = THREE.NoBlending;
    this.output.material.toneMapped = false;
    this.disposed = false;
    this.stats = {
      enabled: true, frames: 0, width: size.x, height: size.y, samples: this.target.samples,
      colorFormat: "RGBA16F", depthFormat: "DEPTH_COMPONENT32F",
      scene: null, output: null, total: null, estimatedAttachmentBytes: 0
    };
    this._updateBytes();
  }

  _updateBytes() {
    const { width, height, samples } = this.stats;
    this.stats.estimatedAttachmentBytes = width * height * (12 + (samples > 0 ? samples * 12 : 0));
  }

  // Physical drawing-buffer pixels; callers must not apply DPR a second time.
  setSize(width, height) {
    if (this.disposed) throw new Error("WorldFrame has been disposed.");
    if (!Number.isFinite(width) || !Number.isFinite(height)) throw new TypeError("WorldFrame size must be finite.");
    width = Math.max(1, Math.floor(width)); height = Math.max(1, Math.floor(height));
    this.target.setSize(width, height);
    this.output.setSize(width, height);
    this.stats.width = width; this.stats.height = height; this._updateBytes();
  }

  // Three chooses output colour space and tone-mapping defines from the bound
  // target during the synchronous compile kickoff. Match the actual HDR draw,
  // then restore immediately: never retain global renderer state across await.
  compileAsync(scene, camera, options) {
    if (this.disposed) throw new Error("WorldFrame has been disposed.");
    const r=this.renderer,previous=r.getRenderTarget();
    const face=r.getActiveCubeFace(),level=r.getActiveMipmapLevel();
    try {
      r.setRenderTarget(this.target);
      return compileVisibleWorld(r,scene,camera,options);
    } finally {
      r.setRenderTarget(previous,face,level);
    }
  }

  // Reuse OutputPass's own define setup, but substitute compilation for the
  // final quad draw. No pixels are rendered and no private quad API is read.
  compileOutputAsync() {
    if (this.disposed) throw new Error("WorldFrame has been disposed.");
    const r=this.renderer, previous=r.getRenderTarget();
    const face=r.getActiveCubeFace(), level=r.getActiveMipmapLevel();
    let pending;
    const compiler={
      outputColorSpace:r.outputColorSpace, toneMapping:r.toneMapping,
      toneMappingExposure:r.toneMappingExposure,
      setRenderTarget:target=>r.setRenderTarget(target),
      render:(mesh,camera)=>{pending=compilePreparedWorld(r,mesh,camera,new THREE.Scene());}
    };
    try {
      this.output.render(compiler,null,this.target);
      if(!pending)throw new Error("OutputPass did not expose its compile draw.");
      return pending;
    } finally {r.setRenderTarget(previous,face,level);}
  }

  render(scene, camera) {
    if (this.disposed) throw new Error("WorldFrame has been disposed.");
    const r = this.renderer, previous = r.getRenderTarget();
    const face = r.getActiveCubeFace(), level = r.getActiveMipmapLevel();
    const autoClear = r.autoClear, autoReset = r.info.autoReset;
    try {
      r.autoClear = true;
      r.info.autoReset = false;
      if (autoReset) r.info.reset();
      const before = { ...r.info.render };
      r.setRenderTarget(this.target);
      r.render(scene, camera);
      this.stats.scene = difference(r.info.render, before);
      const afterScene = { ...r.info.render };
      // A separate full-screen mesh has no main-scene lights or shadow casters.
      this.output.render(r, null, this.target);
      this.stats.output = difference(r.info.render, afterScene);
      this.stats.total = difference(r.info.render, before);
      this.stats.frames++;
    } finally {
      r.setRenderTarget(previous, face, level);
      r.autoClear = autoClear;
      r.info.autoReset = autoReset;
    }
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    // Detach first: WebGLTextures normally disposes an attached depth texture
    // when its target is disposed; explicit ownership avoids double disposal.
    const depth = this.target.depthTexture;
    this.target.depthTexture = null;
    this.target.dispose();
    depth.dispose();
    this.output.dispose();
    this.stats.enabled = false;
    this.stats.estimatedAttachmentBytes = 0;
  }
}
