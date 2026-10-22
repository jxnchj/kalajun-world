import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync, gunzipSync } from "node:zlib";
import assert from "node:assert/strict";
import * as THREE from "../../web/node_modules/three/build/three.module.js";
import { createSpruceLoader } from "../../web/src/v2/spruce-loading.js";
import { createVolumeSpruceFoliage } from "../../web/src/v2/spruce-volume.js";
import { createNearShell } from "../../web/src/v2/spruce-near-shell.js";
import { deriveBranchDetail, BRANCH_DETAIL } from "../../web/src/v2/spruce-branch-detail.js";
import { validateSpruceRecipe, validateSpruceRecipeSource } from "../../web/src/v2/spruce-recipe.js";
import { CANOPY_FORMS, CANOPY_CACHE_REVISION, canopyDigest, canopySourceDigests, encodeCanopyParts, SpruceCanopyCache } from "../../web/src/v2/spruce-canopy-cache.js";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../.."),output=path.join(root,"web/public/assets/v2"),started=performance.now();
const algorithmFiles=["web/src/v2/spruce-volume.js","web/src/v2/spruce-near-shell.js","web/src/v2/spruce-branch-detail.js","web/src/v2/spruce-canopy-cache.js","tools/blender/build_spruce_canopy_cache.mjs"];
const paths={hi:"web/public/assets/v2/schrenk-spruce-hi.glb",mid:"web/public/assets/v2/schrenk-spruce-mid.glb",recipe:"web/public/assets/v2/schrenk-spruce-needle.recipe.json.gz"};
const inputBytes=Object.fromEntries(await Promise.all(Object.entries(paths).map(async([key,file])=>[key,await fs.readFile(path.join(root,file))])));
const algorithmDigests=Object.fromEntries(await Promise.all(algorithmFiles.map(async file=>[file,await canopyDigest(await fs.readFile(path.join(root,file)))])));
const inputDigests=Object.fromEntries(await Promise.all(Object.entries(inputBytes).map(async([key,bytes])=>[key,await canopyDigest(bytes)])));
const recipeBytes=gunzipSync(inputBytes.recipe),recipe=validateSpruceRecipe(JSON.parse(recipeBytes));
const nearContract={volume:true,crown:true,branches:true,branchDetail:BRANCH_DETAIL};
const inputKey=await canopyDigest(new TextEncoder().encode(JSON.stringify({revision:CANOPY_CACHE_REVISION,inputDigests,algorithmDigests,nearContract})));
if(process.argv.includes("--check-inputs")){
 const manifest=JSON.parse(await fs.readFile(path.join(output,"spruce-canopy-v1.json"),"utf8"));assert.equal(manifest.inputKey,inputKey,"Canopy input or generator changed; regenerate the lossless cache.");console.log(JSON.stringify({status:"current",inputKey}));process.exit(0);
}
const loader=createSpruceLoader();loader.register(()=>({name:"TEXTURE_STUB",loadTexture:()=>Promise.resolve(new THREE.Texture())}));
const sources=Object.fromEntries(await Promise.all(["hi","mid"].map(async lod=>[lod,await loader.parseAsync(inputBytes[lod].buffer.slice(inputBytes[lod].byteOffset,inputBytes[lod].byteOffset+inputBytes[lod].byteLength),"")])));
await validateSpruceRecipeSource(sources.hi,recipe);
const sourceDigests=Object.fromEntries(await Promise.all(["hi","mid"].map(async lod=>[lod,await canopySourceDigests(sources[lod])])));
const parts={},partBuildMs={};let beforeBuild=performance.now();
for(const lod of["hi","mid","near"])for(let i=0;i<CANOPY_FORMS.length;i++){
 const form=CANOPY_FORMS[i],name=form+"_frond",source=sources[lod==="near"?"hi":lod].scene.getObjectByName(name).geometry,start=performance.now();
 parts[lod+":"+name]=lod==="near"?createNearShell(source,recipe.forms[form],{shape:true,volume:true,branchDetail:deriveBranchDetail(source,recipe.forms[form],i)}):createVolumeSpruceFoliage(source,{mid:lod==="mid"});
 partBuildMs[lod+":"+name]=performance.now()-start;
}
const geometryBuildMs=performance.now()-beforeBuild;
const encoded=encodeCanopyParts(parts,{inputKey,inputDigests,algorithmDigests,sourceDigests,nearContract,recipeDigest:await canopyDigest(recipeBytes)});
const payloadDigest=await canopyDigest(encoded.data),zipStart=performance.now(),compressed=gzipSync(encoded.data,{level:9}),gzipMs=performance.now()-zipStart;
encoded.manifest.payload={file:"spruce-canopy-v1-"+payloadDigest.slice(0,16)+".bin.gz",digest:payloadDigest,compressedBytes:compressed.byteLength};
const manifestBytes=new TextEncoder().encode(JSON.stringify(encoded.manifest)),manifestDigest=await canopyDigest(manifestBytes);
const roundtrip=new SpruceCanopyCache(JSON.parse(new TextDecoder().decode(manifestBytes)),new Uint8Array(gunzipSync(compressed)));
await Promise.all(["hi","mid"].map(lod=>roundtrip.verifySource(lod,sources[lod])));await roundtrip.verifyRecipe(recipeBytes,nearContract);
let verifiedArrays=0,verifiedBytes=0,totalTriangles=0,totalVertices=0;
for(const[key,original]of Object.entries(parts)){
 const[lod,name]=key.split(":"),cached=roundtrip.createGeometry(lod,name);
 assert.deepEqual(Object.keys(cached.attributes),Object.keys(original.attributes));
 for(const name of[...Object.keys(original.attributes),"index"]){
  const a=name==="index"?original.index:original.attributes[name],b=name==="index"?cached.index:cached.attributes[name];
  assert.equal(a.array.constructor,b.array.constructor);assert.equal(a.itemSize,b.itemSize);assert.equal(a.normalized,b.normalized);
  assert.equal(Buffer.compare(Buffer.from(a.array.buffer,a.array.byteOffset,a.array.byteLength),Buffer.from(b.array.buffer,b.array.byteOffset,b.array.byteLength)),0,key+"/"+name+" must remain bit-exact");
  verifiedArrays++;verifiedBytes+=a.array.byteLength;
 }
 assert.deepEqual(cached.userData,original.userData);assert.deepEqual(cached.groups,original.groups);assert.deepEqual(cached.drawRange,original.drawRange);
 assert.ok(cached.boundingBox.equals(original.boundingBox));assert.ok(cached.boundingSphere.equals(original.boundingSphere));
 totalTriangles+=cached.index.count/3;totalVertices+=cached.attributes.position.count;cached.dispose();
}
const backupDir=path.join(root,"backups/route-continuity-v19");
async function preserve(file){
 try{const destination=path.join(backupDir,path.relative(root,file));await fs.mkdir(path.dirname(destination),{recursive:true});await fs.copyFile(file,destination,fs.constants.COPYFILE_EXCL);}catch(error){if(!["ENOENT","EEXIST"].includes(error.code))throw error;}
}
const manifestPath=path.join(output,"spruce-canopy-v1.json"),buildPath=path.join(root,"web/src/v2/spruce-canopy-build.js");
await preserve(manifestPath);await preserve(buildPath);
await fs.writeFile(path.join(output,encoded.manifest.payload.file),compressed);
await fs.writeFile(manifestPath,manifestBytes);
await fs.writeFile(buildPath,"// Generated by tools/blender/build_spruce_canopy_cache.mjs; do not hand-edit.\nexport const SPRUCE_CANOPY_BUILD="+JSON.stringify({inputKey,manifestDigest})+";\n");
for(const g of Object.values(parts))g.dispose();
console.log(JSON.stringify({status:"generated-and-byte-verified",inputKey,payloadFile:encoded.manifest.payload.file,parts:Object.keys(parts).length,verifiedArrays,verifiedBytes,totalTriangles,totalVertices,decodedBytes:encoded.data.byteLength,compressedBytes:compressed.byteLength,manifestBytes:manifestBytes.byteLength,additionalTransferBytes:compressed.byteLength+manifestBytes.byteLength,geometryBuildMs,gzipMs,partBuildMs,totalMs:performance.now()-started},null,2));
