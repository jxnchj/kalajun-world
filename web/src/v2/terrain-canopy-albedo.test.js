import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
const source=String.raw`
 globalThis.location={search:process.argv[1]};
 const THREE=await import('three'),{createTerrainMaterial}=await import('./terrain-material.js');
 const {material,textures}=createTerrainMaterial();
 const s={uniforms:{},vertexShader:THREE.ShaderLib.standard.vertexShader,fragmentShader:THREE.ShaderLib.standard.fragmentShader};
 material.onBeforeCompile(s);console.log(JSON.stringify({fragment:s.fragmentShader,mode:material.userData.terrainCanopyAlbedo}));material.dispose();Object.values(textures).forEach(t=>t.dispose());
`;
test('physical canopy keeps exact field, pigmentation and physical G terms, removing only ground-only painted luminance',()=>{
 const run=query=>JSON.parse(execFileSync(process.execPath,['--input-type=module','-e',source,query],{cwd:new URL('.',import.meta.url),encoding:'utf8'}));
 const a=run('?canopyAlbedo=v37'),b=run('?canopyAlbedo=physical'),normal=run('');
 assert.deepEqual(normal,b,'accepted physical path is the default');
 const painted='terrainGrassColor*=mix(1.,mix(.88,1.06,smoothstep(.24,.76,terrainSward)),\n    terrainSwardWeight*meadowColourResolved(terrainFootprint));';
 assert.equal(a.mode,'v37');assert.equal(b.mode,'physical');assert.ok(a.fragment.includes(painted));assert.ok(!b.fragment.includes(painted));
 assert.equal(b.fragment,a.fragment.replace(painted,''));
 for(const term of ['meadowCanopyColor(terrainMeadowFeatures)','terrainSwardHeight=(terrainSward-.5)*.16','terrainMeadowFeatures.g-.5','terrainGrassValue.r','meadowLandformTint(vTerrainLandform)*meadowCommunityTint(vTerrainCommunity)'])assert.ok(b.fragment.includes(term),term+' remains');
});
