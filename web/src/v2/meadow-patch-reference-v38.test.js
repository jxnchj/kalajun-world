import {BoardwalkPlantContact39} from './boardwalk-plant-contact39.js';
import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import {gunzipSync} from 'node:zlib';import {createHash} from 'node:crypto';import * as T from 'three';
import {createMeadowPatchReference38,analyzeMeadowCapture38,createMeadowCaptureProbe38} from './meadow-patch-reference-v38.js';
import {actualMeadowEcology} from '../../../tools/profile-meadow-v38.mjs';import {meadowGeometry} from './ecology.js';
const data=JSON.parse(gunzipSync(fs.readFileSync(new URL('../../public/assets/v2/meadow-reference-v38/source.json.gz',import.meta.url))));
test('independent source keeps every real 8m-patch root and all original near/middle geometry attributes',()=>{
 const eco=actualMeadowEcology();try{const roots=[];for(let z=Math.floor((data.center[2]-4)/.8);z<=Math.ceil((data.center[2]+4)/.8);z++)for(let x=Math.floor((data.center[0]-4)/.8);x<=Math.ceil((data.center[0]+4)/.8);x++){const r=eco.grassAt(x,z);if(r&&Math.abs(r.x-data.center[0])<=4&&Math.abs(r.z-data.center[2])<=4)roots.push(r);}
 assert.equal(roots.length,54);assert.equal(data.roots.length,roots.length);for(let i=0;i<roots.length;i++)for(const k of ['id','x','y','z','s','sy','rot'])assert.equal(data.roots[i][k],roots[i][k]);
 for(const [name,near]of [['near',true],['middle',false]]){const g=meadowGeometry(near);assert.deepEqual(data.geometry[name].index,Array.from(g.index.array));for(const[k,a]of Object.entries(g.attributes))assert.deepEqual(data.geometry[name].attributes[k].array,Array.from(a.array));g.dispose();}
 for(const s of data.sources)assert.equal(createHash('sha256').update(fs.readFileSync(new URL('../../../'+s.path,import.meta.url))).digest('hex'),s.sha256);
 }finally{eco.dispose();}
});
test('adopted boardwalk moves one old patch root outside the window without removing identity or detail',()=>{
 const old=actualMeadowEcology(),current=actualMeadowEcology();old.boardwalkPlantContact39=new BoardwalkPlantContact39(old.world,{enabled:false});let count=0,outside=0;const inside=[];
 try{for(let z=Math.floor((data.center[2]-4)/.8);z<=Math.ceil((data.center[2]+4)/.8);z++)for(let x=Math.floor((data.center[0]-4)/.8);x<=Math.ceil((data.center[0]+4)/.8);x++){
  const a=old.grassAt(x,z),b=current.grassAt(x,z);assert.equal(Boolean(a),Boolean(b));if(!a||Math.abs(a.x-data.center[0])>4||Math.abs(a.z-data.center[2])>4)continue;count++;
  for(const k of ['id','s','sy','rot'])assert.equal(a[k],b[k]);if(Math.abs(b.x-data.center[0])>4||Math.abs(b.z-data.center[2])>4){outside++;assert.ok(b.boardwalkMove>0);assert.equal(current.boardwalkPlantContact39.intersects(b,current.shoreGrassEnvelope),false);}else inside.push(b.id);
 }assert.equal(count,55);assert.equal(outside,1);assert.deepEqual(data.roots.map(r=>r.id),inside);
 }finally{old.dispose();current.dispose();}
});
test('capture preserves renderer after failure and derives pigment/stem rules from actual original hooks',()=>{
 const x=createMeadowPatchReference38(data),shader={uniforms:{},vertexShader:T.ShaderLib.standard.vertexShader,fragmentShader:T.ShaderLib.standard.fragmentShader};x.mesh.material.onBeforeCompile(shader,{});
 assert.ok(shader.vertexShader.includes('ecoHash(floor(ecoRoot().xz*.71)+13.)>.14'));assert.ok(shader.vertexShader.includes('vec2 ecoOffset=vec2(0.)'));assert.ok(shader.fragmentShader.includes('meadowCanopyColor(meadowCommunityFeatures('));assert.ok(shader.fragmentShader.includes('getShadowMask()'));assert.equal(shader.fragmentShader.match(/#include <packing>/g)?.length,1);
 let target={original:true},color=new T.Color(.1,.2,.3),alpha=.3;const renderer={autoClear:false,shadowMap:{enabled:false,type:T.PCFShadowMap,autoUpdate:false},toneMapping:T.ACESFilmicToneMapping,xr:{enabled:true},getRenderTarget:()=>target,setRenderTarget:t=>{target=t;},getClearColor:c=>c.copy(color),getClearAlpha:()=>alpha,setClearColor:(c,a)=>{color=new T.Color(c);alpha=a;},clear(){},render(){throw Error('synthetic GPU failure');}};const original=target;
 assert.throws(()=>x.capture(renderer,{elevations:[25],azimuths:[0]}),/synthetic GPU/);assert.equal(target,original);assert.equal(renderer.xr.enabled,true);assert.equal(renderer.autoClear,false);assert.equal(renderer.shadowMap.enabled,false);assert.equal(renderer.shadowMap.type,T.PCFShadowMap);assert.equal(renderer.shadowMap.autoUpdate,false);assert.equal(renderer.toneMapping,T.ACESFilmicToneMapping);assert.equal(alpha,.3);x.dispose();
});
test('direction-energy check rejects incorrect reconstructed normals rather than accepting a plausible screenshot',()=>{
 const frame={elevation:25,azimuth:0,channels:[new Uint8Array([128,128,128,255]),new Uint8Array([128,255,128,255])],groundTransmission:new Uint8Array(4),lights:[{direction:[0,1,0],response:new Uint8Array([255,255,255,255]),visibility:new Uint8Array([255,255,255,255])}]};assert.equal(analyzeMeadowCapture38({frames:[frame]}).accepted,true);frame.channels[1]=new Uint8Array([128,0,128,255]);assert.equal(analyzeMeadowCapture38({frames:[frame]}).accepted,false);
});

test('capture separates exact center depth from MSAA coverage and saves the renderer-updated projection',()=>{
 const lab=createMeadowPatchReference38(data,{resolution:32});let target=null;const samples=[];
 const renderer={autoClear:false,capabilities:{},shadowMap:{enabled:false,type:T.PCFShadowMap,autoUpdate:false},toneMapping:T.ACESFilmicToneMapping,xr:{enabled:false},info:{render:{calls:2}},getRenderTarget:()=>target,setRenderTarget:t=>{target=t;},getClearColor:c=>c.set(0),getClearAlpha:()=>1,setClearColor(){},clear(){},render(scene,camera){camera._reversedDepth=true;camera.updateProjectionMatrix();},readRenderTargetPixels(t,x,y,w,h,bytes){samples.push(t.samples);bytes.fill(255);}};
 const cap=lab.capture(renderer,{elevations:[25],azimuths:[0],lightDirections:[]});
 assert.deepEqual(samples,[4,4,0,0,4]);assert.equal(cap.frames[0].zeroToOneDepth,true);assert.equal(cap.frames[0].depthSamples,0);
 const camera=new T.OrthographicCamera(-6,6,6,-6,.1,40);camera._reversedDepth=true;camera.updateProjectionMatrix();assert.deepEqual(cap.frames[0].projectionMatrix,camera.projectionMatrix.toArray());
 const probe=createMeadowCaptureProbe38(cap);assert.equal(probe.material.uniforms.captureZeroToOne.value,1);assert.equal(probe.textures.length,4);probe.dispose();
 cap.frames[0].depthSamples=4;assert.throws(()=>createMeadowCaptureProbe38(cap),/unaveraged depth/);
 const perspective=lab.capture(renderer,{singleSample:true,perspectiveDistance:70,elevations:[25],azimuths:[0],lightDirections:[]}),pc=new T.PerspectiveCamera(2*Math.atan(6/70)*180/Math.PI,1,.1,90);pc._reversedDepth=true;pc.updateProjectionMatrix();assert.deepEqual(perspective.frames[0].projectionMatrix,pc.projectionMatrix.toArray());assert.equal(perspective.frames[0].colorSamples,0);assert.equal(perspective.frames[0].perspectiveDistance,70);lab.dispose();
});
