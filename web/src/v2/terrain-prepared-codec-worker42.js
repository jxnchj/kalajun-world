import {preparedCodecTask42,fetchPreparedShard42}from './terrain-prepared-codec42.js';
const active=new Map();
self.onmessage=async({data})=>{
 if(data.type==='cancel'){active.get(data.id)?.abort(Error('Codec task cancelled'));return;}
 const controller=new AbortController(),timeout=Math.min(15000,Math.max(1,data.task.timeoutMs??15000)),timer=setTimeout(()=>controller.abort(Error('Codec task timeout')),timeout);active.set(data.id,controller);
 try{const start=performance.now(),value=data.task.type==='fetchShard'?await fetchPreparedShard42(data.task,{signal:controller.signal,origin:self.location?.origin}):await preparedCodecTask42(data.task),transfers=[];controller.signal.throwIfAborted();const rows=Array.isArray(value)?value:value?.rows;if(rows)for(const row of rows)for(const a of Object.values(row.payload))if(ArrayBuffer.isView(a))transfers.push(a.buffer);self.postMessage({id:data.id,value,downloadedBytes:value?.downloadedBytes??0,workerMs:performance.now()-start},transfers);}catch(error){self.postMessage({id:data.id,error:String(error),downloadedBytes:error.downloadedBytes??0});}finally{clearTimeout(timer);active.delete(data.id);}
};
