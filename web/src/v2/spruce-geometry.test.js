import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { createFarSpruceGeometry, setFarSpruceAttributes, SPRUCE_SPEC, spruceRadius, installFarSpruceShape } from "./spruce-geometry.js";
import { attachEcologyWind } from "./ecology.js";

test("far crowns spend the original 104 triangles on irregular branch tiers within the shared envelope", () => {
  const g=createFarSpruceGeometry(),p=g.attributes.position,n=g.attributes.normal;
  assert.equal(g.index.count/3,104); assert.equal(p.count,73);
  for(let j=0;j<=8;j++){
    const a=j*7,b=a+6;
    for(const attr of[p,n]) assert.ok(new THREE.Vector3().fromBufferAttribute(attr,a).distanceTo(new THREE.Vector3().fromBufferAttribute(attr,b))<1e-6,"closed seam, including its lighting");
  }
  for(let i=0;i<p.count;i++){
    const normal=new THREE.Vector3().fromBufferAttribute(n,i);
    assert.ok(Number.isFinite(normal.x)&&Number.isFinite(normal.y)&&Number.isFinite(normal.z));
    assert.ok(Math.abs(normal.length()-1)<1e-6);
  }
  const widthAtBase=[];
  for(let k=0;k<6;k++){
    assert.equal(p.getY(k),0);
    widthAtBase.push(Math.hypot(p.getX(k),p.getZ(k)));
    assert.ok(Math.abs(widthAtBase[k]-(1+.09*Math.sin(k*2.4)))<1e-6,"unchanged crown base width");
  }
  for(const form of SPRUCE_SPEC.variants){
    for(let k=0;k<6;k++){
      const radii=[];
      for(let j=0;j<=8;j++){
        const i=j*7+k,t=p.getY(i)/18,y=form.base+(18-form.base)*t;
        const r=spruceRadius(form,y),asym=1+form.side*p.getX(i)/Math.hypot(p.getX(i),p.getZ(i));
        const shaped=new THREE.Vector3(p.getX(i)*r*asym+form.lean*y,y,p.getZ(i)*r*asym);
        assert.ok(g.boundingBox.containsPoint(shaped),"all shaped variants remain inside the existing culling envelope");
        radii.push(Math.hypot(p.getX(i),p.getZ(i))*r);
      }
      let notches=0;
      for(let j=1;j<8;j++) if(radii[j]<radii[j-1]&&radii[j]<radii[j+1])notches++;
      assert.ok(notches>=2,form.id+" must retain visible tier breaks in every sector");
    }
  }
  for(let j=1;j<8;j++){
    const heights=Array.from({length:6},(_,k)=>p.getY(j*7+k));
    assert.ok(Math.max(...heights)-Math.min(...heights)>.1,"tier edges must not be perfectly horizontal collars");
  }
  // The trunk is still the same rooted 4-sided strip, with no change of tree origin.
  for(let k=63;k<p.count;k++) assert.equal(g.attributes.aCrownMask.getX(k),0);
  assert.equal(p.getY(63),0); assert.equal(p.getY(68),4);
  g.dispose();
});

test("far crown forms keep instance order and use the same shaped height in colour and depth wind", () => {
  const order=[3,0,4,1,2,3],records=order.map(variant=>({variant})),g=createFarSpruceGeometry();
  setFarSpruceAttributes(g,records);
  for(let i=0;i<order.length;i++){
    const f=SPRUCE_SPEC.variants[order[i]];
    assert.deepEqual(Array.from(g.attributes.aSpruceForm.array.slice(i*4,i*4+4)),[f.rmax,f.base,f.pw,f.lean].map(Math.fround));
    assert.deepEqual(Array.from(g.attributes.aSpruceAsym.array.slice(i*2,i*2+2)),[f.side,f.seed].map(Math.fround));
  }
  const uniforms={uWindTime:{value:2},uWorldViewer:{value:new THREE.Vector3()},uPlantRange:{value:2200}};
  const shaderFor=(material,library)=>{
    attachEcologyWind(material,uniforms,0); installFarSpruceShape(material);
    const shader={uniforms:{},vertexShader:library.vertexShader,fragmentShader:library.fragmentShader};
    material.onBeforeCompile(shader);
    assert.match(material.customProgramCacheKey(),/layered-envelope-v2/);
    assert.equal((shader.vertexShader.match(/float shapedHeight=/g)||[]).length,1);
    assert.match(shader.vertexShader,/ecoBend\(shapedHeight,ecoWeights,ecoRoot\(\)\)/);
    assert.doesNotMatch(shader.vertexShader,/ecoBend\(position.y,ecoWeights,ecoRoot\(\)\);/);
    assert.match(shader.vertexShader,/transformed.y=aSpruceForm.y/);
    assert.match(shader.vertexShader,/transformed.xz \+= ecoOffset/);
    assert.ok(shader.vertexShader.indexOf("ECO_LOD_EARLY_END")<shader.vertexShader.indexOf("float shapedHeight="),"fully rejected trees still leave before deformation");
    return shader;
  };
  const colorMaterial=new THREE.MeshStandardMaterial(),depthMaterial=new THREE.MeshDepthMaterial();
  const color=shaderFor(colorMaterial,THREE.ShaderLib.standard),depth=shaderFor(depthMaterial,THREE.ShaderLib.depth);
  assert.match(color.vertexShader,/vec3 sourceNormal=objectNormal/);
  assert.match(color.vertexShader,/radialGradient/);
  assert.match(color.vertexShader,/ecoOffset\*2.\/max\(.15,shapedHeight\)/);
  const shapeCode=s=>s.vertexShader.match(/#include <begin_vertex>\nif\(aCrownMask>\.5\)\{[\s\S]*?transformed.x\+=aSpruceForm.w\*transformed.y;/)[0];
  assert.equal(shapeCode(color),shapeCode(depth));
  assert.match(color.fragmentShader,/n<middleTree/);assert.match(depth.fragmentShader,/n<middleTree/);
  g.dispose();colorMaterial.dispose();depthMaterial.dispose();
});
