import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import * as THREE from 'three';
import {attachEcologyWind} from './ecology.js';
import {validateFarSpruceManifest,loadFarSpruceAssets as loadFarSpruceAssetsActual,farSpruceBounds,createFarSpruceImpostorGeometry,setFarSpruceImpostorAttributes,installFarSpruceImpostor,selectFarSpruceFrames} from './spruce-far-impostor.js';
// Retain the original transport and HTTP/resource timing regression suite.
const loadFarSpruceAssets=options=>loadFarSpruceAssetsActual({...options,transport:"v26",manifest:"network",farLossless38:false});
const dir=new URL('../../public/assets/v2/spruce/far-v14/',import.meta.url),metadata=JSON.parse(readFileSync(new URL('impostor-manifest.json',dir)));
const payload=kind=>gunzipSync(readFileSync(new URL(metadata.files.find(f=>f.kind===kind).url,dir)));
const assets={metadata,albedo:new THREE.Texture(),normal:new THREE.Texture()};
test('actual five-form 120-layer capture has ordered root-anchored rectangles and exact payloads',()=>{
 assert.equal(validateFarSpruceManifest(metadata),metadata);
 for(const f of metadata.files){const data=payload(f.kind);assert.equal(data.length,128*384*120*4);assert.equal(createHash('sha256').update(data).digest('hex'),f.sha256);assert.equal(readFileSync(new URL(f.url,dir)).length,f.bytes);}
 for(const f of metadata.frames){assert.ok(f.coverage>.15&&f.coverage<.85);assert.equal(f.form,metadata.forms[f.formIndex]);const r=f.rect;assert.ok(Math.abs(r[0]+f.rootUv[0]*(r[2]-r[0]))<1e-8);assert.ok(Math.abs(r[1]+f.rootUv[1]*(r[3]-r[1]))<1e-8);}
 const broken=structuredClone(metadata);broken.frames[3].rootUv[1]+=.1;assert.throws(()=>validateFarSpruceManifest(broken),/root projection/);
});
test('all forms share 8 triangles and preserve complete root-relative quad bounds at every camera azimuth',()=>{
 const g=createFarSpruceImpostorGeometry(assets);assert.equal(g.index.count/3,8);assert.equal(g.attributes.position.count,10);assert.ok(!g.attributes.aFarForm);
 const box=farSpruceBounds(metadata),p=new THREE.Vector3();
 for(const r of metadata.formRects)for(let angle=0;angle<Math.PI*2;angle+=.031)for(const x of [r[0],r[2]])for(const y of [r[1],r[3]]){p.set(Math.cos(angle)*x,y,-Math.sin(angle)*x);assert.ok(box.containsPoint(p));assert.ok(g.boundingSphere.containsPoint(p));}
 assert.ok(box.min.y < -3);assert.ok(box.max.y > 18);
 setFarSpruceImpostorAttributes(g,[{variant:3},{variant:0},{variant:4}]);assert.deepEqual([...g.attributes.aFarForm.array],[3,0,4]);assert.ok(g.attributes.aFarForm.isInstancedBufferAttribute);assert.throws(()=>setFarSpruceImpostorAttributes(g,[{variant:5}]),/Unknown/);g.dispose();
});
test('view selection is continuous around azimuth seam/elevation boundary and finite above/below the root',()=>{
 for(let f=0;f<5;f++)for(const e of [-60,0,22.5,45,89.999,90])for(let a=-Math.PI;a<=Math.PI;a+=.07){const s=selectFarSpruceFrames(f,Math.sin(a)*Math.cos(e*Math.PI/180),Math.sin(e*Math.PI/180),Math.cos(a)*Math.cos(e*Math.PI/180));assert.ok(s.layers.every(i=>i>=f*24&&i<(f+1)*24));assert.ok(s.weights.every(w=>w>=-1e-10&&w<=1+1e-10));assert.ok(Math.abs(s.weights.reduce((a,b)=>a+b,0)-1)<1e-10);assert.ok(s.right.every(Number.isFinite));}
 const weighted=s=>{const a=Array(120).fill(0);s.layers.forEach((i,k)=>a[i]+=s.weights[k]);return a;};
 for(const e of [0,22.5,45]){const a=weighted(selectFarSpruceFrames(3,-1e-8,Math.tan(e*Math.PI/180),1)),b=weighted(selectFarSpruceFrames(3,1e-8,Math.tan(e*Math.PI/180),1));assert.ok(a.every((v,i)=>Math.abs(v-b[i])<1e-7));}
 assert.deepEqual(selectFarSpruceFrames(0,0,1,0).right,[1,0,0]);
});
test('premultiplied capture preserves coverage under mip averaging without a hard alpha threshold',()=>{
 const a=payload('albedo'),n=payload('normal');let lowAlpha=0,fullAlpha=0;
 for(let i=0;i<a.length;i+=4){assert.equal(a[i+3],n[i+3]);if(a[i+3]===0){assert.equal(a[i]+a[i+1]+a[i+2],0);assert.ok(Math.abs(n[i]-128)<=1&&Math.abs(n[i+1]-128)<=1&&Math.abs(n[i+2]-128)<=1);}if(a[i+3]>0&&a[i+3]<250)lowAlpha++;if(a[i+3]>=250)fullAlpha++;}
 assert.ok(lowAlpha>10000&&fullAlpha>10000);
 // AlphaToCoverage receives filtered alpha directly; arithmetic area averages
 // conserve the source coverage at each mip. No alpha-threshold widening.
 for(let layer=0;layer<120;layer++){let w=128,h=384,values=Float64Array.from({length:w*h},(_,i)=>a[(layer*w*h+i)*4+3]/255),mean=values.reduce((a,b)=>a+b,0)/values.length;
  for(let level=1;level<=6;level++){const nw=w/2,nh=h/2,out=new Float64Array(nw*nh);for(let y=0;y<nh;y++)for(let x=0;x<nw;x++){const k=y*2*w+x*2;out[y*nw+x]=(values[k]+values[k+1]+values[k+w]+values[k+w+1])/4;}const m=out.reduce((a,b)=>a+b,0)/out.length;assert.ok(Math.abs(m-mean)<1e-10);values=out;w=nw;h=nh;}
 }
});
function compile(depth=false){const m=depth?new THREE.MeshDepthMaterial({depthPacking:THREE.RGBADepthPacking}):new THREE.MeshStandardMaterial();attachEcologyWind(m,{},0);installFarSpruceImpostor(m,assets);const lib=depth?THREE.ShaderLib.depth:THREE.ShaderLib.standard,shader={vertexShader:lib.vertexShader,fragmentShader:lib.fragmentShader,uniforms:{}};m.onBeforeCompile(shader,{});return {m,shader};}
test('main and depth deform the same quad, use actual camera view and retain original ecological LOD',()=>{
 const {m,shader:s}=compile(),{shader:d}=compile(true);for(const q of [s,d]){assert.match(q.vertexShader,/farDelta=cameraPosition-ecoRoot/);assert.match(q.vertexShader,/vPlantDistance=distance\(ecoRoot\(\).xz,uWorldViewer.xz\)/);assert.match(q.vertexShader,/transformed=farRight\*farPlane.x/);assert.match(q.vertexShader,/ecoBend\(farPlane.y/);assert.match(q.fragmentShader,/if\(n<middleTree/);assert.doesNotMatch(q.vertexShader,/aSpruceForm|aCrownMask/);assert.doesNotMatch(q.fragmentShader,/gl_FragDepth/);assert.match(q.fragmentShader,/farColour.rgb\/max\(farColour.a/);assert.match(q.fragmentShader,/diffuseColor.a\*=farColour.a/);}
 assert.match(s.fragmentShader,/normal=normalize\(vFarNormalMatrix\*farNormal/);assert.equal(m.alphaToCoverage,true);
 const key=m.customProgramCacheKey();installFarSpruceImpostor(m,assets);assert.equal(m.customProgramCacheKey(),key);
 m.onBeforeRender({getRenderTarget:()=>({samples:4})});assert.equal(m.userData.farImpostorUniforms.uFarMultisample.value,1);m.onBeforeRender({getRenderTarget:()=>({samples:0})});assert.equal(m.userData.farImpostorUniforms.uFarMultisample.value,0);
});
const fetchLocal=async url=>{const f=String(url).endsWith('.json')?'impostor-manifest.json':new URL(url).pathname.split('/').pop();const bytes=readFileSync(new URL(f,dir));return {ok:true,status:200,json:async()=>JSON.parse(bytes),arrayBuffer:async()=>bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength)};};
test('actual loader decodes two layer arrays, reports bounded memory and disposes them exactly once',async()=>{
 const a=await loadFarSpruceAssets({url:'http://localhost/impostor-manifest.json',fetch:fetchLocal});assert.equal(a.stats.decodedBytes,47185920);assert.ok(a.stats.gpuTextureBytes>62000000&&a.stats.gpuTextureBytes<64000000);assert.equal(a.stats.encodedBytes,metadata.files.reduce((n,f)=>n+f.bytes,0));assert.equal(a.stats.responseBodyBytes,a.stats.encodedBytes);assert.equal(a.stats.applicationGzipDecodes,2);assert.equal(a.stats.resourceTiming.complete,false);assert.equal(a.stats.resourceTiming.transferSize,null);assert.equal("transportBytes" in a.stats,false);assert.equal(a.albedo.image.depth,120);assert.equal(a.albedo.colorSpace,THREE.SRGBColorSpace);assert.equal(a.normal.colorSpace,THREE.NoColorSpace);assert.equal(a.albedo.generateMipmaps,true);assert.equal(a.albedo.flipY,false);let disposed=0;for(const t of [a.albedo,a.normal])t.addEventListener('dispose',()=>disposed++);a.dispose();a.dispose();assert.equal(disposed,2);assert.equal(a.albedo.image.data,null);
});
test('loading failures and cancellation surface explicitly instead of substituting old cone geometry',async()=>{
 const ac=new AbortController();ac.abort();await assert.rejects(loadFarSpruceAssets({signal:ac.signal,fetch:()=>{throw Error('should not fetch');}}),e=>e.name==='AbortError');
 await assert.rejects(loadFarSpruceAssets({fetch:async()=>({ok:false,status:404})}),/manifest 404/);
 await assert.rejects(loadFarSpruceAssets({url:'http://localhost/m.json',fetch:async url=>String(url).endsWith('.json')?fetchLocal('http://localhost/impostor-manifest.json'):{ok:true,arrayBuffer:async()=>new Uint8Array(4).buffer}}),/byte count mismatch/);
});
test('HTTP-decoded responses distinguish JS body bytes, encoded manifest bytes and measured ResourceTiming',async()=>{
 const entries=new Map(),fetchDecoded=async url=>{
  if(String(url).endsWith('.json'))return fetchLocal(url);
  const kind=String(url).includes('albedo')?'albedo':'normal',f=metadata.files.find(f=>f.kind===kind),data=payload(kind);
  entries.set(url,[{entryType:'resource',startTime:0,duration:999,transferSize:999999999,encodedBodySize:999999999,decodedBodySize:999999999},{entryType:'resource',startTime:performance.now(),duration:12,transferSize:f.bytes+300,encodedBodySize:f.bytes,decodedBodySize:data.byteLength,deliveryType:''}]);
  return {ok:true,url,arrayBuffer:async()=>data.buffer.slice(data.byteOffset,data.byteOffset+data.byteLength)};
 };
 const a=await loadFarSpruceAssets({url:'http://localhost/impostor-manifest.json',fetch:fetchDecoded,performance:{getEntriesByName:url=>entries.get(url)??[]}});
 assert.equal(a.stats.responseBodyBytes,47185920);assert.equal(a.stats.encodedBytes,20834110);assert.equal(a.stats.decodedBytes,47185920);assert.equal(a.stats.applicationGzipDecodes,0);assert.equal(a.stats.decodeMs,0);
 assert.equal(a.stats.resourceTiming.complete,true);assert.equal(a.stats.resourceTiming.encodedBodySize,20834110);assert.equal(a.stats.resourceTiming.decodedBodySize,47185920);assert.equal(a.stats.resourceTiming.transferSize,20834710);assert.equal(a.stats.resourceTiming.entries.length,2);a.dispose();
});
test('ResourceTiming preserves cache zero-transfer measurements and does not invent missing or restricted byte counts',async()=>{
 for(const mode of ['cache','missing','stale','restricted']){
  const entries=new Map(),fetchTimed=async url=>{const result=await fetchLocal(url);if(!String(url).endsWith('.json')){const f=metadata.files.find(f=>String(url).endsWith(f.url));entries.set(url,[{entryType:'resource',startTime:mode==='stale'?0:performance.now(),duration:1,transferSize:0,encodedBodySize:mode==='restricted'?0:f.bytes,decodedBodySize:mode==='restricted'?0:f.decodedBytes,deliveryType:'cache'}]);}return result;};
  const a=await loadFarSpruceAssets({url:'http://localhost/impostor-manifest.json',fetch:fetchTimed,performance:{getEntriesByName:url=>mode==='missing'?[]:entries.get(url)??[]}});
  if(mode==='cache'){assert.equal(a.stats.resourceTiming.complete,true);assert.equal(a.stats.resourceTiming.transferSize,0);assert.equal(a.stats.resourceTiming.encodedBodySize,20834110);}
  else{assert.equal(a.stats.resourceTiming.complete,false);assert.equal(a.stats.resourceTiming.transferSize,null);assert.equal(a.stats.resourceTiming.encodedBodySize,null);}
  a.dispose();
 }
});
