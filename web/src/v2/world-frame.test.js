import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as THREE from "three";
import { WorldFrame, supportsWorldFrame } from "./world-frame.js";

function fixture({ reversed = true, float = true, maxSamples = 8, color = [8, 4, 2], depth = [4, 2] } = {}) {
  const calls = [], previous = { previous: true };
  const gl = {
    RENDERBUFFER: 1, RGBA16F: 2, DEPTH_COMPONENT32F: 3, SAMPLES: 4,
    getInternalformatParameter(target, format) { return Int32Array.from(format === this.RGBA16F ? color : depth); }
  };
  const r = {
    capabilities: { reversedDepthBuffer: reversed, maxSamples }, extensions: { has: () => float },
    autoClear: false, target: previous, face: 2, level: 1,
    outputColorSpace: THREE.SRGBColorSpace, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: .85,
    info: { autoReset: true, render: { frame: 0, calls: 99, triangles: 999, points: 0, lines: 0 },
      reset() { Object.assign(this.render, { calls: 0, triangles: 0, points: 0, lines: 0 }); } },
    getContext: () => gl, getDrawingBufferSize: v => v.set(600, 400),
    getRenderTarget() { return this.target; }, getActiveCubeFace() { return this.face; }, getActiveMipmapLevel() { return this.level; },
    setRenderTarget(target, face = 0, level = 0) { this.target = target; this.face = face; this.level = level; },
    render(object, camera) {
      calls.push({ object, camera, target: this.target, autoClear: this.autoClear });
      if (this.failOn === calls.length) throw new Error("render failure");
      if (this.info.autoReset) this.info.reset();
      this.info.render.frame++;
      this.info.render.calls += object.isScene ? 31 : 1;
      this.info.render.triangles += object.isScene ? 250 : 1;
    }
  };
  return { r, gl, calls, previous };
}

test("float world target requires both features and selects common color/depth MSAA samples", () => {
  for (const options of [{ reversed: false }, { float: false }]) {
    const { r } = fixture(options); assert.equal(supportsWorldFrame(r), false);
    assert.throws(() => new WorldFrame(r), /requires reversed depth/);
  }
  for (const [options, samples] of [[{}, 4], [{ maxSamples: 2 }, 2], [{ depth: [2] }, 2], [{ depth: [] }, 0]]) {
    const { r } = fixture(options), frame = new WorldFrame(r);
    assert.equal(frame.target.samples, samples);
    assert.equal(frame.target.texture.type, THREE.HalfFloatType);
    assert.equal(frame.target.texture.colorSpace, THREE.LinearSRGBColorSpace);
    assert.equal(frame.target.depthTexture.type, THREE.FloatType);
    assert.equal(frame.target.depthTexture.format, THREE.DepthFormat);
    assert.equal(frame.target.resolveDepthBuffer, false);
    assert.equal(frame.output.material.depthTest, false);
    frame.dispose();
  }
});

test("one main scene and one output render preserve full-frame counts, tone mapping and caller target", () => {
  for (const autoReset of [false, true]) {
    const f = fixture(), frame = new WorldFrame(f.r), scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(52, 1.5, .25, 150000);
    camera._reversedDepth = true; camera.updateProjectionMatrix();
    const projection = camera.projectionMatrix.clone();
    f.r.info.autoReset = autoReset;
    frame.render(scene, camera);
    assert.equal(f.calls.length, 2);
    assert.equal(f.calls[0].object, scene); assert.equal(f.calls[0].target, frame.target);
    assert.equal(f.calls[1].object.isMesh, true); assert.equal(f.calls[1].target, null);
    assert.equal(f.calls.filter(c => c.object === scene).length, 1);
    assert.ok(f.calls.every(c => c.autoClear));
    assert.deepEqual(frame.stats.scene, { calls: 31, triangles: 250, points: 0, lines: 0 });
    assert.deepEqual(frame.stats.output, { calls: 1, triangles: 1, points: 0, lines: 0 });
    assert.equal(frame.stats.total.calls, 32);
    assert.equal(f.r.info.render.calls, autoReset ? 32 : 131);
    assert.equal(f.r.info.autoReset, autoReset); assert.equal(f.r.autoClear, false);
    assert.equal(f.r.target, f.previous); assert.equal(f.r.face, 2); assert.equal(f.r.level, 1);
    assert.equal(frame.output.uniforms.tDiffuse.value, frame.target.texture);
    assert.equal(frame.output.uniforms.toneMappingExposure.value, .85);
    assert.ok("ACES_FILMIC_TONE_MAPPING" in frame.output.material.defines);
    assert.ok("SRGB_TRANSFER" in frame.output.material.defines);
    assert.deepEqual(camera.projectionMatrix, projection); assert.equal(camera.near, .25); assert.equal(camera.far, 150000);
    frame.dispose();
  }
});

