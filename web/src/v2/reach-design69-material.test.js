import test from 'node:test';import assert from 'node:assert/strict';import * as T from 'three';import {createTerrainMaterial} from './terrain-material.js';import {actualForestWorld} from '../../../tools/benchmark_forest_exclusion_v38.mjs';
import {installReachDesign69Material,reachDesign69Roughness,reachDesign69MineralFine,reachDesign69MaterialSource,projectReachDesign69} from './reach-design69-material.js';
const world=actualForestWorld(undefined,'rgba',{reachDesign69:'bend'});const compile=m=>{const s={uniforms:{},vertexShader:T.ShaderLib.standard.vertexShader,fragmentShader:T.ShaderLib.standard.fragmentShader};m.onBeforeCompile(s);return s;};
const pixels=(seed,n=16)=>Uint8Array.from({length:n},(_,i)=>(seed+i*17)%256);
function fixture(){
 const r=createTerrainMaterial(),m=r.material,previous=m.onBeforeCompile;
 const color=new T.DataArrayTexture(pixels(2,48),2,2,3),normal=new T.DataArrayTexture(pixels(5,48),2,2,3);
 color.colorSpace=T.SRGBColorSpace;normal.colorSpace=T.NoColorSpace;for(const t of [color,normal]){t.generateMipmaps=true;t.minFilter=T.LinearMipmapLinearFilter;t.wrapS=t.wrapT=T.RepeatWrapping;}
 const uniforms={terrainScanColors:{value:color},terrainScanNormals:{value:normal},terrainReferencesReady:{value:1}};
 m.onBeforeCompile=function(s,...args){previous.call(this,s,...args);Object.assign(s.uniforms,uniforms);};
 const asset={width:2,height:2,colorPixels:pixels(9),normalRoughPixels:pixels(11),disposed:false};
 return {r,m,color,normal,uniforms,asset,dispose(){m.dispose();color.dispose();normal.dispose();Object.values(r.textures).forEach(t=>t.dispose());}};
}

test('69 is dormant OFF, same private scan ownership, identical vertex shader and no new sampler/draw',()=>{
 const f=fixture(),before=compile(f.m),original=f.m.onBeforeCompile,key=f.m.customProgramCacheKey,owner=installReachDesign69Material(f.m,{world,assets:f.asset});try{
 assert.equal(f.m.onBeforeCompile,original);assert.deepEqual(compile(f.m),before);owner.setEnabled(true);const next=compile(f.m);assert.equal(next.vertexShader,before.vertexShader);
 const count=(s,r)=>(s.match(r)||[]).length;assert.equal(count(next.fragmentShader,/uniform\s+(?:highp\s+)?sampler\w+/g),count(before.fragmentShader,/uniform\s+(?:highp\s+)?sampler\w+/g));assert.equal(count(next.fragmentShader,/\btextureGrad\s*\(/g),count(before.fragmentShader,/\btextureGrad\s*\(/g)+2);
 assert.ok(next.fragmentShader.includes('reachWetRough69(reachBedRough66,terrainWetness,vTerrainHydrology.w,terrainShoreGrain)'));assert.ok(next.fragmentShader.includes('reachLandform69,terrainSlope)'));assert.ok(next.fragmentShader.includes('reachGradient41=reachGradient41*reachMix66.x+reachFineGradient66*reachMix66.y'));
 assert.ok(!/--\s*[\d.]/.test(next.fragmentShader.replace(/\/\/[^\n]*|\/\*[\s\S]*?\*\//g,'')),'negative scalar literals cannot become decrement tokens');
 assert.ok(!/\b(?:float|int|bool)\s+flat\b|[,;]\s*flat\s*=/.test(next.fragmentShader),'GLSL flat is an interpolation qualifier, not a variable');
 const a=next.uniforms.terrainScanColors.value,b=next.uniforms.terrainScanNormals.value;let disposed=0;a.addEventListener('dispose',()=>disposed++);b.addEventListener('dispose',()=>disposed++);owner.setEnabled(false);assert.equal(owner.uniform.value,0);owner.dispose();owner.dispose();assert.equal(disposed,2);assert.equal(f.m.onBeforeCompile,original);assert.equal(f.m.customProgramCacheKey,key);assert.deepEqual(compile(f.m),before);
 }finally{owner.dispose();f.dispose();}
});
test('actual morphology selects deposited inner bar and coarser steep opposite bank, not a continuous fine stripe',()=>{
 for(const [offset,inner]of [[-10.8,-1],[-2.1,1],[8.4,-1]]){const deposited=reachDesign69MineralFine(offset,inner*.5,.025,.02),scoured=reachDesign69MineralFine(offset,-inner*.5,-.2,.25);assert.ok(deposited>.8);assert.ok(scoured<.25);}
 assert.equal(reachDesign69Roughness(.8,0,-.1,.5),.8);assert.equal(reachDesign69Roughness(.8,1,.05,.5),.8);assert.ok(Math.abs(reachDesign69Roughness(.8,1,-.1,.5)-.52)<1e-12);
});
test('material station coordinates use the actual turning source sections; no independent ellipse facies',t=>{
 const source=reachDesign69MaterialSource(world),r=world.hydrology.forestReach39;let maxOffset=0,maxAcross=0,samples=0;
 for(const s of source.segments)for(const u of [.1,.3,.5,.7,.9]){const q=r.waterSectionAt(s,u);for(const f of [-.9,-.4,0,.4,.9]){const d=f*(f<0?q.left:q.right),x=q.x-q.fz*d,z=q.z+q.fx*d,p=r.queryAt(x,z),v=projectReachDesign69(source,x,z);maxOffset=Math.max(maxOffset,Math.abs(v[0]-(p.section.distance-r.origin)));maxAcross=Math.max(maxAcross,Math.abs(v[1]-p.signed));samples++;}}
 assert.ok(maxOffset<.001);assert.ok(maxAcross<.001);t.diagnostic(JSON.stringify({samples,maxOffset,maxAcross}));
});
