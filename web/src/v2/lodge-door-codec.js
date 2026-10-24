// Lossless transport of already baked Float16 bits. No resampling or new bake.
const enc=new TextEncoder(),dec=new TextDecoder(),magic=Uint8Array.of(75,74,68,71,51,56,0,1);
export const lodgeBytes=s=>{const text=atob(s),out=new Uint8Array(text.length);for(let i=0;i<out.length;i++)out[i]=text.charCodeAt(i);return out;};
const base64=b=>{let s='';for(let i=0;i<b.length;i+=8192)s+=String.fromCharCode(...b.subarray(i,i+8192));return btoa(s);};
export async function lodgeSHA(bytes){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(x=>x.toString(16).padStart(2,'0')).join('');}
// Preserve JSON.stringify byte order exactly, but never serialize the complete
// multi-megabyte solar table in one synchronous call. Payload strings are the
// already bounded individual baked fields/directions; numbers retain native JSON.
function* jsonPieces(value){
 if(value===null||typeof value!=='object'){yield JSON.stringify(value);return;}
 if(Array.isArray(value)){yield '[';for(let i=0;i<value.length;i++){if(i)yield ',';yield* jsonPieces(value[i]===undefined?null:value[i]);}yield ']';return;}
 yield '{';let first=true;for(const key of Object.keys(value)){if(value[key]===undefined)continue;if(!first)yield ',';first=false;yield JSON.stringify(key)+':';yield* jsonPieces(value[key]);}yield '}';
}
export async function lodgeObjectSHA(o,{checkpoint=()=>null}={}){
 const pieces=[];let pending='',length=0;
 const flush=()=>{if(!pending)return;const b=enc.encode(pending);pieces.push(b);length+=b.length;pending='';};
 for(const piece of jsonPieces(o)){pending+=piece;if(pending.length>=32768){flush();const pause=checkpoint();if(pause)await pause;}}
 flush();const bytes=new Uint8Array(length);let at=0;for(const b of pieces){bytes.set(b,at);at+=b.length;const pause=checkpoint();if(pause)await pause;}
 const pause=checkpoint();if(pause)await pause;return lodgeSHA(bytes);
}
function expand(s,count){
 const b=lodgeBytes(s),d=new DataView(b.buffer,b.byteOffset,b.byteLength),out=new Uint8Array(count*2);let r=0,w=0;
 while(r<b.length){if(r+2>b.length)throw Error('Truncated lodge solar run');const h=d.getUint16(r,true),n=h&32767;r+=2;if(!n||w+n>count)throw Error('Invalid lodge solar run');if(h&32768){if(r+n*2>b.length)throw Error('Truncated lodge solar coefficients');out.set(b.subarray(r,r+n*2),w*2);r+=n*2;}w+=n;}
 if(w!==count)throw Error('Incomplete lodge solar coefficients');return out;
}
function compress(b){
 if(b.length%2)throw Error('Unaligned lodge solar coefficients');const v=new DataView(b.buffer,b.byteOffset,b.byteLength),n=b.length/2,out=new Uint8Array(b.length*2),d=new DataView(out.buffer);let i=0,w=0;
 while(i<n){const zero=v.getUint16(i*2,true)===0;let j=i+1;while(j<n&&(v.getUint16(j*2,true)===0)===zero&&j-i<32767)j++;d.setUint16(w,(j-i)|(zero?0:32768),true);w+=2;if(!zero){out.set(b.subarray(i*2,j*2),w);w+=(j-i)*2;}i=j;}
 return base64(out.subarray(0,w));
}
function originalBytes(base,name,field,index){const f=base[name];if(!f)throw Error('Unknown lodge delta base field');return index===null?lodgeBytes(f.data):expand(f.directions[index],field.size.reduce((a,b)=>a*b,1)*12);}
export async function encodeLodgeDoorPackage(states,bases,{reuseIdentical=false}={}){
 const parts=[],out=structuredClone(states);let offset=0;
 for(const state of out)for(const group of ['local','cross'])for(const[name,f]of Object.entries(state[group])){
  if(f.reusePayload)continue;
  const delta=(value,index)=>{if(reuseIdentical&&value===(index===null?bases[group][name].data:bases[group][name].directions[index]))return {base:true};const original=originalBytes(bases[group],name,f,index),bytes=index===null?lodgeBytes(value):expand(value,f.size.reduce((a,b)=>a*b,1)*12);if(bytes.length!==original.length)throw Error('Lodge delta base dimensions differ');const xor=Uint8Array.from(bytes,(v,i)=>v^original[i]),ref={offset,bytes:xor.length};offset+=xor.length;parts.push(xor);return ref;};
  if(f.directions)f.directions=f.directions.map((s,i)=>delta(s,i));else f.data=delta(f.data,null);
 }
 const header={version:1,baseHashes:{local:await lodgeObjectSHA(bases.local),cross:await lodgeObjectSHA(bases.cross)},stateHashes:await Promise.all(states.map(lodgeObjectSHA)),states:out};
 const json=enc.encode(JSON.stringify(header)),bytes=new Uint8Array(12+json.length+offset);bytes.set(magic);new DataView(bytes.buffer).setUint32(8,json.length,true);bytes.set(json,12);let at=12+json.length;for(const part of parts){bytes.set(part,at);at+=part.length;}return bytes;
}
export async function decodeLodgeDoorPackage(bytes,bases,{checkpoint=()=>null}={}){
 if(bytes.length<12||magic.some((x,i)=>bytes[i]!==x))throw Error('Invalid lodge delta magic');const n=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength).getUint32(8,true);if(n>bytes.length-12||n>2000000)throw Error('Invalid lodge delta header');
 const header=JSON.parse(dec.decode(bytes.subarray(12,12+n)));if(header.version!==1||header.states?.length!==3||header.stateHashes?.length!==3)throw Error('Invalid lodge delta version/states');
 const parsed=checkpoint();if(parsed)await parsed;
 for(const group of ['local','cross'])if(await lodgeObjectSHA(bases[group],{checkpoint})!==header.baseHashes[group])throw Error('Lodge delta original base checksum mismatch: '+group);
 const start=12+n,originals=new Map();let consumed=0;
 for(const state of header.states)for(const group of ['local','cross'])for(const[name,f]of Object.entries(state[group])){
  if(f.reusePayload)continue;
  const restore=(ref,index)=>{if(ref?.base===true){if(Object.keys(ref).length!==1)throw Error('Invalid lodge base reference');const f=bases[group][name],value=index===null?f?.data:f?.directions?.[index];if(typeof value!=='string')throw Error('Missing lodge base reference');return value;}const id=group+'/'+name+'/'+index;let original=originals.get(id);if(!original){original=originalBytes(bases[group],name,f,index);originals.set(id,original);}if(!Number.isInteger(ref.offset)||ref.offset!==consumed||ref.bytes!==original.length||start+ref.offset+ref.bytes>bytes.length)throw Error('Invalid lodge delta field range');const result=new Uint8Array(original.length),at=start+ref.offset;for(let i=0;i<result.length;i++)result[i]=original[i]^bytes[at+i];consumed+=ref.bytes;return index===null?base64(result):compress(result);};
  if(f.directions){for(let i=0;i<f.directions.length;i++){f.directions[i]=restore(f.directions[i],i);const pause=checkpoint();if(pause)await pause;}}else{f.data=restore(f.data,null);const pause=checkpoint();if(pause)await pause;}
 }
 if(consumed!==bytes.length-start)throw Error('Trailing lodge delta coefficients');
 for(let i=0;i<3;i++)if(await lodgeObjectSHA(header.states[i],{checkpoint})!==header.stateHashes[i])throw Error('Restored lodge state checksum mismatch: '+i);
 return header.states;
}
