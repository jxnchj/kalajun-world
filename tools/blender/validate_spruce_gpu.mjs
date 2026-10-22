// Offline complete numeric/source validation; never builds the web app or changes
// a public asset. This report complements (does not replace) Chrome evidence.
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import * as THREE from '../../web/node_modules/three/build/three.module.js';
import {generateBrush} from '../../web/src/v2/spruce-brush.js';
import {buildBrushPacket,packetNeedleVertex} from '../../web/src/v2/spruce-brush-packet.js';
import {createSpruceLoader} from '../../web/src/v2/spruce-loading.js';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const dir=path.join(root,'assets/src/v2/spruce/gpu-v11');
const file=p=>fs.readFile(path.join(root,p));
const payload=await file('web/public/assets/v2/schrenk-spruce-needle.recipe.json.gz');
const recipe=JSON.parse(gunzipSync(payload));
const centres=[[557.5,376.5],[381.5,607.5],[563.5,679.5],[563.5,442.5]];
const error=()=>({positionMetres:0,normalAngleDegrees:0,uv:0,wind:0,ao:0,vertices:0});
function compare(e,p,n,uv,w,ao,actual){
 for(let k=0;k<3;k++){e.positionMetres=Math.max(e.positionMetres,Math.abs(p[k]-actual.position[k]));e.wind=Math.max(e.wind,Math.abs(w[k]-actual.wind[k]));}
 const dot=n.reduce((v,x,k)=>v+x*actual.normal[k],0)/(Math.hypot(...n)*Math.hypot(...actual.normal));
 e.normalAngleDegrees=Math.max(e.normalAngleDegrees,Math.acos(Math.max(-1,Math.min(1,dot)))*180/Math.PI);
 for(let k=0;k<2;k++)e.uv=Math.max(e.uv,Math.abs(uv[k]-actual.uv[k]));
 e.ao=Math.max(e.ao,Math.abs(ao-actual.ao));e.vertices++;
}
const needleError=error(),twigError=error(),forms={};let frameBytes=0,variationBytes=0,woodTextureBytes=0;
const start=performance.now();
for(const [name,form]of Object.entries(recipe.forms)){
 for(const record of form.instances){
  const packet=buildBrushPacket([record]);let needleCorner=0,woodCorner=0;
  generateBrush(record,(p,n,uv,w,ao)=>{
   if(uv[0]>558/2048&&uv[0]<559/2048){
    const [vertex,u,v]=packet.topology[woodCorner++],a=vertex*12,b=packet.wood;
    compare(twigError,p,n,uv,w,ao,{position:Array.from(b.subarray(a,a+3)),normal:Array.from(b.subarray(a+4,a+7)),wind:[b[a+7],b[a+8],b[a+9]],ao:b[a+3],uv:[u,v]});
   }else{
    const needle=Math.floor(needleCorner/3),corner=needleCorner%3,station=Math.floor(needle/5),pair=station<264?Math.floor(station/44):0,local=station<264?station%22:station-264;
    const c=centres[(local+needle%5+pair)%4],offset=[[-.3,.3],[.3,.3],[0,-.3]][corner],actual=packetNeedleVertex(packet,0,needle,corner);
    actual.uv=[Math.fround((c[0]+offset[0])/2048),Math.fround((c[1]+offset[1])/1024)];compare(needleError,p,n,uv,w,ao,actual);needleCorner++;
   }
  });
  assert.equal(needleCorner,4320);assert.equal(woodCorner,468);
 }
 const count=form.instances.length;frameBytes+=count*288*16*4;variationBytes+=count*288*12*4;woodTextureBytes+=Math.ceil(count*117*12/4096)*16384;
 forms[name]={brushes:count,needles:count*1440,brushTriangles:count*1596};console.log('complete numeric comparison',name,count);
}
assert.equal(needleError.vertices,1143*1440*3);assert.equal(twigError.vertices,1143*156*3);
assert.ok(needleError.positionMetres<1e-5);assert.ok(needleError.normalAngleDegrees<.1);assert.ok(needleError.wind===0);assert.ok(needleError.ao<6e-8);assert.ok(needleError.uv<6e-8);
assert.ok(twigError.positionMetres===0);assert.ok(twigError.normalAngleDegrees<.001);assert.ok(twigError.wind===0);assert.ok(twigError.ao<6e-8);assert.ok(twigError.uv===0);
const snapshot=JSON.parse(gunzipSync(await fs.readFile(path.join(dir,'near-shell.snapshot.json.gz'))));
const shellBytes=await fs.readFile(path.join(dir,'schrenk-spruce-near-shell.glb'));
const loader=createSpruceLoader();loader.register(()=>({name:'NODE_TEXTURE_STUB',loadTexture:()=>Promise.resolve(new THREE.Texture())}));
const shell=await loader.parseAsync(shellBytes.buffer.slice(shellBytes.byteOffset,shellBytes.byteOffset+shellBytes.byteLength),'');
const shellErrors={position:0,normalAngleDegrees:0,uv:0,_plant_wind:0,_crown_occlusion:0};let sourceMeshes=0,sourceTriangles=0;const materials=new Set();
shell.scene.traverse(o=>{if(!o.isMesh)return;sourceMeshes++;materials.add(o.material);sourceTriangles+=(o.geometry.index?.count??o.geometry.attributes.position.count)/3;});
for(const [name,form]of Object.entries(snapshot.forms))for(const part of ['frond','core']){
 const actual=shell.scene.getObjectByName(name+'_'+part).geometry,expected=form[part].attributes,indices=actual.index?.array,count=indices?.length??actual.attributes.position.count;
 assert.equal(count,expected.position.length/3);
 for(const [key,width]of [['position',3],['uv',2],['_plant_wind',3],['_crown_occlusion',1]]){
  const a=actual.attributes[key].array,b=expected[key];for(let i=0;i<count;i++)for(let k=0;k<width;k++){const value=a[(indices?indices[i]:i)*width+k];assert.ok(Number.isFinite(value));if(key==='uv'){const original=b[i*width+k],roundTrip=k===1?Math.fround(1-Math.fround(1-original)):original;assert.equal(value,roundTrip,'Blender glTF UV round trip');}shellErrors[key]=Math.max(shellErrors[key],Math.abs(value-b[i*width+k]));}
 }
 const a=actual.attributes.normal.array,b=expected.normal;for(let i=0;i<count;i++){const j=(indices?indices[i]:i)*3,k=i*3,d=(a[j]*b[k]+a[j+1]*b[k+1]+a[j+2]*b[k+2])/(Math.hypot(a[j],a[j+1],a[j+2])*Math.hypot(b[k],b[k+1],b[k+2]));assert.ok(Number.isFinite(d));shellErrors.normalAngleDegrees=Math.max(shellErrors.normalAngleDegrees,Math.acos(Math.max(-1,Math.min(1,d)))*180/Math.PI);}
}
assert.equal(sourceMeshes,15);assert.equal(materials.size,3);assert.equal(sourceTriangles,292008);assert.equal(shellErrors.position,0);assert.ok(shellErrors.uv<=2.9802322387695312e-8);assert.equal(shellErrors._plant_wind,0);assert.equal(shellErrors._crown_occlusion,0);assert.ok(shellErrors.normalAngleDegrees<.1);
const sourceReport=JSON.parse(await fs.readFile(path.join(dir,'gpu-source-report.json')));
for(const [name,data]of Object.entries(forms))data.fullTreeTriangles=['bark','core','frond'].reduce((n,part)=>n+sourceReport.forms[name+'_'+part].triangles,0);
const assets={};for(const name of await fs.readdir(dir)){const f=path.join(dir,name);if(!(await fs.stat(f)).isFile()||name==='gpu-brush-validation.json')continue;const b=await fs.readFile(f);assets[name]={bytes:b.length,sha256:createHash('sha256').update(b).digest('hex')};}
const report={revision:'gpu-brush-crown-v11',runtime:{default:'stations',representation:'GPU shared five-needle station and shared 156-triangle twig geometry; same immutable form attributes reused across tree roots',runtimePayloadBytes:payload.length,recipeJSONBytes:gunzipSync(payload).length,hiGLBBytes:(await fs.stat(path.join(root,'web/public/assets/v2/schrenk-spruce-hi.glb'))).size,midGLBBytes:(await fs.stat(path.join(root,'web/public/assets/v2/schrenk-spruce-mid.glb'))).size,generatedNeedleVertexArraysBytes:0,previousExpandedFrondBytes:269858880,frameAttributeBytes:frameBytes,variationAttributeBytes:variationBytes,woodTextureBytesPadded:woodTextureBytes,sharedParameterBytes:frameBytes+variationBytes+woodTextureBytes,allocatedTemplateBytes:290880,nearShellFrondBytes:267872*3*12*4,nearCoreBytes:5*600*3*12*4,totalNeedleAndChangedShellBytes:frameBytes+variationBytes+woodTextureBytes+290880+267872*3*12*4+5*600*3*12*4,scope:'Parameter/template bytes exclude the common hi/mid assets, changed near shell, shared colour/normal textures, driver copies and per-root matrix/wind arrays.',mainNeedleVertexTextureFetches:0,twigVertexTextureFetches:3,activeAttributeSlotsObservedByChrome:13,needleTemplateTriangles:5,twigTemplateTriangles:156,brushes:1143,needlesPerBrush:1440,totalNeedles:1645920,totalFullTreeTriangles:Object.values(forms).reduce((n,f)=>n+f.fullTreeTriangles,0),forms},completeNumericComparison:{method:'All 1143 brushes against generateBrush, using the JS mirror of station vertex equations with the actual Float32 parameter arrays. This is not a bitwise capture of GPU GLSL arithmetic.',needle:needleError,twig:twigError,elapsedMs:performance.now()-start,originalBlenderReference:'Full CPU recipe versus original realised Blender GLB separately passed in spruce-recipe.test.js: all positions <=14.543533325195312 micrometres, normals <=0.16039657633072837 degrees; see final test log. Do not mislabel these as GPU transform-feedback measurements.'},editableSource:{realised:'schrenk-spruce-needle-gpu.blend',shell:'schrenk-spruce-near-shell.blend',comparisonGLB:'schrenk-spruce-near-shell.glb',generationCommand:'tools/.bpy/bin/python tools/blender/v2_spruce.py --gpu-existing --preview --preview-variant pencil',manualGLBExportCommand:'tools/.bpy/bin/python tools/blender/v2_spruce.py --export-gpu-existing',sourceContract:'Default runtime consumes verified hi control geometry + the compact recipe + spruce-near-shell.js. The realised .blend contains all needles and the new shell for editing/inspection. Arbitrary hand edits of realised vertices do not automatically modify the compact GPU recipe: export explicitly as full source GLB, or port edits into control/template sources and regenerate.',sourceGLBValidation:{uvVerification:'Every exported UV equals the exact Float32 Blender V-axis double inversion; raw V differences are at most 2^-25.',meshes:sourceMeshes,materials:materials.size,triangles:sourceTriangles,errors:shellErrors,note:'Comparison GLB intentionally contains only bark/open core/curved residual shell; GPU brush needles are in the complete editable .blend and runtime recipe, not duplicated into this GLB.'}},assets,tests:{passed:259,total:259,log:'tools/tmp/gpu-brush-final-tests.log',coverage:['GPU and CPU recipe geometry','actual Three WebGLGeometries shared VBO retirement','root identity and compaction','source crown bounds and LOD','main/depth hooks','CSM wind cadence invalidation','worker abort/messageerror/pre-abort/failure','source attribute fingerprint validation']},browserEvidence:'docs/previews/v2-gpu-brush/final-evidence.json',remainingLimits:['Remaining side/hanging photo sprays use subdivided bowed alpha meshes; their photo edges may still look like cards close up.','Needle geometry density, random variation and all 1143 brushes remain; station rendering retains per-vertex trigonometry and normalization. GPU time must be read from same-session Chrome evidence, not inferred from transfer or startup savings.','The full editable Blender source is deliberately expanded offline; its storage size is not the website download size.','Bounded conservative root/crown frustums may submit branches outside the visible part of a tree. No branch detail is removed.','The API does not silently fall back to CPU expansion on worker or validation errors.']};
const dest=path.join(dir,'gpu-brush-validation.json');await fs.writeFile(dest,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({report:dest,needleError,twigError,shellErrors,sharedParameterBytes:report.runtime.sharedParameterBytes},null,2));
