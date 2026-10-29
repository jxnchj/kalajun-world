// Run once for eager and once for lazy only AFTER loading capture finished.
// Does not access asset.envelope, bind/sample contact or change any geometry.
async function hashReachLazy46({name}){
 const d=window.kalajunV2.debug,c=d.ecology.reachBankCover39;
 if(!c.stats.built||c.stats.pending||d.terrain.stats.queuedTiles||d.terrain.stats.morphingGroups)throw Error('Wait for complete settled actual roots');
 // Copy synchronously, then restore normal interaction before hashing or POST.
 // A pending promise or a caller waiting for evidence must not freeze the page.
 const captured=[],previousHold=d.setReviewHold(true);
 try{
  const captureAttribute=a=>({array:a.array.slice(),itemSize:a.itemSize,normalized:a.normalized,count:a.count});
  for(const p of c.pools){
   const row={kind:p.kind,attributes:{},index:captureAttribute(p.geometry.index),roots:p.records.length,metadata:[]};
   for(const key of Object.keys(p.geometry.attributes).sort())row.attributes[key]=captureAttribute(p.geometry.attributes[key]);
   for(const root of p.records){
    const primitive={};for(const [key,value]of Object.entries(root))if(value===null||['string','number','boolean'].includes(typeof value))primitive[key]=value;
    row.metadata.push({root:primitive,seats:structuredClone(root.coverAsset.seats),preparedContact42:structuredClone(root.coverAsset.preparedContact42??null),waterBroadPhaseFalsePositive:root.coverAsset.waterBroadPhaseFalsePositive,contactInput:root.contactCache42?.input.slice()??null,contactOutput:root.contactCache42?.output.slice()??null});
   }
   captured.push(row);
  }
 }finally{d.setReviewHold(previousHold);}
 const sha=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');
 const encoder=new TextEncoder();
 const canonical=v=>v===null?'null':typeof v==='number'?(Object.is(v,-0)?'-0':String(v)):typeof v==='string'||typeof v==='boolean'?JSON.stringify(v):ArrayBuffer.isView(v)?'['+Array.from(v,canonical).join(',')+']':Array.isArray(v)?'['+v.map(canonical).join(',')+']':'{'+Object.keys(v).sort().filter(k=>v[k]!==undefined).map(k=>JSON.stringify(k)+':'+canonical(v[k])).join(',')+'}';
 const array=async a=>({type:a.array.constructor.name,itemSize:a.itemSize,normalized:a.normalized,count:a.count,bytes:a.array.byteLength,sha256:await sha(new Uint8Array(a.array.buffer,a.array.byteOffset,a.array.byteLength))});
 const result={name,roots:0,pools:[],sourceCache:{},errors:window.kalajunV2.getSnapshot().errors,scope:'Every combined pool attribute/index byte, every root primitive and complete seat/prepared-contact metadata; no lazy envelope read'};
 for(const p of captured){
  const row={kind:p.kind,attributes:{},index:await array(p.index),roots:p.roots,metadata:p.metadata};
  for(const key of Object.keys(p.attributes))row.attributes[key]=await array(p.attributes[key]);
  for(const metadata of row.metadata){
   for(const key of ['contactInput','contactOutput']){const value=metadata[key];metadata[key]=value?await sha(new Uint8Array(value.buffer,value.byteOffset,value.byteLength)):null;}
  }
  row.metadataSHA=await sha(encoder.encode(canonical(row.metadata)));result.roots+=row.roots;result.pools.push(row);
 }
 const response=await fetch('./data/v2/reach-cover-prepared42.json');if(!response.ok)throw Error('Manifest HTTP '+response.status);const manifest=await response.json(),code=await c.prepared42.loadCode();
 result.sourceCache={manifestSHA:manifest.sha256,rawSHA:manifest.rawSHA256,codeSignature:code.signature,manifestCodeSignature:manifest.code.signature,manifestInputs:manifest.inputs,actualInputs:await d.ecology.world.getForestRootInputHashes(),prepared:structuredClone(c.prepared42.stats)};
 result.envelopeLazy46=structuredClone(c.stats.envelopeLazy46??null);
 const saved=await fetch('/__review38/evidence',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name,snapshot:result})});if(!saved.ok)throw Error('Hash evidence HTTP '+saved.status+': '+await saved.text());
 return{saved:true,name,roots:result.roots,pools:result.pools.map(p=>({kind:p.kind,roots:p.roots,metadataSHA:p.metadataSHA,attributes:p.attributes,index:p.index})),sourceSHA:manifest.sha256,envelopeLazy46:result.envelopeLazy46};
}
