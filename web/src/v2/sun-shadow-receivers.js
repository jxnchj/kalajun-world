import { Frustum, Matrix4, PCFShadowMap, Plane, Vector3 } from "three";

// A receiver r has n.r+d >= 0 in each camera half-space. Its possible
// directional-light casters r+t*sun, t >= 0, still satisfy every plane whose
// n.sun >= 0. Dropping the other planes is a SUPERSET of the infinite light
// extrusion. Keep the union of the main and reflected receiver domains.
export function sunReceiverHalfspaces(camera, towardSun) {
  const f = new Frustum().setFromProjectionMatrix(
    new Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse),
    camera.coordinateSystem, camera.reversedDepth);
  return f.planes.filter(p => p.normal.dot(towardSun) > 1e-10).map(p => p.clone());
}

// The material selects CSM weights using MAIN-view depth, even in a mirror.
// Installed CSMShader expands the two closest edges by edge^2 / 8 when fading.
// Retain the last far half-space as infinite: no assumption about its tail is
// necessary to remove irrelevant casters from the earlier cascades.
export function csmReceiverDepthRanges(camera, csm) {
  if (!csm || !Array.isArray(csm.breaks) || !csm.breaks.length
      || !Number.isFinite(csm.maxFar) || !Number.isFinite(camera.far) || !Number.isFinite(camera.near)) return null;
  const span = Math.min(csm.maxFar, camera.far) - camera.near;
  if (!(span > 0)) return null;
  let previous = 0;
  const ranges = [];
  for (let i = 0; i < csm.breaks.length; i++) {
    const end = csm.breaks[i];
    if (!Number.isFinite(end) || end <= previous || end > 1) return null;
    const lower = previous - (csm.fade ? previous * previous / 8 : 0);
    const upper = end + (csm.fade ? end * end / 8 : 0);
    ranges.push([lower * span, i === csm.breaks.length - 1 ? Infinity : upper * span]);
    previous = end;
  }
  return ranges;
}

function receiverDepthPlanes(camera, range) {
  const e = camera.matrixWorldInverse.elements;
  if (!e.every(Number.isFinite)) return null;
  // Positive signed depth is -view.z. Normalize so the existing world-space
  // filter/bias margin also widens these new slab boundaries correctly.
  const lower = new Plane(new Vector3(-e[2], -e[6], -e[10]), -e[14] - range[0]);
  if (!(lower.normal.lengthSq() > 1e-12)) return null;
  const planes = [lower.normalize()];
  if (Number.isFinite(range[1])) planes.push(new Plane(new Vector3(e[2], e[6], e[10]), e[14] + range[1]).normalize());
  return planes;
}

export function sunReceiverDepthHalfspaces(camera, towardSun, range) {
  return receiverDepthPlanes(camera, range)?.filter(p => p.normal.dot(towardSun) > 1e-10) || null;
}

const dotRoundoff = (normal, sun) => 32 * Number.EPSILON * (Math.abs(normal.x * sun.x) + Math.abs(normal.y * sun.y) + Math.abs(normal.z * sun.z));

// Eliminate the free light-axis coordinate from the receiver inequalities.
// If P.sun=a>0 and N.sun=-b<0, then a*N+b*P is a valid receiver support plane
// perpendicular to sun. It stays valid for EVERY r+t*sun (t>=0), including an
// oblique mirror domain with an open far end. No finite-vertex assumption.
export function sunReceiverProjectionHalfspaces(camera, mainCamera, towardSun, range) {
  const depth = receiverDepthPlanes(mainCamera, range);
  if (!depth) return null;
  const f = new Frustum().setFromProjectionMatrix(new Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse), camera.coordinateSystem, camera.reversedDepth);
  const input = [...depth, ...f.planes], positive = [], negative = [], retained = [], projected = [];
  for (const plane of input) {
    const n = plane.normal;
    if (![n.x, n.y, n.z, plane.constant].every(Number.isFinite) || !(n.lengthSq() > .5)) return null;
    const slope = n.dot(towardSun), error = dotRoundoff(n, towardSun);
    // Never classify a small negative slope as zero. Retain near-orthogonal
    // faces only when their sign is safe (including structural exact zero).
    if (slope >= error) retained.push(plane.clone());
    if (slope > 1e-8) positive.push({ plane, slope });
    else if (slope < -1e-8) negative.push({ plane, slope });
  }
  for (const neg of negative) for (const pos of positive) {
    const a = pos.slope, b = -neg.slope, scale = Math.max(a, b), wn = a / scale;
    let wp = b / scale, candidate = null;
    for (let retry = 0; retry < 3; retry++) {
      const normal = neg.plane.normal.clone().multiplyScalar(wn).addScaledVector(pos.plane.normal, wp), length = normal.length();
      if (!(length > 1e-8)) break;
      const slope = normal.dot(towardSun), error = dotRoundoff(normal, towardSun) + length * 1e-13;
      if (slope >= error) {
        const raw = wn * neg.plane.constant + wp * pos.plane.constant;
        const guard = .02 + 64 * Number.EPSILON * (Math.abs(wn * neg.plane.constant) + Math.abs(wp * pos.plane.constant)) / length;
        candidate = new Plane(normal.multiplyScalar(1 / length), raw / length + guard);
        // Normalization must not turn the certified lightward slope negative.
        if (candidate.normal.dot(towardSun) < dotRoundoff(candidate.normal, towardSun)) candidate = null;
        break;
      }
      // Increase only the NONNEGATIVE coefficient of an original positive
      // plane. This tiny lightward tilt remains valid for unbounded receivers;
      // rotating a plane normal alone would not have that guarantee.
      wp += (4 * error - slope) / a;
    }
    if (candidate) projected.push(candidate);
  }
  return [...projected, ...retained];
}

