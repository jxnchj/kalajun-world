import test from 'node:test';import assert from 'node:assert/strict';import * as T from 'three';
import {createShadowDiagnosticCamera,decodeShadowDepthBytes} from './shadow-depth-diagnostic.js';
test('depth diagnostic camera supports the installed renderer reverse-depth projection refresh',()=>{
 for(const reversed of[false,true]){const camera=createShadowDiagnosticCamera(reversed);assert.ok(camera.isOrthographicCamera);assert.equal(camera.reversedDepth,reversed);camera.updateProjectionMatrix();assert.ok(camera.projectionMatrix.elements.every(Number.isFinite));assert.equal(new T.Vector3(0,0,0).applyMatrix4(camera.projectionMatrix).z,reversed?1:-1);assert.equal(new T.Vector3(0,0,-1).applyMatrix4(camera.projectionMatrix).z,reversed?0:1);}
});
test('export bytes decode exact shader-normalized float depth including reversed clear zero',()=>{const bytes=new Uint8Array(20),view=new DataView(bytes.buffer),values=[0,1,.25,.123456,Number.MIN_VALUE];values.forEach((v,i)=>view.setFloat32(i*4,v,true));assert.deepEqual(decodeShadowDepthBytes(bytes),new Float32Array(values));});
