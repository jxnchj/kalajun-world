import test from "node:test";
import assert from "node:assert/strict";
import { DataTexture, Texture, WebGLRenderTarget, DepthTexture, Vector3 } from "three";
import { CompileTextureQueue } from "./compile-textures.js";

function fixture() {
  let time = 0; const states = new WeakMap(), uploads = [];
  const renderer = { properties: { get(value) { let state = states.get(value); if (!state) { state = {}; states.set(value, state); } return state; } },
    initTexture(texture) { uploads.push(texture); time += 1; this.properties.get(texture).__version = texture.version; } };
  const now = () => time;
  return { renderer, uploads, now, queue: materials => new CompileTextureQueue(renderer, materials, now) };
}
function data(name) { const t = new DataTexture(new Uint8Array(4), 1, 1); t.name = name; t.needsUpdate = true; return t; }
function finish(queue) { while (queue.pending) queue.step(); }

test("custom shader sampler arrays and structs are included, with identity deduplication and cyclic guards", () => {
  const f = fixture(), a = data("direct"), b = data("injected"), c = data("array");
  const nested = { a: b, layers: [c, a], axis: new Vector3(1, 2, 3) }; nested.cycle = nested;
  const material = { map: a, uniforms: { one: { value: a } } };
  f.renderer.properties.get(material).uniforms = { generated: { value: nested } };
  const before = [a, b, c].map(t => [t.version, t.source.version, t.image.data.slice()]);
  const queue = f.queue([material]); finish(queue);
  assert.deepEqual(f.uploads, [a, b, c]); assert.equal(queue.stats.selected, 3); assert.equal(queue.stats.initialized, 3);
  assert.deepEqual([a, b, c].map(t => [t.version, t.source.version, t.image.data.slice()]), before, "upload scheduling does not edit texture content or revisions");
});

test("colour/depth queues reuse actual initialized versions and still upload a subsequent texture revision", () => {
  const f = fixture(), texture = data("shared"), material = { map: texture };
  const colour = f.queue([material]), shadow = f.queue([material]);
  finish(colour); finish(shadow); assert.equal(f.uploads.length, 1); assert.equal(shadow.stats.alreadyInitialized, 1);
  texture.needsUpdate = true; const changed = f.queue([material]); finish(changed);
  assert.equal(f.uploads.length, 2); assert.equal(changed.stats.initialized, 1);
  const clone = texture.clone(); clone.wrapS = 1000; const distinct = f.queue([{ map: clone }]); finish(distinct);
  assert.equal(f.uploads.length, 3, "same image/source may still require a different sampler state");
});

test("render targets, depth, video, external and version-zero textures retain their actual rendering lifecycle", () => {
  const f = fixture(), target = new WebGLRenderTarget(1, 1), depth = new DepthTexture(1, 1), video = data("video"), external = data("external"), unused = new Texture();
  video.isVideoTexture = true; external.isExternalTexture = true;
  const list = [target.texture, depth, video, external, unused], queue = f.queue([{ uniforms: { dynamic: { value: list } } }]);
  finish(queue); assert.equal(queue.stats.skipped, 5); assert.equal(f.uploads.length, 0); target.dispose();
});

test("missing decode and silent initializer failure cannot be marked successfully prepared", () => {
  const f = fixture(), absent = new Texture(); absent.needsUpdate = true;
  assert.throws(() => f.queue([{ map: absent }]).step(), /decoded image data/);
  const incomplete = new Texture({ complete: false }); incomplete.needsUpdate = true;
  assert.throws(() => f.queue([{ map: incomplete }]).step(), /decoded image data/);
  const valid = data("silently skipped"); f.renderer.initTexture = () => {};
  assert.throws(() => f.queue([{ map: valid }]).step(), /did not complete/);
});

test("queue yields after its work budget without imposing a false hard bound on one upload", () => {
  const f = fixture(), textures = Array.from({ length: 11 }, (_, i) => data(String(i))), queue = f.queue([{ uniforms: { textures: { value: textures } } }]);
  queue.step(); assert.equal(f.uploads.length, 4); assert.equal(queue.pending, true);
  finish(queue); assert.equal(queue.stats.initialized, 11); assert.equal(queue.stats.uploadTotalMs, 11); assert.equal(queue.stats.maxUploadMs, 1);
});
