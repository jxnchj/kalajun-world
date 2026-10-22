import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { CSM } from "three/addons/csm/CSM.js";
import { Sky } from "three/addons/objects/Sky.js";
import { configureCSMDepth, skyFarDepth, shadowDepthBias } from "./depth-mode.js";
function camera(reverse){const c=new THREE.PerspectiveCamera(52,1453/785,.25,150000);c._reversedDepth=reverse;c.updateProjectionMatrix();return c;}
test("full-range reversed projection retains the same visible world and centimetre-separated Float32 distant depth",()=>{
 const a=camera(false),b=camera(true);
 const frustums=[a,b].map(c=>new THREE.Frustum().setFromProjectionMatrix(c.projectionMatrix,c.coordinateSystem,c.reversedDepth));
 for(const z of [-.1,-.25,-1,-10,-100,-1000,-40000,-80000,-149999,-160000])
  for(const x of [0,Math.abs(z)*.2,Math.abs(z)*2])assert.equal(frustums[0].containsPoint(new THREE.Vector3(x,0,z)),frustums[1].containsPoint(new THREE.Vector3(x,0,z)));
 for(const d of [1,100,1000,40000,80000]){
  const front=new THREE.Vector3(0,0,-d).applyMatrix4(b.projectionMatrix).z;
  const back=new THREE.Vector3(0,0,-d-.02).applyMatrix4(b.projectionMatrix).z;
  assert.ok(Math.fround(front)>Math.fround(back),"2cm separation at "+d+"m");
 }
});
test("world CSM adapter retains physical split corners and supports perspective and orthographic shadow projections",()=>{
 const cascades=[false,true].map(reverse=>{const c=camera(reverse),scene=new THREE.Scene();const csm=new CSM({camera:c,parent:scene,cascades:3,maxFar:500,mode:"custom",customSplitsCallback:(n,a,b,x)=>x.push(60/b,180/b,1)});csm.fade=true;configureCSMDepth(csm,c);return csm;});
 for(let i=0;i<3;i++)for(const side of ["near","far"])for(let j=0;j<4;j++)
  assert.ok(cascades[0].frustums[i].vertices[side][j].distanceTo(cascades[1].frustums[i].vertices[side][j])<1e-7);
 for(const csm of cascades){for(const l of csm.lights)assert.equal(l.shadow.camera.reversedDepth,csm.camera.reversedDepth);csm.dispose();csm.remove();}
 const sky=skyFarDepth(Sky.SkyShader.vertexShader);assert.match(sky,/#ifdef USE_REVERSED_DEPTH_BUFFER\s+gl_Position.z = 0.0;/);assert.match(sky,/#else\s+gl_Position.z = gl_Position.w;/);
});

test("PCF receiver bias preserves the same visibility under reversed comparisons",()=>{
 for(const value of [-.00008,.000002])for(const receiver of [.4999,.5,.5001]){
  const ordinary=receiver+shadowDepthBias(value,false)<=.5;
  const reversed=(1-receiver)+shadowDepthBias(value,true)>=.5;
  assert.equal(reversed,ordinary);
 }
});
