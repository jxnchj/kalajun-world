import {reachDesign73Option,REACH_DESIGN73_REVISION} from './reach-design73.js';
import {reachDesign69Option,REACH_DESIGN69_REVISION} from './reach-design69.js';
import {forestRootInputHashes} from './forest-root-inputs.js';
import { sampleMonotoneHeight, createAuthoredHeightProtection } from "./terrain-height-interpolation.js";
import {settlementAssetFor} from "./settlement-assets.js";
import { createHydrology } from "./hydrology.js";
// Authoritative V2 world coordinates and surface. No renderer or legacy buildSlice side effects.
// x=east, z=south, y=up; UTM EPSG:32644. Heights use north-first, pixel-centred rasters.
export const CHUNK_SIZE = 256;
const GROUPS = ["guesthouses", "cabins", "yurts", "barns", "hay", "swings"];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const finite = (...v) => { if (!v.every(Number.isFinite)) throw new TypeError("World coordinates must be finite"); };
export function deepFreeze(value) {
  if (value && typeof value === "object" && !ArrayBuffer.isView(value) && !Object.isFrozen(value)) {
    Object.values(value).forEach(deepFreeze); Object.freeze(value);
  }
  return value;
}
function canonical(value) {
  if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
  if (value && typeof value === "object") return "{" + Object.keys(value).sort().map(k => JSON.stringify(k) + ":" + canonical(value[k])).join(",") + "}";
  return JSON.stringify(value);
}
function fingerprint(s) {
  let a = 2166136261, b = 2246822519;
  for (let i = 0; i < s.length; i++) { a = Math.imul(a ^ s.charCodeAt(i), 16777619); b = Math.imul(b ^ s.charCodeAt(i), 3266489917); }
  return (a >>> 0).toString(16).padStart(8, "0") + (b >>> 0).toString(16).padStart(8, "0");
}
export function stableEntityId(group, source) {
  finite(source.x, source.z);
  // No source-array index. Same-coordinate records are disambiguated by explicit id or content.
  const discriminator = source.id !== undefined ? "id:" + source.id : canonical(source);
  return group + ":" + source.x + "," + source.z + ":" + fingerprint(discriminator);
}
export function chunkAt(x, z, size = CHUNK_SIZE) {
  finite(x, z, size); if (size <= 0) throw new RangeError("Chunk size must be positive");
  const ix = Math.floor(x / size), iz = Math.floor(z / size);
  return { id: ix + "," + iz, x: ix, z: iz, size, minX: ix * size, minZ: iz * size, maxX: (ix + 1) * size, maxZ: (iz + 1) * size };
}
export function coordinateFrame(origin) {
  if (!Array.isArray(origin) || origin.length !== 2) throw new TypeError("Missing UTM origin");
  finite(...origin);
  return {
    toUTM(x, z) { finite(x, z); return { e: origin[0] + x, n: origin[1] - z }; },
    fromUTM(e, n) { finite(e, n); return { x: e - origin[0], z: origin[1] - n }; },
  };
}
export async function decodeGzipBytes(input) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  if (bytes[0] !== 0x1f || bytes[1] !== 0x8b) return bytes;
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}
export function decodeHeightBytes(bytes, n, scale = 0.1) {
  if (bytes.byteLength !== n * n * 2) throw new RangeError("Height raster byte count does not match metadata");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength), out = new Float32Array(n * n);
  for (let i = 0; i < out.length; i++) out[i] = view.getUint16(i * 2, true) * scale;
  return out;
}
export function makeRaster(data, { n, res, x0 = -n * res / 2, z0 = -n * res / 2, channels = 1 }) {
  if (!(n > 0 && Number.isInteger(n) && res > 0) || data.length !== n * n * channels) throw new RangeError("Invalid raster dimensions");
  return { data, n, res, x0, z0, channels };
}
export function sampleRaster(r, x, z, channel = 0) {
  finite(x, z);
  const u = clamp((x - r.x0) / r.res - 0.5, 0, r.n - 1), v = clamp((z - r.z0) / r.res - 0.5, 0, r.n - 1);
  const i = Math.floor(u), j = Math.floor(v), i1 = Math.min(i + 1, r.n - 1), j1 = Math.min(j + 1, r.n - 1);
  const tx = u - i, tz = v - j, at = (a, b) => r.data[(b * r.n + a) * r.channels + channel];
  return (at(i,j) * (1-tx) + at(i1,j) * tx) * (1-tz) + (at(i,j1) * (1-tx) + at(i1,j1) * tx) * tz;
}

