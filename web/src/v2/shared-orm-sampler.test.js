import test from 'node:test';
import assert from 'node:assert/strict';
import {Texture,MeshStandardMaterial,ShaderLib,ShaderChunk} from 'three';
import {sharedOrmSamplerEligible,installSharedOrmSampler} from './shared-orm-sampler.js';
test('ORM sampler preserves original channel and transforms',()=>{
 const texture=new Texture();texture.channel=1;texture.offset.set(.2,.4);texture.repeat.set(2,3);texture.rotation=.3;texture.updateMatrix();
 const m=new MeshStandardMaterial({roughnessMap:texture,metalnessMap:texture});
 const before=texture.matrix.elements.slice();assert.ok(sharedOrmSamplerEligible(m));
 const shader={fragmentShader:ShaderLib.standard.fragmentShader};installSharedOrmSampler(shader);
 assert.match(shader.fragmentShader,/texture2D\( roughnessMap, vMetalnessMapUv \)/);
 assert.match(shader.fragmentShader,/texelMetalness.b/);
 assert.deepEqual(texture.matrix.elements,before);assert.equal(texture.channel,1);
 m.metalnessMap=texture.clone();assert.equal(sharedOrmSamplerEligible(m),true);
 m.metalnessMap=null;assert.equal(sharedOrmSamplerEligible(m),false);
});
test('shared shader has precisely the original blue channel expression and removes only duplicate sampler',()=>{
 const shader={fragmentShader:ShaderLib.standard.fragmentShader};installSharedOrmSampler(shader);
 assert.ok(!shader.fragmentShader.includes('#include <metalnessmap_pars_fragment>'));
 assert.ok(shader.fragmentShader.includes('#include <roughnessmap_pars_fragment>'));
 assert.ok(shader.fragmentShader.includes(ShaderChunk.metalnessmap_fragment.replace(/\bmetalnessMap\b/g,'roughnessMap')));
 assert.throws(()=>installSharedOrmSampler({fragmentShader:''}),/contract changed/);
});

test('GLTF texture clones share only identical source and complete GPU sampling state',()=>{
 const a=new Texture({width:2,height:2}),b=a.clone();
 const m=new MeshStandardMaterial({roughnessMap:a,metalnessMap:b});
 b.offset.set(.4,.1);b.channel=1;b.rotation=.5;b.updateMatrix();
 assert.ok(sharedOrmSamplerEligible(m),'independent UV varying is retained');
 for(const key of ['wrapS','wrapT','magFilter','minFilter','anisotropy','format','type','generateMipmaps','premultiplyAlpha','flipY','unpackAlignment','colorSpace']){
  const original=b[key];b[key]=typeof original==='number'?original+1:typeof original==='boolean'?!original:'different';
  assert.equal(sharedOrmSamplerEligible(m),false,key);b[key]=original;
 }
 b.source=new Texture(a.image).source;assert.equal(sharedOrmSamplerEligible(m),false,'shared pixels alone do not imply shared update lifetime');b.source=a.source;
 b.mipmaps=[{}];assert.equal(sharedOrmSamplerEligible(m),false);b.mipmaps=[];
 b.isRenderTargetTexture=true;assert.equal(sharedOrmSamplerEligible(m),false);
});