const MAIN_DEPTH_ELEMENTS = [2, 6, 10, 14];
function cachedProjection(record, camera, mainCamera, sun, range, stats) {
  const p = camera.projectionMatrix.elements, v = camera.matrixWorldInverse.elements, m = mainCamera.matrixWorldInverse.elements;
  let changed = !record.ready || record.coordinateSystem !== camera.coordinateSystem || record.reversedDepth !== camera.reversedDepth;
  for (let i = 0; i < 16 && !changed; i++) changed = record.values[i] !== p[i] || record.values[16 + i] !== v[i];
  for (let i = 0; i < 4 && !changed; i++) changed = record.values[32 + i] !== m[MAIN_DEPTH_ELEMENTS[i]];
  if (!changed) changed = record.values[36] !== range[0] || record.values[37] !== range[1]
    || record.values[38] !== sun.x || record.values[39] !== sun.y || record.values[40] !== sun.z;
  if (changed) {
    record.planes = sunReceiverProjectionHalfspaces(camera, mainCamera, sun, range);
    record.values.set(p, 0); record.values.set(v, 16);
    for (let i = 0; i < 4; i++) record.values[32 + i] = m[MAIN_DEPTH_ELEMENTS[i]];
    record.values[36] = range[0]; record.values[37] = range[1]; record.values[38] = sun.x; record.values[39] = sun.y; record.values[40] = sun.z;
    record.coordinateSystem = camera.coordinateSystem; record.reversedDepth = camera.reversedDepth; record.ready = true; stats.projectionBuilds++;
  }
  return record.planes;
}

export function sunReceiverFilterMargin(shadow) {
  const c = shadow.camera, width = Math.abs(c.right - c.left), height = Math.abs(c.top - c.bottom);
  // Installed Three PCF rotates a unit Vogel disk, radius in UV uses mapSize.x.
  // Add a full bilinear footprint, arbitrary normal-bias direction, depth-bias
  // displacement and numerical headroom. This widens culling only; no map,
  // filtering, caster bound or lighting parameter is changed.
  return Math.abs(shadow.radius) * Math.max(width, height) / shadow.mapSize.x
    + Math.hypot(width / shadow.mapSize.x, height / shadow.mapSize.y)
    + Math.abs(shadow.normalBias) + Math.abs(shadow.bias) * Math.abs(c.far - c.near) + .02;
}

export function boxMayReachSunReceivers(box, domains, margin = 0) {
  if (!domains.length || !Number.isFinite(margin)
      || ![box.min.x, box.min.y, box.min.z, box.max.x, box.max.y, box.max.z].every(Number.isFinite)) return true;
  for (const planes of domains) {
    let outside = false;
    for (const p of planes) {
      const n = p.normal;
      const d = n.x * (n.x > 0 ? box.max.x : box.min.x)
        + n.y * (n.y > 0 ? box.max.y : box.min.y)
        + n.z * (n.z > 0 ? box.max.z : box.min.z) + p.constant;
      if (d < -margin) { outside = true; break; }
    }
    if (!outside) return true;
  }
  return false;
}

// The wrapper owns its effective receiver domains. Publish an exact semantic
// revision once per update, independent of stats resets and array identities.
// The actual six light-frustum planes remain a separate, live part of the key.
function updateReceiverCullState(state, active, domains, margin) {
  if (!state) return;
  let at = 0, changed = false;
  const put = value => { if (state.values[at] !== value) changed = true; state.values[at++] = value; };
  put(active);
  if (active) {
    put(margin); put(domains.length);
    for (const planes of domains) {
      put(planes.length);
      for (const plane of planes) { put(plane.normal.x); put(plane.normal.y); put(plane.normal.z); put(plane.constant); }
    }
  }
  if (state.values.length !== at) changed = true;
  state.values.length = at;
  if (changed) state.revision++;
}