// Same bilinear evaluation order as sampleRaster, sharing only the coordinate
// lookup across the four landcover channels. Do not multiply weights together:
// that would change floating-point rounding and downstream placement thresholds.
export function sampleRasterRGBA(r,x,z){
  finite(x,z);
  if(r.channels!==4)throw new RangeError("RGBA sampling requires four channels");
  const u=clamp((x-r.x0)/r.res-.5,0,r.n-1),v=clamp((z-r.z0)/r.res-.5,0,r.n-1);
  const i=Math.floor(u),j=Math.floor(v),i1=Math.min(i+1,r.n-1),j1=Math.min(j+1,r.n-1),tx=u-i,tz=v-j;
  const a=(j*r.n+i)*4,b=(j*r.n+i1)*4,c=(j1*r.n+i)*4,d=(j1*r.n+i1)*4,data=r.data;
  const at=k=>(data[a+k]*(1-tx)+data[b+k]*tx)*(1-tz)+(data[c+k]*(1-tx)+data[d+k]*tx)*tz;
  return {r:at(0),g:at(1),b:at(2),a:at(3)};
}

function hash(x, z, k = 0) {
  let h = Math.imul((x | 0) ^ 0x27d4eb2d, 0x165667b1) ^ Math.imul((z | 0) + k * 7919, 0x9e3779b1);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b); h ^= h >>> 13;
  return ((h >>> 0) % 100000) / 100000;
}
function footprint(height, x, z, r) {
  const ys = [[0,0],[r,0],[-r,0],[0,r],[0,-r],[r,r],[-r,-r],[r,-r],[-r,r]].map(([dx,dz]) => height(x+dx,z+dz));
  return { lo: Math.min(...ys), hi: Math.max(...ys) };
}
function localPoint(e, x, z) {
  const c = Math.cos(e.rot), s = Math.sin(e.rot);
  return { x: e.x + x*c + z*s, z: e.z - x*s + z*c };
}
export function createEntities(objects, assetMetadata) {
  const ids = new Set(), entities = [];
  for (const group of GROUPS) for (const source of objects[group] || []) {
    const id = stableEntityId(group, source);
    if (ids.has(id)) throw new Error("Ambiguous duplicate entity; add a unique source id: " + id);
    ids.add(id);
    let assetId, scale = {x:1,y:1,z:1}, part = null;
    const kind = {guesthouses:"guesthouse",cabins:"cabin",yurts:"yurt",barns:"barn",hay:"hay",swings:"swing"}[group];
    if (group === "guesthouses") assetId = source.model;
    if (group === "cabins") {
      assetId = source.kind === "lodge" ? (source.w >= 30 ? "lodge" : "lodge24") : ["house_a","house_b"].includes(source.kind) ? source.kind : "cabin_small";
      const s = assetId === "cabin_small" ? clamp(source.w / 8.4, .75, 1.25) : assetId.startsWith("house") ? source.scale || 1 : 1;
      scale = {x:s,y:1,z:s};
    }
    if (group === "yurts") { assetId = source.deck ? "yurt_deck" : "yurt"; const s = source.r / (source.deck ? 3.6 : 3.2); scale = {x:s,y:Math.max(s,1),z:s}; }
    if (group === "barns") { assetId = "barn"; scale.x = source.w / 16; }
    if (group === "hay") { assetId = "haystack"; part = source.type === "loaf" ? "loaf" : "stack"; const s = source.s ?? 1; scale = {x:s,y:s*(.9+.2*hash(source.z,source.x)),z:s}; }
    if (group === "swings") assetId = "swing";
    if (!assetMetadata[assetId]) throw new Error("Missing migrated asset metadata: " + assetId);
    entities.push({id,kind,assetId,part,x:source.x,z:source.z,rot:source.rot ?? 0,scale,sourceGroup:group,sourceKey:id,source,
      sourcePosition:{x:source.x,z:source.z},site:source.site ?? null,home:!!source.home});
  }
  // Canonical order makes placement, neighbour avoidance and iterative foundations independent of input sorting.
  return entities.sort((a,b) => a.id.localeCompare(b.id, "en"));
}
function padDistance(p, x, z) {
  const dx = x-p.x, dz = z-p.z, c=Math.cos(p.rot), s=Math.sin(p.rot);
  const lx=dx*c-dz*s-p.cx, lz=dx*s+dz*c-p.cz;
  return p.circle ? Math.max(0,Math.hypot(lx,lz)-p.hx) : Math.hypot(Math.max(0,Math.abs(lx)-p.hx),Math.max(0,Math.abs(lz)-p.hz));
}
function padHeight(base, pad, x, z) {
  const out = padDistance(pad,x,z), width = pad.bank ? 6 : 0.5;
  if (out >= width) return base;
  const cut = Math.max(0, base - pad.floor - out);
  // Exact analytical pad shared by render/physics. Smooth bank release replaces legacy R8 quantisation/atlas cutoff.
  return base - cut * (1-smooth(width*.65,width,out));
}
function makePadIndex(pads) {
  const bins = new Map(), size = 64;
  for (const p of pads) {
    const radius = Math.hypot(p.cx,p.cz)+Math.hypot(p.hx,p.hz)+7;
    for(let x=Math.floor((p.x-radius)/size);x<=Math.floor((p.x+radius)/size);x++)
      for(let z=Math.floor((p.z-radius)/size);z<=Math.floor((p.z+radius)/size);z++){
        const key=x+","+z; if(!bins.has(key))bins.set(key,[]); bins.get(key).push(p);
      }
  }
  return (x,z) => bins.get(Math.floor(x/size)+","+Math.floor(z/size)) || [];
}
function placeEntities(entities, assets, rawHeight) {
  const padOf = e => assets[e.assetId].pad;
  // Legacy separation is migrated on derived records only; source objects remain immutable.
  const items=entities.filter(e=>["cabin","guesthouse","barn","yurt"].includes(e.kind)).map(e=>{
    if(e.kind==="yurt")return{o:e,r:e.source.r*(e.source.deck?1.35:1.05)+.3,move:true};
    if(e.kind==="barn"){const b=assets.barn.bounds;return{o:e,rot:e.rot,cx:(b.min[0]+b.max[0])/2*e.scale.x,cz:(b.min[2]+b.max[2])/2,hx:(b.max[0]-b.min[0])/2*e.scale.x,hz:(b.max[2]-b.min[2])/2,move:e.source.src==="2013"};}
    const p=padOf(e);if(!p)throw new Error("Missing pad for "+e.assetId);
    return{o:e,rot:e.rot,cx:p.cx*e.scale.x,cz:(p.cz+.8)*e.scale.z,hx:p.hx*e.scale.x,hz:(p.hz+.8)*e.scale.z,move:e.kind==="cabin"&&e.source.src==="2013"};
  });
  settle(items,.5);
  for(const e of entities.filter(e=>e.kind==="cabin")){
    const p=padOf(e), s=e.scale.x, g=footprint(rawHeight,e.x,e.z,Math.max(e.source.w,e.source.d)*.5);
    const front=[-.6,0,.6].map(t=>localPoint(e,t*p.hx*s,(p.cz+p.hz)*s+1.3));
    e.y=Math.min(g.lo+(g.hi-g.lo)*.55,Math.min(...front.map(p=>rawHeight(p.x,p.z)))+.9);
  }
  const guest=entities.filter(e=>e.kind==="guesthouse");guest.forEach(e=>{e.y=Infinity;});
  const nearGuestGround=(x,z,self)=>{
    let h=rawHeight(x,z);
    for(const e of guest){if(e===self||!Number.isFinite(e.y))continue;const p=padOf(e),out=padDistance({...p,hx:p.hx+.2,hz:p.hz+.2,x:e.x,z:e.z,rot:e.rot},x,z);
      if(out<7.5)h=Math.min(h,e.y-.2+Math.max(0,out-1.6));}
    return h;
  };
  for(let pass=0;pass<3;pass++)for(const e of guest){
    const p=padOf(e), at=(x,z)=>{const q=localPoint(e,x,z);return nearGuestGround(q.x,q.z,e);}, center=localPoint(e,p.cx,p.cz);
    const g=footprint(rawHeight,center.x,center.z,Math.max(p.hx,p.hz));
    let y=Math.min(g.lo+(g.hi-g.lo)*.55,Math.min(...[-.6,0,.6].map(t=>at(p.cx+t*p.hx,p.cz+p.hz+1.3)))+.9);
    if(e.source.floor==="back")y=[-.8,-.4,0,.4,.8].reduce((sum,t)=>sum+at(p.cx+t*p.hx,p.cz-p.hz+.6)/5,0);
    for(const st of assets[e.assetId].steps||[])y=Math.min(y,at(st.x,st.z)-st.y+.18);
    e.y=Math.min(e.y,y);
  }
  const yurts=entities.filter(e=>e.kind==="yurt");
  for(const e of yurts){
    const gx=rawHeight(e.x+4,e.z)-rawHeight(e.x-4,e.z),gz=rawHeight(e.x,e.z+4)-rawHeight(e.x,e.z-4);
    let rot=Math.atan2(-gx,-gz)+(hash(e.x,e.z)-.5)*.6;
    for(const o of yurts){if(o===e||Math.hypot(o.x-e.x,o.z-e.z)>12)continue;const to=Math.atan2(o.x-e.x,o.z-e.z),th=Math.atan2(Math.sin(rot-to),Math.cos(rot-to));if(Math.abs(th)<.9)rot=to+(th<0?-.9:.9);}
    e.rot=rot;const r=e.source.r,g=footprint(rawHeight,e.x,e.z,r*.8),f=localPoint(e,0,r*1.05+.9);
    e.y=e.source.deck?g.hi+.1:Math.min(g.lo+(g.hi-g.lo)*.3,rawHeight(f.x,f.z)+.5);
  }
  for(const e of entities.filter(e=>e.kind==="barn")){
    e.y=[-.35,0,.35].reduce((sum,t)=>{const p=localPoint(e,t*e.source.w,3.6);return sum+rawHeight(p.x,p.z)/3;},.03);
  }
  const pads=[];
  for(const e of entities.filter(e=>["cabin","guesthouse","yurt","barn"].includes(e.kind))){
    if(e.source.deck)continue;
    let p;
    if(e.kind==="barn"){const b=assets.barn.sodBounds;if(!b)throw new Error("Missing barn sod footprint");p={cx:(b.min[0]+b.max[0])/2*e.scale.x,cz:(b.min[2]+b.max[2])/2,hx:(b.max[0]-b.min[0])/2*e.scale.x-.1,hz:(b.max[2]-b.min[2])/2-.1,floor:e.y-.08,bank:false};}
    else{const q=padOf(e);p={cx:q.cx*e.scale.x,cz:q.cz*e.scale.z,hx:q.hx*e.scale.x+(q.circle?.5:.2),hz:q.hz*e.scale.z+.2,circle:!!q.circle,floor:e.y-(e.kind==="yurt"?.1:.2),bank:true};}
    e.pad={...p,id:e.id,x:e.x,z:e.z,rot:e.rot};pads.push(e.pad);
    // Authored outdoor platform follows the existing house pose. Keep the
    // original pad/placement authority; only cut extra ground below its mesh.
    const outdoor=settlementAssetFor(e.assetId)?.outdoor;
    if(outdoor)pads.push({id:e.id+":porch",x:e.x,z:e.z,rot:e.rot,
      cx:(outdoor.x0+outdoor.x1)/2*e.scale.x,cz:(outdoor.z0+outdoor.z1)/2*e.scale.z,
      hx:(outdoor.x1-outdoor.x0)/2*e.scale.x,hz:(outdoor.z1-outdoor.z0)/2*e.scale.z,
      floor:e.y+outdoor.groundY*e.scale.y,bank:true,circle:false});
  }
  const nearby=makePadIndex(pads),heightAt=(x,z)=>{const h=rawHeight(x,z);return nearby(x,z).reduce((v,p)=>Math.min(v,padHeight(h,p,x,z)),h);};
  for(const e of entities){
    if(e.kind==="hay")e.y=footprint(heightAt,e.x,e.z,e.part==="loaf"?3:1.5).lo+.05;
    if(e.kind==="swing")e.y=heightAt(e.x,e.z);
    finite(e.x,e.y,e.z,e.rot,e.scale.x,e.scale.y,e.scale.z);
    e.layoutAdjusted=Math.hypot(e.x-e.sourcePosition.x,e.z-e.sourcePosition.z)>.001;
    e.chunkId=chunkAt(e.x,e.z).id;
  }
  return {pads,heightAt};
}
export function createWorldData({reachDesign73=reachDesign73Option(),reachDesign69=reachDesign69Option(),meta,objects,coreHeights,farHeights,detailMeta,detailBytes,coreLandcover,farLandcover,manifest,streamData={lines:[]},riverMeanders,forestReach39=(new URLSearchParams(globalThis.location?.search||"").has("forestReach39")?new URLSearchParams(globalThis.location?.search||"").get("forestReach39")==="1":"auto"),forestBankCurvature38=new URLSearchParams(globalThis.location?.search||"").get("forestBankCurvature38")!=="0",forestRootedShoulder38=new URLSearchParams(globalThis.location?.search||"").get("forestRootedShoulder38")==="1",demInterpolation=new URLSearchParams(globalThis.location?.search||"").get("demInterpolation")==="monotone"?"monotone":"bilinear",landcoverSampling=new URLSearchParams(globalThis.location?.search||"").get("landcoverSampling")==="scalar"?"scalar":"rgba"}) {
  if(reachDesign73!==null&&reachDesign73!=='bend')throw Error('Invalid explicit reachDesign73');
  if(reachDesign73&&reachDesign69)throw Error('Reach candidates are mutually exclusive');
  if(reachDesign69!==null&&reachDesign69!=='bend')throw Error('Invalid explicit reachDesign69');
  const metadata=deepFreeze(structuredClone(meta)), source=deepFreeze(structuredClone(objects));
  const core=makeRaster(coreHeights,{...meta.core}),far=makeRaster(farHeights,{...meta.far});
  const detail=makeRaster(detailBytes,{n:detailMeta.size,res:detailMeta.res,x0:detailMeta.origin[0],z0:detailMeta.origin[1],channels:4});
  const coreLC=makeRaster(coreLandcover.data,{n:coreLandcover.width,res:meta.core.size/coreLandcover.width,channels:4});
  const farLC=makeRaster(farLandcover.data,{n:farLandcover.width,res:meta.far.size/farLandcover.width,channels:4});
  const weight=(x,z)=>smooth(0,600,Math.min(meta.core.size/2-Math.abs(x),meta.core.size/2-Math.abs(z)));
  const entities=createEntities(source,manifest.assetMetadata);
  const reconstructionWeight=demInterpolation==="monotone"?createAuthoredHeightProtection(entities,manifest.assetMetadata):null;
  const heightSample=reconstructionWeight?(r,x,z)=>{
    const w=reconstructionWeight(x,z);
    if(w===0)return sampleRaster(r,x,z);
    if(w===1)return sampleMonotoneHeight(r,x,z);
    return sampleRaster(r,x,z)*(1-w)+sampleMonotoneHeight(r,x,z)*w;
  }:sampleRaster;
  const geographicHeightAt=(x,z)=>{finite(x,z);const w=weight(x,z);if(w===1)return heightSample(core,x,z);if(w===0)return heightSample(far,x,z);return heightSample(far,x,z)*(1-w)+heightSample(core,x,z)*w;};
  const detailAt=(x,z,channel=0)=>{
    const edge=Math.min((x-detail.x0)/detail.res-.5,(z-detail.z0)/detail.res-.5,detail.n-.5-(x-detail.x0)/detail.res,detail.n-.5-(z-detail.z0)/detail.res);
    if(edge<=0)return 0;
    const val=sampleRaster(detail,x,z,channel),w=smooth(0,2,edge);
    return (channel===0?(val-128)*detailMeta.scale:val/255)*w;
  };
  const landcoverAt=(x,z)=>{
      finite(x,z);const w=weight(x,z),single=w===1?coreLC:w===0?farLC:null;
      if(landcoverSampling==="scalar")return Object.fromEntries(["r","g","b","a"].map((k,i)=>[k,clamp((single?sampleRaster(single,x,z,i):sampleRaster(coreLC,x,z,i)*w+sampleRaster(farLC,x,z,i)*(1-w))/255,0,1)]));
      const c=sampleRasterRGBA(single||coreLC,x,z);
      if(!single){const f=sampleRasterRGBA(farLC,x,z);for(const k of ["r","g","b","a"])c[k]=c[k]*w+f[k]*(1-w);}
      c.r=clamp(c.r/255,0,1);c.g=clamp(c.g/255,0,1);c.b=clamp(c.b/255,0,1);c.a=clamp(c.a/255,0,1);return c;
    };
  const rawHeight=(x,z)=>geographicHeightAt(x,z)+detailAt(x,z);
  const hydrology=createHydrology({streamData,heightAt:rawHeight,entities,assetMetadata:manifest.assetMetadata,objects:source,riverMeanders,forestRootedShoulder38,forestBankCurvature38,forestReach39,reachDesign69,reachDesign73,landcoverAt});
  // Authored reach defaults only onto its validated source; explicit true remains strict.
  forestReach39=Boolean(hydrology.forestReach39);
  const channelHeight=(x,z)=>hydrology.bedHeightAt(x,z,rawHeight(x,z));
  const placed=placeEntities(entities,manifest.assetMetadata,channelHeight);
  const byId=new Map(entities.map(e=>[e.id,e]));
  const heightAt=(x,z)=>{finite(x,z);return placed.heightAt(x,z);};
  hydrology.bindSurface(heightAt);
  const surface={demInterpolation,geographicHeightAt,heightAt,uncarvedHeightAt:rawHeight,detailAt,
    normalAt(x,z,step=2){finite(x,z,step);if(step<=0)throw new RangeError("Normal step must be positive");const dx=heightAt(x-step,z)-heightAt(x+step,z),dz=heightAt(x,z-step)-heightAt(x,z+step),dy=2*step,len=Math.hypot(dx,dy,dz);return{x:dx/len,y:dy/len,z:dz/len};},
    buildingPose(entity){const e=typeof entity==="string"?byId.get(entity):byId.get(entity?.id);if(!e)throw new Error("Unknown entity");return{x:e.x,y:e.y,z:e.z,rot:e.rot,scale:{...e.scale}};},
    pads:deepFreeze(placed.pads),heightPolicy:"DEM + authored detail + bounded cut-only river beds + analytical cut-only building pads; no exaggeration or earth curvature",
  };
  let rootInputHashes;
  const getForestRootInputHashes=()=>rootInputHashes??=(forestRootInputHashes({meta:metadata,objects:source,assetMetadata:manifest.assetMetadata,detailMeta,streamData,coreHeights,farHeights,detailBytes,coreLandcover:coreLandcover.data,farLandcover:farLandcover.data,options:{...(reachDesign73?{reachDesign73,reachDesign73Revision:REACH_DESIGN73_REVISION}:{}),...(reachDesign69?{reachDesign69,reachDesign69Revision:REACH_DESIGN69_REVISION}:{}),...(hydrology.forestReach39?.stats.design50?{reachBankDesign50:hydrology.forestReach39.stats.design50}:{}),...(hydrology.forestReach39?.stats.profile48?{reachBankProfile48:hydrology.forestReach39.stats.profile48}:{}),...(forestReach39?{forestReach39:true,...(hydrology.forestReach39?.stats.form41?{forestReachForm41:true,forestReachForm41Revision:hydrology.forestReach39.stats.form41Revision??"initial"}:{})}:{}),...(forestBankCurvature38?{forestBankCurvature38:true}:{}),...(forestRootedShoulder38?{forestRootedShoulder38:true}:{}),demInterpolation,landcoverSampling,riverMeanders:riverMeanders??'default',valleyLandform:Boolean(hydrology.stats.valleyDeposits?.nodes),valleyMeanders:Boolean(hydrology.stats.valleyMeanders?.nodes),valleySection:Boolean(hydrology.stats.valleyDeposits?.sectionProfile)}}));
  const bounds=deepFreeze({minX:-meta.far.size/2,maxX:meta.far.size/2,minZ:-meta.far.size/2,maxZ:meta.far.size/2,core:{minX:-meta.core.size/2,maxX:meta.core.size/2,minZ:-meta.core.size/2,maxZ:meta.core.size/2}});
  const world={getForestRootInputHashes,meta:metadata,objects:source,manifest:deepFreeze(structuredClone(manifest)),entities:deepFreeze(entities),surface,hydrology,bounds,chunkAt,...coordinateFrame(meta.origin_utm),assetBase:"./assets/",
    landcoverAt,
  };
  if(forestRootedShoulder38||forestBankCurvature38||forestReach39){
    // Keep the exact existing habitat/relocation inputs. Only final plant Y is
    // reseated; candidate banks must not resow the procedural population.
    const nearby=makePadIndex(placed.pads),baselineHeightAt=(x,z)=>{
      const h=hydrology.baselineBedHeightAt(x,z,rawHeight(x,z));
      return nearby(x,z).reduce((v,p)=>Math.min(v,padHeight(h,p,x,z)),h);
    };
    const selectionSurface={...surface,heightAt:baselineHeightAt,normalAt(x,z,step=2){
      finite(x,z,step);if(step<=0)throw new RangeError("Normal step must be positive");
      const dx=baselineHeightAt(x-step,z)-baselineHeightAt(x+step,z),dz=baselineHeightAt(x,z-step)-baselineHeightAt(x,z+step),dy=2*step,len=Math.hypot(dx,dy,dz);return{x:dx/len,y:dy/len,z:dz/len};
    }};
    world.forestShoulderSourceWorld={...world,surface:selectionSurface,hydrology:hydrology.reachSource??hydrology};
  }
  if(forestReach39&&hydrology.forestReach39)world.forestReach39={...hydrology.forestReach39.stats,giMatched:false};
  return world;
}
async function fetchChecked(url) {const r=await fetch(url);if(!r.ok)throw new Error(url+": HTTP "+r.status);return r;}
async function loadPNG(url) {
  const bitmap=await createImageBitmap(await (await fetchChecked(url)).blob(),{colorSpaceConversion:"none",premultiplyAlpha:"none"});
  try{const canvas=document.createElement("canvas");canvas.width=bitmap.width;canvas.height=bitmap.height;const ctx=canvas.getContext("2d",{willReadFrequently:true});if(!ctx)throw new Error("2D canvas unavailable");ctx.drawImage(bitmap,0,0);return {width:bitmap.width,height:bitmap.height,data:ctx.getImageData(0,0,bitmap.width,bitmap.height).data};}finally{bitmap.close();}
}
export async function loadWorldData({onProgress,onSourceInputs}={}) {
  let completed=0;const total=10;
  const done=stage=>onProgress?.({stage,completed:++completed,total,ratio:completed/total});
  const json=async(url,label)=>{const v=await(await fetchChecked(url)).json();done(label);return v;};
  const binary=async(url,label)=>{const v=await decodeGzipBytes(await(await fetchChecked(url)).arrayBuffer());done(label);return v;};
  const image=async(url,label)=>{const v=await loadPNG(url);done(label);return v;};
  const [meta,objects,manifest,detailMeta,cb,fb,detailBytes,coreLandcover,farLandcover,streamData]=await Promise.all([
    json("./data/scene.json","世界坐标"),json("./data/objects.json","地物目录"),json("./world-v2/manifest.json","数据来源"),
    json("./data/detail.json","局部地表"),binary("./data/core_height.bin.gz","核心高程"),binary("./data/far_height.bin.gz","远景高程"),
    binary("./data/detail.bin.gz","局部地表解码"),image("./data/core_landcover.png","核心地类"),image("./data/far_landcover.png","远景地类"),json("./data/streams.json","原始河网")]);
  const variant69=reachDesign69Option(),variant73=reachDesign73Option();
  const inputs={...(variant73?{reachDesign73:variant73}:{}),...(variant69?{reachDesign69:variant69}:{}),meta,objects,manifest,detailMeta,detailBytes,coreHeights:decodeHeightBytes(cb,meta.core.n,meta.height_scale),farHeights:decodeHeightBytes(fb,meta.far.n,meta.height_scale),coreLandcover,farLandcover,streamData};
  const world=createWorldData(inputs);
  onSourceInputs?.(inputs);
  onProgress?.({stage:"地表与地基就绪",completed:total,total,ratio:1});return world;
}

