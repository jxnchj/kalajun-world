import manifest from './lodge-door-package.json' with {type:'json'};
import {decodeLodgeDoorPackage,lodgeSHA} from './lodge-door-codec.js';
import {createPreparationYield,yieldWorldPreparation} from './preparation-yield.js';
export async function loadLodgeDoorPackage(bases,{fetchImpl=(...args)=>globalThis.fetch(...args),fallbackLoaders=[],stats={},binding=manifest}={}){
 const start=performance.now();Object.assign(stats,{status:'pending',compressedBytes:binding.gzipBytes,rawBytes:binding.rawBytes});
 try{
  const response=await fetchImpl('./'+binding.url+'?v='+binding.sha256);if(!response.ok)throw Error('Lodge delta HTTP '+response.status);
  const input=new Uint8Array(await response.arrayBuffer()),gzip=input[0]===31&&input[1]===139;
  if(input.length!==(gzip?binding.gzipBytes:binding.rawBytes)||await lodgeSHA(input)!==(gzip?binding.sha256:binding.rawSHA256))throw Error('Lodge delta transport checksum mismatch');
  const raw=gzip?new Uint8Array(await new Response(new Blob([input]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer()):input;
  if(raw.length!==binding.rawBytes||await lodgeSHA(raw)!==binding.rawSHA256)throw Error('Lodge delta raw checksum mismatch');
  const scheduler=createPreparationYield({budgetMs:8,yieldTask:()=>yieldWorldPreparation()}),decodeStart=performance.now();
  const states=await decodeLodgeDoorPackage(raw,bases,{checkpoint:()=>scheduler.checkpoint()});
  Object.assign(stats,{status:'delta',responseBytes:input.length,delivery:gzip?'gzip-body':'http-decoded-body',decodeMs:performance.now()-decodeStart,elapsedMs:performance.now()-start,scheduler:scheduler.stats});return states;
 }catch(error){
  // Full modules are fetched only after a concrete delivery/validation failure.
  // They remain the independently baked source, not a silently different field.
  Object.assign(stats,{status:'fallback',reason:String(error?.message??error)});
  if(fallbackLoaders.length!==3)throw error;
  const states=await Promise.all(fallbackLoaders.map(load=>load().then(m=>m.default??m)));stats.elapsedMs=performance.now()-start;return states;
 }
}
