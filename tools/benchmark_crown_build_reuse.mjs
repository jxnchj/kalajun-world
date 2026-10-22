import {readFile,writeFile} from 'node:fs/promises';
import {gunzipSync} from 'node:zlib';
import assert from 'node:assert/strict';
import * as THREE from '../web/node_modules/three/build/three.module.js';
import {createSpruceLoader} from '../web/src/v2/spruce-loading.js';
import {createVolumeSpruceFoliage} from '../web/src/v2/spruce-volume.js';
import {deriveBranchDetail} from '../web/src/v2/spruce-branch-detail.js';
// Compare the preserved round-30 implementation, not another flag in the new code.
const baselineURL=new URL('../backups/route-continuity-v31/loading/web/src/v2/spruce-volume.js',import.meta.url);
const baselineSource=(await readFile(baselineURL,'utf8')).replace("from 'three'","from '"+new URL('../web/node_modules/three/build/three.module.js',import.meta.url).href+"'").replace("from './spruce-geometry.js'","from '"+new URL('../web/src/v2/spruce-geometry.js',import.meta.url).href+"'");
const {createVolumeSpruceFoliage:baselineBuild}=await import('data:text/javascript;base64,'+Buffer.from(baselineSource).toString('base64'));
const loader=createSpruceLoader();loader.register(()=>({name:'TEXTURE_STUB',loadTexture:()=>Promise.resolve(new THREE.Texture())}));
const load=async lod=>{const b=await readFile(new URL('../web/public/assets/v2/schrenk-spruce-'+lod+'.glb',import.meta.url));return loader.parseAsync(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),'');};
const [hi,mid]=await Promise.all(['hi','mid'].map(load));
const recipe=JSON.parse(gunzipSync(await readFile(new URL('../web/public/assets/v2/schrenk-spruce-needle.recipe.json.gz',import.meta.url))));
const inputs=['hi','mid','near'].flatMap(lod=>Object.entries(recipe.forms).map(([name,form],i)=>{const source=(lod==='mid'?mid:hi).scene.getObjectByName(name+'_frond').geometry;return {id:lod+':'+name,source,options:{mid:lod==='mid',...(lod==='near'?{form,branchDetail:deriveBranchDetail(source,form,i)}:{})}};}));
let arrays=0,bytes=0,triangles=0;
for(const input of inputs){
 const old=baselineBuild(input.source,input.options),next=createVolumeSpruceFoliage(input.source,{...input.options,reuse:true});
 for(const key of [...Object.keys(old.attributes),'index']){const a=(key==='index'?old.index:old.attributes[key]),b=(key==='index'?next.index:next.attributes[key]);assert.equal(a.itemSize,b.itemSize);assert.equal(a.normalized,b.normalized);assert.equal(a.array.constructor,b.array.constructor);assert.deepEqual(new Uint8Array(a.array.buffer,a.array.byteOffset,a.array.byteLength),new Uint8Array(b.array.buffer,b.array.byteOffset,b.array.byteLength),input.id+'/'+key);arrays++;bytes+=a.array.byteLength;}
 assert.deepEqual(next.userData,old.userData);assert.ok(next.boundingBox.equals(old.boundingBox));assert.ok(next.boundingSphere.equals(old.boundingSphere));triangles+=old.index.count/3;old.dispose();next.dispose();
}
const rounds=[];
for(const reuse of [false,true,true,false,false,true,true,false]){const start=performance.now();for(const {source,options}of inputs)(reuse?createVolumeSpruceFoliage:baselineBuild)(source,{...options,reuse}).dispose();rounds.push({reuse,ms:performance.now()-start});}
const mean=reuse=>rounds.filter(r=>r.reuse===reuse).reduce((n,r)=>n+r.ms,0)/4;
const report={scope:'Node CPU geometry build only; real five forms x hi/mid/near, textures stubbed; not browser first frame',parts:inputs.length,arrays,bytes,triangles,exact:true,rounds,oldMeanMs:mean(false),newMeanMs:mean(true),improvement:1-mean(true)/mean(false)};
console.log(JSON.stringify(report,null,2));
if(process.argv[2])await writeFile(process.argv[2],JSON.stringify(report,null,2)+'\n');