// Migrated unchanged separation geometry from slice.js; caller supplies a stable order.
function settle(items, margin, iters = 16) {
  const shape = (it) => {
    if (it.r !== undefined) return { x: it.o.x, z: it.o.z, r: it.r + margin, R: it.r + margin };
    const c = Math.cos(it.rot), sn = Math.sin(it.rot);
    const ux = [c, -sn], uz = [sn, c], hx = it.hx + margin, hz = it.hz + margin;
    return { x: it.o.x + ux[0] * it.cx + uz[0] * it.cz, z: it.o.z + ux[1] * it.cx + uz[1] * it.cz, ux, uz, hx, hz, R: Math.hypot(hx, hz) };
  };
  // the way b must go to clear a: [nx, nz, depth] or null
  const part = (a, b) => {
    const dx = b.x - a.x, dz = b.z - a.z, d = Math.hypot(dx, dz);
    if (d >= a.R + b.R) return null;
    if (a.r !== undefined && b.r !== undefined) return d < a.r + b.r ? (d > 1e-6 ? [dx / d, dz / d, a.r + b.r - d] : [1, 0, a.r + b.r]) : null;
    if (a.r !== undefined) { const m = part(b, a); return m && [-m[0], -m[1], m[2]]; }
    if (b.r !== undefined) {   // circle b against box a: from the nearest point of the box
      const lx = dx * a.ux[0] + dz * a.ux[1], lz = dx * a.uz[0] + dz * a.uz[1];
      const qx = Math.max(-a.hx, Math.min(a.hx, lx)), qz = Math.max(-a.hz, Math.min(a.hz, lz));
      let ex = lx - qx, ez = lz - qz, e = Math.hypot(ex, ez), depth;
      if (e > 1e-6) { if (e >= b.r) return null; depth = b.r - e; ex /= e; ez /= e; }
      else if (a.hx - Math.abs(lx) < a.hz - Math.abs(lz)) { ex = Math.sign(lx) || 1; ez = 0; depth = a.hx - Math.abs(lx) + b.r; }
      else { ex = 0; ez = Math.sign(lz) || 1; depth = a.hz - Math.abs(lz) + b.r; }
      return [ex * a.ux[0] + ez * a.uz[0], ex * a.ux[1] + ez * a.uz[1], depth];
    }
    let best = null;
    for (const n of [a.ux, a.uz, b.ux, b.uz]) {
      const ra = a.hx * Math.abs(a.ux[0] * n[0] + a.ux[1] * n[1]) + a.hz * Math.abs(a.uz[0] * n[0] + a.uz[1] * n[1]);
      const rb = b.hx * Math.abs(b.ux[0] * n[0] + b.ux[1] * n[1]) + b.hz * Math.abs(b.uz[0] * n[0] + b.uz[1] * n[1]);
      const s = dx * n[0] + dz * n[1], depth = ra + rb - Math.abs(s);
      if (depth <= 0) return null;
      if (!best || depth < best[2]) best = [n[0] * (Math.sign(s) || 1), n[1] * (Math.sign(s) || 1), depth];
    }
    return best;
  };
  const moved = new Set();
  for (let k = 0; k < iters; k++) {
    let any = false;
    const sh = items.map(shape);
    for (let i = 0; i < items.length; i++)
      for (let j = i + 1; j < items.length; j++) {
        const A = items[i], B = items[j];
        if (!A.move && !B.move) continue;
        const m = part(sh[i], sh[j]);
        if (!m) continue;
        const fa = A.move ? (B.move ? 0.5 : 1) : 0, fb = B.move ? (A.move ? 0.5 : 1) : 0, step = m[2] + 0.01;
        A.o.x -= m[0] * step * fa; A.o.z -= m[1] * step * fa;
        B.o.x += m[0] * step * fb; B.o.z += m[1] * step * fb;
        sh[i] = shape(A); sh[j] = shape(B);
        if (fa) moved.add(A.o);
        if (fb) moved.add(B.o);
        any = true;
      }
    if (!any) break;
  }
  return moved.size;
}

