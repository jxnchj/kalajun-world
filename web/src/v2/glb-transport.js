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
 const key=url.replace(/^\.\//,""),entry=manifest.assets[key];
 if(!compressed||!entry)return loader.loadAsync(url);
 const transportURL=(url.startsWith("./")?"./":"")+entry.url+"?v="+entry.gzipSha256;
 const response=await fetchImpl(transportURL);
 if(!response.ok)throw new Error("World asset request failed: "+response.status+" "+transportURL);
 const transport=new Uint8Array(await response.arrayBuffer());
 const bytes=await decodeGzipBytes(transport),view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
 if(bytes.byteLength!==entry.rawBytes||bytes.byteLength<20||view.getUint32(0,true)!==0x46546c67||view.getUint32(4,true)!==2||view.getUint32(8,true)!==bytes.byteLength)throw new Error("Invalid world GLB transport: "+url);
 const buffer=exactGLBBuffer(bytes,new URLSearchParams(globalThis.location?.search||"").get("glbCopy")==="1");
 const gltf=await loader.parseAsync(buffer,url.slice(0,url.lastIndexOf("/")+1));
 gltf.userData={...gltf.userData,assetTransport:{encoding:"gzip",responseBytes:transport.byteLength,rawBytes:bytes.byteLength,parseBufferCopiedBytes:buffer===bytes.buffer?0:bytes.byteLength}};
 return gltf;
}
