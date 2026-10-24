import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {gzipSync} from 'node:zlib';
const base=new URL('../web/public/assets/v2/',import.meta.url),out=new URL('spruce/shared-v38/',base),sha=b=>createHash('sha256').update(b).digest('hex');
const transport=JSON.parse(readFileSync(new URL('glb-transport-manifest.json',base))),images=new Map(),manifest={version:1,images:[],lods:{},scope:'Exact original geometry/accessors/materials; embedded PNG bytes externalized once without image re-encoding'};
mkdirSync(new URL('images/',out),{recursive:true});
function parse(bytes){const n=bytes.readUInt32LE(12);return {json:JSON.parse(bytes.subarray(20,20+n)),binary:bytes.subarray(28+n)};}
function encode(json,binary){const raw=Buffer.from(JSON.stringify(json)),n=Math.ceil(raw.length/4)*4,total=28+n+binary.length,b=Buffer.alloc(total);b.writeUInt32LE(0x46546c67);b.writeUInt32LE(2,4);b.writeUInt32LE(total,8);b.writeUInt32LE(n,12);b.writeUInt32LE(0x4e4f534a,16);b.fill(32,20,20+n);raw.copy(b,20);b.writeUInt32LE(binary.length,20+n);b.writeUInt32LE(0x004e4942,24+n);binary.copy(b,28+n);return b;}
for(const lod of ['hi','mid']){
 const name='schrenk-spruce-'+lod+'.glb',source=readFileSync(new URL(name,base)),original=parse(source),json=structuredClone(original.json),removed=new Set(),remap=new Map(),views=[],chunks=[];let offset=0;
 assert.equal(json.buffers.length,1);assert.equal(json.extensionsUsed,undefined);
 for(const image of json.images){assert.ok(Number.isInteger(image.bufferView));const view=json.bufferViews[image.bufferView],bytes=original.binary.subarray(view.byteOffset||0,(view.byteOffset||0)+view.byteLength),hash=sha(bytes),uri='images/'+hash+'.png';assert.equal(image.mimeType,'image/png');images.set(uri,{bytes,sha256:hash});removed.add(image.bufferView);delete image.bufferView;image.uri=uri;}
 json.bufferViews.forEach((view,index)=>{if(removed.has(index))return;assert.equal(view.buffer??0,0);assert.equal(view.extensions,undefined);const bytes=original.binary.subarray(view.byteOffset||0,(view.byteOffset||0)+view.byteLength),pad=Math.ceil(bytes.length/4)*4;remap.set(index,views.length);views.push({...view,byteOffset:offset});const chunk=Buffer.alloc(pad);bytes.copy(chunk);chunks.push(chunk);offset+=pad;});
 const visit=value=>{if(!value||typeof value!=='object')return;for(const [key,item]of Object.entries(value)){if(key==='bufferView'){assert.ok(remap.has(item),'No remaining geometry may reference a removed image view');value[key]=remap.get(item);}else visit(item);}};
 visit(json.accessors);json.bufferViews=views;json.buffers[0].byteLength=offset;
 const raw=encode(json,Buffer.concat(chunks)),parsed=parse(raw);
 // Compare every non-image source buffer view byte-for-byte and every accessor
 // declaration after reversing only its index relocation. No mesh resampling.
 for(const [before,after]of remap){const a=original.json.bufferViews[before],b=parsed.json.bufferViews[after];assert.deepEqual(parsed.binary.subarray(b.byteOffset,b.byteOffset+b.byteLength),original.binary.subarray(a.byteOffset||0,(a.byteOffset||0)+a.byteLength));}
 const restored=structuredClone(parsed.json.accessors),reverse=new Map([...remap].map(([a,b])=>[b,a]));const undo=value=>{if(!value||typeof value!=='object')return;for(const[k,v]of Object.entries(value))if(k==='bufferView')value[k]=reverse.get(v);else undo(v);};undo(restored);assert.deepEqual(restored,original.json.accessors);
 for(const key of ['meshes','nodes','scenes','materials','textures','samplers'])assert.deepEqual(parsed.json[key],original.json[key],key);
 const gzip=gzipSync(raw,{level:9}),file=lod+'.glb';writeFileSync(new URL(file,out),raw);writeFileSync(new URL(file+'.gz',out),gzip);
 manifest.lods[lod]={url:'assets/v2/spruce/shared-v38/'+file+'.gz',base:'assets/v2/spruce/shared-v38/',rawBytes:raw.length,gzipBytes:gzip.length,sha256:sha(raw),gzipSha256:sha(gzip),source:'assets/v2/'+name,sourceSha256:sha(source),sourceGzipBytes:transport.assets['assets/v2/'+name].gzipBytes,imageURIs:json.images.map(image=>image.uri),accessors:json.accessors.length,views:json.bufferViews.length};
}
for(const [uri,image]of images){writeFileSync(new URL(uri,out),image.bytes);manifest.images.push({uri,url:'assets/v2/spruce/shared-v38/'+uri,bytes:image.bytes.length,sha256:image.sha256});}
const previousBytes=Object.values(manifest.lods).reduce((n,l)=>n+l.sourceGzipBytes,0),replacementBytes=Object.values(manifest.lods).reduce((n,l)=>n+l.gzipBytes,0)+manifest.images.reduce((n,i)=>n+i.bytes,0);manifest.bytes={previousBytes,replacementBytes,savedBytes:previousBytes-replacementBytes,savedPercent:100*(1-replacementBytes/previousBytes)};
writeFileSync(new URL('manifest.json',out),JSON.stringify(manifest));writeFileSync(new URL('reports/spruce-shared-images-v38.json',import.meta.url),JSON.stringify(manifest,null,2));console.log(JSON.stringify({images:manifest.images.map(i=>({bytes:i.bytes,sha256:i.sha256})),lods:manifest.lods,bytes:manifest.bytes,geometryAndMaterialSourceEqual:true}));
