// Derived geometry snapshot for the editable Blender comparison source. The
// exact same createNearShell/createOpenCrownCore functions run in the browser.
import fs from 'node:fs/promises';import path from 'node:path';import {fileURLToPath} from 'node:url';import {gzipSync,gunzipSync} from 'node:zlib';import {createHash} from 'node:crypto';
import * as THREE from '../../web/node_modules/three/build/three.module.js';import {createSpruceLoader} from '../../web/src/v2/spruce-loading.js';import {validateSpruceRecipeSource} from '../../web/src/v2/spruce-recipe.js';import {createNearShell,createOpenCrownCore} from '../../web/src/v2/spruce-near-shell.js';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..'),dir=path.join(root,'assets/src/v2/spruce/gpu-v11');await fs.mkdir(dir,{recursive:true});
const bytes=await fs.readFile(path.join(root,'web/public/assets/v2/schrenk-spruce-hi.glb')),recipeBytes=await fs.readFile(path.join(root,'web/public/assets/v2/schrenk-spruce-needle.recipe.json.gz')),recipe=JSON.parse(gunzipSync(recipeBytes));
const loader=createSpruceLoader();loader.register(()=>({name:'NODE_TEXTURE_STUB',loadTexture:()=>Promise.resolve(new THREE.Texture())}));const hi=await loader.parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');await validateSpruceRecipeSource(hi,recipe);
const forms={};for(const [name,form]of Object.entries(recipe.forms)){
 const frond=createNearShell(hi.scene.getObjectByName(name+'_frond').geometry,form),core=createOpenCrownCore(hi.scene.getObjectByName(name+'_core').geometry),record=g=>({attributes:Object.fromEntries(Object.entries(g.attributes).map(([name,a])=>[name,Array.from(a.array)])),metadata:g.userData});
 forms[name]={sourceTriangles:form.sourceTriangles,brushClusters:form.instances.map(r=>r.cluster),frond:record(frond),core:record(core)};
}
const result={revision:'gpu-brush-crown-v11',coordinates:'Three x,y,z; Blender x,-z,y; UV v inverted',sourceHiSHA256:createHash('sha256').update(bytes).digest('hex'),recipeSHA256:createHash('sha256').update(recipeBytes).digest('hex'),forms};
const dest=path.join(dir,'near-shell.snapshot.json.gz');await fs.writeFile(dest,gzipSync(JSON.stringify(result),{level:6}));console.log(dest);
