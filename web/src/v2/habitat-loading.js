import manifest from '../../public/data/v2/habitat-transport-manifest.json' with {type:'json'};
import {decodeGzipBytes} from './world-data.js';
import {decodeHabitatMap} from './habitat-data.js';

// The full authored atlas remains available for diagnostics. The default payload
// already contains exactly the same four V2 channels, at the original grid size.
// No asynchronous metadata dependency, pixel folding, or second data copy.
export async function loadHabitatMap(name,{fetchImpl=globalThis.fetch,signal,mode=new URLSearchParams(globalThis.location?.search||'').get('habitatTransport')==='raw'?'raw':'derived'}={}){
 const entry=manifest.maps[name];
 if(!entry)throw new Error('Unknown habitat map '+name);
 const started=performance.now();
 if(mode==='raw'){
  const [mr,br]=await Promise.all([fetchImpl('./data/'+name+'.json',{signal}),fetchImpl('./data/'+name+'.bin.gz',{signal})]);
  if(!mr.ok||!br.ok)throw new Error('Cannot load habitat map '+name);
  const meta=await mr.json(),transport=new Uint8Array(await br.arrayBuffer()),bytes=await decodeGzipBytes(transport),map=decodeHabitatMap(meta,bytes);
  map.transport={mode:'raw',responseBytes:transport.byteLength,decodedBytes:bytes.byteLength,dataBytes:map.data.byteLength,elapsedMs:performance.now()-started};return map;
 }
 if(mode!=='derived')throw new Error('Unknown habitat transport '+mode);
 const response=await fetchImpl('./'+entry.url+'?v='+entry.sha256,{signal});
 if(!response.ok)throw new Error('Cannot load derived habitat map '+name+': '+response.status);
 const transport=new Uint8Array(await response.arrayBuffer()),data=await decodeGzipBytes(transport);
 if(manifest.revision!=='v2-habitat-exact-v1'||entry.n!==Math.round(entry.meta.size/entry.meta.res)||entry.rawBytes!==entry.n*entry.n*4||data.byteLength!==entry.rawBytes)throw new Error('Derived habitat raster size or version mismatch: '+name);
 if(signal?.aborted)throw signal.reason??new DOMException('Habitat loading aborted','AbortError');
 return {meta:structuredClone(entry.meta),n:entry.n,data,transport:{mode:'derived',revision:manifest.revision,responseBytes:transport.byteLength,decodedBytes:data.byteLength,dataBytes:data.byteLength,elapsedMs:performance.now()-started}};
}