test("main or output failure restores render target and renderer policies", () => {
  for (const failOn of [1, 2]) {
    const f = fixture(), frame = new WorldFrame(f.r); f.r.failOn = failOn;
    assert.throws(() => frame.render(new THREE.Scene(), new THREE.PerspectiveCamera()), /render failure/);
    assert.equal(f.r.target, f.previous); assert.equal(f.r.face, 2); assert.equal(f.r.level, 1);
    assert.equal(f.r.autoClear, false); assert.equal(f.r.info.autoReset, true); assert.equal(frame.stats.frames, 0);
    frame.dispose();
  }
});

test("physical resize and idempotent disposal release owned target, depth and output material", () => {
  const f = fixture(), frame = new WorldFrame(f.r);
  frame.setSize(1200, 800);
  assert.equal(frame.target.width, 1200); assert.equal(frame.target.height, 800);
  assert.equal(frame.stats.estimatedAttachmentBytes, 1200 * 800 * 60);
  const counts = [0, 0, 0];
  [frame.target, frame.target.depthTexture, frame.output.material].forEach((v, i) => v.addEventListener("dispose", () => counts[i]++));
  frame.dispose(); frame.dispose();
  assert.deepEqual(counts, [1, 1, 1]); assert.equal(frame.stats.estimatedAttachmentBytes, 0);
  assert.throws(() => frame.render(new THREE.Scene(), new THREE.PerspectiveCamera()), /disposed/);
  assert.throws(() => frame.setSize(600, 400), /disposed/);
});

test("installed Three MSAA depth allocator requests DEPTH_COMPONENT32F from this target", () => {
  // Execute the installed allocator, not a reimplementation. Recording GL calls
  // verifies the JS allocation path; the browser still verifies physical FBOs.
  const source = readFileSync(new URL("../../node_modules/three/src/renderers/webgl/WebGLTextures.js", import.meta.url), "utf8");
  function extract(name) {
    const start = source.indexOf("\tfunction " + name + "(");
    assert.ok(start >= 0, "installed allocator " + name);
    return source.slice(start, source.indexOf("\n\tfunction ", start + 10));
  }
  const storage = [], gl = {
    RENDERBUFFER: 1, FRAMEBUFFER: 2, DEPTH_ATTACHMENT: 3, DEPTH_STENCIL_ATTACHMENT: 4,
    DEPTH_COMPONENT24: 24, DEPTH_COMPONENT32F: 32,
    bindRenderbuffer() {}, framebufferRenderbuffer() {},
    renderbufferStorageMultisample(...args) { storage.push(args); }
  };
  const dependencies = ["_gl", "capabilities", "FloatType", "UnsignedIntType", "UnsignedInt248Type", "UnsignedShortType", "useMultisampledRTT"];
  const allocate = new Function(...dependencies, extract("getInternalDepthFormat") + extract("getRenderTargetSamples") + extract("setupRenderBufferStorage") + "\nreturn setupRenderBufferStorage;")
    (gl, { maxSamples: 4 }, THREE.FloatType, THREE.UnsignedIntType, THREE.UnsignedInt248Type, THREE.UnsignedShortType, () => false);
  const frame = new WorldFrame(fixture().r);
  allocate({}, frame.target, true);
  assert.deepEqual(storage[0], [gl.RENDERBUFFER, 4, gl.DEPTH_COMPONENT32F, 600, 400]);
  // The same half-float color target without a typed depth attachment falls back
  // to D24, documenting the regression that motivated this explicit target.
  const depth = frame.target.depthTexture; frame.target.depthTexture = null;
  allocate({}, frame.target, true);
  assert.equal(storage[1][2], gl.DEPTH_COMPONENT24);
  frame.target.depthTexture = depth; frame.dispose();
});


