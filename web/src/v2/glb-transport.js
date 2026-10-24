import manifest from "../../public/assets/v2/glb-transport-manifest.json" with {type:"json"};
import {decodeGzipBytes} from "./world-data.js";

// GLTFLoader needs the exact ArrayBuffer range. Network/decompression outputs
// already own that range; avoid a second full-asset copy. Subviews still copy
// to exclude unrelated prefix/suffix bytes. This does not mutate source bytes.
export function exactGLBBuffer(bytes,copy=false){
 return !copy&&bytes.byteOffset===0&&bytes.byteLength===bytes.buffer.byteLength
  ? bytes.buffer : bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength);
}

// Only registered local assets opt into lossless transport; custom asset bases
// and the raw diagnostic route retain the normal GLTFLoader path.
export async function loadWorldGLB(url,loader,{fetchImpl=globalThis.fetch,compressed=new URLSearchParams(globalThis.location?.search||"").get("assetTransport")!=="raw"}={}) {
 const timing={startMs:performance.now(),endMs:null,phases:{}};
 const step=async(name,run)=>{const item=timing.phases[name]={startMs:performance.now(),endMs:null};try{return await run();}finally{item.endMs=performance.now();item.elapsedMs=item.endMs-item.startMs;}};
 const key=url.replace(/^\.\//,""),entry=manifest.assets[key];
 if(!compressed||!entry){const gltf=await step("loadAsync",()=>loader.loadAsync(url));timing.endMs=performance.now();if(gltf&&typeof gltf==="object")gltf.userData={...gltf.userData,assetTransport:{encoding:"raw",timing}};return gltf;}
 const transportURL=(url.startsWith("./")?"./":"")+entry.url+"?v="+entry.gzipSha256;
 const response=await step("fetch",()=>fetchImpl(transportURL));
 if(!response.ok)throw new Error("World asset request failed: "+response.status+" "+transportURL);
 const transport=new Uint8Array(await step("body",()=>response.arrayBuffer()));
 const bytes=await step("decode",()=>decodeGzipBytes(transport)),view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
 if(bytes.byteLength!==entry.rawBytes||bytes.byteLength<20||view.getUint32(0,true)!==0x46546c67||view.getUint32(4,true)!==2||view.getUint32(8,true)!==bytes.byteLength)throw new Error("Invalid world GLB transport: "+url);
 const buffer=exactGLBBuffer(bytes,new URLSearchParams(globalThis.location?.search||"").get("glbCopy")==="1");
 const gltf=await step("parse",()=>loader.parseAsync(buffer,url.slice(0,url.lastIndexOf("/")+1)));
 timing.endMs=performance.now();
 gltf.userData={...gltf.userData,assetTransport:{encoding:"gzip",timing,responseBytes:transport.byteLength,rawBytes:bytes.byteLength,parseBufferCopiedBytes:buffer===bytes.buffer?0:bytes.byteLength}};
 return gltf;
}