export class SunShadowReceiverCulling {
  constructor(lights, { enabled = new URLSearchParams(globalThis.location?.search || "").get("shadowReceiverCull") !== "0",
    csm = null, cascadeReceiverCull = new URLSearchParams(globalThis.location?.search || "").get("cascadeReceiverCull") !== "0",
    tightProjection = new URLSearchParams(globalThis.location?.search || "").get("tightProjection") !== "0" } = {}) {
    this.lights = [...lights]; this.enabled = enabled; this.csm = csm; this.cascadeReceiverCull = cascadeReceiverCull; this.tightProjection = tightProjection; this.projectionCache = [];
    this.domains = []; this.cascadeDomains = []; this.disposed = false;
    this.stats = { enabled, active: false, cascadeActive: false, projectionActive: false, projectionBuilds: 0, cameras: 0, planes: [], tests: 0, culled: 0,
      cascades: lights.map(() => ({ tests: 0, culled: 0, margin: 0, depthRange: null, planes: [] })) };
    this.hooks = lights.map((light, i) => {
      const frustum = light.shadow.getFrustum(), descriptor = Object.getOwnPropertyDescriptor(frustum, "intersectsBox");
      const original = frustum.intersectsBox, control = this;
      const wrapper = function(box) {
        if (!original.call(this, box)) return false;
        if (!control.stats.active) return true;
        const stats = control.stats.cascades[i]; stats.tests++; control.stats.tests++;
        if (boxMayReachSunReceivers(box, control.cascadeDomains[i] || control.domains, stats.margin)) return true;
        stats.culled++; control.stats.culled++; return false;
      };
      // Unknown pre-existing wrappers may depend on hidden state: never claim
      // a complete cache contract for those predicates.
      const cullState = original === Frustum.prototype.intersectsBox ? { original, revision: 0, values: [],
        get active() { return control.stats.active; }, get margin() { return control.stats.cascades[i].margin; } } : null;
      if (cullState) Object.defineProperty(wrapper, "treeViewCullState", { value: cullState });
      frustum.intersectsBox = wrapper;
      return { frustum, descriptor, wrapper, cullState };
    });
  }

  // Call after CSM.update and before BOTH the caster tracker and renderer.
  // Only the actual three shadow frustums gain a box predicate. Standard
  // spheres and objects lacking explicit conservative wind boxes stay intact.
  update(camera, towardSun, { additionalCameras = [], shadowType = PCFShadowMap } = {}) {
    if (this.disposed) return this.stats;
    if (!this.enabled || shadowType !== PCFShadowMap) {
      this.domains = []; this.cascadeDomains = [];
      Object.assign(this.stats, { enabled:this.enabled, active:false, cascadeActive:false, projectionActive:false, cameras:0, planes:[], tests:0, culled:0 });
      this.stats.cascades.forEach(s=>Object.assign(s,{tests:0,culled:0,margin:0,depthRange:null,planes:[]}));
      this._updateCullStates();
      return this.stats;
    }
    const sun = new Vector3().copy(towardSun);
    const valid = [sun.x, sun.y, sun.z].every(Number.isFinite) && sun.lengthSq() > 1e-12;
    if (valid) sun.normalize();
    const cameras = [camera, ...additionalCameras];
    this.domains = valid ? cameras.map(c => sunReceiverHalfspaces(c, sun)) : [];
    const ranges = valid && this.cascadeReceiverCull ? csmReceiverDepthRanges(camera, this.csm) : null;
    const slabs = ranges?.length === this.lights.length ? ranges.map(range => sunReceiverDepthHalfspaces(camera, sun, range)) : null;
    const cascadeActive = !!slabs && slabs.every(Boolean);
    let projectionActive = false;
    this.cascadeDomains = cascadeActive ? slabs.map((planes, i) => {
      const cache = this.projectionCache[i] || (this.projectionCache[i] = []); cache.length = cameras.length;
      return this.domains.map((domain, j) => {
        if (this.tightProjection) {
          const record = cache[j] || (cache[j] = { values: new Float64Array(41), ready: false });
          const support = cachedProjection(record, cameras[j], camera, sun, ranges[i], this.stats);
          if (support) { projectionActive = true; return support; }
        }
        return [...domain, ...planes];
      });
    }) : [];
    this.projectionCache.length = cascadeActive ? this.lights.length : 0;
    Object.assign(this.stats, { enabled: this.enabled, active: this.enabled && valid && shadowType === PCFShadowMap, cascadeActive, projectionActive,
      cameras: this.domains.length, planes: this.domains.map(p => p.length), tests: 0, culled: 0 });
    this.stats.cascades.forEach((s, i) => Object.assign(s, { tests: 0, culled: 0, margin: sunReceiverFilterMargin(this.lights[i].shadow),
      depthRange: cascadeActive ? ranges[i] : null, planes: (this.cascadeDomains[i] || this.domains).map(p => p.length) }));
    this._updateCullStates();
    return this.stats;
  }

  _updateCullStates() {
    this.hooks.forEach((hook, i) => updateReceiverCullState(hook.cullState, this.stats.active,
      this.cascadeDomains[i] || this.domains, this.stats.cascades[i].margin));
  }

  dispose() {
    if (this.disposed) return;
    for (const { frustum, descriptor, wrapper } of this.hooks) {
      if (frustum.intersectsBox !== wrapper) continue;
      if (descriptor) Object.defineProperty(frustum, "intersectsBox", descriptor);
      else delete frustum.intersectsBox;
    }
    this.hooks.length = 0; this.lights.length = 0; this.domains.length = 0; this.cascadeDomains.length = 0;
    this.projectionCache.length = 0; this.stats.active = false; this.stats.cascadeActive = false; this.stats.projectionActive = false; this.disposed = true;
  }
}