test("precompile uses the real HDR target and restores caller state before async completion",async()=>{
  const f=fixture(),frame=new WorldFrame(f.r),scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(),material={};let ready=false;
  const program={program:{},isReady:()=>ready};
  f.gl.isContextLost=()=>false;f.gl.getProgramParameter=()=>true;
  f.r.info.programs=[];f.r.properties={get:()=>({programs:new Map([["current",program]])})};
  f.r.compile=(s,c,target)=>{assert.equal(s.name,"world-precompile-selection");assert.equal(target,scene);assert.equal(c,camera);assert.equal(f.r.target,frame.target);f.r.info.programs.push(program);return new Set([material]);};
  const result=frame.compileAsync(scene,camera);
  assert.equal(f.r.target,f.previous);assert.equal(f.r.face,2);assert.equal(f.r.level,1);
  assert.equal(f.r.toneMapping,THREE.ACESFilmicToneMapping);assert.equal(f.r.outputColorSpace,THREE.SRGBColorSpace);
  ready=true;const input=await result;assert.equal(input.name,"world-precompile-selection");assert.equal(input.userData.compileReadiness.status,"complete");frame.dispose();
});

test("precompile restores target for synchronous and asynchronous failures",async()=>{
  for(const asyncFailure of[false,true]){
    const f=fixture(),frame=new WorldFrame(f.r),error=new Error("compile failed");
    const program={program:{},isReady(){throw error;}};f.r.info.programs=[];f.gl.isContextLost=()=>false;
    f.r.compile=()=>{if(!asyncFailure)throw error;f.r.info.programs.push(program);return new Set();};
    if(asyncFailure)await assert.rejects(frame.compileAsync(new THREE.Scene(),new THREE.PerspectiveCamera()),e=>e===error);
    else assert.throws(()=>frame.compileAsync(new THREE.Scene(),new THREE.PerspectiveCamera()),e=>e===error);
    assert.equal(f.r.target,f.previous);assert.equal(f.r.face,2);assert.equal(f.r.level,1);frame.dispose();
  }
});

test("output compilation reuses actual OutputPass defines without drawing and restores target before readiness",async()=>{
 for(const toneMapping of [THREE.ACESFilmicToneMapping,THREE.LinearToneMapping]){
  const f=fixture(),frame=new WorldFrame(f.r);f.r.toneMapping=toneMapping;
  let ready=false,compiled;
  const program={program:{},isReady:()=>ready};
  f.gl.isContextLost=()=>false;f.gl.getProgramParameter=()=>true;
  f.r.info.programs=[];f.r.properties={get:()=>({programs:new Map([['output',program]])})};
  f.r.compile=(mesh,camera,target)=>{compiled={mesh,camera,defines:{...mesh.material.defines}};assert.equal(mesh.material,frame.output.material);assert.equal(target.isScene,true);assert.equal(target.children.length,0);assert.equal(target.fog,null);assert.equal(f.r.target,null);f.r.info.programs.push(program);return new Set([mesh.material]);};
  const pending=frame.compileOutputAsync();assert.equal(f.calls.length,0);assert.equal(f.r.target,f.previous);assert.equal(f.r.face,2);assert.equal(f.r.level,1);
  ready=true;await pending;const defines={...frame.output.material.defines};
  frame.render(new THREE.Scene(),new THREE.PerspectiveCamera());
  assert.deepEqual(compiled.defines,defines);assert.deepEqual(frame.output.material.defines,defines);assert.ok('SRGB_TRANSFER' in defines);
  assert.ok((toneMapping===THREE.ACESFilmicToneMapping?'ACES_FILMIC_TONE_MAPPING':'LINEAR_TONE_MAPPING')in defines);
  assert.equal(f.calls.length,2);assert.equal(f.calls[1].object,compiled.mesh);assert.equal(f.calls[1].camera,compiled.camera);frame.dispose();
 }
});
test("output compile failure restores the caller and does not submit any pixels",async()=>{
 for(const asynchronous of [false,true]){
  const f=fixture(),frame=new WorldFrame(f.r),error=new Error('output link failed');f.r.info.programs=[];f.gl.isContextLost=()=>false;
  f.r.compile=()=>{if(!asynchronous)throw error;f.r.info.programs.push({program:{},isReady(){throw error;}});return new Set();};
  if(asynchronous)await assert.rejects(frame.compileOutputAsync(),e=>e===error);else assert.throws(()=>frame.compileOutputAsync(),e=>e===error);
  assert.equal(f.calls.length,0);assert.equal(f.r.target,f.previous);assert.equal(f.r.face,2);assert.equal(f.r.level,1);frame.dispose();
 }
});
