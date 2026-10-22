// A bounded task queue around Three's public initTexture. This uploads the
// same sampler resources used by compiled materials while program links run;
// it never draws or creates substitute textures. One upload can still block.
function collectValue(value, textures, seen) {
  if (!value || typeof value !== "object") return;
  if (value.isTexture) { textures.add(value); return; }
  if (seen.has(value) || ArrayBuffer.isView(value)) return;
  seen.add(value);
  if (Array.isArray(value)) for (const item of value) collectValue(item, textures, seen);
  else if (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null)
    for (const item of Object.values(value)) collectValue(item, textures, seen);
}

export class CompileTextureQueue {
  constructor(renderer, materials, now) {
    if (typeof renderer.initTexture !== "function") throw new Error("Texture preparation requires renderer.initTexture.");
    this.renderer = renderer; this.now = now; this.start = now(); this.next = 0;
    const textures = new Set(), seen = new Set();
    for (const material of materials) {
      for (const value of Object.values(material)) if (value?.isTexture) textures.add(value);
      for (const uniforms of [material.uniforms, renderer.properties.get(material)?.uniforms])
        if (uniforms) for (const uniform of Object.values(uniforms)) collectValue(uniform?.value, textures, seen);
    }
    this.textures = [...textures];
    this.stats = { selected: textures.size, initialized: 0, alreadyInitialized: 0, skipped: 0,
      uploadTotalMs: 0, maxUploadMs: 0, elapsedMs: 0, status: textures.size ? "waiting" : "complete" };
  }
  get pending() { return this.next < this.textures.length; }
  step() {
    const began = this.now(); let processed = 0;
    while (this.pending && processed < 8 && this.now() - began < 4) {
      const texture = this.textures[this.next++]; processed++;
      // Render targets and dynamic/external inputs have their own lifecycle.
      // Version zero would not upload during the real draw either.
      if (texture.isRenderTargetTexture || texture.isDepthTexture || texture.isVideoTexture || texture.isExternalTexture || texture.version === 0) {
        this.stats.skipped++; continue;
      }
      const state = this.renderer.properties.get(texture);
      if (state.__version === texture.version) { this.stats.alreadyInitialized++; continue; }
      if (texture.image == null || texture.image.complete === false || texture.source?.dataReady === false)
        throw new Error("Texture preparation needs decoded image data: " + (texture.name || texture.uuid));
      const start = this.now();
      try { this.renderer.initTexture(texture); }
      finally {
        const duration = this.now() - start;
        this.stats.uploadTotalMs += duration; this.stats.maxUploadMs = Math.max(this.stats.maxUploadMs, duration);
      }
      // Do not report success when Three only warned and skipped an upload.
      if (state.__version !== texture.version) throw new Error("Texture initialization did not complete: " + (texture.name || texture.uuid));
      this.stats.initialized++;
    }
    this.stats.elapsedMs = this.now() - this.start;
    if (!this.pending) this.stats.status = "complete";
  }
  fail() { this.stats.status = "failed"; this.stats.elapsedMs = this.now() - this.start; }
}
