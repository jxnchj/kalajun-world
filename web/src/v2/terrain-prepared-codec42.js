const TYPES={Float32Array,Float64Array,Uint16Array};
export async function terrainPreparedHash42(data){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',data)),v=>v.toString(16).padStart(2,'0')).join('');}
export async function decodeTerrainPreparedBlock42(block,entry,schema){
 if(await terrainPreparedHash42(block)!==entry.sha256)throw Error('compressed SHA mismatch');
 const raw=new Uint8Array(await new Response(new Blob([block]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer());if(raw.length!==entry.rawLength)throw Error('raw length mismatch');
 const payload={row:33,min:entry.min,max:entry.max};let offset=0;
 for(const f of schema){const C=TYPES[f.type],a=new C(f.length),out=new Uint8Array(a.buffer),stride=a.BYTES_PER_ELEMENT;for(let b=0;b<stride;b++)for(let i=0;i<a.length;i++)out[i*stride+b]=raw[offset+b*a.length+i];payload[f.name]=a;offset+=f.bytes;}
 if(offset!==raw.length)throw Error('schema byte length mismatch');return payload;
}
export async function preparedCodecTask42(task){
 if(task.type==='parent'){if(await terrainPreparedHash42(task.bytes)!==task.hash)throw Error('parent hash mismatch');return true;}
 if(task.type!=='shard')throw Error('Unknown codec task');
 if(task.bytes.byteLength!==task.shard.bytes)throw Error('shard byte length mismatch');
 const rows=[];for(const e of task.shard.rows){const block=task.bytes.subarray(e.offset,e.offset+e.length);rows.push({key:e.key,payload:await decodeTerrainPreparedBlock42(block,e,task.schema)});}return rows;
}
export async function fetchPreparedShard42(task,{fetcher=globalThis.fetch,signal,origin=globalThis.location?.origin}={}){
 const start=performance.now();let downloadedBytes=0,reader;
 try{
  const manifest=new URL(task.manifestURL),url=new URL(task.shard.url,manifest);
  if(!origin||manifest.origin!==origin||url.origin!==origin||!/^https?:$/.test(url.protocol)||!(/^[a-z0-9-]+\.pack$/.test(task.shard.url))||url.username||url.password)throw Error('Prepared shard must be same-origin manifest sibling');
  const response=await fetcher(url.href,{signal,redirect:'error',credentials:'same-origin'});if(!response.ok||!response.body)throw Error('shard HTTP '+response.status);
  if(response.url&&new URL(response.url).origin!==origin)throw Error('Cross-origin shard response');
  if(!Number.isInteger(task.shard.bytes)||task.shard.bytes<1||task.shard.bytes>1024*1024)throw Error('Invalid shard size');
  reader=response.body.getReader();const bytes=new Uint8Array(task.shard.bytes);let offset=0;
  while(true){signal?.throwIfAborted();const next=await reader.read();if(next.done)break;downloadedBytes+=next.value.byteLength;if(offset+next.value.byteLength>bytes.length)throw Error('oversized shard');bytes.set(next.value,offset);offset+=next.value.byteLength;}
  if(offset!==bytes.length)throw Error('truncated shard');signal?.throwIfAborted();
  const fetched=performance.now(),rows=await preparedCodecTask42({...task,type:'shard',bytes});signal?.throwIfAborted();return{rows,downloadedBytes,timings:{fetchMs:fetched-start,codecMs:performance.now()-fetched}};
 }catch(error){error.downloadedBytes=downloadedBytes;throw error;}finally{await reader?.cancel().catch(()=>{});}
}
